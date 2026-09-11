"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { RefreshCw } from "lucide-react";
import type { BlockerView, DashboardSnapshot } from "@/lib/types";
import { BlockerList } from "./blocker-list";
import { ComponentNode } from "./component-node";
import { DependencyDag } from "./dependency-dag";
import { ManualBadge } from "./manual-badge";
import { ReleaseOverview } from "./release-overview";
import { RefreshStatus } from "./refresh-status";
import { fetchSnapshot, SNAPSHOT_REFRESH_INTERVAL } from "@/lib/snapshot-fetcher";
import { isCriticalReleaseBlocker, isOpenWork } from "@/lib/release-work";
import { ReleaseTimingPanel } from "./release-timing-panel";
import { useHydratedClock } from "@/lib/use-hydrated-clock";

function BlockerCounts({ blockers }: { blockers: BlockerView[] }) {
  const open = blockers.filter(isOpenWork);
  const critical = open.filter(isCriticalReleaseBlocker).length;
  const closed = blockers.length - open.length;
  return (
    <span className="rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground">
      {critical} confirmed critical · {open.length} open · {closed} closed/merged
    </span>
  );
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function DashboardClient({ initial }: { initial: DashboardSnapshot }) {
  const router = useRouter();
  const [version, setVersion] = useState(initial.release.targetVersion);
  // Deep links: the exported page is one static shell, so ?release= is read
  // on the client after mount.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("release");
    if (wanted && initial.releases.some((r) => r.targetVersion === wanted)) {
      // One-time URL sync on mount. The static export renders the default
      // release, and reading search params at render time would either blank
      // the first paint (useSearchParams + Suspense) or mismatch hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVersion(wanted);
    }
  }, [initial.releases]);
  // The baked snapshot renders immediately; SWR then refreshes from the
  // per-release JSON the Pages workflow regenerates on a cron. Switching
  // releases fetches that release's file on demand.
  const { data, error, isValidating, mutate } = useSWR(`data/${version}.json`, fetchSnapshot, {
    fallbackData: version === initial.release.targetVersion ? initial : undefined,
    keepPreviousData: true,
    refreshInterval: SNAPSHOT_REFRESH_INTERVAL,
  });
  const snapshot = data ?? initial;
  const now = useHydratedClock(snapshot.generatedAt);
  const switchRelease = (v: string) => {
    setVersion(v);
    router.replace(v === initial.release.targetVersion ? "/" : `/?release=${v}`, { scroll: false });
  };
  const generated = new Date(snapshot.generatedAt);
  const today = snapshot.generatedAt.slice(0, 10);

  return (
    <main className="mx-auto my-3 flex w-[calc(100%_-_24px)] max-w-[1664px] flex-col overflow-hidden rounded-[28px] bg-card sm:my-6 sm:w-[calc(100%_-_48px)] sm:rounded-[40px]">
      <header className="flex flex-wrap items-center justify-between gap-x-8 gap-y-6 bg-muted px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
        <div className="flex items-center gap-3">
          <svg aria-hidden viewBox="0 0 24 24" className="size-11 shrink-0">
            <rect width="24" height="24" rx="12" fill="#171717" />
            <path d="M6 17V7h2.4l3.6 5.2L15.6 7H18v10h-2.3v-6.2L12 15.4 8.3 10.8V17H6z" fill="#fff" />
          </svg>
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Miden Release Dashboard</h1>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Where is {snapshot.release.name} across the dependency chain?
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Release
            <select
              value={version}
              onChange={(e) => switchRelease(e.target.value)}
              className="min-h-10 cursor-pointer rounded-full border bg-card px-4 py-2.5 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {snapshot.releases.map((r) => (
                <option key={r.targetVersion} value={r.targetVersion}>
                  v{r.targetVersion}
                  {r.isDefault ? " (current)" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="text-xs leading-relaxed text-muted-foreground sm:text-right">
            <div>
              Last refresh{" "}
              <time dateTime={snapshot.generatedAt}>
                {generated.toISOString().slice(11, 19)} UTC
              </time>
            </div>
            <RefreshStatus generatedAt={snapshot.generatedAt} />
          </div>
          <button
            type="button"
            disabled={isValidating}
            onClick={() => { void mutate().catch(() => undefined); }}
            className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/85 disabled:cursor-wait disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            <RefreshCw aria-hidden className="size-3.5" />
            {isValidating ? "Checking…" : "Check for updates"}
          </button>
        </div>
      </header>

      <div className="flex min-w-0 flex-col gap-10 px-5 py-7 sm:px-8 sm:py-8 lg:gap-12 lg:px-10">
      {error && (
        <p role="alert" className="rounded-lg border border-tone-amber/40 bg-tone-amber-bg px-4 py-2.5 text-sm text-tone-amber">
          Couldn’t check for newer data. Showing the last available snapshot. Use “Check for updates” to retry.
        </p>
      )}

      <ReleaseOverview snapshot={snapshot} />

      <Section title="Dependency map">
        <DependencyDag components={snapshot.components} rollups={snapshot.rollups} targetVersion={snapshot.release.targetVersion} generatedAt={snapshot.generatedAt} />
      </Section>

      <Section
        title="Release timing"
      >
        <ReleaseTimingPanel components={snapshot.components} generatedAt={snapshot.generatedAt} releaseVersion={snapshot.release.targetVersion} />
      </Section>

      <Section
        title="Developer experience"
      >
        <p className="text-sm text-muted-foreground">Docs, tutorials, templates, and Walnut surfaces for this release. Dependency alignment and publication are checked separately.</p>
        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {snapshot.components.filter((c) => c.group === "devex" || c.group === "walnut").map((c) => (
            <ComponentNode key={c.id} component={c} now={now} />
          ))}
        </div>
      </Section>

      <Section
        title="Release work"
        aside={
          <span className="flex flex-wrap items-center gap-2">
            <BlockerCounts blockers={snapshot.blockers} />
            <ManualBadge note="Work selection, classification and exit criteria are curated. Titles, assignees and state refresh from GitHub. Decision dates are shown only when explicitly set." />
          </span>
        }
      >
        <p className="text-sm text-muted-foreground">Only confirmed critical blockers gate readiness. Open follow-ups and migration PRs remain visible without implying that a shipped version is unreleased.</p>
        <BlockerList blockers={snapshot.blockers} today={today} />
      </Section>


      <footer className="border-t pt-5 text-xs leading-relaxed text-muted-foreground">
        Internal — automated data from GitHub and status.*.miden.io; manual data is badged.
        Edit <span className="font-mono">config/*.yaml</span> to update the monitored components and blockers.
      </footer>
      </div>
    </main>
  );
}
