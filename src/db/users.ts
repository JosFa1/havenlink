/**
 * User repository: all SQL touching the `users` table lives here so the linking
 * logic in auth/ stays declarative. Emails are stored as citext (case-insensitive
 * unique), so callers don't need to lowercase.
 */
import { query } from "./pool";

export interface User {
  id: string;
  email: string;
  email_verified: boolean;
  password_hash: string | null;
  google_sub: string | null;
  newsletter_prompt_pending: boolean;
  newsletter_subscribed: boolean;
  created_at: Date;
  updated_at: Date;
}

export async function findById(id: string): Promise<User | null> {
  const { rows } = await query<User>(`SELECT * FROM users WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function findByEmail(email: string): Promise<User | null> {
  const { rows } = await query<User>(`SELECT * FROM users WHERE email = $1`, [email]);
  return rows[0] ?? null;
}

export async function findByGoogleSub(googleSub: string): Promise<User | null> {
  const { rows } = await query<User>(`SELECT * FROM users WHERE google_sub = $1`, [
    googleSub,
  ]);
  return rows[0] ?? null;
}

export async function createPasswordUser(
  email: string,
  passwordHash: string
): Promise<User> {
  const { rows } = await query<User>(
    `INSERT INTO users (email, password_hash, email_verified, newsletter_prompt_pending)
     VALUES ($1, $2, false, true)
     RETURNING *`,
    [email, passwordHash]
  );
  return rows[0];
}

/** Create a passwordless account from a verified Google identity. */
export async function createGoogleUser(
  email: string,
  googleSub: string
): Promise<User> {
  const { rows } = await query<User>(
    `INSERT INTO users (email, google_sub, email_verified, password_hash, newsletter_prompt_pending)
     VALUES ($1, $2, true, NULL, true)
     RETURNING *`,
    [email, googleSub]
  );
  return rows[0];
}

/** Link a Google identity onto an existing account and mark email verified. */
export async function linkGoogleSub(
  userId: string,
  googleSub: string
): Promise<User> {
  const { rows } = await query<User>(
    `UPDATE users
        SET google_sub = $2, email_verified = true, updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [userId, googleSub]
  );
  return rows[0];
}

export async function markEmailVerified(userId: string): Promise<void> {
  await query(
    `UPDATE users SET email_verified = true, updated_at = now() WHERE id = $1`,
    [userId]
  );
}

/**
 * Record the user's response to the one-time newsletter prompt. Always clears
 * the pending flag (so it never shows again); when they accept, marks them
 * subscribed. `OR $2` means declining never wipes a prior opt-in.
 */
export async function resolveNewsletterPrompt(
  userId: string,
  subscribe: boolean
): Promise<void> {
  await query(
    `UPDATE users
        SET newsletter_prompt_pending = false,
            newsletter_subscribed = newsletter_subscribed OR $2,
            updated_at = now()
      WHERE id = $1`,
    [userId, subscribe]
  );
}
