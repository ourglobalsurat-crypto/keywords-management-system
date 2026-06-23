import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Sidebar from "@/components/Sidebar";
import { Toaster } from "@/components/Toast";
import { MadeByGlobalSurat } from "@/components/logos";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getSession();
  if (!user) redirect("/login");

  return (
    <div className="lg:flex">
      <Sidebar user={user} />
      <main className="min-h-screen flex-1 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </div>
        <footer className="border-t border-slate-200 py-5">
          <MadeByGlobalSurat />
        </footer>
      </main>
      <Toaster />
    </div>
  );
}
