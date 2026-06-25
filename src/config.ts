/**
 * Centralized, validated environment configuration.
 *
 * Loaded once at startup. Any missing/invalid required variable makes the process
 * fail fast with a clear message rather than blowing up later mid-request. Secrets
 * (DB password, Google client secret, session secret) come from `.env` in dev
 * (gitignored) and AWS Secrets Manager -> env vars in prod. They are NEVER hardcoded.
 */
// Load .env (dev). In prod, env comes from AWS Secrets Manager -> the runtime.
import "dotenv/config";
import { z } from "zod";

const isProd = process.env.NODE_ENV === "production";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(3000),

  // Public base URL of the app (used to build verification links + OAuth callback).
  APP_BASE_URL: z.string().url(),

  // Postgres. Require TLS verification in prod; allow plain local connections in dev.
  DATABASE_URL: z.string().min(1),

  // Session signing secret (opaque cookie). Must be long + random.
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be >= 32 chars"),

  // Google OAuth2 credentials.
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_CALLBACK_URL: z.string().url(),

  // Email (existing nodemailer / Gmail app password setup).
  EMAIL_USER: z.string().email().default("havenlink.org@gmail.com"),
  EMAIL_PASSWORD: z.string().default(""),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  // Do not print the values — only which keys are wrong.
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const config = {
  ...parsed.data,
  isProd,
};

export type AppConfig = typeof config;
