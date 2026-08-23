/**
 * Financial Calculator — the spec's test fixtures.
 *
 * Run with `npm test` (compiles, then Node's built-in test runner). No test framework
 * is added; the repo has no test dependencies and this needs none.
 *
 * These exercise calculate() against the REAL committed seed data in
 * src/data/calculator/, not against invented numbers — so a bad seed edit fails here
 * rather than in front of a family. The tables are assembled by ./testTables, which
 * mirrors the two documented rules in src/db/calculator.ts (cost profiles
 * all-or-nothing per state+type; subsidies overridden per program key).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { calculate } from "./calculate";
import { TAX_YEAR, buildTables } from "./testTables";
import type { AdoptionType, CalcInputs } from "./types";

function inputs(over: Partial<CalcInputs> = {}): CalcInputs {
  return {
    state: "FL",
    adoptionType: "foster_care",
    householdSize: 3,
    incomeBand: "50k_75k",
    filingStatus: "married_joint",
    employerBenefitCents: 0,
    militaryStatus: false,
    specialNeeds: "unknown",
    taxYear: TAX_YEAR,
    ...over,
  };
}

const dollars = (cents: number) => cents / 100;
const codes = (r: ReturnType<typeof calculate>) => r.notes.map((n) => n.code);

// ---------------------------------------------------------------------------
// Fixture 1 — FL · foster_care · special_needs=yes · $60k · size 3
//   Expected: near-zero cash up front; the subsidy block is the dominant element.
// ---------------------------------------------------------------------------
test("FL foster care with special needs: near-zero cash up front, subsidy dominates", () => {
  const tables = buildTables("FL");
  const result = calculate(
    inputs({ adoptionType: "foster_care", specialNeeds: "yes", incomeBand: "50k_75k" }),
    tables
  );

  // Florida waives the home study and agency fee outright; only the court filing
  // fee can remain, and the agency may cover even that.
  assert.equal(result.primary.cashUpFront.low, 0);
  assert.ok(
    dollars(result.primary.cashUpFront.high) <= 400,
    `expected near-zero cash up front, got $${dollars(result.primary.cashUpFront.high)}`
  );

  // Credit more than covers it, so nothing is left after credits.
  assert.deepEqual(result.primary.netAfterCredits, { low: 0, high: 0 });

  // The subsidy block is the dominant element: monthly payment, Medicaid, tuition.
  assert.ok(result.ongoing.monthlySubsidy, "expected a monthly subsidy");
  assert.equal(result.ongoing.monthlySubsidy?.low, 41667);
  assert.ok(result.ongoing.medicaid, "expected Medicaid");
  assert.ok(result.ongoing.tuitionWaiver, "expected a tuition waiver");
  assert.equal(result.ongoing.explanation, null);

  // Florida is seeded, so no fallback banner.
  assert.equal(result.usedNationalFallback, false);
  assert.ok(!codes(result).includes("NATIONAL_FALLBACK"));

  // Recurring income is never netted against cost.
  assert.ok(
    result.primary.cashUpFront.high < 41667 * 12,
    "monthly subsidy must not be netted into the cost figures"
  );
});

// ---------------------------------------------------------------------------
// Fixture 2 — income above the phase-out.
//
// NOTE ON THE SPEC: the written fixture said "$200k -> credit = 0". That was true
// under older thresholds. For tax year 2026 the phase-out runs $265,080-$305,080
// (Rev. Proc. 2025-32), so $200k receives the FULL credit. Both cases are asserted
// here: $200k gets the full credit, and the top band gets zero.
// ---------------------------------------------------------------------------
test("income above the phase-out: credit is zero and said plainly", () => {
  const tables = buildTables("FL");
  const result = calculate(
    inputs({
      adoptionType: "private_domestic_infant",
      specialNeeds: "no",
      incomeBand: "300k_plus",
    }),
    tables
  );

  // The headline figure reports from the end of the phase-out, never from the
  // band floor — quoting a $600k family the $300k answer would overstate.
  assert.equal(result.primary.taxCredit.phaseoutFactor, 0);
  assert.deepEqual(result.primary.taxCredit.total, { low: 0, high: 0 });
  assert.deepEqual(result.primary.taxCredit.usable, { low: 0, high: 0 });

  // Stated plainly in the notes, not buried in the math drawer.
  assert.ok(codes(result).includes("CREDIT_ZERO_PHASEOUT"));

  // The open band still crosses the phase-out end, so both edges are shown: a
  // family right at $300,000 does keep a sliver of credit.
  assert.ok(result.primary.taxCreditAtBandEdges);
  assert.ok(result.primary.taxCreditAtBandEdges!.low.phaseoutFactor > 0);
  assert.equal(result.primary.taxCreditAtBandEdges!.high.phaseoutFactor, 0);

  // And the cash figure is high — the national private-agency range.
  assert.ok(dollars(result.primary.cashUpFront.low) >= 30000);
  assert.ok(dollars(result.primary.cashUpFront.high) >= 60000 - 1);
});

test("$200k under 2026 thresholds is below the phase-out and keeps the full credit", () => {
  const tables = buildTables("FL");
  const result = calculate(
    inputs({
      adoptionType: "private_domestic_infant",
      specialNeeds: "no",
      incomeBand: "200k_250k",
    }),
    tables
  );

  assert.equal(result.primary.taxCredit.phaseoutFactor, 1);
  assert.equal(result.primary.taxCredit.total.high, tables.tax.federalCreditMax);
  assert.ok(!codes(result).includes("CREDIT_ZERO_PHASEOUT"));
});

// ---------------------------------------------------------------------------
// Fixture 3 — FL · private_domestic_infant · $85k
//   Expected: full credit; the timeline shows the gap between spend and refund.
// ---------------------------------------------------------------------------
test("private domestic infant at $85k: full credit, timeline shows the spend/refund gap", () => {
  const tables = buildTables("FL");
  const result = calculate(
    inputs({
      adoptionType: "private_domestic_infant",
      specialNeeds: "no",
      incomeBand: "75k_100k",
    }),
    tables
  );

  // No phase-out at this income, and expenses far exceed the cap, so the credit
  // is the statutory maximum.
  assert.equal(result.primary.taxCredit.phaseoutFactor, 1);
  assert.equal(result.primary.taxCredit.total.low, tables.tax.federalCreditMax);
  assert.equal(result.primary.taxCredit.refundable.low, tables.tax.refundableCap);

  // Real money still needed up front.
  assert.ok(dollars(result.primary.cashUpFront.low) >= 30000);

  // The timeline must show money going out AND coming back, with the credit
  // landing in the following calendar year.
  const out = result.timeline.filter((t) => t.direction === "out");
  const back = result.timeline.filter((t) => t.direction === "back");
  assert.ok(out.length >= 3, "expected the money-out sequence");
  assert.ok(back.length >= 2, "expected the money-back sequence");
  const credit = result.timeline.find((t) => t.key === "tax_credit");
  assert.ok(credit);
  assert.match(credit!.when, new RegExp(String(TAX_YEAR + 1)));
});

// ---------------------------------------------------------------------------
// Fixture 4 — TX · international · $120k
//   Expected: immigration fees present; the subsidy block carries an explanation,
//   not a blank.
// ---------------------------------------------------------------------------
test("TX international: immigration fees itemized, subsidy block explained not blank", () => {
  const tables = buildTables("TX");
  const result = calculate(
    inputs({
      state: "TX",
      adoptionType: "international",
      specialNeeds: "no",
      incomeBand: "100k_150k",
    }),
    tables
  );

  const items = result.primary.lineItems.map((i) => i.lineItem);
  assert.ok(items.includes("uscis_i800a"), "expected the I-800A fee");
  assert.ok(items.includes("uscis_i800"), "expected the I-800 fee");
  assert.ok(items.includes("uscis_biometrics"), "expected the biometrics fee");

  // The block is empty of programs but NOT silent about why.
  assert.equal(result.ongoing.monthlySubsidy, null);
  assert.equal(result.ongoing.programs.length, 0);
  assert.ok(result.ongoing.explanation, "an empty subsidy block must explain itself");
  assert.match(result.ongoing.explanation!, /intercountry/i);
  assert.ok(codes(result).includes("INTERNATIONAL_NO_SUBSIDY"));

  // Every line item carries its source and vintage — the math drawer contract.
  for (const item of result.primary.lineItems) {
    assert.match(item.sourceUrl, /^https:\/\//);
    assert.ok(item.effectiveYear >= 2020);
  }
});

// ---------------------------------------------------------------------------
// Fixture 5 — WY (no seeded data)
//   Expected: national fallback + banner. No crash, no silent zeroes.
// ---------------------------------------------------------------------------
test("unseeded state falls back to national ranges with a banner and no silent zeroes", () => {
  const tables = buildTables("WY");
  const result = calculate(
    inputs({ state: "WY", adoptionType: "private_domestic_infant", specialNeeds: "no" }),
    tables
  );

  assert.equal(result.usedNationalFallback, true);
  assert.ok(codes(result).includes("NATIONAL_FALLBACK"));

  // The critical anti-pattern: a missing state must not read as "$0".
  assert.ok(result.primary.lineItems.length > 0, "fallback must supply line items");
  assert.ok(result.primary.gross.high > 0, "fallback must not produce a silent zero");
  assert.ok(result.primary.cashUpFront.high > 0);
});

test("every adoption type resolves for an unseeded state without throwing", () => {
  const tables = buildTables("WY");
  const types: AdoptionType[] = [
    "foster_care",
    "private_domestic_infant",
    "international",
    "relative_kinship",
    "stepparent",
  ];
  for (const adoptionType of types) {
    const result = calculate(inputs({ state: "WY", adoptionType }), tables);
    assert.ok(result.primary.lineItems.length > 0, `${adoptionType} produced no line items`);
    assert.ok(result.disclaimer.includes(String(TAX_YEAR)));
  }
});

// ---------------------------------------------------------------------------
// Fixture 6 — special_needs = unknown
//   Expected: both branches rendered side by side.
// ---------------------------------------------------------------------------
test("special needs unknown returns both branches side by side", () => {
  const tables = buildTables("FL");
  const result = calculate(
    inputs({ adoptionType: "foster_care", specialNeeds: "unknown" }),
    tables
  );

  assert.ok(result.branches, "expected both branches");
  assert.equal(result.branches!.specialNeedsYes.specialNeeds, true);
  assert.equal(result.branches!.specialNeedsNo.specialNeeds, false);

  // The fork must actually change the answer, or showing both is pointless. On
  // Florida foster care the cash figures happen to converge (both near zero) —
  // the fork shows up in the credit, which a special-needs adoption claims in
  // full regardless of what was spent.
  const yes = result.branches!.specialNeedsYes;
  const no = result.branches!.specialNeedsNo;
  assert.equal(yes.taxCredit.total.high, tables.tax.federalCreditMax);
  assert.ok(
    no.taxCredit.total.high < yes.taxCredit.total.high,
    "without a special-needs determination the credit is limited to actual expenses"
  );
  assert.ok(yes.reimbursements.high > no.reimbursements.high);
  assert.ok(codes(result).includes("SPECIAL_NEEDS_UNKNOWN"));
});

// ---------------------------------------------------------------------------
// Cross-cutting rules
// ---------------------------------------------------------------------------
test("the foster-care comparison rail is computed on every non-foster run", () => {
  const tables = buildTables("FL");
  const result = calculate(
    inputs({ adoptionType: "private_domestic_infant", specialNeeds: "no" }),
    tables
  );

  assert.ok(result.comparisonFosterCare, "the comparison rail is always visible");
  assert.ok(
    result.comparisonFosterCare!.cashUpFront.high < result.primary.cashUpFront.high,
    "foster care should be the cheaper path here — that comparison is the point"
  );

  // On a foster-care run there is nothing to compare against.
  const fosterRun = calculate(inputs({ adoptionType: "foster_care" }), tables);
  assert.equal(fosterRun.comparisonFosterCare, null);
});

test("a band straddling a phase-out threshold returns both edge outcomes", () => {
  const tables = buildTables("FL");
  // $250k-$300k spans the $265,080 phase-out start.
  const result = calculate(
    inputs({
      adoptionType: "private_domestic_infant",
      specialNeeds: "no",
      incomeBand: "250k_300k",
    }),
    tables
  );

  assert.ok(result.primary.taxCreditAtBandEdges, "expected both edges");
  const { low, high } = result.primary.taxCreditAtBandEdges!;
  assert.equal(low.phaseoutFactor, 1, "bottom of the band is below the threshold");
  assert.ok(high.phaseoutFactor < 1, "top of the band is inside the phase-out");
  assert.ok(high.total.high < low.total.high, "the credit shrinks across the band");
  assert.ok(codes(result).includes("BAND_STRADDLES_THRESHOLD"));
});

test("a band wholly below the phase-out does not report a straddle", () => {
  const tables = buildTables("FL");
  const result = calculate(inputs({ incomeBand: "50k_75k", specialNeeds: "no" }), tables);
  assert.equal(result.primary.taxCreditAtBandEdges, null);
  assert.ok(!codes(result).includes("BAND_STRADDLES_THRESHOLD"));
});

test("household size above the poverty table clamps and says so", () => {
  const tables = buildTables("FL");
  const big = calculate(inputs({ householdSize: 20 }), tables);
  assert.ok(codes(big).includes("HOUSEHOLD_SIZE_CLAMPED"));
  assert.ok(big.fplPercent, "still produces a percentage rather than nothing");

  const normal = calculate(inputs({ householdSize: 3 }), tables);
  assert.ok(!codes(normal).includes("HOUSEHOLD_SIZE_CLAMPED"));
});

test("near-zero income: the non-refundable portion is called out as worthless", () => {
  const tables = buildTables("FL");
  const result = calculate(
    inputs({
      adoptionType: "private_domestic_infant",
      specialNeeds: "no",
      incomeBand: "under_30k",
      filingStatus: "married_joint",
    }),
    tables
  );

  // Standard deduction ($32,200 MFJ) exceeds the band midpoint, so no tax is owed.
  assert.equal(result.primary.taxCredit.estimatedLiability, 0);
  assert.deepEqual(result.primary.taxCredit.nonRefundableUsable, { low: 0, high: 0 });
  // Only the refundable portion is worth anything, and it is.
  assert.equal(result.primary.taxCredit.usable.high, tables.tax.refundableCap);
  assert.ok(result.primary.taxCredit.nonRefundableCarryforward.high > 0);
  assert.ok(codes(result).includes("NON_REFUNDABLE_WORTHLESS"));
});

test("kinship and stepparent paths never show private-infant agency fees", () => {
  const tables = buildTables("FL");
  for (const adoptionType of ["relative_kinship", "stepparent"] as AdoptionType[]) {
    const result = calculate(inputs({ adoptionType, specialNeeds: "no" }), tables);
    const labels = result.primary.lineItems.map((i) => i.lineItem);
    assert.ok(
      !labels.includes("agency_program_fee"),
      `${adoptionType} must not carry an agency program fee`
    );
    assert.ok(dollars(result.primary.gross.high) < 30000);
    assert.ok(codes(result).includes("KINSHIP_NO_AGENCY_FEES"));
  }
});

test("an employer benefit larger than the cost is capped, not turned into a refund", () => {
  const tables = buildTables("FL");
  const result = calculate(
    inputs({
      adoptionType: "foster_care",
      specialNeeds: "no",
      employerBenefitCents: 5_000_000, // $50,000 against a sub-$400 Florida cost
    }),
    tables
  );

  assert.equal(result.primary.cashUpFront.low, 0);
  assert.equal(result.primary.cashUpFront.high, 0);
  assert.ok(result.primary.employerBenefitApplied.high <= result.primary.gross.high);
  assert.ok(codes(result).includes("EMPLOYER_BENEFIT_CAPPED"));
});

test("military status unlocks the DoD reimbursement on any path", () => {
  const tables = buildTables("WY");
  const civilian = calculate(
    inputs({ state: "WY", adoptionType: "private_domestic_infant", specialNeeds: "no" }),
    tables
  );
  const military = calculate(
    inputs({
      state: "WY",
      adoptionType: "private_domestic_infant",
      specialNeeds: "no",
      militaryStatus: true,
    }),
    tables
  );

  assert.equal(civilian.primary.reimbursements.high, 0);
  assert.equal(military.primary.reimbursements.high, 200000);
  assert.ok(military.primary.cashUpFront.low < civilian.primary.cashUpFront.low);
});

test("every result carries a range and an as-of stamp, and never a gate", () => {
  const tables = buildTables("FL");
  const result = calculate(inputs(), tables);

  assert.equal(result.asOfYear, TAX_YEAR);
  assert.match(result.disclaimer, /Not tax, legal, or financial advice/);
  assert.match(result.disclaimer, new RegExp(String(TAX_YEAR)));

  // Ranges everywhere, low never above high.
  for (const r of [
    result.primary.gross,
    result.primary.cashUpFront,
    result.primary.netAfterCredits,
    result.primary.taxCredit.total,
    result.primary.taxCredit.usable,
  ]) {
    assert.ok(r.low <= r.high, `inverted range: ${r.low}..${r.high}`);
    assert.ok(Number.isInteger(r.low) && Number.isInteger(r.high), "money must be integer cents");
  }

  // No score, no verdict, no eligibility flag anywhere in the payload.
  const serialized = JSON.stringify(result);
  for (const forbidden of ["\"score\"", "\"eligible\"", "\"qualified\"", "\"passed\""]) {
    assert.ok(!serialized.includes(forbidden), `result must not contain ${forbidden}`);
  }
});
