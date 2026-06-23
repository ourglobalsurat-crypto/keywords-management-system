import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { requireSession } from "@/lib/auth";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSession();
    await ensureSchema();

    const [byStatus, byList, neg, geo, seeds, recent, byActor] = await Promise.all([
      sql`SELECT status, count(*)::int AS n FROM keywords GROUP BY status`,
      sql`SELECT list_type, count(*)::int AS n FROM keywords WHERE status <> 'removed' GROUP BY list_type`,
      sql`SELECT count(*)::int AS n FROM negative_keywords WHERE status <> 'removed'`,
      sql`SELECT count(*)::int AS n FROM geo_locations`,
      sql`SELECT count(*)::int AS n FROM seeds`,
      sql`SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 8`,
      sql`SELECT actor_role, count(*)::int AS n FROM activity_log
          WHERE action NOT IN ('login','export') GROUP BY actor_role`,
    ]);

    const statusCounts: Record<string, number> = {};
    for (const r of byStatus) statusCounts[r.status as string] = r.n as number;
    const listCounts: Record<string, number> = {};
    for (const r of byList) listCounts[r.list_type as string] = r.n as number;
    const actorCounts: Record<string, number> = {};
    for (const r of byActor) actorCounts[(r.actor_role as string) || "system"] = r.n as number;

    return NextResponse.json({
      keywords: {
        active: statusCounts.active || 0,
        paused: statusCounts.paused || 0,
        hold: statusCounts.hold || 0,
        removed: statusCounts.removed || 0,
        b2b: listCounts.b2b || 0,
        brand_series: listCounts.brand_series || 0,
      },
      negatives: neg[0]?.n || 0,
      geo: geo[0]?.n || 0,
      seeds: seeds[0]?.n || 0,
      changesByRole: {
        client: actorCounts.client || 0,
        agency: actorCounts.agency || 0,
      },
      recent,
    });
  } catch (e) {
    return jsonError(e);
  }
}
