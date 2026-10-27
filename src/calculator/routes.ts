/**
 * Financial Calculator API (Step 4).
 *
 *   POST /api/calculator/estimate            — run an estimate (nothing is stored)
 *   POST /api/calculator/save                — append a versioned saved estimate
 *   GET  /api/calculator/results             — the user's saved versions
 *   GET  /api/calculator/results/:v/pdf      — one saved version as a PDF download
 *
 * PRIVACY, and it is the reason several choices here look unusual:
 *
 *  - `/estimate` is a POST even though it reads nothing and changes nothing. A GET
 *    would put a family's income band and household size into the URL, the access
 *    log, and the browser history. It does not go in a URL.
 *  - Every response is `no-store`.
 *  - Income is only ever a BAND. No exact figure is accepted, computed with, or saved.
 *  - Nothing here emails anyone. Every other step in this codebase notifies the team
 *    inbox; this one deliberately does not. An agency must never see a family's
 *    income screen, and that inbox is shared.
 *
 * This is a reality check, never a gate: no endpoint returns a score or an
 * eligibility verdict, and nothing here can block any other step.
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth";
import { doubleCsrfProtection } from "../middleware/security";
import type { User } from "../db/users";
import {
  findResult,
  listResults,
  loadTables,
  saveResult,
} from "../db/calculator";
import { calculate, headlineSentence } from "./calculate";
import { renderResultPdf } from "./pdf";
import {
  ADOPTION_TYPE_LABELS,
  FILING_STATUS_LABELS,
  INCOME_BANDS,
  type CalcInputs,
  type CalcResult,
} from "./types";

export const calculatorRouter = Router();

const calcLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 60, // generous: one estimate is one call, well above normal interactive use
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many estimates. Please slow down and try again shortly." },
});

/** $1,000,000 — far above any real employer adoption benefit, and bounds the input. */
const MAX_EMPLOYER_BENEFIT_CENTS = 100_000_000;

const inputSchema = z.object({
  state: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Select your state."),
  // HavenLink only works with foster care and intercountry adoption. The engine and
  // seed data still know the other types (the tests use them), but no request can
  // reach them.
  adoptionType: z.enum(["foster_care", "international"]),
  householdSize: z.coerce.number().int().min(1).max(12),
  incomeBand: z.enum([
    "under_30k",
    "30k_50k",
    "50k_75k",
    "75k_100k",
    "100k_150k",
    "150k_200k",
    "200k_250k",
    "250k_300k",
    "300k_plus",
  ]),
  filingStatus: z.enum(["single", "married_joint", "married_separate", "head_of_household"]),
  employerBenefitCents: z.coerce
    .number()
    .int()
    .min(0)
    .max(MAX_EMPLOYER_BENEFIT_CENTS)
    .default(0),
  militaryStatus: z.coerce.boolean().default(false),
  specialNeeds: z.enum(["yes", "no", "unknown"]).default("unknown"),
});

export type CalculatorInputPayload = z.infer<typeof inputSchema>;

/** The tax year to compute against. The only clock read in the whole feature. */
function currentTaxYear(): number {
  return new Date().getUTCFullYear();
}

/**
 * Validate, load the reference tables, and run the pure calculation. Shared by
 * /estimate and /save so a saved result can never diverge from a shown one — /save
 * recomputes from the inputs rather than trusting a client-supplied result.
 */
async function computeFor(
  body: unknown
): Promise<
  | { ok: true; inputs: CalcInputs; result: CalcResult }
  | { ok: false; status: number; error: string; code: string; details?: unknown }
> {
  const parsed = inputSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      error: "Some answers are missing or out of range. Please check the form.",
      code: "INVALID_INPUT",
      details: parsed.error.issues.map((i) => ({
        field: i.path.join("."),
        message: i.message,
      })),
    };
  }

  const inputs: CalcInputs = { ...parsed.data, taxYear: currentTaxYear() };
  const tables = await loadTables(inputs.state, inputs.taxYear);

  // No tax constants means no honest credit figure. Say the calculator is
  // unavailable rather than quietly returning $0 — a silent zero here is the exact
  // failure mode the spec warns about.
  if (!tables) {
    return {
      ok: false,
      status: 503,
      error:
        "The calculator's reference data has not been loaded yet. Please try again shortly.",
      code: "NO_REFERENCE_DATA",
    };
  }

  return { ok: true, inputs, result: calculate(inputs, tables) };
}

