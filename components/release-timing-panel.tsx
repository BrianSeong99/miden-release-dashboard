"use client";

import { useState } from "react";
import { Download, ArrowRight } from "lucide-react";
import type { BlockerView, ComponentStatus, GhRelease, PropagationTiming } from "@/lib/types";
import { derivePropagation } from "@/lib/release-timing";
import { formatElapsed } from "@/lib/time-format";
import { useHydratedClock } from "@/lib/use-hydrated-clock";
import { cn } from "@/lib/utils";
import { ReleaseDate } from "./release-date";
import { StatusBadge } from "./status-badge";
import { workTiming } from "@/lib/work-timing";
import { cell, timingCsv } from "@/lib/timing-csv";
import { isPrerelease } from "@/lib/semver-utils";

const linkClass = "rounded-sm font-medium hover:text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
const cellClass = "px-4 py-4 align-top";

function ReleaseStamp({ release, now, empty, deployment = false }: {
  release: GhRelease | null | undefined; now: number; empty: string; deployment?: boolean;
}) {
  if (!release) return <span className="text-muted-foreground">{empty}</span>;
  return <div className="flex flex-col items-start gap-1.5">
    <a href={release.htmlUrl} target="_blank" rel="noreferrer" className={linkClass}>
      {deployment ? "Latest docs deployment" : release.tagName}
    </a>
    {!deployment && <span className="text-xs text-muted-foreground">{release.prerelease || isPrerelease(release.tagName) ? "Prerelease" : "Stable"}</span>}
    <ReleaseDate publishedAt={release.publishedAt} now={now} />
  </div>;
}

function firstStableEmpty(c: ComponentStatus) {
  const timing = c.releaseTiming;
  if (!timing || timing.stableState === "unknown") return "Unknown";
  if (timing.source === "docs-deployment") return "First publication not tracked";
  if (timing.stableState === "not-monitored") return "Not tracked";
  if (timing.stableState === "unreleased") return "Not released";
  return "Date unverified";
}

function ComponentTimes({ components, now }: { components: ComponentStatus[]; now: number }) {
  return <div role="region" aria-label="Component release dates" tabIndex={0} className="max-h-[560px] overflow-auto rounded-[24px] bg-muted focus-visible:outline-2 focus-visible:outline-brand">
    <table className="w-full min-w-[860px] text-left text-[13px] leading-5">
      <thead className="sticky top-0 z-10 bg-muted"><tr className="text-xs text-muted-foreground">
        {["Component / target train", "First stable in train", "Latest in train", "Latest across versions"].map((label) => <th key={label} scope="col" className="px-4 py-4 font-medium">{label}</th>)}
      </tr></thead>
      <tbody>{components.map((c) => {
        const t = c.releaseTiming;
        const deployment = t?.source === "docs-deployment";
        const unavailable = deployment ? (c.docsSnapshot?.published === false ? "Not published" : "Unknown")
          : !t ? "Unknown" : t.source === "not-monitored" ? "No release tracking"
          : t.error || !t.historyComplete ? "Unknown" : "Not released";
        return <tr key={c.id} className="border-t border-card" data-testid={`timing-${c.id}`}>
          <th scope="row" className={cn(cellClass, "max-w-[210px] font-normal")}>
            <a href={`https://github.com/${c.repo}`} target="_blank" rel="noreferrer" className={linkClass}>{c.label}</a>
            <div className="mt-1 font-mono text-xs text-muted-foreground">{c.expectedVersion ?? "Target TBD"}</div>
            {t?.source === "github-release" && !t.historyComplete && <p className="mt-2 text-xs text-tone-amber" title={t.error}>History incomplete</p>}
            {t?.error && <p className="mt-1 text-xs text-muted-foreground" title={t.error}>Timing evidence incomplete</p>}
          </th>
          <td className={cellClass}><ReleaseStamp release={t?.firstStable} now={now} empty={firstStableEmpty(c)} /></td>
          <td className={cellClass}><ReleaseStamp release={t?.latestOnTrain} now={now} empty={c.expectedVersion === null ? "Target TBD" : unavailable} deployment={deployment} /></td>
          <td className={cellClass}>
            {deployment ? <span className="text-muted-foreground">Snapshot deployment shown separately</span>
              : <ReleaseStamp release={t?.latest} now={now} empty={unavailable} />}
            {t && t.history.length > 1 && <details className="mt-3 max-w-[260px] text-xs">
              <summary className="cursor-pointer rounded-sm text-muted-foreground focus-visible:outline-2 focus-visible:outline-brand">Available releases in train ({t.history.length})</summary>
              <ul className="mt-3 flex flex-col gap-3">{t.history.map((release) => <li key={release.htmlUrl}>
                <a href={release.htmlUrl} target="_blank" rel="noreferrer" className={linkClass}>{release.tagName}</a>
                <ReleaseDate publishedAt={release.publishedAt} compact showAge={false} />
              </li>)}</ul>
            </details>}
          </td>
        </tr>;
      })}</tbody>
    </table>
  </div>;
}

