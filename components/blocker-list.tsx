import { Fragment } from "react";
import { FileText } from "lucide-react";
import type { BlockerView } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./status-badge";

const SEVERITY_TONE = { critical: "red", high: "amber", medium: "gray" } as const;
const SEVERITY_RANK = { critical: 0, high: 1, medium: 2 } as const;

// "Closed" without a merge usually means superseded or rejected — the exit
// condition may NOT be met, so it renders amber, not green.
const LIVE_TONE = { open: "amber", merged: "green", closed: "amber", unknown: "gray" } as const;
const LIVE_LABEL = { open: "Open", merged: "Merged", closed: "Closed — verify", unknown: "Unknown" };

const isOpen = (b: BlockerView) => b.live.state === "open" || b.live.state === "unknown";

function pastDue(date: string, today: string): boolean {
  return date < today;
}

/** Critical-blockers table (PRD section 5C). Live state comes from GitHub at
 * refresh time; everything else is curated in config/blockers.yaml. */
export function BlockerList({ blockers, today }: { blockers: BlockerView[]; today: string }) {
  if (blockers.length === 0) {
    return <p className="text-sm text-muted-foreground">No critical blockers configured.</p>;
  }
  const sorted = [...blockers].sort(
    (a, b) =>
      Number(isOpen(b)) - Number(isOpen(a)) ||
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      a.nextDecisionDate.localeCompare(b.nextDecisionDate),
  );
  const firstResolved = sorted.findIndex((b) => !isOpen(b));
  return (
    <div tabIndex={0} role="region" aria-label="Scrollable release blockers" className="overflow-x-auto rounded-[24px] bg-card focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand">
      <table className="w-full min-w-[900px] border-collapse text-[13px] leading-6">
        <thead className="bg-muted">
          <tr className="text-left text-xs text-muted-foreground">
            <th className="px-4 py-4 font-medium">Severity</th>
            <th className="px-4 py-4 font-medium">Blocker</th>
            <th className="px-4 py-4 font-medium">Stage</th>
            <th className="px-4 py-4 font-medium">Owner</th>
            <th className="px-4 py-4 font-medium">State</th>
            <th className="px-4 py-4 font-medium">Exit condition</th>
            <th className="px-4 py-4 font-medium">Next decision</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((b, i) => (
            <Fragment key={b.id}>
            {i === firstResolved && (
              <tr>
                <td colSpan={7} className="bg-muted/70 px-4 py-3 text-xs font-medium text-muted-foreground">
                  Resolved this cycle
                </td>
              </tr>
            )}
            <tr className="border-b border-border/60 align-top last:border-b-0 hover:bg-muted/50">
              <td className="px-4 py-4">
                <StatusBadge tone={SEVERITY_TONE[b.severity]} label={b.severity} />
              </td>
              <td className="max-w-[320px] px-4 py-4">
                <a href={b.url} target="_blank" rel="noreferrer" className="rounded-sm break-words font-medium hover:text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                  {b.title}
                </a>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-muted-foreground">
                  {b.blockingDependency && <span className="break-words">blocks: {b.blockingDependency}</span>}
                  {b.notionUrl && (
                    <a
                      href={b.notionUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-sm hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      <FileText aria-hidden className="size-3" /> context
                    </a>
                  )}
                </div>
              </td>
              <td className="px-4 py-4">{b.stage}</td>
              <td className="px-4 py-4 whitespace-nowrap">{b.owner}</td>
              <td className="px-4 py-4">
                <StatusBadge
                  tone={LIVE_TONE[b.live.state]}
                  label={LIVE_LABEL[b.live.state]}
                  title={b.live.state === "unknown" ? b.live.error : `checked ${b.live.checkedAt}`}
                />
              </td>
              <td className="max-w-[280px] break-words px-4 py-4 text-muted-foreground">{b.exitCondition}</td>
              <td
                className={cn(
                  "px-4 py-4 whitespace-nowrap",
                  pastDue(b.nextDecisionDate, today) && "font-medium text-tone-red",
                )}
              >
                {b.nextDecisionDate}
              </td>
            </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
