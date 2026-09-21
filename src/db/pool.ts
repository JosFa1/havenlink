/**
 * Shared Postgres connection pool.
 *
 * TLS: in production we require a verified TLS connection to RDS. Point
 * `PGSSLROOTCERT` at the AWS RDS CA bundle (e.g. the global-bundle.pem) so the
 * server certificate is actually validated — `rejectUnauthorized` stays true.
 * In dev, local Postgres typically has no TLS, so SSL is disabled there.
 */
import fs from "fs";
import { Pool, type PoolClient } from "pg";
import { config } from "../config";

export function sslConfig() {
  if (!config.isProd) return false;

  const caPath = process.env.PGSSLROOTCERT;
  if (caPath && fs.existsSync(caPath)) {
    return { rejectUnauthorized: true, ca: fs.readFileSync(caPath, "utf8") };
  }
  // Still encrypt + verify against the system trust store if no explicit CA given.
  return { rejectUnauthorized: true };
}

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  ssl: sslConfig(),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on("error", (err) => {
  // A pooled idle client errored — log without leaking connection details.
  console.error("Unexpected Postgres pool error:", err.message);
});

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<{ rows: T[]; rowCount: number }> {
  const res = await pool.query(text, params as never);
  return { rows: res.rows as T[], rowCount: res.rowCount ?? 0 };
}

export async function transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query("BEGIN"); const value = await fn(client); await client.query("COMMIT"); return value; }
  catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
