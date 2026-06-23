import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { requireSession } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { parseWorkbook } from "@/lib/excel";
import type { ParsedWorkbook } from "@/lib/excel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const chunk = <T,>(arr: T[], size: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const kwKey = (k: {
  list_type: string;
  keyword: string;
  match_type: string;
  campaign: string;
  ad_group: string;
}) =>
  [k.list_type, k.keyword.toLowerCase(), k.match_type, k.campaign.toLowerCase(), k.ad_group.toLowerCase()].join("");

const negKey = (n: { keyword: string; match_type: string; category: string }) =>
  [n.keyword.toLowerCase(), n.match_type, n.category.toLowerCase()].join("");

// Split parsed rows into {new, duplicates} against existing DB keys + within file.
function dedupe<T>(rows: T[], keyOf: (r: T) => string, existing: Set<string>) {
  const fresh: T[] = [];
  const seen = new Set<string>();
  let duplicates = 0;
  for (const r of rows) {
    const key = keyOf(r);
    if (existing.has(key) || seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);
    fresh.push(r);
  }
  return { fresh, duplicates };
}

async function analyse(parsed: ParsedWorkbook) {
  const existKw = new Set<string>(
    (await sql`SELECT list_type, keyword, match_type, campaign, ad_group FROM keywords`).map(
      (r) => kwKey(r as any)
    )
  );
  const existNeg = new Set<string>(
    (await sql`SELECT keyword, match_type, category FROM negative_keywords`).map((r) =>
      negKey(r as any)
    )
  );

  const kw = dedupe(parsed.keywords, kwKey, existKw);
  const neg = dedupe(parsed.negatives, negKey, existNeg);

  // Geo / seeds dedupe in-file only (DB unique index backstops the rest).
  const geoSeen = new Set<string>();
  const geoFresh = parsed.geo.filter((g) => {
    const k = `${g.tier}${g.location.toLowerCase()}`;
    if (geoSeen.has(k)) return false;
    geoSeen.add(k);
    return true;
  });
  const seedSeen = new Set<string>();
  const seedFresh = parsed.seeds.filter((s) => {
    const k = `${s.seed_term.toLowerCase()}${s.seed_url.toLowerCase()}`;
    if (seedSeen.has(k)) return false;
    seedSeen.add(k);
    return true;
  });

  return { kw, neg, geoFresh, seedFresh };
}

export async function POST(req: Request) {
  try {
    const user = await requireSession();
    await ensureSchema();

    const url = new URL(req.url);
    const mode = url.searchParams.get("mode") || "preview";

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File))
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });

    const buf = Buffer.from(await file.arrayBuffer());
    let parsed: ParsedWorkbook;
    try {
      parsed = parseWorkbook(buf);
    } catch {
      return NextResponse.json(
        { error: "Could not read this file. Please upload a valid .xlsx workbook." },
        { status: 400 }
      );
    }

    const { kw, neg, geoFresh, seedFresh } = await analyse(parsed);

    const summary = {
      sheetsFound: parsed.sheetsFound,
      keywords: {
        total: parsed.keywords.length,
        new: kw.fresh.length,
        duplicates: kw.duplicates,
      },
      negatives: {
        total: parsed.negatives.length,
        new: neg.fresh.length,
        duplicates: neg.duplicates,
      },
      geo: { total: parsed.geo.length, new: geoFresh.length },
      seeds: { total: parsed.seeds.length, new: seedFresh.length },
    };

    if (mode === "preview") {
      return NextResponse.json({ mode: "preview", summary });
    }

    // ── COMMIT ──
    let kwInserted = 0;
    for (const part of chunk(kw.fresh, 500)) {
      const rows = part.map((k) => ({
        list_type: k.list_type,
        campaign: k.campaign,
        ad_group: k.ad_group,
        keyword: k.keyword,
        match_type: k.match_type,
        intent_cluster: k.intent_cluster,
        priority: k.priority,
        notes: k.notes,
        status: "active",
        created_by: user.name,
        created_role: user.role,
        updated_by: user.name,
        updated_role: user.role,
      }));
      const res = await sql`
        INSERT INTO keywords ${sql(rows)}
        ON CONFLICT DO NOTHING
        RETURNING id`;
      kwInserted += res.length;
    }

    let negInserted = 0;
    for (const part of chunk(neg.fresh, 500)) {
      const rows = part.map((n) => ({
        category: n.category,
        keyword: n.keyword,
        match_type: n.match_type,
        notes: n.notes,
        status: "active",
        created_by: user.name,
        created_role: user.role,
        updated_by: user.name,
        updated_role: user.role,
      }));
      const res = await sql`
        INSERT INTO negative_keywords ${sql(rows)}
        ON CONFLICT DO NOTHING
        RETURNING id`;
      negInserted += res.length;
    }

    let geoInserted = 0;
    for (const part of chunk(geoFresh, 500)) {
      const rows = part.map((g) => ({
        tier: g.tier,
        location: g.location,
        notes: "",
        created_by: user.name,
        created_role: user.role,
      }));
      const res = await sql`
        INSERT INTO geo_locations ${sql(rows)}
        ON CONFLICT DO NOTHING
        RETURNING id`;
      geoInserted += res.length;
    }

    let seedInserted = 0;
    for (const part of chunk(seedFresh, 500)) {
      const rows = part.map((s) => ({
        seed_term: s.seed_term,
        seed_url: s.seed_url,
        source_site: s.source_site,
        notes: "",
        created_by: user.name,
        created_role: user.role,
      }));
      const res = await sql`
        INSERT INTO seeds ${sql(rows)}
        ON CONFLICT DO NOTHING
        RETURNING id`;
      seedInserted += res.length;
    }

    const inserted = kwInserted + negInserted + geoInserted + seedInserted;
    const duplicates =
      summary.keywords.duplicates + summary.negatives.duplicates;

    await logActivity({
      actor: user,
      action: "import",
      entityType: "workbook",
      keywordText: file.name,
      details: {
        inserted,
        duplicates,
        keywords: kwInserted,
        negatives: negInserted,
        geo: geoInserted,
        seeds: seedInserted,
      },
    });

    return NextResponse.json({
      mode: "commit",
      result: {
        inserted,
        duplicates,
        keywords: kwInserted,
        negatives: negInserted,
        geo: geoInserted,
        seeds: seedInserted,
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
