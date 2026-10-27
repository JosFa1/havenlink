/**
 * Financial Calculator (Step 4) — shared types.
 *
 * MONEY IS ALWAYS INTEGER CENTS. No floats anywhere in the money path; the only
 * fractional values in this module are bracket rates and the phase-out factor, and
 * both are rounded back to cents immediately.
 *
 * EVERY MONEY VALUE IS A RANGE. The spec is explicit: never a point estimate. Where
 * a figure is genuinely exact (a fixed filing fee), low === high — the range is still
 * a range, so the UI never has to special-case it.
 */

export type AdoptionType =
  | "foster_care"
  | "private_domestic_infant"
  | "international"
  | "relative_kinship"
  | "stepparent";

export type FilingStatus =
  | "single"
  | "married_joint"
  | "married_separate"
  | "head_of_household";

/** The single largest switch in the whole calculation. */
export type SpecialNeeds = "yes" | "no" | "unknown";

export type IncomeBandId =
  | "under_30k"
  | "30k_50k"
  | "50k_75k"
  | "75k_100k"
  | "100k_150k"
  | "150k_200k"
  | "200k_250k"
  | "250k_300k"
  | "300k_plus";

/** Inclusive money interval, in cents. */
export interface Range {
  low: number;
  high: number;
}

/**
 * Income is collected as a BAND, never an exact figure — it cuts form drop-off
 * sharply and means we never hold a family's real income. `highCents: null` marks
 * the open-ended top band.
 */
export interface IncomeBand {
  id: IncomeBandId;
  label: string;
  lowCents: number;
  highCents: number | null;
}

export const INCOME_BANDS: readonly IncomeBand[] = [
  { id: "under_30k", label: "Under $30,000", lowCents: 0, highCents: 3_000_000 },
  { id: "30k_50k", label: "$30,000 – $50,000", lowCents: 3_000_000, highCents: 5_000_000 },
  { id: "50k_75k", label: "$50,000 – $75,000", lowCents: 5_000_000, highCents: 7_500_000 },
  { id: "75k_100k", label: "$75,000 – $100,000", lowCents: 7_500_000, highCents: 10_000_000 },
  { id: "100k_150k", label: "$100,000 – $150,000", lowCents: 10_000_000, highCents: 15_000_000 },
  { id: "150k_200k", label: "$150,000 – $200,000", lowCents: 15_000_000, highCents: 20_000_000 },
  { id: "200k_250k", label: "$200,000 – $250,000", lowCents: 20_000_000, highCents: 25_000_000 },
  { id: "250k_300k", label: "$250,000 – $300,000", lowCents: 25_000_000, highCents: 30_000_000 },
  { id: "300k_plus", label: "$300,000 or more", lowCents: 30_000_000, highCents: null },
] as const;

export const ADOPTION_TYPE_LABELS: Record<AdoptionType, string> = {
  foster_care: "Adoption from foster care",
  private_domestic_infant: "Private domestic infant adoption",
  international: "Intercountry (international) adoption",
  relative_kinship: "Relative or kinship adoption",
  stepparent: "Stepparent adoption",
};

export const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  single: "Single",
  married_joint: "Married filing jointly",
  married_separate: "Married filing separately",
  head_of_household: "Head of household",
};

export interface CalcInputs {
  /** 2-letter state code. Selects the cost profile and the subsidy rules. */
  state: string;
  adoptionType: AdoptionType;
  /** 1–12; sizes above the seeded poverty table clamp and are flagged. */
  householdSize: number;
  incomeBand: IncomeBandId;
  filingStatus: FilingStatus;
  /** Many employers reimburse adoption costs and families rarely know to check. */
  employerBenefitCents: number;
  militaryStatus: boolean;
  specialNeeds: SpecialNeeds;
  /** Passed in, never read from the clock — this keeps calculate() pure. */
  taxYear: number;
}

// ----- Reference data, as loaded from Postgres --------------------------------

export interface CostLineItem {
  lineItem: string;
  label: string;
  low: number;
  high: number;
  effectiveYear: number;
  sourceUrl: string;
}

export interface CostProfile {
  rows: CostLineItem[];
  /** True when this profile came from the 'US' fallback rather than the state. */
  national: boolean;
}

export type SubsidyProgramType = "monthly" | "one_time" | "medical" | "tuition";

export interface SubsidyProgram {
  key: string;
  name: string;
  type: SubsidyProgramType;
  /** null means "this program exists but the amount is set case by case". */
  amountLow: number | null;
  amountHigh: number | null;
  detail: string | null;
  effectiveYear: number;
  sourceUrl: string;
  eligibility: { specialNeeds?: boolean; military?: boolean };
}

export interface TaxBracket {
  /** null on the top bracket. */
  upToCents: number | null;
  rate: number;
}

