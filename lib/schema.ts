import { z } from "zod";

// Zod schemas for the three version-controlled YAML config files.
// Build-time validation (scripts/validate-config.ts, wired as `prebuild`)
// hard-fails on any violation — notably a blocker without an owner, exit
// condition or decision date (PRD sections 5C and 12).

const repoPattern = /^[\w.-]+\/[\w.-]+$/;

const trainString = z
  .string()
  .regex(/^\d+\.\d+(\.\d+)?$/, "expected a version like 0.16 or 0.16.0");

export const RepoStatusEnum = z.enum([
  "stable-released",
  "docs-published",
  "snapshot-created",
  "awaiting-snapshot",
  "prerelease-deps",
  "rc-released",
  "compatible",
  "migrating",
  "not-started",
  "blocked",
  "unknown",
]);

export const EnvStatusEnum = z.enum(["current", "partial", "behind", "ahead", "unknown"]);

/** How a dependency version is proven. `targetTrain` overrides the release-wide
 * target for detectors whose upstream runs its own version train (e.g. the
 * wallet's Guardian dependency tracks Guardian 0.17, not Miden 0.16).
 * `provesComponent` names the dashboard component this pin tracks, enabling
 * RC-skew detection (pin on-train but older than the upstream's latest RC). */
const dep = {
  dependency: z.string().min(1),
  targetTrain: trainString.nullable().optional(),
  provesComponent: z.string().optional(),
};

export const DetectorSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("github-release"), tagPrefixes: z.array(z.string()).min(1).optional() }),
  z.strictObject({
    type: z.literal("docs-snapshot"),
    workflow: z.string().regex(/^[\w.-]+\.ya?ml$/, "expected a deployment workflow filename"),
  }),
  z.strictObject({ type: z.literal("cargo-dep"), path: z.string().default("Cargo.toml"), ...dep }),
  z.strictObject({ type: z.literal("npm-dep"), path: z.string().default("package.json"), ...dep }),
  z.strictObject({
    type: z.literal("yaml-manifest"),
    path: z.string().min(1),
    key: z.string().min(1),
    targetTrain: trainString.nullable().optional(),
  }),
  z.strictObject({
    type: z.literal("midenup-channel"),
    path: z.string().default("manifest/channel-manifest.json"),
    channel: z.string().min(1),
    component: z.string().min(1),
    targetTrain: trainString.nullable().optional(),
    provesComponent: z.string().optional(),
  }),
  z.strictObject({
    type: z.literal("submodule-dep"),
    /** Path of the submodule inside the monitored repo, e.g. "frontend-template". */
    submodulePath: z.string().min(1),
    /** The submodule's source repository, e.g. "0xMiden/frontend-template". */
    sourceRepo: z.string().regex(repoPattern),
    /** Manifest inside the submodule to read at the pinned commit. */
    manifest: z.enum(["cargo", "npm"]),
    path: z.string().min(1),
    ...dep,
  }),
  z.strictObject({ type: z.literal("migration-pr"), number: z.number().int().positive() }),
  z.strictObject({
    type: z.literal("manual-override"),
    status: RepoStatusEnum,
    note: z.string().min(1),
    setBy: z.string().min(1),
    setAt: z.iso.date(),
  }),
]);
export type Detector = z.infer<typeof DetectorSchema>;

export const ComponentSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string().min(1),
  repo: z.string().regex(repoPattern),
  branch: z.string().min(1),
  owner: z.string().min(1),
  expectedVersion: trainString.nullable(),
  group: z.enum(["chain", "sdk", "app", "toolchain", "devex", "walnut"]),
  dependsOn: z.array(z.string()).default([]),
  detectors: z.array(DetectorSchema).min(1),
});
export type ComponentConfig = z.infer<typeof ComponentSchema>;

export const EnvironmentSchema = z.strictObject({
  id: z.enum(["devnet", "testnet"]),
  label: z.string().min(1),
  statusUrl: z.url(),
  /** Component whose expectedVersion the environment is compared against. */
  expectedComponentId: z.string().min(1),
  manualOverride: z
    .strictObject({
      status: EnvStatusEnum,
      version: z.string().optional(),
      note: z.string().min(1),
      setBy: z.string().min(1),
      observedAt: z.iso.date(),
      evidenceUrl: z.url().optional(),
    })
    .optional(),
});

export const ReleaseSchema = z.strictObject({
  name: z.string().min(1),
  targetVersion: trainString,
  targetDate: z.iso.date().nullable().default(null),
  components: z.array(ComponentSchema).min(1),
});
export type ReleaseDefinition = z.infer<typeof ReleaseSchema>;

