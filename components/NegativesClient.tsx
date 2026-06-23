"use client";

import { useCallback, useEffect, useState } from "react";
import { MATCH_TYPES } from "@/lib/constants";
import type { MatchType, Role } from "@/lib/constants";
import type { NegativeKeyword } from "@/lib/types";
import { RoleBadge } from "./Badges";
import { Modal } from "./Modal";
import { toast } from "./Toast";
import { IconPlus, IconLayers, IconPencil, IconTrash, IconX } from "./icons";

const EMPTY = {
  category: "",
  keyword: "",
  match_type: "phrase" as MatchType,
  notes: "",
};

const EMPTY_BULK_ADD = {
  keywords: "",
  category: "",
  match_type: "phrase" as MatchType,
  notes: "",
};

const EMPTY_BULK_EDIT = {
  category: "",
  match_type: "", // "" = unchanged
  notes: "",
};

export default function NegativesClient({ role }: { role: Role }) {
  const [rows, setRows] = useState<NegativeKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [addOpen, setAddOpen] = useState(false);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [bulkAdd, setBulkAdd] = useState(EMPTY_BULK_ADD);
  const [bulkEdit, setBulkEdit] = useState(EMPTY_BULK_EDIT);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
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

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }
  function toggleOne(id: number) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  const clearSelection = () => setSelected(new Set());

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

  // ── bulk ──
  async function bulkRemove() {
    const ids = [...selected];
    if (!confirm(`Remove ${ids.length} selected negative${ids.length === 1 ? "" : "s"}?`)) return;
    try {
      const res = await fetch("/api/negatives/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, action: "status", status: "removed" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`${data.updated} removed`, "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function bulkPurge() {
    const ids = [...selected];
    if (!confirm(`Permanently delete ${ids.length} negative${ids.length === 1 ? "" : "s"}?`)) return;
    try {
      const res = await fetch("/api/negatives/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(`${data.deleted} permanently deleted`, "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function submitBulkAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/negatives/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bulkAdd),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(
        `${data.inserted} added${data.duplicates ? `, ${data.duplicates} duplicate${data.duplicates === 1 ? "" : "s"} skipped` : ""}`,
        "success"
      );
      setBulkAddOpen(false);
      setBulkAdd(EMPTY_BULK_ADD);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setSaving(false);
    }
  }

  async function submitBulkEdit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/negatives/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selected], action: "edit", fields: bulkEdit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast(
        `${data.changed} updated${data.conflicts ? `, ${data.conflicts} skipped (would duplicate)` : ""}`,
        "success"
      );
      setBulkEditOpen(false);
      setBulkEdit(EMPTY_BULK_EDIT);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    } finally {
      setSaving(false);
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
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => setBulkAddOpen(true)}>
            <IconLayers className="h-4 w-4" />
            Bulk add
          </button>
          <button className="btn-primary" onClick={() => setAddOpen(true)}>
            <IconPlus className="h-4 w-4" />
            Add negative
          </button>
        </div>
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

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="card mb-4 flex flex-wrap items-center gap-2 border-brand-200 bg-brand-50 p-3">
          <span className="text-sm font-semibold text-brand-800">{selected.size} selected</span>
          <span className="mx-1 h-5 w-px bg-brand-200" />
          <button
            className="btn-secondary px-3 py-1.5 text-xs"
            onClick={() => {
              setBulkEdit(EMPTY_BULK_EDIT);
              setBulkEditOpen(true);
            }}
          >
            <IconPencil className="h-3.5 w-3.5" />
            Edit fields
          </button>
          <button className="btn-secondary px-3 py-1.5 text-xs text-rose-600" onClick={bulkRemove}>
            Remove
          </button>
          {role === "agency" && (
            <button className="btn-secondary px-3 py-1.5 text-xs text-rose-700" onClick={bulkPurge}>
              <IconTrash className="h-3.5 w-3.5" />
              Delete
            </button>
          )}
          <button className="btn-ghost ml-auto px-3 py-1.5 text-xs" onClick={clearSelection}>
            <IconX className="h-3.5 w-3.5" />
            Clear
          </button>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Select all"
                  />
                </th>
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
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                    No negative keywords yet.
                  </td>
                </tr>
              ) : (
                rows.map((n) => {
                  const checked = selected.has(n.id);
                  return (
                    <tr key={n.id} className={checked ? "bg-brand-50/50" : "hover:bg-slate-50/60"}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                          checked={checked}
                          onChange={() => toggleOne(n.id)}
                          aria-label={`Select ${n.keyword}`}
                        />
                      </td>
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add modal */}
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

      {/* Bulk add modal */}
      <Modal
        open={bulkAddOpen}
        onClose={() => setBulkAddOpen(false)}
        wide
        title="Bulk add negative keywords"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setBulkAddOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" form="bulk-add-neg" disabled={saving}>
              {saving ? "Adding…" : "Add all"}
            </button>
          </>
        }
      >
        <form id="bulk-add-neg" onSubmit={submitBulkAdd} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Negative keywords — one per line *</label>
            <textarea
              className="input min-h-[160px] font-mono text-xs"
              placeholder={"free\ncareers\ndiy\ncheap"}
              value={bulkAdd.keywords}
              onChange={(e) => setBulkAdd({ ...bulkAdd, keywords: e.target.value })}
              required
              autoFocus
            />
            <p className="mt-1 text-xs text-slate-400">
              The category and match type below apply to every term. Duplicates are skipped automatically.
            </p>
          </div>
          <div>
            <label className="label">Match type</label>
            <select
              className="input"
              value={bulkAdd.match_type}
              onChange={(e) => setBulkAdd({ ...bulkAdd, match_type: e.target.value as MatchType })}
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
              value={bulkAdd.category}
              onChange={(e) => setBulkAdd({ ...bulkAdd, category: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notes / Rationale</label>
            <textarea
              className="input min-h-[60px]"
              value={bulkAdd.notes}
              onChange={(e) => setBulkAdd({ ...bulkAdd, notes: e.target.value })}
            />
          </div>
        </form>
      </Modal>

      {/* Bulk edit modal */}
      <Modal
        open={bulkEditOpen}
        onClose={() => setBulkEditOpen(false)}
        title={`Edit ${selected.size} selected negative${selected.size === 1 ? "" : "s"}`}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setBulkEditOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" form="bulk-edit-neg" disabled={saving}>
              {saving ? "Applying…" : "Apply to selected"}
            </button>
          </>
        }
      >
        <p className="mb-4 text-sm text-slate-500">
          Only the fields you fill in will be changed. Leave a field blank to keep existing values.
        </p>
        <form id="bulk-edit-neg" onSubmit={submitBulkEdit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Match type</label>
            <select
              className="input"
              value={bulkEdit.match_type}
              onChange={(e) => setBulkEdit({ ...bulkEdit, match_type: e.target.value })}
            >
              <option value="">(leave unchanged)</option>
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
              value={bulkEdit.category}
              onChange={(e) => setBulkEdit({ ...bulkEdit, category: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notes / Rationale</label>
            <textarea
              className="input min-h-[60px]"
              value={bulkEdit.notes}
              onChange={(e) => setBulkEdit({ ...bulkEdit, notes: e.target.value })}
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
