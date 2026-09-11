import { ChevronDown } from "lucide-react";
import { STATUS_LABEL } from "@/lib/status-engine";
import type { ComponentStatus, RollupStatus } from "@/lib/types";
import { ManualBadge } from "./manual-badge";
import { StatusBadge, StatusDot } from "./status-badge";

export const ROLLUP_LABEL: Record<RollupStatus["status"], string> = {
  ...STATUS_LABEL,
  "in-progress": "In progress",
};

/** A roll-up stage (DevEx, Walnut, …): one aggregate card, expandable to
 * compact per-repo rows (PRD section 9). Native <details> keeps it
 * dependency-free. */
export function GroupRollup({
  title,
  rollup,
  components,
  defaultOpen = false,
}: {
  title: string;
  rollup: RollupStatus;
  components: ComponentStatus[];
  defaultOpen?: boolean;
}) {
  return (
    <div
      data-testid={`rollup-${title.toLowerCase()}`}
      className="flex h-full min-w-0 w-full flex-col gap-4 rounded-[24px] bg-muted p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="break-words font-semibold leading-6">{title}</div>
          <div className="mt-1 text-xs leading-5 text-muted-foreground">{components.length} surfaces</div>
        </div>
        <StatusBadge tone={rollup.tone} label={ROLLUP_LABEL[rollup.status]} title={rollup.reason} />
      </div>
      <p className="break-words text-xs leading-5 text-muted-foreground">{rollup.reason}</p>
      <details className="group border-t border-white pt-4" open={defaultOpen || undefined}>
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-sm text-xs font-medium leading-5 text-muted-foreground select-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand [&::-webkit-details-marker]:hidden">
          <ChevronDown aria-hidden className="size-3.5 transition-transform group-open:rotate-180" />
          Show surfaces
        </summary>
        <ul className="mt-4 flex flex-col gap-3">
          {components.map((c) => (
            <li key={c.id} className="flex items-baseline justify-between gap-3 text-xs leading-5">
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                <StatusDot tone={c.tone} />
                <a
                  href={`https://github.com/${c.repo}`}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 rounded-sm break-words hover:text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  title={c.reason}
                >
                  {c.label}
                </a>
                {c.manual && <ManualBadge note={c.manualNote} />}
              </span>
              <span className="min-w-0 max-w-[50%] break-words text-right font-mono text-muted-foreground">
                {c.deps.find((d) => d.version)?.version ?? c.latestRc ?? "—"}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
