import { FileText } from "lucide-react";
import type { BlockerView } from "@/lib/types";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./status-badge";

const SEVERITY_TONE = { critical: "red", high: "amber", medium: "gray" } as const;

const LIVE_TONE = { open: "amber", merged: "green", closed: "green", unknown: "gray" } as const;
const LIVE_LABEL = { open: "Open", merged: "Merged", closed: "Closed", unknown: "Unknown" };

function pastDue(date: string, today: string): boolean {
  return date < today;
}

/** Critical-blockers table (PRD section 5C). Live state comes from GitHub at
 * refresh time; everything else is curated in config/blockers.yaml. */
export function BlockerList({ blockers, today }: { blockers: BlockerView[]; today: string }) {
  if (blockers.length === 0) {
    return <p className="text-sm text-muted-foreground">No critical blockers configured.</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full min-w-[900px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b text-left text-xs tracking-wide text-muted-foreground">
            <th className="px-3 py-2.5 font-medium">Severity</th>
            <th className="px-3 py-2.5 font-medium">Blocker</th>
            <th className="px-3 py-2.5 font-medium">Stage</th>
            <th className="px-3 py-2.5 font-medium">Owner</th>
            <th className="px-3 py-2.5 font-medium">State</th>
            <th className="px-3 py-2.5 font-medium">Exit condition</th>
            <th className="px-3 py-2.5 font-medium">Next decision</th>
          </tr>
        </thead>
        <tbody>
          {blockers.map((b) => (
            <tr key={b.id} className="border-b align-top last:border-b-0 hover:bg-muted/50">
              <td className="px-3 py-2.5">
                <StatusBadge tone={SEVERITY_TONE[b.severity]} label={b.severity} />
              </td>
              <td className="max-w-[320px] px-3 py-2.5">
                <a href={b.url} target="_blank" rel="noreferrer" className="font-medium hover:text-brand hover:underline">
                  {b.title}
                </a>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  {b.blockingDependency && <span>blocks: {b.blockingDependency}</span>}
                  {b.notionUrl && (
                    <a
                      href={b.notionUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-0.5 hover:text-brand"
                    >
                      <FileText aria-hidden className="size-3" /> context
                    </a>
                  )}
                </div>
              </td>
              <td className="px-3 py-2.5">{b.stage}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">{b.owner}</td>
              <td className="px-3 py-2.5">
                <StatusBadge
                  tone={LIVE_TONE[b.live.state]}
                  label={LIVE_LABEL[b.live.state]}
                  title={b.live.state === "unknown" ? b.live.error : `checked ${b.live.checkedAt}`}
                />
              </td>
              <td className="max-w-[280px] px-3 py-2.5 text-muted-foreground">{b.exitCondition}</td>
              <td
                className={cn(
                  "px-3 py-2.5 whitespace-nowrap",
                  pastDue(b.nextDecisionDate, today) && "font-medium text-tone-red",
                )}
              >
                {b.nextDecisionDate}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
