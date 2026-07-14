-- HavenLink account schema (idempotent).
-- Run via `npm run migrate` (see src/db/migrate.ts).

-- citext gives us case-insensitive, unique emails without manual lowercasing.
CREATE EXTENSION IF NOT EXISTS citext;
-- pgcrypto provides gen_random_uuid().
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           citext NOT NULL UNIQUE,
  email_verified  boolean NOT NULL DEFAULT false,
  -- NULL password_hash == OAuth-only (passwordless) account.
  password_hash   text,
  -- Google's stable subject id. Unique so one Google identity maps to one account.
  google_sub      text UNIQUE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Newsletter prompt state (added post-launch; ALTERs are idempotent so `npm run
-- migrate` is safe to re-run). `prompt_pending` is set true only when a brand-new
-- account is created, so the one-time popup shows for new signups but never for
-- accounts that predate this feature. It is cleared once the user accepts or
-- declines. `subscribed` records an accepted opt-in.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS newsletter_prompt_pending boolean NOT NULL DEFAULT false;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS newsletter_subscribed boolean NOT NULL DEFAULT false;

-- Adoption-application state (added post-launch; ALTERs are idempotent). Captured
-- when a family submits the intake and/or home-study forms. `state` is the
-- canonical residence/home state (2-letter code) and is shared/auto-filled across
-- both forms. `home_study_path` records WHICH home-study flow they completed:
-- 'completed' (already has a home study) or 'screener' (readiness check); for the
-- screener, `home_study_result` holds the outcome. All are self-reported.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS state text;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS intake_completed boolean NOT NULL DEFAULT false;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS intake_completed_at timestamptz;
-- 'completed' | 'screener'
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS home_study_path text;
-- Screener outcome (screener path only): 'PASSED' | 'NOT_YET_ELIGIBLE' | 'INTERNATIONAL'
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS home_study_result text;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS home_study_completed_at timestamptz;

-- Compatibility match (added post-launch; ALTERs are idempotent). Set exactly
-- once when the family confirms an agency match on /adopt/matching.
-- `matched_agency_id` references the hardcoded dataset in src/match/agencies.ts
-- (not a DB foreign key); NULL means not yet matched. `match_score` is the
-- audit copy of the deterministic score shown at confirmation time.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS matched_agency_id text;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS match_score integer;
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS matched_at timestamptz;

-- ===== Post-Adoption Resource Finder (Step 4) ================================
-- Added post-launch; all statements are idempotent so `npm run migrate` stays safe
-- to re-run. Data is loaded separately by `npm run seed` (src/db/seedResources.ts)
-- from committed, gzipped artifacts in src/data/ — schema here, rows there.

-- ZIP centroid lookup table (public-domain GeoNames postal codes). Turns a typed
-- ZIP into an origin lat/lng with no geocoding API. ~41k rows.
CREATE TABLE IF NOT EXISTS zip_centroids (
  zip    char(5) PRIMARY KEY,
  lat    double precision NOT NULL,
  lng    double precision NOT NULL,
  city   text,
  state  char(2)
);

-- Curated + ingested local resources (SAMHSA, HRSA, small curated set). `category`
-- is one of the six finder buckets; a facility offering several is stored as one
-- row per category. `(source, source_id)` is the natural upsert key so re-seeding
-- refreshes in place. `lat/lng` are exact where the source ships coordinates
-- (HRSA) and ZIP-centroid approximations otherwise (SAMHSA/curated).
CREATE TABLE IF NOT EXISTS resources (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source      text NOT NULL,
  source_id   text NOT NULL,
  name        text NOT NULL,
  category    text NOT NULL,
  phone       text,
  email       text,
  website     text,
  address     text,
  city        text,
  state       char(2),
  zip         char(5),
  lat         double precision NOT NULL,
  lng         double precision NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_id)
);

-- Bounding-box proximity scans filter on lat/lng then category; these back both.
CREATE INDEX IF NOT EXISTS idx_resources_lat_lng ON resources (lat, lng);
CREATE INDEX IF NOT EXISTS idx_resources_category ON resources (category);

-- Single-row marker gating the seed: the seed no-ops unless the committed
-- DATA_VERSION differs from what was last loaded, keeping every deploy boot fast.
CREATE TABLE IF NOT EXISTS resource_data_meta (
  singleton   boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  version     text NOT NULL,
  loaded_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- We store only a SHA-256 hash of the token; the raw token lives only in the email.
  token_hash  text NOT NULL UNIQUE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evt_user_id ON email_verification_tokens(user_id);

-- Session store table used by connect-pg-simple.
-- (Mirrors the library's node_modules/connect-pg-simple/table.sql.)
CREATE TABLE IF NOT EXISTS "session" (
  "sid"    varchar NOT NULL COLLATE "default",
  "sess"   json NOT NULL,
  "expire" timestamp(6) NOT NULL
) WITH (OIDS=FALSE);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey'
  ) THEN
    ALTER TABLE "session"
      ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
