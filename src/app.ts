// Config is imported first so .env is loaded and validated before anything else.
import { config } from "./config";
import express from "express";
import path from "path";
import cookieParser from "cookie-parser";
import { transporter } from "./auth/email";
import { sessionMiddleware } from "./middleware/session";
import { securityHeaders } from "./middleware/security";
import { doubleCsrfProtection, invalidCsrfTokenError } from "./middleware/security";
import {
  recordIntakeCompletion,
  recordHomeStudyCompletion,
  type User,
  type HomeStudyPath,
  type HomeStudyResult,
} from "./db/users";
import { passport, configurePassport } from "./auth/passport";
import { authRouter } from "./auth/routes";
import { chatRouter } from "./chat/routes";
import { pageGuard } from "./middleware/pageGuard";

const app = express();
const PORT = config.PORT;

// Behind AWS App Runner / load balancer: trust the proxy so Secure cookies and
// rate-limit client IPs work correctly.
if (config.isProd) {
  app.set("trust proxy", 1);
  app.use((req, res, next) => {
    if (req.secure) return next();
    return res.redirect(301, `https://${req.get("host")}${req.originalUrl}`);
  });
}

// ----- Core middleware (order matters) ---------------------------------------
app.use(securityHeaders());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // required by csrf-csrf to read the CSRF cookie
app.use(sessionMiddleware());

configurePassport();
app.use(passport.initialize());
app.use(passport.session());

// Gate the adoption pages BEFORE static/clean-URL routes so that neither the raw
// .html file nor a hand-typed URL can bypass the login requirement.
app.use(pageGuard);

app.use(express.static(path.join(__dirname, "../public")));

// ----- Auth routes ------------------------------------------------------------
app.use("/auth", authRouter);

// ----- AI chatbot -------------------------------------------------------------
app.use("/api/chat", chatRouter);

// Partnership form submission endpoint
app.post("/api/partnership-request", async (req, res) => {
  try {
    const {
      partner_type,
      org_name,
      org_type,
      description,
      contact_name,
      contact_title,
      contact_email,
      contact_phone,
      website,
      location,
      states,
      experience,
      licensing,
      collaboration,
      message,
    } = req.body;

    // Validate required fields
    if (!org_name || !contact_name || !contact_email) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const partnerTypeLabel =
      partner_type === "organization"
        ? "Community organization"
        : partner_type === "agency"
          ? "Adoption agency"
          : "Not provided";

    // Create email content. Organization-variant submissions omit the
    // adoption-specific fields, so guard everything optional.
    const emailContent = `
New Partnership Request from HavenLink

Organization Information:
- Partner Type: ${partnerTypeLabel}
- Organization Name: ${org_name}
- Organization Type: ${org_type || "Not provided"}
- Description: ${description || "Not provided"}
- Primary Location: ${location || "Not provided"}
- States Served: ${states || "Not provided"}
- Years of Experience: ${experience || "Not provided"}
- Licensing Status: ${licensing || "Not provided"}
- How they'd like to collaborate: ${collaboration || "Not provided"}
- Website: ${website || "Not provided"}

Contact Information:
- Name: ${contact_name}
- Title: ${contact_title || "Not provided"}
- Email: ${contact_email}
- Phone: ${contact_phone || "Not provided"}

Additional Information:
${message || "No additional information provided"}
    `;

    // Send email to HavenLink
    const mailOptions = {
      from: config.EMAIL_FROM,
      to: "havenlink.org@gmail.com",
      replyTo: contact_email, // let the team reply straight to the applicant
      subject: `Partnership Request: ${org_name}`,
      text: emailContent,
    };

    // Critical path: the request is only "received" once HavenLink is notified.
    await transporter.sendMail(mailOptions);

    // Send confirmation email to the organization
    const confirmationEmail = {
      from: config.EMAIL_FROM,
      to: contact_email,
      subject: "Partnership Request Received - HavenLink",
      text: `Hello ${contact_name},

Thank you for submitting your partnership request to HavenLink! We've received your information and our partnership team will review it shortly.

We aim to respond to all partnership inquiries within 3-5 business days. If you have any questions in the meantime, feel free to reach out.

Best regards,
The HavenLink Team
havenlink.org@gmail.com
      `,
    };

    // Best-effort: a bad/typo'd applicant address must not fail a request that
    // HavenLink has already been notified about.
    try {
      await transporter.sendMail(confirmationEmail);
    } catch (confirmErr) {
      console.error(
        "Partnership confirmation email failed (request still recorded):",
        confirmErr instanceof Error ? confirmErr.message : String(confirmErr)
      );
    }

    res.json({
      success: true,
      message: "Partnership request submitted successfully!",
    });
  } catch (error) {
    console.error("Email sending error:", error);
    res.status(500).json({
      error: "Failed to submit partnership request. Please try again or contact us directly at havenlink.org@gmail.com",
    });
  }
});

