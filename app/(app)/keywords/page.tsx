import { getSession } from "@/lib/auth";
import KeywordsClient from "@/components/KeywordsClient";

export const dynamic = "force-dynamic";

export default async function KeywordsPage() {
  const user = await getSession();
  return <KeywordsClient role={user?.role ?? "client"} />;
}
