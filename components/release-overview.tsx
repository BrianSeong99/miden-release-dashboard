import { CircleAlert, Gauge, Network, Rocket, ShieldAlert } from "lucide-react";
import type { DashboardSnapshot } from "@/lib/types";
import { ManualBadge } from "./manual-badge";
import { StatusBadge } from "./status-badge";
import { isCriticalReleaseBlocker, isOpenWork } from "@/lib/release-work";

/** The weekly sync's first question is "what single thing do I chase?" —
 * answer it above the cards: the topologically-first blocked component
 * (components arrive upstream-first from config order), its open critical
 * blockers with owners, and the nearest decision date across open blockers. */
function NowBlocking({ snapshot }: { snapshot: DashboardSnapshot }) {
  const openBlockers = snapshot.blockers.filter(isOpenWork);
  const firstBlocked = snapshot.components.find((c) => c.status === "blocked");
  if (!firstBlocked) return null;
  const its = openBlockers.filter(
    (b) => b.stage === firstBlocked.id && isCriticalReleaseBlocker(b),
  );
  const owners = [...new Set(its.map((b) => b.owner).filter(Boolean))].join(", ");
  const nextDecision = openBlockers.map((b) => b.nextDecisionDate).filter((date): date is string => date !== null).sort()[0];
  const past = nextDecision !== undefined && nextDecision < snapshot.generatedAt.slice(0, 10);
  return (
    <div
      data-testid="now-blocking"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-tone-red-bg/70 px-5 py-4 text-sm leading-relaxed"
    >
      <CircleAlert aria-hidden className="size-4 shrink-0 text-tone-red" />
      <span className="font-semibold text-tone-red">Now blocking:</span>
      <span className="min-w-0 break-words">
        {firstBlocked.label} — {its.length} open critical{its.length === 1 ? "" : "s"}
        {owners && ` (${owners})`}
      </span>
      {its[0] && (
        <a href={its[0].url} target="_blank" rel="noreferrer" className="min-w-0 break-words text-brand underline-offset-4 hover:underline">
          {its[0].title.length > 60 ? `${its[0].title.slice(0, 60)}…` : its[0].title}
        </a>
      )}
      {nextDecision && (
        <span className={past ? "font-medium text-tone-red" : "text-muted-foreground"}>
          · next decision {nextDecision}
          {past && " (past due)"}
        </span>
      )}
    </div>
  );
}

const READINESS_LABEL = {
  blocked: { label: "Blocked", tone: "red" as const },
  "in-progress": { label: "In progress", tone: "amber" as const },
  ready: { label: "Ready", tone: "green" as const },
};

const ENV_LABEL = {
  current: "Current",
  partial: "Partial",
  behind: "Behind",
  ahead: "Ahead",
  unknown: "Unknown",
};

function Card({ title, icon, dark = false, children }: {
  title: string;
  icon: React.ReactNode;
  dark?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col rounded-[28px] p-6 ${dark ? "bg-[#171717] text-white" : "bg-muted"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className={`text-[13px] font-medium ${dark ? "text-white/65" : "text-muted-foreground"}`}>{title}</div>
        <span aria-hidden className={`flex size-9 shrink-0 items-center justify-center rounded-full ${dark ? "bg-white/10 text-accent" : "bg-card text-foreground"}`}>
          {icon}
        </span>
      </div>
      <div className="mt-6 flex flex-1 flex-col">{children}</div>
    </div>
  );
}

export function ReleaseOverview({ snapshot }: { snapshot: DashboardSnapshot }) {
  const r = READINESS_LABEL[snapshot.readiness.level];
  const readyPercent = snapshot.readiness.totalCount > 0
    ? Math.min(100, Math.max(0, snapshot.readiness.readyCount / snapshot.readiness.totalCount * 100))
    : 0;
  return (
    <div className="flex flex-col gap-5">
    <NowBlocking snapshot={snapshot} />
    <section aria-label="Release overview" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <Card title="Target release" icon={<Rocket className="size-4" />} dark>
        <div className="break-words text-[32px] leading-tight font-semibold tracking-tight">{snapshot.release.name}</div>
        <div className="mt-3 text-xs leading-relaxed text-white/65">
          {snapshot.release.targetDate ? `target ${snapshot.release.targetDate}` : "no target date set"}
        </div>
        <span aria-hidden className="mt-6 h-1 w-8 rounded-full bg-accent" />
      </Card>
      <Card title="Readiness" icon={<Gauge className="size-4" />}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="text-[32px] leading-tight font-semibold tracking-tight tabular-nums">
            {snapshot.readiness.readyCount}<span className="text-lg font-normal text-muted-foreground"> / {snapshot.readiness.totalCount}</span>
          </div>
          <StatusBadge tone={r.tone} label={r.label} />
        </div>
        <div role="progressbar" aria-label="Release and toolchain stages ready" aria-valuemin={0} aria-valuemax={100} aria-valuenow={readyPercent} aria-valuetext={`${snapshot.readiness.readyCount} of ${snapshot.readiness.totalCount} stages ready`} className="mt-4 h-1.5 overflow-hidden rounded-full bg-foreground/8">
          <div className="h-full rounded-full bg-accent" style={{ width: `${readyPercent}%` }} />
        </div>
        <div className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {snapshot.readiness.readyCount} of {snapshot.readiness.totalCount} release and toolchain stages
          ready · roll-up groups tracked separately
        </div>
      </Card>
      {snapshot.environments.map((env) => (
        <Card key={env.id} title={env.label} icon={<Network className="size-4" />}>
          <div className="min-w-0 break-all font-mono text-[26px] leading-tight font-semibold tracking-tight">{env.version ?? "—"}</div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge tone={env.tone} label={ENV_LABEL[env.status]} title={env.reason} />
            {env.manual && <ManualBadge note={env.manualNote} />}
          </div>
          <div className="mt-3 break-words text-xs leading-relaxed text-muted-foreground" title={env.error}>
            {env.reason}
          </div>
        </Card>
      ))}
      <Card title="Critical blockers" icon={<ShieldAlert className="size-4" />}>
        <div
          className={
            snapshot.readiness.criticalBlockerCount > 0
              ? "text-[32px] leading-tight font-semibold tracking-tight tabular-nums text-tone-red"
              : "text-[32px] leading-tight font-semibold tracking-tight tabular-nums text-tone-green"
          }
        >
          {snapshot.readiness.criticalBlockerCount}
        </div>
        <div className="mt-3 text-xs leading-relaxed text-muted-foreground">open, release-gating</div>
      </Card>
    </section>
    </div>
  );
}
