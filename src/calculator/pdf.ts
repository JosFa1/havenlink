/**
 * Renders a saved estimate to a PDF, streamed straight to the response.
 *
 * Deliberately plain: PDFKit's built-in Helvetica (no font files to ship, works in
 * the slim runtime image), black text, no images, no colour. This is a document a
 * family takes to a bank, an employer, or a spouse — legibility beats styling.
 *
 * The three contracts from the spec are enforced here as much as on screen:
 *   - never a number without its range
 *   - never a range without its "as of [year]" stamp
 *   - every result carries the disclaimer
 *
 * It also carries the source URL and effective year for every line item, so the
 * printed copy is as auditable as the "show me the math" drawer.
 */
import PDFDocument from "pdfkit";
import type { Writable } from "stream";
import {
  ADOPTION_TYPE_LABELS,
  FILING_STATUS_LABELS,
  INCOME_BANDS,
  type Branch,
  type CalcInputs,
  type CalcResult,
  type Range,
} from "./types";

const MARGIN = 54; // 0.75in
const RULE_GAP = 10;

function money(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

/**
 * Never a bare number: a point value still prints as an explicit single figure.
 * ASCII hyphen rather than an en-dash — PDFKit's built-in Helvetica is WinAnsi, and
 * staying inside ASCII keeps the text extractable by any downstream reader.
 */
function moneyRange(r: Range): string {
  if (r.low === r.high) return money(r.low);
  return `${money(r.low)} - ${money(r.high)}`;
}

export function renderResultPdf(
  out: Writable,
  result: CalcResult,
  inputs: CalcInputs,
  version: number,
  savedAt: Date | string
): void {
  const doc = new PDFDocument({ size: "LETTER", margin: MARGIN });
  doc.pipe(out);

  const width = doc.page.width - MARGIN * 2;

  const rule = () => {
    doc.moveDown(0.4);
    doc
      .moveTo(MARGIN, doc.y)
      .lineTo(doc.page.width - MARGIN, doc.y)
      .lineWidth(0.5)
      .strokeColor("#999999")
      .stroke();
    doc.moveDown(0.6);
  };

  /**
   * Every writer below re-anchors at the left margin before and after it writes.
   * PDFKit remembers the last explicit x as the left edge for subsequent flowing
   * text, so a two-column row() would otherwise drag every following heading and
   * paragraph into the right-hand column.
   */
  const heading = (text: string) => {
    if (doc.y > doc.page.height - 140) doc.addPage();
    doc.moveDown(0.5);
    doc
      .font("Helvetica-Bold")
      .fontSize(12)
      .fillColor("#000000")
      .text(text, MARGIN, doc.y, { width });
    doc.x = MARGIN;
    doc.moveDown(0.3);
  };

  const body = (text: string, opts: { size?: number; gap?: number } = {}) => {
    doc
      .font("Helvetica")
      .fontSize(opts.size ?? 10)
      .fillColor("#000000")
      .text(text, MARGIN, doc.y, { width, align: "left" });
    doc.x = MARGIN;
    if (opts.gap !== 0) doc.moveDown(0.35);
  };

  const LABEL_W = width * 0.6;
  const VALUE_X = MARGIN + width * 0.62;
  const VALUE_W = width * 0.38;

  const row = (label: string, value: string, bold = false) => {
    if (doc.y > doc.page.height - 100) doc.addPage();
    const font = bold ? "Helvetica-Bold" : "Helvetica";
    const y = doc.y;

    doc.font(font).fontSize(10).fillColor("#000000").text(label, MARGIN, y, {
      width: LABEL_W,
    });
    const labelBottom = doc.y;

    doc.font(font).fontSize(10).text(value, VALUE_X, y, {
      width: VALUE_W,
      align: "right",
    });

    doc.x = MARGIN;
    doc.y = Math.max(labelBottom, doc.y);
    doc.moveDown(0.2);
  };

  // ----- header ---------------------------------------------------------------
  doc.font("Helvetica-Bold").fontSize(18).text("HavenLink - Adoption Cost Estimate", MARGIN, doc.y, { width });
  doc.x = MARGIN;
  doc.moveDown(0.2);
  const saved = typeof savedAt === "string" ? new Date(savedAt) : savedAt;
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor("#444444")
    .text(
      `Version ${version}  |  saved ${saved.toISOString().slice(0, 10)}  |  ` +
        `figures as of ${result.asOfYear}`,
      MARGIN,
      doc.y,
      { width }
    );
  doc.x = MARGIN;
  rule();

  // ----- what we were told ----------------------------------------------------
  heading("What this estimate is based on");
  const bandLabel =
    INCOME_BANDS.find((b) => b.id === inputs.incomeBand)?.label ?? inputs.incomeBand;
  row("State", inputs.state);
  row("Adoption type", ADOPTION_TYPE_LABELS[inputs.adoptionType]);
  row("Household size", String(inputs.householdSize));
  row("Household income", bandLabel);
  row("Filing status", FILING_STATUS_LABELS[inputs.filingStatus]);
  row("Employer adoption benefit", money(inputs.employerBenefitCents));
  row("Military family", inputs.militaryStatus ? "Yes" : "No");
  row(
    "Special-needs determination",
    inputs.specialNeeds === "unknown" ? "Not yet known" : inputs.specialNeeds === "yes" ? "Yes" : "No"
  );

  // ----- the headline ---------------------------------------------------------
  const b = result.primary;
  heading("Cash you would need up front");
  doc.font("Helvetica-Bold").fontSize(20).text(moneyRange(b.cashUpFront), MARGIN, doc.y, { width });
  doc.x = MARGIN;
  doc.moveDown(0.3);
  body(
    `This is what has to be found before the adoption is finalized, after any employer ` +
      `benefit and one-time reimbursements. Figures are ${result.asOfYear} estimates.`
  );

  if (result.usedNationalFallback) {
    body(
      `Note: we do not have ${result.state}-specific cost data yet, so these are national ` +
        `ranges. Your state's actual fees may differ.`
    );
  }

  // ----- the three blocks -----------------------------------------------------
  heading("What it costs / what comes back / what you actually pay");
  row("Gross cost", moneyRange(b.gross));
  if (b.employerBenefitApplied.high > 0) {
    row("Less employer adoption benefit", `- ${moneyRange(b.employerBenefitApplied)}`);
  }
  if (b.reimbursements.high > 0) {
    row("Less one-time reimbursements", `- ${moneyRange(b.reimbursements)}`);
  }
  row("Cash needed up front", moneyRange(b.cashUpFront), true);
  doc.moveDown(0.3);

  row("Federal adoption tax credit (after phase-out)", moneyRange(b.taxCredit.total));
  row("  of which refundable", moneyRange(b.taxCredit.refundable));
  row("  of which usable against tax owed", moneyRange(b.taxCredit.nonRefundableUsable));
  if (b.taxCredit.nonRefundableCarryforward.high > 0) {
    row(
      "  carried forward (up to 5 years)",
      moneyRange(b.taxCredit.nonRefundableCarryforward)
    );
  }
  if (b.taxCredit.stateCredit) {
    row(`  ${b.taxCredit.stateCreditName ?? "State credit"}`, moneyRange(b.taxCredit.stateCredit));
  }
  row("What actually comes back", moneyRange(b.taxCredit.usable), true);
  doc.moveDown(0.3);
  row("Net cost after credits", moneyRange(b.netAfterCredits), true);

  if (b.taxCreditAtBandEdges) {
    doc.moveDown(0.2);
    body(
      `Your income band crosses a phase-out threshold, so both ends are shown rather than ` +
        `one guess: at the bottom of the band the credit is ` +
        `${moneyRange(b.taxCreditAtBandEdges.low.total)}, at the top it is ` +
        `${moneyRange(b.taxCreditAtBandEdges.high.total)}.`
    );
  }

  // ----- ongoing support ------------------------------------------------------
  heading("Ongoing support (not a discount on the cost above)");
  if (result.ongoing.explanation) {
    body(result.ongoing.explanation);
  }
  if (result.ongoing.monthlySubsidy) {
    row(
      result.ongoing.monthlySubsidyName ?? "Monthly subsidy",
      `${moneyRange(result.ongoing.monthlySubsidy)} per month`
    );
  }
  for (const program of result.ongoing.programs) {
    if (program.type === "monthly") continue;
    row(program.name, program.amountLow === null ? "Included" : moneyRange({
      low: program.amountLow,
      high: program.amountHigh ?? program.amountLow,
    }));
  }
  if (result.ongoing.programs.length > 0) {
    doc.moveDown(0.2);
    body(
      "Recurring income is deliberately not netted against the cost above. It arrives " +
        "monthly, after finalization - it does not reduce what you need up front."
    );
  }

  // ----- comparison rail ------------------------------------------------------
  if (result.comparisonFosterCare) {
    heading("The same family, adopting from foster care");
    row("Cash needed up front", moneyRange(result.comparisonFosterCare.cashUpFront));
    row("Net cost after credits", moneyRange(result.comparisonFosterCare.netAfterCredits));
  }

  // ----- both branches --------------------------------------------------------
  if (result.branches) {
    heading("Both special-needs outcomes");
    body(
      '"Special needs" is a legal and administrative category a state assigns, not a ' +
        "description of a child. It is the single largest factor in what adoption costs."
    );
    const pair = (label: string, branch: Branch) => {
      row(`${label} - cash up front`, moneyRange(branch.cashUpFront));
      row(`${label} - net after credits`, moneyRange(branch.netAfterCredits));
    };
    pair("If determined special needs", result.branches.specialNeedsYes);
    pair("If not", result.branches.specialNeedsNo);
  }

  // ----- timeline -------------------------------------------------------------
  heading("When the money moves");
  for (const entry of result.timeline) {
    row(`${entry.direction === "out" ? "OUT" : "BACK"}  ${entry.label}`, entry.when);
  }
  doc.moveDown(0.2);
  body(
    "The credit arrives when you file taxes for the year the adoption finalizes - often " +
      "12 to 18 months after the money leaves. If you have the money but no bridge " +
      "financing, that gap is the thing to plan around."
  );

  // ----- the math -------------------------------------------------------------
  heading("Show me the math");
  for (const item of b.lineItems) {
    row(item.label, `${moneyRange({ low: item.low, high: item.high })}  (${item.effectiveYear})`);
    doc.font("Helvetica").fontSize(7.5).fillColor("#555555").text(item.sourceUrl, MARGIN, doc.y, {
      width,
      link: item.sourceUrl,
    });
    doc.x = MARGIN;
    doc.fillColor("#000000");
    doc.moveDown(0.25);
  }
  for (const program of b.reimbursementPrograms) {
    row(`Reimbursement - ${program.name}`, `up to ${money(program.amount.high)}`);
    doc.font("Helvetica").fontSize(7.5).fillColor("#555555").text(program.sourceUrl, MARGIN, doc.y, {
      width,
      link: program.sourceUrl,
    });
    doc.x = MARGIN;
    doc.fillColor("#000000");
    doc.moveDown(0.25);
  }

  // ----- notes ----------------------------------------------------------------
  if (result.notes.length > 0) {
    heading("Things worth knowing");
    for (const n of result.notes) body(`- ${n.message}`);
  }

  // ----- disclaimer -----------------------------------------------------------
  rule();
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor("#000000")
    .text(result.disclaimer, MARGIN, doc.y, { width });
  doc.x = MARGIN;
  doc.moveDown(0.3);
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#444444")
    .text(
      "This is an estimate, not a quote and not a decision. HavenLink does not originate " +
        "loans, collect fees, or take referral payments. Confirm every figure with your " +
        "agency, your attorney, and a tax professional before you rely on it.",
      MARGIN,
      doc.y,
      { width }
    );

  doc.end();
}

export { moneyRange };
