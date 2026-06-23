"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import type { SessionUser } from "@/lib/auth";
import { RoleBadge } from "./Badges";
import {
  IconDashboard,
  IconKey,
  IconBan,
  IconMapPin,
  IconActivity,
  IconImportExport,
  IconMenu,
  IconClose,
  IconLogout,
} from "./icons";

const NAV = [
  { href: "/", label: "Dashboard", Icon: IconDashboard },
  { href: "/keywords", label: "Keywords", Icon: IconKey },
  { href: "/negatives", label: "Negative Keywords", Icon: IconBan },
  { href: "/geo-seeds", label: "Geo & Seeds", Icon: IconMapPin },
  { href: "/activity", label: "Activity Log", Icon: IconActivity },
  { href: "/import", label: "Import / Export", Icon: IconImportExport },
];

function Logo({ small }: { small?: boolean }) {
  return (
    <span
      className={`flex items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm ${
        small ? "h-8 w-8" : "h-9 w-9"
      }`}
    >
      <IconKey className="h-5 w-5" />
    </span>
  );
}

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
        <div className="flex items-center gap-2.5">
          <Logo small />
          <span className="font-semibold text-slate-900">Keyword Manager</span>
        </div>
        <button
          className="btn-ghost px-2 py-2"
          onClick={() => setOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          {open ? <IconClose className="h-5 w-5" /> : <IconMenu className="h-5 w-5" />}
        </button>
      </div>

      <aside
        className={`${
          open ? "block" : "hidden"
        } w-full border-b border-slate-200 bg-white lg:sticky lg:top-0 lg:block lg:h-screen lg:w-64 lg:flex-shrink-0 lg:self-start lg:border-b-0 lg:border-r`}
      >
        <div className="flex h-full flex-col">
          <div className="hidden items-center gap-2.5 px-5 py-5 lg:flex">
            <Logo />
            <div>
              <div className="text-sm font-bold leading-tight text-slate-900">
                Keyword Manager
              </div>
              <div className="text-xs text-slate-400">Google Ads</div>
            </div>
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
            {NAV.map(({ href, label, Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    active
                      ? "bg-brand-50 text-brand-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}
                >
                  <Icon
                    className={`h-[18px] w-[18px] ${
                      active ? "text-brand-600" : "text-slate-400"
                    }`}
                  />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-slate-200 p-4">
            <div className="mb-3 flex items-center gap-3">
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                {user.name.charAt(0).toUpperCase()}
              </span>
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
              <IconLogout className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
