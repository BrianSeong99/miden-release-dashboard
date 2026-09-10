import type { ComponentConfig, Detector } from "./schema";
import type { DocsSnapshot } from "./docs-snapshot";
import {
  beforeTrain,
  compareDesc,
  isPrerelease,
  matchesReleaseTag,
  normalizeVersion,
  onTrain,
} from "./semver-utils";
import type {
  BlockerView,
  ComponentStatus,
  DepFinding,
  DetectedVersion,
  EnvSnapshot,
  EnvStatusId,
  EnvStatusResult,
  GhRelease,
  Readiness,
  RepoStatusId,
  Result,
  RollupStatus,
  Tone,
} from "./types";

// Pure status derivation — no I/O. Evidence comes in as Results from the
// adapters; every rule that concludes something needs POSITIVE evidence.
// Missing evidence is "unknown", never a guess (PRD sections 6 and 12).

export const STATUS_TONE: Record<RepoStatusId, Tone> = {
  "stable-released": "green",
  "docs-published": "green",
  "snapshot-created": "amber",
  "awaiting-snapshot": "amber",
  "prerelease-deps": "amber",
  compatible: "green",
  "rc-released": "amber",
  migrating: "amber",
  "not-started": "amber",
  blocked: "red",
  unknown: "gray",
};

export const STATUS_LABEL: Record<RepoStatusId, string> = {
  "stable-released": "Stable released",
  "docs-published": "Published",
  "snapshot-created": "Snapshot created",
  "awaiting-snapshot": "Awaiting snapshot",
  "prerelease-deps": "Prerelease deps",
  "rc-released": "RC released",
  compatible: "Compatible",
  migrating: "Migrating",
  "not-started": "Not started",
  blocked: "Blocked",
  unknown: "Unknown",
};

export const ENV_TONE: Record<EnvStatusId, Tone> = {
  current: "green",
  partial: "amber",
  behind: "amber",
  ahead: "green",
  unknown: "gray",
};

/** Rank used for readiness roll-ups: how far along the release ladder. */
const STATUS_RANK: Record<RepoStatusId, number> = {
  "stable-released": 6,
  "docs-published": 6,
  "snapshot-created": 3,
  "awaiting-snapshot": 2,
  "prerelease-deps": 3,
  "rc-released": 5,
  compatible: 4,
  migrating: 3,
  "not-started": 2,
  blocked: 1,
  unknown: 0,
};

export interface ComponentEvidence {
  config: ComponentConfig;
  /** null when the component has no github-release detector. */
  releases: Result<GhRelease[]> | null;
  depFindings: Array<{ detector: Detector; result: Result<DetectedVersion> }>;
  /** Live state of a configured migration PR, when present. */
  migrationPrOpen: Result<boolean> | null;
  /** Snapshot contents plus deployment of those contents, for docs only. */
  docsSnapshot?: Result<DocsSnapshot> | null;
  /** Config blockers for this stage, joined with their live GitHub state. */
  blockers: BlockerView[];
  /** Release-wide target train, e.g. "0.16" — the default for dep detectors. */
  releaseTargetVersion: string;
}

function depDetectorTrain(detector: Detector, fallback: string): string | null {
  if ("targetTrain" in detector && detector.targetTrain !== undefined) return detector.targetTrain;
  return fallback;
}

/** Display names for roll-up groups (everything beyond chain/sdk/app). */
export const GROUP_LABELS: Record<string, string> = {
  devex: "DevEx",
  walnut: "Walnut",
};

function toFindings(e: ComponentEvidence): DepFinding[] {
  const findings: DepFinding[] = [];
  for (const { detector, result } of e.depFindings) {
    if (detector.type === "github-release" || detector.type === "docs-snapshot" || detector.type === "migration-pr" || detector.type === "manual-override") continue;
    const targetTrain = depDetectorTrain(detector, e.releaseTargetVersion);
    if (result.ok) {
      const normalized = result.value.raw !== null ? normalizeVersion(result.value.raw) : null;
      findings.push({
        label: result.value.source,
        version: normalized,
        raw: result.value.raw,
        targetTrain,
        provesComponent:
          "provesComponent" in detector ? detector.provesComponent : undefined,
        // Absent (raw null) is definitively not on target; an unparseable
        // version string yields no judgement.
        onTarget:
          result.value.raw === null ? false : normalized !== null && targetTrain !== null ? onTrain(normalized, targetTrain) : null,
        url: result.value.url,
      });
    } else {
      findings.push({
        label: detectorSummary(detector),
        version: null,
        raw: null,
        targetTrain,
        onTarget: null,
        url: null,
        error: result.error,
      });
    }
  }
  return findings;
}

