/**
 * Post-Adoption Resource Finder API (Step 4).
 *
 *   GET /api/resources?zip=&categories=&radius=  — nearby resources for a ZIP
 *   GET /api/resources/maps-config               — the browser Google Maps key
 *
 * Behind requireAuth (the finder page is part of the gated adoption flow) and rate
 * limited to bound abuse. Data is served entirely from our own Postgres; the only
 * third party is Google Maps, used purely to render the returned points client-side.
 */
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { config } from "../config";
import { requireAuth } from "../middleware/requireAuth";
import { findNearby, findZipCentroid } from "../db/resources";
import { CATEGORIES, parseCategories } from "./categories";

export const resourcesRouter = Router();

const finderLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 120, // generous: a search is one call; well above normal interactive use
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many searches. Please slow down and try again shortly." },
});

const DEFAULT_RADIUS = 25;
const MIN_RADIUS = 1;
const MAX_RADIUS = 100;

function parseRadius(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return DEFAULT_RADIUS;
  return Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, n));
}

// ----- GET /api/resources/maps-config ----------------------------------------
// Lets the static page load the Maps JS with the key from env (dev .env / prod CFN),
// so the key is never hardcoded in committed HTML. The key is referrer-restricted in
// prod, so exposing it to the authenticated browser is expected.
resourcesRouter.get("/maps-config", requireAuth, (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    apiKey: config.GOOGLE_MAPS_API_KEY ?? null,
    configured: Boolean(config.GOOGLE_MAPS_API_KEY),
  });
});

// ----- GET /api/resources ----------------------------------------------------
resourcesRouter.get("/", requireAuth, finderLimiter, async (req, res) => {
  try {
    const zip = String(req.query.zip ?? "").trim();
    if (!/^\d{5}$/.test(zip)) {
      return res.status(400).json({
        error: "Enter a valid 5-digit ZIP code.",
        code: "INVALID_ZIP",
      });
    }

    const categories = parseCategories(req.query.categories);
    const radiusMiles = parseRadius(req.query.radius);

    const origin = await findZipCentroid(zip);
    if (!origin) {
      return res.status(404).json({
        error: "We couldn't locate that ZIP code. Please check it and try again.",
        code: "UNKNOWN_ZIP",
      });
    }

    const results = await findNearby({
      lat: origin.lat,
      lng: origin.lng,
      radiusMiles,
      categories,
    });

    res.set("Cache-Control", "no-store");
    res.json({
      origin,
      radiusMiles,
      categories,
      allCategories: CATEGORIES,
      count: results.length,
      results,
    });
  } catch (error) {
    console.error("Resource finder error:", error instanceof Error ? error.message : String(error));
    res.status(500).json({ error: "Something went wrong finding resources. Please try again." });
  }
});
