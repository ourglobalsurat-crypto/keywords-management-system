import { getSession } from "@/lib/auth";
import NegativesClient from "@/components/NegativesClient";

export const dynamic = "force-dynamic";

export default async function NegativesPage() {
  const user = await getSession();
  return <NegativesClient role={user?.role ?? "client"} />;
}
