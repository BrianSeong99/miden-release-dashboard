import { unstable_cache } from "next/cache";
import { loadConfig } from "./config";
import { fetchEnvSnapshot } from "./environments";
import { getDocsSnapshot, type DocsSnapshot } from "./docs-snapshot";
import { err } from "./fetch-utils";
import { getIssueState, listReleaseHistory } from "./github";
import { runDepDetector } from "./manifests";
import type { BlockerConfig, Detector } from "./schema";
import { compareDesc } from "./semver-utils";
import { isCriticalReleaseBlocker } from "./release-work";
import { deriveReleaseTiming } from "./release-timing";
import {
  deriveComponentStatus,
  deriveGroupRollup,
  deriveEnvStatus,
  deriveReadiness,
  GROUP_LABELS,
} from "./status-engine";
import type {
  BlockerView,
  DashboardSnapshot,
  DetectedVersion,
  GroupRollupView,
  IssueLiveState,
  ReleaseHistory,
  Result,
} from "./types";

// Orchestrator: fan out every automated source, isolate failures per source,
// hand the evidence to the pure status engine, and assemble the snapshot.
// One cache layer only: unstable_cache below owns the 5-minute window and all
// inner fetches are no-store (see fetch-utils.safeFetch).

const isDepDetector = (
  d: Detector,
): d is Extract<
  Detector,
  { type: "cargo-dep" | "npm-dep" | "yaml-manifest" | "midenup-channel" | "submodule-dep" }
> =>
  d.type === "cargo-dep" ||
  d.type === "npm-dep" ||
  d.type === "yaml-manifest" ||
  d.type === "midenup-channel" ||
  d.type === "submodule-dep";

