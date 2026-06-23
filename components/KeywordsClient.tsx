"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LIST_TYPE_LABELS,
  MATCH_TYPES,
  STATUS_LABELS,
} from "@/lib/constants";
import type { ListType, MatchType, Role, Status } from "@/lib/constants";
import type { Keyword } from "@/lib/types";
import { StatusBadge, RoleBadge } from "./Badges";
import { Modal } from "./Modal";
import { toast } from "./Toast";

const EMPTY_FORM = {
  campaign: "",
  ad_group: "",
  keyword: "",
  match_type: "phrase" as MatchType,
  intent_cluster: "",
  priority: "",
  notes: "",
};

export default function KeywordsClient({ role }: { role: Role }) {
  const [listType, setListType] = useState<ListType>("b2b");
  const [rows, setRows] = useState<Keyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Keyword | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({ list_type: listType, include_removed: "1" });
    if (search) qs.set("search", search);
    if (statusFilter !== "all") qs.set("status", statusFilter);
    try {
      const res = await fetch(`/api/keywords?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setRows(data.keywords);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to load", "error");
    } finally {
      setLoading(false);
    }
  }, [listType, search, statusFilter]);

  useEffect(() => {
    const t = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
    return c;
  }, [rows]);

  async function changeStatus(kw: Keyword, status: Status) {
    try {
      const res = await fetch(`/api/keywords/${kw.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      toast(`"${kw.keyword}" → ${STATUS_LABELS[status]}`, "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Update failed", "error");
    }
  }

  async function purge(kw: Keyword) {
    if (!confirm(`Permanently delete "${kw.keyword}"? This cannot be undone.`))
      return;
    try {
      const res = await fetch(`/api/keywords/${kw.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Delete failed");
      toast("Keyword permanently deleted", "success");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Delete failed", "error");
    }
  }

  function openAdd() {
    setForm(EMPTY_FORM);
    setAddOpen(true);
  }
  function openEdit(kw: Keyword) {
    setForm({
      campaign: kw.campaign,
      ad_group: kw.ad_group,
      keyword: kw.keyword,
      match_type: kw.match_type,
      intent_cluster: kw.intent_cluster,
      priority: kw.priority,
      notes: kw.notes,
    });
    setEditing(kw);
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/keywords", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, list_type: listType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add keyword");
      toast("Keyword added", "success");
      setAddOpen(false);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not add keyword", "error");
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/keywords/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, edit: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save changes");
      toast("Keyword updated", "success");
      setEditing(null);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save changes", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Keywords</h1>
          <p className="text-sm text-slate-500">
            Manage, pause, hold and organise your Google Ads keywords.
          </p>
        </div>
        <button className="btn-primary" onClick={openAdd}>
          + Add keyword
        </button>
      </header>

      {/* Tabs */}
      <div className="mb-4 flex gap-2">
        {(Object.keys(LIST_TYPE_LABELS) as ListType[]).map((lt) => (
          <button
            key={lt}
            onClick={() => setListType(lt)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              listType === lt
                ? "bg-brand-600 text-white shadow-sm"
                : "border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {LIST_TYPE_LABELS[lt]}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
        <input
          className="input max-w-xs"
          placeholder="Search keyword, campaign, ad group…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input max-w-[180px]"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as Status | "all")}
        >
          <option value="all">All statuses ({counts.all || 0})</option>
          {(Object.keys(STATUS_LABELS) as Status[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]} ({counts[s] || 0})
            </option>
          ))}
        </select>
        <div className="ml-auto text-sm text-slate-500">
          {rows.length} keyword{rows.length === 1 ? "" : "s"}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Keyword</th>
                <th className="px-4 py-3">Match</th>
                <th className="px-4 py-3">Campaign / Ad Group</th>
                <th className="px-4 py-3">Intent</th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last update</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                    No keywords yet. Click “Add keyword” or import your Excel file.
                  </td>
                </tr>
              ) : (
                rows.map((kw) => (
                  <tr key={kw.id} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {kw.keyword}
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-600">
                      {kw.match_type}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{kw.campaign || <span className="text-slate-300">—</span>}</div>
                      <div className="text-xs text-slate-400">{kw.ad_group}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{kw.intent_cluster}</td>
                    <td className="px-4 py-3 text-slate-600">{kw.priority}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={kw.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <RoleBadge role={kw.updated_role} />
                        <span className="text-xs text-slate-400">
                          {kw.updated_by}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1 whitespace-nowrap">
                        {kw.status !== "active" && (
                          <button
                            className="btn-ghost px-2 py-1 text-xs"
                            onClick={() => changeStatus(kw, "active")}
                          >
                            {kw.status === "removed" ? "Restore" : "Activate"}
                          </button>
                        )}
                        {kw.status === "active" && (
                          <button
                            className="btn-ghost px-2 py-1 text-xs"
                            onClick={() => changeStatus(kw, "paused")}
                          >
                            Pause
                          </button>
                        )}
                        {kw.status !== "hold" && kw.status !== "removed" && (
                          <button
                            className="btn-ghost px-2 py-1 text-xs"
                            onClick={() => changeStatus(kw, "hold")}
                          >
                            Hold
                          </button>
                        )}
                        <button
                          className="btn-ghost px-2 py-1 text-xs"
                          onClick={() => openEdit(kw)}
                        >
                          Edit
                        </button>
                        {kw.status !== "removed" ? (
                          <button
                            className="btn-ghost px-2 py-1 text-xs text-rose-600"
                            onClick={() => changeStatus(kw, "removed")}
                          >
                            Remove
                          </button>
                        ) : (
                          role === "agency" && (
                            <button
                              className="btn-ghost px-2 py-1 text-xs text-rose-700"
                              onClick={() => purge(kw)}
                            >
                              Delete
                            </button>
                          )
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

      {/* Add modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={`Add keyword — ${LIST_TYPE_LABELS[listType]}`}
        footer={
          <>
            <button className="btn-secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" form="add-form" disabled={saving}>
              {saving ? "Saving…" : "Add keyword"}
            </button>
          </>
        }
      >
        <KeywordForm id="add-form" form={form} setForm={setForm} onSubmit={submitAdd} />
      </Modal>

      {/* Edit modal */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title="Edit keyword"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button className="btn-primary" form="edit-form" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </>
        }
      >
        <KeywordForm id="edit-form" form={form} setForm={setForm} onSubmit={submitEdit} />
      </Modal>
    </div>
  );
}

function KeywordForm({
  id,
  form,
  setForm,
  onSubmit,
}: {
  id: string;
  form: typeof EMPTY_FORM;
  setForm: (f: typeof EMPTY_FORM) => void;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const set = (k: keyof typeof EMPTY_FORM, v: string) =>
    setForm({ ...form, [k]: v });
  return (
    <form id={id} onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="label">Keyword *</label>
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
            <option key={m} value={m} className="capitalize">
              {m}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">Priority</label>
        <input
          className="input"
          value={form.priority}
          onChange={(e) => set("priority", e.target.value)}
          placeholder="e.g. High / 1"
        />
      </div>
      <div>
        <label className="label">Campaign</label>
        <input
          className="input"
          value={form.campaign}
          onChange={(e) => set("campaign", e.target.value)}
        />
      </div>
      <div>
        <label className="label">Ad Group</label>
        <input
          className="input"
          value={form.ad_group}
          onChange={(e) => set("ad_group", e.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Intent cluster</label>
        <input
          className="input"
          value={form.intent_cluster}
          onChange={(e) => set("intent_cluster", e.target.value)}
        />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Notes</label>
        <textarea
          className="input min-h-[72px]"
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </div>
    </form>
  );
}
