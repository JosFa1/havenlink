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

  // Transactional email over SMTP (Amazon SES in production).
  EMAIL_FROM: z.string().min(1),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  SMTP_USER: z.string().min(1),
  SMTP_PASSWORD: z.string().min(1),

  // ---- Gemini AI chatbot ----------------------------------------------------
  // Optional: the site boots without these; the /api/chat route just reports that
  // the assistant is unconfigured until a key is provided.
  // Default provider is the free-tier Gemini Developer API (an AI Studio key).
  // Set GEMINI_USE_VERTEX=true to route through Vertex AI instead (bills against a
  // GCP project / the $300 trial credit); that path uses Application Default
  // Credentials + project/location instead of an API key.
  // An empty value in .env (GEMINI_API_KEY=) is treated the same as unset so a
  // blank placeholder never blocks startup.
  GEMINI_API_KEY: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(1).optional()
  ),
  GEMINI_MODEL: z.string().min(1).default("gemini-2.5-flash"),
  GEMINI_USE_VERTEX: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  GOOGLE_CLOUD_PROJECT: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(1).optional()
  ),
  GEMINI_LOCATION: z.string().min(1).default("us-central1"),
  // Full service-account key JSON, as a single-line string. Used for Vertex auth
  // in environments with no gcloud/ADC login (e.g. AWS App Runner). Optional: when
  // unset, Vertex falls back to Application Default Credentials (local dev).
  GEMINI_SA_KEY: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(1).optional()
  ),

  // ---- Google Maps (Post-Adoption Resource Finder) --------------------------
  // Browser Maps JavaScript API key for the resource-finder map. Optional: the app
  // boots without it and the finder reports the map as unconfigured. Served to the
  // authenticated client via GET /api/resources/maps-config (never hardcoded in HTML).
  // Public-by-design (it ships in the browser) and protected by an HTTP-referrer
  // restriction in prod, so it is a plain env var, not a Secrets Manager secret.
  GOOGLE_MAPS_API_KEY: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(1).optional()
  ),
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
