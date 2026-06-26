// Config is imported first so .env is loaded and validated before anything else.
import { config } from "./config";
import express from "express";
import path from "path";
import cookieParser from "cookie-parser";
import { transporter } from "./auth/email";
import { sessionMiddleware } from "./middleware/session";
import { securityHeaders } from "./middleware/security";
import { invalidCsrfTokenError } from "./middleware/security";
import { passport, configurePassport } from "./auth/passport";
import { authRouter } from "./auth/routes";

const app = express();
const PORT = config.PORT;

// Behind AWS App Runner / load balancer: trust the proxy so Secure cookies and
// rate-limit client IPs work correctly.
if (config.isProd) app.set("trust proxy", 1);

// ----- Core middleware (order matters) ---------------------------------------
app.use(securityHeaders());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); // required by csrf-csrf to read the CSRF cookie
app.use(sessionMiddleware());

configurePassport();
app.use(passport.initialize());
app.use(passport.session());

app.use(express.static(path.join(__dirname, "../public")));

// ----- Auth routes ------------------------------------------------------------
app.use("/auth", authRouter);

// Partnership form submission endpoint
app.post("/api/partnership-request", async (req, res) => {
  try {
    const {
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
      message,
    } = req.body;

    // Validate required fields
    if (!org_name || !contact_name || !contact_email) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Create email content
    const emailContent = `
New Partnership Request from HavenLink

Organization Information:
- Organization Name: ${org_name}
- Organization Type: ${org_type}
- Description: ${description}
- Primary Location: ${location}
- States Served: ${states}
- Years of Experience: ${experience}
- Licensing Status: ${licensing}
- Website: ${website || "Not provided"}

Contact Information:
- Name: ${contact_name}
- Title: ${contact_title}
- Email: ${contact_email}
- Phone: ${contact_phone}

Additional Information:
${message || "No additional information provided"}
    `;

    // Send email to HavenLink
    const mailOptions = {
      from: config.EMAIL_USER,
      to: "havenlink.org@gmail.com",
      replyTo: contact_email, // let the team reply straight to the applicant
      subject: `Partnership Request: ${org_name}`,
      text: emailContent,
    };

    // Critical path: the request is only "received" once HavenLink is notified.
    await transporter.sendMail(mailOptions);

    // Send confirmation email to the organization
    const confirmationEmail = {
      from: config.EMAIL_USER,
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
