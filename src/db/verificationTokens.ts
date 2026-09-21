/**
 * Email-verification token store.
 *
 * Security model: the raw token is a 32-byte random URL-safe string that is sent
 * ONLY in the verification email. We persist only its SHA-256 hash, so a database
 * read cannot be used to verify anyone's email. Tokens are single-use and expire.
 */
import crypto from "crypto";
import { query } from "./pool";
import { putItem, queryIndex, TOKEN_USER_INDEX, updateItem } from "./dynamo";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

async function issueDynamo(userId: string): Promise<string> {
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expiry = new Date(now.getTime() + TOKEN_TTL_MS);
  const prior = await queryIndex<{ PK: string; SK: string }>(TOKEN_USER_INDEX, `USER#${userId}`, "TokenUserPK", "TokenUserSK");
  await Promise.all(prior.map((item) => updateItem({ PK: item.PK, SK: item.SK }, "SET used_at = :now", { ":now": now.toISOString() })));
  await putItem({
    PK: `TOKEN#${tokenHash}`, SK: "TOKEN", TokenUserPK: `USER#${userId}`,
    TokenUserSK: `${now.toISOString()}#${tokenHash}`, user_id: userId, token_hash: tokenHash,
    expires_at: expiry.toISOString(), expiresAt: Math.floor(expiry.getTime() / 1000), used_at: null,
  }, "attribute_not_exists(PK)");
  return rawToken;
}

async function consumeDynamo(rawToken: string): Promise<string | null> {
  const tokenHash = hashToken(rawToken);
  try {
    const result = await updateItem({ PK: `TOKEN#${tokenHash}`, SK: "TOKEN" }, "SET used_at = :now", {
      ":now": new Date().toISOString(), ":epoch": Math.floor(Date.now() / 1000), ":null": null,
    }, undefined, "attribute_exists(PK) AND (attribute_not_exists(used_at) OR used_at = :null) AND expiresAt > :epoch", "ALL_NEW");
    return (result.Attributes?.user_id as string | undefined) ?? null;
  } catch (error: any) {
    if (error?.name === "ConditionalCheckFailedException") return null;
    throw error;
  }
}

/**
 * Issue a new verification token for a user. Returns the RAW token (to email).
 * Invalidates any prior unused tokens for that user first.
 */
export async function issueToken(userId: string): Promise<string> {
  if (process.env.DATA_BACKEND === "dynamodb" || process.env.DDB_TABLE) return issueDynamo(userId);
  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await query(
    `UPDATE email_verification_tokens
        SET used_at = now()
      WHERE user_id = $1 AND used_at IS NULL`,
    [userId]
  );
  await query(
    `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );
  return rawToken;
}

/**
 * Atomically consume a token. Returns the user_id if the token was valid,
 * unused, and unexpired; otherwise null. The UPDATE..RETURNING makes redemption
 * race-free (a second concurrent request gets no row).
 */
export async function consumeToken(rawToken: string): Promise<string | null> {
  if (process.env.DATA_BACKEND === "dynamodb" || process.env.DDB_TABLE) return consumeDynamo(rawToken);
  const tokenHash = hashToken(rawToken);
  const { rows } = await query<{ user_id: string }>(
    `UPDATE email_verification_tokens
        SET used_at = now()
      WHERE token_hash = $1
        AND used_at IS NULL
        AND expires_at > now()
      RETURNING user_id`,
    [tokenHash]
  );
  return rows[0]?.user_id ?? null;
}
