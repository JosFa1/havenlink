/**
 * The Tide Plate — reconciliation tests.
 *
 * public/adopt/tide-plate.js has no build step, so it is loaded here into a bare
 * VM context and exercised against REAL calculate() output built from the
 * committed seed data. The one thing these tests exist to guarantee is that the
 * graphic can never contradict the headline figure:
 *
 *   trough  === branch.gross
 *   plateau === branch.cashUpFront
 *   final   === branch.netAfterCredits
 *
 * That is not free. The server's range arithmetic uses a CROSSED interval
 * subtraction with a zero floor for reimbursements and an element-wise cap for
 * the employer benefit, so naively accumulating low and high costs disagrees with
 * cashUpFront at both ends. tide-plate.js accumulates only the money-out segment
 * — where the server is itself doing plain per-endpoint addition over the very
 * array the client receives — and reads every later level off the Branch.
 *
 * The sweep below covers every seeded (state × adoption type × special needs)
 * combination, so a bad phase mapping fails here rather than in front of a family.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { calculate } from "./calculate";
import { TAX_YEAR, buildTables } from "./testTables";
import type { AdoptionType, Branch, CalcInputs, CalcResult, Range, SpecialNeeds } from "./types";

interface TidePlate {
  events: {
    key: string;
    short: string;
    level: Range;
    deltaLow: number;
    deltaHigh: number;
    zero: { kind: string; text: string } | null;
    lines: string[];
  }[];
  trough: Range;
  plateau: Range;
  net: Range;
  depth: number;
  gapFrom: number;
  gapTo: number;
  tail: { monthly: Range | null; present: boolean };
}

function loadTide(): { derive: (r: CalcResult, b: Branch) => TidePlate | null } {
  const candidates = [
    path.join(process.cwd(), "public", "adopt", "tide-plate.js"),
    path.join(__dirname, "..", "..", "public", "adopt", "tide-plate.js"),
  ];
  const file = candidates.find((c) => fs.existsSync(c));
  if (!file) throw new Error("public/adopt/tide-plate.js not found");

  const sandbox: { window: Record<string, unknown>; Intl: typeof Intl } = { window: {}, Intl };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, "utf8"), sandbox);
  return sandbox.window.HL_TIDE as { derive: (r: CalcResult, b: Branch) => TidePlate | null };
}

const TIDE = loadTide();

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

const eq = (a: Range, b: Range) => a.low === b.low && a.high === b.high;

const TYPES: AdoptionType[] = [
  "foster_care",
  "private_domestic_infant",
  "international",
  "relative_kinship",
  "stepparent",
];
const STATES = ["FL", "TX", "WY"]; // FL has state rows; TX and WY fall back to national
const NEEDS: SpecialNeeds[] = ["yes", "no", "unknown"];

// ---------------------------------------------------------------------------

test("the plate reconciles with the authoritative branch for every seeded combination", () => {
  let checked = 0;

  for (const state of STATES) {
    const tables = buildTables(state);
    for (const adoptionType of TYPES) {
      for (const specialNeeds of NEEDS) {
        for (const employerBenefitCents of [0, 4_000_000]) {
          for (const militaryStatus of [false, true]) {
            const result = calculate(
              inputs({ state, adoptionType, specialNeeds, employerBenefitCents, militaryStatus }),
              tables
            );
            const branch = result.primary;
            const label =
              `${state}/${adoptionType}/sn=${specialNeeds}` +
              `/emp=${employerBenefitCents}/mil=${militaryStatus}`;

            const plate = TIDE.derive(result, branch);
            assert.ok(plate, `derive() returned null for ${label} — the partition failed to reconcile`);

            // The three anchors that must never disagree with what the page prints.
            assert.ok(eq(plate.trough, branch.gross), `trough !== gross for ${label}`);
            assert.ok(
              eq(plate.plateau, branch.cashUpFront),
              `plateau !== cashUpFront for ${label}: ` +
                `${JSON.stringify(plate.plateau)} vs ${JSON.stringify(branch.cashUpFront)}`
            );
            assert.ok(eq(plate.net, branch.netAfterCredits), `net !== netAfterCredits for ${label}`);

            // Every timeline entry the server sent must have a level.
            assert.equal(
              plate.events.length,
              result.timeline.length,
              `dropped a timeline event for ${label}`
            );

            // A zero step must never print "$0" — it prints why it is zero.
            for (const ev of plate.events) {
              if (ev.deltaLow === 0 && ev.deltaHigh === 0) {
                assert.ok(ev.zero, `zero step ${ev.key} has no reason for ${label}`);
                assert.ok(
                  ev.lines.every((l) => !l.includes("$0")),
                  `zero step ${ev.key} printed "$0" for ${label}: ${JSON.stringify(ev.lines)}`
                );
              }
            }

            checked++;
          }
        }
      }
    }
  }

  assert.ok(checked >= 180, `expected a broad sweep, only checked ${checked}`);
});

test("the money-out segment is monotonic and the depth covers every level", () => {
  const tables = buildTables("TX");
  const result = calculate(inputs({ state: "TX", adoptionType: "international" }), tables);
  const plate = TIDE.derive(result, result.primary);
  assert.ok(plate);

  const outKeys = ["home_study", "agency_fees", "placement", "finalization"];
  let prev = { low: 0, high: 0 };
  for (const ev of plate.events) {
    if (!outKeys.includes(ev.key)) break;
    assert.ok(ev.level.low >= prev.low, `${ev.key} low went backwards`);
    assert.ok(ev.level.high >= prev.high, `${ev.key} high went backwards`);
    prev = ev.level;
  }
  for (const ev of plate.events) {
    assert.ok(plate.depth >= ev.level.low && plate.depth >= ev.level.high, "depth clips a level");
  }
});

test("the crossed reimbursement subtraction reaches the copy, not just the geometry", () => {
  // Military + international: the DoD reimbursement is "up to $2,000", and every
  // seeded one-time program has amount_low_cents = 0. So it moves the low-cost
  // boundary by the full ceiling and the high-cost boundary not at all — which
  // must read as "up to X back / or nothing", never as a range from zero.
  const tables = buildTables("TX");
  const result = calculate(
    inputs({ state: "TX", adoptionType: "international", specialNeeds: "no", militaryStatus: true }),
    tables
  );
  const plate = TIDE.derive(result, result.primary);
  assert.ok(plate);

  const reimb = plate.events.find((e) => e.key === "reimbursement");
  assert.ok(reimb, "no reimbursement event");
  assert.notEqual(reimb.deltaLow, reimb.deltaHigh, "the two boundaries should move differently");
  assert.ok(
    reimb.lines.some((l) => l.startsWith("up to ")),
    `expected an "up to ..." reading, got ${JSON.stringify(reimb.lines)}`
  );
  assert.ok(
    !reimb.lines.some((l) => l.includes("$0 –")),
    "a crossed subtraction must never be printed as a range starting at zero"
  );
});

test("the clamp case still reports the authoritative figure", () => {
  // FL foster care with special needs: gross {$0, $395} against a $1,000
  // reimbursement. Naive accumulation clamps to {$0, $0} and would print $0 under
  // a headline of "$0 – $395".
  const tables = buildTables("FL");
  const result = calculate(
    inputs({ state: "FL", adoptionType: "foster_care", specialNeeds: "yes" }),
    tables
  );
  const plate = TIDE.derive(result, result.primary);
  assert.ok(plate);
  assert.ok(eq(plate.plateau, result.primary.cashUpFront));
  assert.equal(plate.plateau.high, result.primary.gross.high, "the clamp swallowed the high end");
});

test("derive() withholds the graphic rather than drawing an unreconciled one", () => {
  const tables = buildTables("FL");
  const result = calculate(inputs(), tables);
  const tampered: Branch = { ...result.primary, gross: { low: 1, high: 2 } };
  assert.equal(
    TIDE.derive(result, tampered),
    null,
    "a branch whose gross does not match its line items must produce no plate"
  );
});
