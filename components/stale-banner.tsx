"use client";

import { TriangleAlert } from "lucide-react";
import { useHydratedClock } from "@/lib/use-hydrated-clock";

const STALE_AFTER_MS = 30 * 60 * 1000;

/** Global stale-data warning when the snapshot is older than 30 minutes
 * (PRD section 12). Client-side so a wedged server cache is also caught. */
export function StaleBanner({ generatedAt }: { generatedAt: string }) {
  const now = useHydratedClock(generatedAt);
  const age = now - new Date(generatedAt).getTime();
  if (!Number.isFinite(age) || age <= STALE_AFTER_MS) return null;
  const minutes = Math.round(age / 60_000);
  return (
    <div
      role="alert"
      className="flex items-center gap-2 rounded-lg border border-tone-amber/40 bg-tone-amber-bg px-4 py-2.5 text-sm text-tone-amber"
    >
      <TriangleAlert aria-hidden className="size-4 shrink-0" />
      Data is stale — last successful refresh was {minutes} minutes ago.
    </div>
  );
}
