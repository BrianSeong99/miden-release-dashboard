import type { Result } from "./types";

export function ok<T>(value: T): Result<T> {
  return { ok: true, value, checkedAt: new Date().toISOString() };
}

export function err<T>(error: string): Result<T> {
  return { ok: false, error: truncate(error), checkedAt: new Date().toISOString() };
}

/** Upstream error strings are untrusted free-form text (the network monitor's
 * `error` field, GitHub messages). Keep them short; React escapes on render. */
export function truncate(s: string, max = 200): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max)}…` : oneLine;
}

/** fetch with a timeout that resolves to a Result instead of throwing. */
export async function safeFetch(
  url: string,
  init?: RequestInit,
): Promise<Result<globalThis.Response>> {
  try {
    const res = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    return ok(res);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return err(`fetch failed: ${msg}`);
  }
}
