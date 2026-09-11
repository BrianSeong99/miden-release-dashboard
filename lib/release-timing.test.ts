import { describe, expect, it } from "vitest";
import type { ComponentConfig } from "./schema";
import type { DocsSnapshot } from "./docs-snapshot";
import type { ComponentStatus, GhRelease, ReleaseHistory, ReleaseTiming, Result } from "./types";
import { derivePropagation, deriveReleaseTiming } from "./release-timing";

const asOf = "2026-09-11T12:00:00Z";
const success = <T,>(value: T): Result<T> => ({ ok: true, value, checkedAt: asOf });
const release = (tagName: string, publishedAt: string | null, prerelease = false): GhRelease => ({
  tagName, publishedAt, prerelease, htmlUrl: `https://github.com/x/y/releases/tag/${tagName}`,
});
const config = (over: Partial<ComponentConfig> = {}): ComponentConfig => ({
  id: "protocol", label: "Protocol", repo: "x/y", branch: "main", owner: "team",
  expectedVersion: "0.16", group: "chain", dependsOn: [], detectors: [{ type: "github-release" }], ...over,
});
const history = (releases: GhRelease[], complete = true): Result<ReleaseHistory> => success({ releases, complete });
const derive = (releases: GhRelease[], over: Partial<ComponentConfig> = {}, complete = true) =>
  deriveReleaseTiming(config(over), history(releases, complete), null, asOf);

