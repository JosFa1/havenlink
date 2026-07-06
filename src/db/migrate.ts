/**
 * Minimal migration runner: applies src/db/schema.sql (idempotent).
 * Run with `npm run migrate`. Safe to run repeatedly.
 *
 * Because this runs as the FIRST step of the container command
 * (`npm run migrate:prod && node dist/app.js`), a database that is briefly
 * unreachable at boot — RDS mid-failover, just resumed from stopped, or a
 * transient network blip — would otherwise kill the whole task and trip the
 * ECS deployment circuit breaker, rolling back the deploy. To absorb those
 * transient cases we first wait for Postgres to accept connections, retrying
 * with backoff up to a bounded budget. A database that is genuinely down still
 * fails after the budget so the deploy fails loudly rather than starting the
 * app with no database.
 */
import fs from "fs";
import path from "path";
import { Client } from "pg";
import { pool } from "./pool";
import { config } from "../config";
import { sslConfig } from "./pool";

/** How long to wait for Postgres to become reachable before giving up. */
const DB_WAIT_SECONDS = (() => {
  const raw = Number(process.env.MIGRATE_DB_WAIT_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? raw : 90;
})();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * `tsc` does not copy .sql files into dist/, so when running compiled
 * (dist/db/migrate.js) the schema lives back in src/. Try the co-located copy
 * first, then fall back to the source tree.
 */
function readSchema(): string {
  const candidates = [
    path.join(__dirname, "schema.sql"),
    path.join(process.cwd(), "src", "db", "schema.sql"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  }
  throw new Error(`schema.sql not found (looked in: ${candidates.join(", ")})`);
}

/**
 * Probe Postgres until it accepts a connection, or the wait budget is exhausted.
 * Connects to the always-present `postgres` maintenance DB so this succeeds even
 * before our application database has been created. Any connection-phase error
 * is treated as retryable — the point is purely to wait out a DB that is still
 * coming up. Real SQL/schema errors surface later, un-retried, in main().
 */
async function waitForPostgres(): Promise<void> {
  const deadline = Date.now() + DB_WAIT_SECONDS * 1000;
  let attempt = 0;
  let lastErr: unknown;
  let delayMs = 2000; // backs off to a 10s cap between attempts

  while (Date.now() < deadline) {
    attempt++;
    const client = new Client({
      connectionString: maintenanceConnectionString(),
      ssl: sslConfig(),
      connectionTimeoutMillis: 5000,
    });
    try {
      await client.connect();
      await client.query("SELECT 1");
      await client.end();
      if (attempt > 1) {
        console.log(`Postgres reachable after ${attempt} attempts.`);
      }
      return;
    } catch (err) {
      lastErr = err;
      await client.end().catch(() => {});
      const elapsed = Math.round((Date.now() - (deadline - DB_WAIT_SECONDS * 1000)) / 1000);
      console.warn(
        `Postgres not ready (attempt ${attempt}, ${elapsed}s/${DB_WAIT_SECONDS}s): ` +
          `${err instanceof Error ? err.message : String(err)}`
      );
      if (Date.now() + delayMs >= deadline) break;
      await sleep(delayMs);
      delayMs = Math.min(delayMs * 2, 10000);
    }
  }

  throw new Error(
    `Database not reachable after ${DB_WAIT_SECONDS}s: ` +
      `${lastErr instanceof Error ? lastErr.message : String(lastErr)}`
  );
}

async function main() {
  const dbHost = (() => {
    try {
      return new URL(config.DATABASE_URL).hostname;
    } catch {
      return "(unparsed)";
    }
  })();
  console.log(
    `Starting database migration against ${dbHost} ` +
      `(waiting up to ${DB_WAIT_SECONDS}s for the database)...`
  );
  await waitForPostgres();
  await ensureDatabaseExists();
  await pool.query(readSchema());
  console.log("Migration applied successfully.");
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function maintenanceConnectionString(): string {
  const url = new URL(config.DATABASE_URL);
  url.pathname = "/postgres";
  return url.toString();
}

async function ensureDatabaseExists(): Promise<void> {
  const targetDb = new URL(config.DATABASE_URL).pathname.replace(/^\/+/, "");
  if (!targetDb || targetDb === "postgres") return;

  const client = new Client({
    connectionString: maintenanceConnectionString(),
    ssl: sslConfig(),
  });

  await client.connect();
  try {
    const existing = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [targetDb]
    );
    if (existing.rowCount && existing.rowCount > 0) return;
    await client.query(`CREATE DATABASE ${quoteIdentifier(targetDb)}`);
    console.log(`Created missing database ${targetDb}.`);
  } finally {
    await client.end();
  }
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(
      "Migration failed:",
      err instanceof Error ? err.stack ?? err.message : String(err)
    );
    pool.end().finally(() => process.exit(1));
  });