// Intake form submission endpoint. The intake pages sit behind pageGuard, so the
// account id (the signed-in user's email) is taken from the session — never from
// the request body, where it could be spoofed.
const INTAKE_SECTIONS = [
  ["household", "Household Profile"],
  ["lifestyle", "Lifestyle & Values"],
  ["experience", "Experience & Background"],
  ["preferences", "Adoption Preferences"],
  ["legal", "Legal Readiness"],
] as const;

/** A body-supplied US state, normalized to a 2-letter code, or null if invalid. */
function parseState(value: unknown): string | null {
  const state = String(value ?? "").toUpperCase();
  return /^[A-Z]{2}$/.test(state) ? state : null;
}

function renderIntakeAnswers(section: unknown): string {
  if (typeof section !== "object" || section === null) return "- (no answers)";
  const entries = Object.entries(section as Record<string, unknown>).filter(
    ([, v]) => v !== null && v !== undefined && v !== ""
  );
  if (entries.length === 0) return "- (no answers)";
  return entries
    .map(([key, value]) => {
      const rendered = Array.isArray(value)
        ? value.map((v) => String(v)).join(", ")
        : String(value);
      return `- ${key}: ${rendered}`;
    })
    .join("\n");
}

app.post("/api/intake-submission", doubleCsrfProtection, async (req, res) => {
  try {
    const user = req.user as User | undefined;
    if (!req.isAuthenticated?.() || !user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const body = req.body ?? {};
    const hasAnswers = INTAKE_SECTIONS.some(
      ([key]) =>
        typeof body[key] === "object" &&
        body[key] !== null &&
        Object.keys(body[key]).length > 0
    );
    if (!hasAnswers) {
      return res.status(400).json({ error: "Missing form data" });
    }

    const sectionsText = INTAKE_SECTIONS.map(
      ([key, title], i) => `Section ${i + 1}: ${title}\n${renderIntakeAnswers(body[key])}`
    ).join("\n\n");

    const emailContent = `
New Family Intake Form Submission

Account ID (user email): ${user.email}
Submitted: ${new Date().toISOString()}
Started: ${typeof body.startedAt === "string" ? body.startedAt : "Unknown"}

${sectionsText}
    `;

    // Critical path: the submission is only "received" once HavenLink is notified.
    await transporter.sendMail({
      from: config.EMAIL_FROM,
      to: "havenlink.org@gmail.com",
      replyTo: user.email, // let the team reply straight to the family
      subject: `Family Intake Form Submission: ${user.email}`,
      text: emailContent,
    });

    // Best-effort: record completion + residence state on the account. The team
    // has already been emailed above, so a storage hiccup must not fail the
    // submission — log and move on.
    try {
      await recordIntakeCompletion(user.id, parseState(body.state));
    } catch (dbErr) {
      console.error(
        "Intake completion not recorded (submission still sent):",
        dbErr instanceof Error ? dbErr.message : String(dbErr)
      );
    }

    res.json({ success: true, message: "Intake form submitted successfully!" });
  } catch (error) {
    console.error("Intake submission email error:", error);
    res.status(500).json({
      error: "Failed to submit the intake form. Please try again or contact us directly at havenlink.org@gmail.com",
    });
  }
});

// Home study page submission endpoint. Serves both paths of the home study flow:
// "completed" (user already has a home study) and "screener" (readiness check).
// Like the intake endpoint, the account id is the session user's email — never
// taken from the request body. Answers/question text arrive from the client, so
// strings are newline-collapsed and length-capped before being placed in the email.
const HS_RESULTS = new Set(["PASSED", "NOT_YET_ELIGIBLE", "INTERNATIONAL"]);
const HS_ANSWERS = new Set(["yes", "no", "na"]);
const HS_RESULT_LABELS: Record<string, string> = {
  PASSED: "PASSED",
  NOT_YET_ELIGIBLE: "NOT YET ELIGIBLE",
  INTERNATIONAL: "INTERNATIONAL",
};

/** Collapse newlines/tabs (protects the plaintext email layout), trim, cap length. */
function cleanLine(value: unknown, max: number): string {
  return String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, max);
}

