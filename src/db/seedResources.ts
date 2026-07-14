/**
 * Loads the Post-Adoption Resource Finder data (zip_centroids + resources) from the
 * committed, gzipped artifacts in src/data/ into Postgres. Runs via `npm run seed`
 * (dev) / `npm run seed:prod` (compiled), and in production as a boot step BEFORE the
 * app starts (see Dockerfile CMD), right after the idempotent migration.
 *
 * Change-gated: the seed compares the committed DATA_VERSION (resources.meta.json) to
 * the last-loaded version in `resource_data_meta`. If they match it no-ops in
 * milliseconds, so re-running on every deploy boot is cheap. When the version differs
 * it does a single transactional full-replace of both tables (readers keep seeing the
 * old data until COMMIT — and in prod the app isn't up yet anyway).
 *
 * The `resources`/`zip_centroids` tables are entirely ETL-managed (the seed is their
 * only writer), so a full replace is the correct refresh.
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { pool } from "./pool";

interface ResourceRow {
  source: string; source_id: string; name: string; category: string;
  phone: string | null; email: string | null; website: string | null;
  address: string | null; city: string | null; state: string | null;
  zip: string | null; lat: number; lng: number;
}

/** tsc does not copy src/data into dist/, so resolve against the source tree first. */
function dataDir(): string {
  const candidates = [
    path.join(process.cwd(), "src", "data"),
    path.join(__dirname, "..", "..", "src", "data"),
    path.join(__dirname, "..", "data"),
  ];
  for (const d of candidates) {
    if (fs.existsSync(path.join(d, "resources.meta.json"))) return d;
  }
  throw new Error(`resource data artifacts not found (looked in: ${candidates.join(", ")})`);
}

function gunzipText(file: string): string {
  return zlib.gunzipSync(fs.readFileSync(file)).toString("utf8");
}

/** Parse the ZIP centroid CSV (header: zip,lat,lng,city,state; city may be quoted). */
function parseZipCsv(text: string): [string, number, number, string | null, string | null][] {
  const out: [string, number, number, string | null, string | null][] = [];
  const lines = text.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    // city is the only field that may be quoted/contain a comma.
    const m = line.match(/^(\d{5}),([^,]+),([^,]+),("(?:[^"]|"")*"|[^,]*),([A-Z]{0,2})$/);
    if (!m) continue;
    const city = m[4].startsWith('"') ? m[4].slice(1, -1).replace(/""/g, '"') : m[4];
    out.push([m[1], Number(m[2]), Number(m[3]), city || null, m[5] || null]);
  }
  return out;
}

/** Insert rows in parameterized batches (bounded well under Postgres' 65535 params). */
async function batchInsert(
  client: import("pg").PoolClient,
  sql: (valuesSql: string) => string,
  rows: unknown[][],
  perRow: number,
  batchSize = 800
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const values: unknown[] = [];
    const tuples = chunk.map((r, ri) => {
      const base = ri * perRow;
      values.push(...r);
      return `(${Array.from({ length: perRow }, (_, k) => `$${base + k + 1}`).join(",")})`;
    });
    await client.query(sql(tuples.join(",")), values);
  }
}

async function main() {
  const dir = dataDir();
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "resources.meta.json"), "utf8"));
  const version: string = meta.version;

  const existing = await pool
    .query<{ version: string }>("SELECT version FROM resource_data_meta LIMIT 1")
    .catch(() => ({ rows: [] as { version: string }[] }));
  if (existing.rows[0]?.version === version) {
    console.log(`Resource data already at version ${version}; skipping seed.`);
    await pool.end();
    return;
  }

  console.log(`Seeding resource data -> version ${version} ...`);
  const zips = parseZipCsv(gunzipText(path.join(dir, "zip_centroids.csv.gz")));
  const resources: ResourceRow[] = gunzipText(path.join(dir, "resources.ndjson.gz"))
    .split("\n").filter(Boolean).map((l) => JSON.parse(l));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM resources");
    await client.query("DELETE FROM zip_centroids");

    await batchInsert(
      client,
      (v) => `INSERT INTO zip_centroids (zip, lat, lng, city, state) VALUES ${v}`,
      zips as unknown[][],
      5
    );

    await batchInsert(
      client,
      (v) => `INSERT INTO resources
        (source, source_id, name, category, phone, email, website, address, city, state, zip, lat, lng)
        VALUES ${v}`,
      resources.map((r) => [
        r.source, r.source_id, r.name, r.category, r.phone, r.email, r.website,
        r.address, r.city, r.state, r.zip, r.lat, r.lng,
      ]),
      13
    );

    await client.query(
      `INSERT INTO resource_data_meta (singleton, version, loaded_at)
       VALUES (true, $1, now())
       ON CONFLICT (singleton) DO UPDATE SET version = EXCLUDED.version, loaded_at = now()`,
      [version]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  console.log(
    `Seed complete: ${zips.length} zip_centroids, ${resources.length} resources.`
  );
  await pool.end();
}

main().catch((err) => {
  console.error("Resource seed failed:", err instanceof Error ? err.stack ?? err.message : String(err));
  pool.end().finally(() => process.exit(1));
});
