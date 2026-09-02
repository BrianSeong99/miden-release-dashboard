"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";
import type { BlockerView, DashboardSnapshot } from "@/lib/types";
import { BlockerList } from "./blocker-list";
import { DependencyDag } from "./dependency-dag";
import { ManualBadge } from "./manual-badge";
import { ReleaseOverview } from "./release-overview";
import { StaleBanner } from "./stale-banner";

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<DashboardSnapshot>);

function BlockerCounts({ blockers }: { blockers: BlockerView[] }) {
  const open = blockers.filter((b) => b.live.state === "open" || b.live.state === "unknown");
  const critical = open.filter((b) => b.severity === "critical").length;
  const resolved = blockers.length - open.length;
  return (
    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
      {critical} critical · {open.length - critical} other open · {resolved} resolved
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
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function DashboardClient({ initial }: { initial: DashboardSnapshot }) {
  const router = useRouter();
  const [version, setVersion] = useState(initial.release.targetVersion);
  // The server snapshot renders immediately; SWR then keeps the page inside
  // ~1 min of the server's shared per-release 5-minute cache without a
  // reload. Switching releases fetches that release's snapshot on demand.
  const { data, isLoading } = useSWR(`/api/status?release=${version}`, fetcher, {
    fallbackData: version === initial.release.targetVersion ? initial : undefined,
    keepPreviousData: true,
    refreshInterval: 60_000,
  });
  const snapshot = data ?? initial;
  const switchRelease = (v: string) => {
    setVersion(v);
    router.replace(v === initial.release.targetVersion ? "/" : `/?release=${v}`, { scroll: false });
  };
  const generated = new Date(snapshot.generatedAt);
  const today = snapshot.generatedAt.slice(0, 10);

  return (
    <main className="mx-auto flex max-w-[1600px] flex-col gap-8 px-4 py-6 md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Miden mark — the one place the raw brand orange lives. */}
          <svg aria-hidden viewBox="0 0 24 24" className="size-7 shrink-0">
            <rect width="24" height="24" rx="5" fill="#ff5500" />
            <path d="M6 17V7h2.4l3.6 5.2L15.6 7H18v10h-2.3v-6.2L12 15.4 8.3 10.8V17H6z" fill="#fff" />
          </svg>
          <div>
            <h1 className="text-xl font-semibold">Miden Release Dashboard</h1>
            <p className="text-xs text-muted-foreground">
              Where is {snapshot.release.name} across the dependency chain?
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Release
            <select
              value={version}
              onChange={(e) => switchRelease(e.target.value)}
              className="cursor-pointer rounded-lg border bg-card px-2.5 py-1.5 text-sm font-medium text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {snapshot.releases.map((r) => (
                <option key={r.targetVersion} value={r.targetVersion}>
                  v{r.targetVersion}
                  {r.isDefault ? " (current)" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="text-right text-xs text-muted-foreground">
            <div>
              Last refresh{" "}
              <time dateTime={snapshot.generatedAt} suppressHydrationWarning>
                {generated.toLocaleTimeString()}
              </time>
              {isLoading && " …"}
            </div>
            <div>auto-refreshes every 5 minutes</div>
          </div>
        </div>
      </header>

      <StaleBanner generatedAt={snapshot.generatedAt} />

      <ReleaseOverview snapshot={snapshot} />

      <Section title="Dependency chain">
        <DependencyDag components={snapshot.components} rollups={snapshot.rollups} targetVersion={snapshot.release.targetVersion} />
      </Section>

      <Section
        title="Release blockers"
        aside={
          <span className="flex items-center gap-2">
            <BlockerCounts blockers={snapshot.blockers} />
            <ManualBadge note="Curated in config/blockers.yaml — the State column is live from GitHub" />
          </span>
        }
      >
        <BlockerList blockers={snapshot.blockers} today={today} />
      </Section>


      <footer className="border-t pt-4 text-xs text-muted-foreground">
        Internal — automated data from GitHub and status.*.miden.io; manual data is badged.
        Edit <span className="font-mono">config/*.yaml</span> to update the monitored components and blockers.
      </footer>
    </main>
  );
}
