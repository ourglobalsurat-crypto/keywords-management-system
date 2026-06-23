"use client";

import { useCallback, useEffect, useState } from "react";
import type { Role } from "@/lib/constants";
import type { ActivityEntry } from "@/lib/types";
import { RoleBadge } from "./Badges";
import { toast } from "./Toast";

const ACTION_LABELS: Record<string, string> = {
  add: "Added",
  edit: "Edited",
  pause: "Paused",
  hold: "Put on hold",
  resume: "Activated",
  remove: "Removed",
  restore: "Restored",
  purge: "Permanently deleted",
  import: "Imported",
  export: "Exported",
  login: "Signed in",
};

const ACTION_STYLES: Record<string, string> = {
  add: "bg-emerald-100 text-emerald-700",
  edit: "bg-blue-100 text-blue-700",
  pause: "bg-amber-100 text-amber-700",
  hold: "bg-sky-100 text-sky-700",
  resume: "bg-emerald-100 text-emerald-700",
  remove: "bg-rose-100 text-rose-700",
  restore: "bg-emerald-100 text-emerald-700",
  purge: "bg-rose-200 text-rose-800",
  import: "bg-violet-100 text-violet-700",
  export: "bg-violet-100 text-violet-700",
  login: "bg-slate-100 text-slate-600",
};

function fmt(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ActivityClient() {
  const [rows, setRows] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<Role | "all">("all");
  const [actionFilter, setActionFilter] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (roleFilter !== "all") qs.set("role", roleFilter);
      if (actionFilter) qs.set("action", actionFilter);
      if (search) qs.set("search", search);
      const res = await fetch(`/api/activity?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRows(data.activity);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to load", "error");
    } finally {
      setLoading(false);
    }
  }, [roleFilter, actionFilter, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Activity Log</h1>
        <p className="text-sm text-slate-500">
          Every change, with a clear record of whether it was made by the{" "}
          <span className="font-medium text-emerald-700">Client</span> or the{" "}
          <span className="font-medium text-violet-700">Agency</span>.
        </p>
      </header>

      {/* Role tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {([
          { key: "all", label: "Everyone" },
          { key: "client", label: "Client (Khushan)" },
          { key: "agency", label: "Agency (Global Surat)" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setRoleFilter(t.key as Role | "all")}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              roleFilter === t.key
                ? "bg-brand-600 text-white shadow-sm"
                : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
        <input
          className="input max-w-xs"
          placeholder="Search keyword or person…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input max-w-[180px]"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
        >
          <option value="">All actions</option>
          {Object.keys(ACTION_LABELS).map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a]}
            </option>
          ))}
        </select>
        <div className="ml-auto text-sm text-slate-500">{rows.length} entries</div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Who</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                    No activity yet.
                  </td>
                </tr>
              ) : (
                rows.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/60">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                      {fmt(a.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <RoleBadge role={a.actor_role} />
                        <span className="text-slate-700">{a.actor_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`chip ${ACTION_STYLES[a.action] || "bg-slate-100 text-slate-600"}`}
                      >
                        {ACTION_LABELS[a.action] || a.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {a.keyword_text || <span className="text-slate-300">—</span>}
                      {a.entity_type && (
                        <span className="ml-1 text-xs text-slate-400">
                          ({a.entity_type})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {summarise(a)}
                    </td>
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

function summarise(a: ActivityEntry): string {
  const d = a.details || {};
  if (a.action === "import") {
    const parts: string[] = [];
    if (typeof d.inserted === "number") parts.push(`${d.inserted} added`);
    if (typeof d.duplicates === "number") parts.push(`${d.duplicates} duplicates skipped`);
    return parts.join(", ");
  }
  if (a.action === "export") {
    return d.format ? `Format: ${d.format}` : "";
  }
  if (d.from && d.to) return `${d.from} → ${d.to}`;
  return "";
}
