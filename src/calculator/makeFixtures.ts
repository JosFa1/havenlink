/**
 * Dev-only: emit real estimate payloads to a JSON file.
 *
 * /adopt/calculator is auth-gated, so the front end cannot be driven from a
 * browser without a session. This produces genuine calculate() output from the
 * committed seed data — the exact shape POST /api/calculator/estimate returns —
 * so the page can be exercised against real numbers rather than invented ones.
 *
 *   npx ts-node src/calculator/makeFixtures.ts <outfile>
 *
 * Not imported by the app; nothing here runs in production.
 */
import fs from "node:fs";
import { calculate, headlineSentence } from "./calculate";
import { buildTables, TAX_YEAR } from "./testTables";
import {
  ADOPTION_TYPE_LABELS,
  FILING_STATUS_LABELS,
  INCOME_BANDS,
  type CalcInputs,
} from "./types";

function payloadFor(over: Partial<CalcInputs>) {
  const inputs: CalcInputs = {
    state: "FL",
    adoptionType: "private_domestic_infant",
    householdSize: 2,
    incomeBand: "75k_100k",
    filingStatus: "married_joint",
    employerBenefitCents: 0,
    militaryStatus: false,
    specialNeeds: "unknown",
    taxYear: TAX_YEAR,
    ...over,
  };
  const result = calculate(inputs, buildTables(inputs.state));
  return {
    inputs: {
      ...inputs,
      stateLabel: inputs.state,
      adoptionTypeLabel: ADOPTION_TYPE_LABELS[inputs.adoptionType],
      filingStatusLabel: FILING_STATUS_LABELS[inputs.filingStatus],
      incomeBandLabel:
        INCOME_BANDS.find((b) => b.id === inputs.incomeBand)?.label ?? inputs.incomeBand,
    },
    result,
    headline: headlineSentence(result),
  };
}

const fixtures = {
  /* The form's defaults: one line item, so most stages are $0. The commonest render. */
  default: payloadFor({}),
  /* Florida's own foster-care figures — the only combination that escapes the
     national fallback, and the one with a real monthly subsidy. */
  flFoster: payloadFor({ state: "FL", adoptionType: "foster_care", specialNeeds: "yes" }),
  /* The clamp case: gross {$0,$442} against a $1,000 reimbursement. */
  flFosterClamp: payloadFor({ state: "FL", adoptionType: "foster_care", specialNeeds: "yes",
    householdSize: 3, incomeBand: "50k_75k" }),
  /* The crossed subtraction: military reimbursement moves one boundary only. */
  txIntlMilitary: payloadFor({ state: "TX", adoptionType: "international",
    specialNeeds: "no", militaryStatus: true }),
  /* capRange: a typed $40,000 benefit becomes a RANGE against a {$30k,$60k} gross. */
  employerCapped: payloadFor({ state: "TX", employerBenefitCents: 4_000_000, specialNeeds: "no" }),
};

const out = process.argv[2];
if (!out) throw new Error("usage: makeFixtures <outfile>");
fs.writeFileSync(out, JSON.stringify(fixtures, null, 2));
console.log("wrote " + out);
for (const [k, v] of Object.entries(fixtures)) {
  const b = v.result.primary;
  console.log(
    `  ${k.padEnd(16)} gross ${b.gross.low / 100}-${b.gross.high / 100}` +
    `  cashUpFront ${b.cashUpFront.low / 100}-${b.cashUpFront.high / 100}` +
    `  lineItems ${b.lineItems.length}` +
    `  fallback=${v.result.usedNationalFallback}`
  );
}
