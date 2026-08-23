/**
 * Financial Calculator (Step 5) — the calculation.
 *
 * PURE. No I/O, no database, no network, no clock (the tax year is an input). Given
 * the same inputs and the same tables it always returns the same result, which is
 * what makes it testable — see calculate.test.ts.
 *
 * The rule that governs every decision here: this is a reality check, never a gate.
 * Nothing in this file produces a score, a pass/fail, or an eligibility verdict. When
 * the number is bad the job is to show the cheaper path, not to close the door — which
 * is why the foster-care comparison is computed unconditionally, on every single run.
 *
 * Order of operations follows the spec exactly:
 *   1. gross = sum of line items for (state, adoption_type)
 *   2. − employer benefit, capped at gross
 *   3. − one-time reimbursements (nonrecurring / military)
 *   4. = cash needed up front          <- display this first
 *   5. tax credit: phase-out -> refundable/non-refundable split -> liability cap
 *   6. − credit = net cost after credits
 *   7. ongoing monthly subsidy / Medicaid / tuition, computed SEPARATELY and never
 *      netted against cost. Recurring income is not a discount.
 */
import {
  ADOPTION_TYPE_LABELS,
  INCOME_BANDS,
  type AdoptionType,
  type Branch,
  type CalcInputs,
  type CalcResult,
  type CalcTables,
  type CostLineItem,
  type FilingStatusTax,
  type IncomeBand,
  type Note,
  type NoteCode,
  type OngoingSupport,
  type Range,
  type SubsidyProgram,
  type TaxConstants,
  type TaxCreditDetail,
  type TimelineEntry,
} from "./types";

// ----- range arithmetic -------------------------------------------------------

const ZERO: Range = { low: 0, high: 0 };

const range = (low: number, high: number): Range => ({ low, high });

function addRange(a: Range, b: Range): Range {
  return { low: a.low + b.low, high: a.high + b.high };
}

/**
 * Interval subtraction for two INDEPENDENT ranges, floored at zero. The pairing is
 * deliberate: the family's worst case is the highest cost against the *smallest*
 * offset, and their best case is the lowest cost against the largest.
 *
 * Only correct when the two ranges vary independently. In this calculation that is
 * true of exactly one pair — cost against the one-time reimbursement programs, whose
 * "up to $X" amounts are unrelated to which end of the cost range a family lands on.
 * Everything else uses subtractCorrelated below.
 */
function subtractRange(a: Range, b: Range): Range {
  return {
    low: Math.max(0, a.low - b.high),
    high: Math.max(0, a.high - b.low),
  };
}

/**
 * Interval subtraction where `b` is DERIVED from `a`, so the two move together: `b.low`
 * is what happens in the same world as `a.low`.
 *
 * Using the worst-case pairing here would describe scenarios that cannot occur — the
 * highest cost paired with the smallest employer benefit, when the benefit is itself
 * capped at that same cost. That produced a visible bug: a $50,000 employer benefit
 * against a $0–$395 Florida cost left $395 still "needed up front".
 */
function subtractCorrelated(a: Range, b: Range): Range {
  return {
    low: Math.max(0, a.low - b.low),
    high: Math.max(0, a.high - b.high),
  };
}

/**
 * Cap a fixed amount at a cost range, element-wise. The result is correlated with the
 * ceiling by construction — an employer cannot reimburse more than was spent, so in
 * the low-cost world the benefit applied is the low-cost figure.
 */
function capRange(value: Range, ceiling: Range): Range {
  return {
    low: Math.min(value.low, ceiling.low),
    high: Math.min(value.high, ceiling.high),
  };
}

const isZeroRange = (r: Range): boolean => r.low === 0 && r.high === 0;

// ----- income bands -----------------------------------------------------------

function bandFor(id: string): IncomeBand {
  const band = INCOME_BANDS.find((b) => b.id === id);
  if (!band) throw new Error(`Unknown income band: ${id}`);
  return band;
}

/**
 * The single income figure to compute the credit at: the band midpoint.
 *
 * The open-ended top band has no midpoint, and using its floor would systematically
 * OVERSTATE the credit — a family earning $600,000 would be quoted the $300,000
 * answer. Overstating a credit is the harmful direction: families budget against
 * money that never arrives. So the open band reports from the end of the phase-out,
 * the point past which nothing changes, and the band-edge breakdown still shows what
 * happens at the very bottom of the band.
 */