function Gap({ edge }: { edge: PropagationTiming }) {
  const duration = formatElapsed(edge.elapsedMs);
  if (edge.state === "released") return <div className="flex flex-col items-start gap-1.5"><span className="font-mono font-medium">{duration}</span><StatusBadge label="Released after upstream" tone="green" /></div>;
  if (edge.state === "waiting") return <div className="flex flex-col items-start gap-1.5"><span className="font-mono font-medium">{duration}</span><StatusBadge label="Awaiting downstream stable" tone="amber" /></div>;
  if (edge.state === "downstream-first") return <div className="flex flex-col items-start gap-1.5"><span className="font-mono font-medium">{duration} earlier</span><StatusBadge label="Downstream released first" tone="gray" /></div>;
  return <span className="text-muted-foreground">{{ "upstream-pending": "Awaiting upstream stable", "not-monitored": "Release dates not tracked", unknown: "Insufficient date evidence" }[edge.state]}</span>;
}

export function ReleaseTimingPanel({ components, generatedAt, releaseVersion, work = [] }: {
  components: ComponentStatus[]; generatedAt: string; releaseVersion: string; work?: BlockerView[];
}) {
  const [view, setView] = useState<"components" | "dependencies" | "workflow">("components");
  const now = useHydratedClock(generatedAt);
  const edges = derivePropagation(components, generatedAt);
  const measured = edges.filter((e) => e.state === "released");
  const waiting = edges.filter((e) => e.state === "waiting");
  const earlier = edges.filter((e) => e.state === "downstream-first");
  const unavailable = edges.length - measured.length - waiting.length - earlier.length;
  const tracked = work.filter((item) => item.kind === "pull-request");
  const csv = view === "workflow" ? [
    ["release", "observed_at_utc", "component", "PR", "state", "opened_at_utc", "ready_at_utc", "merged_at_utc", "preparation_hours", "review_to_merge_hours", "open_wait_hours", "total_to_merge_hours", "evidence"],
    ...tracked.map((item) => { const t = workTiming(item, generatedAt); return [releaseVersion, generatedAt, item.stage, item.title, item.live.state, item.workflow?.openedAt, item.workflow?.readyAt, item.workflow?.mergedAt,
      ...[t.preparationMs, t.reviewMs, t.openWaitMs, t.totalToMergeMs].map((ms) => ms === null ? null : ms / 3_600_000), item.url]; }),
  ].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n" : timingCsv(components, edges, releaseVersion, generatedAt, view);

  return <div className="flex min-w-0 flex-col gap-5">
    <p className="max-w-4xl text-sm leading-6 text-muted-foreground">Compare release dates across version trains to establish a baseline for the release flow. Dependency gaps run from upstream’s first stable release to downstream’s first stable release. These are publication intervals; dependency adoption and engineering effort require separate evidence.</p>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="group" aria-label="Timing view" className="flex rounded-full bg-muted p-1">
        {(["components", "dependencies", "workflow"] as const).map((key) => <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)} className={cn("cursor-pointer rounded-full px-4 py-2.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand", view === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
          {key === "components" ? "Component dates" : key === "dependencies" ? "Dependency gaps" : "Migration flow"}
        </button>)}
      </div>
      <a download={`miden-${releaseVersion}-${view}-timing.csv`} href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`} className="inline-flex min-h-10 items-center gap-2 rounded-full bg-muted px-4 py-2.5 text-xs font-medium hover:bg-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand">
        <Download aria-hidden className="size-3.5" /> Export CSV
      </a>
    </div>
    {view === "workflow" ? <div role="region" aria-label="Migration flow timing" tabIndex={0} className="max-h-[560px] overflow-auto rounded-[24px] bg-muted">
      <p className="p-4 text-xs text-muted-foreground">Tracked PR history, including merged work for measurement. Ready-for-review dates require an explicit GitHub event. Release and deployment are separate evidence; PR merge alone does not prove either.</p>
      <table className="w-full min-w-[1000px] text-left text-[13px] leading-5"><thead><tr>{["Component / PR", "Opened", "Ready for review", "Merged", "Time to review", "Review to merge", "Open wait"].map((label) => <th key={label} className={cellClass}>{label}</th>)}</tr></thead>
      <tbody>{tracked.map((item) => { const t = workTiming(item, generatedAt); return <tr key={item.id} className="border-t border-card">
        <th scope="row" className={cn(cellClass, "max-w-64 font-normal")}><div className="text-xs text-muted-foreground">{components.find((c) => c.id === item.stage)?.label ?? item.stage} · {item.live.state}</div><a href={item.url} target="_blank" rel="noreferrer" className={linkClass}>{item.title}</a></th>
        {[item.workflow?.openedAt, item.workflow?.readyAt, item.workflow?.mergedAt].map((at, index) => <td key={index} className={cellClass}>{at ? <ReleaseDate publishedAt={at} compact showAge={false} /> : "Not evidenced"}</td>)}
        {[t.preparationMs, t.reviewMs, t.openWaitMs].map((ms, index) => <td key={index} className={cellClass}>{ms === null ? "—" : formatElapsed(ms)}</td>)}
      </tr>; })}</tbody></table>
      {tracked.length === 0 && <p className="p-4 text-sm text-muted-foreground">No tracked PR evidence for this release.</p>}
    </div> : view === "components" ? <ComponentTimes components={components} now={now} /> : <>
      <p className="text-xs leading-5 text-muted-foreground">{measured.length} measured gaps · {waiting.length} awaiting downstream · {earlier.length} downstream first · {unavailable} without a comparable pair. Open waits are measured at the last refresh.</p>
      <div role="region" aria-label="Dependency release gaps" tabIndex={0} className="max-h-[560px] overflow-auto rounded-[24px] bg-muted focus-visible:outline-2 focus-visible:outline-brand">
        <table className="w-full min-w-[900px] text-left text-[13px] leading-5">
          <thead className="sticky top-0 z-10 bg-muted"><tr className="text-xs text-muted-foreground">{["Dependency", "Upstream first stable", "Downstream first stable", "Release gap / open wait"].map((label) => <th key={label} scope="col" className="px-4 py-4 font-medium">{label}</th>)}</tr></thead>
          <tbody>{edges.map((edge) => <tr key={`${edge.fromId}-${edge.toId}`} className="border-t border-card">
            <th scope="row" className={cn(cellClass, "font-medium")}><div className="flex flex-wrap items-center gap-2">{edge.fromLabel}<ArrowRight aria-label="to" className="size-3.5 text-muted-foreground" />{edge.toLabel}</div></th>
            <td className={cellClass}><ReleaseStamp release={edge.upstream} now={now} empty="—" /></td>
            <td className={cellClass}><ReleaseStamp release={edge.downstream} now={now} empty="—" /></td>
            <td className={cellClass}><Gap edge={edge} /></td>
          </tr>)}</tbody>
        </table>
        {edges.length === 0 && <p className="p-5 text-sm text-muted-foreground">No configured dependency edges for this version.</p>}
      </div>
    </>}
    <p className="text-xs leading-5 text-muted-foreground">Times are UTC. Prereleases are separate from stable releases. Docs show their latest verified deployment; its first publication is not tracked. A manifest’s current version alone does not establish when it was updated.</p>
  </div>;
}
