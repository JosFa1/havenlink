/**
 * Shared test fixture builder for the calculator.
 *
 * Assembles CalcTables from the REAL committed seed data in src/data/calculator/,
 * mirroring the two documented resolution rules in src/db/calculator.ts: cost
 * profiles are all-or-nothing per (state, adoption type), subsidies are overridden
 * per program key. Extracted from calculate.test.ts so the tide-plate test can
 * exercise derive() against genuine calculate() output rather than invented numbers.
 */
import fs from "node:fs";
import path from "node:path";
import type {
  AdoptionType,
  CalcTables,
  CostProfile,
  FilingStatus,
  FilingStatusTax,
  FplTable,
  SubsidyProgram,
  TaxConstants,
} from "./types";

export const TAX_YEAR = 2026;
const NATIONAL = "US";

function seedDir(): string {
  const candidates = [
    path.join(process.cwd(), "src", "data", "calculator"),
    path.join(__dirname, "..", "..", "src", "data", "calculator"),
  ];
  for (const d of candidates) {
    if (fs.existsSync(path.join(d, "meta.json"))) return d;
  }
  throw new Error("calculator seed data not found");
}

function readSeed<T>(file: string): T[] {
  const rows = JSON.parse(fs.readFileSync(path.join(seedDir(), file), "utf8"));
  return rows.filter((r: unknown) => !(r && typeof r === "object" && "_comment" in r)) as T[];
}

export function buildTables(state: string, year = TAX_YEAR): CalcTables {
  const costRows = readSeed<Record<string, never>>("cost_profiles.json") as unknown as {
    state_code: string;
    adoption_type: AdoptionType;
    line_item: string;
    label: string;
    low_cents: number;
    high_cents: number;
    effective_year: number;
    source_url: string;
    sort_order?: number;
  }[];

  const usable = costRows.filter(
    (r) => (r.state_code === state || r.state_code === NATIONAL) && r.effective_year <= year
  );

  const costProfiles: Partial<Record<AdoptionType, CostProfile>> = {};
  for (const type of new Set(usable.map((r) => r.adoption_type))) {
    const stateRows = usable.filter((r) => r.adoption_type === type && r.state_code === state);
    const nationalRows = usable.filter(
      (r) => r.adoption_type === type && r.state_code === NATIONAL
    );
    const chosen = stateRows.length > 0 ? stateRows : nationalRows;
    if (chosen.length === 0) continue;
    costProfiles[type] = {
      national: stateRows.length === 0,
      rows: chosen
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((r) => ({
          lineItem: r.line_item,
          label: r.label,
          low: r.low_cents,
          high: r.high_cents,
          effectiveYear: r.effective_year,
          sourceUrl: r.source_url,
        })),
    };
  }

  const subsidyRows = readSeed<{
    state_code: string;
    program_key: string;
    program_name: string;
    program_type: SubsidyProgram["type"];
    eligibility_json: Record<string, unknown>;
    amount_low_cents: number | null;
    amount_high_cents: number | null;
    detail: string | null;
    effective_year: number;
    source_url: string;
  }>("subsidy_rules.json");

  const byKey = new Map<string, (typeof subsidyRows)[number]>();
  for (const row of subsidyRows) {
    if (row.state_code !== state && row.state_code !== NATIONAL) continue;
    if (row.effective_year > year) continue;
    const existing = byKey.get(row.program_key);
    if (!existing || row.state_code === state) byKey.set(row.program_key, row);
  }

  const subsidies: SubsidyProgram[] = [...byKey.values()].map((r) => ({
    key: r.program_key,
    name: r.program_name,
    type: r.program_type,
    amountLow: r.amount_low_cents,
    amountHigh: r.amount_high_cents,
    detail: r.detail,
    effectiveYear: r.effective_year,
    sourceUrl: r.source_url,
    eligibility: {
      specialNeeds: r.eligibility_json?.special_needs === true,
      military: r.eligibility_json?.military === true,
    },
  }));

  const taxRow = readSeed<{
    tax_year: number;
    federal_credit_max_cents: number;
    refundable_cap_cents: number;
    phaseout_start_cents: number;
    phaseout_end_cents: number;
    liability_json: Record<
      string,
      { standard_deduction_cents: number; brackets: { up_to_cents: number | null; rate: number }[] }
    >;
    state_credit_rules_json: Record<string, never>;
    source_url: string;
  }>("tax_constants.json")
    .filter((r) => r.tax_year <= year)
    .sort((a, b) => b.tax_year - a.tax_year)[0];

  const liability = {} as Record<FilingStatus, FilingStatusTax>;
  for (const [status, v] of Object.entries(taxRow.liability_json)) {
    liability[status as FilingStatus] = {
      standardDeductionCents: v.standard_deduction_cents,
      brackets: v.brackets.map((b) => ({ upToCents: b.up_to_cents, rate: b.rate })),
    };
  }

  const tax: TaxConstants = {
    taxYear: taxRow.tax_year,
    federalCreditMax: taxRow.federal_credit_max_cents,
    refundableCap: taxRow.refundable_cap_cents,
    phaseoutStart: taxRow.phaseout_start_cents,
    phaseoutEnd: taxRow.phaseout_end_cents,
    liability,
    stateCredits: taxRow.state_credit_rules_json ?? {},
    sourceUrl: taxRow.source_url,
  };

  const fplRows = readSeed<{
    year: number;
    household_size: number;
    amount_cents: number;
    source_url: string;
  }>("fpl.json").filter((r) => r.year <= year);

  const bySize: Record<number, number> = {};
  for (const r of fplRows) bySize[r.household_size] = r.amount_cents;
  const fpl: FplTable = {
    year: fplRows[0].year,
    bySize,
    maxSize: Math.max(...fplRows.map((r) => r.household_size)),
    sourceUrl: fplRows[0].source_url,
  };

  return { taxYear: tax.taxYear, costProfiles, subsidies, tax, fpl };
}
