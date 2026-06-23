"use client";

import { useCallback, useEffect, useState } from "react";
import { GEO_TIERS, GEO_TIER_LABELS } from "@/lib/constants";
import type { GeoTier } from "@/lib/constants";
import type { GeoLocation, Seed } from "@/lib/types";
import { Modal } from "./Modal";
import { toast } from "./Toast";
import { IconLayers, IconPencil, IconTrash, IconX } from "./icons";

export default function GeoSeedsClient() {
  const [geo, setGeo] = useState<GeoLocation[]>([]);
  const [seeds, setSeeds] = useState<Seed[]>([]);
  const [loading, setLoading] = useState(true);

  // single add forms
  const [geoTier, setGeoTier] = useState<GeoTier>("tier1_gta");
  const [geoLocation, setGeoLocation] = useState("");
  const [seedTerm, setSeedTerm] = useState("");
  const [seedUrl, setSeedUrl] = useState("");
  const [seedSite, setSeedSite] = useState("");

  // selections
  const [geoSel, setGeoSel] = useState<Set<number>>(new Set());
  const [seedSel, setSeedSel] = useState<Set<number>>(new Set());

  // bulk modals
  const [geoBulkOpen, setGeoBulkOpen] = useState(false);
  const [geoBulk, setGeoBulk] = useState({ tier: "tier1_gta" as GeoTier, locations: "" });
  const [seedBulkOpen, setSeedBulkOpen] = useState(false);
  const [seedBulk, setSeedBulk] = useState({ seed_terms: "", source_site: "" });
  const [seedEditOpen, setSeedEditOpen] = useState(false);
  const [seedEditSite, setSeedEditSite] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setGeoSel(new Set());
    setSeedSel(new Set());
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

  function toggle(set: Set<number>, setter: (s: Set<number>) => void, id: number) {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setter(n);
  }

  // ── geo single ──
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

  // ── geo bulk ──
  async function submitGeoBulk(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/geo/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geoBulk),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(
        `${data.inserted} added${data.duplicates ? `, ${data.duplicates} duplicate${data.duplicates === 1 ? "" : "s"} skipped` : ""}`,
        "success"
      );
      setGeoBulkOpen(false);
      setGeoBulk({ tier: "tier1_gta", locations: "" });
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setSaving(false);
    }
  }
  async function moveGeo(tier: GeoTier) {
    const ids = [...geoSel];
    try {
      const res = await fetch("/api/geo/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, tier }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(
        `${data.changed} moved to ${GEO_TIER_LABELS[tier]}${data.conflicts ? `, ${data.conflicts} skipped` : ""}`,
        "success"
      );
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
  }
  async function geoBulkDelete() {
    const ids = [...geoSel];
    if (!confirm(`Delete ${ids.length} selected location${ids.length === 1 ? "" : "s"}?`)) return;
    try {
      const res = await fetch("/api/geo/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`${data.deleted} deleted`, "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  // ── seeds single ──
  async function addSeed(e: React.FormEvent) {
    e.preventDefault();
    if (!seedTerm.trim() && !seedUrl.trim()) return;
    try {
      const res = await fetch("/api/seeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed_term: seedTerm, seed_url: seedUrl, source_site: seedSite }),
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

  // ── seeds bulk ──
  async function submitSeedBulk(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/seeds/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(seedBulk),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(
        `${data.inserted} added${data.duplicates ? `, ${data.duplicates} duplicate${data.duplicates === 1 ? "" : "s"} skipped` : ""}`,
        "success"
      );
      setSeedBulkOpen(false);
      setSeedBulk({ seed_terms: "", source_site: "" });
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setSaving(false);
    }
  }
  async function submitSeedEdit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/seeds/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...seedSel], source_site: seedEditSite }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`${data.changed} updated`, "success");
      setSeedEditOpen(false);
      setSeedEditSite("");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setSaving(false);
    }
  }
  async function seedBulkDelete() {
    const ids = [...seedSel];
    if (!confirm(`Delete ${ids.length} selected seed${ids.length === 1 ? "" : "s"}?`)) return;
    try {
      const res = await fetch("/api/seeds/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`${data.deleted} deleted`, "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  const allSeedsSelected = seeds.length > 0 && seeds.every((s) => seedSel.has(s.id));

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
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Geographic Tiers</h2>
          <button className="btn-secondary" onClick={() => setGeoBulkOpen(true)}>
            <IconLayers className="h-4 w-4" />
            Bulk add
          </button>
        </div>

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

        {/* Geo bulk action bar */}
        {geoSel.size > 0 && (
          <div className="card mb-4 flex flex-wrap items-center gap-2 border-brand-200 bg-brand-50 p-3">
            <span className="text-sm font-semibold text-brand-800">{geoSel.size} selected</span>
            <span className="mx-1 h-5 w-px bg-brand-200" />
            <select
              className="input max-w-[230px] py-1.5 text-xs"
              value=""
              onChange={(e) => {
                if (e.target.value) moveGeo(e.target.value as GeoTier);
              }}
            >
              <option value="">Move to tier…</option>
              {GEO_TIERS.map((t) => (
                <option key={t} value={t}>
                  {GEO_TIER_LABELS[t]}
                </option>
              ))}
            </select>
            <button className="btn-secondary px-3 py-1.5 text-xs text-rose-700" onClick={geoBulkDelete}>
              <IconTrash className="h-3.5 w-3.5" />
              Delete
            </button>
            <button
              className="btn-ghost ml-auto px-3 py-1.5 text-xs"
              onClick={() => setGeoSel(new Set())}
            >
              <IconX className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {GEO_TIERS.map((tier) => {
            const items = geo.filter((g) => g.tier === tier);
            return (
              <div key={tier} className="card p-4">
                <h3 className="mb-2 text-sm font-semibold text-slate-700">
                  {GEO_TIER_LABELS[tier]}
                </h3>
                <ul className="space-y-1">
                  {loading ? (
                    <li className="text-xs text-slate-400">Loading…</li>
                  ) : items.length === 0 ? (
                    <li className="text-xs text-slate-400">No locations</li>
                  ) : (
                    items.map((g) => (
                      <li
                        key={g.id}
                        className="group flex items-center gap-2 rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 cursor-pointer rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          checked={geoSel.has(g.id)}
                          onChange={() => toggle(geoSel, setGeoSel, g.id)}
                        />
                        <span className="flex-1">{g.location}</span>
                        <button
                          className="text-xs text-slate-300 hover:text-rose-600 group-hover:text-slate-400"
                          onClick={() => delGeo(g.id)}
                          aria-label="Delete location"
                        >
                          ✕
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* Seeds */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Seed Terms &amp; URLs</h2>
          <button className="btn-secondary" onClick={() => setSeedBulkOpen(true)}>
            <IconLayers className="h-4 w-4" />
            Bulk add
          </button>
        </div>

        <form onSubmit={addSeed} className="card mb-4 flex flex-wrap items-end gap-3 p-3">
          <div className="flex-1">
            <label className="label">Seed term</label>
            <input className="input" value={seedTerm} onChange={(e) => setSeedTerm(e.target.value)} />
          </div>
          <div className="flex-1">
            <label className="label">Seed URL</label>
            <input className="input" value={seedUrl} onChange={(e) => setSeedUrl(e.target.value)} />
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

        {/* Seeds bulk action bar */}
        {seedSel.size > 0 && (
          <div className="card mb-4 flex flex-wrap items-center gap-2 border-brand-200 bg-brand-50 p-3">
            <span className="text-sm font-semibold text-brand-800">{seedSel.size} selected</span>
            <span className="mx-1 h-5 w-px bg-brand-200" />
            <button
              className="btn-secondary px-3 py-1.5 text-xs"
              onClick={() => {
                setSeedEditSite("");
                setSeedEditOpen(true);
              }}
            >
              <IconPencil className="h-3.5 w-3.5" />
              Set source site
            </button>
            <button className="btn-secondary px-3 py-1.5 text-xs text-rose-700" onClick={seedBulkDelete}>
              <IconTrash className="h-3.5 w-3.5" />
              Delete
            </button>
            <button
              className="btn-ghost ml-auto px-3 py-1.5 text-xs"
              onClick={() => setSeedSel(new Set())}
            >
              <IconX className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        )}

        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    checked={allSeedsSelected}
                    onChange={() =>
                      setSeedSel(allSeedsSelected ? new Set() : new Set(seeds.map((s) => s.id)))
                    }
                    aria-label="Select all seeds"
                  />
                </th>
                <th className="px-4 py-3">Seed term</th>
                <th className="px-4 py-3">Seed URL</th>
                <th className="px-4 py-3">Source site(s)</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : seeds.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    No seeds yet.
                  </td>
                </tr>
              ) : (
                seeds.map((s) => {
                  const checked = seedSel.has(s.id);
                  return (
                    <tr key={s.id} className={checked ? "bg-brand-50/50" : "hover:bg-slate-50/60"}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          checked={checked}
                          onChange={() => toggle(seedSel, setSeedSel, s.id)}
                        />
                      </td>
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Geo bulk add modal */}
      <Modal
        open={geoBulkOpen}
        onClose={() => setGeoBulkOpen(false)}
        title="Bulk add locations"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setGeoBulkOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" form="geo-bulk" disabled={saving}>
              {saving ? "Adding…" : "Add all"}
            </button>
          </>
        }
      >
        <form id="geo-bulk" onSubmit={submitGeoBulk} className="space-y-4">
          <div>
            <label className="label">Tier</label>
            <select
              className="input"
              value={geoBulk.tier}
              onChange={(e) => setGeoBulk({ ...geoBulk, tier: e.target.value as GeoTier })}
            >
              {GEO_TIERS.map((t) => (
                <option key={t} value={t}>
                  {GEO_TIER_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Locations — one per line *</label>
            <textarea
              className="input min-h-[160px] font-mono text-xs"
              placeholder={"Toronto\nMississauga\nBrampton\nVaughan"}
              value={geoBulk.locations}
              onChange={(e) => setGeoBulk({ ...geoBulk, locations: e.target.value })}
              required
              autoFocus
            />
          </div>
        </form>
      </Modal>

      {/* Seeds bulk add modal */}
      <Modal
        open={seedBulkOpen}
        onClose={() => setSeedBulkOpen(false)}
        title="Bulk add seed terms"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setSeedBulkOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" form="seed-bulk" disabled={saving}>
              {saving ? "Adding…" : "Add all"}
            </button>
          </>
        }
      >
        <form id="seed-bulk" onSubmit={submitSeedBulk} className="space-y-4">
          <div>
            <label className="label">Seed terms — one per line *</label>
            <textarea
              className="input min-h-[160px] font-mono text-xs"
              placeholder={"fence\nrailing\ngate\ndeck"}
              value={seedBulk.seed_terms}
              onChange={(e) => setSeedBulk({ ...seedBulk, seed_terms: e.target.value })}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="label">Source / competitor site (applies to all)</label>
            <input
              className="input"
              placeholder="medallionfence.com"
              value={seedBulk.source_site}
              onChange={(e) => setSeedBulk({ ...seedBulk, source_site: e.target.value })}
            />
          </div>
        </form>
      </Modal>

      {/* Seeds bulk edit (source site) modal */}
      <Modal
        open={seedEditOpen}
        onClose={() => setSeedEditOpen(false)}
        title={`Set source site for ${seedSel.size} seed${seedSel.size === 1 ? "" : "s"}`}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setSeedEditOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" form="seed-edit" disabled={saving}>
              {saving ? "Applying…" : "Apply"}
            </button>
          </>
        }
      >
        <form id="seed-edit" onSubmit={submitSeedEdit}>
          <label className="label">Source / competitor site</label>
          <input
            className="input"
            placeholder="medallionfence.com"
            value={seedEditSite}
            onChange={(e) => setSeedEditSite(e.target.value)}
            required
            autoFocus
          />
        </form>
      </Modal>
    </div>
  );
}
