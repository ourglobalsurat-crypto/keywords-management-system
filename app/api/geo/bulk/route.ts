import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { requireSession } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { GEO_TIERS } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUniqueViolation(err: unknown): boolean {
  return Boolean(
    err && typeof err === "object" && (err as { code?: string }).code === "23505"
  );
}
function parseIds(body: { ids?: unknown }): number[] {
  return (Array.isArray(body.ids) ? body.ids : [])
    .map((n: unknown) => Number(n))
    .filter((n: number) => Number.isInteger(n));
}
function validTier(t: unknown): t is (typeof GEO_TIERS)[number] {
  return (GEO_TIERS as readonly string[]).includes(String(t));
}

// POST — bulk add locations to one tier (one per line).
export async function POST(req: Request) {
  try {
    const user = await requireSession();
    await ensureSchema();
    const body = await req.json();
    const tier = validTier(body.tier) ? body.tier : "tier1_gta";
    const raw: string[] = Array.isArray(body.locations)
      ? body.locations
      : String(body.locations ?? "").split(/\r?\n/);

    const seen = new Set<string>();
    const list: string[] = [];
    for (const item of raw) {
      const loc = String(item).trim();
      if (!loc) continue;
      const key = loc.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(loc);
    }
    if (list.length === 0)
      return NextResponse.json(
        { error: "Enter at least one location (one per line)." },
        { status: 400 }
      );

    const rows = list.map((location) => ({
      tier,
      location,
      notes: "",
      created_by: user.name,
      created_role: user.role,
    }));
    const inserted = await sql`
      INSERT INTO geo_locations ${sql(rows)} ON CONFLICT DO NOTHING RETURNING id`;
    const insertedCount = inserted.length;
    const duplicates = list.length - insertedCount;
    await logActivity({
      actor: user,
      action: "add",
      entityType: "geo",
      keywordText: `${insertedCount} location${insertedCount === 1 ? "" : "s"} (bulk add)`,
      details: { bulk: true, tier, inserted: insertedCount, duplicates },
    });
    return NextResponse.json({ inserted: insertedCount, duplicates });
  } catch (e) {
    return jsonError(e);
  }
}

// PATCH — move selected locations to another tier.
export async function PATCH(req: Request) {
  try {
    const user = await requireSession();
    await ensureSchema();
    const body = await req.json();
    const ids = parseIds(body);
    if (ids.length === 0)
      return NextResponse.json({ error: "No rows selected." }, { status: 400 });
    if (!validTier(body.tier))
      return NextResponse.json({ error: "Choose a target tier." }, { status: 400 });

    let changed = 0;
    let conflicts = 0;
    for (const id of ids) {
      try {
        const res = await sql`
          UPDATE geo_locations SET tier = ${body.tier} WHERE id = ${id} RETURNING id`;
        changed += res.length;
      } catch (err) {
        if (isUniqueViolation(err)) conflicts++;
        else throw err;
      }
    }
    await logActivity({
      actor: user,
      action: "edit",
      entityType: "geo",
      keywordText: `${changed} location${changed === 1 ? "" : "s"} → ${body.tier} (bulk)`,
      details: { bulk: true, tier: body.tier, changed, conflicts },
    });
    return NextResponse.json({ changed, conflicts });
  } catch (e) {
    return jsonError(e);
  }
}

// DELETE — remove selected locations.
export async function DELETE(req: Request) {
  try {
    const user = await requireSession();
    await ensureSchema();
    const body = await req.json().catch(() => ({}));
    const ids = parseIds(body);
    if (ids.length === 0)
      return NextResponse.json({ error: "No rows selected." }, { status: 400 });
    const deleted = await sql`DELETE FROM geo_locations WHERE id = ANY(${ids}) RETURNING id`;
    await logActivity({
      actor: user,
      action: "remove",
      entityType: "geo",
      keywordText: `${deleted.length} location${deleted.length === 1 ? "" : "s"} (bulk delete)`,
      details: { bulk: true, count: deleted.length },
    });
    return NextResponse.json({ deleted: deleted.length });
  } catch (e) {
    return jsonError(e);
  }
}
