import { describe, expect, it } from "vitest";
import type { ComponentConfig } from "./schema";
import type { DocsSnapshot } from "./docs-snapshot";
import {
  deriveComponentStatus,
  deriveGroupRollup,
  deriveEnvStatus,
  deriveReadiness,
  type ComponentEvidence,
} from "./status-engine";
import type { BlockerView, ComponentStatus, EnvSnapshot, GhRelease, Result } from "./types";

const at = "2026-08-31T12:00:00.000Z";
const okR = <T,>(value: T): Result<T> => ({ ok: true, value, checkedAt: at });
const errR = <T,>(error: string): Result<T> => ({ ok: false, error, checkedAt: at });

const baseConfig: ComponentConfig = {
  id: "node",
  label: "Node",
  repo: "0xMiden/node",
  branch: "next",
  owner: "Node team",
  expectedVersion: "0.16.0",
  group: "chain",
  dependsOn: ["protocol"],
  detectors: [{ type: "github-release" }],
};

const release = (tagName: string, prerelease: boolean): GhRelease => ({
  tagName,
  prerelease,
  publishedAt: null,
  htmlUrl: `https://github.com/0xMiden/node/releases/tag/${tagName}`,
});

const cargoDep = (dependency: string, targetTrain?: string) =>
  ({ type: "cargo-dep", path: "Cargo.toml", dependency, targetTrain }) as const;

const found = (raw: string) =>
  okR({ raw, source: "dep", url: "https://github.com/x/blob/main/Cargo.toml" });

const blocker = (severity: BlockerView["severity"], state: "open" | "merged" | "unknown"): BlockerView => ({
  id: "b1",
  title: "t",
  severity,
  category: "blocker",
  kind: "issue",
  stage: "node",
  owner: "o",
  exitCondition: "e",
  nextDecisionDate: "2026-09-03",
  url: "https://github.com/x",
  live: state === "unknown" ? { state, error: "boom", checkedAt: at } : { state, checkedAt: at },
});

function evidence(partial: Partial<ComponentEvidence>): ComponentEvidence {
  return {
    config: baseConfig,
    releases: null,
    depFindings: [],
    migrationPrOpen: null,
    blockers: [],
    releaseTargetVersion: "0.16",
    ...partial,
  };
}