function representativeIncome(band: IncomeBand, tax: TaxConstants): number {
  if (band.highCents === null) return Math.max(band.lowCents, tax.phaseoutEnd);
  return Math.round((band.lowCents + band.highCents) / 2);
}

/**
 * True when the band contains a phase-out threshold. The spec is specific: only then
 * do we show both outcomes instead of picking one. A band that sits wholly inside the
 * phase-out ramp still has a single well-defined midpoint answer.
 */
function straddlesThreshold(band: IncomeBand, tax: TaxConstants): boolean {
  const high = band.highCents ?? Number.POSITIVE_INFINITY;
  const contains = (t: number) => band.lowCents < t && high > t;
  return contains(tax.phaseoutStart) || contains(tax.phaseoutEnd);
}

// ----- federal income tax liability -------------------------------------------

/**
 * Estimated federal income tax liability, needed to cap the non-refundable portion
 * of the credit. Deliberately simple — standard deduction and the ordinary rate
 * schedule only. It exists to answer "can this family actually use a non-refundable
 * credit?", which is a yes/no/roughly question, not to compute anyone's real return.
 */
export function estimateLiability(incomeCents: number, schedule: FilingStatusTax): number {
  const taxable = Math.max(0, incomeCents - schedule.standardDeductionCents);
  if (taxable === 0) return 0;

  let tax = 0;
  let floor = 0;
  for (const bracket of schedule.brackets) {
    const ceiling = bracket.upToCents ?? Number.POSITIVE_INFINITY;
    if (taxable <= floor) break;
    const slice = Math.min(taxable, ceiling) - floor;
    if (slice > 0) tax += slice * bracket.rate;
    floor = ceiling;
    if (!Number.isFinite(ceiling)) break;
  }
  return Math.round(tax);
}

/**
 * Linear MAGI phase-out factor: 1 below the start, 0 at or above the end, and a
 * straight line between.
 */
export function phaseoutFactor(incomeCents: number, tax: TaxConstants): number {
  if (incomeCents <= tax.phaseoutStart) return 1;
  if (incomeCents >= tax.phaseoutEnd) return 0;
  const span = tax.phaseoutEnd - tax.phaseoutStart;
  return (tax.phaseoutEnd - incomeCents) / span;
}

// ----- the tax credit ---------------------------------------------------------

/**
 * The credit at one income figure.
 *
 * A special-needs adoption claims the FULL credit whether or not the family paid any
 * qualified expenses, so the base is the statutory maximum rather than their spend.
 * Everyone else is limited to what they actually spent, up to that maximum — which is
 * why `qualifiedExpenses` is a range and the credit inherits that range.
 */
function computeCreditFor(
  incomeCents: number,
  inputs: CalcInputs,
  qualifiedExpenses: Range,
  specialNeeds: boolean,
  tax: TaxConstants
): TaxCreditDetail {
  const factor = phaseoutFactor(incomeCents, tax);

  const base: Range = specialNeeds
    ? range(tax.federalCreditMax, tax.federalCreditMax)
    : range(
        Math.min(qualifiedExpenses.low, tax.federalCreditMax),
        Math.min(qualifiedExpenses.high, tax.federalCreditMax)
      );

  const total: Range = {
    low: Math.round(base.low * factor),
    high: Math.round(base.high * factor),
  };

  // The refundable slice and the remainder are both derived from `total`, so every
  // subtraction below is correlated, not worst-case.
  const refundable: Range = {
    low: Math.min(total.low, tax.refundableCap),
    high: Math.min(total.high, tax.refundableCap),
  };
  const nonRefundable = subtractCorrelated(total, refundable);

  const schedule = tax.liability[inputs.filingStatus];
  const liability = schedule ? estimateLiability(incomeCents, schedule) : 0;

  // The non-refundable portion cannot exceed tax actually owed. What is left over
  // carries forward for up to 5 years — real, but not money back this year.
  const nonRefundableUsable: Range = {
    low: Math.min(nonRefundable.low, liability),
    high: Math.min(nonRefundable.high, liability),
  };
  const nonRefundableCarryforward = subtractCorrelated(nonRefundable, nonRefundableUsable);

  const stateRule = tax.stateCredits[inputs.state];
  let stateCredit: Range | null = null;
  if (stateRule) {
    stateCredit =
      stateRule.type === "percent_of_federal"
        ? {
            low: Math.round(total.low * stateRule.value),
            high: Math.round(total.high * stateRule.value),
          }
        : range(0, stateRule.value);
  }

  const usable = addRange(
    addRange(refundable, nonRefundableUsable),
    stateCredit ?? ZERO
  );

  return {
    total,
    refundable,
    nonRefundableUsable,
    nonRefundableCarryforward,
    usable,
    stateCredit,
    stateCreditName: stateRule ? stateRule.name : null,
    phaseoutFactor: factor,
    estimatedLiability: liability,
    computedAtIncome: incomeCents,
  };
}

