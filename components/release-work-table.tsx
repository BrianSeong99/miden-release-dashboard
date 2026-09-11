"use client";

import { Fragment, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Search, X } from "lucide-react";
import type { BlockerView, ComponentStatus } from "@/lib/types";
import { buildWorkRows, filterAndSortWorkRows, type WorkRow } from "@/lib/work-table";
import { useHydratedClock } from "@/lib/use-hydrated-clock";
import { cn } from "@/lib/utils";
import { ComponentNode } from "./component-node";
import { ManualBadge } from "./manual-badge";
import { ReleaseDate } from "./release-date";
import { StatusBadge } from "./status-badge";

type View = "all" | "actions" | "components" | "history";
type Sort = "title" | "group" | "component" | "owner" | "status" | "date";
const views: { value: View; label: string }[] = [
  { value: "all", label: "All" }, { value: "actions", label: "Actions" },
  { value: "components", label: "Components" }, { value: "history", label: "History" },
];
const kindLabels = { component: "Component", blocker: "Blocker", "follow-up": "Follow-up", migration: "Migration" } as const;
const controlClass = "min-h-10 rounded-full bg-muted px-4 py-2 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const linkClass = "rounded-sm font-medium hover:text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

function RowDetails({ row, now }: { row: WorkRow; now: number }) {
  return <div className="grid gap-6 py-2 lg:grid-cols-2">
    {row.work && <div className="flex min-w-0 flex-col gap-4 rounded-[24px] bg-muted p-5">
      <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">Work details</h3><ManualBadge note="Classification, scope and exit criterion are curated. Title, assignee and state refresh from GitHub." /></div>
      <dl className="grid gap-4 text-sm">
        <div><dt className="text-xs text-muted-foreground">Exit criterion</dt><dd className="mt-1 break-words">{row.work.exitCondition}</dd></div>
        {row.work.blockingDependency && <div><dt className="text-xs text-muted-foreground">Scope</dt><dd className="mt-1 break-words">{row.work.blockingDependency}</dd></div>}
        <div><dt className="text-xs text-muted-foreground">Decision date</dt><dd className="mt-1">{row.work.nextDecisionDate ?? "Not set"}</dd></div>
      </dl>
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <a href={row.url} target="_blank" rel="noreferrer" className={linkClass}>Open GitHub issue or PR</a>
        {row.work.notionUrl && <a href={row.work.notionUrl} target="_blank" rel="noreferrer" className={linkClass}>Context</a>}
      </div>
      <p className="text-xs text-muted-foreground">GitHub state checked <ReleaseDate publishedAt={row.work.live.checkedAt} compact showAge={false} /></p>
      {row.work.live.state === "unknown" && <p className="text-xs text-muted-foreground">{row.work.live.error}</p>}
      {!row.active && <p className="text-xs text-muted-foreground">Closing an issue or merging a PR does not by itself prove publication or deployment.</p>}
    </div>}
    {row.component && <div className="min-w-0 max-w-xl"><ComponentNode component={row.component} now={now} /></div>}
  </div>;
}

function RowDate({ row, now, today }: { row: WorkRow; now: number; today: string }) {
  const absent = row.work ? "Not set" : row.component?.releaseTiming?.source === "not-monitored" ? "Not tracked"
    : row.component?.docsSnapshot?.published === false ? "Not published"
    : row.component?.releaseTiming?.stableState === "unreleased" && !row.component.matchedRelease ? "Not released" : "Unknown";
  return <div className="flex flex-col gap-1 text-xs">
    <span className="text-muted-foreground">{row.dateLabel}</span>
    {row.date ? row.work
      ? <time dateTime={row.date} className={cn("tabular-nums", row.active && row.date < today && "font-medium text-tone-red")}>{row.date}</time>
      : <ReleaseDate publishedAt={row.date} now={now} />
      : <span className="text-muted-foreground">{absent}</span>}
  </div>;
}

