import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { requireSession } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { buildExcelBackup, buildGoogleAdsCsv } from "@/lib/excel";
import type { Keyword, NegativeKeyword, GeoLocation, Seed } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const user = await requireSession();
    await ensureSchema();
    const format = new URL(req.url).searchParams.get("format") || "googleads-csv";

    const keywords = (await sql`SELECT * FROM keywords ORDER BY list_type, campaign, ad_group, keyword`) as unknown as Keyword[];
    const negatives = (await sql`SELECT * FROM negative_keywords ORDER BY category, keyword`) as unknown as NegativeKeyword[];

    const stamp = new Date().toISOString().slice(0, 10);

    if (format === "xlsx") {
      const geo = (await sql`SELECT * FROM geo_locations ORDER BY tier, location`) as unknown as GeoLocation[];
      const seeds = (await sql`SELECT * FROM seeds ORDER BY seed_term`) as unknown as Seed[];
      const buf = buildExcelBackup({ keywords, negatives, geo, seeds });
      await logActivity({
        actor: user,
        action: "export",
        entityType: "workbook",
        details: { format: "xlsx" },
      });
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="keywords-backup-${stamp}.xlsx"`,
        },
      });
    }

    // default: Google Ads Editor CSV
    const csv = buildGoogleAdsCsv({ keywords, negatives });
    await logActivity({
      actor: user,
      action: "export",
      entityType: "workbook",
      details: { format: "googleads-csv" },
    });
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="google-ads-keywords-${stamp}.csv"`,
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
