"use client";

import { useRef, useState } from "react";
import { toast } from "./Toast";
import { IconUpload, IconDownload, IconSpreadsheet } from "./icons";

type Summary = {
  sheetsFound: string[];
  keywords: { total: number; new: number; duplicates: number };
  negatives: { total: number; new: number; duplicates: number };
  geo: { total: number; new: number };
  seeds: { total: number; new: number };
};

type CommitResult = {
  inserted: number;
  duplicates: number;
  keywords: number;
  negatives: number;
  geo: number;
  seeds: number;
};

export default function ImportExportClient() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function onPickFile(f: File | null) {
    setSummary(null);
    setResult(null);
    setFile(f);
    if (!f) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await fetch("/api/import?mode=preview", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not read file");
      setSummary(data.summary);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not read file", "error");
      setFile(null);
    } finally {
      setBusy(false);
    }
  }

  async function commitImport() {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/import?mode=commit", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setResult(data.result);
      setSummary(null);
      toast(`Imported ${data.result.inserted} new items`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Import failed", "error");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setFile(null);
    setSummary(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Import / Export</h1>
        <p className="text-sm text-slate-500">
          Bring your Excel keyword research in, or export a Google Ads-ready file.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* IMPORT */}
        <section className="card p-5">
          <h2 className="mb-1 text-lg font-semibold text-slate-800">Import Excel</h2>
          <p className="mb-4 text-sm text-slate-500">
            Upload your <strong>.xlsx</strong> with sheets: B2B Keywords, Brand &amp;
            Series, Negative Keywords, Geo &amp; Seeds. Duplicates are detected and
            skipped automatically.
          </p>

          <div
            className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onPickFile(e.dataTransfer.files?.[0] ?? null);
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            />
            <IconUpload className="mb-2 h-7 w-7 text-slate-400" />
            <p className="mb-2 text-sm text-slate-500">
              {file ? file.name : "Drag & drop your Excel file here, or"}
            </p>
            <button
              className="btn-secondary"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
            >
              {busy && !summary ? "Reading…" : "Choose file"}
            </button>
          </div>

          {summary && (
            <div className="mt-4">
              <div className="mb-3 text-xs text-slate-400">
                Sheets found: {summary.sheetsFound.join(", ") || "none"}
              </div>
              <div className="space-y-2">
                <PreviewRow label="Keywords (B2B + Brand & Series)" data={summary.keywords} />
                <PreviewRow label="Negative keywords" data={summary.negatives} />
                <PreviewRow label="Geo locations" data={summary.geo} />
                <PreviewRow label="Seeds" data={summary.seeds} />
              </div>
              <div className="mt-4 flex gap-2">
                <button className="btn-primary" onClick={commitImport} disabled={busy}>
                  {busy ? "Importing…" : "Import new items"}
                </button>
                <button className="btn-secondary" onClick={reset} disabled={busy}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {result && (
            <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <div className="mb-1 font-semibold text-emerald-800">
                Import complete — {result.inserted} new item
                {result.inserted === 1 ? "" : "s"} added
              </div>
              <ul className="text-sm text-emerald-700">
                <li>Keywords: {result.keywords}</li>
                <li>Negatives: {result.negatives}</li>
                <li>Geo locations: {result.geo}</li>
                <li>Seeds: {result.seeds}</li>
                <li className="text-emerald-600">
                  {result.duplicates} duplicate{result.duplicates === 1 ? "" : "s"} skipped
                </li>
              </ul>
              <button className="btn-secondary mt-3" onClick={reset}>
                Import another file
              </button>
            </div>
          )}
        </section>

        {/* EXPORT */}
        <section className="card p-5">
          <h2 className="mb-1 text-lg font-semibold text-slate-800">Export</h2>
          <p className="mb-4 text-sm text-slate-500">
            Download your keywords for upload to Google Ads, or a full Excel backup.
          </p>

          <div className="space-y-3">
            <a
              href="/api/export?format=googleads-csv"
              className="flex items-center justify-between rounded-lg border border-slate-200 p-4 transition hover:border-brand-200 hover:bg-slate-50"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <IconSpreadsheet className="h-5 w-5" />
                </span>
                <div>
                  <div className="font-medium text-slate-800">Google Ads Editor CSV</div>
                  <div className="text-sm text-slate-500">
                    Ready to bulk-import into Google Ads Editor (keywords + negatives).
                  </div>
                </div>
              </div>
              <span className="btn-primary pointer-events-none flex-shrink-0">
                <IconDownload className="h-4 w-4" />
                Download
              </span>
            </a>

            <a
              href="/api/export?format=xlsx"
              className="flex items-center justify-between rounded-lg border border-slate-200 p-4 transition hover:border-brand-200 hover:bg-slate-50"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                  <IconSpreadsheet className="h-5 w-5" />
                </span>
                <div>
                  <div className="font-medium text-slate-800">Excel backup (.xlsx)</div>
                  <div className="text-sm text-slate-500">
                    Full 4-sheet workbook — can be re-imported here later.
                  </div>
                </div>
              </div>
              <span className="btn-secondary pointer-events-none flex-shrink-0">
                <IconDownload className="h-4 w-4" />
                Download
              </span>
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}

function PreviewRow({
  label,
  data,
}: {
  label: string;
  data: { total: number; new: number; duplicates?: number };
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
      <span className="text-slate-700">{label}</span>
      <span className="flex items-center gap-3">
        <span className="font-medium text-emerald-700">{data.new} new</span>
        {typeof data.duplicates === "number" && data.duplicates > 0 && (
          <span className="text-amber-600">{data.duplicates} duplicate</span>
        )}
        <span className="text-slate-400">of {data.total}</span>
      </span>
    </div>
  );
}
