/**
 * Authentication routes: password signup/login, Google OAuth, email verification,
 * logout, and the current-user endpoint. Account-linking rules live in
 * auth/passport.ts (Google side) and in the signup/login handlers (password side).
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import {
  createPasswordUser,
  findByEmail,
  markEmailVerified,
  resolveNewsletterPrompt,
  type User,
} from "../db/users";
import { issueToken, consumeToken } from "../db/verificationTokens";
import { hashPassword, verifyPassword, emailSchema, passwordSchema } from "./password";
import { sendVerificationEmail, sendNewsletterSubscriberNotification } from "./email";
import { passport, GoogleEmailUnverifiedError } from "./passport";
import {
  authRateLimiter,
  loginRateLimiter,
  doubleCsrfProtection,
  generateToken,
} from "../middleware/security";
import { sanitizeNext } from "../middleware/pageGuard";
import { z } from "zod";

export const authRouter = Router();

const credentialsSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

/** Establish a logged-in session. passport (>=0.6) regenerates the session id
 * here, mitigating session fixation. */
function loginSession(req: Request, user: User): Promise<void> {
  return new Promise((resolve, reject) => {
    req.login(user, (err) => (err ? reject(err) : resolve()));
  });
}

function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.email_verified,
    // Drives the one-time "Join the newsletter" popup on the client.
    newsletterPromptPending: user.newsletter_prompt_pending,
    // Saved adoption-application state. `state` auto-fills the state field on the
    // intake + home-study forms; the completion flags let the client reflect prior
    // progress. Served only to the logged-in owner (this endpoint is no-store).
    state: user.state,
    intakeCompleted: user.intake_completed,
    homeStudyPath: user.home_study_path,
    homeStudyResult: user.home_study_result,
  };
}

// ---- CSRF token issuance -----------------------------------------------------
// GET is CSRF-exempt. Touch the session so it persists and req.sessionID stays
// stable for subsequent protected POSTs.
authRouter.get("/csrf", (req, res) => {
  req.session.csrfInit = true;
  // overwrite=true: always mint a fresh token bound to the CURRENT session id and
  // replace any existing cookie. Without this, a stale/invalid csrf cookie (e.g.
  // left over from a pre-login session id or an old SESSION_SECRET) makes
  // generateToken THROW invalidCsrfTokenError, deadlocking token issuance — the
  // client can then never obtain a valid token (breaks logout, signup, login).
  const csrfToken = generateToken(req, res, true);
  res.set("Cache-Control", "no-store"); // tokens must never be cached
  res.json({ csrfToken });
});

// ---- Password signup ---------------------------------------------------------
authRouter.post(
  "/signup",
  authRateLimiter,
  doubleCsrfProtection,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = credentialsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res
          .status(400)
          .json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      }
      const { email, password } = parsed.data;

      const existing = await findByEmail(email);
      if (existing) {
        if (existing.password_hash) {
          return res.status(409).json({
            error: "An account with this email already exists. Please log in.",
            code: "ACCOUNT_EXISTS",
          });
        }
        // OAuth-only account: per spec, tell the user to use Google.
        return res.status(409).json({
          error:
            "This email is registered with Google sign-in. Please continue with Google.",
          code: "USE_GOOGLE",
        });
      }

      const passwordHash = await hashPassword(password);
      const user = await createPasswordUser(email, passwordHash);

      const rawToken = await issueToken(user.id);
      await sendVerificationEmail(user.email, rawToken);

      return res.status(201).json({
        message:
          "Account created. Check your email for a verification link to finish signing up.",
      });
    } catch (err) {
      next(err);
    }
  }
);

// ---- Password login ----------------------------------------------------------
authRouter.post(
  "/login",
  loginRateLimiter,
  doubleCsrfProtection,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = z
        .object({ email: emailSchema, password: z.string().min(1) })
        .safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid email or password." });
      }
      const { email, password } = parsed.data;

      const user = await findByEmail(email);

      // OAuth-only account has no password to check.
      if (user && !user.password_hash) {
        return res.status(400).json({
          error:
            "This email is registered with Google sign-in. Please continue with Google.",
          code: "USE_GOOGLE",
        });
      }

      // Generic failure for unknown user or bad password (reduce enumeration).
      if (!user || !(await verifyPassword(user.password_hash!, password))) {
        return res.status(401).json({ error: "Invalid email or password." });
      }

      if (!user.email_verified) {
        return res.status(403).json({
          error: "Please verify your email before signing in.",
          code: "EMAIL_UNVERIFIED",
        });
      }

      await loginSession(req, user);
      return res.json({ user: publicUser(user) });
    } catch (err) {
      next(err);
    }
  }
);

