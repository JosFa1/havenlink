/**
 * Minimal migration runner: applies src/db/schema.sql (idempotent).
 * Run with `npm run migrate`. Safe to run repeatedly.
 */
import fs from "fs";
import path from "path";
import { pool } from "./pool";

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
  await pool.query(readSchema());
  console.log("Migration applied successfully.");
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("Migration failed:", err.message);
    pool.end().finally(() => process.exit(1));
  });
