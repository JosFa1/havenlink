/**
 * Email-verification token store.
 *
 * Security model: the raw token is a 32-byte random URL-safe string that is sent
 * ONLY in the verification email. We persist only its SHA-256 hash, so a database
 * read cannot be used to verify anyone's email. Tokens are single-use and expire.
 */
import crypto from "crypto";
import { query } from "./pool";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Issue a new verification token for a user. Returns the RAW token (to email).
 * Invalidates any prior unused tokens for that user first.
 */
export async function issueToken(userId: string): Promise<string> {
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
