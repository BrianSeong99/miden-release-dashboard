import { DashboardClient } from "@/components/dashboard-client";
import { getSnapshot } from "@/lib/snapshot";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ release?: string }>;
}) {
  const { release } = await searchParams;
  const snapshot = await getSnapshot(release);
  return <DashboardClient initial={snapshot} />;
}
