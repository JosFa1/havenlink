import fs from "fs";
import path from "path";
import crypto from "crypto";
import type { AdoptionType, CalcTables, CostLineItem, CostProfile, FilingStatus, FilingStatusTax, FplTable, StateCreditRule, SubsidyProgram, TaxConstants } from "../calculator/types";
import { queryPrimary, updateItem, putItem, getItem, key } from "./dynamo";
import * as postgres from "./calculator-postgres";

export const NATIONAL = "US";
type AnyRow = Record<string, any>;
function dataFile(name: string) { const p = path.resolve(process.cwd(), "src/data/calculator", name); return fs.existsSync(p) ? p : path.resolve(__dirname, "../data/calculator", name); }
function loadJson(name: string): AnyRow[] { return (JSON.parse(fs.readFileSync(dataFile(name), "utf8")) as AnyRow[]).filter((r) => !r._comment); }
const costs = loadJson("cost_profiles.json");
const subsidies = loadJson("subsidy_rules.json");
const taxes = loadJson("tax_constants.json");
const fplRows = loadJson("fpl.json");

async function loadTaxConstantsDynamo(year: number): Promise<TaxConstants | null> {
  const row = [...taxes].filter((r) => r.tax_year <= year).sort((a, b) => b.tax_year - a.tax_year)[0]; if (!row) return null;
  const liability = {} as Record<FilingStatus, FilingStatusTax>;
  for (const [status, raw] of Object.entries(row.liability_json ?? {})) { const value = raw as any; liability[status as FilingStatus] = { standardDeductionCents: value.standard_deduction_cents, brackets: (value.brackets ?? []).map((b: any) => ({ upToCents: b.up_to_cents, rate: b.rate })) }; }
  return { taxYear: row.tax_year, federalCreditMax: row.federal_credit_max_cents, refundableCap: row.refundable_cap_cents, phaseoutStart: row.phaseout_start_cents, phaseoutEnd: row.phaseout_end_cents, liability, stateCredits: row.state_credit_rules_json ?? {}, sourceUrl: row.source_url };
}
async function loadCostProfilesDynamo(state: string, year: number): Promise<Partial<Record<AdoptionType, CostProfile>>> {
  const rows = costs.filter((r) => (r.state_code === state || r.state_code === NATIONAL) && r.effective_year <= year);
  const byType: Partial<Record<AdoptionType, CostProfile>> = {};
  for (const type of new Set(rows.map((r) => r.adoption_type))) {
    const own = rows.filter((r) => r.adoption_type === type && r.state_code === state); const national = rows.filter((r) => r.adoption_type === type && r.state_code === NATIONAL); const chosen = own.length ? own : national;
    const latest = new Map<string, AnyRow>(); for (const r of chosen) { const old = latest.get(r.line_item); if (!old || r.effective_year > old.effective_year) latest.set(r.line_item, r); }
    byType[type as AdoptionType] = { rows: [...latest.values()].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.label.localeCompare(b.label)).map((r): CostLineItem => ({ lineItem: r.line_item, label: r.label, low: r.low_cents, high: r.high_cents, effectiveYear: r.effective_year, sourceUrl: r.source_url })), national: own.length === 0 };
  }
  return byType;
}
async function loadSubsidiesDynamo(state: string, year: number): Promise<SubsidyProgram[]> {
  const rows = subsidies.filter((r) => (r.state_code === state || r.state_code === NATIONAL) && r.effective_year <= year);
  const latest = new Map<string, AnyRow>(); for (const r of rows) { const k = `${r.state_code}:${r.program_key}`; const old = latest.get(k); if (!old || r.effective_year > old.effective_year) latest.set(k, r); }
  const chosen = new Map<string, AnyRow>(); for (const r of latest.values()) { const old = chosen.get(r.program_key); if (!old || r.state_code === state) chosen.set(r.program_key, r); }
  return [...chosen.values()].map((r) => ({ key: r.program_key, name: r.program_name, type: r.program_type as SubsidyProgram["type"], amountLow: r.amount_low_cents, amountHigh: r.amount_high_cents, detail: r.detail, effectiveYear: r.effective_year, sourceUrl: r.source_url, eligibility: { specialNeeds: r.eligibility_json?.special_needs === true, military: r.eligibility_json?.military === true } }));
}
async function loadFplDynamo(year: number): Promise<FplTable | null> { const rows = fplRows.filter((r) => r.year <= year); if (!rows.length) return null; const selectedYear = Math.max(...rows.map((r) => r.year)); const selected = rows.filter((r) => r.year === selectedYear); const bySize: Record<number, number> = {}; for (const r of selected) bySize[r.household_size] = r.amount_cents; return { year: selectedYear, bySize, maxSize: Math.max(...selected.map((r) => r.household_size)), sourceUrl: selected[0].source_url }; }
const useDynamo = () => process.env.DATA_BACKEND === "dynamodb" || !!process.env.DDB_TABLE;
export const loadTaxConstants = (year: number) => useDynamo() ? loadTaxConstantsDynamo(year) : postgres.loadTaxConstants(year);
export const loadCostProfiles = (state: string, year: number) => useDynamo() ? loadCostProfilesDynamo(state, year) : postgres.loadCostProfiles(state, year);
export const loadSubsidies = (state: string, year: number) => useDynamo() ? loadSubsidiesDynamo(state, year) : postgres.loadSubsidies(state, year);
export const loadFpl = (year: number) => useDynamo() ? loadFplDynamo(year) : postgres.loadFpl(year);
export async function loadTables(state: string, year: number): Promise<CalcTables | null> { const [tax, costProfiles, subsidiesResolved, fpl] = await Promise.all([loadTaxConstants(year), loadCostProfiles(state, year), loadSubsidies(state, year), loadFpl(year)]); return tax ? { taxYear: tax.taxYear, costProfiles, subsidies: subsidiesResolved, tax, fpl } : null; }

