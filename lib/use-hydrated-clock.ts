"use client";

import { useSyncExternalStore } from "react";

const CLOCK_INTERVAL_MS = 30_000;

function subscribe(onChange: () => void) {
  const timer = setInterval(onChange, CLOCK_INTERVAL_MS);
  return () => clearInterval(timer);
}

function getBrowserTime() {
  // A stable snapshot between clock ticks avoids changing React's external
  // store value on every read. Thirty-second precision matches the refresh UI.
  return Math.floor(Date.now() / CLOCK_INTERVAL_MS) * CLOCK_INTERVAL_MS;
}

/** Match static HTML during hydration, then use the browser's ticking clock. */
export function useHydratedClock(generatedAt: string) {
  return useSyncExternalStore(subscribe, getBrowserTime, () => Date.parse(generatedAt));
}
