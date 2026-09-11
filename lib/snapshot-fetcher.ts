import type { DashboardSnapshot } from "./types";

export const SNAPSHOT_REFRESH_INTERVAL = 60_000;

export async function fetchSnapshot(url: string): Promise<DashboardSnapshot> {
  // Pages caches static URLs for ten minutes. A new URL also bypasses an old
  // CDN entry after deployment; no-store keeps the browser from reusing it.
  const response = await fetch(`${url}?refresh=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Snapshot request failed (${response.status})`);
  return response.json();
}