// ----- cost profile resolution ------------------------------------------------

function profileFor(
  tables: CalcTables,
  adoptionType: AdoptionType
): { rows: CostLineItem[]; national: boolean } {
  const profile = tables.costProfiles[adoptionType];
  if (!profile) return { rows: [], national: true };
  return { rows: profile.rows, national: profile.national };
}

function sumLineItems(rows: CostLineItem[]): Range {
  return rows.reduce<Range>((acc, r) => addRange(acc, range(r.low, r.high)), ZERO);
}

// ----- subsidies --------------------------------------------------------------

function programApplies(
  program: SubsidyProgram,
  specialNeeds: boolean,
  military: boolean
): boolean {
  if (program.eligibility.specialNeeds === true && !specialNeeds) return false;
  if (program.eligibility.military === true && !military) return false;
  return true;
}

/**
 * Intercountry adoptions are not part of the state child-welfare system, so the
 * IV-E subsidy machinery does not reach them. The spec is explicit that we say that
 * rather than render an empty block.
 */
function subsidiesReachThisPath(adoptionType: AdoptionType): boolean {
  return adoptionType !== "international";
}

function buildOngoing(
  tables: CalcTables,
  inputs: CalcInputs,
  specialNeeds: boolean
): OngoingSupport {
  const empty: OngoingSupport = {
    monthlySubsidy: null,
    monthlySubsidyName: null,
    monthlySubsidyDetail: null,
    medicaid: null,
    tuitionWaiver: null,
    programs: [],
    explanation: null,
  };

  if (!subsidiesReachThisPath(inputs.adoptionType)) {
    return {
      ...empty,
      explanation:
        "Intercountry adoptions sit outside the state child welfare system, so Title IV-E " +
        "adoption assistance, Medicaid coverage, and state tuition waivers do not apply to " +
        "this path. That is not a gap in our data — those programs genuinely do not reach here.",
    };
  }

  if (!specialNeeds) {
    return {
      ...empty,
      explanation:
        "Ongoing adoption assistance — the monthly subsidy, Medicaid, and tuition waivers — " +
        "is tied to a state's special-needs determination. Without that determination these " +
        "programs do not apply.",
    };
  }

  const applicable = tables.subsidies.filter(
    (p) => p.type !== "one_time" && programApplies(p, specialNeeds, inputs.militaryStatus)
  );

  const monthly = applicable.find((p) => p.type === "monthly") ?? null;
  const medicaid = applicable.find((p) => p.type === "medical") ?? null;
  const tuition = applicable.find((p) => p.type === "tuition") ?? null;

  return {
    monthlySubsidy:
      monthly && monthly.amountLow !== null && monthly.amountHigh !== null
        ? range(monthly.amountLow, monthly.amountHigh)
        : null,
    monthlySubsidyName: monthly ? monthly.name : null,
    monthlySubsidyDetail: monthly ? monthly.detail : null,
    medicaid,
    tuitionWaiver: tuition,
    programs: applicable,
    explanation:
      applicable.length === 0
        ? "We do not have ongoing-support data for this state yet. Ask the agency handling " +
          "your case what monthly assistance, Medicaid coverage, and tuition benefits apply."
        : null,
  };
}

