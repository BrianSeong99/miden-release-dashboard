import { FileText } from "lucide-react";
import type { BlockerView } from "@/lib/types";
import { cn } from "@/lib/utils";
import { isOpenWork } from "@/lib/release-work";
import { StatusBadge } from "./status-badge";

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2 } as const;
const CATEGORY = {
  blocker: { label: "Blocker", tone: "red" },
  "follow-up": { label: "Follow-up", tone: "gray" },
  migration: { label: "Migration", tone: "amber" },
} as const;
const LIVE_TONE = { open: "amber", merged: "green", closed: "gray", unknown: "gray" } as const;

function stateLabel(b: BlockerView): string {
  if (b.live.state === "closed") return b.kind === "pull-request" ? "Closed, unmerged" : "Closed";
  return { open: "Open", merged: "Merged", unknown: "Unknown" }[b.live.state];
}

function WorkTable({ items, today, label }: { items: BlockerView[]; today: string; label: string }) {
  return (
    <div tabIndex={0} role="region" aria-label={label} className="overflow-x-auto rounded-[24px] bg-card focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand">
      <table className="w-full min-w-[1000px] border-collapse text-[13px] leading-6">
        <thead className="bg-muted">
          <tr className="text-left text-xs text-muted-foreground">
            {['Type', 'Work item', 'Stage', 'Assignee', 'GitHub state', 'Exit criterion', 'Decision date'].map((column) => (
              <th key={column} scope="col" className="px-4 py-4 font-medium">{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((b) => {
            const category = CATEGORY[b.category] ?? CATEGORY['follow-up'];
            return (
              <tr key={b.id} className="border-b border-border/60 align-top last:border-b-0 hover:bg-muted/50">
                <td className="px-4 py-4">
                  <StatusBadge tone={category.tone} label={category.label} />
                  {b.category === "blocker" && <div className="mt-1 text-xs text-muted-foreground">{b.severity}</div>}
                </td>
                <td className="max-w-[340px] px-4 py-4">
                  <a href={b.url} target="_blank" rel="noreferrer" className="rounded-sm break-words font-medium hover:text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                    {b.title}
                  </a>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-5 text-muted-foreground">
                    {b.blockingDependency && <span className="break-words">Scope: {b.blockingDependency}</span>}
                    {b.notionUrl && (
                      <a href={b.notionUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-sm hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
                        <FileText aria-hidden className="size-3" /> context
                      </a>
                    )}
                  </div>
                </td>
                <td className="px-4 py-4">{b.stage}</td>
                <td className="max-w-[160px] break-words px-4 py-4">{b.owner ?? (b.live.state === "unknown" ? "Unknown" : "Unassigned")}</td>
                <td className="px-4 py-4">
                  <StatusBadge tone={LIVE_TONE[b.live.state]} label={stateLabel(b)} title={b.live.state === "unknown" ? b.live.error : `checked ${b.live.checkedAt}`} />
                </td>
                <td className="max-w-[280px] break-words px-4 py-4 text-muted-foreground">{b.exitCondition}</td>
                <td className={cn("px-4 py-4 whitespace-nowrap", isOpenWork(b) && b.nextDecisionDate !== null && b.nextDecisionDate < today && "font-medium text-tone-red")}>
                  {b.nextDecisionDate ?? "Not set"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Curated release work and configured migrations, joined with live GitHub facts. */
export function BlockerList({ blockers, today }: { blockers: BlockerView[]; today: string }) {
  if (blockers.length === 0) return <p className="text-sm text-muted-foreground">No release work tracked for this version.</p>;
  const sorted = [...blockers].sort((a, b) =>
    Number(b.category === "blocker") - Number(a.category === "blocker") ||
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    (a.nextDecisionDate ?? "9999").localeCompare(b.nextDecisionDate ?? "9999") || a.stage.localeCompare(b.stage),
  );
  const open = sorted.filter(isOpenWork);
  const history = sorted.filter((b) => !isOpenWork(b));
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {open.length > 0 ? <WorkTable items={open} today={today} label="Open release work" />
        : <p className="text-sm text-muted-foreground">No open tracked work for this version.</p>}
      {history.length > 0 && (
        <details className="group rounded-[24px] bg-muted p-5">
          <summary className="cursor-pointer text-sm font-medium">Closed and merged work ({history.length})</summary>
          <p className="my-4 text-xs text-muted-foreground">GitHub history is kept separately. Closing an issue or merging a PR alone does not prove publication or deployment.</p>
          <WorkTable items={history} today={today} label="Closed and merged release work" />
        </details>
      )}
    </div>
  );
}
