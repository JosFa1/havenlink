/**
 * Security middleware: HTTP headers (helmet), rate limiting, and CSRF.
 *
 * CSRF: csrf-csrf double-submit, bound to the session id. The hashed token lives
 * in an httpOnly cookie; the client must echo the plaintext token in the
 * `x-csrf-token` header (fetched from GET /auth/csrf). State-changing auth POSTs
 * are protected; safe methods (GET/HEAD/OPTIONS) are ignored.
 *
 * NOTE on CSP: the existing static pages use inline event handlers/styles, so
 * script/style 'unsafe-inline' is permitted for now. Tightening this (removing
 * inline handlers + nonces) is a recommended follow-up.
 */
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { doubleCsrf } from "csrf-csrf";
import { config } from "../config";

export function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        // Existing pages use inline on* handlers; helmet's default blocks these
        // via script-src-attr 'none', so explicitly allow them.
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:"],
        connectSrc: ["'self'"],
        formAction: ["'self'", "https://accounts.google.com"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: config.isProd ? [] : null,
      },
    },
    // HSTS is meaningful only over HTTPS (prod).
    hsts: config.isProd,
    crossOriginEmbedderPolicy: false,
  });
}

/** Throttle brute-force/abuse on auth endpoints (per IP). */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

/** Tighter limit specifically for credential submission. */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many attempts. Please try again later." },
});

const csrfCookieName = config.isProd
  ? "__Host-havenlink.csrf"
  : "havenlink.csrf";

const {
  doubleCsrfProtection,
  generateToken,
  invalidCsrfTokenError,
} = doubleCsrf({
  getSecret: () => config.SESSION_SECRET,
  getSessionIdentifier: (req) => req.sessionID,
  cookieName: csrfCookieName,
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProd,
    path: "/",
  },
  size: 32,
  getTokenFromRequest: (req) => req.headers["x-csrf-token"],
});

export { doubleCsrfProtection, generateToken, invalidCsrfTokenError };
