import { CircleAlert } from "lucide-react";
import { STATUS_LABEL } from "@/lib/status-engine";
import type { ComponentStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EvidenceLink } from "./evidence-link";
import { ManualBadge } from "./manual-badge";
import { ReleaseDate } from "./release-date";
import { StatusBadge } from "./status-badge";

function VersionRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px] leading-5">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words text-right font-mono">{value ?? "—"}</span>
    </div>
  );
}

export function ComponentNode({ component: c, now }: { component: ComponentStatus; now?: number }) {
  const isDocs = c.docsSnapshot !== undefined || c.releaseTiming?.source === "docs-deployment";
  const publishedAt = isDocs ? c.docsSnapshot?.publishedAt ?? null : c.matchedPublishedAt;
  const missingPublication = c.releaseTiming?.source === "not-monitored" ? "Not monitored"
    : isDocs && c.docsSnapshot?.published === false ? "Not published"
    : c.releaseTiming?.stableState === "unreleased" && !c.releaseTiming.latestOnTrain && !c.matchedRelease ? "Not released"
    : "Unknown";
  return (
    <div
      data-testid={`component-${c.id}`}
      className={cn(
        "flex h-full min-w-0 w-full flex-col gap-4 rounded-[24px] bg-muted p-5",
        c.status === "unknown" && "outline-1 -outline-offset-1 outline-dashed outline-border",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="break-words font-semibold leading-6">{c.label}</div>
          <a
            href={`https://github.com/${c.repo}/tree/${encodeURIComponent(c.branch)}`}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block rounded-sm break-all text-xs leading-5 text-muted-foreground hover:text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {c.repo}@{c.branch}
          </a>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <StatusBadge tone={c.tone} label={STATUS_LABEL[c.status]} title={c.reason} />
          {c.manual && <ManualBadge note={c.manualNote} />}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <VersionRow label={c.group === "toolchain" ? "Channel" : "Expected"} value={c.expectedVersion ?? "TBD"} />
        {c.docsSnapshot !== undefined ? <>
          <VersionRow label="Snapshot" value={c.docsSnapshot === null ? "Unknown" : c.docsSnapshot.snapshotExists ? c.docsSnapshot.version : "Not created"} />
          <VersionRow label="Publication" value={c.docsSnapshot === null ? "Unknown" : c.docsSnapshot.published ? "Published" : "Not published"} />
        </> : c.group !== "toolchain" ? <>
          <VersionRow label="Latest stable" value={c.latestStable} />
          <VersionRow label="Latest RC" value={c.latestRc} />
        </> : null}
        <div className="flex items-baseline justify-between gap-3 text-[13px] leading-5">
          <span className="shrink-0 text-muted-foreground">{isDocs ? "Latest deployment" : "Released"}</span>
          <span className="min-w-0 break-words text-right">
            {publishedAt ? <ReleaseDate publishedAt={publishedAt} now={now} /> : missingPublication}
          </span>
        </div>
      </div>

      <div className="text-xs leading-5 text-muted-foreground">Usage verification: {c.verification ? <><ManualBadge note={`Reported by ${c.verification.confirmedBy}`} /> {c.verification.status} for {c.verification.version} on {c.verification.environment} · <ReleaseDate publishedAt={c.verification.observedAt} showAge={false} compact /> <EvidenceLink label="Verification evidence" url={c.verification.evidenceUrl} /></> : "Not recorded"}</div>
      {c.dependencyRef && <p className="text-xs text-muted-foreground">Dependencies from {c.dependencyRef.kind === "release" ? "published release" : c.dependencyRef.kind === "distribution" ? "public distribution" : "development source"}: <a href={c.dependencyRef.url} target="_blank" rel="noreferrer" className="underline">{c.dependencyRef.ref}</a>. Development branch: {c.branch}.</p>}
      {c.distribution && <div className="rounded-2xl bg-card p-4 text-xs leading-5">
        <p className="font-medium">Distribution: {c.distribution.state === "pending" ? "Awaiting publication" : c.distribution.state}</p>
        <p className="mt-1 text-muted-foreground">{c.distribution.reason}</p>
        <div className="mt-2 flex gap-4"><EvidenceLink label="Development source" url={c.distribution.sourceUrl} /><EvidenceLink label="Public manifest" url={c.distribution.publishedUrl} /></div>
        {c.distribution.changes.length > 0 && <details className="mt-2"><summary className="cursor-pointer">{c.distribution.changes.length} publication differences</summary><ul className="mt-2 space-y-1">{c.distribution.changes.map((change) => <li key={change}>{change}</li>)}</ul></details>}
      </div>}
      {c.deps.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-white pt-4">
          {c.deps.map((d) => (
            <div key={d.label} className="flex items-baseline justify-between gap-3 text-xs leading-5">
              {d.url ? (
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  title={d.error ?? d.label}
                  className="min-w-0 flex-1 rounded-sm break-words text-muted-foreground hover:text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                >
                  {d.label}
                </a>
              ) : (
                <span className="min-w-0 flex-1 break-words text-muted-foreground" title={d.error ?? d.label}>
                  {d.label}
                </span>
              )}
              <span
                className={cn(
                  "min-w-0 max-w-[60%] break-words text-right font-mono",
                  d.staleBehind && "text-tone-amber",
                  !d.staleBehind && d.onTarget === true && "text-tone-green",
                  d.onTarget === false && "text-tone-amber",
                  d.onTarget === null && "text-tone-gray",
                )}
                title={d.staleBehind ? `On the right train, but ${d.staleBehind} is out` : undefined}
              >
                {d.resolution === "range" ? d.raw ?? "absent" : d.version ?? (d.error ? "?" : "absent")}
                {d.resolution && <span className="block font-sans text-[11px] text-muted-foreground">{d.resolution === "locked" ? <a href={d.resolutionUrl} target="_blank" rel="noreferrer" className="underline">Locked · requires {d.raw}</a> : d.resolution === "range" ? "Declared range · resolution unverified" : "Exact declaration"}</span>}
                {d.staleBehind ? ` (${d.staleBehind} out)` : d.onTarget === true ? " ✓" : d.onTarget === false ? " ✗" : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-2 border-t border-white pt-4 text-xs leading-5">
        <div className="flex items-baseline justify-between gap-3">
          <span className="shrink-0 text-muted-foreground">Owner</span>
          <span className="min-w-0 break-words text-right">{c.owner}</span>
        </div>
        <p className="break-words text-muted-foreground">{c.reason}</p>
        {c.errors.length > 0 && c.status === "unknown" && (
          <p className="flex items-start gap-1.5 text-tone-gray">
            <CircleAlert aria-hidden className="mt-1 size-3 shrink-0" />
            <span className="min-w-0 break-words">{c.errors[0]}</span>
          </p>
        )}
        {c.evidence.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
            {c.evidence.map((e) => (
              <EvidenceLink key={e.url + e.label} label={e.label} url={e.url} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