/** What the client renders. Labels ship with it so the page needs no lookup tables. */
function estimatePayload(inputs: CalcInputs, result: CalcResult) {
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

// ----- POST /api/calculator/estimate -----------------------------------------
calculatorRouter.post(
  "/estimate",
  requireAuth,
  calcLimiter,
  doubleCsrfProtection,
  async (req, res) => {
    try {
      const outcome = await computeFor(req.body);
      res.set("Cache-Control", "no-store");

      if (!outcome.ok) {
        return res.status(outcome.status).json({
          error: outcome.error,
          code: outcome.code,
          details: outcome.details,
        });
      }

      return res.json(estimatePayload(outcome.inputs, outcome.result));
    } catch (error) {
      console.error(
        "Calculator estimate error:",
        error instanceof Error ? error.message : String(error)
      );
      return res.status(500).json({
        error: "Something went wrong running the estimate. Please try again.",
      });
    }
  }
);

// ----- POST /api/calculator/save ----------------------------------------------
calculatorRouter.post("/save", requireAuth, doubleCsrfProtection, async (req, res) => {
  try {
    const user = req.user as User | undefined;
    if (!user) return res.status(401).json({ error: "Authentication required" });

    // Recomputed server-side: a tampered client cannot persist a fabricated result.
    const outcome = await computeFor(req.body);
    res.set("Cache-Control", "no-store");

    if (!outcome.ok) {
      return res.status(outcome.status).json({
        error: outcome.error,
        code: outcome.code,
        details: outcome.details,
      });
    }

    // UNIQUE (user_id, version) makes a concurrent double-save collide rather than
    // silently overwrite; one retry covers the double-click case.
    let saved;
    try {
      saved = await saveResult(user.id, outcome.inputs, outcome.result);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        saved = await saveResult(user.id, outcome.inputs, outcome.result);
      } else {
        throw err;
      }
    }

    return res.json({
      success: true,
      version: saved.version,
      savedAt: saved.created_at,
      ...estimatePayload(outcome.inputs, outcome.result),
    });
  } catch (error) {
    console.error(
      "Calculator save error:",
      error instanceof Error ? error.message : String(error)
    );
    return res.status(500).json({
      error: "Failed to save your estimate. Please try again.",
    });
  }
});

// ----- GET /api/calculator/results ---------------------------------------------
calculatorRouter.get("/results", requireAuth, async (req, res) => {
  try {
    const user = req.user as User | undefined;
    if (!user) return res.status(401).json({ error: "Authentication required" });

    const rows = await listResults(user.id);
    res.set("Cache-Control", "no-store");
    return res.json({
      count: rows.length,
      results: rows.map((r) => ({
        version: r.version,
        savedAt: r.created_at,
        inputs: r.inputs,
        result: r.result,
      })),
    });
  } catch (error) {
    console.error(
      "Calculator results error:",
      error instanceof Error ? error.message : String(error)
    );
    return res.status(500).json({ error: "Failed to load your saved estimates." });
  }
});

// ----- GET /api/calculator/results/:version/pdf ---------------------------------
calculatorRouter.get("/results/:version/pdf", requireAuth, async (req, res) => {
  try {
    const user = req.user as User | undefined;
    if (!user) return res.status(401).json({ error: "Authentication required" });

    const version = Number(req.params.version);
    if (!Number.isInteger(version) || version < 1) {
      return res.status(400).json({ error: "Unknown estimate." });
    }

    // Scoped by user_id in the SQL predicate: guessing another account's version
    // number returns nothing, not someone else's income screen.
    const saved = await findResult(user.id, version);
    if (!saved) return res.status(404).json({ error: "Estimate not found." });

    res.set("Cache-Control", "no-store");
    res.set("Content-Type", "application/pdf");
    res.set(
      "Content-Disposition",
      `attachment; filename="havenlink-adoption-estimate-v${version}.pdf"`
    );

    renderResultPdf(
      res,
      saved.result as CalcResult,
      saved.inputs as CalcInputs,
      version,
      saved.created_at
    );
  } catch (error) {
    console.error(
      "Calculator PDF error:",
      error instanceof Error ? error.message : String(error)
    );
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to build the PDF. Please try again." });
    }
  }
});
