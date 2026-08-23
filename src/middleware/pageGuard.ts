/**
 * Page-level auth gate for the adoption flow.
 *
 * The five adoption pages require a logged-in user. This guard is mounted BEFORE
 * express.static so it intercepts every form of the request — the clean URL
 * (/adopt/home-study) AND the raw file (/adopt/home-study.html) — otherwise
 * express.static would serve the .html directly and let a hand-typed URL slip
 * past the gate.
 *
 * Unauthenticated visitors are redirected to /login?next=<clean-path> so the
 * login flow (see auth/routes.ts and public/account.js) can return them to the
 * page they originally asked for.
 */
import path from "path";
import type { Request, Response, NextFunction } from "express";

/** Clean URLs of the pages that require a logged-in user. */
export const PROTECTED_PAGES = [
  "/adopt/home-study",
  "/adopt/intake-form",
  "/adopt/matching",
  "/adopt/resources",
  "/adopt/calculator",
] as const;

const PROTECTED = new Set<string>(PROTECTED_PAGES);

/**
 * Reduce any request path to the canonical clean page path we gate on:
 * percent-decode, collapse `.`/`..`/`//`, drop a trailing slash, lower-case, and
 * strip a trailing `.html`. Canonicalising here (rather than matching req.path
 * verbatim) is what stops crafted URLs — `/adopt/./home-study.html`,
 * `/adopt/HOME-STUDY`, `/adopt/home-study/` — from resolving to a file that
 * express.static or the clean-URL routes would still serve.
 */
export function canonicalPagePath(rawPath: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    decoded = rawPath; // malformed %-encoding: fall back to the raw value
  }
  let p = path.posix.normalize(decoded).toLowerCase();
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  if (p.endsWith(".html")) p = p.slice(0, -5);
  return p;
}

/**
 * A safe post-login redirect target, or null. Only the gated pages qualify,
 * which makes open-redirect abuse of ?next impossible (an off-site or unknown
 * value simply falls back to the caller's default, e.g. /home).
 */
export function sanitizeNext(next: unknown): string | null {
  if (typeof next !== "string" || next === "") return null;
  const clean = canonicalPagePath(next);
  return PROTECTED.has(clean) ? clean : null;
}

/**
 * Gate the adoption pages. Must be mounted after passport.session() (so
 * req.isAuthenticated/req.user are populated) and before express.static.
 */
export function pageGuard(req: Request, res: Response, next: NextFunction) {
  // Only page loads need gating.
  if (req.method !== "GET" && req.method !== "HEAD") return next();

  const clean = canonicalPagePath(req.path);
  if (!PROTECTED.has(clean)) return next();

  if (req.isAuthenticated?.() && req.user) return next();

  return res.redirect(`/login?next=${encodeURIComponent(clean)}`);
}
