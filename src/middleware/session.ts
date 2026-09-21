/**
 * Server-side session middleware: express-session backed by Postgres
 * (connect-pg-simple). The browser only holds an opaque, signed, httpOnly cookie;
 * all session state lives in the `session` table so it can be revoked server-side.
 */
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { config } from "../config";
import { pool } from "../db/pool";
import { DynamoSessionStore } from "../db/session-dynamo";

const PgStore = connectPgSimple(session);

export function sessionMiddleware() {
  const useDynamo = process.env.DATA_BACKEND === "dynamodb" || !!process.env.DDB_TABLE;
  return session({
    store: useDynamo ? new DynamoSessionStore() : new PgStore({ pool, tableName: "session", createTableIfMissing: false }),
    name: "havenlink.sid",
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true, // refresh maxAge on activity
    cookie: {
      httpOnly: true,
      secure: config.isProd, // HTTPS-only in prod
      sameSite: "lax", // allows the OAuth GET redirect to carry the cookie
      maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      path: "/",
    },
  });
}
