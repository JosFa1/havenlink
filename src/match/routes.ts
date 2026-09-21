/**
 * Compatibility-matching API for /adopt/matching.
 *
 *   GET  /api/match          — eligibility status + the stored confirmed match
 *   POST /api/match/roll     — offer a (new) candidate agency for the user's state
 *   POST /api/match/confirm  — finalize the offered candidate
 *
 * The candidate being offered lives in the session (`matchCandidate`), so a
 * user can only confirm an agency the server actually offered them. Partner
 * states never re-roll: roll is idempotent there and returns the same partner
 * until it is confirmed.
 */
import { Router } from "express";
import { config } from "../config";
import { sendEmail } from "../auth/email";
import { requireAuth } from "../middleware/requireAuth";
import { doubleCsrfProtection } from "../middleware/security";
import { recordMatch, type User } from "../db/users";
import {
  agenciesForState,
  findAgency,
  isPartnerState,
  type Agency,
} from "./agencies";
import { homeStudyComplete, matchEligible } from "./eligibility";
import { buildScore, matchTotal, scoreMatch, type MatchScore } from "./scoring";

export const matchRouter = Router();

function eligibilityPayload(user: User) {
  return {
    intakeCompleted: user.intake_completed,
    homeStudyComplete: homeStudyComplete(user),
    homeStudyResult: user.home_study_result,
  };
}

/**
 * The stored match, rendered for the client. The score total prefers the
 * audit copy written at confirmation time so the displayed number can never
 * drift from what the family confirmed (even if scoring bands are tuned
 * later); the factor split is rebuilt deterministically around it.
 */
function storedMatchPayload(user: User, agency: Agency) {
  const total = user.match_score ?? matchTotal(user.id, agency);
  const score: MatchScore = buildScore(user.id, agency.id, total);
  return {
    agency,
    score,
    matchedAt: user.matched_at ? user.matched_at.toISOString() : null,
  };
}

// ----- GET /api/match ---------------------------------------------------------
matchRouter.get("/", requireAuth, (req, res) => {
  const user = req.user as User | undefined;
  if (!user) return res.status(401).json({ error: "Authentication required" });

  res.set("Cache-Control", "no-store");
  const eligibility = eligibilityPayload(user);

  // A confirmed match always renders first — a later dataset or eligibility
  // change must never hide a match the family already made.
  if (user.matched_agency_id) {
    const agency = findAgency(user.matched_agency_id);
    if (agency) {
      return res.json({
        status: "matched",
        state: user.state,
        eligibility,
        partnerState: isPartnerState(user.state),
        match: storedMatchPayload(user, agency),
      });
    }
    // Dataset no longer knows this id (should not happen): still surface the
    // confirmation rather than pretending the user is unmatched.
    return res.json({
      status: "matched",
      state: user.state,
      eligibility,
      partnerState: isPartnerState(user.state),
      match: {
        agency: null,
        score: null,
        matchedAt: user.matched_at ? user.matched_at.toISOString() : null,
      },
    });
  }

  if (!matchEligible(user)) {
    return res.json({ status: "ineligible", state: user.state, eligibility });
  }

  const pool = agenciesForState(user.state);
  if (pool.length === 0) {
    return res.json({ status: "unsupported", state: user.state, eligibility });
  }

  return res.json({
    status: "ready",
    state: user.state,
    eligibility,
    partnerState: isPartnerState(user.state),
    poolSize: pool.length,
  });
});

