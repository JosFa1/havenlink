# HavenLink Authentication & Account Linking

Secure user accounts via **Google OAuth2** and **email + password**, with email
verification and account linking. Sessions are server-side (Postgres-backed).

## Architecture

- **Server:** the full Express app (static site + API + auth) runs as one origin.
  In production it is containerized ([Dockerfile](../Dockerfile)) for **AWS App Runner**
  (or ECS / Elastic Beanstalk Docker platform).
- **Database:** **AWS RDS Postgres** (encryption at rest, TLS in transit).
- **Sessions:** `express-session` + `connect-pg-simple`; opaque, httpOnly, Secure,
  SameSite=Lax signed cookie. State lives in the `session` table (server-side revocable).
- **Passwords:** argon2id.
- **CSRF:** `csrf-csrf` double-submit on state-changing POSTs; OAuth `state` on the
  Google round-trip.

> ⚠️ **Rotate the Google client secret.** The secret was shared in plaintext during
> setup; treat it as compromised. Regenerate it in Google Cloud Console and store only
> the new value (Secrets Manager / local `.env`).

## Account-linking rules

| Scenario | Behavior |
|---|---|
| Google login, known `google_sub` | Log in (returning Google user). |
| Google login, verified email matches existing account | Link `google_sub` to it, mark verified, log in (works for password or passwordless accounts). |
| Google login, no match | Silently create a **passwordless**, email-verified account. |
| Google login, **unverified** Google email | Refused (anti-takeover). |
| Password signup, email already a **password** account | "An account already exists, please log in." |
| Password signup, email is a **Google-only** account | "This email uses Google sign-in." |
| Password signup, new email | Create account, send verification email; unusable until verified. |
| Password login, correct password + verified | Log in. |
| Password login, unverified | Blocked; resend available. |
| Password login, Google-only account | "Use Google sign-in." |

## Routes (mounted at `/auth`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/auth/csrf` | Issue a CSRF token (JSON `{ csrfToken }`). |
| POST | `/auth/signup` | Email+password signup. |
| POST | `/auth/login` | Email+password login. |
| POST | `/auth/logout` | Destroy session. |
| GET | `/auth/google` | Begin Google OAuth. |
| GET | `/auth/google/callback` | OAuth callback (must match Google console). |
| GET | `/auth/verify-email?token=…` | Consume a verification token. |
| POST | `/auth/resend-verification` | Resend verification email (generic response). |
| GET | `/auth/me` | Current user (`{ authenticated, user }`). |

## Environment variables

See [.env.example](../.env.example). Required: `APP_BASE_URL`, `DATABASE_URL`,
`SESSION_SECRET` (≥32 chars), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`GOOGLE_CALLBACK_URL`, `EMAIL_USER`, `EMAIL_PASSWORD`.

Generate a session secret:
```
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Google Cloud Console

Authorized redirect URIs (exact match):
- `http://localhost:3000/auth/google/callback` (dev)
- `https://YOUR_DOMAIN/auth/google/callback` (prod)

No Authorized JavaScript origins are needed (server-side flow).

## Local development

1. `cp .env.example .env` and fill in values (point `DATABASE_URL` at a local/dev Postgres).
2. `npm install`
3. `npm run migrate`   # creates tables (idempotent)
4. `npm run dev`       # http://localhost:3000

## Production (AWS)

1. **RDS Postgres**: enable encryption at rest; require TLS. Create a least-privilege
   app role. Set `DATABASE_URL` with `sslmode=verify-full` and `PGSSLROOTCERT` to the
   RDS CA bundle.
2. **Secrets Manager**: store `SESSION_SECRET`, `GOOGLE_CLIENT_SECRET`, DB credentials,
   `EMAIL_PASSWORD`. Inject into App Runner as environment variables. Never commit them.
3. **Build & deploy** the [Dockerfile](../Dockerfile) to App Runner (VPC connector so it
   can reach RDS privately). App Runner provides HTTPS at the service URL / your domain.
4. **Migrate**: run `npm run migrate:prod` once against RDS (a one-off task/job) before
   serving traffic.
5. Set `APP_BASE_URL` and `GOOGLE_CALLBACK_URL` to your HTTPS domain and confirm the
   redirect URI is registered in Google Cloud Console.

> The legacy [amplify.yml](../amplify.yml) deployed `public/` as a **static** site and
> does not run the server. It is superseded by the container deployment above; remove or
> repurpose it once App Runner is live.

## Security notes / follow-ups

- CSP currently allows `'unsafe-inline'` for scripts/styles because the existing static
  pages use inline handlers. Tighten by removing inline handlers + adding nonces.
- Add a breached-password check (HIBP k-anonymity) on signup.
- Add a password-reset flow (token table + endpoints + email).
- Phase 2: migrate the sensitive intake data (currently localStorage) into the account,
  with application-level field encryption (KMS) for fields like location.
