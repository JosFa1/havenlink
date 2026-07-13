/**
 * User repository: all SQL touching the `users` table lives here so the linking
 * logic in auth/ stays declarative. Emails are stored as citext (case-insensitive
 * unique), so callers don't need to lowercase.
 */
import { query } from "./pool";

export type HomeStudyPath = "completed" | "screener";
export type HomeStudyResult = "PASSED" | "NOT_YET_ELIGIBLE" | "INTERNATIONAL";

export interface User {
  id: string;
  email: string;
  email_verified: boolean;
  password_hash: string | null;
  google_sub: string | null;
  newsletter_prompt_pending: boolean;
  newsletter_subscribed: boolean;
  // Adoption-application state, captured on intake / home-study submission.
  state: string | null;
  intake_completed: boolean;
  intake_completed_at: Date | null;
  home_study_path: HomeStudyPath | null;
  home_study_result: HomeStudyResult | null;
  home_study_completed_at: Date | null;
  // Confirmed agency match (see src/match/). `matched_agency_id` points into
  // the hardcoded dataset in src/match/agencies.ts; NULL means not matched.
  matched_agency_id: string | null;
  match_score: number | null;
  matched_at: Date | null;
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

/**
 * Mark the intake form as completed for this account. `state` is the canonical
 * residence/home state (2-letter code) or null; COALESCE means a submission that
 * arrives without a valid state never wipes a previously saved one.
 */
export async function recordIntakeCompletion(
  userId: string,
  state: string | null
): Promise<void> {
  await query(
    `UPDATE users
        SET intake_completed = true,
            intake_completed_at = now(),
            state = COALESCE($2, state),
            updated_at = now()
      WHERE id = $1`,
    [userId, state]
  );
}

/**
 * Record which home-study flow the account completed. `path` distinguishes the
 * "already have a completed home study" flow from the readiness "screener";
 * `result` holds the screener outcome (null for the completed path). `state` is
 * COALESCEd like the intake writer so a missing value never clears a saved one.
 */
/**
 * Record the confirmed agency match exactly once. The `matched_agency_id IS
 * NULL` guard makes the write atomic: a second confirm (double-click, second
 * tab) updates zero rows and returns null instead of overwriting the match.
 */
export async function recordMatch(
  userId: string,
  agencyId: string,
  score: number
): Promise<User | null> {
  const { rows } = await query<User>(
    `UPDATE users
        SET matched_agency_id = $2,
            match_score = $3,
            matched_at = now(),
            updated_at = now()
      WHERE id = $1 AND matched_agency_id IS NULL
      RETURNING *`,
    [userId, agencyId, score]
  );
  return rows[0] ?? null;
}

export async function recordHomeStudyCompletion(
  userId: string,
  data: {
    path: HomeStudyPath;
    result: HomeStudyResult | null;
    state: string | null;
  }
): Promise<void> {
  await query(
    `UPDATE users
        SET home_study_path = $2,
            home_study_result = $3,
            home_study_completed_at = now(),
            state = COALESCE($4, state),
            updated_at = now()
      WHERE id = $1`,
    [userId, data.path, data.result, data.state]
  );
}
