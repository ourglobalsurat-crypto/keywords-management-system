import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { requireSession } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { normalizeMatchType, LIST_TYPES, STATUSES } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isUniqueViolation(err: unknown): boolean {
  return Boolean(
    err && typeof err === "object" && (err as { code?: string }).code === "23505"
  );
}

// ── POST /api/keywords/bulk ──  Bulk-add many keywords sharing common fields.
// Body: { list_type, campaign, ad_group, match_type, intent_cluster, priority,
//         notes, keywords: string[] }   (keywords may also be a newline string)
export async function POST(req: Request) {
  try {
    const user = await requireSession();
    await ensureSchema();
    const body = await req.json();

    const listType = (LIST_TYPES as readonly string[]).includes(body.list_type)
      ? body.list_type
      : "b2b";
    const shared = {
      campaign: String(body.campaign ?? "").trim(),
      ad_group: String(body.ad_group ?? "").trim(),
      match_type: normalizeMatchType(body.match_type),
      intent_cluster: String(body.intent_cluster ?? "").trim(),
      priority: String(body.priority ?? "").trim(),
      notes: String(body.notes ?? "").trim(),
    };

    const raw: string[] = Array.isArray(body.keywords)
      ? body.keywords
      : String(body.keywords ?? "").split(/\r?\n/);

    // Clean + de-duplicate within the submitted list (case-insensitive).
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
        { error: "Enter at least one keyword (one per line)." },
        { status: 400 }
      );

    const rows = list.map((kw) => ({
      list_type: listType,
      campaign: shared.campaign,
      ad_group: shared.ad_group,
      keyword: kw,
      match_type: shared.match_type,
      intent_cluster: shared.intent_cluster,
      priority: shared.priority,
      notes: shared.notes,
      status: "active",
      created_by: user.name,
      created_role: user.role,
      updated_by: user.name,
      updated_role: user.role,
    }));

    const inserted = await sql`
      INSERT INTO keywords ${sql(rows)}
      ON CONFLICT DO NOTHING
      RETURNING id`;

    const insertedCount = inserted.length;
    const duplicates = list.length - insertedCount;

    await logActivity({
      actor: user,
      action: "add",
      entityType: "keyword",
      keywordText: `${insertedCount} keyword${insertedCount === 1 ? "" : "s"} (bulk add)`,
      details: {
        bulk: true,
        list_type: listType,
        inserted: insertedCount,
        duplicates,
      },
    });

    return NextResponse.json({ inserted: insertedCount, duplicates });
  } catch (e) {
    return jsonError(e);
  }
}

// ── PATCH /api/keywords/bulk ──  Bulk status change OR bulk field edit.
// Body: { ids: number[], action: 'status', status } OR
//       { ids: number[], action: 'edit', fields: {campaign?, ad_group?,
//         match_type?, intent_cluster?, priority?} }
export async function PATCH(req: Request) {
  try {
    const user = await requireSession();
    await ensureSchema();
    const body = await req.json();

    const ids = (Array.isArray(body.ids) ? body.ids : [])
      .map((n: unknown) => Number(n))
      .filter((n: number) => Number.isInteger(n));
    if (ids.length === 0)
      return NextResponse.json({ error: "No rows selected." }, { status: 400 });

    // Bulk status change (doesn't touch the dedup index → one fast UPDATE).
    if (body.action === "status") {
      const status = String(body.status);
      if (!(STATUSES as readonly string[]).includes(status))
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });

      const updated = await sql`
        UPDATE keywords
        SET status = ${status}, updated_by = ${user.name},
            updated_role = ${user.role}, updated_at = now()
        WHERE id = ANY(${ids})
        RETURNING id`;

      await logActivity({
        actor: user,
        action:
          status === "removed"
            ? "remove"
            : status === "active"
              ? "resume"
              : status === "paused"
                ? "pause"
                : "hold",
        entityType: "keyword",
        keywordText: `${updated.length} keyword${updated.length === 1 ? "" : "s"} (bulk)`,
        details: { bulk: true, to: status, count: updated.length },
      });
      return NextResponse.json({ updated: updated.length });
    }

    // Bulk field edit — only set the fields that were provided (non-empty).
    if (body.action === "edit") {
      const f = body.fields || {};
      const set: Record<string, unknown> = {};
      if (typeof f.campaign === "string" && f.campaign.trim())
        set.campaign = f.campaign.trim();
      if (typeof f.ad_group === "string" && f.ad_group.trim())
        set.ad_group = f.ad_group.trim();
      if (typeof f.match_type === "string" && f.match_type)
        set.match_type = normalizeMatchType(f.match_type);
      if (typeof f.intent_cluster === "string" && f.intent_cluster.trim())
        set.intent_cluster = f.intent_cluster.trim();
      if (typeof f.priority === "string" && f.priority.trim())
        set.priority = f.priority.trim();

      if (Object.keys(set).length === 0)
        return NextResponse.json(
          { error: "Fill in at least one field to apply." },
          { status: 400 }
        );

      set.updated_by = user.name;
      set.updated_role = user.role;
      set.updated_at = new Date();

      // Row-by-row so a change that would create a duplicate is skipped, not fatal.
      let changed = 0;
      let conflicts = 0;
      for (const id of ids) {
        try {
          const res = await sql`
            UPDATE keywords SET ${sql(set)} WHERE id = ${id} RETURNING id`;
          changed += res.length;
        } catch (err) {
          if (isUniqueViolation(err)) conflicts++;
          else throw err;
        }
      }

      await logActivity({
        actor: user,
        action: "edit",
        entityType: "keyword",
        keywordText: `${changed} keyword${changed === 1 ? "" : "s"} (bulk edit)`,
        details: { bulk: true, fields: Object.keys(set), changed, conflicts },
      });
      return NextResponse.json({ changed, conflicts });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return jsonError(e);
  }
}

// ── DELETE /api/keywords/bulk ──  Permanent purge of selected rows (Agency only).
export async function DELETE(req: Request) {
  try {
    const user = await requireSession();
    await ensureSchema();
    if (user.role !== "agency")
      return NextResponse.json(
        { error: "Only the agency can permanently delete keywords." },
        { status: 403 }
      );
    const body = await req.json().catch(() => ({}));
    const ids = (Array.isArray(body.ids) ? body.ids : [])
      .map((n: unknown) => Number(n))
      .filter((n: number) => Number.isInteger(n));
    if (ids.length === 0)
      return NextResponse.json({ error: "No rows selected." }, { status: 400 });

    const deleted = await sql`DELETE FROM keywords WHERE id = ANY(${ids}) RETURNING id`;
    await logActivity({
      actor: user,
      action: "purge",
      entityType: "keyword",
      keywordText: `${deleted.length} keyword${deleted.length === 1 ? "" : "s"} (bulk delete)`,
      details: { bulk: true, count: deleted.length },
    });
    return NextResponse.json({ deleted: deleted.length });
  } catch (e) {
    return jsonError(e);
  }
}