// ---- Logout ------------------------------------------------------------------
authRouter.post("/logout", doubleCsrfProtection, (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy((destroyErr) => {
      if (destroyErr) return next(destroyErr);
      res.clearCookie("havenlink.sid", { path: "/" });
      res.json({ message: "Logged out" });
    });
  });
});

// ---- Newsletter prompt response ----------------------------------------------
// Records the logged-in user's accept/decline for the one-time signup popup and
// clears the pending flag so it never shows again. Auth + CSRF protected.
authRouter.post("/newsletter", doubleCsrfProtection, async (req, res, next) => {
  try {
    const user = req.user as User | undefined;
    if (!req.isAuthenticated?.() || !user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    const subscribe = req.body?.subscribe === true;
    await resolveNewsletterPrompt(user.id, subscribe);

    // Notify the team on opt-in. Best-effort: the subscription is already
    // recorded above, so a mail failure must not fail the user's request.
    if (subscribe) {
      try {
        await sendNewsletterSubscriberNotification(user.email);
      } catch (mailErr) {
        console.error("Newsletter subscriber notification failed:", mailErr);
      }
    }

    return res.json({ ok: true, subscribed: subscribe });
  } catch (err) {
    next(err);
  }
});

// ---- Email verification (link target) ----------------------------------------
authRouter.get("/verify-email", async (req, res, next) => {
  try {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    if (!token) return res.redirect("/login?verify=invalid");

    const userId = await consumeToken(token);
    if (!userId) return res.redirect("/login?verify=invalid");

    await markEmailVerified(userId);
    return res.redirect("/login?verify=success");
  } catch (err) {
    next(err);
  }
});

// ---- Resend verification -----------------------------------------------------
authRouter.post(
  "/resend-verification",
  authRateLimiter,
  doubleCsrfProtection,
  async (req, res, next) => {
    try {
      const parsed = z.object({ email: emailSchema }).safeParse(req.body);
      // Always respond the same way to avoid leaking which emails exist.
      const generic = {
        message:
          "If an unverified account exists for that email, a new verification link has been sent.",
      };
      if (!parsed.success) return res.json(generic);

      const user = await findByEmail(parsed.data.email);
      if (user && user.password_hash && !user.email_verified) {
        const rawToken = await issueToken(user.id);
        await sendVerificationEmail(user.email, rawToken);
      }
      return res.json(generic);
    } catch (err) {
      next(err);
    }
  }
);

// ---- Google OAuth ------------------------------------------------------------
authRouter.get(
  "/google",
  authRateLimiter,
  (req, _res, next) => {
    // Remember where to return the user after login. Stored in the session so it
    // survives the round-trip to Google; validated so ?next can't open-redirect.
    req.session.postAuthRedirect =
      sanitizeNext(req.query.next) ?? undefined;
    next();
  },
  passport.authenticate("google", { scope: ["openid", "email", "profile"] })
);

authRouter.get("/google/callback", (req, res, next) => {
  passport.authenticate(
    "google",
    async (err: unknown, user: User | false) => {
      if (err) {
        if (err instanceof GoogleEmailUnverifiedError) {
          return res.redirect("/login?error=google_unverified");
        }
        return next(err);
      }
      if (!user) return res.redirect("/login?error=google_failed");
      // Read the destination BEFORE loginSession: req.login regenerates the
      // session (session-fixation defense), which discards postAuthRedirect.
      const dest = sanitizeNext(req.session.postAuthRedirect) ?? "/home";
      try {
        await loginSession(req, user);
        return res.redirect(dest);
      } catch (loginErr) {
        return next(loginErr);
      }
    }
  )(req, res, next);
});

// ---- Current user ------------------------------------------------------------
authRouter.get("/me", (req, res) => {
  // Auth state is per-session and must never be served stale from a cache.
  res.set("Cache-Control", "no-store");
  const user = req.user as User | undefined;
  if (!req.isAuthenticated?.() || !user) {
    return res.status(401).json({ authenticated: false });
  }
  res.json({ authenticated: true, user: publicUser(user) });
});
