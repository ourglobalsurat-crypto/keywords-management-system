import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { requireSession } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSession();
    await ensureSchema();
    const rows = await sql`SELECT * FROM seeds ORDER BY seed_term, seed_url`;
    return NextResponse.json({ seeds: rows });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireSession();
    await ensureSchema();
    const body = await req.json();
    const seedTerm = String(body.seed_term ?? "").trim();
    const seedUrl = String(body.seed_url ?? "").trim();
    if (!seedTerm && !seedUrl)
      return NextResponse.json(
        { error: "Enter a seed term or a seed URL." },
        { status: 400 }
      );

    const inserted = await sql`
      INSERT INTO seeds (seed_term, seed_url, source_site, notes, created_by, created_role)
      VALUES (${seedTerm}, ${seedUrl}, ${String(body.source_site ?? "").trim()},
              ${String(body.notes ?? "").trim()}, ${user.name}, ${user.role})
      ON CONFLICT DO NOTHING
      RETURNING *
    `;
    if (inserted.length === 0)
      return NextResponse.json(
        { error: "That seed already exists.", duplicate: true },
        { status: 409 }
      );
    await logActivity({
      actor: user,
      action: "add",
      entityType: "seed",
      entityId: Number(inserted[0].id),
      keywordText: seedTerm || seedUrl,
    });
    return NextResponse.json({ seed: inserted[0] }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
