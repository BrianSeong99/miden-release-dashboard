// Domain types shared across adapters, the status engine, and the UI.
// Config-file types live in schema.ts (inferred from Zod); these are the
// runtime/evidence shapes.
import type { DocsSnapshot } from "./docs-snapshot";

export type RepoStatusId =
  | "stable-released"
  | "docs-published"
  | "snapshot-created"
  | "awaiting-snapshot"
  | "prerelease-deps"
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

export interface ReleaseHistory {
  releases: GhRelease[];
  complete: boolean;
  error?: string;
}

/** Publication chronology, separate from the status engine's version ordering. */
export interface ReleaseTiming {
  source: "github-release" | "docs-deployment" | "not-monitored";
  historyComplete: boolean;
  latest: GhRelease | null;
  latestOnTrain: GhRelease | null;
  firstStable: GhRelease | null;
  stableState: "published" | "unreleased" | "unknown" | "not-monitored";
  history: GhRelease[];
  error?: string;
}

/** Calendar gap between stable publications on a configured dependency edge.
 * This is not proof of the downstream release's dependency adoption date. */
export interface PropagationTiming {
  fromId: string;
  toId: string;
  fromLabel: string;
  toLabel: string;
  upstream: GhRelease | null;
  downstream: GhRelease | null;
  state: "released" | "waiting" | "downstream-first" | "upstream-pending" | "not-monitored" | "unknown";
  elapsedMs: number | null;
}

export interface IssueLiveState {
  state: "open" | "closed";
  merged: boolean;
  isPr: boolean;
  title: string;
  htmlUrl: string;
  assignees: string[];
  workflow?: WorkEvidence;
}

export interface WorkEvidence {
  draft: boolean;
  reviewers: string[];
  checks: "passing" | "failing" | "pending" | "unknown";
  openedAt: string | null;
  readyAt: string | null;
  mergedAt: string | null;
  error?: string;
}

export interface Handoff {
  nextAction: string;
  waitingOn: string | null;
  blocksOutcome: string;
  confirmedBy: string;
  confirmedAt: string;
  evidenceUrl: string;
}

export interface DistributionEvidence {
  state: "published" | "pending" | "unknown";
  reason: string;
  sourceUrl: string;
  publishedUrl: string;
  channel: string;
  changes: string[];
}

/** A version a detector extracted, with provenance for the evidence link. */
export interface DetectedVersion {
  /** Raw string as found in the manifest (may carry `=` pins, bare "0.15"…).
   * null means the manifest was fetched but the dependency/key/channel is
   * ABSENT — positive evidence of "not started" (PRD section 6). */
  raw: string | null;
  resolution?: "locked" | "exact" | "range";
  resolvedVersion?: string | null;
  resolutionUrl?: string;
  resolutionNote?: string;
  /** Where it came from, e.g. "Cargo.toml → miden-core". */
  source: string;
  /** Browsable evidence URL (blob on the monitored branch). */
  url: string;
}

export interface EnvService {
  name: string;
  version: string | null;
  healthy: boolean | null;
  probe?: "healthy" | "unhealthy" | "unknown";
  probeError?: string;
  expectedVersion?: string | null;
  onTarget?: boolean | null;
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
  resolution?: "locked" | "exact" | "range";
  resolvedVersion?: string | null;
  resolutionUrl?: string;
  resolutionNote?: string;
  /** Train the finding is compared against, e.g. "0.16". */
  targetTrain: string | null;
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
  expectedVersion: string | null;
  group: "chain" | "sdk" | "app" | "toolchain" | "devex" | "walnut";
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
  /** Optional while old static snapshots may still be cached by an open tab. */
  releaseTiming?: ReleaseTiming;
  dependencyRef?: { kind: "release" | "development" | "distribution"; ref: string; url: string };
  distribution?: DistributionEvidence;
  verification?: { status: "passed" | "failed"; version: string; environment: string; observedAt: string; confirmedBy: string; evidenceUrl: string };
  /** Versioned docs evidence; null means lookup failed, absent means not monitored. */
  docsSnapshot?: DocsSnapshot | null;
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
  services?: EnvService[];
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
  /** Only explicitly confirmed blockers gate readiness; open work alone does not. */
  category: "blocker" | "follow-up" | "migration";
  kind: "issue" | "pull-request" | "unknown";
  stage: string;
  blockingDependency?: string;
  owner: string | null;
  exitCondition: string;
  nextDecisionDate: string | null;
  url: string;
  notionUrl?: string;
  gateScope?: "release" | "outcome";
  handoff?: Handoff;
  workflow?: WorkEvidence;
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
