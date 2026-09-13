import type { BlockerView } from "./types";

/** Calendar durations only, with unknown for missing or contradictory dates. */
export function eventGap(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null;
  const a = Date.parse(start), b = Date.parse(end);
  return Number.isFinite(a) && Number.isFinite(b) && b >= a ? b - a : null;
}

export function workTiming(item: BlockerView, asOf: string) {
  const w = item.workflow;
  const open = item.live.state === "open";
  return {
    preparationMs: eventGap(w?.openedAt, w?.readyAt),
    reviewMs: eventGap(w?.readyAt, w?.mergedAt),
    openWaitMs: open ? eventGap(w?.readyAt ?? w?.openedAt, asOf) : null,
    totalToMergeMs: eventGap(w?.openedAt, w?.mergedAt),
  };
}
