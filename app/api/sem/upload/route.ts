import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { ensureSchema } from "@/lib/schema";
import { requireSession } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { jsonError } from "@/lib/http";
import { parseUploadFiles, analyzeGoogleAds } from "@/lib/sem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED = [".zip", ".rar", ".csv", ".tsv", ".txt"];

// POST /api/sem/upload  → accepts one or more Google Ads files (.zip / .rar /
// .csv), extracts + parses + analyses them together, stores the report.
export async function POST(req: Request) {
  try {
    const user = await requireSession();
    await ensureSchema();

    const formData = await req.formData();
    const uploaded = [
      ...formData.getAll("files"),
      ...formData.getAll("file"),
    ].filter((f): f is File => f instanceof File);

    if (uploaded.length === 0)
      return NextResponse.json({ error: "No files uploaded." }, { status: 400 });

    const bad = uploaded.find(
      (f) => !ALLOWED.some((ext) => f.name.toLowerCase().endsWith(ext))
    );
    if (bad)
      return NextResponse.json(
        { error: `Unsupported file “${bad.name}”. Upload .zip, .rar, or .csv files.` },
        { status: 400 }
      );

    const files = await Promise.all(
      uploaded.map(async (f) => ({
        name: f.name,
        data: new Uint8Array(await f.arrayBuffer()),
      }))
    );

    let report;
    let warnings: string[] | undefined;
    try {
      const parsed = await parseUploadFiles(files);
      warnings = parsed.warnings;
      if (Object.keys(parsed.datasets).length === 0)
        return NextResponse.json(
          {
            error:
              "No recognisable Google Ads reports were found. Upload the 'Download cards data' ZIP/RAR (Campaigns, Search_keywords, Searches, Devices, etc.) or the individual CSVs.",
            warnings: parsed.warnings,
          },
          { status: 400 }
        );
      report = analyzeGoogleAds(parsed);
    } catch (err) {
      return NextResponse.json(
        { error: "Could not read those files. Please re-export and try again." },
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

    return NextResponse.json({ id: inserted[0].id, report, warnings });
  } catch (e) {
    return jsonError(e);
  }
}
