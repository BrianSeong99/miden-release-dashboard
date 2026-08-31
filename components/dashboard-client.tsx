"use client";

import useSWR from "swr";
import type { DashboardSnapshot } from "@/lib/types";
import { BlockerList } from "./blocker-list";
import { DependencyGraph } from "./dependency-graph";
import { ManualBadge } from "./manual-badge";
import { PioneerList } from "./pioneer-list";
import { ReleaseOverview } from "./release-overview";
import { StaleBanner } from "./stale-banner";

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<DashboardSnapshot>);

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
  // The server snapshot renders immediately; SWR then keeps the page inside
  // ~1 min of the server's shared 5-minute cache without a reload.
  const { data } = useSWR("/api/status", fetcher, {
    fallbackData: initial,
    refreshInterval: 60_000,
  });
  const snapshot = data ?? initial;
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
        <div className="text-right text-xs text-muted-foreground">
          <div>
            Last refresh{" "}
            <time dateTime={snapshot.generatedAt} suppressHydrationWarning>
              {generated.toLocaleTimeString()}
            </time>
          </div>
          <div>auto-refreshes every 5 minutes</div>
        </div>
      </header>

      <StaleBanner generatedAt={snapshot.generatedAt} />

      <ReleaseOverview snapshot={snapshot} />

      <Section title="Dependency chain">
        <DependencyGraph components={snapshot.components} devexRollup={snapshot.devexRollup} />
      </Section>

      <Section title="Critical blockers">
        <BlockerList blockers={snapshot.blockers} today={today} />
      </Section>

      <div className="rounded-xl bg-muted/60 p-4 md:p-6">
        <Section title="Pioneers" aside={<ManualBadge note="Curated by hand in config/pioneers.yaml" />}>
          <PioneerList pioneers={snapshot.pioneers} />
        </Section>
      </div>

      <footer className="border-t pt-4 text-xs text-muted-foreground">
        Internal — automated data from GitHub and status.*.miden.io; manual data is badged.
        Edit <span className="font-mono">config/*.yaml</span> to update blockers and Pioneers.
      </footer>
    </main>
  );
}
