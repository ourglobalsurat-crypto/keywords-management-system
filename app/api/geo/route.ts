import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { requireSession } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { GEO_TIERS } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSession();
    await ensureSchema();
    const rows = await sql`SELECT * FROM geo_locations ORDER BY tier, location`;
    return NextResponse.json({ geo: rows });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireSession();
    await ensureSchema();
    const body = await req.json();
    const location = String(body.location ?? "").trim();
    const tier = (GEO_TIERS as readonly string[]).includes(body.tier)
      ? body.tier
      : "tier1_gta";
    if (!location)
      return NextResponse.json({ error: "Location is required." }, { status: 400 });

    const inserted = await sql`
      INSERT INTO geo_locations (tier, location, notes, created_by, created_role)
      VALUES (${tier}, ${location}, ${String(body.notes ?? "").trim()},
              ${user.name}, ${user.role})
      ON CONFLICT DO NOTHING
      RETURNING *
    `;
    if (inserted.length === 0)
      return NextResponse.json(
        { error: "That location already exists in this tier.", duplicate: true },
        { status: 409 }
      );
    await logActivity({
      actor: user,
      action: "add",
      entityType: "geo",
      entityId: Number(inserted[0].id),
      keywordText: location,
      details: { tier },
    });
    return NextResponse.json({ geo: inserted[0] }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