describe("deriveReleaseTiming", () => {
  it("uses publication chronology rather than version order for latest and earliest stable", () => {
    const first = release("v0.16.1", "2026-09-02T12:00:00Z");
    const backport = release("v0.16.0", "2026-09-04T12:00:00Z");
    const next = release("v0.17.0-rc.1", "2026-09-03T12:00:00Z", true);
    const result = derive([next, backport, first]);
    expect(result.latest).toEqual(backport);
    expect(result.latestOnTrain).toEqual(backport);
    expect(result.firstStable).toEqual(first);
    expect(result.stableState).toBe("published");
    expect(result.history).toEqual([backport, first]);
  });

  it("reports the latest release across trains separately from the viewed train", () => {
    const current = release("v0.16.1", "2026-09-02T12:00:00Z");
    const next = release("v0.17.0-rc.1", "2026-09-04T12:00:00Z", true);
    const result = derive([current, next]);
    expect(result.latest).toEqual(next);
    expect(result.latestOnTrain).toEqual(current);
    expect(result.firstStable).toEqual(current);
  });

  it("requires both the GitHub flag and tag to be stable", () => {
    const result = derive([
      release("v0.16.0-rc.1", "2026-09-01T12:00:00Z", false),
      release("v0.16.0", "2026-09-02T12:00:00Z", true),
    ]);
    expect(result.stableState).toBe("unreleased");
    expect(result.firstStable).toBeNull();
  });

  it("filters debugger product tags before applying its independent version train", () => {
    const debuggerRelease = release("miden-debug-v0.10.3", "2026-09-02T12:00:00Z");
    const result = derive([
      debuggerRelease,
      release("sdk-v0.10.4", "2026-09-03T12:00:00Z"),
      release("templates-v9.0.0", null),
    ], { expectedVersion: "0.10.0", detectors: [{ type: "github-release", tagPrefixes: ["v", "miden-debug-v"] }] });
    expect(result.latest).toEqual(debuggerRelease);
    expect(result.firstStable).toEqual(debuggerRelease);
    expect(result.history).toEqual([debuggerRelease]);
  });

  it.each(["1.16.0", "0.17.0"])("uses the component's own %s version line", (version) => {
    const own = release(version, "2026-09-02T12:00:00Z");
    const result = derive([release("0.16.0", "2026-09-01T12:00:00Z"), own], { expectedVersion: version });
    expect(result.firstStable).toEqual(own);
  });

  it("can show available history but cannot prove first or latest publication from partial history", () => {
    const seen = release("v0.16.2", "2026-09-05T12:00:00Z");
    const result = deriveReleaseTiming(config(), success({ releases: [seen], complete: false, error: "Page limit" }), null, asOf);
    expect(result).toMatchObject({ historyComplete: false, stableState: "published", firstStable: null,
      latest: null, latestOnTrain: null, error: "Page limit" });
    expect(result.history).toEqual([seen]);
    expect(derive([], {}, false).stableState).toBe("unknown");
  });

  it.each([null, "invalid", "2026-09-12T12:00:00Z", "09/01/2026", "2026-09-01T12:00:00", "2026-02-30T12:00:00Z", "2026-02-29T12:00:00Z"])("does not infer earliest/latest timing when a relevant stable date is %s", (date) => {
    const valid = release("v0.16.2", "2026-09-05T12:00:00Z");
    const result = derive([valid, release("v0.16.0", date)]);
    expect(result.latest).toBeNull();
    expect(result.latestOnTrain).toBeNull();
    expect(result.firstStable).toBeNull();
    expect(result.history).toEqual([valid]);
    expect(derive([release("v0.16.0", date)]).stableState).toBe("unknown");
  });

  it("accepts real leap days and explicit timezone offsets without rewriting the source timestamp", () => {
    const valid = release("v0.16.0", "2024-02-29T23:30:00-02:00");
    const result = derive([valid]);
    expect(result.latest).toEqual(valid);
    expect(result.firstStable).toEqual(valid);
  });

  it.each(["09/11/2026", "2026-09-11T12:00:00", "2026-02-30T12:00:00Z"])("rejects an ambiguous or invalid observation time %s", (observation) => {
    const result = deriveReleaseTiming(config(), history([release("0.16.0", "2026-01-01T00:00:00Z")]), null, observation);
    expect(result).toMatchObject({ stableState: "unknown", firstStable: null, latest: null, latestOnTrain: null, history: [] });
  });

  it("keeps the first stable known when an unrelated train has a missing date", () => {
    const stable = release("v0.16.0", "2026-09-02T12:00:00Z");
    const result = derive([stable, release("v0.17.0", null)]);
    expect(result.latest).toBeNull();
    expect(result.latestOnTrain).toEqual(stable);
    expect(result.firstStable).toEqual(stable);
  });

  it("shows at most eight on-train entries without losing an older debut", () => {
    const releases = Array.from({ length: 10 }, (_, day) => release(`v0.16.${day}`, `2026-09-${String(day + 1).padStart(2, "0")}T12:00:00Z`));
    const result = derive(releases);
    expect(result.history.map((r) => r.tagName)).toEqual(["v0.16.9", "v0.16.8", "v0.16.7", "v0.16.6", "v0.16.5", "v0.16.4", "v0.16.3", "v0.16.2"]);
    expect(result.firstStable).toEqual(releases[0]);
  });

  it("does not guess a train when its target version is unconfirmed", () => {
    const result = derive([release("0.16.0", "2026-09-01T12:00:00Z")], { expectedVersion: null });
    expect(result.latest?.tagName).toBe("0.16.0");
    expect(result).toMatchObject({ firstStable: null, latestOnTrain: null, stableState: "unknown", history: [] });
  });

  it("marks failed release evidence unknown and non-release surfaces not monitored", () => {
    const failed = deriveReleaseTiming(config(), { ok: false, error: "Unavailable", checkedAt: asOf }, null, asOf);
    expect(failed).toMatchObject({ source: "github-release", stableState: "unknown", firstStable: null, error: "Unavailable" });
    const unmonitored = deriveReleaseTiming(config({ detectors: [{ type: "migration-pr", number: 17 }] }), null, null, asOf);
    expect(unmonitored).toMatchObject({ source: "not-monitored", stableState: "not-monitored", firstStable: null });
  });

  it("uses the latest docs deployment only as deployment evidence, never a debut", () => {
    const docs: DocsSnapshot = {
      version: "0.16", snapshotExists: true, published: true, publishedAt: "2026-09-10T12:00:00Z",
      snapshotUrl: "https://github.com/x/y/tree/sha/versioned_docs/version-0.16", deploymentUrl: "https://github.com/x/y/actions/runs/123",
    };
    const result = deriveReleaseTiming(config({ detectors: [{ type: "docs-snapshot", workflow: "deploy.yml" }] }), null, success(docs), asOf);
    expect(result).toMatchObject({ source: "docs-deployment", stableState: "not-monitored", firstStable: null });
    expect(result.latest).toMatchObject({ publishedAt: docs.publishedAt, htmlUrl: docs.deploymentUrl });
  });
});