function renderSubmittedAt(): string {
  const now = new Date();
  const local = now.toLocaleString("en-US", {
    timeZone: "America/New_York",
    timeZoneName: "short",
  });
  return `${local} (${now.toISOString()})`;
}

/** Months from a YYYY-MM completion month to now; used for the expiry note. */
function monthsSince(completedMonth: string): number {
  const [year, month] = completedMonth.split("-").map(Number);
  const now = new Date();
  return (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);
}

interface HsScreenerAnswer {
  question: string;
  answer: string;
  pass: boolean;
  universal: boolean;
}

function renderCompletedHomeStudyEmail(
  user: User,
  data: { state: string; stateName: string; agency: string; completedMonth: string }
): { subject: string; text: string } {
  const expired = monthsSince(data.completedMonth) > 24;
  const text = `
Home Study Submission — Completed Home Study

Account ID (user email): ${user.email}
Submitted: ${renderSubmittedAt()}

State: ${data.stateName} (${data.state})
Agency / provider: ${data.agency || "Not provided"}
Completed: ${data.completedMonth}
${expired ? "\nNOTE: Completed more than 24 months ago — this study may be expired. Most states require updates every 12-24 months.\n" : ""}
All information is self-reported. Full verification occurs during the official process.

Please reach out to this applicant within 1-2 business days.
  `;
  return {
    subject: `Home Study Submission [COMPLETED HOME STUDY]: ${user.email}`,
    text,
  };
}

function renderScreenerEmail(
  user: User,
  data: {
    result: string;
    stateName: string;
    answers: HsScreenerAnswer[];
    stoppingQuestion: string | null;
  }
): { subject: string; text: string } {
  const label = HS_RESULT_LABELS[data.result];
  const renderGroup = (universal: boolean) => {
    const rows = data.answers
      .filter((a) => a.universal === universal)
      .map((a) => `${a.pass ? "[PASS]" : "[FAIL]"} ${a.question} — answered: ${a.answer}`);
    return rows.length > 0 ? rows.join("\n") : "(none)";
  };

  let statusDetail = "";
  if (data.result === "NOT_YET_ELIGIBLE" && data.stoppingQuestion) {
    statusDetail = `\nStopped at: ${data.stoppingQuestion}\n`;
  } else if (data.result === "INTERNATIONAL") {
    statusDetail =
      "\nApplicant lives outside the United States and was directed to a USCIS-accredited agency (uscis.gov/adoption).\n";
  }

  const text = `
Home Study Readiness Screener — ${label}

Status: ${label}
Account ID (user email): ${user.email}
State: ${data.stateName}
Submitted: ${renderSubmittedAt()}
${statusDetail}
Eligibility checklist (self-reported):

Universal:
${renderGroup(true)}

State-specific (${data.stateName}):
${renderGroup(false)}

Note: All answers are self-reported. Full verification occurs during the official home study.
  `;
  return {
    subject: `Home Study Screener [${label}]: ${user.email}`,
    text,
  };
}