export const ReleaseConfigSchema = z.strictObject({
  defaultRelease: trainString,
  environments: z.array(EnvironmentSchema).min(1),
  releases: z.array(ReleaseSchema).min(1),
});
export type ReleaseConfig = z.infer<typeof ReleaseConfigSchema>;

export const BlockerSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().min(1),
  severity: z.enum(["critical", "high", "medium"]),
  /** Which release train this blocker gates, e.g. "0.16". */
  release: trainString,
  stage: z.string().min(1),
  blockingDependency: z.string().optional(),
  owner: z.string().min(1, "blocker owner is required"),
  exitCondition: z.string().min(1, "blocker exit condition is required"),
  nextDecisionDate: z.iso.date({ error: "blocker next decision date is required" }),
  github: z.strictObject({
    repo: z.string().regex(repoPattern),
    number: z.number().int().positive(),
  }),
  notionUrl: z.url().optional(),
});
export type BlockerConfig = z.infer<typeof BlockerSchema>;

export const BlockersFileSchema = z.strictObject({
  blockers: z.array(BlockerSchema),
});

export interface AppConfig {
  release: ReleaseConfig;
  blockers: BlockerConfig[];
}

function findCycle(components: { id: string; dependsOn: string[] }[]): string | null {
  const deps = new Map(components.map((c) => [c.id, c.dependsOn]));
  const state = new Map<string, "visiting" | "done">();
  const visit = (id: string, path: string[]): string | null => {
    if (state.get(id) === "done") return null;
    if (state.get(id) === "visiting") return [...path, id].join(" -> ");
    state.set(id, "visiting");
    for (const dep of deps.get(id) ?? []) {
      if (!deps.has(dep)) continue;
      const cycle = visit(dep, [...path, id]);
      if (cycle) return cycle;
    }
    state.set(id, "done");
    return null;
  };
  for (const c of components) {
    const cycle = visit(c.id, []);
    if (cycle) return cycle;
  }
  return null;
}

/** Cross-file referential checks. Returns a list of human-readable problems. */
export function crossValidate(config: AppConfig): string[] {
  const problems: string[] = [];
  const { releases, environments, defaultRelease } = config.release;

  const versions = releases.map((r) => r.targetVersion);
  for (const d of new Set(versions.filter((v, i) => versions.indexOf(v) !== i))) {
    problems.push(`duplicate release "${d}"`);
  }
  if (!versions.includes(defaultRelease)) {
    problems.push(`defaultRelease "${defaultRelease}" is not a declared release`);
  }

  const idsByRelease = new Map<string, Set<string>>();
  for (const r of releases) {
    const ids = new Set(r.components.map((c) => c.id));
    idsByRelease.set(r.targetVersion, ids);
    const dup = r.components.map((c) => c.id).filter((id, i, all) => all.indexOf(id) !== i);
    for (const d of new Set(dup)) problems.push(`release ${r.targetVersion}: duplicate component id "${d}"`);
    for (const c of r.components) {
      for (const dep of c.dependsOn) {
        if (!ids.has(dep)) {
          problems.push(`release ${r.targetVersion}: component "${c.id}" dependsOn unknown id "${dep}"`);
        }
      }
    }
    const cycle = findCycle(r.components);
    if (cycle) problems.push(`release ${r.targetVersion}: dependency cycle ${cycle}`);
    for (const e of environments) {
      if (!ids.has(e.expectedComponentId)) {
        problems.push(`release ${r.targetVersion}: environment "${e.id}" expects unknown component "${e.expectedComponentId}"`);
      }
    }
  }

  for (const b of config.blockers) {
    const ids = idsByRelease.get(b.release);
    if (!ids) {
      problems.push(`blocker "${b.id}" targets unknown release "${b.release}"`);
    } else if (!ids.has(b.stage)) {
      problems.push(`blocker "${b.id}" targets unknown stage "${b.stage}"`);
    }
  }
  const dupB = config.blockers.map((b) => b.id).filter((id, i, all) => all.indexOf(id) !== i);
  for (const d of new Set(dupB)) problems.push(`duplicate blocker id "${d}"`);

  for (const r of releases) {
    const ids = idsByRelease.get(r.targetVersion)!;
    for (const c of r.components) {
      for (const d of c.detectors) {
        if ("provesComponent" in d && d.provesComponent && !ids.has(d.provesComponent)) {
          problems.push(
            `release ${r.targetVersion}: component "${c.id}" detector proves unknown component "${d.provesComponent}"`,
          );
        }
      }
    }
  }
  return problems;
}
