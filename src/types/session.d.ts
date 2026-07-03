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
  }
}