describe("deriveComponentStatus precedence", () => {
  it("manual override wins over everything and is labelled manual", () => {
    const s = deriveComponentStatus(
      evidence({
        config: {
          ...baseConfig,
          detectors: [
            { type: "manual-override", status: "not-started", note: "n", setBy: "Brian", setAt: "2026-08-31" },
          ],
        },
        releases: okR([release("v0.16.0", false)]),
      }),
    );
    expect(s.status).toBe("not-started");
    expect(s.manual).toBe(true);
  });

  it("an open critical blocker outranks a stable release", () => {
    const s = deriveComponentStatus(
      evidence({
        releases: okR([release("v0.16.0", false)]),
        blockers: [blocker("critical", "open")],
      }),
    );
    expect(s.status).toBe("blocked");
    expect(s.tone).toBe("red");
  });

  it("a blocker with unknown live state is conservatively blocking", () => {
    const s = deriveComponentStatus(evidence({ blockers: [blocker("critical", "unknown")] }));
    expect(s.status).toBe("blocked");
  });

  it.each(["open", "unknown"] as const)("keeps %s critical follow-ups visible without declaring a released component blocked", (state) => {
    const followUp = { ...blocker("critical", state), category: "follow-up" as const };
    const s = deriveComponentStatus(evidence({ releases: okR([release("v0.16.0", false)]), blockers: [followUp] }));
    expect(s.status).toBe("stable-released");
    expect(s.blockerIds).toContain(followUp.id);
    expect(deriveGroupRollup([s], "SDK", [followUp]).status).toBe("compatible");
  });

  it("merged critical blockers and open high blockers do not block", () => {
    const s = deriveComponentStatus(
      evidence({
        releases: okR([release("v0.16.0", false)]),
        blockers: [blocker("critical", "merged"), blocker("high", "open")],
      }),
    );
    expect(s.status).toBe("stable-released");
  });

  it("does not infer compatibility when a migration-only PR is no longer open", () => {
    const s = deriveComponentStatus(evidence({
      config: { ...baseConfig, id: "agent-tools", group: "devex", dependsOn: [], detectors: [{ type: "migration-pr", number: 17 }] },
      migrationPrOpen: okR(false),
    }));
    expect(s.status).toBe("unknown");
  });

  it("a stable on a previous train does not count; the release list alone reads not-started", () => {
    const s = deriveComponentStatus(evidence({ releases: okR([release("v0.15.2", false)]) }));
    expect(s.status).toBe("not-started");
    expect(s.reason).toContain("0.16.0");
  });

  it("any stable on the target train proves the release shipped (patches included)", () => {
    const s = deriveComponentStatus(
      evidence({ releases: okR([release("v0.16.2", false), release("v0.16.0-rc.3", true)]) }),
    );
    expect(s.status).toBe("stable-released");
  });

  it("rc-released: on-train prerelease with on-train deps (exact-pin rc.4)", () => {
    const s = deriveComponentStatus(
      evidence({
        releases: okR([release("v0.16.0-rc.3", true), release("v0.15.2", false)]),
        depFindings: [{ detector: cargoDep("miden-protocol"), result: found("=0.16.0-rc.4") }],
      }),
    );
    expect(s.status).toBe("rc-released");
    expect(s.latestStable).toBe("0.15.2");
    expect(s.latestRc).toBe("0.16.0-rc.3");
  });

  it("wallet-style rc.0 on a 1.x train is an RC release", () => {
    const s = deriveComponentStatus(
      evidence({
        config: { ...baseConfig, expectedVersion: "1.16.0" },
        releases: okR([release("v1.16.0-rc.0", true)]),
      }),
    );
    expect(s.status).toBe("rc-released");
  });

  it("an off-train dep blocks rc-released and reads as migrating", () => {
    const s = deriveComponentStatus(
      evidence({
        releases: okR([release("v0.16.0-rc.1", true)]),
        depFindings: [
          { detector: cargoDep("miden-protocol"), result: found("0.16.0-rc.6") },
          { detector: cargoDep("miden-node-proto-build"), result: found("0.15.2") },
        ],
      }),
    );
    expect(s.status).toBe("migrating");
  });

  it("an open migration PR reads as migrating", () => {
    const s = deriveComponentStatus(evidence({ migrationPrOpen: okR(true) }));
    expect(s.status).toBe("migrating");
  });

  it("compatible: stable dependency versions on train with no release detector", () => {
    const s = deriveComponentStatus(
      evidence({
        config: { ...baseConfig, expectedVersion: "0.16" },
        depFindings: [
          {
            detector: { type: "yaml-manifest", path: "m.yml", key: "version" },
            result: found("0.16"),
          },
        ],
      }),
    );
    expect(s.status).toBe("compatible");
    expect(s.tone).toBe("green");
  });

  it("per-detector targetTrain preserves prerelease status across independent version trains", () => {
    const s = deriveComponentStatus(
      evidence({
        config: { ...baseConfig, expectedVersion: "1.16.0" },
        depFindings: [
          { detector: cargoDep("@miden-sdk/miden-sdk"), result: found("0.16.0-rc.5") },
          { detector: cargoDep("@openzeppelin/guardian-client", "0.17"), result: found("0.17.0-rc.1") },
        ],
      }),
    );
    expect(s.status).toBe("prerelease-deps");
    expect(s.tone).toBe("amber");
  });

  it("vm-edge targetTrain: protocol on miden-core 0.29 counts as on-target", () => {
    const s = deriveComponentStatus(
      evidence({
        releases: okR([release("v0.16.0-rc.7", true)]),
        depFindings: [{ detector: cargoDep("miden-core", "0.29"), result: found("0.29.1") }],
      }),
    );
    expect(s.status).toBe("rc-released");
  });

  it("absent dependencies are positive not-started evidence (future channels)", () => {
    const s = deriveComponentStatus(
      evidence({
        depFindings: [
          { detector: cargoDep("miden-client"), result: okR({ raw: null, source: "channel 0.17.0 \u2192 client", url: "https://x" }) },
        ],
      }),
    );
    expect(s.status).toBe("not-started");
    expect(s.reason).toContain("absent");
  });

  it("not-started needs positive evidence of previous-train versions", () => {
    const s = deriveComponentStatus(
      evidence({
        depFindings: [{ detector: cargoDep("miden-client"), result: found("0.15.3") }],
      }),
    );
    expect(s.status).toBe("not-started");
  });

  it("all sources failed is unknown, never a guess", () => {
    const s = deriveComponentStatus(
      evidence({
        releases: errR("GitHub 500"),
        depFindings: [{ detector: cargoDep("miden-protocol"), result: errR("timeout") }],
      }),
    );
    expect(s.status).toBe("unknown");
    expect(s.tone).toBe("gray");
    expect(s.errors.length).toBeGreaterThan(0);
  });
});

