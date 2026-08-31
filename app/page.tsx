import { DashboardClient } from "@/components/dashboard-client";
import { getSnapshot } from "@/lib/snapshot";

export const dynamic = "force-dynamic";

export default async function Page() {
  const snapshot = await getSnapshot();
  return <DashboardClient initial={snapshot} />;
}