// ----- POST /api/match/roll -----------------------------------------------------
matchRouter.post("/roll", requireAuth, doubleCsrfProtection, (req, res) => {
  const user = req.user as User | undefined;
  if (!user) return res.status(401).json({ error: "Authentication required" });

  if (!matchEligible(user)) {
    return res.status(403).json({
      error: "Complete the intake form and home study before matching.",
      code: "INELIGIBLE",
    });
  }
  if (user.matched_agency_id) {
    return res.status(409).json({
      error: "You already have a confirmed match.",
      code: "ALREADY_MATCHED",
    });
  }

  const pool = agenciesForState(user.state);
  if (pool.length === 0) {
    return res.status(409).json({
      error: "HavenLink has not established outreach in your state yet.",
      code: "UNSUPPORTED_STATE",
      state: user.state,
    });
  }

  const partnerState = isPartnerState(user.state);
  let candidate: Agency;

  if (partnerState) {
    // No re-rolls in partner states: once a partner has been offered, every
    // subsequent roll returns that same partner.
    const existing = req.session.matchCandidate
      ? pool.find((a) => a.id === req.session.matchCandidate)
      : undefined;
    candidate = existing ?? pool[Math.floor(Math.random() * pool.length)];
    req.session.matchSeen = [candidate.id];
  } else {
    let seen = req.session.matchSeen ?? [];
    let unseen = pool.filter((a) => !seen.includes(a.id));
    if (unseen.length === 0) {
      // Pool exhausted: recycle, but don't immediately re-offer the agency
      // the user just rejected (when there is any alternative).
      seen = [];
      unseen = pool.filter((a) => a.id !== req.session.matchCandidate);
      if (unseen.length === 0) unseen = pool;
    }
    candidate = unseen[Math.floor(Math.random() * unseen.length)];
    req.session.matchSeen = [...seen, candidate.id];
  }

  req.session.matchCandidate = candidate.id;

  return res.json({
    candidate: {
      agency: candidate,
      score: scoreMatch(user.id, candidate),
    },
    partnerState,
    poolSize: pool.length,
    seenCount: (req.session.matchSeen ?? []).length,
  });
});

// ----- POST /api/match/confirm ---------------------------------------------------
matchRouter.post("/confirm", requireAuth, doubleCsrfProtection, async (req, res) => {
  try {
    const user = req.user as User | undefined;
    if (!user) return res.status(401).json({ error: "Authentication required" });

    const agencyId = (req.body ?? {}).agencyId;
    const agency = typeof agencyId === "string" ? findAgency(agencyId) : undefined;
    if (!agency) {
      return res
        .status(400)
        .json({ error: "Unknown agency.", code: "INVALID_AGENCY" });
    }
    if (!matchEligible(user)) {
      return res.status(403).json({
        error: "Complete the intake form and home study before matching.",
        code: "INELIGIBLE",
      });
    }
    if (user.matched_agency_id) {
      return res.status(409).json({
        error: "You already have a confirmed match.",
        code: "ALREADY_MATCHED",
      });
    }
    if (agency.state !== user.state) {
      return res.status(403).json({
        error: "This agency does not serve your state.",
        code: "WRONG_STATE",
      });
    }
    if (isPartnerState(user.state) && !agency.partner) {
      return res.status(403).json({
        error: "Your state is served by a HavenLink partner agency.",
        code: "PARTNER_REQUIRED",
      });
    }
    if (req.session.matchCandidate !== agency.id) {
      // Covers both tampering and a lost/regenerated session — the client
      // responds by rolling again.
      return res.status(409).json({
        error: "Start a match first, then confirm the agency you were offered.",
        code: "NO_ACTIVE_CANDIDATE",
      });
    }

    const score = scoreMatch(user.id, agency);

    // Unlike the intake/home-study emails, the DB write is the critical path
    // here: the durable stored match is the deliverable (it must survive
    // re-login), while the email is a notification. Write first, then notify.
    const updated = await recordMatch(user.id, agency.id, score.total);
    if (!updated) {
      return res.status(409).json({
        error: "You already have a confirmed match.",
        code: "ALREADY_MATCHED",
      });
    }

    // Best-effort notification to the team; a mail hiccup must not undo or
    // fail a match that is already stored.
    try {
      await sendEmail({
        from: config.EMAIL_FROM,
        to: "havenlink.org@gmail.com",
        replyTo: user.email, // let the team reply straight to the family
        subject: `Match Confirmed [${agency.state} — ${agency.name}]: ${user.email}`,
        text: `
New Agency Match Confirmation

Account ID (user email): ${user.email}
Confirmed: ${new Date().toISOString()}
State: ${agency.state}
Agency: ${agency.name} (${agency.id})${agency.partner ? " — HavenLink partner" : ""}
Agency website: ${agency.url ?? "(no website listed)"}
Match score: ${score.total}/100 (${score.tierLabel})

Please reach out to this family and the agency to coordinate next steps.
        `,
      });
    } catch (mailErr) {
      console.error(
        "Match confirmation email failed (match still recorded):",
        mailErr instanceof Error ? mailErr.message : String(mailErr)
      );
    }

    req.session.matchSeen = undefined;
    req.session.matchCandidate = undefined;

    return res.json({
      success: true,
      match: storedMatchPayload(updated, agency),
    });
  } catch (error) {
    console.error("Match confirm error:", error);
    return res.status(500).json({
      error:
        "Failed to confirm the match. Please try again or contact us directly at havenlink.org@gmail.com",
    });
  }
});
