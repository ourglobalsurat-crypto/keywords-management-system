"use client";

import { useCallback, useEffect, useState } from "react";
import { GEO_TIERS, GEO_TIER_LABELS } from "@/lib/constants";
import type { GeoTier } from "@/lib/constants";
import type { GeoLocation, Seed } from "@/lib/types";
import { toast } from "./Toast";

export default function GeoSeedsClient() {
  const [geo, setGeo] = useState<GeoLocation[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [loading, setLoading] = useState(true);

  // geo add form
  const [geoTier, setGeoTier] = useState<GeoTier>("tier1_gta");
  const [geoLocation, setGeoLocation] = useState("");
  // seed add form
  const [seedTerm, setSeedTerm] = useState("");
  const [seedUrl, setSeedUrl] = useState("");
  const [seedSite, setSeedSite] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, s] = await Promise.all([
        fetch("/api/geo").then((r) => r.json()),
        fetch("/api/seeds").then((r) => r.json()),
      ]);
      setGeo(g.geo || []);
      setSeeds(s.seeds || []);
    } catch {
      toast("Failed to load", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addGeo(e: React.FormEvent) {
    e.preventDefault();
    if (!geoLocation.trim()) return;
    try {
      const res = await fetch("/api/geo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier: geoTier, location: geoLocation }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setGeoLocation("");
      toast("Location added", "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function delGeo(id: number) {
    await fetch(`/api/geo/${id}`, { method: "DELETE" });
    load();
  }

  async function addSeed(e: React.FormEvent) {
    e.preventDefault();
    if (!seedTerm.trim() && !seedUrl.trim()) return;
    try {
      const res = await fetch("/api/seeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seed_term: seedTerm,
          seed_url: seedUrl,
          source_site: seedSite,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSeedTerm("");
      setSeedUrl("");
      setSeedSite("");
      toast("Seed added", "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function delSeed(id: number) {
    await fetch(`/api/seeds/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div>
      <header className="mb-5">
        <h1 className="text-2xl font-bold text-slate-900">Geo &amp; Seeds</h1>
        <p className="text-sm text-slate-500">
          Geographic targeting tiers and seed terms / URLs used for keyword research.
        </p>
      </header>

      {/* Geo tiers */}
      <section className="mb-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-800">
          Geographic Tiers
        </h2>
        <form onSubmit={addGeo} className="card mb-4 flex flex-wrap items-end gap-3 p-3">
          <div>
            <label className="label">Tier</label>
            <select
              className="input min-w-[240px]"
              value={geoTier}
              onChange={(e) => setGeoTier(e.target.value as GeoTier)}
            >
              {GEO_TIERS.map((t) => (
                <option key={t} value={t}>
                  {GEO_TIER_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1">
            <label className="label">Location</label>
            <input
              className="input"
              placeholder="e.g. Toronto, Mississauga…"
              value={geoLocation}
              onChange={(e) => setGeoLocation(e.target.value)}
            />
          </div>
          <button className="btn-primary">Add</button>
        </form>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {GEO_TIERS.map((tier) => (
            <div key={tier} className="card p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">
                {GEO_TIER_LABELS[tier]}
              </h3>
              <ul className="space-y-1">
                {geo.filter((g) => g.tier === tier).length === 0 && (
                  <li className="text-xs text-slate-400">No locations</li>
                )}
                {geo
                  .filter((g) => g.tier === tier)
                  .map((g) => (
                    <li
                      key={g.id}
                      className="group flex items-center justify-between rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <span>{g.location}</span>
                      <button
                        className="text-xs text-slate-300 hover:text-rose-600 group-hover:text-slate-400"
                        onClick={() => delGeo(g.id)}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Seeds */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-800">
          Seed Terms &amp; URLs
        </h2>
        <form onSubmit={addSeed} className="card mb-4 flex flex-wrap items-end gap-3 p-3">
          <div className="flex-1">
            <label className="label">Seed term</label>
            <input
              className="input"
              value={seedTerm}
              onChange={(e) => setSeedTerm(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <label className="label">Seed URL</label>
            <input
              className="input"
              value={seedUrl}
              onChange={(e) => setSeedUrl(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <label className="label">Source / competitor site</label>
            <input
              className="input"
              placeholder="medallionfence.com"
              value={seedSite}
              onChange={(e) => setSeedSite(e.target.value)}
            />
          </div>
          <button className="btn-primary">Add</button>
        </form>

        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Seed term</th>
                <th className="px-4 py-3">Seed URL</th>
                <th className="px-4 py-3">Source site(s)</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : seeds.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                    No seeds yet.
                  </td>
                </tr>
              ) : (
                seeds.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 text-slate-700">{s.seed_term}</td>
                    <td className="px-4 py-3 text-brand-600">
                      {s.seed_url && (
                        <a href={s.seed_url} target="_blank" rel="noreferrer" className="hover:underline">
                          {s.seed_url}
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{s.source_site}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="btn-ghost px-2 py-1 text-xs text-rose-600"
                        onClick={() => delSeed(s.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
