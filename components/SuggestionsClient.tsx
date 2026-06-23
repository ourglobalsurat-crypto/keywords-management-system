"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Role } from "@/lib/constants";
import type { SemReport, Priority } from "@/lib/sem";
import { toast } from "./Toast";
import {
  IconUpload,
  IconDownload,
  IconTrash,
  IconSparkles,
  IconAlert,
  IconCheckCircle,
} from "./icons";

type HistoryItem = {
  id: number;
  label: string;
  file_count: number;
  health_score: number;
  uploaded_by: string;
  uploaded_role: string;
  created_at: string;
};

const PRIORITY_UI: Record<Priority, { bg: string; text: string; label: string }> = {
  critical: { bg: "bg-rose-100", text: "text-rose-700", label: "Critical" },
  high: { bg: "bg-amber-100", text: "text-amber-700", label: "High" },
  medium: { bg: "bg-sky-100", text: "text-sky-700", label: "Medium" },
  low: { bg: "bg-slate-100", text: "text-slate-600", label: "Low" },
};

export default function SuggestionsClient({ role }: { role: Role }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<SemReport | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const money = useCallback(
    (n: number) => `${report?.currency ?? "$"}${Math.round(n).toLocaleString()}`,
    [report]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sem");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReport(data.latest);
      setHistory(data.history || []);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to load", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onUpload(fileList: FileList | File[] | null) {
    const files = fileList ? Array.from(fileList) : [];
    if (files.length === 0) return;
    setBusy(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      const res = await fetch("/api/sem/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        (data.warnings || []).forEach((w: string) => toast(w, "error"));
        throw new Error(data.error || "Upload failed");
      }
      setReport(data.report);
      (data.warnings || []).forEach((w: string) => toast(w, "info"));
      toast(`Analysis complete · ${files.length} file${files.length === 1 ? "" : "s"}`, "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed", "error");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function downloadPdf() {
    if (!report) return;
    try {
      const { generateSemPdf } = await import("@/lib/semPdf");
      generateSemPdf(report);
    } catch {
      toast("Could not generate PDF", "error");
    }
  }

  async function deleteAll() {
    if (
      !confirm(
        "Delete ALL Ads Suggestions data? This clears every uploaded report in this section only. Your keywords and other data are not affected."
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch("/api/sem", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReport(null);
      setHistory([]);
      toast(`Cleared ${data.deleted} report(s)`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <IconSparkles className="h-6 w-6 text-brand-600" />
            Ads Suggestions
          </h1>
          <p className="max-w-2xl text-sm text-slate-500">
            Upload what you download from Google Ads (Overview → “Download cards data”) — a{" "}
            <strong>.zip</strong> or <strong>.rar</strong>, plus any extra <strong>.csv</strong>{" "}
            files you want to add. We analyse everything together and produce an expert,
            prioritized optimization plan. This section is fully separate — nothing here mixes
            with your keyword lists.
          </p>
        </div>
        {report && (
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={downloadPdf}>
              <IconDownload className="h-4 w-4" />
              Download PDF report
            </button>
            <button className="btn-danger" onClick={deleteAll} disabled={busy}>
              <IconTrash className="h-4 w-4" />
              Delete all data
            </button>
          </div>
        )}
      </header>

      {/* Upload */}
      <div
        className="card mb-6 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 bg-white px-4 py-8 text-center"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onUpload(e.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".zip,.rar,.csv,.tsv"
          multiple
          className="hidden"
          onChange={(e) => onUpload(e.target.files)}
        />
        <IconUpload className="mb-2 h-7 w-7 text-slate-400" />
        <p className="mb-1 text-sm text-slate-500">
          {busy
            ? "Analysing your Google Ads data…"
            : "Drag & drop your Google Ads files here, or"}
        </p>
        <p className="mb-3 text-xs text-slate-400">
          Accepts <strong>.zip</strong>, <strong>.rar</strong>, and individual{" "}
          <strong>.csv</strong> files — select several at once to combine them.
        </p>
        <button className="btn-primary" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? "Working…" : report ? "Upload more files" : "Choose files"}
        </button>
      </div>

      {loading ? (
        <div className="card p-10 text-center text-slate-400">Loading…</div>
      ) : !report ? (
        <div className="card p-10 text-center text-slate-400">
          No analysis yet. Upload your Google Ads ZIP to generate your first report.
        </div>
      ) : (
        <Report report={report} money={money} />
      )}

      {/* History */}
      {history.length > 1 && (
        <div className="card mt-6 p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Previous uploads</h3>
          <ul className="divide-y divide-slate-100 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex items-center justify-between py-2">
                <span className="text-slate-700">{h.label}</span>
                <span className="flex items-center gap-3 text-xs text-slate-400">
                  <span>Health {h.health_score}/100</span>
                  <span>{h.uploaded_by}</span>
                  <span>{new Date(h.created_at).toLocaleDateString()}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Report({ report, money }: { report: SemReport; money: (n: number) => string }) {
  return (
    <div className="space-y-6">
      {/* Health + KPIs */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="card flex flex-col items-center justify-center p-5 text-center">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Account health
          </div>
          <div className="my-1 text-5xl font-extrabold text-brand-700">{report.health.score}</div>
          <div className="text-sm text-slate-500">Grade {report.health.grade} · {report.period.label || "—"}</div>
        </div>
        <div className="card p-4 lg:col-span-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi label="Spend" value={money(report.kpis.cost)} />
            <Kpi label="Conversions" value={report.kpis.conversions.toLocaleString()} />
            <Kpi label="CPA" value={report.kpis.costPerConv ? money(report.kpis.costPerConv) : "—"} />
            <Kpi label="Conv. rate" value={`${report.kpis.convRate}%`} />
            <Kpi label="Clicks" value={report.kpis.clicks.toLocaleString()} />
            <Kpi label="CTR" value={`${report.kpis.ctr}%`} />
            <Kpi label="Avg CPC" value={money(report.kpis.avgCpc)} />
            <Kpi label="Impr. share" value={report.kpis.searchIS ? `${report.kpis.searchIS}%` : "—"} />
          </div>
        </div>
      </div>

      {/* Health drivers */}
      <div className="card p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Health drivers</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {report.health.drivers.map((d) => (
            <div key={d.label} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
              <span
                className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                  d.status === "good" ? "bg-emerald-500" : d.status === "ok" ? "bg-amber-500" : "bg-rose-500"
                }`}
              />
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-700">{d.label}</div>
                <div className="truncate text-xs text-slate-400">{d.note}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Wasted spend banner */}
      {report.totals.wastedSpend > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <IconAlert className="h-6 w-6 flex-shrink-0 text-amber-600" />
          <div className="text-sm text-amber-800">
            <span className="font-semibold">{money(report.totals.wastedSpend)} wasted</span> this period
            on clicks that didn’t convert — roughly{" "}
            <span className="font-semibold">{money(report.totals.potentialMonthlySavings)}/month</span>{" "}
            you can recover with the negatives and pauses below.
          </div>
        </div>
      )}

      {/* Recommendations */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-800">
          Prioritized recommendations ({report.recommendations.length})
        </h2>
        {report.recommendations.length === 0 ? (
          <div className="card flex items-center gap-2 p-5 text-sm text-emerald-700">
            <IconCheckCircle className="h-5 w-5" />
            No critical issues detected — the account is in good shape for this period.
          </div>
        ) : (
          <div className="space-y-3">
            {report.recommendations.map((r, i) => {
              const ui = PRIORITY_UI[r.priority];
              return (
                <div key={i} className="card p-4">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className={`chip ${ui.bg} ${ui.text}`}>{ui.label}</span>
                    <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                      {r.area}
                    </span>
                    {r.impact && (
                      <span className="ml-auto rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                        {r.impact}
                      </span>
                    )}
                  </div>
                  <div className="font-semibold text-slate-800">{r.title}</div>
                  <p className="mt-1 text-sm text-slate-600">{r.detail}</p>
                  <p className="mt-1.5 text-sm text-brand-700">
                    <span className="font-semibold">Action: </span>
                    {r.action}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Tables */}
      <Table
        title="Negative keyword candidates (wasted search terms)"
        head={["Search term", "Cost", "Clicks", "Conv."]}
        rows={report.wastedSearchTerms.map((t) => [t.term, money(t.cost), String(t.clicks), String(t.conversions)])}
        empty="No clearly wasteful search terms found."
        rightAlign={[1, 2, 3]}
      />
      <Table
        title="Search terms worth promoting to keywords"
        head={["Search term", "Conv.", "Cost", "Conv. rate"]}
        rows={report.opportunityTerms.map((t) => [t.term, String(t.conversions), money(t.cost), `${t.convRate}%`])}
        empty="No standout converting search terms this period."
        rightAlign={[1, 2, 3]}
      />
      <Table
        title="Campaign breakdown"
        head={["Campaign", "Spend", "Conv.", "CPA", "CTR", "Conv. rate", "Lost IS (Budget)", "Lost IS (Rank)"]}
        rows={report.campaigns.map((c) => [
          c.name,
          money(c.cost),
          String(c.conversions),
          c.cpa ? money(c.cpa) : "—",
          `${c.ctr}%`,
          `${c.convRate}%`,
          `${c.lostISBudget}%`,
          `${c.lostISRank}%`,
        ])}
        empty="No campaign data in this export."
        rightAlign={[1, 2, 3, 4, 5, 6, 7]}
      />
      <Table
        title="Device performance & suggested bid adjustments"
        head={["Device", "Spend", "Conv.", "CPA", "Conv. rate", "Suggested bid adj."]}
        rows={report.devices.map((d) => [
          d.device,
          money(d.cost),
          String(d.conversions),
          d.cpa ? money(d.cpa) : "—",
          `${d.convRate}%`,
          `${d.bidAdj > 0 ? "+" : ""}${d.bidAdj}%`,
        ])}
        empty="No device data in this export."
        rightAlign={[1, 2, 3, 4, 5]}
      />
      {report.auctionInsights.length > 0 && (
        <Table
          title="Auction insights (competitive landscape)"
          head={["Domain", "Impr. share", "Overlap rate", "Top of page", "Outranking"]}
          rows={report.auctionInsights.map((a) => [
            a.domain,
            `${a.impressionShare}%`,
            `${a.overlapRate}%`,
            `${a.topOfPage}%`,
            `${a.outranking}%`,
          ])}
          empty=""
          rightAlign={[1, 2, 3, 4]}
        />
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-lg font-bold text-slate-800">{value}</div>
    </div>
  );
}

function Table({
  title,
  head,
  rows,
  empty,
  rightAlign = [],
}: {
  title: string;
  head: string[];
  rows: string[][];
  empty: string;
  rightAlign?: number[];
}) {
  return (
    <div>
      <h3 className="mb-2 text-base font-semibold text-slate-800">{title}</h3>
      <div className="card overflow-hidden">
        <div className="max-h-96 overflow-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                {head.map((h, i) => (
                  <th key={h} className={`px-4 py-2.5 ${rightAlign.includes(i) ? "text-right" : ""}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={head.length} className="px-4 py-6 text-center text-slate-400">
                    {empty}
                  </td>
                </tr>
              ) : (
                rows.map((r, ri) => (
                  <tr key={ri} className="hover:bg-slate-50/60">
                    {r.map((c, ci) => (
                      <td
                        key={ci}
                        className={`px-4 py-2.5 ${
                          rightAlign.includes(ci) ? "text-right tabular-nums text-slate-600" : "text-slate-700"
                        } ${ci === 0 ? "font-medium" : ""}`}
                      >
                        {c}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
