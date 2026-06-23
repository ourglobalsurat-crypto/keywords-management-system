import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { requireSession } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/sem  → latest report + history list
export async function GET() {
  try {
    await requireSession();
    await ensureSchema();
    const history = await sql`
      SELECT id, label, period_start, period_end, file_count, health_score,
             uploaded_by, uploaded_role, created_at
      FROM sem_uploads
      ORDER BY created_at DESC
      LIMIT 30`;
    const latestRows = await sql`
      SELECT report FROM sem_uploads ORDER BY created_at DESC LIMIT 1`;
    return NextResponse.json({
      latest: latestRows[0]?.report ?? null,
      history,
    });
  } catch (e) {
    return jsonError(e);
  }
}

// DELETE /api/sem  → wipe ALL data for this section only
export async function DELETE() {
  try {
    const user = await requireSession();
    await ensureSchema();
    const rows = await sql`DELETE FROM sem_uploads RETURNING id`;
    await logActivity({
      actor: user,
      action: "purge",
      entityType: "sem",
      keywordText: `${rows.length} Ads Suggestions upload${rows.length === 1 ? "" : "s"} cleared`,
      details: { bulk: true, count: rows.length },
    });
    return NextResponse.json({ deleted: rows.length });
  } catch (e) {
    return jsonError(e);
  }
}
