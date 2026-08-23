/**
 * Loads the Financial Calculator reference data (cost profiles, subsidy rules, tax
 * constants, poverty guidelines) from the committed JSON in src/data/calculator/ into
 * Postgres. Runs via `npm run seed` (dev) / `npm run seed:prod` (compiled), and in
 * production as a boot step BEFORE the app starts, right after the idempotent migration.
 *
 * Change-gated exactly like seedResources.ts: the committed version in meta.json is
 * compared to the last-loaded version in `calc_data_meta`. If they match the seed
 * no-ops in milliseconds, so re-running on every deploy boot is cheap.
 *
 * The four reference tables are entirely seed-managed — this file is their only
 * writer — so a transactional full-replace is the correct refresh. It must NEVER
 * touch `calculator_results`, which holds families' saved estimates.
 *
 * To add a state, edit the JSON and bump the version in meta.json. No code changes
 * are needed. See src/data/calculator/README.md for the full procedure.
 */
import fs from "fs";
import path from "path";
import { pool } from "./pool";

/** tsc does not copy src/data into dist/, so resolve against the source tree first. */
function dataDir(): string {
  const candidates = [
    path.join(process.cwd(), "src", "data", "calculator"),
    path.join(__dirname, "..", "..", "src", "data", "calculator"),
    path.join(__dirname, "..", "data", "calculator"),
  ];
  for (const d of candidates) {
    if (fs.existsSync(path.join(d, "meta.json"))) return d;
  }
  throw new Error(`calculator data not found (looked in: ${candidates.join(", ")})`);
}

/** Read a JSON array, dropping the `_comment` entries used to annotate the files. */
function readRows<T>(dir: string, file: string): T[] {
  const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`${file} must contain a JSON array`);
  return parsed.filter(
    (row) => !(row && typeof row === "object" && "_comment" in row)
  ) as T[];
}

interface CostRow {
  state_code: string;
  adoption_type: string;
  line_item: string;
  label: string;
  low_cents: number;
  high_cents: number;
  effective_year: number;
  source_url: string;
  sort_order?: number;
}

interface SubsidyRow {
  state_code: string;
  program_key: string;
  program_name: string;
  program_type: string;
  eligibility_json: unknown;
  amount_low_cents: number | null;
  amount_high_cents: number | null;
  detail: string | null;
  effective_year: number;
  source_url: string;
}

interface TaxRow {
  tax_year: number;
  federal_credit_max_cents: number;
  refundable_cap_cents: number;
  phaseout_start_cents: number;
  phaseout_end_cents: number;
  liability_json: unknown;
  state_credit_rules_json: unknown;
  source_url: string;
}

interface FplRow {
  year: number;
  household_size: number;
  amount_cents: number;
  source_url: string;
}

/**
 * Fail the seed rather than load a row that would silently produce a wrong number.
 * These are the invariants the calculator cannot recover from at request time: a
 * missing source_url breaks the "show me the math" contract (every figure must be
 * traceable), and an inverted range breaks every downstream {low, high}.
 */
function validate(
  costs: CostRow[],
  subsidies: SubsidyRow[],
  taxes: TaxRow[],
  fpl: FplRow[]
): void {
  const problems: string[] = [];

  for (const c of costs) {
    const where = `cost_profiles ${c.state_code}/${c.adoption_type}/${c.line_item}`;
    if (!c.source_url) problems.push(`${where}: missing source_url`);
    if (!Number.isInteger(c.low_cents) || !Number.isInteger(c.high_cents)) {
      problems.push(`${where}: low_cents/high_cents must be integer cents`);
    } else if (c.low_cents < 0 || c.high_cents < c.low_cents) {
      problems.push(`${where}: invalid range ${c.low_cents}..${c.high_cents}`);
    }
    if (!Number.isInteger(c.effective_year)) problems.push(`${where}: missing effective_year`);
  }

  for (const s of subsidies) {
    const where = `subsidy_rules ${s.state_code}/${s.program_key}`;
    if (!s.source_url) problems.push(`${where}: missing source_url`);
    if (!["monthly", "one_time", "medical", "tuition"].includes(s.program_type)) {
      problems.push(`${where}: unknown program_type "${s.program_type}"`);
    }
    const lo = s.amount_low_cents;
    const hi = s.amount_high_cents;
    if (lo !== null && hi !== null && hi < lo) {
      problems.push(`${where}: invalid range ${lo}..${hi}`);
    }
  }

  for (const t of taxes) {
    const where = `tax_constants ${t.tax_year}`;
    if (!t.source_url) problems.push(`${where}: missing source_url`);
    if (t.phaseout_end_cents <= t.phaseout_start_cents) {
      problems.push(`${where}: phaseout_end must exceed phaseout_start`);
    }
    if (t.refundable_cap_cents > t.federal_credit_max_cents) {
      problems.push(`${where}: refundable cap exceeds the maximum credit`);
    }
    const statuses = Object.keys((t.liability_json ?? {}) as Record<string, unknown>);
    for (const required of ["single", "married_joint", "married_separate", "head_of_household"]) {
      if (!statuses.includes(required)) {
        problems.push(`${where}: liability_json missing "${required}"`);
      }
    }
  }

  if (fpl.length === 0) problems.push("fpl: no rows");
  for (const f of fpl) {
    if (!f.source_url) problems.push(`fpl ${f.year}/${f.household_size}: missing source_url`);
  }

  if (problems.length > 0) {
    throw new Error(`Calculator seed data is invalid:\n  - ${problems.join("\n  - ")}`);
  }
}

