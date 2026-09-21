import fs from "fs";
import path from "path";
import zlib from "zlib";
import crypto from "crypto";

export interface ZipCentroid { zip: string; lat: number; lng: number; city: string | null; state: string | null; }
export interface NearbyResource { id: string; name: string; category: string; phone: string | null; email: string | null; website: string | null; address: string | null; city: string | null; state: string | null; zip: string | null; lat: number; lng: number; distance_miles: number; }

function dataPath(name: string): string {
  const candidates = [path.resolve(__dirname, "../data", name), path.resolve(process.cwd(), "src/data", name), path.resolve(process.cwd(), "dist/data", name)];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error(`Static data file not found: ${name}`);
  return found;
}
function csvRow(line: string): string[] {
  const cells: string[] = []; let value = ""; let quoted = false;
  for (let i = 0; i < line.length; i++) { const c = line[i]; if (c === '"') { if (quoted && line[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; } else if (c === "," && !quoted) { cells.push(value); value = ""; } else value += c; }
  cells.push(value); return cells;
}
function readGzip(name: string): string { return zlib.gunzipSync(fs.readFileSync(dataPath(name))).toString("utf8"); }

const centroids = new Map<string, ZipCentroid>();
const centroidLines = readGzip("zip_centroids.csv.gz").trim().split(/\r?\n/);
const centroidHeader = csvRow(centroidLines.shift() ?? "").map((v) => v.trim().toLowerCase());
for (const line of centroidLines) { const c = csvRow(line); const row: any = {}; centroidHeader.forEach((h, i) => row[h] = c[i]); if (row.zip) centroids.set(String(row.zip).padStart(5, "0"), { zip: String(row.zip).padStart(5, "0"), lat: Number(row.lat), lng: Number(row.lng), city: row.city || null, state: row.state || null }); }

const resources: NearbyResource[] = readGzip("resources.ndjson.gz").trim().split(/\r?\n/).filter(Boolean).map((line) => {
  const r = JSON.parse(line); const id = r.id ?? crypto.createHash("sha1").update(`${r.source ?? "resource"}|${r.source_id ?? r.name}|${r.address ?? ""}`).digest("hex"); return { ...r, id: String(id), lat: Number(r.lat), lng: Number(r.lng), distance_miles: 0 } as NearbyResource;
});

export async function findZipCentroid(zip: string): Promise<ZipCentroid | null> { return centroids.get(String(zip).trim().padStart(5, "0")) ?? null; }
const MILES_PER_DEG_LAT = 69.0;
function distanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number { const rad = Math.PI / 180; const a = Math.sin((lat2 - lat1) * rad / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lng2 - lng1) * rad / 2) ** 2; return 3959 * 2 * Math.asin(Math.min(1, Math.sqrt(a))); }
export async function findNearby(opts: { lat: number; lng: number; radiusMiles: number; categories: string[]; limit?: number }): Promise<NearbyResource[]> {
  const { lat, lng, radiusMiles, categories, limit = 60 } = opts;
  const dlat = radiusMiles / MILES_PER_DEG_LAT; const dlng = radiusMiles / (MILES_PER_DEG_LAT * Math.cos(lat * Math.PI / 180));
  return resources.filter((r) => categories.includes(r.category) && r.lat >= lat - dlat && r.lat <= lat + dlat && r.lng >= lng - dlng && r.lng <= lng + dlng).map((r) => ({ ...r, distance_miles: Math.round(distanceMiles(lat, lng, r.lat, r.lng) * 10) / 10 })).filter((r) => r.distance_miles <= radiusMiles).sort((a, b) => a.distance_miles - b.distance_miles || a.name.localeCompare(b.name)).slice(0, limit);
}
