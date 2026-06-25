/**
 * Password hashing (argon2id) and policy.
 *
 * argon2id is the current OWASP-recommended algorithm. We use generous-but-sane
 * cost parameters; tune `memoryCost`/`timeCost` to your host. Verification is
 * constant-time within argon2; we never compare hashes manually.
 */
import argon2 from "argon2";
import { z } from "zod";

const ARGON2_OPTS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456, // ~19 MiB
  timeCost: 2,
  parallelism: 1,
};

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTS);
}

export async function verifyPassword(
  hash: string,
  plain: string
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // Malformed hash etc. — treat as a failed verification, never throw to caller.
    return false;
  }
}

/**
 * Password policy. Length is the dominant factor (per NIST 800-63B), so we
 * require >= 12 chars and a cap to bound argon2 cost. We deliberately avoid
 * arbitrary composition rules; consider adding a breached-password check (HIBP
 * k-anonymity) as a follow-up.
 */
export const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(200, "Password is too long");

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254);