function detectorSummary(d: Detector): string {
  switch (d.type) {
    case "cargo-dep":
    case "npm-dep":
      return `${d.dependency} (${d.path})`;
    case "yaml-manifest":
      return `${d.key} (${d.path})`;
    case "midenup-channel":
      return `channel ${d.channel} → ${d.component}`;
    case "submodule-dep":
      return `${d.dependency} (${d.submodulePath} submodule)`;
    default:
      return d.type;
  }
}

function pickReleases(releases: GhRelease[], expected: string | null) {
  const sorted = [...releases].sort((a, b) => compareDesc(a.tagName, b.tagName));
  const latestStable = sorted.find((r) => !r.prerelease && !isPrerelease(r.tagName)) ?? null;
  const latestRc = sorted.find((r) => r.prerelease || isPrerelease(r.tagName)) ?? null;
  // A stable anywhere on the target train proves the release shipped
  // (patch releases after the .0 must not un-ship it).
  const stableMatch = sorted.find(
    (r) => !r.prerelease && !isPrerelease(r.tagName) && onTrain(r.tagName, expected),
  );
  const rcOnTrain = sorted.find(
    (r) => (r.prerelease || isPrerelease(r.tagName)) && onTrain(r.tagName, expected),
  );
  return { latestStable, latestRc, stableMatch, rcOnTrain };
}

