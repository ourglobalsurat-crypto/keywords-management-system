import JSZip from "jszip";

// ════════════════════════════════════════════════════════════════════
//  Google Ads "Download cards data" analysis engine
//
//  Ingests the ZIP of CSVs Google Ads produces, classifies each file by
//  a stable filename PATTERN (date ranges in the names change every time,
//  so we never match on exact names), parses the messy Google Ads CSV
//  format (preamble lines, totals rows, currency/%, UTF-8/16), then runs
//  an SEM analysis that produces a prioritised, expert-grade report.
//
//  This module is self-contained and never touches the rest of the app's
//  data — the Ads Suggestions section is fully isolated.
// ════════════════════════════════════════════════════════════════════

/* ───────────────────────── low-level parsing ───────────────────────── */

function decodeBuffer(buf: Uint8Array): string {
  // UTF-16 LE / BE BOM detection, else UTF-8.
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe)
    return new TextDecoder("utf-16le").decode(buf);
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff)
    return new TextDecoder("utf-16be").decode(buf);
  let text = new TextDecoder("utf-8").decode(buf);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  return text;
}

function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 25).join("\n");
  const candidates = [",", "\t", ";"];
  let best = ",";
  let bestCount = -1;
  for (const d of candidates) {
    const count = sample.split(d).length;
    if (count > bestCount) {
      bestCount = count;
      best = d;
    }
  }
  return best;
}

// Minimal RFC-4180-ish CSV/TSV parser (handles quoted fields & escaped quotes).
function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // ignore; handled by \n
    } else field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const norm = (s: unknown) =>
  String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// Tokens that signal a Google Ads header row.
const HEADER_TOKENS = [
  "campaign",
  "ad group",
  "keyword",
  "search keyword",
  "search term",
  "impr.",
  "impressions",
  "clicks",
  "ctr",
  "cost",
  "conversions",
  "conv.",
  "conv. value",
  "conv. rate",
  "cost / conv.",
  "avg. cpc",
  "day",
  "hour",
  "day of the week",
  "age",
  "gender",
  "device",
  "word",
  "search term",
  "display url domain",
  "search impr. share",
  "impr. share",
];

function looksLikeHeader(cells: string[]): boolean {
  const cleaned = cells.map(norm).filter(Boolean);
  if (cleaned.length < 3) return false;
  let hits = 0;
  for (const c of cleaned)
    if (HEADER_TOKENS.some((t) => c === t || c.includes(t))) hits++;
  return hits >= 2;
}

export type Dataset = {
  type: string;
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
};

function toDataset(type: string, fileName: string, text: string): Dataset | null {
  const delim = detectDelimiter(text);
  const grid = parseDelimited(text, delim);
  if (grid.length === 0) return null;

  // find header row
  let headerIdx = -1;
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    if (looksLikeHeader(grid[i])) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return null;

  const headers = grid[headerIdx].map((h) => String(h).trim());
  const rows: Record<string, string>[] = [];
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const cells = grid[i];
    if (!cells || cells.every((c) => String(c).trim() === "")) continue;
    const first = norm(cells[0]);
    // skip Google Ads "Total" summary rows
    if (first.startsWith("total")) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[norm(h)] = String(cells[idx] ?? "").trim();
    });
    rows.push(obj);
  }
  return { type, fileName, headers, rows };
}

/* ───────────────────────── file classification ───────────────────────── */

function classify(fileName: string): string {
  const n = fileName.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const has = (...needles: string[]) => needles.every((x) => n.includes(x));

  if (has("auction insights", "compare")) return "auction_compare";
  if (has("auction insights")) return "auction_time";
  if (has("biggest changes")) return "biggest_changes";
  if (has("search keywords")) return "search_keywords";
  if (has("searches", "word")) return "search_words";
  if (has("searches")) return "search_terms";
  if (has("day hour")) return "day_hour";
  if (has("day") && n.includes("hour")) return "day_hour";
  if (has("hour")) return "hour";
  if (has("day")) return "day";
  if (has("demographics", "gender") && n.includes("age")) return "gender_age";
  if (has("demographics", "gender")) return "gender";
  if (has("demographics", "age")) return "age";
  if (has("devices")) return "devices";
  if (has("optimization score")) return "optimization_score";
  if (has("time series")) return "time_series";
  if (has("campaigns")) return "campaigns";
  return "unknown";
}

export type ParsedZip = {
  datasets: Record<string, Dataset>;
  filesFound: string[];
  period: { start: string; end: string; label: string };
  currency: string;
  warnings?: string[];
};

