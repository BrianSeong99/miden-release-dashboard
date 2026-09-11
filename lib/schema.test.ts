import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";
import { BlockersFileSchema, BlockerSchema, ReleaseConfigSchema, crossValidate } from "./schema";

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
  it("accepts explicitly unconfirmed owner and decision date", () => {
    const work = BlockerSchema.parse({ ...validBlocker, owner: null, nextDecisionDate: null });
    expect(work.owner).toBeNull();
    expect(work.nextDecisionDate).toBeNull();
  });
  it("does not infer a release gate from critical severity", () => {
    expect(BlockerSchema.parse(validBlocker).category).toBe("follow-up");
    expect(BlockerSchema.parse({ ...validBlocker, category: "blocker" }).category).toBe("blocker");
    expect(BlockerSchema.parse({ ...validBlocker, category: "migration" }).category).toBe("migration");
    expect(BlockerSchema.safeParse({ ...validBlocker, category: "critical" }).success).toBe(false);
  });
  it("rejects empty owners and invalid dates rather than treating them as unknown", () => {
    expect(BlockerSchema.safeParse({ ...validBlocker, owner: "" }).success).toBe(false);
    expect(BlockerSchema.safeParse({ ...validBlocker, nextDecisionDate: "TBD" }).success).toBe(false);
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
    });
    expect(problems.join("\n")).toContain('unknown stage "ghost"');
    expect(problems.join("\n")).toContain('duplicate blocker id "b1"');
    expect(problems.join("\n")).toContain('unknown release "9.9"');
  });

  it("rejects dependency cycles with the path named", () => {
    const problems = crossValidate({
      release: releaseConfig([component("node", ["vm"]), component("vm", ["node"])]),
      blockers: [],
    });
    expect(problems.join("\n")).toContain("dependency cycle");
  });

  it("rejects a detector proving an unknown component", () => {
    const bad = releaseConfig([
      {
        ...component("node"),
        detectors: [
          { type: "cargo-dep", path: "Cargo.toml", dependency: "miden-protocol", provesComponent: "ghost" },
        ],
      },
    ]);
    const problems = crossValidate({ release: bad, blockers: [] });
    expect(problems.join(String.fromCharCode(10))).toContain('proves unknown component "ghost"');
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
    // Seeded accountability and dates were drafts, not verified commitments.
    for (const b of config.blockers) {
      expect(b.owner).toBeNull();
      expect(b.exitCondition).toBeTruthy();
      expect(b.nextDecisionDate).toBeNull();
      expect(b.category).toBe("follow-up");
      expect(b.release).toBe(b.id === "node-batch-fees" ? "0.17" : "0.16");
    }
  });
  it("tracks project-template skills migration only on its v0.16 train", () => {
    const config = loadConfig();
    for (const release of config.release.releases) {
      const project = release.components.find((c) => c.id === "project-template")!;
      const migration = project.detectors.some((d) => d.type === "migration-pr" && d.number === 64);
      expect(migration).toBe(release.targetVersion === "0.16");
    }
  });
  it("includes MidenBank in tutorial evidence and tracks the agent-tools migration without invented pins", () => {
    const config = loadConfig();
    for (const release of config.release.releases) {
      const tutorials = release.components.find((c) => c.id === "tutorials")!;
      expect(tutorials.detectors).toContainEqual(expect.objectContaining({
        type: "cargo-dep", path: "examples/miden-bank/integration/Cargo.toml",
        dependency: "miden-client", provesComponent: "rust-sdk",
      }));
      const tools = release.components.find((c) => c.id === "agent-tools");
      if (release.targetVersion === "0.16") {
        expect(tools?.dependsOn).toEqual([]);
        expect(tools?.detectors).toEqual([{ type: "migration-pr", number: 17 }]);
      } else {
        expect(tools).toBeUndefined();
      }
    }
  });
  it("BlockersFileSchema rejects a file-level unknown key", () => {
    expect(BlockersFileSchema.safeParse({ blockers: [], extra: 1 }).success).toBe(false);
  });
});
