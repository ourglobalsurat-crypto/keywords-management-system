import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { SemReport, Priority } from "./sem";

const ORANGE: [number, number, number] = [232, 116, 44];
const NAVY: [number, number, number] = [33, 64, 107];
const SLATE: [number, number, number] = [51, 65, 85];
const LIGHT: [number, number, number] = [241, 245, 249];

const PRIORITY_COLOR: Record<Priority, [number, number, number]> = {
  critical: [190, 18, 60],
  high: [217, 119, 6],
  medium: [2, 132, 199],
  low: [100, 116, 139],
};

function money(cur: string, n: number) {
  return `${cur}${Math.round(n).toLocaleString()}`;
}

type Doc = jsPDF & { lastAutoTable?: { finalY: number } };

export function generateSemPdf(report: SemReport) {
  const doc = new jsPDF({ unit: "pt", format: "a4" }) as Doc;
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 40;
  const cur = report.currency;

  // ── Header band ──
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, 86, "F");
  doc.setFillColor(...ORANGE);
  doc.rect(0, 86, pageW, 4, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Google Ads Performance & Optimization Report", margin, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Reporting period: ${report.period.label || "n/a"}`, margin, 58);
  doc.text(
    `Prepared by Global Surat for Medallion Fence  ·  Generated ${new Date(
      report.generatedAt
    ).toLocaleString()}`,
    margin,
    73
  );

  let y = 110;

  // ── Health score + headline numbers ──
  doc.setTextColor(...SLATE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Account Health", margin, y);
  y += 8;

  doc.setFillColor(...LIGHT);
  doc.roundedRect(margin, y, 150, 70, 6, 6, "F");
  doc.setTextColor(...NAVY);
  doc.setFontSize(34);
  doc.text(`${report.health.score}`, margin + 18, y + 44);
  doc.setFontSize(16);
  doc.text(`/100  (${report.health.grade})`, margin + 60, y + 44);

  // drivers
  let dy = y + 12;
  report.health.drivers.forEach((d) => {
    const color =
      d.status === "good" ? ([16, 122, 87] as [number, number, number]) : d.status === "ok" ? ORANGE : ([190, 18, 60] as [number, number, number]);
    doc.setFillColor(...color);
    doc.circle(margin + 180, dy - 3, 3, "F");
    doc.setTextColor(...SLATE);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`${d.label}: ${d.note}`, margin + 190, dy);
    dy += 14;
  });
  y += 86;

  // ── KPI table ──
  autoTable(doc, {
    startY: y,
    head: [["Spend", "Clicks", "Impr.", "Conv.", "CPA", "Conv. rate", "CTR", "Avg CPC", "ROAS", "Impr. share"]],
    body: [
      [
        money(cur, report.kpis.cost),
        report.kpis.clicks.toLocaleString(),
        report.kpis.impressions.toLocaleString(),
        report.kpis.conversions.toLocaleString(),
        report.kpis.costPerConv ? money(cur, report.kpis.costPerConv) : "—",
        `${report.kpis.convRate}%`,
        `${report.kpis.ctr}%`,
        money(cur, report.kpis.avgCpc),
        report.kpis.roas ? `${report.kpis.roas}x` : "—",
        report.kpis.searchIS ? `${report.kpis.searchIS}%` : "—",
      ],
    ],
    theme: "grid",
    headStyles: { fillColor: NAVY, fontSize: 8, halign: "center" },
    bodyStyles: { fontSize: 9, halign: "center" },
    margin: { left: margin, right: margin },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 24;

  // ── Recommendations ──
  doc.setTextColor(...SLATE);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Prioritized Recommendations", margin, y);
  y += 6;
  if (report.totals.wastedSpend > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...ORANGE);
    doc.text(
      `Identified ${money(cur, report.totals.wastedSpend)} of wasted spend this period (~${money(
        cur,
        report.totals.potentialMonthlySavings
      )}/month).`,
      margin,
      y + 12
    );
    y += 14;
  }

  autoTable(doc, {
    startY: y + 6,
    head: [["#", "Priority", "Area", "Recommendation & Action", "Impact"]],
    body: report.recommendations.map((r, i) => [
      String(i + 1),
      r.priority.toUpperCase(),
      r.area,
      `${r.title}\n${r.detail}\n→ ${r.action}`,
      r.impact ?? "",
    ]),
    theme: "striped",
    headStyles: { fillColor: ORANGE, fontSize: 9 },
    styles: { fontSize: 8, cellPadding: 5, valign: "top" },
    columnStyles: {
      0: { cellWidth: 18, halign: "center" },
      1: { cellWidth: 52, fontStyle: "bold" },
      2: { cellWidth: 60 },
      3: { cellWidth: "auto" },
      4: { cellWidth: 80 },
    },
    margin: { left: margin, right: margin },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 1) {
        const p = report.recommendations[data.row.index]?.priority;
        if (p) data.cell.styles.textColor = PRIORITY_COLOR[p];
      }
    },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 22;

  // ── Helper to render a titled table that auto-paginates ──
  const section = (
    title: string,
    head: string[],
    body: (string | number)[][],
    colStyles?: Record<number, { halign?: "left" | "right" | "center" }>
  ) => {
    if (body.length === 0) return;
    if (y > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      y = 50;
    }
    doc.setTextColor(...SLATE);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(title, margin, y);
    autoTable(doc, {
      startY: y + 6,
      head: [head],
      body: body.map((r) => r.map((c) => (typeof c === "number" ? c.toLocaleString() : c))),
      theme: "grid",
      headStyles: { fillColor: NAVY, fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 4 },
      columnStyles: colStyles,
      margin: { left: margin, right: margin },
    });
    y = (doc.lastAutoTable?.finalY ?? y) + 20;
  };

  section(
    "Campaign Breakdown",
    ["Campaign", "Spend", "Conv.", "CPA", "CTR", "Conv. rate", "Lost IS (Budget)", "Lost IS (Rank)"],
    report.campaigns.slice(0, 25).map((c) => [
      c.name,
      money(cur, c.cost),
      c.conversions,
      c.cpa ? money(cur, c.cpa) : "—",
      `${c.ctr}%`,
      `${c.convRate}%`,
      `${c.lostISBudget}%`,
      `${c.lostISRank}%`,
    ])
  );

  section(
    "Negative Keyword Candidates (wasted search terms)",
    ["Search term", "Cost", "Clicks", "Conv."],
    report.wastedSearchTerms.map((t) => [t.term, money(cur, t.cost), t.clicks, t.conversions]),
    { 1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" } }
  );

  section(
    "Search Terms Worth Promoting to Keywords",
    ["Search term", "Conv.", "Cost", "Conv. rate"],
    report.opportunityTerms.map((t) => [t.term, t.conversions, money(cur, t.cost), `${t.convRate}%`])
  );

  section(
    "Non-converting Keywords",
    ["Keyword", "Cost", "Clicks"],
    report.wastedKeywords.map((k) => [k.keyword, money(cur, k.cost), k.clicks])
  );

  section(
    "Device Performance & Suggested Bid Adjustments",
    ["Device", "Spend", "Conv.", "CPA", "Conv. rate", "Suggested bid adj."],
    report.devices.map((d) => [
      d.device,
      money(cur, d.cost),
      d.conversions,
      d.cpa ? money(cur, d.cpa) : "—",
      `${d.convRate}%`,
      `${d.bidAdj > 0 ? "+" : ""}${d.bidAdj}%`,
    ])
  );

  if (report.auctionInsights.length)
    section(
      "Auction Insights (competitive landscape)",
      ["Domain", "Impr. share", "Overlap", "Top of page", "Outranking"],
      report.auctionInsights.map((a) => [
        a.domain,
        `${a.impressionShare}%`,
        `${a.overlapRate}%`,
        `${a.topOfPage}%`,
        `${a.outranking}%`,
      ])
    );

  // ── Footer on every page ──
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const h = doc.internal.pageSize.getHeight();
    doc.setDrawColor(...LIGHT);
    doc.line(margin, h - 28, pageW - margin, h - 28);
    doc.setFontSize(8);
    doc.setTextColor(...SLATE);
    doc.text("Application made by Global Surat", margin, h - 14);
    doc.text(`Page ${i} of ${pages}`, pageW - margin, h - 14, { align: "right" });
  }

  const stamp = (report.period.end || new Date().toISOString().slice(0, 10)).replace(/[^0-9-]/g, "");
  doc.save(`google-ads-report-${stamp}.pdf`);
}
