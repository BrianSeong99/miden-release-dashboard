/** A duration's magnitude; callers supply whether it is earlier, later or ago. */
export function formatElapsed(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "Unknown";
  const minutes = Math.floor(Math.abs(ms) / 60_000);
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