describe("docs publication and DevEx evidence", () => {
  const docsConfig = {
    ...baseConfig,
    id: "docs",
    label: "Docs",
    repo: "0xMiden/docs",
    branch: "main",
    expectedVersion: "0.16",
    group: "devex",
    detectors: [{ type: "docs-snapshot", workflow: "deploy-docs.yml" }],
  } as ComponentConfig;
  const snapshot: DocsSnapshot = {
    version: "0.16",
    snapshotExists: false,
    published: false,
    snapshotUrl: "https://github.com/0xMiden/docs/blob/main/versions.json",
    deploymentUrl: null,
    publishedAt: null,
  };
  const docsEvidence = (value = snapshot) => Object.assign(
    evidence({ config: docsConfig, migrationPrOpen: okR(true) }),
    { docsSnapshot: okR(value) },
  );

  it("does not count a next_version label as a published docs snapshot", () => {
    const e = docsEvidence();
    e.depFindings = [{
      detector: { type: "yaml-manifest", path: "release.yml", key: "next_version" },
      result: found("0.16"),
    }];
    const s = deriveComponentStatus(e);
    expect(s.status).toBe("migrating");
    expect(s.reason).toMatch(/snapshot.*0\.16|0\.16.*snapshot/i);
    expect(s.matchedRelease).toBeNull();
    expect(s.evidence).toContainEqual({ label: "Docs snapshot", url: snapshot.snapshotUrl });
  });

  it("keeps a created snapshot amber until a deployment contains it", () => {
    const s = deriveComponentStatus(docsEvidence({ ...snapshot, snapshotExists: true }));
    expect(s.status).toBe("snapshot-created");
    expect(s.tone).toBe("amber");
    expect(deriveGroupRollup([s]).tone).toBe("amber");
  });

  it("marks docs published only from confirmed snapshot deployment evidence", () => {
    const deploymentUrl = "https://github.com/0xMiden/docs/actions/runs/123";
    const s = deriveComponentStatus(docsEvidence({
      ...snapshot, snapshotExists: true, published: true,
      deploymentUrl, publishedAt: at,
    }));
    expect(s.status).toBe("docs-published");
    expect(s.tone).toBe("green");
    expect(s.matchedRelease).toBe("0.16");
    expect(s.matchedPublishedAt).toBe(at);
    expect(s.evidence).toContainEqual({ label: "Docs deployment", url: deploymentUrl });
    expect(deriveGroupRollup([s]).tone).toBe("green");
  });

  it("keeps docs unknown when the configured snapshot evidence is unavailable", () => {
    for (const docsSnapshot of [undefined, errR("deployment lookup failed")]) {
      const s = deriveComponentStatus(Object.assign(evidence({ config: docsConfig }), { docsSnapshot }));
      expect(s.status).toBe("unknown");
      expect(s.docsSnapshot).toBeNull();
    }
  });

  it.each(["0.16.0-alpha.1", "0.16.0-rc.1"])("does not call %s dependency pins stable-compatible", (version) => {
    const s = deriveComponentStatus(evidence({
      depFindings: [
        { detector: cargoDep("miden-client"), result: found(version) },
        { detector: cargoDep("miden-protocol"), result: found("0.16.0") },
      ],
    }));
    expect(s.status).toBe("prerelease-deps");
    expect(s.tone).toBe("amber");
    expect(s.reason).toContain(version);
    expect(deriveGroupRollup([s]).tone).toBe("amber");
  });

  it("does not infer compatibility from one successful dependency and one failed source", () => {
    const s = deriveComponentStatus(evidence({
      depFindings: [
        { detector: cargoDep("miden-client"), result: found("0.16.0") },
        { detector: cargoDep("miden-protocol"), result: errR("timeout") },
      ],
    }));
    expect(s.status).toBe("unknown");
  });

  it("does not call a migration unstarted when the PR lookup failed", () => {
    const s = deriveComponentStatus(evidence({
      migrationPrOpen: errR("migration lookup failed"),
      depFindings: [{ detector: cargoDep("miden-client"), result: found("0.15.0") }],
    }));
    expect(s.status).toBe("unknown");
    expect(s.errors).toContain("migration lookup failed");
  });
});

