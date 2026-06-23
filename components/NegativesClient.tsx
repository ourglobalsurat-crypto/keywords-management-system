"use client";

import { useCallback, useEffect, useState } from "react";
import { MATCH_TYPES } from "@/lib/constants";
import type { MatchType, Role } from "@/lib/constants";
import type { NegativeKeyword } from "@/lib/types";
import { RoleBadge } from "./Badges";
import { Modal } from "./Modal";
import { toast } from "./Toast";

const EMPTY = {
  category: "",
  keyword: "",
  match_type: "phrase" as MatchType,
  notes: "",
};

export default function NegativesClient({ role }: { role: Role }) {
  const [rows, setRows] = useState<NegativeKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = search ? `?search=${encodeURIComponent(search)}` : "";
      const res = await fetch(`/api/negatives${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setRows(data.negatives);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to load", "error");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  async function remove(n: NegativeKeyword) {
    try {
      const res = await fetch(`/api/negatives/${n.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "removed" }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      toast("Negative keyword removed", "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function purge(n: NegativeKeyword) {
    if (!confirm(`Permanently delete "${n.keyword}"?`)) return;
    try {
      const res = await fetch(`/api/negatives/${n.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error);
      toast("Deleted", "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/negatives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast("Negative keyword added", "success");
      setAddOpen(false);
      setForm(EMPTY);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setSaving(false);
    }
  }

  const set = (k: keyof typeof EMPTY, v: string) => setForm({ ...form, [k]: v });

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Negative Keywords</h1>
          <p className="text-sm text-slate-500">
            Terms to exclude so your ads don’t show for irrelevant searches.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setAddOpen(true)}>
          + Add negative
        </button>
      </header>

      <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
        <input
          className="input max-w-xs"
          placeholder="Search negative or category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="ml-auto text-sm text-slate-500">
          {rows.length} negative{rows.length === 1 ? "" : "s"}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Negative keyword</th>
                <th className="px-4 py-3">Match</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Notes / Rationale</th>
                <th className="px-4 py-3">Added by</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                    No negative keywords yet.
                  </td>
                </tr>
              ) : (
                rows.map((n) => (
                  <tr key={n.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-800">{n.keyword}</td>
                    <td className="px-4 py-3 capitalize text-slate-600">{n.match_type}</td>
                    <td className="px-4 py-3 text-slate-600">{n.category}</td>
                    <td className="px-4 py-3 text-slate-500">{n.notes}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <RoleBadge role={n.created_role} />
                        <span className="text-xs text-slate-400">{n.created_by}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <button
                          className="btn-ghost px-2 py-1 text-xs text-rose-600"
                          onClick={() => remove(n)}
                        >
                          Remove
                        </button>
                        {role === "agency" && (
                          <button
                            className="btn-ghost px-2 py-1 text-xs text-rose-700"
                            onClick={() => purge(n)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add negative keyword"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" form="add-neg" disabled={saving}>
              {saving ? "Saving…" : "Add"}
            </button>
          </>
        }
      >
        <form id="add-neg" onSubmit={submitAdd} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Negative keyword *</label>
            <input
              className="input"
              value={form.keyword}
              onChange={(e) => set("keyword", e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="label">Match type</label>
            <select
              className="input"
              value={form.match_type}
              onChange={(e) => set("match_type", e.target.value)}
            >
              {MATCH_TYPES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Category</label>
            <input
              className="input"
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notes / Rationale</label>
            <textarea
              className="input min-h-[72px]"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
