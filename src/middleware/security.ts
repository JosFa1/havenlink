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
      // The Google Maps JS API (Post-Adoption Resource Finder) is the only allowed
      // third-party origin: its script comes from maps.googleapis.com, tiles/markers
      // from the gstatic/google image hosts, tile/telemetry XHRs to maps.googleapis
      // .com, its font stylesheet from fonts.googleapis.com + fonts from
      // fonts.gstatic.com, and it spins up blob: web workers. Everything else stays
      // same-origin. See Google's "Content Security Policy" guidance for Maps JS.
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://maps.googleapis.com"],
        // Existing pages use inline on* handlers; helmet's default blocks these
        // via script-src-attr 'none', so explicitly allow them.
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc: [
          "'self'",
          "data:",
          "https://maps.gstatic.com",
          "https://*.googleapis.com",
          "https://*.gstatic.com",
          "https://*.google.com",
          "https://*.googleusercontent.com",
        ],
        connectSrc: ["'self'", "https://maps.googleapis.com", "https://maps.gstatic.com"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        workerSrc: ["'self'", "blob:"],
        formAction: ["'self'", "https://accounts.google.com"],
        // 'self' rather than 'none': the header applies to static assets too,
        // and the homepage proclamation modal embeds /documents/*.pdf in a
        // same-origin iframe. Third-party framing stays blocked either way,
        // so the clickjacking protection is unchanged.
        frameAncestors: ["'self'"],
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