describe("deriveEnvStatus", () => {
  const snap = (nodeVersion: string | null, services: EnvSnapshot["services"] = []): Result<EnvSnapshot> =>
    okR({
      networkName: "Testnet",
      nodeVersion,
      blockProducerVersion: null,
      chainTip: 100,
      lastUpdated: at,
      services,
    });
  const base = { id: "testnet" as const, label: "Testnet", statusUrl: "https://s", expectedVersion: "0.16.0" };

  it("current when the node runs the expected train", () => {
    const r = deriveEnvStatus({ ...base, snapshot: snap("0.16.0-rc.3") });
    expect(r.status).toBe("current");
  });
  it("behind on an older train", () => {
    const r = deriveEnvStatus({ ...base, snapshot: snap("0.15.0") });
    expect(r.status).toBe("behind");
    expect(r.reason).toContain("0.15.0");
  });
  it("partial when another service lags the node", () => {
    const r = deriveEnvStatus({
      ...base,
      snapshot: snap("0.16.0-rc.3", [
        { name: "RPC", version: "0.16.0-rc.3", healthy: true },
        { name: "Remote Prover (1)", version: "0.15.2", healthy: true },
      ]),
    });
    expect(r.status).toBe("partial");
  });
  it("ahead when the environment runs a newer train than the viewed release", () => {
    const r = deriveEnvStatus({ ...base, expectedVersion: "0.15.0", snapshot: snap("0.16.0-rc.3") });
    expect(r.status).toBe("ahead");
    expect(r.reason).toContain("newer");
  });
  it("unknown on fetch failure, with the error surfaced", () => {
    const r = deriveEnvStatus({ ...base, snapshot: errR("boom") });
    expect(r.status).toBe("unknown");
    expect(r.error).toBe("boom");
  });
  it("manual override wins and is labelled", () => {
    const r = deriveEnvStatus({
      ...base,
      snapshot: errR("boom"),
      manualOverride: { status: "behind", note: "ops said so", setBy: "Brian", observedAt: "2026-08-30" },
    });
    expect(r.status).toBe("behind");
    expect(r.manual).toBe(true);
    expect(r.manualNote).toContain("ops said so");
  });
});

describe("roll-ups", () => {
  const child = (status: ComponentStatus["status"]): ComponentStatus =>
    ({ status, tone: "gray", group: "devex" }) as ComponentStatus;

  it("keeps publication factual while critical docs blockers prevent readiness", () => {
    const docs = { ...child("docs-published"), id: "docs" };
    const docsBlocker = { ...blocker("critical", "open"), stage: "docs" };
    expect(deriveGroupRollup([docs], "DevEx", [docsBlocker]).tone).toBe("red");
    expect(deriveGroupRollup([docs], "DevEx", [{ ...docsBlocker, stage: "wallet" }]).tone).toBe("green");
    const readyChain = { ...child("stable-released"), group: "chain" as const };
    expect(deriveReadiness([readyChain, docs], [{ status: "current" }] as never, 1).level).toBe("blocked");
  });

  it("devex: red > gray > green > amber precedence", () => {
    expect(deriveGroupRollup([child("blocked"), child("unknown")]).tone).toBe("red");
    expect(deriveGroupRollup([child("unknown"), child("compatible")]).tone).toBe("gray");
    expect(deriveGroupRollup([child("compatible"), child("stable-released")]).tone).toBe("green");
    expect(deriveGroupRollup([child("not-started"), child("compatible")]).tone).toBe("amber");
  });

  it("readiness counts the chain (devex excluded) and demands current envs", () => {
    const mk = (status: ComponentStatus["status"], group: ComponentStatus["group"]): ComponentStatus =>
      ({ status, tone: "gray", group }) as ComponentStatus;
    const envs = [{ status: "current" }, { status: "behind" }] as never;
    const r = deriveReadiness([mk("rc-released", "chain"), mk("not-started", "devex")], envs, 0);
    expect(r).toMatchObject({ level: "in-progress", readyCount: 1, totalCount: 1, criticalBlockerCount: 0 });
    const blocked = deriveReadiness([mk("blocked", "chain")], envs, 1);
    expect(blocked.level).toBe("blocked");
    const ready = deriveReadiness(
      [mk("stable-released", "chain")],
      [{ status: "current" }, { status: "current" }] as never,
      0,
    );
    expect(ready.level).toBe("ready");
  });
});