export function deriveComponentStatus(e: ComponentEvidence): ComponentStatus {
  const c = e.config;
  const deps = toFindings(e);
  const evidence: { label: string; url: string }[] = [];
  const errors: string[] = [];
  for (const f of deps) {
    if (f.error) errors.push(f.error);
  }
  if (e.releases && !e.releases.ok) errors.push(e.releases.error);
  if (e.migrationPrOpen && !e.migrationPrOpen.ok) errors.push(e.migrationPrOpen.error);
  if (e.docsSnapshot && !e.docsSnapshot.ok) errors.push(e.docsSnapshot.error);
  const docsSnapshot = e.docsSnapshot?.ok ? e.docsSnapshot.value : undefined;
  if (docsSnapshot) {
    evidence.push({ label: "Docs snapshot", url: docsSnapshot.snapshotUrl });
    if (docsSnapshot.deploymentUrl) {
      evidence.push({ label: "Docs deployment", url: docsSnapshot.deploymentUrl });
    }
  }
  for (const d of c.detectors) {
    if (d.type === "migration-pr") {
      evidence.push({ label: `Migration PR #${d.number}`, url: `https://github.com/${c.repo}/pull/${d.number}` });
    }
  }

  const releaseDetector = c.detectors.find((d) => d.type === "github-release");
  const releaseInfo = e.releases?.ok === true
    ? pickReleases(e.releases.value.filter((r) => matchesReleaseTag(r.tagName, releaseDetector?.tagPrefixes)), c.expectedVersion)
    : null;
  const latestStable = releaseInfo?.latestStable
    ? normalizeVersion(releaseInfo.latestStable.tagName)
    : null;
  const latestRc = releaseInfo?.latestRc ? normalizeVersion(releaseInfo.latestRc.tagName) : null;
  const matched = releaseInfo?.stableMatch ?? releaseInfo?.rcOnTrain ?? null;
  const matchedRelease = matched ? normalizeVersion(matched.tagName) : null;
  const matchedPublishedAt = matched?.publishedAt ?? null;
  if (releaseInfo?.latestStable) {
    evidence.push({ label: `release ${releaseInfo.latestStable.tagName}`, url: releaseInfo.latestStable.htmlUrl });
  }
  if (releaseInfo?.latestRc) {
    evidence.push({ label: `release ${releaseInfo.latestRc.tagName}`, url: releaseInfo.latestRc.htmlUrl });
  }

  const base: Omit<ComponentStatus, "status" | "tone" | "reason" | "manual"> = {
    id: c.id,
    label: c.label,
    repo: c.repo,
    branch: c.branch,
    owner: c.owner,
    expectedVersion: c.expectedVersion,
    group: c.group,
    dependsOn: c.dependsOn,
    latestStable,
    latestRc,
    matchedRelease: docsSnapshot?.published ? docsSnapshot.version : matchedRelease,
    matchedPublishedAt: docsSnapshot?.published ? docsSnapshot.publishedAt : matchedPublishedAt,
    docsSnapshot: c.detectors.some((d) => d.type === "docs-snapshot") ? docsSnapshot ?? null : undefined,
    deps,
    evidence,
    blockerIds: e.blockers.map((b) => b.id),
    errors,
  };

  const done = (status: RepoStatusId, reason: string, manual = false, manualNote?: string): ComponentStatus => ({
    ...base,
    status,
    tone: STATUS_TONE[status],
    reason,
    manual,
    manualNote,
  });

  // 1. Manual override — always visibly labelled, never mixed with automation.
  const override = c.detectors.find((d) => d.type === "manual-override");
  if (override && override.type === "manual-override") {
    return done(
      override.status,
      `Manually set by ${override.setBy} on ${override.setAt}`,
      true,
      override.note,
    );
  }

  // A docs target label is only intent. A snapshot must exist on the monitored
  // branch, and a successful Pages deployment must contain that snapshot.
  if (c.detectors.some((d) => d.type === "docs-snapshot")) {
    if (!docsSnapshot) return done("unknown", e.docsSnapshot?.ok === false
      ? e.docsSnapshot.error : "Docs snapshot evidence is unavailable");
    if (docsSnapshot.published) return done("docs-published", `Docs snapshot ${docsSnapshot.version} is published`);
    if (docsSnapshot.snapshotExists) return done("snapshot-created", `Docs snapshot ${docsSnapshot.version} exists; publication is pending`);
    if (e.migrationPrOpen?.ok === false) return done("unknown", e.migrationPrOpen.error);
    return done(
      e.migrationPrOpen?.ok && e.migrationPrOpen.value ? "migrating" : "awaiting-snapshot",
      `Docs snapshot ${docsSnapshot.version} has not been created${e.migrationPrOpen?.ok && e.migrationPrOpen.value ? "; migration PR is open" : ""}`,
    );
  }

  // 2. Blocked — an open critical blocker outranks any automated progress.
  //    A blocker whose live state could not be fetched is conservatively
  //    treated as still open (the pill itself shows "unknown").
  const active = e.blockers.filter(
    (b) => b.severity === "critical" && b.live.state !== "merged" && b.live.state !== "closed",
  );
  if (active.length > 0) {
    return done(
      "blocked",
      `${active.length} open critical blocker${active.length > 1 ? "s" : ""}: ${active
        .map((b) => b.id)
        .join(", ")}`,
    );
  }

  const succeeded = deps.filter((f) => f.onTarget !== null);
  const allOnTarget = deps.length > 0 && deps.every((f) => f.onTarget === true);
  const someOnTarget = succeeded.some((f) => f.onTarget === true);

  // 3. Stable released — a non-prerelease release matching the expected version.
  if (releaseInfo?.stableMatch) {
    return done("stable-released", `Stable ${releaseInfo.stableMatch.tagName} is published`);
  }

  // 4. RC released — an on-train prerelease, with no succeeded dep off-train.
  if (releaseInfo?.rcOnTrain && (succeeded.length === 0 || allOnTarget)) {
    return done("rc-released", `Prerelease ${releaseInfo.rcOnTrain.tagName} is published`);
  }

  // Failed required sources must not turn a partially checked dependency set
  // green, or imply a migration has not started.
  if (deps.some((f) => f.onTarget === null) || e.migrationPrOpen?.ok === false) {
    return done("unknown", errors[0] ?? (deps.some((f) => f.targetTrain === null)
      ? "A dependency target version is not yet confirmed" : "A dependency version could not be verified"));
  }

  // 5. Migrating — a configured migration PR is open, or deps straddle trains.
  if (e.migrationPrOpen?.ok === true && e.migrationPrOpen.value) {
    return done("migrating", "Migration PR is open");
  }
  if (someOnTarget && !allOnTarget) {
    return done("migrating", "Dependencies are split across release trains");
  }

  // 6. Compatible — every proven dependency is on the target train.
  if (allOnTarget) {
    if (c.expectedVersion === null) return done("unknown", "Target release version is not yet confirmed");
    const prereleases = succeeded.filter((f) => f.version && isPrerelease(f.version));
    if (prereleases.length > 0) {
      return done("prerelease-deps", `Dependencies still use prereleases: ${prereleases.map((f) => f.version).join(", ")}`);
    }
    return done(
      "compatible",
      "All monitored dependencies use stable versions on their target trains",
    );
  }

  // 7. Not started — positive evidence of only previous-train versions,
  //    or a healthy release list with nothing on the target train yet
  //    (the future-release view: releases exist, none for this train).
  if (
    succeeded.length > 0 &&
    succeeded.every(
      (f) => f.version === null || beforeTrain(f.version, f.targetTrain),
    )
  ) {
    return done(
      "not-started",
      succeeded.some((f) => f.version === null)
        ? "Target dependency versions are absent"
        : "Monitored dependencies still point at a previous release",
    );
  }
  if (succeeded.length === 0 && releaseInfo && e.releases?.ok && c.expectedVersion !== null) {
    return done("not-started", `No release on the ${c.expectedVersion} train yet`);
  }

  // 8. Unknown — the evidence needed to decide is missing.
  return done("unknown", errors[0] ?? "No usable evidence for this component");
}

