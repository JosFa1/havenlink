import "express-session";

declare module "express-session" {
  interface SessionData {
    /**
     * Written when a CSRF token is first issued so the session is persisted
     * (saveUninitialized is false) and `req.sessionID` stays stable between the
     * token fetch and the subsequent state-changing request.
     */
    csrfInit?: boolean;
    /**
     * Where to send the user after a successful Google OAuth login. Set from the
     * `?next=` param before the OAuth redirect and read on the callback (before
     * req.login regenerates the session). See auth/routes.ts.
     */
    postAuthRedirect?: string;
    /**
     * Agency ids already offered on /adopt/matching during the current re-roll
     * cycle. Cleared when the state's pool is exhausted (the cycle recycles)
     * and when a match is confirmed. Always reassigned (never mutated in
     * place) so the session store reliably detects the change.
     */
    matchSeen?: string[];
    /**
     * The agency id most recently offered by POST /api/match/roll — the only
     * id POST /api/match/confirm will accept, so a user can confirm only what
     * the server actually offered them.
     */
    matchCandidate?: string;
  }
}
