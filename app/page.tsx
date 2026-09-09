import { DashboardClient } from "@/components/dashboard-client";
import { getSnapshot } from "@/lib/snapshot";

// Rendered once per build (static export); the client picks the release from
// the URL on mount and refreshes from public/data/*.json.
export default async function Page() {
  const snapshot = await getSnapshot();
  return <DashboardClient initial={snapshot} />;
}
