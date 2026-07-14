/**
 * Repository for the Post-Adoption Resource Finder: ZIP centroid lookup + proximity
 * search over the `resources` table. All SQL touching these tables lives here so the
 * route stays declarative (mirrors src/db/users.ts).
 *
 * Proximity runs on stock Postgres — no PostGIS. A bounding-box prefilter (index-
 * friendly, using the (lat,lng) index) narrows candidates, then the Haversine great-
 * circle distance filters + orders exactly. Fast for the ~48k-row curated dataset.
 */
import { query } from "./pool";

export interface ZipCentroid {
  zip: string;
  lat: number;
  lng: number;
  city: string | null;
  state: string | null;
}

export interface NearbyResource {
  id: string;
  name: string;
  category: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number;
  lng: number;
  distance_miles: number;
}

export async function findZipCentroid(zip: string): Promise<ZipCentroid | null> {
  const { rows } = await query<ZipCentroid>(
    `SELECT zip, lat, lng, city, state FROM zip_centroids WHERE zip = $1`,
    [zip]
  );
  return rows[0] ?? null;
}

/** Miles of latitude per degree (constant); longitude scales by cos(latitude). */
const MILES_PER_DEG_LAT = 69.0;

/**
 * Resources of the given categories within `radiusMiles` of (lat,lng), nearest first.
 * `$1` lat, `$2` lng, `$3` radiusMiles, `$4` category[] , `$5` limit.
 */
export async function findNearby(opts: {
  lat: number;
  lng: number;
  radiusMiles: number;
  categories: string[];
  limit?: number;
}): Promise<NearbyResource[]> {
  const { lat, lng, radiusMiles, categories, limit = 60 } = opts;
  const { rows } = await query<NearbyResource>(
    `
    WITH bounds AS (
      SELECT
        $3::float8 / ${MILES_PER_DEG_LAT}                              AS dlat,
        $3::float8 / (${MILES_PER_DEG_LAT} * cos(radians($1::float8))) AS dlng
    )
    SELECT r.id, r.name, r.category, r.phone, r.email, r.website,
           r.address, r.city, r.state, r.zip, r.lat, r.lng,
           round((3959 * acos(least(1,
             cos(radians($1)) * cos(radians(r.lat)) * cos(radians(r.lng) - radians($2))
             + sin(radians($1)) * sin(radians(r.lat))
           )))::numeric, 1)::float8 AS distance_miles
    FROM resources r, bounds b
    WHERE r.category = ANY($4::text[])
      AND r.lat BETWEEN $1 - b.dlat AND $1 + b.dlat
      AND r.lng BETWEEN $2 - b.dlng AND $2 + b.dlng
      AND (3959 * acos(least(1,
            cos(radians($1)) * cos(radians(r.lat)) * cos(radians(r.lng) - radians($2))
            + sin(radians($1)) * sin(radians(r.lat))
          ))) <= $3
    ORDER BY distance_miles ASC, r.name ASC
    LIMIT $5
    `,
    [lat, lng, radiusMiles, categories, limit]
  );
  return rows;
}
