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

-- Durable change feed used during the PostgreSQL-authoritative migration.  Each
-- user mutation inserts the complete post-write row in the same transaction;
-- the candidate worker can replay events idempotently by aggregate_id/version.
CREATE TABLE IF NOT EXISTS havenlink_outbox (
  id              bigserial PRIMARY KEY,
  aggregate_type  text NOT NULL,
  aggregate_id    uuid NOT NULL,
  event_type      text NOT NULL,
  payload         jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  processed_at    timestamptz,
  attempts        integer NOT NULL DEFAULT 0,
  last_error      text
);
CREATE INDEX IF NOT EXISTS idx_havenlink_outbox_pending ON havenlink_outbox (id) WHERE processed_at IS NULL;

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

-- ===== Financial Calculator (Step 5) =========================================
-- Added post-launch; all statements are idempotent so `npm run migrate` stays safe
-- to re-run. The four reference tables below are ENTIRELY seed-managed: their only
-- writer is `npm run seed` (src/db/seedCalculator.ts), loading committed JSON from
-- src/data/calculator/. No dollar figure is ever hardcoded in application code --
-- every row carries an `effective_year` and the `source_url` it was read from.
--
-- Two-layer lookup, matching the eligibility engine's federal + state-override
-- pattern. `state_code` is a 2-letter code, or the sentinel 'US' for the national
-- layer. ('US' rather than NULL because Postgres UNIQUE does not dedupe NULLs, so
-- a nullable column would silently permit duplicate national rows.)

-- Cost line items. Resolution is all-or-nothing per (state, adoption_type): a state
-- with any rows for that type uses only its own; a state with none falls back to the
-- 'US' rows and the result is flagged so the UI can show the "no state data yet"
-- banner. Partial state profiles would understate a gross cost, so they are not mixed.
CREATE TABLE IF NOT EXISTS calc_cost_profiles (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code     char(2) NOT NULL,
  adoption_type  text NOT NULL,
  line_item      text NOT NULL,
  label          text NOT NULL,
  low_cents      integer NOT NULL CHECK (low_cents >= 0),
  high_cents     integer NOT NULL CHECK (high_cents >= low_cents),
  effective_year integer NOT NULL,
  source_url     text NOT NULL,
  sort_order     integer NOT NULL DEFAULT 0,
  UNIQUE (state_code, adoption_type, line_item, effective_year)
);

CREATE INDEX IF NOT EXISTS idx_calc_cost_lookup
  ON calc_cost_profiles (state_code, adoption_type, effective_year);

-- Subsidy / reimbursement / Medicaid / tuition programs. Unlike cost profiles these
-- resolve per program: `program_key` identifies the program across layers, and a
-- state row REPLACES the 'US' row with the same key (e.g. Florida's $1,000
-- nonrecurring reimbursement overrides the $2,000 federal ceiling). Programs with no
-- state row still apply nationally (e.g. the DoD military reimbursement).
-- `eligibility_json` gates a program, e.g. {"special_needs": true} or {"military": true}.
CREATE TABLE IF NOT EXISTS calc_subsidy_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_code        char(2) NOT NULL,
  program_key       text NOT NULL,
  program_name      text NOT NULL,
  program_type      text NOT NULL
                    CHECK (program_type IN ('monthly', 'one_time', 'medical', 'tuition')),
  eligibility_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- NULL amounts mean "this program exists but the amount is set case by case".
  -- The UI must say that rather than render a zero.
  amount_low_cents  integer CHECK (amount_low_cents >= 0),
  amount_high_cents integer CHECK (amount_high_cents >= 0),
  detail            text,
  effective_year    integer NOT NULL,
  source_url        text NOT NULL,
  UNIQUE (state_code, program_key, effective_year)
);

-- Federal adoption-credit constants, one row per tax year. `liability_json` holds the
-- standard deduction and rate schedule per filing status; it exists because capping
-- the non-refundable portion at estimated tax liability is impossible without them,
-- and those figures may not live in application code either.
CREATE TABLE IF NOT EXISTS calc_tax_constants (
  tax_year                 integer PRIMARY KEY,
  federal_credit_max_cents integer NOT NULL,
  refundable_cap_cents     integer NOT NULL,
  phaseout_start_cents     integer NOT NULL,
  phaseout_end_cents       integer NOT NULL,
  -- { "<filing_status>": { "standard_deduction_cents": n,
  --                        "brackets": [ { "up_to_cents": n | null, "rate": 0.10 }, ... ] } }
  liability_json           jsonb NOT NULL,
  -- { "<STATE>": { "name": ..., "type": "percent_of_federal" | "flat_max",
  --                "value": n, "source_url": ... } }
  state_credit_rules_json  jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_url               text NOT NULL
);

-- HHS poverty guidelines, used for the grant-eligibility readout. Household sizes
-- above the largest seeded row clamp to it and the result is flagged.
CREATE TABLE IF NOT EXISTS calc_fpl (
  year           integer NOT NULL,
  household_size integer NOT NULL,
  amount_cents   integer NOT NULL,
  source_url     text NOT NULL,
  PRIMARY KEY (year, household_size)
);

-- Single-row marker gating the calculator seed, mirroring resource_data_meta: the
-- seed no-ops unless the committed version differs from what was last loaded.
CREATE TABLE IF NOT EXISTS calc_data_meta (
  singleton  boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  version    text NOT NULL,
  loaded_at  timestamptz NOT NULL DEFAULT now()
);

-- Saved estimates. APPEND-ONLY: re-running with changed inputs writes a new version
-- rather than overwriting the prior result, so a family can compare paths.
-- PRIVACY: `inputs` stores the income BAND id only -- never an exact income figure --
-- and results are never emailed anywhere. A family's income screen is theirs alone.
CREATE TABLE IF NOT EXISTS calculator_results (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version    integer NOT NULL,
  inputs     jsonb NOT NULL,
  result     jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, version)
);

CREATE INDEX IF NOT EXISTS idx_calculator_results_user
  ON calculator_results (user_id, version DESC);