export async function buildSnapshot(releaseVersion?: string): Promise<DashboardSnapshot> {
  const generatedAt = new Date().toISOString();
  const config = loadConfig();
  const { defaultRelease, environments: envConfigs, releases } = config.release;
  const release =
    releases.find((r) => r.targetVersion === releaseVersion) ??
    releases.find((r) => r.targetVersion === defaultRelease) ??
    releases[0];
  const releaseBlockers = config.blockers.filter((b) => b.release === release.targetVersion);

  // Curated work and migration detectors can reference the same issue. Share
  // its evidence within this build, but fetch it anew for the next snapshot.
  const issueKey = (repo: string, number: number) => `${repo.toLowerCase()}#${number}`;
  const issueRequests = new Map<string, Promise<Result<IssueLiveState>>>();
  const getLiveIssue = (repo: string, number: number) => {
    const key = issueKey(repo, number);
    let request = issueRequests.get(key);
    if (!request) {
      request = getIssueState(repo, number);
      issueRequests.set(key, request);
    }
    return request;
  };
  const releaseRequests = new Map<string, Promise<Result<ReleaseHistory>>>();
  const getReleaseHistory = (repo: string) => {
    const key = repo.toLowerCase();
    let request = releaseRequests.get(key);
    if (!request) {
      request = listReleaseHistory(repo);
      releaseRequests.set(key, request);
    }
    return request;
  };

  // Migration PRs are inspectable work even when no one curated a separate
  // row. An open migration is not, by itself, a confirmed release gate.
  const releaseWork: BlockerConfig[] = [...releaseBlockers];
  const workRefs = new Set(releaseWork.map((b) => issueKey(b.github.repo, b.github.number)));
  for (const component of release.components) {
    for (const detector of component.detectors) {
      if (detector.type !== "migration-pr") continue;
      const key = issueKey(component.repo, detector.number);
      if (workRefs.has(key)) continue;
      workRefs.add(key);
      releaseWork.push({
        id: `migration-${component.id}-${detector.number}`,
        category: "migration",
        title: `${component.label} #${detector.number}`,
        severity: "medium",
        release: release.targetVersion,
        stage: component.id,
        owner: null,
        exitCondition: "Merge the migration PR; dependency and publication checks are tracked separately.",
        nextDecisionDate: null,
        github: { repo: component.repo, number: detector.number },
      });
    }
  }

  // ---- Work first: its live state feeds the component derivation. ----
  const blockerViews: BlockerView[] = await Promise.all(
    releaseWork.map(async (b): Promise<BlockerView> => {
      const live = await getLiveIssue(b.github.repo, b.github.number);
      return {
        id: b.id,
        category: b.category,
        kind: live.ok ? live.value.isPr ? "pull-request" : "issue" : "unknown",
        title: live.ok ? live.value.title : b.title,
        severity: b.severity,
        stage: b.stage,
        blockingDependency: b.blockingDependency,
        owner: live.ok ? live.value.assignees.join(", ") || null : b.owner,
        exitCondition: b.exitCondition,
        nextDecisionDate: b.nextDecisionDate,
        notionUrl: b.notionUrl,
        url: live.ok
          ? live.value.htmlUrl
          : `https://github.com/${b.github.repo}/${b.category === "migration" ? "pull" : "issues"}/${b.github.number}`,
        live: live.ok
          ? {
              state: live.value.merged ? "merged" : live.value.state === "open" ? "open" : "closed",
              checkedAt: live.checkedAt,
            }
          : { state: "unknown", error: live.error, checkedAt: live.checkedAt },
      };
    }),
  );
  const blockersByStage = new Map<string, BlockerView[]>();
  for (const b of blockerViews) {
    const list = blockersByStage.get(b.stage) ?? [];
    list.push(b);
    blockersByStage.set(b.stage, list);
  }

  // ---- Components: releases + dep detectors + migration PRs, all isolated. ----
  const components = await Promise.all(
    release.components.map(async (c) => {
      const wantsReleases = c.detectors.some((d) => d.type === "github-release");
      const migrationPrs = c.detectors.filter((d) => d.type === "migration-pr");
      const docsDetector = c.detectors.find((d) => d.type === "docs-snapshot");
      const [releaseHistory, depFindings, migrationPrOpen, docsSnapshot] = await Promise.all([
        wantsReleases ? getReleaseHistory(c.repo) : Promise.resolve(null),
        Promise.all(
          c.detectors.filter(isDepDetector).map(async (detector) => ({
            detector: detector as Detector,
            result: await runDepDetector(c.repo, c.branch, detector),
          })),
        ),
        migrationPrs.length > 0
          ? Promise.all(migrationPrs.map((d) => getLiveIssue(c.repo, d.number))).then((results): Result<boolean> => {
              const failure = results.find((r) => !r.ok);
              if (failure && !failure.ok) return err(failure.error);
              return { ok: true, value: results.some((r) => r.ok && r.value.isPr && r.value.state === "open"), checkedAt: results[0].checkedAt };
            })
          : Promise.resolve(null),
        docsDetector
          ? c.expectedVersion === null ? Promise.resolve(err<DocsSnapshot>("Docs target version is not configured"))
            : getDocsSnapshot(c.repo, c.branch, c.expectedVersion, docsDetector.workflow)
          : Promise.resolve(null),
      ]);
      const component = deriveComponentStatus({
        config: c,
        releases: releaseHistory?.ok ? { ...releaseHistory, value: releaseHistory.value.releases } : releaseHistory,
        releaseHistoryComplete: releaseHistory?.ok ? releaseHistory.value.complete : undefined,
        depFindings: depFindings as Array<{ detector: Detector; result: Result<DetectedVersion> }>,
        migrationPrOpen,
        docsSnapshot,
        blockers: blockersByStage.get(c.id) ?? [],
        releaseTargetVersion: release.targetVersion,
      });
      return { ...component, releaseTiming: deriveReleaseTiming(c, releaseHistory, docsSnapshot, generatedAt) };
    }),
  );

  // ---- Environments. ----
  const environments = await Promise.all(
    envConfigs.map(async (e) => {
      const expected = release.components.find((c) => c.id === e.expectedComponentId);
      const snapshot = await fetchEnvSnapshot(e.statusUrl);
      return deriveEnvStatus({
        id: e.id,
        label: e.label,
        statusUrl: e.statusUrl,
        snapshot,
        expectedVersion: expected?.expectedVersion ?? release.targetVersion,
        manualOverride: e.manualOverride,
      });
    }),
  );

  // RC-skew post-pass: a pin that is on-train but older than the newest
  // release of the component it tracks gets flagged (the layered-RC-skew
  // problem — every layer riding a different RC).
  const byId = new Map(components.map((c) => [c.id, c]));
  for (const c of components) {
    for (const f of c.deps) {
      if (!f.provesComponent || f.onTarget !== true || !f.version) continue;
      const upstream = byId.get(f.provesComponent);
      const newest = upstream?.matchedRelease ?? upstream?.latestRc ?? upstream?.latestStable;
      if (newest && compareDesc(f.version, newest) > 0) f.staleBehind = newest;
    }
  }

  const rollups: GroupRollupView[] = Object.entries(GROUP_LABELS)
    .filter(([group]) => components.some((c) => c.group === group))
    .map(([group, label]) => ({
      group,
      label,
      rollup: deriveGroupRollup(components.filter((c) => c.group === group), label, blockerViews),
    }));

  const openCritical = blockerViews.filter(isCriticalReleaseBlocker).length;

  return {
    generatedAt,
    release: {
      name: release.name,
      targetVersion: release.targetVersion,
      targetDate: release.targetDate,
    },
    releases: releases.map((r) => ({
      name: r.name,
      targetVersion: r.targetVersion,
      isDefault: r.targetVersion === defaultRelease,
    })),
    readiness: deriveReadiness(components, environments, openCritical),
    components,
    rollups,
    environments,
    blockers: blockerViews,
  };
}

/** The shared 5-minute cache both the page and /api/status read through —
 * one entry per release so switching versions never evicts the others. */
const cachedByRelease = new Map<string, () => Promise<DashboardSnapshot>>();
export function getSnapshot(releaseVersion?: string): Promise<DashboardSnapshot> {
  const key = releaseVersion ?? "default";
  let cached = cachedByRelease.get(key);
  if (!cached) {
    cached = unstable_cache(() => buildSnapshot(releaseVersion), ["dashboard-snapshot", key], {
      revalidate: 300,
    });
    cachedByRelease.set(key, cached);
  }
  return cached();
}
