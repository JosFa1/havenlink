/**
 * Route guard: allow only authenticated users with a verified email.
 * Use on any future route that exposes sensitive account data.
 */
import type { Request, Response, NextFunction } from "express";
import type { User } from "../db/users";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = req.user as User | undefined;
  if (!req.isAuthenticated?.() || !user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (!user.email_verified) {
    return res.status(403).json({ error: "Email not verified" });
  }
  next();
}
