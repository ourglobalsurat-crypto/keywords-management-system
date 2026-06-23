import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { requireSession } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { jsonError } from "@/lib/http";

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

// POST — bulk add seed terms (one per line) sharing a source site.
export async function POST(req: Request) {
  try {
    const user = await requireSession();
    await ensureSchema();
    const body = await req.json();
    const sourceSite = String(body.source_site ?? "").trim();
    const raw: string[] = Array.isArray(body.seed_terms)
      ? body.seed_terms
      : String(body.seed_terms ?? "").split(/\r?\n/);

    const seen = new Set<string>();
    const list: string[] = [];
    for (const item of raw) {
      const term = String(item).trim();
      if (!term) continue;
      const key = term.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(term);
    }
    if (list.length === 0)
      return NextResponse.json(
        { error: "Enter at least one seed term (one per line)." },
        { status: 400 }
      );

    const rows = list.map((term) => ({
      seed_term: term,
      seed_url: "",
      source_site: sourceSite,
      notes: "",
      created_by: user.name,
      created_role: user.role,
    }));
    const inserted = await sql`
      INSERT INTO seeds ${sql(rows)} ON CONFLICT DO NOTHING RETURNING id`;
    const insertedCount = inserted.length;
    const duplicates = list.length - insertedCount;
    await logActivity({
      actor: user,
      action: "add",
      entityType: "seed",
      keywordText: `${insertedCount} seed${insertedCount === 1 ? "" : "s"} (bulk add)`,
      details: { bulk: true, inserted: insertedCount, duplicates },
    });
    return NextResponse.json({ inserted: insertedCount, duplicates });
  } catch (e) {
    return jsonError(e);
  }
}

// PATCH — set the source site on selected seeds.
export async function PATCH(req: Request) {
  try {
    const user = await requireSession();
    await ensureSchema();
    const body = await req.json();
    const ids = parseIds(body);
    if (ids.length === 0)
      return NextResponse.json({ error: "No rows selected." }, { status: 400 });
    const source = String(body.source_site ?? "").trim();
    if (!source)
      return NextResponse.json(
        { error: "Enter a source site to apply." },
        { status: 400 }
      );
    const updated = await sql`
      UPDATE seeds SET source_site = ${source} WHERE id = ANY(${ids}) RETURNING id`;
    await logActivity({
      actor: user,
      action: "edit",
      entityType: "seed",
      keywordText: `${updated.length} seed${updated.length === 1 ? "" : "s"} (bulk edit)`,
      details: { bulk: true, source_site: source, changed: updated.length },
    });
    return NextResponse.json({ changed: updated.length });
  } catch (e) {
    return jsonError(e);
  }
}

// DELETE — remove selected seeds.
export async function DELETE(req: Request) {
  try {
    const user = await requireSession();
    await ensureSchema();
    const body = await req.json().catch(() => ({}));
    const ids = parseIds(body);
    if (ids.length === 0)
      return NextResponse.json({ error: "No rows selected." }, { status: 400 });
    const deleted = await sql`DELETE FROM seeds WHERE id = ANY(${ids}) RETURNING id`;
    await logActivity({
      actor: user,
      action: "remove",
      entityType: "seed",
      keywordText: `${deleted.length} seed${deleted.length === 1 ? "" : "s"} (bulk delete)`,
      details: { bulk: true, count: deleted.length },
    });
    return NextResponse.json({ deleted: deleted.length });
  } catch (e) {
    return jsonError(e);
  }
}
