import { describe, expect, it } from "vitest";
import type { BlockerView, ComponentStatus } from "./types";
import { buildWorkRows, filterAndSortWorkRows, type WorkTableOptions } from "./work-table";

const component = (id: string, over: Partial<ComponentStatus> = {}): ComponentStatus => ({
  id, label: id, repo: `0xMiden/${id}`, branch: "main", owner: "Component team", expectedVersion: "0.16",
  group: "devex", dependsOn: [], status: "migrating", tone: "amber", manual: false, reason: "Migration in progress",
  latestStable: null, latestRc: null, matchedRelease: null, matchedPublishedAt: null, deps: [], evidence: [], blockerIds: [], errors: [], ...over,
});
const work = (id: string, over: Partial<BlockerView> = {}): BlockerView => ({
  id, title: id, severity: "medium", category: "migration", kind: "pull-request", stage: "docs", owner: "brian",
  exitCondition: "Publish the updated snapshot", nextDecisionDate: null, url: `https://github.com/0xMiden/docs/pull/${id}`,
  live: { state: "open", checkedAt: "2026-09-11T12:00:00Z" }, ...over,
});
const defaults: WorkTableOptions = { view: "all", group: "all", type: "all", query: "", sort: "status", direction: "asc" };

describe("buildWorkRows", () => {
  it("preserves components without work and namespaces IDs that overlap with work IDs", () => {
    const components = [component("docs"), component("agent-tools")];
    const items = [work("docs")];
    const rows = buildWorkRows(components, items);
    expect(rows.map((r) => r.id)).toEqual(["component-docs", "component-agent-tools", "work-docs"]);
    expect(new Set(rows.map((r) => r.id)).size).toBe(3);
    expect(rows[0]).toMatchObject({ kind: "component", component: components[0], ownerLabel: "Owner", group: "devex", groupLabel: "DevEx" });
    expect(rows[2]).toMatchObject({ kind: "migration", work: items[0], component: components[0], ownerLabel: "Assignee", componentLabel: "docs" });
  });

  it("groups compiler/debugger and toolchain tools together while retaining all configured groups", () => {
    const rows = buildWorkRows([
      component("compiler", { group: "chain" }), component("debugger", { group: "chain" }),
      component("midenup", { group: "toolchain" }), component("protocol", { group: "chain" }),
      component("rust-sdk", { group: "sdk" }), component("wallet", { group: "app" }), component("playground", { group: "walnut" }),
    ], [work("compiler-update", { stage: "compiler" })]);
    expect(rows.filter((r) => r.group === "toolchain").map((r) => r.id)).toEqual([
      "component-compiler", "component-debugger", "component-midenup", "work-compiler-update",
    ]);
    expect(rows.map((r) => r.groupLabel)).toEqual(["Tooling", "Tooling", "Tooling", "Protocol", "SDKs", "Applications", "Walnut", "Tooling"]);
  });

  it("preserves unknown stages and falls back to follow-up for older snapshots without categories", () => {
    const item = work("external", { stage: "untracked-stage", owner: null, live: { state: "unknown", error: "GitHub unavailable", checkedAt: "2026-09-11T12:00:00Z" } });
    const legacy: Partial<BlockerView> = { ...item };
    delete legacy.category;
    const [row] = buildWorkRows([], [legacy as BlockerView]);
    expect(row).toMatchObject({ id: "work-external", kind: "follow-up", group: "other", groupLabel: "Other", componentId: "untracked-stage",
      componentLabel: "untracked-stage", owner: null, status: "Unknown", tone: "gray", active: true });
    expect(row.component).toBeUndefined();
  });

  it("uses publication/deployment dates for components and decision dates for work", () => {
    const rows = buildWorkRows([
      component("protocol", { matchedPublishedAt: "2026-09-01T12:00:00Z" }),
      component("docs", { matchedPublishedAt: "2026-09-02T12:00:00Z", status: "docs-published" }),
      component("bad-date", { matchedPublishedAt: "2026-02-30T12:00:00Z" }),
    ], [work("decision", { nextDecisionDate: "2026-09-15" }), work("invalid", { nextDecisionDate: "09/15/2026" })]);
    expect(rows.map((r) => [r.date, r.dateLabel])).toEqual([
      ["2026-09-01T12:00:00Z", "Released"], ["2026-09-02T12:00:00Z", "Latest deployment"], [null, "Released"],
      ["2026-09-15", "Decision date"], [null, "Decision date"],
    ]);
  });

  it("marks only stable, published, and compatible components inactive and preserves closed PR meaning", () => {
    const rows = buildWorkRows([
      component("stable", { status: "stable-released" }), component("published", { status: "docs-published" }),
      component("compatible", { status: "compatible" }), component("rc", { status: "rc-released" }), component("unknown", { status: "unknown" }),
    ], [work("closed-pr", { live: { state: "closed", checkedAt: "2026-09-11T12:00:00Z" } })]);
    expect(rows.map((r) => r.active)).toEqual([false, false, false, true, true, false]);
    expect(rows.at(-1)).toMatchObject({ status: "Closed, unmerged", tone: "gray" });
  });

  it("keeps work semantics independent of its associated component's readiness", () => {
    const published = component("docs", { status: "docs-published", owner: "Docs team", matchedPublishedAt: "2026-09-01T12:00:00Z" });
    const rows = buildWorkRows([published], [
      work("open", { owner: "assignee", nextDecisionDate: "2026-09-15" }),
      work("merged", { live: { state: "merged", checkedAt: "2026-09-11T12:00:00Z" } }),
    ]);
    expect(rows[1]).toMatchObject({ component: published, owner: "assignee", ownerLabel: "Assignee", active: true, date: "2026-09-15", dateLabel: "Decision date" });
    expect(filterAndSortWorkRows(rows, { ...defaults, view: "actions" }).map((r) => r.id)).toEqual(["work-open"]);
    expect(filterAndSortWorkRows(rows, { ...defaults, view: "history" }).map((r) => r.id)).toEqual(["work-merged"]);
    expect(filterAndSortWorkRows(rows, { ...defaults, view: "components" }).map((r) => r.id)).toEqual(["component-docs"]);
  });
});

