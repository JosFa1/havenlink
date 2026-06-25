import "express-session";

declare module "express-session" {
  interface SessionData {
    /**
     * Written when a CSRF token is first issued so the session is persisted
     * (saveUninitialized is false) and `req.sessionID` stays stable between the
     * token fetch and the subsequent state-changing request.
     */
    csrfInit?: boolean;
  }
}
