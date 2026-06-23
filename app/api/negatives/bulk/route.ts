import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { requireSession } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { normalizeMatchType, STATUSES } from "@/lib/constants";

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

// POST — bulk add negatives sharing category / match type / notes.
export async function POST(req: Request) {
  try {
    const user = await requireSession();
    await ensureSchema();
    const body = await req.json();

    const shared = {
      category: String(body.category ?? "").trim(),
      match_type: normalizeMatchType(body.match_type),
      notes: String(body.notes ?? "").trim(),
    };
    const raw: string[] = Array.isArray(body.keywords)
      ? body.keywords
      : String(body.keywords ?? "").split(/\r?\n/);

    const seen = new Set<string>();
    const list: string[] = [];
    for (const item of raw) {
      const kw = String(item).trim();
      if (!kw) continue;
      const key = kw.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(kw);
    }
    if (list.length === 0)
      return NextResponse.json(
        { error: "Enter at least one negative keyword (one per line)." },
        { status: 400 }
      );

    const rows = list.map((kw) => ({
      category: shared.category,
      keyword: kw,
      match_type: shared.match_type,
      notes: shared.notes,
      status: "active",
      created_by: user.name,
      created_role: user.role,
      updated_by: user.name,
      updated_role: user.role,
    }));

    const inserted = await sql`
      INSERT INTO negative_keywords ${sql(rows)}
      ON CONFLICT DO NOTHING
      RETURNING id`;
    const insertedCount = inserted.length;
    const duplicates = list.length - insertedCount;

    await logActivity({
      actor: user,
      action: "add",
      entityType: "negative",
      keywordText: `${insertedCount} negative${insertedCount === 1 ? "" : "s"} (bulk add)`,
      details: { bulk: true, inserted: insertedCount, duplicates },
    });
    return NextResponse.json({ inserted: insertedCount, duplicates });
  } catch (e) {
    return jsonError(e);
  }
}

// PATCH — bulk status change OR bulk field edit (category / match type / notes).
export async function PATCH(req: Request) {
  try {
    const user = await requireSession();
    await ensureSchema();
    const body = await req.json();
    const ids = parseIds(body);
    if (ids.length === 0)
      return NextResponse.json({ error: "No rows selected." }, { status: 400 });

    if (body.action === "status") {
      const status = String(body.status);
      if (!(STATUSES as readonly string[]).includes(status))
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      const updated = await sql`
        UPDATE negative_keywords
        SET status = ${status}, updated_by = ${user.name},
            updated_role = ${user.role}, updated_at = now()
        WHERE id = ANY(${ids})
        RETURNING id`;
      await logActivity({
        actor: user,
        action: status === "removed" ? "remove" : status === "active" ? "restore" : "edit",
        entityType: "negative",
        keywordText: `${updated.length} negative${updated.length === 1 ? "" : "s"} (bulk)`,
        details: { bulk: true, to: status, count: updated.length },
      });
      return NextResponse.json({ updated: updated.length });
    }

    if (body.action === "edit") {
      const f = body.fields || {};
      const set: Record<string, unknown> = {};
      if (typeof f.category === "string" && f.category.trim())
        set.category = f.category.trim();
      if (typeof f.match_type === "string" && f.match_type)
        set.match_type = normalizeMatchType(f.match_type);
      if (typeof f.notes === "string" && f.notes.trim()) set.notes = f.notes.trim();
      if (Object.keys(set).length === 0)
        return NextResponse.json(
          { error: "Fill in at least one field to apply." },
          { status: 400 }
        );
      set.updated_by = user.name;
      set.updated_role = user.role;
      set.updated_at = new Date();

      let changed = 0;
      let conflicts = 0;
      for (const id of ids) {
        try {
          const res = await sql`
            UPDATE negative_keywords SET ${sql(set)} WHERE id = ${id} RETURNING id`;
          changed += res.length;
        } catch (err) {
          if (isUniqueViolation(err)) conflicts++;
          else throw err;
        }
      }
      await logActivity({
        actor: user,
        action: "edit",
        entityType: "negative",
        keywordText: `${changed} negative${changed === 1 ? "" : "s"} (bulk edit)`,
        details: { bulk: true, fields: Object.keys(set), changed, conflicts },
      });
      return NextResponse.json({ changed, conflicts });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return jsonError(e);
  }
}

// DELETE — permanent purge of selected (Agency only).
export async function DELETE(req: Request) {
  try {
    const user = await requireSession();
    await ensureSchema();
    if (user.role !== "agency")
      return NextResponse.json(
        { error: "Only the agency can permanently delete." },
        { status: 403 }
      );
    const body = await req.json().catch(() => ({}));
    const ids = parseIds(body);
    if (ids.length === 0)
      return NextResponse.json({ error: "No rows selected." }, { status: 400 });
    const deleted = await sql`DELETE FROM negative_keywords WHERE id = ANY(${ids}) RETURNING id`;
    await logActivity({
      actor: user,
      action: "purge",
      entityType: "negative",
      keywordText: `${deleted.length} negative${deleted.length === 1 ? "" : "s"} (bulk delete)`,
      details: { bulk: true, count: deleted.length },
    });
    return NextResponse.json({ deleted: deleted.length });
  } catch (e) {
    return jsonError(e);
  }
}