/** One-time reimbursements that reduce the cash a family has to find up front. */
function reimbursementsFor(
  tables: CalcTables,
  inputs: CalcInputs,
  specialNeeds: boolean
): { total: Range; programs: { name: string; amount: Range; sourceUrl: string }[] } {
  const programs: { name: string; amount: Range; sourceUrl: string }[] = [];
  let total = ZERO;

  for (const p of tables.subsidies) {
    if (p.type !== "one_time") continue;
    if (!programApplies(p, specialNeeds, inputs.militaryStatus)) continue;
    if (p.amountLow === null || p.amountHigh === null) continue;
    // The nonrecurring reimbursement is a child-welfare program; it does not reach
    // intercountry adoptions. The military reimbursement does, so it is not filtered.
    if (p.key === "nonrecurring_reimbursement" && !subsidiesReachThisPath(inputs.adoptionType)) {
      continue;
    }
    const amount = range(p.amountLow, p.amountHigh);
    programs.push({ name: p.name, amount, sourceUrl: p.sourceUrl });
    total = addRange(total, amount);
  }

  return { total, programs };
}

// ----- one branch (special-needs yes or no) -----------------------------------

function buildBranch(
  tables: CalcTables,
  inputs: CalcInputs,
  adoptionType: AdoptionType,
  specialNeeds: boolean,
  band: IncomeBand
): Branch {
  const { rows, national } = profileFor(tables, adoptionType);
  const gross = sumLineItems(rows);

  // 2. Employer benefit, capped at gross — a family cannot be reimbursed for more
  //    than they spent.
  const employerBenefitApplied = capRange(
    range(inputs.employerBenefitCents, inputs.employerBenefitCents),
    gross
  );
  const afterEmployer = subtractCorrelated(gross, employerBenefitApplied);

  // 3. One-time reimbursements.
  const { total: reimbursements, programs: reimbursementPrograms } = reimbursementsFor(
    tables,
    inputs,
    specialNeeds
  );

  // 4. Cash needed up front.
  const cashUpFront = subtractRange(afterEmployer, reimbursements);

  // 5. The credit. Qualified expenses are the gross spend before reimbursement —
  //    the employer-excluded portion cannot also be claimed, so it comes off first.
  const qualifiedExpenses = afterEmployer;

  const straddles = straddlesThreshold(band, tables.tax);
  const taxCredit = computeCreditFor(
    representativeIncome(band, tables.tax),
    inputs,
    qualifiedExpenses,
    specialNeeds,
    tables.tax
  );

  let taxCreditAtBandEdges: Branch["taxCreditAtBandEdges"] = null;
  if (straddles) {
    // For the open-ended top band the meaningful upper edge is the point past which
    // nothing changes: the end of the phase-out.
    const highEdge = band.highCents ?? tables.tax.phaseoutEnd;
    taxCreditAtBandEdges = {
      low: computeCreditFor(band.lowCents, inputs, qualifiedExpenses, specialNeeds, tables.tax),
      high: computeCreditFor(highEdge, inputs, qualifiedExpenses, specialNeeds, tables.tax),
    };
  }

  // 6. Net after credits. Correlated: for a non-special-needs adoption the credit is
  //    min(expenses, cap), so the high credit belongs to the same world as the high
  //    cost. (For special needs the credit is a flat statutory amount, where both
  //    pairings agree anyway.)
  const netAfterCredits = subtractCorrelated(cashUpFront, taxCredit.usable);

  return {
    specialNeeds,
    gross,
    employerBenefitApplied,
    reimbursements,
    reimbursementPrograms,
    cashUpFront,
    taxCredit,
    taxCreditAtBandEdges,
    netAfterCredits,
    lineItems: rows,
    usedNationalFallback: national,
  };
}

// ----- timeline ---------------------------------------------------------------

/**
 * Timing is the whole point. The credit arrives when the family files taxes for the
 * year the adoption finalizes — often 12–18 months after the money leaves. A family
 * that has the money but no bridge financing needs to see that gap before they commit.
 */
function buildTimeline(adoptionType: AdoptionType, taxYear: number): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    {
      key: "home_study",
      label: "Home study fees due",
      when: "Month 0–3",
      direction: "out",
    },
    {
      key: "agency_fees",
      label:
        adoptionType === "international"
          ? "Program, immigration, and travel fees due"
          : "Agency and legal fees due",
      when: "Month 3–12",
      direction: "out",
    },
    {
      key: "placement",
      label: "Placement",
      when: "Varies widely",
      direction: "out",
    },
    {
      key: "finalization",
      label: "Court finalization — remaining court and legal costs",
      when: "6–12 months after placement",
      direction: "out",
    },
    {
      key: "reimbursement",
      label: "One-time reimbursement paid (if the adoption qualifies)",
      when: "After finalization",
      direction: "back",
    },
    {
      key: "tax_credit",
      label: `Adoption tax credit claimed — filing your ${taxYear} return`,
      when: `Early ${taxYear + 1}, for an adoption finalized in ${taxYear}`,
      direction: "back",
    },
  ];

  if (adoptionType !== "international") {
    entries.push({
      key: "subsidy_start",
      label: "Monthly subsidy begins (if the adoption qualifies)",
      when: "At finalization",
      direction: "back",
    });
  }

  return entries;
}

