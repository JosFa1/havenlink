/**
 * Deterministic match-score generation. The score is a hash of
 * (userId, agencyId) — never random at request time and never accepted from
 * the client — so a family sees the identical score and factor breakdown on
 * every roll, confirm, and revisit.
 *
 * Bands: partner agencies always land in the "Excellent match" tier (88-97);
 * non-partner agencies always land in "Good match" (74-84). The tier copy
 * mirrors the legend on /adopt/matching (85-100 Excellent, 70-84 Good).
 */
import type { Agency } from "./agencies";

export interface MatchFactor {
  name: string;
  points: number;
  max: number;
}

export interface MatchScore {
  total: number;
  tier: "excellent" | "good";
  tierLabel: string;
  factors: MatchFactor[];
}

/** Factor names match the score card the matching page has always shown. */
const FACTOR_NAMES = [
  "Age range alignment",
  "Special-needs openness",
  "Sibling placement fit",
  "Trauma readiness",
  "Prior adoption experience",
];
const FACTOR_MAX = 20;

/** 32-bit FNV-1a — small, dependency-free, stable across restarts. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** The deterministic total for this (user, agency) pair. */
export function matchTotal(userId: string, agency: Agency): number {
  const hash = fnv1a(`${userId}:${agency.id}`);
  return agency.partner ? 88 + (hash % 10) : 74 + (hash % 11);
}

/**
 * Split `total` across the five factors, each capped at FACTOR_MAX, summing
 * exactly to `total`. Taking `total` as a parameter (rather than recomputing)
 * lets a stored audit score keep rendering unchanged even if the band
 * constants above are ever tuned.
 */
export function buildScore(
  userId: string,
  agencyId: string,
  total: number
): MatchScore {
  // Hash-derived per-factor weights in [1, 1.5) give each pair its own shape.
  const weights = FACTOR_NAMES.map(
    (_, i) => 1 + (fnv1a(`${userId}:${agencyId}:${i}`) % 1000) / 2000
  );
  const weightSum = weights.reduce((sum, w) => sum + w, 0);

  const raw = weights.map((w) => (total * w) / weightSum);
  const points = raw.map((r) => Math.min(FACTOR_MAX, Math.floor(r)));

  // Largest-remainder rounding: hand out the leftover points to the factors
  // with the biggest fractional loss that still have headroom. total <= 100
  // (the sum of caps), so this always terminates.
  let remainder = total - points.reduce((sum, p) => sum + p, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac)
    .map((entry) => entry.i);
  while (remainder > 0) {
    let gave = false;
    for (const i of order) {
      if (remainder === 0) break;
      if (points[i] < FACTOR_MAX) {
        points[i] += 1;
        remainder -= 1;
        gave = true;
      }
    }
    if (!gave) break; // every factor at cap; can't place more (total > 100)
  }

  const tier = total >= 85 ? "excellent" : "good";
  return {
    total,
    tier,
    tierLabel: tier === "excellent" ? "Excellent match" : "Good match",
    factors: FACTOR_NAMES.map((name, i) => ({
      name,
      points: points[i],
      max: FACTOR_MAX,
    })),
  };
}

/** Convenience: band total + factor split in one call. */
export function scoreMatch(userId: string, agency: Agency): MatchScore {
  return buildScore(userId, agency.id, matchTotal(userId, agency));
}
