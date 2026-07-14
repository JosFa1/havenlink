/**
 * Offline ETL for the Post-Adoption Resource Finder (dev-only; NOT shipped in the
 * runtime image). Downloads free, public-domain U.S. government datasets, normalizes
 * each into one unified resource shape, and writes committed, gzipped artifacts that
 * src/db/seedResources.ts loads into Postgres. Deterministic: dev and prod load the
 * exact same committed data with no runtime dependency on the government sites.
 *
 * Sources:
 *   - GeoNames US postal codes  -> zip_centroids (ZIP -> lat/lng/city/state)
 *   - HRSA health center sites  -> "medical"  (ships exact lat/lng)
 *   - SAMHSA 2025 MH facilities -> "counseling" (+ "trauma"/"support_group" from
 *     service codes); no coordinates in the file, so geocoded to the ZIP centroid
 *   - src/data/curated_resources.json -> "financial"/"educational" (ZIP centroid)
 *
 * Requires the `xlsx` devDependency. Run:  npm run etl:resources
 * Raw files download into .etl-cache/ (gitignored) unless already present, or point
 * ETL_RAW_DIR at a directory that already holds US.txt/US.zip, hrsa_sites.csv,
 * samhsa_mh.xlsx.
 *
 * Outputs (committed):
 *   src/data/zip_centroids.csv.gz
 *   src/data/resources.ndjson.gz
 *   src/data/resources.meta.json   (DATA_VERSION + row counts; the seed's change gate)
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import xlsx from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "src", "data");
const RAW_DIR = process.env.ETL_RAW_DIR || path.join(ROOT, ".etl-cache");

const SOURCES = {
  geonames: "https://download.geonames.org/export/zip/US.zip",
  hrsa: "https://data.hrsa.gov/DataDownload/DD_Files/Health_Center_Service_Delivery_and_LookAlike_Sites.csv",
  samhsa: "https://www.samhsa.gov/data/sites/default/files/reports/rpt57010/2025_MH_Facilities_for_All_City_All.xlsx",
};

// Contiguous + AK/HI/territories bounding box; rejects obviously bad geocodes.
const inUS = (lat, lng) =>
  Number.isFinite(lat) && Number.isFinite(lng) &&
  lat >= 17 && lat <= 72 && lng >= -180 && lng <= -64;

const zip5 = (v) => {
  const m = String(v ?? "").match(/\d{5}/);
  return m ? m[0] : null;
};
const clean = (v) => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s.length ? s : null;
};

async function download(url, dest) {
  process.stdout.write(`  downloading ${path.basename(dest)} ... `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  console.log(`${(buf.length / 1e6).toFixed(1)} MB`);
}

async function ensureRaw(name, url, file) {
  const p = path.join(RAW_DIR, file);
  if (fs.existsSync(p)) return p;
  fs.mkdirSync(RAW_DIR, { recursive: true });
  await download(url, p);
  return p;
}

/** Extract US.txt from GeoNames US.zip using the OS unzip (cross-platform fallback). */
function ensureGeoNamesTxt() {
  const txt = path.join(RAW_DIR, "US.txt");
  if (fs.existsSync(txt)) return txt;
  const zip = path.join(RAW_DIR, "US.zip");
  try {
    execFileSync("unzip", ["-o", zip, "-d", RAW_DIR], { stdio: "ignore" });
  } catch {
    execFileSync("powershell", [
      "-NoProfile", "-Command",
      `Expand-Archive -Force -LiteralPath '${zip}' -DestinationPath '${RAW_DIR}'`,
    ], { stdio: "ignore" });
  }
  return txt;
}

/** Minimal RFC-4180 CSV parser (handles quotes, embedded commas, CRLF). */
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\r") { /* skip */ }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ------------------------------------------------------------------ zip centroids
function loadZipCentroids(txtPath) {
  const zipMap = new Map(); // zip -> {lat,lng,city,state}
  const lines = fs.readFileSync(txtPath, "utf8").split("\n");
  for (const line of lines) {
    if (!line) continue;
    const c = line.split("\t");
    const zip = zip5(c[1]);
    const lat = Number(c[9]), lng = Number(c[10]);
    if (!zip || zipMap.has(zip) || !inUS(lat, lng)) continue;
    zipMap.set(zip, { lat, lng, city: clean(c[2]), state: clean(c[4]) });
  }
  return zipMap;
}