describe("filterAndSortWorkRows", () => {
  const rows = buildWorkRows([
    component("docs", { label: "Documentation", owner: "Docs team" }),
    component("compiler", { group: "chain", label: "Compiler", owner: "Paul", status: "unknown", tone: "gray" }),
    component("wallet", { group: "app", label: "Wallet", status: "stable-released", tone: "green", matchedRelease: "1.16.0" }),
  ], [
    work("migration", { title: "Refresh examples", blockingDependency: "Tutorial bank examples" }),
    work("closed", { title: "Merged release notes", category: "follow-up", live: { state: "merged", checkedAt: "2026-09-11T12:00:00Z" } }),
    work("gate", { stage: "compiler", title: "Confirm target", category: "blocker", owner: null }),
  ]);

  it("combines view, group, type, and case-insensitive multi-field search", () => {
    const result = filterAndSortWorkRows(rows, { ...defaults, view: "actions", group: "devex", type: "migration", query: "  BANK BRIAN  " });
    expect(result.map((r) => r.id)).toEqual(["work-migration"]);
    expect(filterAndSortWorkRows(rows, { ...defaults, view: "components", type: "migration" })).toEqual([]);
    expect(filterAndSortWorkRows(rows, { ...defaults, view: "history" }).map((r) => r.id)).toEqual(["work-closed"]);
    expect(filterAndSortWorkRows(rows, { ...defaults, view: "actions" }).map((r) => r.id)).not.toContain("component-wallet");
  });

  it("searches versions, status, component labels, and exit criteria; clearing filters restores every row", () => {
    expect(filterAndSortWorkRows(rows, { ...defaults, query: "1.16.0" }).map((r) => r.id)).toEqual(["component-wallet"]);
    expect(filterAndSortWorkRows(rows, { ...defaults, query: "documentation snapshot" }).map((r) => r.id)).toEqual(["work-migration", "work-closed"]);
    expect(filterAndSortWorkRows(rows, { ...defaults, query: "UNKNOWN TOOLING" }).map((r) => r.id)).toEqual(["component-compiler"]);
    expect(filterAndSortWorkRows(rows, { ...defaults, query: "no-such-item" })).toEqual([]);
    expect(filterAndSortWorkRows(rows, defaults)).toHaveLength(6);
  });

  it("orders statuses by attention priority rather than alphabetically", () => {
    const sorted = filterAndSortWorkRows(rows, defaults);
    expect(sorted.map((r) => r.id)).toEqual(["work-gate", "component-compiler", "work-migration", "component-docs", "component-wallet", "work-closed"]);
    expect(filterAndSortWorkRows(rows, { ...defaults, direction: "desc" }).map((r) => r.id)).toEqual([...sorted].reverse().map((r) => r.id));
  });

  it("sorts by human-facing labels and uses IDs to break equal-label ties consistently", () => {
    const sameTitles = buildWorkRows([component("z", { label: "Same" }), component("a", { label: "same" })], []);
    expect(filterAndSortWorkRows(sameTitles, { ...defaults, sort: "title" }).map((r) => r.id)).toEqual(["component-a", "component-z"]);
    expect(filterAndSortWorkRows(sameTitles, { ...defaults, sort: "title", direction: "desc" }).map((r) => r.id)).toEqual(["component-a", "component-z"]);
    expect(filterAndSortWorkRows(rows, { ...defaults, view: "components", sort: "group" }).map((r) => r.groupLabel)).toEqual(["Applications", "DevEx", "Tooling"]);
  });

  it.each(["asc", "desc"] as const)("keeps missing owners/dates last when sorting %s and never mutates input", (direction) => {
    const input = buildWorkRows([], [
      work("missing", { owner: null }), work("late", { owner: "Zoe", nextDecisionDate: "2026-09-20" }),
      work("early", { owner: "Alice", nextDecisionDate: "2026-09-01" }), work("invalid", { owner: "", nextDecisionDate: "2026-02-30" }),
    ]);
    const before = JSON.stringify(input);
    Object.freeze(input);
    const expected = direction === "asc" ? ["work-early", "work-late", "work-invalid", "work-missing"] : ["work-late", "work-early", "work-invalid", "work-missing"];
    expect(filterAndSortWorkRows(input, { ...defaults, sort: "owner", direction }).map((r) => r.id)).toEqual(expected);
    expect(filterAndSortWorkRows(input, { ...defaults, sort: "date", direction }).map((r) => r.id)).toEqual(expected);
    expect(JSON.stringify(input)).toBe(before);
  });
});
