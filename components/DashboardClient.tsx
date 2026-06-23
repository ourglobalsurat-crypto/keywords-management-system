"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ActivityEntry } from "@/lib/types";
import { RoleBadge } from "./Badges";
import { IconKey, IconImportExport, IconBan, IconChevronRight } from "./icons";

type Stats = {
  keywords: {
    active: number;
    paused: number;
    hold: number;
    removed: number;
    b2b: number;
    brand_series: number;
  };
  negatives: number;
  geo: number;
  seeds: number;
  changesByRole: { client: number; agency: number };
  recent: ActivityEntry[];
};

const ACTION_LABELS: Record<string, string> = {
  add: "added",
  edit: "edited",
  pause: "paused",
  hold: "put on hold",
  resume: "activated",
  remove: "removed",
  restore: "restored",
  purge: "deleted",
  import: "imported",
  export: "exported",
  login: "signed in",
};

export default function DashboardClient({ name }: { name: string }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setStats(d);
      })
      .catch(() => setError("Could not load dashboard."));
  }, []);

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Welcome back{name ? `, ${name}` : ""}
        </h1>
        <p className="text-sm text-slate-500">
          Here’s the current state of your Google Ads keywords.
        </p>
      </header>

      {error && (
        <div className="card mb-6 border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          {error.includes("DATABASE_URL")
            ? "Database not connected yet. Add your Neon DATABASE_URL to start saving data — see the README."
            : error}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active keywords" value={stats?.keywords.active} accent="emerald" />
        <StatCard label="Paused" value={stats?.keywords.paused} accent="amber" />
        <StatCard label="On hold" value={stats?.keywords.hold} accent="sky" />
        <StatCard label="Negative keywords" value={stats?.negatives} accent="rose" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">By list</h3>
          <Row label="B2B Keywords" value={stats?.keywords.b2b} />
          <Row label="Brand & Series" value={stats?.keywords.brand_series} />
          <Row label="Geo locations" value={stats?.geo} />
          <Row label="Seeds" value={stats?.seeds} />
        </div>

        <div className="card p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">
            Changes made by
          </h3>
          <div className="flex items-center justify-between py-2">
            <span className="flex items-center gap-2">
              <RoleBadge role="client" /> Client
            </span>
            <span className="text-lg font-bold text-slate-800">
              {stats?.changesByRole.client ?? "—"}
            </span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="flex items-center gap-2">
              <RoleBadge role="agency" /> Agency
            </span>
            <span className="text-lg font-bold text-slate-800">
              {stats?.changesByRole.agency ?? "—"}
            </span>
          </div>
          <Link
            href="/activity"
            className="mt-3 inline-flex items-center gap-0.5 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            View full activity log
            <IconChevronRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="card p-5">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">Quick actions</h3>
          <div className="space-y-2">
            <Link href="/keywords" className="btn-secondary w-full justify-start">
              <IconKey className="h-4 w-4 text-slate-400" />
              Manage keywords
            </Link>
            <Link href="/import" className="btn-secondary w-full justify-start">
              <IconImportExport className="h-4 w-4 text-slate-400" />
              Import / export
            </Link>
            <Link href="/negatives" className="btn-secondary w-full justify-start">
              <IconBan className="h-4 w-4 text-slate-400" />
              Negative keywords
            </Link>
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="card mt-4 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700">Recent activity</h3>
          <Link
            href="/activity"
            className="inline-flex items-center gap-0.5 text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            See all
            <IconChevronRight className="h-4 w-4" />
          </Link>
        </div>
        {!stats ? (
          <p className="py-4 text-sm text-slate-400">Loading…</p>
        ) : stats.recent.length === 0 ? (
          <p className="py-4 text-sm text-slate-400">No activity yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {stats.recent.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-2.5 text-sm">
                <RoleBadge role={a.actor_role} />
                <span className="text-slate-700">
                  <span className="font-medium">{a.actor_name}</span>{" "}
                  {ACTION_LABELS[a.action] || a.action}
                  {a.keyword_text && (
                    <span className="font-medium"> “{a.keyword_text}”</span>
                  )}
                </span>
                <span className="ml-auto whitespace-nowrap text-xs text-slate-400">
                  {new Date(a.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | undefined;
  accent: "emerald" | "amber" | "sky" | "rose";
}) {
  const ring: Record<string, string> = {
    emerald: "text-emerald-600",
    amber: "text-amber-600",
    sky: "text-sky-600",
    rose: "text-rose-600",
  };
  return (
    <div className="card p-5">
      <div className={`text-3xl font-bold ${ring[accent]}`}>
        {value ?? "—"}
      </div>
      <div className="mt-1 text-sm text-slate-500">{label}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-slate-600">{label}</span>
      <span className="font-semibold text-slate-800">{value ?? "—"}</span>
    </div>
  );
}
