/**
 * Calculator repository: all SQL touching the calculator tables lives here so
 * src/calculator/ stays pure computation.
 *
 * Two resolution rules, and they differ on purpose:
 *
 *  - COST PROFILES resolve ALL-OR-NOTHING per (state, adoption_type). A state with
 *    any rows for that type uses only its own; a state with none falls back wholly to
 *    the 'US' rows. Mixing the two would sum a state's court fee with a national
 *    agency fee and quietly understate — or double-count — the gross.
 *
 *  - SUBSIDY RULES resolve PER PROGRAM. A state row replaces the 'US' row with the
 *    same program_key (Florida's $1,000 nonrecurring reimbursement overrides the
 *    $2,000 federal ceiling), while federal-only programs with no state row still
 *    apply everywhere (the DoD military reimbursement).
 *
 * Both use the latest effective_year at or below the requested year, so a 2022
 * Children's Bureau figure and a 2026 USCIS fee coexist correctly in one profile.
 */
import { query, transaction } from "./pool";
import type {
  AdoptionType,
  CalcTables,
  CostLineItem,
  CostProfile,
  FilingStatus,
  FilingStatusTax,
  FplTable,
  StateCreditRule,
  SubsidyProgram,
  TaxConstants,
} from "../calculator/types";

/** The national fallback layer. Not a real state code — see schema.sql. */
export const NATIONAL = "US";

interface CostRow {
  state_code: string;
  adoption_type: string;
  line_item: string;
  label: string;
  low_cents: number;
  high_cents: number;
  effective_year: number;
  source_url: string;
}

interface SubsidyRow {
  state_code: string;
  program_key: string;
  program_name: string;
  program_type: string;
  eligibility_json: Record<string, unknown> | null;
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
  liability_json: Record<string, FilingStatusTaxJson>;
  state_credit_rules_json: Record<string, StateCreditRule>;
  source_url: string;
}

interface FilingStatusTaxJson {
  standard_deduction_cents: number;
  brackets: { up_to_cents: number | null; rate: number }[];
}

/**
 * The most recent tax-constants row at or below `year`. Returns null when the table
 * has no usable row — the caller turns that into a clean 503 rather than computing a
 * credit against zeros.
 */
export async function loadTaxConstants(year: number): Promise<TaxConstants | null> {
  const { rows } = await query<TaxRow>(
    `SELECT * FROM calc_tax_constants
      WHERE tax_year <= $1
      ORDER BY tax_year DESC
      LIMIT 1`,
    [year]
  );
  const row = rows[0];
  if (!row) return null;

  const liability = {} as Record<FilingStatus, FilingStatusTax>;
  for (const [status, value] of Object.entries(row.liability_json ?? {})) {
    liability[status as FilingStatus] = {
      standardDeductionCents: value.standard_deduction_cents,
      brackets: (value.brackets ?? []).map((b) => ({
        upToCents: b.up_to_cents,
        rate: b.rate,
      })),
    };
  }

  return {
    taxYear: row.tax_year,
    federalCreditMax: row.federal_credit_max_cents,
    refundableCap: row.refundable_cap_cents,
    phaseoutStart: row.phaseout_start_cents,
    phaseoutEnd: row.phaseout_end_cents,
    liability,
    stateCredits: row.state_credit_rules_json ?? {},
    sourceUrl: row.source_url,
  };
}

/**
 * Every cost profile for one state, keyed by adoption type, with the national
 * fallback already applied per type. Loading all types in one query is deliberate:
 * the foster-care comparison rail runs on every request, so the caller always needs
 * at least two types.
 */
export async function loadCostProfiles(
  state: string,
  year: number
): Promise<Partial<Record<AdoptionType, CostProfile>>> {
  // DISTINCT ON keeps one row per (state, type, line_item) — the newest effective
  // year at or below the requested one.
  const { rows } = await query<CostRow>(
    `SELECT DISTINCT ON (state_code, adoption_type, line_item)
            state_code, adoption_type, line_item, label,
            low_cents, high_cents, effective_year, source_url
       FROM calc_cost_profiles
      WHERE state_code IN ($1, $2)
        AND effective_year <= $3
      ORDER BY state_code, adoption_type, line_item, effective_year DESC`,
    [state, NATIONAL, year]
  );

  // Sort order is applied after DISTINCT ON, which must order by its own key first.
  const { rows: order } = await query<{ line_item: string; sort_order: number }>(
    `SELECT DISTINCT line_item, MIN(sort_order) AS sort_order
       FROM calc_cost_profiles
      GROUP BY line_item`
  );
  const sortByLineItem = new Map(order.map((o) => [o.line_item, Number(o.sort_order)]));

  const byType: Partial<Record<AdoptionType, CostProfile>> = {};

  const toItem = (r: CostRow): CostLineItem => ({
    lineItem: r.line_item,
    label: r.label,
    low: r.low_cents,
    high: r.high_cents,
    effectiveYear: r.effective_year,
    sourceUrl: r.source_url,
  });

  const types = new Set(rows.map((r) => r.adoption_type as AdoptionType));
  for (const type of types) {
    const stateRows = rows.filter((r) => r.adoption_type === type && r.state_code === state);
    const nationalRows = rows.filter(
      (r) => r.adoption_type === type && r.state_code === NATIONAL
    );
    // All-or-nothing: a state with its own rows never mixes in national ones.
    const chosen = stateRows.length > 0 ? stateRows : nationalRows;
    if (chosen.length === 0) continue;

    byType[type] = {
      rows: chosen
        .map(toItem)
        .sort(
          (a, b) =>
            (sortByLineItem.get(a.lineItem) ?? 0) - (sortByLineItem.get(b.lineItem) ?? 0) ||
            a.label.localeCompare(b.label)
        ),
      national: stateRows.length === 0,
    };
  }

  return byType;
}

