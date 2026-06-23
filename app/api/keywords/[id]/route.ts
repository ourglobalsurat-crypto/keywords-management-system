import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { requireSession } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { normalizeMatchType, STATUSES } from "@/lib/constants";
import type { Action } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_ACTION: Record<string, Action> = {
  active: "resume",
  paused: "pause",
  hold: "hold",
  removed: "remove",
};

// PATCH /api/keywords/:id  — change status OR edit fields
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireSession();
    await ensureSchema();
    const id = Number(params.id);
    const body = await req.json();

    const existingRows = await sql`SELECT * FROM keywords WHERE id = ${id}`;
    if (existingRows.length === 0)
      return NextResponse.json({ error: "Keyword not found." }, { status: 404 });
    const existing = existingRows[0];

    // Status-only change
    if (body.status && !body.edit) {
      const status = String(body.status);
      if (!(STATUSES as readonly string[]).includes(status))
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });

      const wasRemoved = existing.status === "removed";
      const action: Action =
        status === "active" && wasRemoved ? "restore" : STATUS_ACTION[status];

      const updated = await sql`
        UPDATE keywords
        SET status = ${status}, updated_by = ${user.name},
            updated_role = ${user.role}, updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `;
      await logActivity({
        actor: user,
        action,
        entityType: "keyword",
        entityId: id,
        keywordText: existing.keyword,
        details: { from: existing.status, to: status },
      });
      return NextResponse.json({ keyword: updated[0] });
    }

    // Field edit
    const next = {
      campaign: String(body.campaign ?? existing.campaign).trim(),
      ad_group: String(body.ad_group ?? existing.ad_group).trim(),
      keyword: String(body.keyword ?? existing.keyword).trim(),
      match_type: body.match_type
        ? normalizeMatchType(body.match_type)
        : existing.match_type,
      intent_cluster: String(body.intent_cluster ?? existing.intent_cluster).trim(),
      priority: String(body.priority ?? existing.priority).trim(),
      notes: String(body.notes ?? existing.notes).trim(),
    };
    if (!next.keyword)
      return NextResponse.json({ error: "Keyword is required." }, { status: 400 });

    try {
      const updated = await sql`
        UPDATE keywords SET
          campaign = ${next.campaign}, ad_group = ${next.ad_group},
          keyword = ${next.keyword}, match_type = ${next.match_type},
          intent_cluster = ${next.intent_cluster}, priority = ${next.priority},
          notes = ${next.notes}, updated_by = ${user.name},
          updated_role = ${user.role}, updated_at = now()
        WHERE id = ${id}
        RETURNING *
      `;
      await logActivity({
        actor: user,
        action: "edit",
        entityType: "keyword",
        entityId: id,
        keywordText: next.keyword,
        details: { before: pickFields(existing), after: next },
      });
      return NextResponse.json({ keyword: updated[0] });
    } catch (err) {
      if (isUniqueViolation(err))
        return NextResponse.json(
          {
            error:
              "These changes would duplicate another keyword in the same campaign / ad group.",
            duplicate: true,
          },
          { status: 409 }
        );
      throw err;
    }
  } catch (e) {
    return jsonError(e);
  }
}

// DELETE /api/keywords/:id  — permanent purge (Agency only)
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireSession();
    await ensureSchema();
    if (user.role !== "agency")
      return NextResponse.json(
        { error: "Only the agency can permanently delete keywords." },
        { status: 403 }
      );
    const id = Number(params.id);
    const rows = await sql`DELETE FROM keywords WHERE id = ${id} RETURNING keyword`;
    if (rows.length === 0)
      return NextResponse.json({ error: "Keyword not found." }, { status: 404 });
    await logActivity({
      actor: user,
      action: "purge",
      entityType: "keyword",
      entityId: id,
      keywordText: rows[0].keyword,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}

function pickFields(r: Record<string, unknown>) {
  return {
    campaign: r.campaign,
    ad_group: r.ad_group,
    keyword: r.keyword,
    match_type: r.match_type,
    intent_cluster: r.intent_cluster,
    priority: r.priority,
    notes: r.notes,
  };
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && (err as { code?: string }).code === "23505");
}
