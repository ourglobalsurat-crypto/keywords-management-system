// Shared enums / option lists used across the app.

export const MATCH_TYPES = ["broad", "phrase", "exact"] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

export const LIST_TYPES = ["b2b", "brand_series"] as const;
export type ListType = (typeof LIST_TYPES)[number];

export const LIST_TYPE_LABELS: Record<ListType, string> = {
  b2b: "B2B Keywords",
  brand_series: "Brand & Series",
};

export const STATUSES = ["active", "paused", "hold", "removed"] as const;
export type Status = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<Status, string> = {
  active: "Active",
  paused: "Paused",
  hold: "On Hold",
  removed: "Removed",
};

export const GEO_TIERS = ["tier1_gta", "tier2_ontario", "tier3_national"] as const;
export type GeoTier = (typeof GEO_TIERS)[number];

export const GEO_TIER_LABELS: Record<GeoTier, string> = {
  tier1_gta: "GTA Core (Tier 1 — Budget)",
  tier2_ontario: "Rest of Ontario (Tier 2)",
  tier3_national: "National (Tier 3 — Test)",
};

export type Role = "client" | "agency";

export const ROLE_LABELS: Record<Role, string> = {
  client: "Client",
  agency: "Agency",
};

export const ACTIONS = [
  "add",
  "edit",
  "pause",
  "hold",
  "resume",
  "remove",
  "restore",
  "purge",
  "import",
  "export",
  "login",
] as const;
export type Action = (typeof ACTIONS)[number];

// Normalises any free-text match type from an Excel cell into our enum.
export function normalizeMatchType(value: unknown): MatchType {
  const v = String(value ?? "").trim().toLowerCase().replace(/[\[\]"]/g, "");
  if (v.startsWith("ex")) return "exact";
  if (v.startsWith("ph") || v.startsWith('"')) return "phrase";
  return "broad";
}
