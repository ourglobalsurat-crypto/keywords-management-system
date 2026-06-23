import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { requireSession } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { normalizeMatchType } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await requireSession();
    await ensureSchema();
    const url = new URL(req.url);
    const search = (url.searchParams.get("search") || "").trim();

    const rows = search
      ? await sql`
          SELECT * FROM negative_keywords
          WHERE status <> 'removed'
            AND (keyword ILIKE ${"%" + search + "%"} OR category ILIKE ${"%" + search + "%"})
          ORDER BY category, keyword`
      : await sql`
          SELECT * FROM negative_keywords
          WHERE status <> 'removed'
          ORDER BY category, keyword`;
    return NextResponse.json({ negatives: rows });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireSession();
    await ensureSchema();
    const body = await req.json();
    const keyword = String(body.keyword ?? "").trim();
    if (!keyword)
      return NextResponse.json({ error: "Negative keyword is required." }, { status: 400 });

    const row = {
      category: String(body.category ?? "").trim(),
      keyword,
      match_type: normalizeMatchType(body.match_type),
      notes: String(body.notes ?? "").trim(),
    };

    const inserted = await sql`
      INSERT INTO negative_keywords
        (category, keyword, match_type, notes, status,
         created_by, created_role, updated_by, updated_role)
      VALUES
        (${row.category}, ${row.keyword}, ${row.match_type}, ${row.notes}, 'active',
         ${user.name}, ${user.role}, ${user.name}, ${user.role})
      ON CONFLICT DO NOTHING
      RETURNING *
    `;
    if (inserted.length === 0)
      return NextResponse.json(
        { error: "This negative keyword already exists in this category.", duplicate: true },
        { status: 409 }
      );

    await logActivity({
      actor: user,
      action: "add",
      entityType: "negative",
      entityId: Number(inserted[0].id),
      keywordText: inserted[0].keyword,
    });
    return NextResponse.json({ negative: inserted[0] }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
