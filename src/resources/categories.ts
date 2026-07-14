/**
 * The six Post-Adoption Resource Finder categories. `id` is the stable key stored in
 * `resources.category` and accepted by the API; `label` is the display string. Keep
 * this list in sync with the ETL category mapping (scripts/etl-resources.mjs) and the
 * checkboxes in public/adopt/resources.html.
 */
export interface ResourceCategory {
  id: string;
  label: string;
}

export const CATEGORIES: readonly ResourceCategory[] = [
  { id: "counseling", label: "Counseling" },
  { id: "trauma", label: "Trauma support" },
  { id: "financial", label: "Financial assistance" },
  { id: "support_group", label: "Support groups" },
  { id: "medical", label: "Medical services" },
  { id: "educational", label: "Educational services" },
] as const;

const VALID = new Set(CATEGORIES.map((c) => c.id));

export function isValidCategory(id: string): boolean {
  return VALID.has(id);
}

/**
 * Parse the `categories` query param (comma-separated ids) into a validated list.
 * Unknown ids are dropped. An empty/absent value means "all categories" (returns the
 * full id list), so a bare ZIP search still returns something.
 */
export function parseCategories(raw: unknown): string[] {
  if (typeof raw !== "string" || raw.trim() === "") {
    return CATEGORIES.map((c) => c.id);
  }
  const picked = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => VALID.has(s));
  return picked.length > 0 ? picked : CATEGORIES.map((c) => c.id);
}
