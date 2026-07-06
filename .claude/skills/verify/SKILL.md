---
name: verify
description: Build, run, and drive HavenLink locally to verify page/frontend/backend changes end-to-end.
---

# Verifying HavenLink changes

## Launch

- `npm run dev` (ts-node-dev, `src/app.ts`) → http://localhost:3000. Needs `.env` with `DATABASE_URL` (local Postgres).
- Most pages under `/adopt/*` and others in `src/middleware/pageGuard.ts` are **auth-gated** — they 302 to `/login?next=…`.

## Getting a session

- Password login requires a **verified** email (`users.email_verified`).
- Recipe: `GET /auth/csrf` → cookie + token, `POST /auth/signup` (JSON `{email,password}`, header `x-csrf-token`, send the csrf cookies), then flip `UPDATE users SET email_verified = true WHERE email = …` in Postgres. Delete the user afterwards.
- **Login rate limiter**: 10 per 15 min, in-memory (`src/middleware/security.ts`) — restarting the dev server resets it. Budget ~3 logins per full Playwright run (main + mobile + reduced-motion contexts).

## Driving

- Playwright works well; install it in the session scratchpad (repo has no test deps).
- **Newsletter modal**: on first authenticated page view, `account.js` injects `#newsletterModal` which intercepts all pointer events — click `.newsletter-decline` before interacting (decline is recorded server-side per user).
- Login form on `/login`: `#email`, `#password`, `button[type=submit]`.

## Gotchas that bit before

- `.hm-reveal` elements are opacity-0 until scrolled into view (editorial.js IO). After a programmatic scroll, wait ~900ms before screenshotting or the section looks blank.
- Home-study flow (`/adopt/home-study`): submissions are async — if you "Start over" and begin a new run while a previous `POST /api/home-study-submission` is in flight, its resolution overwrites the new run's localStorage state. Wait until `[data-submit-status]` is no longer "Sending…" before starting over.
- A submitted home-study run intentionally does **not** resume on reload; only unsubmitted mid-flow state resumes.
- One console 401 (`/auth/me` on unauthenticated pages) is normal.
- legacy styles.css paints deep defaults (`.hs-screen` white card, `.readiness-callout p` dark text, `.btn` ripple via script.js) — when restyling, check computed styles at the surface, not just the page CSS.

## Flows worth driving on /adopt/home-study

Path A (completed: state→agency→date; >24-months date shows expired note), Path B (screener: `#bState` incl. `INTL`; disqualify via "no" on q1; pass via yes,yes,**no**,yes… per `disqualifyOn`), config-error (block `/adopt/home-study-config.json`), prep checklists (`#docsProgress`/`#homeProgress` + localStorage persistence), 380px viewport, `reducedMotion: 'reduce'` (hero canvas must render a static drawn frame).
