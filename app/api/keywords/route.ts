import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { requireSession } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { normalizeMatchType, LIST_TYPES } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/keywords?list_type=&status=&search=&include_removed=
export async function GET(req: Request) {
  try {
    await requireSession();
    await ensureSchema();

    const url = new URL(req.url);
    const listType = url.searchParams.get("list_type") || "";
    const status = url.searchParams.get("status") || "";
    const search = (url.searchParams.get("search") || "").trim();
    const includeRemoved = url.searchParams.get("include_removed") === "1";

    const conds = [sql`TRUE`];
    if (listType && (LIST_TYPES as readonly string[]).includes(listType))
      conds.push(sql`list_type = ${listType}`);
    if (status) conds.push(sql`status = ${status}`);
    else if (!includeRemoved) conds.push(sql`status <> 'removed'`);
    if (search) {
      const like = `%${search}%`;
      conds.push(
        sql`(keyword ILIKE ${like} OR campaign ILIKE ${like} OR ad_group ILIKE ${like} OR intent_cluster ILIKE ${like})`
      );
    }
    const where = conds.reduce((acc, c) => sql`${acc} AND ${c}`);

    const rows = await sql`
      SELECT * FROM keywords
      WHERE ${where}
      ORDER BY list_type, campaign, ad_group, keyword
    `;
    return NextResponse.json({ keywords: rows });
  } catch (e) {
    return jsonError(e);
  }
}

// POST /api/keywords  — add a single keyword (deduplicated)
export async function POST(req: Request) {
  try {
    const user = await requireSession();
    await ensureSchema();
    const body = await req.json();

    const keyword = String(body.keyword ?? "").trim();
    if (!keyword)
      return NextResponse.json({ error: "Keyword is required." }, { status: 400 });

    const listType = (LIST_TYPES as readonly string[]).includes(body.list_type)
      ? body.list_type
      : "b2b";
    const row = {
      list_type: listType,
      campaign: String(body.campaign ?? "").trim(),
      ad_group: String(body.ad_group ?? "").trim(),
      keyword,
      match_type: normalizeMatchType(body.match_type),
      intent_cluster: String(body.intent_cluster ?? "").trim(),
      priority: String(body.priority ?? "").trim(),
      notes: String(body.notes ?? "").trim(),
    };

    return await insertKeyword(user, row);
  } catch (e) {
    return jsonError(e);
  }
}

async function insertKeyword(
  user: { name: string; role: "client" | "agency" },
  row: {
    list_type: string;
    campaign: string;
    ad_group: string;
    keyword: string;
    match_type: string;
    intent_cluster: string;
    priority: string;
    notes: string;
  }
) {
  const inserted = await sql`
    INSERT INTO keywords
      (list_type, campaign, ad_group, keyword, match_type, intent_cluster,
       priority, notes, status, created_by, created_role, updated_by, updated_role)
    VALUES
      (${row.list_type}, ${row.campaign}, ${row.ad_group}, ${row.keyword},
       ${row.match_type}, ${row.intent_cluster}, ${row.priority}, ${row.notes},
       'active', ${user.name}, ${user.role}, ${user.name}, ${user.role})
    ON CONFLICT DO NOTHING
    RETURNING *
  `;

  if (inserted.length === 0) {
    return NextResponse.json(
      {
        error:
          "This keyword already exists in this campaign / ad group with the same match type.",
        duplicate: true,
      },
      { status: 409 }
    );
  }

  const created = inserted[0];
  await logActivity({
    actor: user,
    action: "add",
    entityType: "keyword",
    entityId: Number(created.id),
    keywordText: created.keyword,
    details: { list_type: created.list_type, match_type: created.match_type },
  });

  return NextResponse.json({ keyword: created }, { status: 201 });
}