export interface FilingStatusTax {
  standardDeductionCents: number;
  brackets: TaxBracket[];
}

export interface StateCreditRule {
  name: string;
  type: "percent_of_federal" | "flat_max";
  /** A fraction for percent_of_federal, cents for flat_max. */
  value: number;
  sourceUrl: string;
}

export interface TaxConstants {
  taxYear: number;
  federalCreditMax: number;
  refundableCap: number;
  phaseoutStart: number;
  phaseoutEnd: number;
  liability: Record<FilingStatus, FilingStatusTax>;
  stateCredits: Record<string, StateCreditRule>;
  sourceUrl: string;
}

export interface FplTable {
  year: number;
  /** household_size -> annual guideline in cents. */
  bySize: Record<number, number>;
  maxSize: number;
  sourceUrl: string;
}

export interface CalcTables {
  taxYear: number;
  /** Cost profiles for the requested state, keyed by adoption type. */
  costProfiles: Partial<Record<AdoptionType, CostProfile>>;
  /** Already resolved: a state row has replaced the 'US' row of the same key. */
  subsidies: SubsidyProgram[];
  tax: TaxConstants;
  fpl: FplTable | null;
}

// ----- Result -----------------------------------------------------------------

export type NoteCode =
  | "NATIONAL_FALLBACK"
  | "CREDIT_ZERO_PHASEOUT"
  | "CREDIT_PARTIAL_PHASEOUT"
  | "NON_REFUNDABLE_WORTHLESS"
  | "BAND_STRADDLES_THRESHOLD"
  | "HOUSEHOLD_SIZE_CLAMPED"
  | "INTERNATIONAL_NO_SUBSIDY"
  | "KINSHIP_NO_AGENCY_FEES"
  | "SPECIAL_NEEDS_UNKNOWN"
  | "EMPLOYER_BENEFIT_CAPPED"
  | "NO_COST_DATA";

export interface Note {
  code: NoteCode;
  message: string;
}

export interface TaxCreditDetail {
  /** Total credit after phase-out, before the liability cap. */
  total: Range;
  refundable: Range;
  /** After being capped at estimated tax liability. */
  nonRefundableUsable: Range;
  /** The part that cannot be used this year; carries forward up to 5 years. */
  nonRefundableCarryforward: Range;
  /** refundable + nonRefundableUsable — what actually comes back. */
  usable: Range;
  stateCredit: Range | null;
  stateCreditName: string | null;
  /** 1 = no phase-out, 0 = fully phased out. */
  phaseoutFactor: number;
  estimatedLiability: number;
  /** The income figure the credit was computed at, in cents. */
  computedAtIncome: number;
}

export interface Branch {
  specialNeeds: boolean;
  gross: Range;
  employerBenefitApplied: Range;
  reimbursements: Range;
  reimbursementPrograms: { name: string; amount: Range; sourceUrl: string }[];
  /** The number that actually determines whether a family can start. */
  cashUpFront: Range;
  taxCredit: TaxCreditDetail;
  /**
   * Present only when the income band straddles a phase-out threshold: the same
   * credit computed at each edge of the band, rather than us picking one.
   */
  taxCreditAtBandEdges: { low: TaxCreditDetail; high: TaxCreditDetail } | null;
  netAfterCredits: Range;
  lineItems: CostLineItem[];
  usedNationalFallback: boolean;
}

export interface OngoingSupport {
  /** Per-month, and deliberately NOT netted against cost. */
  monthlySubsidy: Range | null;
  monthlySubsidyName: string | null;
  monthlySubsidyDetail: string | null;
  medicaid: SubsidyProgram | null;
  tuitionWaiver: SubsidyProgram | null;
  /** Every ongoing program that applies, for rendering the block in full. */
  programs: SubsidyProgram[];
  /** True when this whole block is empty for a reason we should state out loud. */
  explanation: string | null;
}

export interface TimelineEntry {
  key: string;
  label: string;
  when: string;
  direction: "out" | "back";
}

export interface CalcResult {
  asOfYear: number;
  state: string;
  adoptionType: AdoptionType;
  incomeBand: IncomeBandId;
  usedNationalFallback: boolean;
  /** The branch the headline reads from. */
  primary: Branch;
  /**
   * Populated only when special_needs is "unknown": both branches, side by side.
   * Most families do not realise it is a legal/administrative category, not a
   * description of the child.
   */
  branches: { specialNeedsYes: Branch; specialNeedsNo: Branch } | null;
  /** The same family's numbers for foster care adoption. Always present. */
  comparisonFosterCare: Branch | null;
  ongoing: OngoingSupport;
  timeline: TimelineEntry[];
  /** Household income as a percentage of the federal poverty guideline. */
  fplPercent: Range | null;
  notes: Note[];
  disclaimer: string;
}
