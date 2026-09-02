import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";
import { BlockersFileSchema, BlockerSchema, PioneerSchema, PioneersFileSchema, ReleaseConfigSchema, crossValidate } from "./schema";

const validBlocker = {
  id: "b1",
  title: "t",
  severity: "critical",
  release: "0.16",
  stage: "node",
  owner: "o",
  exitCondition: "merged",
  nextDecisionDate: "2026-09-03",
  github: { repo: "0xMiden/node", number: 1 },
};

describe("BlockerSchema required fields", () => {
  for (const field of ["owner", "exitCondition", "nextDecisionDate"] as const) {
    it(`rejects a blocker without ${field}`, () => {
      const rest: Record<string, unknown> = { ...validBlocker };
      delete rest[field];
      const res = BlockerSchema.safeParse(rest);
      expect(res.success).toBe(false);
      if (res.success) return;
      expect(JSON.stringify(res.error.issues)).toContain(field);
    });
  }
  it("accepts a complete blocker", () => {
    expect(BlockerSchema.safeParse(validBlocker).success).toBe(true);
  });
  it("rejects unknown keys (typo protection)", () => {
    expect(BlockerSchema.safeParse({ ...validBlocker, ownr: "x" }).success).toBe(false);
  });
});

describe("crossValidate", () => {
  const component = (id: string, dependsOn: string[] = []) => ({
    id,
    label: id,
    repo: "0xMiden/node",
    branch: "next",
    owner: "o",
    expectedVersion: "0.16.0",
    group: "chain",
    dependsOn,
    detectors: [{ type: "github-release" }],
  });
  const releaseConfig = (components: unknown[]) =>
    ReleaseConfigSchema.parse({
      defaultRelease: "0.16",
      environments: [
        { id: "devnet", label: "DevNet", statusUrl: "https://x/status", expectedComponentId: "node" },
      ],
      releases: [{ name: "r", targetVersion: "0.16", components }],
    });

  it("names unknown stages, releases and duplicate ids", () => {
    const problems = crossValidate({
      release: releaseConfig([component("node")]),
      blockers: [
        BlockerSchema.parse(validBlocker),
        BlockerSchema.parse({ ...validBlocker, stage: "ghost" }),
        BlockerSchema.parse(validBlocker),
        BlockerSchema.parse({ ...validBlocker, id: "b2", release: "9.9" }),
      ],
      pioneers: [],
    });
    expect(problems.join("\n")).toContain('unknown stage "ghost"');
    expect(problems.join("\n")).toContain('duplicate blocker id "b1"');
    expect(problems.join("\n")).toContain('unknown release "9.9"');
  });

  it("rejects dependency cycles with the path named", () => {
    const problems = crossValidate({
      release: releaseConfig([component("node", ["vm"]), component("vm", ["node"])]),
      blockers: [],
      pioneers: [],
    });
    expect(problems.join("\n")).toContain("dependency cycle");
  });

  it("rejects a pioneer waiting on an unknown component", () => {
    const problems = crossValidate({
      release: releaseConfig([component("node")]),
      blockers: [],
      pioneers: [
        PioneerSchema.parse({
          partner: "P",
          milestone: "m",
          releaseDependency: "d",
          dependsOn: ["ghost"],
          status: "on-track",
          owner: "o",
          nextDecisionDate: "2026-09-07",
        }),
      ],
    });
    expect(problems.join("\n")).toContain('pioneer "P" dependsOn unknown component "ghost"');
  });
});

describe("PioneersFileSchema", () => {
  it("caps the section at 7 partners", () => {
    const pioneer = {
      partner: "P",
      milestone: "m",
      releaseDependency: "d",
      status: "on-track",
      owner: "o",
      nextDecisionDate: "2026-09-07",
    };
    expect(PioneersFileSchema.safeParse({ pioneers: Array(8).fill(pioneer) }).success).toBe(false);
    expect(PioneersFileSchema.safeParse({ pioneers: Array(5).fill(pioneer) }).success).toBe(true);
  });
});

describe("seed config files", () => {
  // Doubles as a regression test on the real config/ directory.
  it("parse and cross-validate cleanly", () => {
    const config = loadConfig();
    expect(config.release.releases.map((r) => r.targetVersion)).toEqual(["0.15", "0.16", "0.17"]);
    expect(config.release.defaultRelease).toBe("0.16");
    for (const r of config.release.releases) {
      expect(r.components.length).toBeGreaterThanOrEqual(13);
    }
    expect(config.blockers.length).toBeGreaterThanOrEqual(10);
    expect(config.pioneers.length).toBeGreaterThanOrEqual(5);
    // Every blocker satisfies the PRD's hard requirements.
    for (const b of config.blockers) {
      expect(b.owner).toBeTruthy();
      expect(b.exitCondition).toBeTruthy();
      expect(b.nextDecisionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(b.release).toBe("0.16");
    }
  });
  it("BlockersFileSchema rejects a file-level unknown key", () => {
    expect(BlockersFileSchema.safeParse({ blockers: [], extra: 1 }).success).toBe(false);
  });
});