// ------------------------------------------------------------------------- HRSA
function loadHRSA(csvPath) {
  const rows = parseCSV(fs.readFileSync(csvPath, "utf8"));
  const header = rows[0].map((h) => h.trim());
  const col = (name) => header.indexOf(name);
  const iName = col("Site Name"), iAddr = col("Site Address"), iCity = col("Site City"),
    iState = col("Site State Abbreviation"), iZip = col("Site Postal Code"),
    iPhone = col("Site Telephone Number"), iWeb = col("Site Web Address"),
    iStatus = col("Site Status Description"),
    iX = col("Geocoding Artifact Address Primary X Coordinate"),
    iY = col("Geocoding Artifact Address Primary Y Coordinate");
  const out = [];
  const seen = new Set();
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.length < header.length - 2) continue;
    if (!/active/i.test(row[iStatus] || "")) continue;
    const lat = Number(row[iY]), lng = Number(row[iX]);
    const name = clean(row[iName]);
    const zip = zip5(row[iZip]);
    if (!name || !inUS(lat, lng)) continue;
    const key = `${name}|${clean(row[iAddr])}|${zip}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      source: "hrsa", source_id: key, name, category: "medical",
      phone: clean(row[iPhone]), email: null, website: clean(row[iWeb]),
      address: clean(row[iAddr]), city: clean(row[iCity]), state: clean(row[iState]),
      zip, lat, lng,
    });
  }
  return out;
}

// ------------------------------------------------------------------------ SAMHSA
function loadSAMHSA(xlsxPath, zipMap) {
  const wb = xlsx.readFile(xlsxPath);
  const ws = wb.Sheets["Facilities List"];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, blankrows: false });
  // cols: 0 name1,1 name2,2 street1,3 street2,4 city,5 state,6 zip,7 phone, ... 12 service_code_info
  const out = [];
  const seen = new Set();
  let noCentroid = 0;
  for (let r = 1; r < rows.length; r++) {
    const c = rows[r];
    const name1 = clean(c[0]), name2 = clean(c[1]);
    const name = [name1, name2].filter(Boolean).join(" — ");
    const zip = zip5(c[6]);
    if (!name || !zip) continue;
    const centroid = zipMap.get(zip);
    if (!centroid) { noCentroid++; continue; }
    const address = [clean(c[2]), clean(c[3])].filter(Boolean).join(", ") || null;
    const codes = new Set(String(c[12] ?? "").toUpperCase().split(/[^A-Z0-9/]+/).filter(Boolean));
    const cats = ["counseling"];
    if (codes.has("TRMA") || codes.has("PTSD")) cats.push("trauma");
    if (codes.has("PEER")) cats.push("support_group");
    const base = `${name}|${address}|${zip}`.toLowerCase();
    for (const category of cats) {
      const source_id = `${base}#${category}`;
      if (seen.has(source_id)) continue;
      seen.add(source_id);
      out.push({
        source: "samhsa", source_id, name, category,
        phone: clean(c[7]), email: null, website: null,
        address, city: clean(c[4]), state: clean(c[5]), zip,
        lat: centroid.lat, lng: centroid.lng,
      });
    }
  }
  if (noCentroid) console.log(`  SAMHSA: ${noCentroid} rows skipped (ZIP not in centroid table)`);
  return out;
}

// ----------------------------------------------------------------------- curated
function loadCurated(zipMap) {
  const p = path.join(DATA_DIR, "curated_resources.json");
  if (!fs.existsSync(p)) return [];
  const { resources } = JSON.parse(fs.readFileSync(p, "utf8"));
  const out = [];
  for (const e of resources || []) {
    const zip = zip5(e.zip);
    const centroid = zip ? zipMap.get(zip) : null;
    if (!e.name || !e.category || !centroid) continue;
    const slug = String(e.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    out.push({
      source: "curated", source_id: `${slug}#${e.category}`, name: e.name,
      category: e.category, phone: e.phone ?? null, email: e.email ?? null,
      website: e.website ?? null, address: e.address ?? null,
      city: e.city ?? centroid.city, state: e.state ?? centroid.state, zip,
      lat: centroid.lat, lng: centroid.lng,
    });
  }
  return out;
}

// --------------------------------------------------------------------------- main
async function main() {
  console.log("ETL: acquiring raw sources...");
  await ensureRaw("geonames", SOURCES.geonames, "US.zip");
  const geoTxt = ensureGeoNamesTxt();
  const hrsaCsv = await ensureRaw("hrsa", SOURCES.hrsa, "hrsa_sites.csv");
  const samhsaXlsx = await ensureRaw("samhsa", SOURCES.samhsa, "samhsa_mh.xlsx");

  console.log("ETL: normalizing...");
  const zipMap = loadZipCentroids(geoTxt);
  console.log(`  zip_centroids: ${zipMap.size}`);
  const hrsa = loadHRSA(hrsaCsv);
  console.log(`  hrsa (medical): ${hrsa.length}`);
  const samhsa = loadSAMHSA(samhsaXlsx, zipMap);
  console.log(`  samhsa (counseling/trauma/support_group): ${samhsa.length}`);
  const curated = loadCurated(zipMap);
  console.log(`  curated (financial/educational): ${curated.length}`);

  const resources = [...hrsa, ...samhsa, ...curated];
  const byCat = {};
  for (const r of resources) byCat[r.category] = (byCat[r.category] || 0) + 1;

  fs.mkdirSync(DATA_DIR, { recursive: true });

  // zip_centroids.csv.gz
  let csv = "zip,lat,lng,city,state\n";
  for (const [zip, v] of zipMap) {
    const city = v.city ? `"${v.city.replace(/"/g, '""')}"` : "";
    csv += `${zip},${v.lat},${v.lng},${city},${v.state ?? ""}\n`;
  }
  fs.writeFileSync(path.join(DATA_DIR, "zip_centroids.csv.gz"), zlib.gzipSync(csv));

  // resources.ndjson.gz
  const ndjson = resources.map((r) => JSON.stringify(r)).join("\n") + "\n";
  fs.writeFileSync(path.join(DATA_DIR, "resources.ndjson.gz"), zlib.gzipSync(ndjson));

  // meta / change gate
  const version = `${new Date().toISOString().slice(0, 10)}+r${resources.length}+z${zipMap.size}`;
  const meta = {
    version,
    generatedAt: new Date().toISOString(),
    counts: { zip_centroids: zipMap.size, resources: resources.length, byCategory: byCat },
    sources: SOURCES,
  };
  fs.writeFileSync(path.join(DATA_DIR, "resources.meta.json"), JSON.stringify(meta, null, 2) + "\n");

  console.log("\nETL: wrote artifacts to src/data/");
  console.log(`  DATA_VERSION = ${version}`);
  console.log(`  by category:`, byCat);
}

main().catch((e) => { console.error("ETL failed:", e); process.exit(1); });