export interface SavedResult { id: string; version: number; inputs: unknown; result: unknown; created_at: Date; }
type ResultItem = { PK: string; SK: string; id: string; version: number; inputs: unknown; result: unknown; created_at: string };
const resultItem = (r: ResultItem): SavedResult => ({ id: r.id, version: Number(r.version), inputs: r.inputs, result: r.result, created_at: new Date(r.created_at) });
async function saveResultDynamo(userId: string, inputs: unknown, result: unknown): Promise<SavedResult> {
  const counter = await updateItem(key(`USER#${userId}`, "CALC_COUNTER"), "ADD versionCounter :one", { ":one": 1 }, undefined, undefined, "ALL_NEW");
  const version = Number(counter.Attributes?.versionCounter ?? 1); const now = new Date().toISOString(); const item: ResultItem = { PK: `USER#${userId}`, SK: `CALC#${String(version).padStart(10, "0")}`, id: crypto.randomUUID(), version, inputs, result, created_at: now };
  await putItem(item, "attribute_not_exists(PK)"); return resultItem(item);
}
async function listResultsDynamo(userId: string, limit = 20): Promise<SavedResult[]> { return (await queryPrimary<ResultItem>(`USER#${userId}`, "CALC#")).sort((a, b) => b.version - a.version).slice(0, limit).map(resultItem); }
async function findResultDynamo(userId: string, version: number): Promise<SavedResult | null> { const item = await getItem<ResultItem>(key(`USER#${userId}`, `CALC#${String(version).padStart(10, "0")}`)); return item ? resultItem(item) : null; }
export const saveResult = (userId: string, inputs: unknown, result: unknown) => useDynamo() ? saveResultDynamo(userId, inputs, result) : postgres.saveResult(userId, inputs, result);
export const listResults = (userId: string, limit = 20) => useDynamo() ? listResultsDynamo(userId, limit) : postgres.listResults(userId, limit);
export const findResult = (userId: string, version: number) => useDynamo() ? findResultDynamo(userId, version) : postgres.findResult(userId, version);