app.post("/api/home-study-submission", doubleCsrfProtection, async (req, res) => {
  try {
    const user = req.user as User | undefined;
    if (!req.isAuthenticated?.() || !user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const body = req.body ?? {};
    let email: { subject: string; text: string };
    let completion: {
      path: HomeStudyPath;
      result: HomeStudyResult | null;
      state: string | null;
    };

    if (body.path === "completed") {
      const state = String(body.state ?? "");
      const completedMonth = String(body.completedMonth ?? "");
      if (!/^[A-Z]{2}$/.test(state) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(completedMonth)) {
        return res.status(400).json({ error: "Invalid submission data" });
      }
      email = renderCompletedHomeStudyEmail(user, {
        state,
        stateName: cleanLine(body.stateName, 40),
        agency: cleanLine(body.agency, 200),
        completedMonth,
      });
      completion = { path: "completed", result: null, state: parseState(state) };
    } else if (body.path === "screener") {
      const result = String(body.result ?? "");
      const rawAnswers = body.answers;
      if (!HS_RESULTS.has(result) || !Array.isArray(rawAnswers) || rawAnswers.length > 40) {
        return res.status(400).json({ error: "Invalid submission data" });
      }
      const answers: HsScreenerAnswer[] = [];
      for (const raw of rawAnswers) {
        if (typeof raw !== "object" || raw === null) {
          return res.status(400).json({ error: "Invalid submission data" });
        }
        const answer = String((raw as Record<string, unknown>).answer ?? "");
        if (!HS_ANSWERS.has(answer)) {
          return res.status(400).json({ error: "Invalid submission data" });
        }
        answers.push({
          question: cleanLine((raw as Record<string, unknown>).question, 300),
          answer,
          pass: Boolean((raw as Record<string, unknown>).pass),
          universal: Boolean((raw as Record<string, unknown>).universal),
        });
      }
      const stopping = body.stoppingQuestion;
      email = renderScreenerEmail(user, {
        result,
        stateName: cleanLine(body.stateName, 40) || "Not specified",
        answers,
        stoppingQuestion:
          typeof stopping === "object" && stopping !== null
            ? cleanLine((stopping as Record<string, unknown>).question, 300)
            : null,
      });
      // `result` is validated against HS_RESULTS above (the three result values).
      completion = {
        path: "screener",
        result: result as HomeStudyResult,
        state: parseState(body.state),
      };
    } else {
      return res.status(400).json({ error: "Invalid submission data" });
    }

    // Critical path: the submission is only "received" once HavenLink is notified.
    await transporter.sendMail({
      from: config.EMAIL_FROM,
      to: "havenlink.org@gmail.com",
      replyTo: user.email, // let the team reply straight to the family
      subject: email.subject,
      text: email.text,
    });

    // Best-effort: record which home-study path was completed (and its screener
    // result) plus the state. The team is already notified, so a storage failure
    // must not fail the submission — log and continue.
    try {
      await recordHomeStudyCompletion(user.id, completion);
    } catch (dbErr) {
      console.error(
        "Home study completion not recorded (submission still sent):",
        dbErr instanceof Error ? dbErr.message : String(dbErr)
      );
    }

    res.json({ success: true, message: "Submission sent successfully!" });
  } catch (error) {
    console.error("Home study submission email error:", error);
    res.status(500).json({
      error: "Failed to send your submission. Please try again or contact us directly at havenlink.org@gmail.com",
    });
  }
});

// ===== CLEAN URL ROUTES (without .html extensions) =====

// Auth pages
app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/login.html"));
});

app.get("/signup", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/signup.html"));
});

// Home page
app.get("/home", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Team page
app.get("/team", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/team.html"));
});

// Partner page
app.get("/partner", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/partner.html"));
});

// Adoption pages - clean URLs
app.get("/adopt/home-study", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/adopt/home-study.html"));
});

app.get("/adopt/intake-form", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/adopt/intake-form.html"));
});


app.get("/adopt/agency-profiles", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/adopt/agency-profiles.html"));
});

app.get("/adopt/matching", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/adopt/matching.html"));
});



// Generic .html redirect for root-level files
app.get(/^\/([a-zA-Z0-9\-]+)\.html$/, (req, res) => {
  const base = req.params[0];
  if (base === "index") {
    res.redirect(301, "/home");
  } else {
    res.redirect(301, `/${base}`);
  }
});

// Generic .html redirect for subfolders (e.g. /adopt/whatever.html)
app.get(/^\/(.+)\/([a-zA-Z0-9\-]+)\.html$/, (req, res) => {
  // e.g. /adopt/home-study.html -> /adopt/home-study
  const folder = req.params[0];
  const page = req.params[1];
  res.redirect(301, `/${folder}/${page}`);
});

app.get("/adopt/matching.html", (req, res) => {
  res.redirect(301, "/adopt/matching");
});

// Root route redirects to /home
app.get("/", (req, res) => {
  res.redirect("/home");
});


// Fallback to serve index.html for any undefined routes (SPA fallback),
// but serve team.html for /team and anchor links like /team#contact
app.get(/^\/team(\/)?$/, (req, res) => {
  res.sendFile(path.join(__dirname, "../public/team.html"));
});

app.get(/^\/(?!adopt\/).*$/, (req, res) => {
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// ----- Error handler (last) ---------------------------------------------------
// 4-arg signature required for Express to treat this as an error handler.
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    if (err === invalidCsrfTokenError) {
      return res.status(403).json({ error: "Invalid or missing CSRF token." });
    }
    console.error(
      "Unhandled error:",
      err instanceof Error ? err.message : String(err)
    );
    if (res.headersSent) return next(err);
    res.status(500).json({ error: "Internal server error" });
  }
);

app.listen(PORT, () => {
  console.log(`HavenLink running at ${config.APP_BASE_URL} (port ${PORT})`);
});
