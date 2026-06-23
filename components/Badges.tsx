import { ROLE_LABELS, STATUS_LABELS } from "@/lib/constants";
import type { Role, Status } from "@/lib/constants";

export function RoleBadge({ role }: { role: Role | "" }) {
  if (role === "agency")
    return (
      <span className="chip bg-violet-100 text-violet-700">
        <span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> Agency
      </span>
    );
  if (role === "client")
    return (
      <span className="chip bg-emerald-100 text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Client
      </span>
    );
  return <span className="chip bg-slate-100 text-slate-500">System</span>;
}

const STATUS_STYLES: Record<Status, string> = {
  active: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-700",
  hold: "bg-sky-100 text-sky-700",
  removed: "bg-rose-100 text-rose-700",
};

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`chip ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

export function roleLabel(role: Role | "") {
  return role ? ROLE_LABELS[role as Role] : "System";
}
