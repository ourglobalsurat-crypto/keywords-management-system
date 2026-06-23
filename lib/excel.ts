import * as XLSX from "xlsx";
import { normalizeMatchType, GEO_TIER_LABELS } from "./constants";
import type { GeoTier } from "./constants";
import type { Keyword, NegativeKeyword, GeoLocation, Seed } from "./types";

// ───────────────────────────────────────────────────────────────
// Parsed shapes (no ids / audit columns — those are added on insert).
// ───────────────────────────────────────────────────────────────
export type ParsedKeyword = {
  list_type: "b2b" | "brand_series";
  campaign: string;
  ad_group: string;
  keyword: string;
  match_type: ReturnType<typeof normalizeMatchType>;
  intent_cluster: string;
  priority: string;
  notes: string;
};
export type ParsedNegative = {
  category: string;
  keyword: string;
  match_type: ReturnType<typeof normalizeMatchType>;
  notes: string;
};
export type ParsedGeo = { tier: GeoTier; location: string };
export type ParsedSeed = { seed_term: string; seed_url: string; source_site: string };

export type ParsedWorkbook = {
  keywords: ParsedKeyword[];
  negatives: ParsedNegative[];
  geo: ParsedGeo[];
  seeds: ParsedSeed[];
  sheetsFound: string[];
};

const norm = (s: unknown) => String(s ?? "").trim();
const lc = (s: unknown) => norm(s).toLowerCase();

// Pull a value from a row object by trying several candidate header names.
function pick(row: Record<string, unknown>, candidates: string[]): string {
  const map: Record<string, unknown> = {};
  for (const k of Object.keys(row)) map[lc(k)] = row[k];
  for (const c of candidates) {
    const hit = map[lc(c)];
    if (hit !== undefined && norm(hit) !== "") return norm(hit);
  }
  // loose contains match
  for (const c of candidates) {
    for (const k of Object.keys(map)) {
      if (k.includes(lc(c)) && norm(map[k]) !== "") return norm(map[k]);
    }
  }
  return "";
}

function findSheet(wb: XLSX.WorkBook, needles: string[]): XLSX.WorkSheet | null {
  for (const name of wb.SheetNames) {
    const n = lc(name);
    if (needles.some((needle) => n.includes(needle))) return wb.Sheets[name];
  }
  return null;
}

function rowsOf(ws: XLSX.WorkSheet | null): Record<string, unknown>[] {
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];
}

function parseKeywordSheet(
  ws: XLSX.WorkSheet | null,
  listType: "b2b" | "brand_series"
): ParsedKeyword[] {
  return rowsOf(ws)
    .map((r) => ({
      list_type: listType,
      campaign: pick(r, ["campaign", "campaign name"]),
      ad_group: pick(r, ["ad group", "adgroup", "ad-group"]),
      keyword: pick(r, ["keyword", "keywords", "search term"]),
      match_type: normalizeMatchType(pick(r, ["match type", "match", "type"])),
      intent_cluster: pick(r, ["intent cluster", "intent", "cluster"]),
      priority: pick(r, ["priority"]),
      notes: pick(r, ["notes", "note", "rationale"]),
    }))
    .filter((k) => k.keyword !== "");
}

function parseNegativeSheet(ws: XLSX.WorkSheet | null): ParsedNegative[] {
  return rowsOf(ws)
    .map((r) => ({
      category: pick(r, ["category"]),
      keyword: pick(r, ["negative keyword", "keyword", "negative"]),
      match_type: normalizeMatchType(pick(r, ["match type", "match", "type"])),
      notes: pick(r, ["notes / rationale", "rationale", "notes", "note"]),
    }))
    .filter((n) => n.keyword !== "");
}

// The Geo & Seeds sheet holds two tables in one grid; we read it as a raw
// matrix and extract each table heuristically.
function parseGeoSeedsSheet(ws: XLSX.WorkSheet | null): {
  geo: ParsedGeo[];
  seeds: ParsedSeed[];
} {
  const geo: ParsedGeo[] = [];
  const seeds: ParsedSeed[] = [];
  if (!ws) return { geo, seeds };

  const grid = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: "",
  }) as unknown[][];

  // ── Geo table: locate a header row whose cells name the tiers ──
  const tierMatchers: Array<{ tier: GeoTier; needles: string[] }> = [
    { tier: "tier1_gta", needles: ["gta", "tier 1"] },
    { tier: "tier2_ontario", needles: ["ontario", "tier 2"] },
    { tier: "tier3_national", needles: ["national", "tier 3"] },
  ];

  let geoHeaderRow = -1;
  const colToTier: Record<number, GeoTier> = {};
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] || [];
    let hits = 0;
    row.forEach((cell, c) => {
      const v = lc(cell);
      for (const m of tierMatchers) {
        if (m.needles.some((n) => v.includes(n))) {
          colToTier[c] = m.tier;
          hits++;
        }
      }
    });
    if (hits >= 1) {
      geoHeaderRow = r;
      break;
    }
  }
  if (geoHeaderRow >= 0) {
    for (let r = geoHeaderRow + 1; r < grid.length; r++) {
      const row = grid[r] || [];
      for (const cStr of Object.keys(colToTier)) {
        const c = Number(cStr);
        const loc = norm(row[c]);
        if (loc) geo.push({ tier: colToTier[c], location: loc });
      }
    }
  }

  // ── Seeds table: locate a header row mentioning "seed" ──
  let seedHeaderRow = -1;
  let seedTermCol = -1;
  let seedUrlCol = -1;
  const siteCols: number[] = [];
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r] || [];
    const idxTerm = row.findIndex((c) => lc(c).includes("seed term"));
    const idxUrl = row.findIndex((c) => lc(c).includes("seed url"));
    if (idxTerm >= 0 || idxUrl >= 0) {
      seedHeaderRow = r;
      seedTermCol = idxTerm;
      seedUrlCol = idxUrl;
      row.forEach((c, i) => {
        const v = lc(c);
        if (
          (v.includes(".com") || v.includes("site") || v.includes("competitor")) &&
          i !== idxTerm &&
          i !== idxUrl
        )
          siteCols.push(i);
      });
      break;
    }
  }
  if (seedHeaderRow >= 0) {
    for (let r = seedHeaderRow + 1; r < grid.length; r++) {
      const row = grid[r] || [];
      const term = seedTermCol >= 0 ? norm(row[seedTermCol]) : "";
      const url = seedUrlCol >= 0 ? norm(row[seedUrlCol]) : "";
      const site = siteCols.map((c) => norm(row[c])).filter(Boolean).join(", ");
      if (term || url) seeds.push({ seed_term: term, seed_url: url, source_site: site });
    }
  }

  return { geo, seeds };
}