export function ReleaseWorkTable({ components, work, generatedAt }: {
  components: ComponentStatus[]; work: BlockerView[]; generatedAt: string;
}) {
  const [view, setView] = useState<View>("all");
  const [group, setGroup] = useState("all");
  const [type, setType] = useState<"all" | WorkRow["kind"]>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("status");
  const [direction, setDirection] = useState<"asc" | "desc">("asc");
  const [expanded, setExpanded] = useState<string | null>(null);
  const now = useHydratedClock(generatedAt);
  const rows = buildWorkRows(components, work);
  const groups = [...new Map(rows.map((row) => [row.group, row.groupLabel])).entries()].sort((a, b) => a[1].localeCompare(b[1], "en"));
  const visible = filterAndSortWorkRows(rows, { view, group, type, query, sort, direction });
  const hasFilters = view !== "all" || group !== "all" || type !== "all" || query.length > 0;
  const clear = () => { setView("all"); setGroup("all"); setType("all"); setQuery(""); setExpanded(null); };
  const countFor = (target: View) => filterAndSortWorkRows(rows, { view: target, group, type, query, sort, direction }).length;
  const sortBy = (key: Sort) => { setDirection(sort === key && direction === "asc" ? "desc" : "asc"); setSort(key); };
  const heading = (label: string, key: Sort) => <th scope="col" aria-sort={sort === key ? direction === "asc" ? "ascending" : "descending" : "none"} className="px-4 py-4 font-medium">
    <button type="button" onClick={() => sortBy(key)} className="inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-sm text-left hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand" aria-label={`Sort by ${label}`}>
      {label}{sort === key ? direction === "asc" ? <ArrowUp aria-hidden className="size-3.5" /> : <ArrowDown aria-hidden className="size-3.5" /> : <ArrowUpDown aria-hidden className="size-3.5 opacity-50" />}
    </button>
  </th>;

  return <div className="flex min-w-0 flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="group" aria-label="Release work views" className="flex max-w-full flex-wrap gap-1 rounded-[24px] bg-muted p-1">
        {views.map((item) => <button key={item.value} type="button" onClick={() => { setView(item.value); setExpanded(null); }} aria-pressed={view === item.value} className={cn("inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand", view === item.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
          {item.label}<span className="tabular-nums opacity-70">{countFor(item.value)}</span>
        </button>)}
      </div>
      <label className="relative min-w-0 flex-1 sm:max-w-sm">
        <span className="sr-only">Search release work</span><Search aria-hidden className="pointer-events-none absolute top-3 left-3.5 size-4 text-muted-foreground" />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search work, components or owners" className={cn(controlClass, "w-full pr-4 pl-10")} />
      </label>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-xs text-muted-foreground">Group<select value={group} onChange={(e) => setGroup(e.target.value)} className={cn(controlClass, "cursor-pointer text-foreground")}>
        <option value="all">All groups</option>{groups.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        {group !== "all" && !groups.some(([value]) => value === group) && <option value={group}>{group} (no items)</option>}
      </select></label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">Type<select value={type} onChange={(e) => setType(e.target.value as typeof type)} className={cn(controlClass, "cursor-pointer text-foreground")}>
        <option value="all">All types</option>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      {hasFilters && <button type="button" onClick={clear} className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-brand"><X aria-hidden className="size-3.5" />Clear filters</button>}
      <p role="status" className="text-xs text-muted-foreground sm:ml-auto">{visible.length} of {rows.length} items</p>
    </div>
    <p className="text-xs leading-5 text-muted-foreground">Actions shows unfinished components and open or unverified work. Component state and issue/PR state are separate facts. Expand a row for its checks and evidence.</p>
    <div tabIndex={0} role="region" aria-label="Unified release work" className="max-h-[720px] overflow-auto rounded-[24px] bg-card focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand">
      <table className="w-full min-w-[1060px] border-collapse text-left text-[13px] leading-5">
        <thead className="sticky top-0 z-10 bg-muted text-xs text-muted-foreground"><tr>
          {heading("Work item", "title")}{heading("Group", "group")}{heading("Component", "component")}{heading("State", "status")}{heading("Owner / assignee", "owner")}<th scope="col" className="px-4 py-4 font-medium">Version</th>{heading("Date", "date")}
        </tr></thead>
        <tbody>{visible.map((row) => {
          const open = expanded === row.id;
          const c = row.component;
          return <Fragment key={row.id}>
            <tr data-testid={`work-row-${row.id}`} className={cn("border-b border-border/60 align-top hover:bg-muted/50", open && "bg-muted/50")}>
              <td className="max-w-[360px] px-4 py-4"><div className="flex items-start gap-2">
                <button type="button" aria-expanded={open} aria-controls={`work-details-${row.id}`} onClick={() => setExpanded(open ? null : row.id)} aria-label={`${open ? "Hide" : "Show"} details for ${row.title}`} className="-ml-2 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-muted focus-visible:outline-2 focus-visible:outline-brand"><ChevronRight aria-hidden className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-90")} /></button>
                <div className="min-w-0 pt-1"><a href={row.url} target="_blank" rel="noreferrer" className={cn(linkClass, "break-words")}>{row.title}</a><div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{kindLabels[row.kind]}</span>{row.kind === "blocker" && <span className="text-tone-red">{row.work?.severity}</span>}{c?.manual && row.kind === "component" && <ManualBadge note={c.manualNote} />}</div></div>
              </div></td>
              <td className="px-4 py-4 text-muted-foreground">{row.groupLabel}</td>
              <td className="px-4 py-4">{row.componentLabel}</td>
              <td className="px-4 py-4"><StatusBadge tone={row.tone} label={row.status} title={row.work?.live.state === "unknown" ? row.work.live.error : row.kind === "component" ? c?.reason : undefined} /></td>
              <td className="max-w-[150px] break-words px-4 py-4"><div>{row.owner ?? (row.status === "Unknown" ? "Unknown" : "Unassigned")}</div><div className="mt-1 text-xs text-muted-foreground">{row.ownerLabel}</div></td>
              <td className="px-4 py-4 text-xs"><span className="font-mono">{c?.matchedRelease ?? c?.expectedVersion ?? "—"}</span>{c && <div className="mt-1 text-muted-foreground">{c.matchedRelease ? row.work ? "Component release" : "Released" : c.expectedVersion ? "Target" : ""}</div>}</td>
              <td className="px-4 py-4"><RowDate row={row} now={now} today={generatedAt.slice(0, 10)} /></td>
            </tr>
            {open && <tr id={`work-details-${row.id}`}><td colSpan={7} className="border-b border-border px-5 py-4"><RowDetails row={row} now={now} /></td></tr>}
          </Fragment>;
        })}</tbody>
      </table>
      {visible.length === 0 && <div className="flex flex-col items-start gap-3 p-6"><p className="text-sm text-muted-foreground">{rows.length ? "No items match these filters." : "No components or release work tracked for this version."}</p>{hasFilters && <button type="button" onClick={clear} className={cn(controlClass, "cursor-pointer font-medium")}>Show all work</button>}</div>}
    </div>
  </div>;
}
