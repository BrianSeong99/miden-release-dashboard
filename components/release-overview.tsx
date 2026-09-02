import type { DashboardSnapshot } from "@/lib/types";
import { ManualBadge } from "./manual-badge";
import { StatusBadge } from "./status-badge";

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
          {snapshot.readiness.readyCount} of {snapshot.readiness.totalCount} chain components at RC or later
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
  );
}
