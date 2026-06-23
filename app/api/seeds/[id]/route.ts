import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { requireSession } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireSession();
    await ensureSchema();
    const id = Number(params.id);
    const rows = await sql`DELETE FROM seeds WHERE id = ${id} RETURNING seed_term, seed_url`;
    if (rows.length === 0)
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    await logActivity({
      actor: user,
      action: "remove",
      entityType: "seed",
      entityId: id,
      keywordText: rows[0].seed_term || rows[0].seed_url,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