/** Subsidy programs for a state, with state rows overriding federal ones per key. */
export async function loadSubsidies(state: string, year: number): Promise<SubsidyProgram[]> {
  const { rows } = await query<SubsidyRow>(
    `SELECT DISTINCT ON (state_code, program_key)
            state_code, program_key, program_name, program_type, eligibility_json,
            amount_low_cents, amount_high_cents, detail, effective_year, source_url
       FROM calc_subsidy_rules
      WHERE state_code IN ($1, $2)
        AND effective_year <= $3
      ORDER BY state_code, program_key, effective_year DESC`,
    [state, NATIONAL, year]
  );

  const byKey = new Map<string, SubsidyRow>();
  for (const row of rows) {
    const existing = byKey.get(row.program_key);
    // A state row always wins over the federal row for the same program.
    if (!existing || row.state_code === state) byKey.set(row.program_key, row);
  }

  return [...byKey.values()].map((r) => {
    const eligibility = (r.eligibility_json ?? {}) as Record<string, unknown>;
    return {
      key: r.program_key,
      name: r.program_name,
      type: r.program_type as SubsidyProgram["type"],
      amountLow: r.amount_low_cents,
      amountHigh: r.amount_high_cents,
      detail: r.detail,
      effectiveYear: r.effective_year,
      sourceUrl: r.source_url,
      eligibility: {
        specialNeeds: eligibility.special_needs === true,
        military: eligibility.military === true,
      },
    };
  });
}

export async function loadFpl(year: number): Promise<FplTable | null> {
  const { rows } = await query<{
    year: number;
    household_size: number;
    amount_cents: number;
    source_url: string;
  }>(
    `SELECT year, household_size, amount_cents, source_url
       FROM calc_fpl
      WHERE year = (SELECT MAX(year) FROM calc_fpl WHERE year <= $1)
      ORDER BY household_size`,
    [year]
  );
  if (rows.length === 0) return null;

  const bySize: Record<number, number> = {};
  for (const r of rows) bySize[r.household_size] = r.amount_cents;

  return {
    year: rows[0].year,
    bySize,
    maxSize: Math.max(...rows.map((r) => r.household_size)),
    sourceUrl: rows[0].source_url,
  };
}

/** Everything calculate() needs, for one state and year. */
export async function loadTables(state: string, year: number): Promise<CalcTables | null> {
  const [tax, costProfiles, subsidies, fpl] = await Promise.all([
    loadTaxConstants(year),
    loadCostProfiles(state, year),
    loadSubsidies(state, year),
    loadFpl(year),
  ]);

  // Without tax constants there is no credit to compute and no honest way to fake
  // one. The caller surfaces this as "temporarily unavailable", never as $0.
  if (!tax) return null;

  return { taxYear: tax.taxYear, costProfiles, subsidies, tax, fpl };
}

// ----- saved results ----------------------------------------------------------

export interface SavedResult {
  id: string;
  version: number;
  inputs: unknown;
  result: unknown;
  created_at: Date;
}

/**
 * Append a new version. The spec is explicit that re-running with changed inputs
 * saves a NEW version rather than overwriting — a family comparing foster care
 * against private domestic must not lose the first answer to see the second.
 *
 * The version is computed inside the INSERT and guarded by UNIQUE (user_id, version),
 * so two concurrent saves cannot collide silently; the caller retries on 23505.
 */
export async function saveResult(
  userId: string,
  inputs: unknown,
  result: unknown
): Promise<SavedResult> {
  return transaction(async (client) => {
    const { rows } = await client.query<SavedResult>(
      `INSERT INTO calculator_results (user_id, version, inputs, result)
       SELECT $1,
              COALESCE(MAX(version), 0) + 1,
              $2::jsonb,
              $3::jsonb
         FROM calculator_results
        WHERE user_id = $1
       RETURNING id, user_id, version, inputs, result, created_at`,
      [userId, JSON.stringify(inputs), JSON.stringify(result)]
    );
    const saved = rows[0];
    await client.query(
      "INSERT INTO havenlink_outbox (aggregate_type, aggregate_id, event_type, payload) VALUES ($1,$2,$3,$4::jsonb)",
      ["calculator_result", saved.id, "calculator.saved", JSON.stringify({ ...saved, user_id: userId })]
    );
    return saved;
  });
}

export async function listResults(userId: string, limit = 20): Promise<SavedResult[]> {
  const { rows } = await query<SavedResult>(
    `SELECT id, version, inputs, result, created_at
       FROM calculator_results
      WHERE user_id = $1
      ORDER BY version DESC
      LIMIT $2`,
    [userId, limit]
  );
  return rows;
}

/** One saved version, scoped to its owner — the id is not guessable across accounts. */
export async function findResult(
  userId: string,
  version: number
): Promise<SavedResult | null> {
  const { rows } = await query<SavedResult>(
    `SELECT id, version, inputs, result, created_at
       FROM calculator_results
      WHERE user_id = $1 AND version = $2`,
    [userId, version]
  );
  return rows[0] ?? null;
}
