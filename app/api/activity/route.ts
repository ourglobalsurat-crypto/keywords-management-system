import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/activity?role=&action=&search=&limit=
export async function GET(req: Request) {
  try {
    await requireSession();
    await ensureSchema();
    const url = new URL(req.url);
    const role = url.searchParams.get("role") || "";
    const action = url.searchParams.get("action") || "";
    const search = (url.searchParams.get("search") || "").trim();
    const limit = Math.min(Number(url.searchParams.get("limit") || 200), 1000);

    const conds = [sql`TRUE`];
    if (role === "client" || role === "agency")
      conds.push(sql`actor_role = ${role}`);
    if (action) conds.push(sql`action = ${action}`);
    if (search) {
      const like = `%${search}%`;
      conds.push(sql`(keyword_text ILIKE ${like} OR actor_name ILIKE ${like})`);
    }
    const where = conds.reduce((a, c) => sql`${a} AND ${c}`);

    const rows = await sql`
      SELECT * FROM activity_log
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return NextResponse.json({ activity: rows });
  } catch (e) {
    return jsonError(e);
  }
}
