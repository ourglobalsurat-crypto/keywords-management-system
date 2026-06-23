import { getSession } from "@/lib/auth";
import SuggestionsClient from "@/components/SuggestionsClient";

export const dynamic = "force-dynamic";

export default async function SuggestionsPage() {
  const user = await getSession();
  return <SuggestionsClient role={user?.role ?? "client"} />;
}
