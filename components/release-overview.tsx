import { CircleAlert } from "lucide-react";
import type { DashboardSnapshot } from "@/lib/types";
import { ManualBadge } from "./manual-badge";
import { StatusBadge } from "./status-badge";

/** The weekly sync's first question is "what single thing do I chase?" —
 * answer it above the cards: the topologically-first blocked component
 * (components arrive upstream-first from config order), its open critical
 * blockers with owners, and the nearest decision date across open blockers. */
function NowBlocking({ snapshot }: { snapshot: DashboardSnapshot }) {
  const openStates = new Set(["open", "unknown"]);
  const openBlockers = snapshot.blockers.filter((b) => openStates.has(b.live.state));
  const firstBlocked = snapshot.components.find((c) => c.status === "blocked");
  if (!firstBlocked) return null;
  const its = openBlockers.filter(
    (b) => b.stage === firstBlocked.id && b.severity === "critical",
  );
  const owners = [...new Set(its.map((b) => b.owner))].join(", ");
  const nextDecision = openBlockers.map((b) => b.nextDecisionDate).sort()[0];
  const past = nextDecision !== undefined && nextDecision < snapshot.generatedAt.slice(0, 10);
  return (
    <div
      data-testid="now-blocking"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-tone-red/30 bg-tone-red-bg px-4 py-2.5 text-sm"
    >
      <CircleAlert aria-hidden className="size-4 shrink-0 text-tone-red" />
      <span className="font-semibold text-tone-red">Now blocking:</span>
      <span>
        {firstBlocked.label} — {its.length} open critical{its.length === 1 ? "" : "s"}
        {owners && ` (${owners})`}
      </span>
      {its[0] && (
        <a href={its[0].url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-[13px] font-medium tracking-wide text-muted-foreground">{title}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

export function ReleaseOverview({ snapshot }: { snapshot: DashboardSnapshot }) {
  const r = READINESS_LABEL[snapshot.readiness.level];
  return (
    <div className="flex flex-col gap-3">
    <NowBlocking snapshot={snapshot} />
    <section aria-label="Release overview" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      <Card title="Target release">
        <div className="text-2xl font-semibold">{snapshot.release.name}</div>
        <div className="mt-1 text-xs text-muted-foreground">
          {snapshot.release.targetDate ? `target ${snapshot.release.targetDate}` : "no target date set"}
        </div>
      </Card>
      <Card title="Readiness">
        <div className="flex items-center gap-2">
          <StatusBadge tone={r.tone} label={r.label} />
        </div>
        <div className="mt-1.5 text-xs text-muted-foreground">
          {snapshot.readiness.readyCount} of {snapshot.readiness.totalCount} chain components at RC or
          later · roll-up groups tracked separately
        </div>
      </Card>
      {snapshot.environments.map((env) => (
        <Card key={env.id} title={env.label}>
          <div className="flex items-center gap-2">
            <span className="font-mono text-lg font-semibold">{env.version ?? "—"}</span>
            <StatusBadge tone={env.tone} label={ENV_LABEL[env.status]} title={env.reason} />
            {env.manual && <ManualBadge note={env.manualNote} />}
          </div>
          <div className="mt-1.5 text-xs text-muted-foreground" title={env.error}>
            {env.reason}
          </div>
        </Card>
      ))}
      <Card title="Critical blockers">
        <div
          className={
            snapshot.readiness.criticalBlockerCount > 0
              ? "text-2xl font-semibold text-tone-red"
              : "text-2xl font-semibold text-tone-green"
          }
        >
          {snapshot.readiness.criticalBlockerCount}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">open, release-gating</div>
      </Card>
    </section>
    </div>
  );
}