// When a loose CSV's filename doesn't reveal its report type, infer it from
// the column headers instead.
function classifyByHeaders(headers: string[]): string {
  const h = headers.map(norm);
  const has = (t: string) => h.some((x) => x.includes(t));
  if (has("display url domain")) return "auction_compare";
  if (has("search term")) return "search_terms";
  if (has("search keyword")) return "search_keywords";
  if (has("hour of the day")) return "hour";
  if (has("day of the week")) return "day";
  if (has("age range") || (has("age") && !has("campaign"))) return "age";
  if (has("gender")) return "gender";
  if (has("device")) return "devices";
  if (has("campaign")) return "campaigns";
  if (has("keyword")) return "search_keywords";
  return "unknown";
}

// Decode + classify + parse a single file's bytes, merging its rows into the
// accumulating dataset map.
function ingest(datasets: Record<string, Dataset>, fileName: string, u8: Uint8Array): void {
  const text = decodeBuffer(u8);
  let type = classify(fileName);
  const ds = toDataset(type, fileName, text);
  if (!ds || ds.rows.length === 0) return;
  if (type === "unknown") {
    type = classifyByHeaders(ds.headers);
    if (type === "unknown") return;
    ds.type = type;
  }
  if (datasets[type]) datasets[type].rows.push(...ds.rows);
  else datasets[type] = ds;
}

function finalize(
  datasets: Record<string, Dataset>,
  filesFound: string[],
  warnings: string[]
): ParsedZip {
  return {
    datasets,
    filesFound,
    period: extractPeriod(filesFound),
    currency: detectCurrency(datasets),
    warnings: warnings.length ? warnings : undefined,
  };
}

// Extract a YYYY.MM.DD-YYYY.MM.DD style range from a filename if present.
function extractPeriod(names: string[]): { start: string; end: string; label: string } {
  for (const name of names) {
    const m = name.match(/(\d{4}[.\-/]\d{2}[.\-/]\d{2}).{0,4}?(\d{4}[.\-/]\d{2}[.\-/]\d{2})/);
    if (m) {
      const fix = (s: string) => s.replace(/[.\/]/g, "-");
      return { start: fix(m[1]), end: fix(m[2]), label: `${fix(m[1])} → ${fix(m[2])}` };
    }
  }
  return { start: "", end: "", label: "" };
}

// Extract a RAR archive using the WASM-based unrar (works on Vercel).
async function loadUnrarWasm(): Promise<ArrayBuffer | undefined> {
  try {
    const { createRequire } = await import("module");
    const req = createRequire(import.meta.url);
    const fs = await import("fs");
    const p = req.resolve("node-unrar-js/dist/js/unrar.wasm");
    const buf = fs.readFileSync(p);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  } catch {
    return undefined;
  }
}

export async function extractRar(data: Uint8Array): Promise<{ name: string; data: Uint8Array }[]> {
  const mod = await import("node-unrar-js");
  const ab = new Uint8Array(data).buffer; // fresh, tightly-bound ArrayBuffer
  let extractor;
  try {
    extractor = await mod.createExtractorFromData({ data: ab });
  } catch {
    const wasmBinary = await loadUnrarWasm();
    extractor = await mod.createExtractorFromData({ data: ab, wasmBinary });
  }
  const result = extractor.extract();
  const files: { name: string; data: Uint8Array }[] = [];
  for (const f of result.files) {
    if (f.fileHeader.flags.directory) continue;
    if (f.extraction) files.push({ name: f.fileHeader.name, data: f.extraction });
  }
  return files;
}

// Parse any mix of uploaded files — .zip, .rar, and loose .csv/.tsv — and
// merge everything into one dataset map for analysis.
export async function parseUploadFiles(
  files: { name: string; data: Uint8Array }[]
): Promise<ParsedZip> {
  const datasets: Record<string, Dataset> = {};
  const filesFound: string[] = [];
  const warnings: string[] = [];

  for (const file of files) {
    const lower = file.name.toLowerCase();
    try {
      if (lower.endsWith(".zip")) {
        const zip = await JSZip.loadAsync(file.data);
        for (const entry of Object.values(zip.files)) {
          if (entry.dir) continue;
          const nm = entry.name.split("/").pop() || entry.name;
          filesFound.push(nm);
          try {
            ingest(datasets, nm, await entry.async("uint8array"));
          } catch {
            /* skip bad entry */
          }
        }
      } else if (lower.endsWith(".rar")) {
        try {
          const entries = await extractRar(file.data);
          for (const e of entries) {
            const nm = e.name.split("/").pop() || e.name;
            filesFound.push(nm);
            try {
              ingest(datasets, nm, e.data);
            } catch {
              /* skip bad entry */
            }
          }
        } catch {
          warnings.push(
            `Couldn't read “${file.name}”. If RAR extraction fails, re-save it as a .zip or add the .csv files directly.`
          );
        }
      } else {
        // treat as a loose CSV/TSV
        filesFound.push(file.name);
        ingest(datasets, file.name, file.data);
      }
    } catch {
      warnings.push(`Couldn't read “${file.name}”.`);
    }
  }

  return finalize(datasets, filesFound, warnings);
}