async function main() {
  const dir = dataDir();
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
  const version: string = meta.version;

  const existing = await pool
    .query<{ version: string }>("SELECT version FROM calc_data_meta LIMIT 1")
    .catch(() => ({ rows: [] as { version: string }[] }));
  if (existing.rows[0]?.version === version) {
    console.log(`Calculator data already at version ${version}; skipping seed.`);
    await pool.end();
    return;
  }

  const costs = readRows<CostRow>(dir, "cost_profiles.json");
  const subsidies = readRows<SubsidyRow>(dir, "subsidy_rules.json");
  const taxes = readRows<TaxRow>(dir, "tax_constants.json");
  const fpl = readRows<FplRow>(dir, "fpl.json");
  validate(costs, subsidies, taxes, fpl);

  console.log(`Seeding calculator data -> version ${version} ...`);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Reference tables only. calculator_results holds user data and is never touched.
    await client.query("DELETE FROM calc_cost_profiles");
    await client.query("DELETE FROM calc_subsidy_rules");
    await client.query("DELETE FROM calc_tax_constants");
    await client.query("DELETE FROM calc_fpl");

    for (const c of costs) {
      await client.query(
        `INSERT INTO calc_cost_profiles
           (state_code, adoption_type, line_item, label, low_cents, high_cents,
            effective_year, source_url, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          c.state_code, c.adoption_type, c.line_item, c.label, c.low_cents,
          c.high_cents, c.effective_year, c.source_url, c.sort_order ?? 0,
        ]
      );
    }

    for (const s of subsidies) {
      await client.query(
        `INSERT INTO calc_subsidy_rules
           (state_code, program_key, program_name, program_type, eligibility_json,
            amount_low_cents, amount_high_cents, detail, effective_year, source_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          s.state_code, s.program_key, s.program_name, s.program_type,
          JSON.stringify(s.eligibility_json ?? {}), s.amount_low_cents,
          s.amount_high_cents, s.detail ?? null, s.effective_year, s.source_url,
        ]
      );
    }

    for (const t of taxes) {
      await client.query(
        `INSERT INTO calc_tax_constants
           (tax_year, federal_credit_max_cents, refundable_cap_cents, phaseout_start_cents,
            phaseout_end_cents, liability_json, state_credit_rules_json, source_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          t.tax_year, t.federal_credit_max_cents, t.refundable_cap_cents,
          t.phaseout_start_cents, t.phaseout_end_cents, JSON.stringify(t.liability_json),
          JSON.stringify(t.state_credit_rules_json ?? {}), t.source_url,
        ]
      );
    }

    for (const f of fpl) {
      await client.query(
        `INSERT INTO calc_fpl (year, household_size, amount_cents, source_url)
         VALUES ($1,$2,$3,$4)`,
        [f.year, f.household_size, f.amount_cents, f.source_url]
      );
    }

    await client.query(
      `INSERT INTO calc_data_meta (singleton, version, loaded_at)
       VALUES (true, $1, now())
       ON CONFLICT (singleton) DO UPDATE SET version = EXCLUDED.version, loaded_at = now()`,
      [version]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  const states = [...new Set(costs.map((c) => c.state_code))].filter((s) => s !== "US");
  console.log(
    `Calculator seed complete: ${costs.length} cost rows, ${subsidies.length} subsidy rows, ` +
      `${taxes.length} tax years, ${fpl.length} poverty rows. State-specific coverage: ` +
      `${states.length > 0 ? states.join(", ") : "(none — national fallback only)"}.`
  );
  await pool.end();
}

main().catch((err) => {
  console.error(
    "Calculator seed failed:",
    err instanceof Error ? err.stack ?? err.message : String(err)
  );
  pool.end().finally(() => process.exit(1));
});
