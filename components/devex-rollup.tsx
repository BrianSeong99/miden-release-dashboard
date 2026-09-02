import { ChevronDown } from "lucide-react";
import { STATUS_LABEL } from "@/lib/status-engine";
import type { ComponentStatus, RollupStatus } from "@/lib/types";
import { ManualBadge } from "./manual-badge";
import { StatusBadge, StatusDot } from "./status-badge";

export const ROLLUP_LABEL: Record<RollupStatus["status"], string> = {
  ...STATUS_LABEL,
  "in-progress": "In progress",
};

/** The DevEx stage: one aggregate card, expandable to compact per-repo rows
 * (PRD section 9). Native <details> keeps it dependency-free. */
export function DevexRollup({
  rollup,
  components,
  defaultOpen = false,
}: {
  rollup: RollupStatus;
  components: ComponentStatus[];
  defaultOpen?: boolean;
}) {
  return (
    <div
      data-testid="component-devex"
      className="flex h-full w-full flex-col gap-2.5 rounded-xl border bg-card p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">DevEx</div>
          <div className="text-xs text-muted-foreground">{components.length} surfaces</div>
        </div>
        <StatusBadge tone={rollup.tone} label={ROLLUP_LABEL[rollup.status]} title={rollup.reason} />
      </div>
      <p className="text-xs text-muted-foreground">{rollup.reason}</p>
      <details className="group border-t pt-2" open={defaultOpen || undefined}>
        <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronDown aria-hidden className="size-3.5 transition-transform group-open:rotate-180" />
          Show surfaces
        </summary>
        <ul className="mt-2 flex flex-col gap-1.5">
          {components.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="flex min-w-0 items-center gap-1.5">
                <StatusDot tone={c.tone} />
                <a
                  href={`https://github.com/${c.repo}`}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate hover:text-brand hover:underline"
                  title={c.reason}
                >
                  {c.label}
                </a>
                {c.manual && <ManualBadge note={c.manualNote} />}
              </span>
              <span className="font-mono whitespace-nowrap text-muted-foreground">
                {c.deps.find((d) => d.version)?.version ?? c.latestRc ?? "—"}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