// Back-compat: analyse a single ZIP buffer.
export async function parseGoogleAdsZip(buffer: Buffer | ArrayBuffer): Promise<ParsedZip> {
  return parseUploadFiles([{ name: "upload.zip", data: new Uint8Array(buffer as ArrayBuffer) }]);
}

/* ───────────────────────── value helpers ───────────────────────── */

const NONE_VALUES = new Set(["--", "-", "", "—", "n/a", "na"]);

function parseNum(raw: unknown): number {
  const s = String(raw ?? "").trim();
  if (NONE_VALUES.has(s.toLowerCase())) return 0;
  const cleaned = s.replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return 0;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function pick(row: Record<string, string>, names: string[]): string {
  for (const name of names) {
    const v = row[norm(name)];
    if (v !== undefined) return v;
  }
  // fuzzy contains
  const keys = Object.keys(row);
  for (const name of names) {
    const nn = norm(name);
    const k = keys.find((key) => key.includes(nn));
    if (k) return row[k];
  }
  return "";
}

function num(row: Record<string, string>, names: string[]): number {
  return parseNum(pick(row, names));
}

// Account currency is Canadian dollars; default to CA$ when the export
// doesn't carry an explicit symbol. If Google Ads does include a symbol
// (e.g. "CA$"), we use exactly what's in the file.
const DEFAULT_CURRENCY = "CA$";

function detectCurrency(datasets: Record<string, Dataset>): string {
  const ds = datasets.campaigns || datasets.search_keywords || datasets.devices;
  if (!ds) return DEFAULT_CURRENCY;
  for (const r of ds.rows) {
    const raw = pick(r, ["cost"]);
    const m = raw.match(/([^\d.,\s\-]+)/);
    if (m) return m[1].trim();
  }
  return DEFAULT_CURRENCY;
}

/* ───────────────────────── metric extraction ───────────────────────── */

type Metrics = {
  impressions: number;
  clicks: number;
  cost: number;
  conversions: number;
  convValue: number;
  ctr: number; // %
  avgCpc: number;
  convRate: number; // %
  costPerConv: number;
  searchIS: number; // %
  lostISBudget: number; // %
  lostISRank: number; // %
  topRate: number; // %
  absTopRate: number; // %
};

function metricsOf(row: Record<string, string>): Metrics {
  const impressions = num(row, ["impr.", "impressions", "impr"]);
  const clicks = num(row, ["clicks"]);
  const cost = num(row, ["cost"]);
  const conversions = num(row, ["conversions", "conv."]);
  const convValue = num(row, ["conv. value", "all conv. value", "conversion value"]);
  return {
    impressions,
    clicks,
    cost,
    conversions,
    convValue,
    ctr: num(row, ["ctr"]) || (impressions ? (clicks / impressions) * 100 : 0),
    avgCpc: num(row, ["avg. cpc", "avg cpc"]) || (clicks ? cost / clicks : 0),
    convRate: num(row, ["conv. rate", "conversion rate"]) || (clicks ? (conversions / clicks) * 100 : 0),
    costPerConv: num(row, ["cost / conv.", "cost/conv.", "cost / conv"]) || (conversions ? cost / conversions : 0),
    searchIS: num(row, ["search impr. share", "impr. share", "search impr share"]),
    lostISBudget: num(row, ["search lost is (budget)", "lost is (budget)"]),
    lostISRank: num(row, ["search lost is (rank)", "lost is (rank)"]),
    topRate: num(row, ["impr. (top) %", "top impr."]),
    absTopRate: num(row, ["impr. (abs. top) %", "abs. top"]),
  };
}

/* ───────────────────────── report types ───────────────────────── */

export type Priority = "critical" | "high" | "medium" | "low";

export type Recommendation = {
  priority: Priority;
  area: string;
  title: string;
  detail: string;
  action: string;
  impact?: string; // e.g. "Save ~$340/period"
};

export type SemReport = {
  generatedAt: string;
  currency: string;
  period: { start: string; end: string; label: string };
  filesFound: string[];
  dataPresent: Record<string, boolean>;
  kpis: Metrics & { roas: number };
  health: { score: number; grade: string; drivers: { label: string; status: "good" | "ok" | "bad"; note: string }[] };
  recommendations: Recommendation[];
  campaigns: Array<{
    name: string;
    cost: number;
    conversions: number;
    cpa: number;
    ctr: number;
    convRate: number;
    roas: number;
    lostISBudget: number;
    lostISRank: number;
    flag: string;
  }>;
  wastedSearchTerms: Array<{ term: string; cost: number; clicks: number; conversions: number }>;
  opportunityTerms: Array<{ term: string; conversions: number; cost: number; convRate: number }>;
  wastedKeywords: Array<{ keyword: string; cost: number; clicks: number; conversions: number }>;
  devices: Array<{ device: string; cost: number; conversions: number; cpa: number; convRate: number; bidAdj: number }>;
  schedule: {
    bestHours: Array<{ label: string; convRate: number; conversions: number }>;
    worstHours: Array<{ label: string; cost: number; conversions: number }>;
    bestDays: Array<{ label: string; convRate: number; conversions: number }>;
  };
  demographics: {
    age: Array<{ segment: string; cost: number; conversions: number; cpa: number; flag: string }>;
    gender: Array<{ segment: string; cost: number; conversions: number; cpa: number; flag: string }>;
  };
  auctionInsights: Array<{ domain: string; impressionShare: number; overlapRate: number; topOfPage: number; outranking: number }>;
  totals: { wastedSpend: number; potentialMonthlySavings: number };
};

/* ───────────────────────── the analysis engine ───────────────────────── */

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export function analyzeGoogleAds(parsed: ParsedZip): SemReport {
  const { datasets, currency, period, filesFound } = parsed;
  const recs: Recommendation[] = [];

  // ── account KPIs (prefer campaigns, fall back to time series) ──
  const base = datasets.campaigns?.rows || datasets.time_series?.rows || [];
  const totals = base.reduce(
    (a, r) => {
      const m = metricsOf(r);
      a.impressions += m.impressions;
      a.clicks += m.clicks;
      a.cost += m.cost;
      a.conversions += m.conversions;
      a.convValue += m.convValue;
      a.isWeighted += m.searchIS * m.impressions;
      return a;
    },
    { impressions: 0, clicks: 0, cost: 0, conversions: 0, convValue: 0, isWeighted: 0 }
  );

  const kpis = {
    impressions: totals.impressions,
    clicks: totals.clicks,
    cost: round(totals.cost),
    conversions: round(totals.conversions),
    convValue: round(totals.convValue),
    ctr: totals.impressions ? round((totals.clicks / totals.impressions) * 100) : 0,
    avgCpc: totals.clicks ? round(totals.cost / totals.clicks) : 0,
    convRate: totals.clicks ? round((totals.conversions / totals.clicks) * 100) : 0,
    costPerConv: totals.conversions ? round(totals.cost / totals.conversions) : 0,
    searchIS: totals.impressions ? round(totals.isWeighted / totals.impressions) : 0,
    lostISBudget: 0,
    lostISRank: 0,
    topRate: 0,
    absTopRate: 0,
    roas: totals.cost ? round(totals.convValue / totals.cost) : 0,
  };

  const accountCpa = kpis.costPerConv; // expected cost of one conversion
  const wasteThreshold = accountCpa > 0 ? accountCpa : kpis.avgCpc * 8 || 20;

  /* ── Campaigns ── */
  const campaigns: SemReport["campaigns"] = [];
  if (datasets.campaigns) {
    for (const r of datasets.campaigns.rows) {
      const name = pick(r, ["campaign"]);
      if (!name) continue;
      const m = metricsOf(r);
      const cpa = m.conversions ? round(m.cost / m.conversions) : 0;
      const roas = m.cost ? round(m.convValue / m.cost) : 0;
      let flag = "ok";
      if (m.cost >= wasteThreshold && m.conversions === 0) flag = "wasting";
      else if (m.conversions >= 2 && accountCpa > 0 && cpa > accountCpa * 1.5) flag = "high-cpa";
      else if (m.lostISBudget >= 10 && (accountCpa === 0 || cpa <= accountCpa)) flag = "budget-limited";
      else if (m.lostISRank >= 25) flag = "rank-limited";
      campaigns.push({
        name,
        cost: round(m.cost),
        conversions: round(m.conversions),
        cpa,
        ctr: round(m.ctr),
        convRate: round(m.convRate),
        roas,
        lostISBudget: round(m.lostISBudget),
        lostISRank: round(m.lostISRank),
        flag,
      });
    }
    campaigns.sort((a, b) => b.cost - a.cost);

    for (const c of campaigns) {
      if (c.flag === "wasting")
        recs.push({
          priority: "critical",
          area: "Campaigns",
          title: `Stop the bleed on “${c.name}”`,
          detail: `This campaign spent ${currency}${c.cost.toLocaleString()} with 0 conversions this period — more than a full target CPA with nothing to show.`,
          action:
            "Pause it, or audit landing page, offer, and keyword intent before it spends another dollar. Re-check conversion tracking is firing.",
          impact: `Recover ~${currency}${c.cost.toLocaleString()}/period`,
        });
      else if (c.flag === "high-cpa")
        recs.push({
          priority: "high",
          area: "Campaigns",
          title: `“${c.name}” CPA is ${Math.round((c.cpa / accountCpa - 1) * 100)}% above account average`,
          detail: `CPA ${currency}${c.cpa} vs account ${currency}${accountCpa}. It converts, but inefficiently.`,
          action:
            "Lower tCPA/bids ~15–20%, tighten match types, add negatives, and pause the bottom-quartile keywords feeding it.",
        });
      else if (c.flag === "budget-limited")
        recs.push({
          priority: "high",
          area: "Budget",
          title: `Scale “${c.name}” — it’s budget-limited and efficient`,
          detail: `Losing ${c.lostISBudget}% of impression share to budget while holding a CPA at/below account average (${currency}${c.cpa || accountCpa}).`,
          action: `Raise daily budget 20–30% and monitor CPA. This is the cleanest growth lever in the account.`,
          impact: `Capture lost ${c.lostISBudget}% impression share`,
        });
      else if (c.flag === "rank-limited")
        recs.push({
          priority: "medium",
          area: "Quality",
          title: `“${c.name}” is losing ${c.lostISRank}% impression share to Ad Rank`,
          detail: `Rank-limited loss means ads aren’t competitive enough on relevance/bid.`,
          action:
            "Improve Quality Score: tighten ad-group themes, add RSAs with keyword-rich headlines, and align landing pages; consider a modest bid increase.",
        });
    }
  }

  /* ── Search terms → negatives + new keyword opportunities ── */
  const wastedSearchTerms: SemReport["wastedSearchTerms"] = [];
  const opportunityTerms: SemReport["opportunityTerms"] = [];
  if (datasets.search_terms) {
    for (const r of datasets.search_terms.rows) {
      const term = pick(r, ["search term", "search terms", "term"]);
      if (!term) continue;
      const m = metricsOf(r);
      if (m.conversions === 0 && m.cost >= Math.max(wasteThreshold * 0.5, kpis.avgCpc * 3))
        wastedSearchTerms.push({ term, cost: round(m.cost), clicks: m.clicks, conversions: round(m.conversions) });
      if (m.conversions >= 1)
        opportunityTerms.push({ term, conversions: round(m.conversions), cost: round(m.cost), convRate: round(m.convRate) });
    }
    wastedSearchTerms.sort((a, b) => b.cost - a.cost);
    opportunityTerms.sort((a, b) => b.conversions - a.conversions);
    const totalWaste = wastedSearchTerms.reduce((s, t) => s + t.cost, 0);
    if (wastedSearchTerms.length > 0)
      recs.push({
        priority: totalWaste >= wasteThreshold * 3 ? "critical" : "high",
        area: "Search terms",
        title: `Add ${wastedSearchTerms.length} negative keyword${wastedSearchTerms.length === 1 ? "" : "s"} to stop wasted spend`,
        detail: `These search queries cost ${currency}${round(totalWaste).toLocaleString()} with zero conversions. The top offender is “${wastedSearchTerms[0].term}” (${currency}${wastedSearchTerms[0].cost}).`,
        action:
          "Add the listed terms as negative keywords (phrase/exact as appropriate). Review weekly — search-term mining is the single highest-ROI routine in paid search.",
        impact: `Save ~${currency}${round(totalWaste).toLocaleString()}/period`,
      });
    if (opportunityTerms.length > 0)
      recs.push({
        priority: "medium",
        area: "Search terms",
        title: `Promote ${Math.min(opportunityTerms.length, 15)} converting search terms to keywords`,
        detail: `Queries like “${opportunityTerms[0].term}” are already converting but may be running on loose match. Promoting them gives you bid + message control.`,
        action:
          "Add the top converters as exact-match keywords in tightly themed ad groups, and write ad copy that mirrors the query.",
      });
  }

  /* ── Search keywords → wasted spend ── */
  const wastedKeywords: SemReport["wastedKeywords"] = [];
  if (datasets.search_keywords) {
    for (const r of datasets.search_keywords.rows) {
      const keyword = pick(r, ["search keyword", "keyword"]);
      if (!keyword) continue;
      const m = metricsOf(r);
      if (m.conversions === 0 && m.cost >= Math.max(wasteThreshold, kpis.avgCpc * 5))
        wastedKeywords.push({ keyword, cost: round(m.cost), clicks: m.clicks, conversions: 0 });
    }
    wastedKeywords.sort((a, b) => b.cost - a.cost);
    const kwWaste = wastedKeywords.reduce((s, k) => s + k.cost, 0);
    if (wastedKeywords.length > 0)
      recs.push({
        priority: "high",
        area: "Keywords",
        title: `Pause or rework ${wastedKeywords.length} non-converting keyword${wastedKeywords.length === 1 ? "" : "s"}`,
        detail: `${currency}${round(kwWaste).toLocaleString()} spent across keywords with no conversions, led by “${wastedKeywords[0].keyword}”.`,
        action:
          "Pause the clear losers; for borderline ones, lower bids and tighten match type before cutting. Shift budget to proven converters.",
        impact: `Reallocate ~${currency}${round(kwWaste).toLocaleString()}/period`,
      });
  }

  /* ── Devices → bid adjustments ── */
  const devices: SemReport["devices"] = [];
  if (datasets.devices) {
    for (const r of datasets.devices.rows) {
      const device = pick(r, ["device"]);
      if (!device) continue;
      const m = metricsOf(r);
      const cpa = m.conversions ? round(m.cost / m.conversions) : 0;
      let bidAdj = 0;
      if (m.conversions >= 2 && accountCpa > 0 && cpa > 0) bidAdj = clamp(round((accountCpa / cpa - 1) * 100, 0), -60, 40);
      else if (m.conversions === 0 && m.cost >= wasteThreshold) bidAdj = -60;
      devices.push({ device, cost: round(m.cost), conversions: round(m.conversions), cpa, convRate: round(m.convRate), bidAdj });
    }
    const worst = devices.filter((d) => d.bidAdj <= -20).sort((a, b) => a.bidAdj - b.bidAdj)[0];
    const best = devices.filter((d) => d.bidAdj >= 15).sort((a, b) => b.bidAdj - a.bidAdj)[0];
    if (worst)
      recs.push({
        priority: "medium",
        area: "Devices",
        title: `Reduce ${worst.device} bids by ~${Math.abs(worst.bidAdj)}%`,
        detail: `${worst.device} ${worst.conversions === 0 ? `spent ${currency}${worst.cost} with no conversions` : `runs a CPA of ${currency}${worst.cpa} vs account ${currency}${accountCpa}`}.`,
        action: `Apply a ${worst.bidAdj}% device bid adjustment and reassess after 2 weeks.`,
      });
    if (best)
      recs.push({
        priority: "low",
        area: "Devices",
        title: `Bid up on ${best.device} (+${best.bidAdj}%)`,
        detail: `${best.device} converts more efficiently than the account average.`,
        action: `Apply a +${best.bidAdj}% device bid adjustment to win more of this efficient traffic.`,
      });
  }

  /* ── Dayparting (hour / day) ── */
  const schedule: SemReport["schedule"] = { bestHours: [], worstHours: [], bestDays: [], worstDays: [] } as SemReport["schedule"];
  if (datasets.hour) {
    const hours = datasets.hour.rows
      .map((r) => {
        const m = metricsOf(r);
        return { label: pick(r, ["hour of the day", "hour"]) || "", convRate: round(m.convRate), conversions: round(m.conversions), cost: round(m.cost) };
      })
      .filter((h) => h.label);
    schedule.bestHours = [...hours].filter((h) => h.conversions >= 1).sort((a, b) => b.convRate - a.convRate).slice(0, 4);
    schedule.worstHours = [...hours].filter((h) => h.conversions === 0 && h.cost >= kpis.avgCpc * 3).sort((a, b) => b.cost - a.cost).slice(0, 4);
    if (schedule.worstHours.length >= 2)
      recs.push({
        priority: "medium",
        area: "Schedule",
        title: `Trim spend during ${schedule.worstHours.length} unproductive hours`,
        detail: `Hours like ${schedule.worstHours.map((h) => h.label).slice(0, 3).join(", ")} burn budget with no conversions.`,
        action: "Add negative ad-schedule bid adjustments (−30% to −60%) or pause those hours; redeploy to your best-converting hours.",
      });
  }
  if (datasets.day) {
    const days = datasets.day.rows
      .map((r) => {
        const m = metricsOf(r);
        return { label: pick(r, ["day of the week", "day"]) || "", convRate: round(m.convRate), conversions: round(m.conversions) };
      })
      .filter((d) => d.label && d.conversions >= 1);
    schedule.bestDays = days.sort((a, b) => b.convRate - a.convRate).slice(0, 3);
  }

  /* ── Demographics ── */
  const demographics: SemReport["demographics"] = { age: [], gender: [] };
  const buildDemo = (ds: Dataset | undefined, dim: string[]) => {
    if (!ds) return [];
    return ds.rows
      .map((r) => {
        const segment = pick(r, dim);
        const m = metricsOf(r);
        const cpa = m.conversions ? round(m.cost / m.conversions) : 0;
        let flag = "ok";
        if (m.conversions === 0 && m.cost >= wasteThreshold) flag = "wasting";
        else if (m.conversions >= 2 && accountCpa > 0 && cpa > accountCpa * 1.4) flag = "high-cpa";
        else if (m.conversions >= 2 && accountCpa > 0 && cpa <= accountCpa * 0.7) flag = "strong";
        return { segment, cost: round(m.cost), conversions: round(m.conversions), cpa, flag };
      })
      .filter((d) => d.segment && d.segment.toLowerCase() !== "unknown");
  };
  demographics.age = buildDemo(datasets.age, ["age range", "age"]);
  demographics.gender = buildDemo(datasets.gender, ["gender"]);
  const poorDemo = [...demographics.age, ...demographics.gender].find((d) => d.flag === "wasting");
  if (poorDemo)
    recs.push({
      priority: "medium",
      area: "Audience",
      title: `Reduce or exclude the “${poorDemo.segment}” segment`,
      detail: `Spent ${currency}${poorDemo.cost} with no conversions.`,
      action: "Apply a negative demographic bid adjustment or exclude it if the trend persists across periods.",
    });

  /* ── Auction insights ── */
  const auctionInsights: SemReport["auctionInsights"] = [];
  if (datasets.auction_compare) {
    for (const r of datasets.auction_compare.rows) {
      const domain = pick(r, ["display url domain", "domain"]);
      if (!domain) continue;
      auctionInsights.push({
        domain,
        impressionShare: num(r, ["impr. share", "search impr. share"]),
        overlapRate: num(r, ["overlap rate"]),
        topOfPage: num(r, ["top of page rate"]),
        outranking: num(r, ["outranking share", "position above rate"]),
      });
    }
    auctionInsights.sort((a, b) => b.impressionShare - a.impressionShare);
    const you = auctionInsights.find((a) => /^you$/i.test(a.domain));
    const topRival = auctionInsights.find((a) => !/^you$/i.test(a.domain));
    if (you && topRival && topRival.impressionShare > you.impressionShare)
      recs.push({
        priority: "medium",
        area: "Competition",
        title: `${topRival.domain} is outpacing you on impression share`,
        detail: `Competitor impression share ${topRival.impressionShare}% vs your ${you.impressionShare}%, with ${topRival.overlapRate}% overlap.`,
        action: "Defend high-intent keywords with stronger bids/QS, sharpen USPs in ad copy, and consider competitor-conquesting where it's profitable.",
      });
  }

  /* ── Account-level impression share opportunity ── */
  if (kpis.searchIS > 0 && kpis.searchIS < 65)
    recs.push({
      priority: "medium",
      area: "Reach",
      title: `Search impression share is only ${kpis.searchIS}%`,
      detail: `You're appearing for well under two-thirds of eligible searches — there's meaningful untapped volume.`,
      action: "Identify whether the loss is budget vs rank (see campaign breakdown) and address the dominant cause first.",
    });

  /* ── Health score ── */
  const health = computeHealth(kpis, wastedSearchTerms, wastedKeywords);

  // order recommendations by priority then impact text presence
  const order: Record<Priority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  recs.sort((a, b) => order[a.priority] - order[b.priority]);

  const wastedSpend =
    wastedSearchTerms.reduce((s, t) => s + t.cost, 0) + wastedKeywords.reduce((s, k) => s + k.cost, 0);
  const daysInPeriod = estimateDays(period);
  const potentialMonthlySavings = daysInPeriod ? round((wastedSpend / daysInPeriod) * 30) : round(wastedSpend);

  return {
    generatedAt: new Date().toISOString(),
    currency,
    period,
    filesFound,
    dataPresent: Object.fromEntries(
      ["campaigns", "search_keywords", "search_terms", "search_words", "devices", "hour", "day", "age", "gender", "auction_compare", "time_series"].map((k) => [k, Boolean(datasets[k])])
    ),
    kpis,
    health,
    recommendations: recs,
    campaigns: campaigns.slice(0, 50),
    wastedSearchTerms: wastedSearchTerms.slice(0, 30),
    opportunityTerms: opportunityTerms.slice(0, 25),
    wastedKeywords: wastedKeywords.slice(0, 30),
    devices,
    schedule,
    demographics,
    auctionInsights: auctionInsights.slice(0, 12),
    totals: { wastedSpend: round(wastedSpend), potentialMonthlySavings },
  };
}

function estimateDays(period: { start: string; end: string }): number {
  if (!period.start || !period.end) return 0;
  const s = new Date(period.start);
  const e = new Date(period.end);
  const d = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
  return d > 0 && d < 400 ? d : 0;
}

function computeHealth(
  kpis: Metrics & { roas: number },
  wastedTerms: { cost: number }[],
  wastedKw: { cost: number }[]
): SemReport["health"] {
  const drivers: SemReport["health"]["drivers"] = [];
  let score = 100;

  // CTR (search benchmark ~3-5%)
  if (kpis.ctr >= 4) drivers.push({ label: "Click-through rate", status: "good", note: `${kpis.ctr}% — strong` });
  else if (kpis.ctr >= 2) { drivers.push({ label: "Click-through rate", status: "ok", note: `${kpis.ctr}% — acceptable` }); score -= 6; }
  else { drivers.push({ label: "Click-through rate", status: "bad", note: `${kpis.ctr}% — low relevance` }); score -= 14; }

  // Conversion rate (~3-5%)
  if (kpis.convRate >= 4) drivers.push({ label: "Conversion rate", status: "good", note: `${kpis.convRate}%` });
  else if (kpis.convRate >= 1.5) { drivers.push({ label: "Conversion rate", status: "ok", note: `${kpis.convRate}%` }); score -= 8; }
  else { drivers.push({ label: "Conversion rate", status: "bad", note: `${kpis.convRate}% — landing/intent gap` }); score -= 18; }

  // Wasted spend ratio
  const waste = wastedTerms.reduce((s, t) => s + t.cost, 0) + wastedKw.reduce((s, k) => s + k.cost, 0);
  const ratio = kpis.cost ? waste / kpis.cost : 0;
  if (ratio <= 0.05) drivers.push({ label: "Wasted spend", status: "good", note: `${round(ratio * 100)}% of spend` });
  else if (ratio <= 0.15) { drivers.push({ label: "Wasted spend", status: "ok", note: `${round(ratio * 100)}% of spend` }); score -= 10; }
  else { drivers.push({ label: "Wasted spend", status: "bad", note: `${round(ratio * 100)}% of spend wasted` }); score -= 22; }

  // Impression share
  if (kpis.searchIS >= 70) drivers.push({ label: "Impression share", status: "good", note: `${kpis.searchIS}%` });
  else if (kpis.searchIS >= 45 || kpis.searchIS === 0) { drivers.push({ label: "Impression share", status: "ok", note: kpis.searchIS ? `${kpis.searchIS}%` : "n/a" }); score -= kpis.searchIS ? 6 : 0; }
  else { drivers.push({ label: "Impression share", status: "bad", note: `${kpis.searchIS}% — limited reach` }); score -= 12; }

  score = clamp(Math.round(score), 0, 100);
  const grade = score >= 90 ? "A" : score >= 80 ? "B" : score >= 70 ? "C" : score >= 60 ? "D" : "F";
  return { score, grade, drivers };
}
