// Domain types shared across adapters, the status engine, and the UI.
// Config-file types live in schema.ts (inferred from Zod); these are the
// runtime/evidence shapes.

export type RepoStatusId =
  | "stable-released"
  | "rc-released"
  | "compatible"
  | "migrating"
  | "not-started"
  | "blocked"
  | "unknown";

export type EnvStatusId = "current" | "partial" | "behind" | "ahead" | "unknown";

/** Traffic-light tone every status maps onto (PRD section 5B). */
export type Tone = "green" | "amber" | "red" | "gray";

/** Every adapter returns a Result and never throws — one failed source must
 * not break the dashboard (PRD section 12). */
export type Result<T> =
  | { ok: true; value: T; checkedAt: string }
  | { ok: false; error: string; checkedAt: string };

export interface GhRelease {
  tagName: string;
  prerelease: boolean;
  publishedAt: string | null;
  htmlUrl: string;
}

export interface IssueLiveState {
  state: "open" | "closed";
  merged: boolean;
  isPr: boolean;
  title: string;
  htmlUrl: string;
}

/** A version a detector extracted, with provenance for the evidence link. */
export interface DetectedVersion {
  /** Raw string as found in the manifest (may carry `=` pins, bare "0.15"…).
   * null means the manifest was fetched but the dependency/key/channel is
   * ABSENT — positive evidence of "not started" (PRD section 6). */
  raw: string | null;
  /** Where it came from, e.g. "Cargo.toml → miden-core". */
  source: string;
  /** Browsable evidence URL (blob on the monitored branch). */
  url: string;
}

export interface EnvService {
  name: string;
  version: string | null;
  healthy: boolean | null;
}

export interface EnvSnapshot {
  networkName: string | null;
  nodeVersion: string | null;
  blockProducerVersion: string | null;
  chainTip: number | null;
  /** Unix seconds from the monitor, ISO-formatted. */
  lastUpdated: string | null;
  services: EnvService[];
}

// ---- Derived (status-engine output) ----

export interface DepFinding {
  /** Human label, e.g. "miden-protocol (Cargo.toml)". */
  label: string;
  /** Normalized version, null when the detector failed. */
  version: string | null;
  raw: string | null;
  /** Train the finding is compared against, e.g. "0.16". */
  targetTrain: string;
  /** null = detector failed, so no judgement. */
  onTarget: boolean | null;
  /** Dashboard component this pin tracks (for RC-skew detection). */
  provesComponent?: string;
  /** Set when the pin is on-train but an upstream release is newer —
   * the layered-RC-skew signal (pin rc.4 while rc.7 is out). */
  staleBehind?: string;
  url: string | null;
  error?: string;
}

export interface ComponentStatus {
  id: string;
  label: string;
  repo: string;
  branch: string;
  owner: string;
  expectedVersion: string;
  group: "chain" | "sdk" | "app" | "devex" | "walnut";
  dependsOn: string[];
  status: RepoStatusId;
  tone: Tone;
  /** True when the status comes from a manual override in config. */
  manual: boolean;
  manualNote?: string;
  reason: string;
  latestStable: string | null;
  latestRc: string | null;
  /** The release/RC on THIS view's target train, when one exists. */
  matchedRelease: string | null;
  /** When the matched release was published (for "rc.7 · 3d ago"). */
  matchedPublishedAt: string | null;
  deps: DepFinding[];
  evidence: { label: string; url: string }[];
  blockerIds: string[];
  errors: string[];
}

export interface EnvStatusResult {
  id: "devnet" | "testnet";
  label: string;
  status: EnvStatusId;
  tone: Tone;
  manual: boolean;
  manualNote?: string;
  version: string | null;
  reason: string;
  lastUpdated: string | null;
  checkedAt: string;
  statusUrl: string;
  error?: string;
}

export interface RollupStatus {
  status: RepoStatusId | "in-progress";
  tone: Tone;
  reason: string;
}

/** A roll-up node on the DAG (DevEx, Walnut, …) aggregating one group. */
export interface GroupRollupView {
  group: string;
  label: string;
  rollup: RollupStatus;
}

export interface BlockerView {
  id: string;
  title: string;
  severity: "critical" | "high" | "medium";
  stage: string;
  blockingDependency?: string;
  owner: string;
  exitCondition: string;
  nextDecisionDate: string;
  url: string;
  notionUrl?: string;
  live:
    | { state: "open" | "merged" | "closed"; checkedAt: string }
    | { state: "unknown"; error: string; checkedAt: string };
}

export interface Readiness {
  level: "blocked" | "in-progress" | "ready";
  readyCount: number;
  totalCount: number;
  criticalBlockerCount: number;
}

export interface ReleaseOption {
  name: string;
  targetVersion: string;
  isDefault: boolean;
}

export interface DashboardSnapshot {
  generatedAt: string;
  release: { name: string; targetVersion: string; targetDate: string | null };
  /** Every release the dashboard can render, for the switcher. */
  releases: ReleaseOption[];
  readiness: Readiness;
  components: ComponentStatus[];
  rollups: GroupRollupView[];
  environments: EnvStatusResult[];
  blockers: BlockerView[];
}

