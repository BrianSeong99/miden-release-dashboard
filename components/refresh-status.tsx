"use client";

import { useHydratedClock } from "@/lib/use-hydrated-clock";

const STALE_AFTER_MS = 30 * 60 * 1000;

/** Compact freshness status beside the timestamp; ages safely after hydration. */
export function RefreshStatus({ generatedAt }: { generatedAt: string }) {
  const now = useHydratedClock(generatedAt);
  const age = now - new Date(generatedAt).getTime();
  if (!Number.isFinite(age)) return null;
  const stale = age > STALE_AFTER_MS;
  const minutes = Math.round(age / 60_000);
  return (
    <div role="status">
      {stale ? (
        <span
          className="inline-flex items-center gap-1.5 text-tone-amber"
          title="Latest published data is more than 30 minutes old. Updates are scheduled every 15 minutes."
        >
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
          Refresh delayed · <span aria-hidden>{minutes}m old</span>
          <span className="sr-only">{minutes} minutes old</span>
        </span>
      ) : "Scheduled every 15 minutes"}
    </div>
  );
}