// ----- notes ------------------------------------------------------------------

const NOTE_MESSAGES: Record<NoteCode, string> = {
  // Overridden per request by nationalFallbackNote() so the message can name the
  // adoption type — a state can have data for one path and not another.
  NATIONAL_FALLBACK:
    "We do not have state-specific cost data for this path yet, so these figures are " +
    "national ranges. Your state's actual fees may differ.",
  CREDIT_ZERO_PHASEOUT:
    "Your income is above the phase-out range, so the federal adoption tax credit is $0. " +
    "That is worth knowing plainly rather than discovering at tax time.",
  CREDIT_PARTIAL_PHASEOUT:
    "Your income falls inside the phase-out range, so the federal adoption tax credit is " +
    "reduced rather than paid in full.",
  NON_REFUNDABLE_WORTHLESS:
    "At this income the non-refundable part of the credit is worth little or nothing, " +
    "because it can only offset tax you actually owe. The refundable portion and any " +
    "ongoing subsidy are what matter here.",
  BAND_STRADDLES_THRESHOLD:
    "Your income band crosses a phase-out threshold, so we show the credit at both ends of " +
    "the band instead of guessing which side you fall on.",
  HOUSEHOLD_SIZE_CLAMPED:
    "Your household is larger than the published poverty guideline table, so the " +
    "percentage below is an approximation using the largest published size.",
  INTERNATIONAL_NO_SUBSIDY:
    "Intercountry adoption adds immigration fees and, in many countries, a second trip. " +
    "Most adoption subsidies do not apply to this path.",
  KINSHIP_NO_AGENCY_FEES:
    "Relative, kinship, and stepparent adoptions usually involve no agency program fee. " +
    "Private-infant figures do not apply to this path and are not shown.",
  SPECIAL_NEEDS_UNKNOWN:
    "\"Special needs\" is a legal and administrative category a state assigns — not a " +
    "description of a child. It is the single largest factor in what adoption costs, so " +
    "both outcomes are shown below.",
  EMPLOYER_BENEFIT_CAPPED:
    "Your employer benefit is larger than the estimated cost, so it has been capped at the " +
    "cost. An employer cannot reimburse more than you spend.",
  NO_COST_DATA:
    "We do not have cost data for this adoption type yet. Nothing is being estimated at " +
    "zero — we simply do not have the figures, and we would rather say so.",
};

function note(code: NoteCode): Note {
  return { code, message: NOTE_MESSAGES[code] };
}

/**
 * The fallback banner, named down to the adoption type.
 *
 * Coverage is per (state, adoption type), so a family can get Florida's real
 * foster-care figures and then national figures for private domestic infant on the
 * next run. A bare "we don't have Florida data" would read as a contradiction; naming
 * the path makes it obviously consistent.
 */
function nationalFallbackNote(state: string, adoptionType: AdoptionType): Note {
  const path = ADOPTION_TYPE_LABELS[adoptionType].toLowerCase();
  return {
    code: "NATIONAL_FALLBACK",
    message:
      `We do not have ${state}-specific cost data for ${path} yet, so these figures are ` +
      `national ranges from the Children's Bureau. Your state's actual fees may differ.`,
  };
}

// ----- the entry point --------------------------------------------------------

