import { getSession } from "@/lib/auth";
import DashboardClient from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getSession();
  return <DashboardClient name={user?.name ?? ""} />;
}
