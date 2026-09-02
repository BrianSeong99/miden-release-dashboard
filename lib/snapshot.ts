import { unstable_cache } from "next/cache";
import { loadConfig } from "./config";
import { fetchEnvSnapshot } from "./environments";
import { err } from "./fetch-utils";
import { getIssueState, listReleases } from "./github";
import { runDepDetector } from "./manifests";
import type { Detector } from "./schema";
import {
  deriveComponentStatus,
  deriveDevexRollup,
  deriveEnvStatus,
  deriveReadiness,
} from "./status-engine";
import type {
  BlockerView,
  DashboardSnapshot,
  DetectedVersion,
  PioneerView,
  Result,
  Tone,
} from "./types";

// Orchestrator: fan out every automated source, isolate failures per source,
// hand the evidence to the pure status engine, and assemble the snapshot.
// One cache layer only: unstable_cache below owns the 5-minute window and all
// inner fetches are no-store (see fetch-utils.safeFetch).

const PIONEER_TONE: Record<PioneerView["status"], Tone> = {
  "on-track": "green",
  "at-risk": "amber",
  blocked: "red",
  done: "green",
};

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
  const config = loadConfig();
  const { defaultRelease, environments: envConfigs, releases } = config.release;
  const release =
    releases.find((r) => r.targetVersion === releaseVersion) ??
    releases.find((r) => r.targetVersion === defaultRelease) ??
    releases[0];
  const releaseBlockers = config.blockers.filter((b) => b.release === release.targetVersion);

  // ---- Blockers first: their live state feeds the component derivation. ----
  const blockerViews: BlockerView[] = await Promise.all(
    releaseBlockers.map(async (b): Promise<BlockerView> => {
      const live = await getIssueState(b.github.repo, b.github.number);
      return {
        id: b.id,
        title: b.title,
        severity: b.severity,
        stage: b.stage,
        blockingDependency: b.blockingDependency,
        owner: b.owner,
        exitCondition: b.exitCondition,
        nextDecisionDate: b.nextDecisionDate,
        notionUrl: b.notionUrl,
        url: live.ok
          ? live.value.htmlUrl
          : `https://github.com/${b.github.repo}/issues/${b.github.number}`,
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
      const migrationPr = c.detectors.find((d) => d.type === "migration-pr");
      const [releases, depFindings, migrationPrOpen] = await Promise.all([
        wantsReleases ? listReleases(c.repo) : Promise.resolve(null),
        Promise.all(
          c.detectors.filter(isDepDetector).map(async (detector) => ({
            detector: detector as Detector,
            result: await runDepDetector(c.repo, c.branch, detector),
          })),
        ),
        migrationPr && migrationPr.type === "migration-pr"
          ? getIssueState(c.repo, migrationPr.number).then(
              (r): Result<boolean> =>
                r.ok
                  ? { ok: true, value: r.value.state === "open", checkedAt: r.checkedAt }
                  : err(r.error),
            )
          : Promise.resolve(null),
      ]);
      return deriveComponentStatus({
        config: c,
        releases,
        depFindings: depFindings as Array<{ detector: Detector; result: Result<DetectedVersion> }>,
        migrationPrOpen,
        blockers: blockersByStage.get(c.id) ?? [],
        releaseTargetVersion: release.targetVersion,
      });
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

  const devexChildren = components.filter((c) => c.group === "devex");
  const openCritical = blockerViews.filter(
    (b) => b.severity === "critical" && b.live.state !== "merged" && b.live.state !== "closed",
  ).length;

  return {
    generatedAt: new Date().toISOString(),
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
    devexRollup: deriveDevexRollup(devexChildren),
    environments,
    blockers: blockerViews,
    pioneers: config.pioneers.map((p) => ({ ...p, tone: PIONEER_TONE[p.status] })),
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