const component = (id: string, dependsOn: string[], timing?: ReleaseTiming): ComponentStatus => ({
  id, label: id.toUpperCase(), repo: "x/y", branch: "main", owner: "team", expectedVersion: "0.16", group: "chain",
  dependsOn, status: "stable-released", tone: "green", manual: false, reason: "Published", latestStable: null, latestRc: null,
  matchedRelease: null, matchedPublishedAt: null, releaseTiming: timing, deps: [], evidence: [], blockerIds: [], errors: [],
});

describe("derivePropagation", () => {
  const upstream = derive([release("0.29.0", "2026-09-01T12:00:00Z")], { expectedVersion: "0.29" });
  const downstream = derive([release("0.16.0", "2026-09-03T12:00:00Z")]);

  it("measures calendar release gaps without comparing different components' version numbers", () => {
    const [edge] = derivePropagation([component("vm", [], upstream), component("protocol", ["vm"], downstream)], asOf);
    expect(edge).toMatchObject({ fromId: "vm", toId: "protocol", fromLabel: "VM", toLabel: "PROTOCOL", state: "released", elapsedMs: 172800000 });
    expect(edge.upstream?.tagName).toBe("0.29.0");
    expect(edge.downstream?.tagName).toBe("0.16.0");
  });

  it("preserves signed gaps when the downstream published first", () => {
    const [edge] = derivePropagation([component("a", [], downstream), component("b", ["a"], upstream)], asOf);
    expect(edge).toMatchObject({ state: "downstream-first", elapsedMs: -172800000 });
  });

  it("tracks waiting only when complete history confirms the downstream is unreleased", () => {
    const [waiting] = derivePropagation([component("a", [], upstream), component("b", ["a"], derive([]))], asOf);
    expect(waiting).toMatchObject({ state: "waiting", elapsedMs: 864000000 });
    const [unknown] = derivePropagation([component("a", [], upstream), component("b", ["a"], derive([], {}, false))], asOf);
    expect(unknown).toMatchObject({ state: "unknown", elapsedMs: null });
  });

  it("shows upstream pending when its complete history has no stable release", () => {
    const [edge] = derivePropagation([component("a", [], derive([])), component("b", ["a"], downstream)], asOf);
    expect(edge).toMatchObject({ state: "upstream-pending", elapsedMs: null });
  });

  it("does not manufacture gaps from partial history or legacy snapshots", () => {
    const partial = derive([release("0.16.0", "2026-09-02T12:00:00Z")], {}, false);
    for (const timing of [partial, undefined]) {
      const [edge] = derivePropagation([component("a", [], upstream), component("b", ["a"], timing)], asOf);
      expect(edge).toMatchObject({ state: "unknown", elapsedMs: null });
    }
  });

  it("does not calculate propagation for surfaces without stable release monitoring", () => {
    const timing = deriveReleaseTiming(config({ detectors: [{ type: "migration-pr", number: 17 }] }), null, null, asOf);
    const [edge] = derivePropagation([component("a", [], upstream), component("b", ["a"], timing)], asOf);
    expect(edge).toMatchObject({ state: "not-monitored", elapsedMs: null });
  });

  it("rejects dates later than the observation time", () => {
    const [edge] = derivePropagation([component("a", [], upstream), component("b", ["a"], downstream)], "2026-08-31T12:00:00Z");
    expect(edge).toMatchObject({ state: "unknown", elapsedMs: null });
  });

  it("does not calculate a gap using an observation time with no timezone", () => {
    const [edge] = derivePropagation([component("a", [], upstream), component("b", ["a"], downstream)], "2026-09-11T12:00:00");
    expect(edge).toMatchObject({ state: "unknown", elapsedMs: null });
  });
});
