"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { RoleBadge } from "./Badges";

const NAV = [
  { href: "/", label: "Dashboard", icon: "▦" },
  { href: "/keywords", label: "Keywords", icon: "🔑" },
  { href: "/negatives", label: "Negative Keywords", icon: "⛔" },
  { href: "/geo-seeds", label: "Geo & Seeds", icon: "📍" },
  { href: "/activity", label: "Activity Log", icon: "📜" },
  { href: "/import", label: "Import / Export", icon: "↕" },
];

export default function Sidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            KM
          </div>
          <span className="font-semibold">Keyword Manager</span>
        </div>
        <button className="btn-ghost" onClick={() => setOpen((o) => !o)}>
          ☰
        </button>
      </div>

      <aside
        className={`${
          open ? "block" : "hidden"
        } w-full border-b border-slate-200 bg-white lg:block lg:h-screen lg:w-64 lg:flex-shrink-0 lg:border-b-0 lg:border-r`}
      >
        <div className="flex h-full flex-col">
          <div className="hidden items-center gap-2 px-5 py-5 lg:flex">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              KM
            </div>
            <div>
              <div className="text-sm font-bold leading-tight text-slate-900">
                Keyword Manager
              </div>
              <div className="text-xs text-slate-400">Google Ads</div>
            </div>
          </div>

          <nav className="flex-1 space-y-1 px-3 py-2">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  isActive(item.href)
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span className="w-5 text-center">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="border-t border-slate-200 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-800">
                  {user.name}
                </div>
                <div className="mt-0.5">
                  <RoleBadge role={user.role} />
                </div>
              </div>
            </div>
            <button onClick={logout} className="btn-secondary w-full">
              Sign out
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