export function deriveEnvStatus(input: {
  id: "devnet" | "testnet";
  label: string;
  statusUrl: string;
  snapshot: Result<EnvSnapshot>;
  expectedVersion: string;
  manualOverride?: {
    status: EnvStatusId;
    version?: string;
    note: string;
    setBy: string;
    observedAt: string;
  };
}): EnvStatusResult {
  const { id, label, statusUrl, snapshot, expectedVersion, manualOverride } = input;
  if (manualOverride) {
    return {
      id,
      label,
      status: manualOverride.status,
      tone: ENV_TONE[manualOverride.status],
      manual: true,
      manualNote: `${manualOverride.note} (reported by ${manualOverride.setBy}, ${manualOverride.observedAt})`,
      version: manualOverride.version ?? null,
      reason: "Manually reported",
      lastUpdated: null,
      checkedAt: snapshot.checkedAt,
      statusUrl,
    };
  }
  if (!snapshot.ok) {
    return {
      id,
      label,
      status: "unknown",
      tone: "gray",
      manual: false,
      version: null,
      reason: "Status endpoint unreachable",
      lastUpdated: null,
      checkedAt: snapshot.checkedAt,
      statusUrl,
      error: snapshot.error,
    };
  }
  const env = snapshot.value;
  const nodeVersion = env.nodeVersion ? normalizeVersion(env.nodeVersion) : null;
  const base = {
    id,
    label,
    manual: false as const,
    version: nodeVersion,
    lastUpdated: env.lastUpdated,
    checkedAt: snapshot.checkedAt,
    statusUrl,
  };
  if (!nodeVersion) {
    return { ...base, status: "unknown", tone: "gray", reason: "No node version reported" };
  }
  if (!onTrain(nodeVersion, expectedVersion)) {
    if (!beforeTrain(nodeVersion, expectedVersion)) {
      return {
        ...base,
        status: "ahead",
        tone: ENV_TONE.ahead,
        reason: `Node runs ${nodeVersion}, newer than the ${expectedVersion} train`,
      };
    }
    return {
      ...base,
      status: "behind",
      tone: ENV_TONE.behind,
      reason: `Node runs ${nodeVersion}, expected the ${expectedVersion} train`,
    };
  }
  // Node is on the target train; check the other version-reporting services.
  const offTrain = env.services.filter(
    (s) => s.version !== null && !onTrain(s.version, expectedVersion),
  );
  if (offTrain.length > 0) {
    return {
      ...base,
      status: "partial",
      tone: ENV_TONE.partial,
      reason: `Node on ${nodeVersion}; ${offTrain.map((s) => s.name).join(", ")} on an older train`,
    };
  }
  return { ...base, status: "current", tone: ENV_TONE.current, reason: `All services on ${nodeVersion}` };
}

/** Group roll-up (PRD section 9): red when any member is blocked, gray when
 * any cannot be verified, green when every member is at least compatible. */
export function deriveGroupRollup(children: ComponentStatus[], label = "DevEx", blockers: BlockerView[] = []): RollupStatus {
  const criticalBlocker = blockers.some((b) =>
    children.some((c) => c.id === b.stage) && b.severity === "critical" &&
    b.live.state !== "merged" && b.live.state !== "closed",
  );
  if (criticalBlocker || children.some((c) => c.status === "blocked")) {
    return { status: "blocked", tone: "red", reason: `A ${label} surface is blocked` };
  }
  if (children.some((c) => c.status === "unknown")) {
    return { status: "unknown", tone: "gray", reason: `A ${label} surface cannot be verified` };
  }
  if (children.every((c) => STATUS_RANK[c.status] >= STATUS_RANK.compatible)) {
    return { status: "compatible", tone: "green", reason: `Every ${label} surface is compatible` };
  }
  return { status: "in-progress", tone: "amber", reason: `${label} work is incomplete` };
}

export function deriveReadiness(
  components: ComponentStatus[],
  environments: EnvStatusResult[],
  openCriticalBlockers: number,
): Readiness {
  const releaseChain = components.filter((c) => !(c.group in GROUP_LABELS));
  const readyCount = releaseChain.filter((c) => STATUS_RANK[c.status] >=
    STATUS_RANK[c.group === "toolchain" ? "compatible" : "rc-released"]).length;
  const anyBlocked = openCriticalBlockers > 0 || components.some((c) => c.status === "blocked");
  const allReady =
    releaseChain.length > 0 &&
    readyCount === releaseChain.length &&
    // "ahead" means the release is deployed and already surpassed there.
    environments.every((e) => e.status === "current" || e.status === "ahead");
  return {
    level: anyBlocked ? "blocked" : allReady ? "ready" : "in-progress",
    readyCount,
    totalCount: releaseChain.length,
    criticalBlockerCount: openCriticalBlockers,
  };
}