export function calculate(inputs: CalcInputs, tables: CalcTables): CalcResult {
  const band = bandFor(inputs.incomeBand);
  const notes: Note[] = [];

  const wantsBothBranches = inputs.specialNeeds === "unknown";
  const primarySpecialNeeds = inputs.specialNeeds === "yes";

  const primary = buildBranch(tables, inputs, inputs.adoptionType, primarySpecialNeeds, band);

  const branches = wantsBothBranches
    ? {
        specialNeedsYes: buildBranch(tables, inputs, inputs.adoptionType, true, band),
        specialNeedsNo: buildBranch(tables, inputs, inputs.adoptionType, false, band),
      }
    : null;

  // The comparison rail runs unconditionally. When a family has selected private
  // domestic and the foster number is a fraction of it, that comparison is the most
  // useful thing on the page.
  const comparisonFosterCare =
    inputs.adoptionType === "foster_care"
      ? null
      : buildBranch(tables, inputs, "foster_care", primarySpecialNeeds, band);

  const ongoing = buildOngoing(tables, inputs, primarySpecialNeeds || wantsBothBranches);

  // ----- notes ---------------------------------------------------------------
  if (primary.usedNationalFallback && primary.lineItems.length > 0) {
    notes.push(nationalFallbackNote(inputs.state, inputs.adoptionType));
  }
  if (primary.lineItems.length === 0) {
    notes.push(note("NO_COST_DATA"));
  }
  if (wantsBothBranches) {
    notes.push(note("SPECIAL_NEEDS_UNKNOWN"));
  }
  if (primary.taxCredit.phaseoutFactor === 0) {
    notes.push(note("CREDIT_ZERO_PHASEOUT"));
  } else if (primary.taxCredit.phaseoutFactor < 1) {
    notes.push(note("CREDIT_PARTIAL_PHASEOUT"));
  }
  if (
    primary.taxCredit.estimatedLiability === 0 &&
    primary.taxCredit.total.high > primary.taxCredit.refundable.high
  ) {
    notes.push(note("NON_REFUNDABLE_WORTHLESS"));
  }
  if (primary.taxCreditAtBandEdges) {
    notes.push(note("BAND_STRADDLES_THRESHOLD"));
  }
  if (inputs.adoptionType === "international") {
    notes.push(note("INTERNATIONAL_NO_SUBSIDY"));
  }
  if (inputs.adoptionType === "relative_kinship" || inputs.adoptionType === "stepparent") {
    notes.push(note("KINSHIP_NO_AGENCY_FEES"));
  }
  if (
    inputs.employerBenefitCents > 0 &&
    primary.employerBenefitApplied.high < inputs.employerBenefitCents
  ) {
    notes.push(note("EMPLOYER_BENEFIT_CAPPED"));
  }

  // ----- poverty guideline readout -------------------------------------------
  let fplPercent: Range | null = null;
  if (tables.fpl) {
    const size = Math.min(inputs.householdSize, tables.fpl.maxSize);
    if (size < inputs.householdSize) notes.push(note("HOUSEHOLD_SIZE_CLAMPED"));
    const guideline = tables.fpl.bySize[size];
    if (guideline && guideline > 0) {
      const highIncome = band.highCents ?? band.lowCents;
      fplPercent = {
        low: Math.round((band.lowCents / guideline) * 100),
        high: Math.round((highIncome / guideline) * 100),
      };
    }
  }

  return {
    asOfYear: tables.taxYear,
    state: inputs.state,
    adoptionType: inputs.adoptionType,
    incomeBand: inputs.incomeBand,
    usedNationalFallback: primary.usedNationalFallback,
    primary,
    branches,
    comparisonFosterCare,
    ongoing,
    timeline: buildTimeline(inputs.adoptionType, tables.taxYear),
    fplPercent,
    notes,
    disclaimer:
      `Estimate based on publicly available ${tables.taxYear} figures. ` +
      `Not tax, legal, or financial advice.`,
  };
}

/** Plain-English reading of the headline number, for the sentence under it. */
export function headlineSentence(result: CalcResult): string {
  const b = result.primary;
  const typeLabel = ADOPTION_TYPE_LABELS[result.adoptionType].toLowerCase();

  if (isZeroRange(b.cashUpFront)) {
    return (
      `Based on ${result.asOfYear} figures, ${typeLabel} in ${result.state} looks like it ` +
      `costs you nothing up front — the fees are waived or reimbursed on this path.`
    );
  }

  const gap =
    b.taxCredit.usable.high > 0
      ? " Remember the credit arrives when you file taxes for the year the adoption " +
        "finalizes, which can be 12 to 18 months after the money leaves."
      : "";

  return (
    `This is what you would need to find before the adoption is finalized. ` +
    `Anything that comes back later is shown separately.${gap}`
  );
}

export { subtractRange, addRange, representativeIncome, straddlesThreshold };
