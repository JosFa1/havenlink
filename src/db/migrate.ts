/**
 * Minimal migration runner: applies src/db/schema.sql (idempotent).
 * Run with `npm run migrate`. Safe to run repeatedly.
 */
import fs from "fs";
import path from "path";
import { Client } from "pg";
import { pool } from "./pool";
import { config } from "../config";
import { sslConfig } from "./pool";

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

async function main() {
  const dbHost = (() => {
    try {
      return new URL(config.DATABASE_URL).hostname;
    } catch {
      return "(unparsed)";
    }
  })();
  console.log(`Starting database migration against ${dbHost}...`);
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
