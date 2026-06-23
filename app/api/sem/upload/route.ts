import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { requireSession } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { parseGoogleAdsZip, analyzeGoogleAds } from "@/lib/sem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/sem/upload  → accepts the Google Ads "Download cards data" ZIP,
// parses + analyses it, stores the report, returns it.
export async function POST(req: Request) {
  try {
    const user = await requireSession();
    await ensureSchema();

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File))
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });

    const name = file.name.toLowerCase();
    if (!name.endsWith(".zip"))
      return NextResponse.json(
        { error: "Please upload the .zip file you downloaded from Google Ads (Download → CSV)." },
        { status: 400 }
      );

    const buf = Buffer.from(await file.arrayBuffer());

    let report;
    try {
      const parsed = await parseGoogleAdsZip(buf);
      if (Object.keys(parsed.datasets).length === 0)
        return NextResponse.json(
          {
            error:
              "No recognisable Google Ads reports were found in that ZIP. Make sure it's the 'Download cards data' export (it should contain files like Campaigns, Search_keywords, Searches, Devices, etc.).",
          },
          { status: 400 }
        );
      report = analyzeGoogleAds(parsed);
    } catch (err) {
      return NextResponse.json(
        { error: "Could not read that ZIP file. Please re-download and try again." },
        { status: 400 }
      );
    }

    const label =
      report.period.label ||
      new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

    const inserted = await sql`
      INSERT INTO sem_uploads
        (label, period_start, period_end, file_count, health_score,
         uploaded_by, uploaded_role, report)
      VALUES (
        ${label}, ${report.period.start}, ${report.period.end},
        ${report.filesFound.length}, ${report.health.score},
        ${user.name}, ${user.role}, ${sql.json(report as unknown as Record<string, never>)}
      )
      RETURNING id`;

    await logActivity({
      actor: user,
      action: "import",
      entityType: "sem",
      keywordText: `Ads data analysed (${label})`,
      details: {
        files: report.filesFound.length,
        health: report.health.score,
        recommendations: report.recommendations.length,
        wasted: report.totals.wastedSpend,
      },
    });

    return NextResponse.json({ id: inserted[0].id, report });
  } catch (e) {
    return jsonError(e);
  }
}
