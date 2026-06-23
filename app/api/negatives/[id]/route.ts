import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { requireSession } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Soft-remove (status='removed'). DELETE = permanent purge (agency only).
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireSession();
    await ensureSchema();
    const id = Number(params.id);
    const body = await req.json();
    const status = String(body.status ?? "removed");
    const rows = await sql`SELECT keyword, status FROM negative_keywords WHERE id = ${id}`;
    if (rows.length === 0)
      return NextResponse.json({ error: "Not found." }, { status: 404 });

    const updated = await sql`
      UPDATE negative_keywords
      SET status = ${status}, updated_by = ${user.name},
          updated_role = ${user.role}, updated_at = now()
      WHERE id = ${id}
      RETURNING *
    `;
    await logActivity({
      actor: user,
      action: status === "removed" ? "remove" : status === "active" ? "restore" : "edit",
      entityType: "negative",
      entityId: id,
      keywordText: rows[0].keyword,
      details: { from: rows[0].status, to: status },
    });
    return NextResponse.json({ negative: updated[0] });
  } catch (e) {
    return jsonError(e);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireSession();
    await ensureSchema();
    if (user.role !== "agency")
      return NextResponse.json(
        { error: "Only the agency can permanently delete." },
        { status: 403 }
      );
    const id = Number(params.id);
    const rows = await sql`DELETE FROM negative_keywords WHERE id = ${id} RETURNING keyword`;
    if (rows.length === 0)
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    await logActivity({
      actor: user,
      action: "purge",
      entityType: "negative",
      entityId: id,
      keywordText: rows[0].keyword,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
