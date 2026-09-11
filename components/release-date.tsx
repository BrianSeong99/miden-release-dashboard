import { formatElapsed } from "@/lib/time-format";
import { cn } from "@/lib/utils";

// GitHub uses ISO timestamps with a timezone. Reject locale-dependent strings.
const PUBLICATION_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function ReleaseDate({ publishedAt, now, showAge = true, compact = false }: {
  publishedAt: string | null;
  /** Supplied by the snapshot's hydrated clock; omission renders only exact UTC. */
  now?: number;
  showAge?: boolean;
  compact?: boolean;
}) {
  const timestamp = publishedAt && PUBLICATION_TIMESTAMP.test(publishedAt) ? Date.parse(publishedAt) : NaN;
  const calendarDay = publishedAt?.slice(0, 10);
  const calendarTime = Date.parse(`${calendarDay}T00:00:00Z`);
  const validCalendar = Number.isFinite(calendarTime) && new Date(calendarTime).toISOString().slice(0, 10) === calendarDay;
  if (!Number.isFinite(timestamp) || !validCalendar || (now !== undefined && (!Number.isFinite(now) || timestamp > now))) {
    return <span className="text-muted-foreground">Unknown</span>;
  }
  const utc = `${new Date(timestamp).toISOString().slice(0, 19).replace("T", " ")} UTC`;
  return (
    <span className={cn("inline-flex", compact ? "flex-wrap items-baseline gap-x-2" : "flex-col gap-0.5")}>
      <time dateTime={publishedAt!} className="tabular-nums" title={utc}>{utc}</time>
      {showAge && now !== undefined && (
        <span className="text-xs text-muted-foreground">{formatElapsed(now - timestamp)} ago</span>
      )}
    </span>
  );
}