export function parseWorkbook(buffer: ArrayBuffer | Buffer): ParsedWorkbook {
  const wb = XLSX.read(buffer, { type: "buffer" });

  const b2b = findSheet(wb, ["b2b"]);
  const brand = findSheet(wb, ["brand", "series"]);
  const neg = findSheet(wb, ["negative"]);
  const geoSeeds = findSheet(wb, ["geo", "seed"]);

  const { geo, seeds } = parseGeoSeedsSheet(geoSeeds);

  return {
    keywords: [
      ...parseKeywordSheet(b2b, "b2b"),
      ...parseKeywordSheet(brand, "brand_series"),
    ],
    negatives: parseNegativeSheet(neg),
    geo,
    seeds,
    sheetsFound: wb.SheetNames,
  };
}

// ───────────────────────────────────────────────────────────────
// Export: full Excel backup mirroring the original 4-sheet layout.
// ───────────────────────────────────────────────────────────────
export function buildExcelBackup(data: {
  keywords: Keyword[];
  negatives: NegativeKeyword[];
  geo: GeoLocation[];
  seeds: Seed[];
}): Buffer {
  const wb = XLSX.utils.book_new();

  const kwRows = (lt: "b2b" | "brand_series") =>
    data.keywords
      .filter((k) => k.list_type === lt)
      .map((k) => ({
        Campaign: k.campaign,
        "Ad Group": k.ad_group,
        Keyword: k.keyword,
        "Match Type": k.match_type,
        "Intent Cluster": k.intent_cluster,
        Priority: k.priority,
        Status: k.status,
        Notes: k.notes,
      }));

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(kwRows("b2b")),
    "B2B Keywords"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(kwRows("brand_series")),
    "Brand & Series"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(
      data.negatives.map((n) => ({
        Category: n.category,
        "Negative Keyword": n.keyword,
        "Match Type": n.match_type,
        Status: n.status,
        "Notes / Rationale": n.notes,
      }))
    ),
    "Negative Keywords"
  );

  // Geo & Seeds — geo grouped into tier columns, seeds table below.
  const geoByTier: Record<string, string[]> = {};
  for (const g of data.geo) (geoByTier[g.tier] ||= []).push(g.location);
  const tiers = Object.keys(GEO_TIER_LABELS) as GeoTier[];
  const maxLen = Math.max(0, ...tiers.map((t) => (geoByTier[t] || []).length));
  const geoMatrix: unknown[][] = [tiers.map((t) => GEO_TIER_LABELS[t])];
  for (let i = 0; i < maxLen; i++) {
    geoMatrix.push(tiers.map((t) => (geoByTier[t] || [])[i] || ""));
  }
  geoMatrix.push([]);
  geoMatrix.push(["Seed term", "Seed URL", "Source site(s)"]);
  for (const s of data.seeds) {
    geoMatrix.push([s.seed_term, s.seed_url, s.source_site]);
  }
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(geoMatrix),
    "Geo & Seeds"
  );

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// ───────────────────────────────────────────────────────────────
// Export: Google Ads Editor-ready CSV.
// Columns follow Google Ads Editor's import layout so the file can be
// pasted/imported directly. "On Hold" maps to Paused (Editor has no hold).
// Removed keywords are excluded.
// ───────────────────────────────────────────────────────────────
function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildGoogleAdsCsv(data: {
  keywords: Keyword[];
  negatives: NegativeKeyword[];
}): string {
  const editorMatch: Record<string, string> = {
    broad: "Broad",
    phrase: "Phrase",
    exact: "Exact",
  };
  const editorStatus = (s: string) =>
    s === "active" ? "Enabled" : "Paused"; // paused + hold => Paused

  const header = [
    "Campaign",
    "Ad Group",
    "Keyword",
    "Criterion Type",
    "Match Type",
    "Status",
  ];
  const rows: string[][] = [header];

  for (const k of data.keywords) {
    if (k.status === "removed") continue;
    rows.push([
      k.campaign,
      k.ad_group,
      k.keyword,
      "Keyword",
      editorMatch[k.match_type] || "Broad",
      editorStatus(k.status),
    ]);
  }
  for (const n of data.negatives) {
    if (n.status === "removed") continue;
    rows.push([
      n.category, // use category as the campaign grouping for negatives
      "",
      n.keyword,
      "Negative Keyword",
      editorMatch[n.match_type] || "Broad",
      "Enabled",
    ]);
  }

  return rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
}
