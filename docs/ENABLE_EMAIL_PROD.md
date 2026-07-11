# Fixing production email (Amazon SES)

## Diagnosis (2026-07-10)

Prod sends transactional email via **Amazon SES SMTP**
(`email-smtp.us-east-1.amazonaws.com:587`, STARTTLS), from
`no-reply@havenlink.org`. A live test showed:

- SMTP connection + credentials: **OK** (`transporter.verify()` succeeds).
- Test send → **rejected**:
  ```
  554 Message rejected: Email address is not verified.
  The following identities failed the check in region US-EAST-1: havenlink.org@gmail.com
  ```

**Root cause:** the SES account in **us-east-1 is in the sandbox**. In the sandbox
you may only send to *verified* recipients. The sender `no-reply@havenlink.org` is
verified, but the recipient `havenlink.org@gmail.com` is not — so every flow that
emails the team inbox fails: partner form, intake form, home-study form, newsletter
opt-in. Signup email-verification (sent to arbitrary user addresses) fails for the
same reason.

This is an AWS-account fix (SES in account `930218373857`); it cannot be done from
the app or CI.

## Fix — pick based on how complete you need it

### Option A (fast): verify the team inbox — unblocks all form→team emails
Makes the four form/notification flows work immediately (they all send to
`havenlink.org@gmail.com`).

```bash
aws ses verify-email-identity \
  --email-address havenlink.org@gmail.com \
  --region us-east-1
```
Then open the "Amazon Web Services – Email Address Verification" message in the
`havenlink.org@gmail.com` inbox and click the link. Done — sends to that address
now succeed even in the sandbox.

> Signup email-verification and the partner **applicant confirmation** email go to
> arbitrary user addresses, so they still won't work under Option A. Use Option B
> for those.

### Option B (complete): request SES production access — sends to anyone
Removes the sandbox entirely; every recipient works (team inbox, applicant
confirmations, signup verification).

- SES console (us-east-1) → **Account dashboard** → **Request production access**,
  or:
  ```bash
  aws sesv2 put-account-details \
    --production-access-enabled \
    --mail-type TRANSACTIONAL \
    --website-url https://havenlink.org \
    --use-case-description "Transactional email for HavenLink: form notifications to our team inbox, applicant confirmations, and account email verification." \
    --region us-east-1
  ```
- Approval is usually granted within ~24h. Also confirm the `havenlink.org`
  domain identity has **DKIM enabled** so mail lands reliably (not spam).

## Verify the fix
No debug endpoint needed — just exercise a real flow after the change:

```bash
# Partner form posts here; a 200 (not 500) means the team email sent.
# Easiest: submit the partner form on https://havenlink.org and confirm the
# success message + the email arriving in havenlink.org@gmail.com.
```

## Notes
- No app/infra change is required; the code and SMTP credentials are correct.
- These forms email their data (there's no DB copy), so a rejected SES send makes
  the whole submission return 500 — fixing SES restores the submissions too.
