import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { err, ok } from "./fetch-utils";
import { blobUrl, getRawFile, getSubmodulePointer } from "./github";
import type { Detector } from "./schema";
import type { DetectedVersion, Result } from "./types";

// Detector runners: given a repo/branch and a detector config, extract the
// dependency version that proves compatibility. Parsing failures return
// Result errors — never throw (PRD section 12).

function depString(entry: unknown): string | null {
  // Cargo dependencies are either "0.16.0-rc.4" or { version = "…", … }.
  if (typeof entry === "string") return entry;
  if (typeof entry === "object" && entry !== null) {
    const v = (entry as Record<string, unknown>).version;
    if (typeof v === "string") return v;
  }
  return null;
}

export function extractCargoDependency(toml: string, dependency: string): string | null {
  let doc: Record<string, unknown>;
  try {
    doc = parseToml(toml) as Record<string, unknown>;
  } catch {
    return null;
  }
  // [workspace.dependencies] first (org convention), then [dependencies].
  const workspace = doc.workspace as Record<string, unknown> | undefined;
  const wsDeps = workspace?.dependencies as Record<string, unknown> | undefined;
  const found = depString(wsDeps?.[dependency]);
  if (found !== null) return found;
  const deps = doc.dependencies as Record<string, unknown> | undefined;
  return depString(deps?.[dependency]);
}

export function extractNpmDependency(json: string, dependency: string): string | null {
  let doc: Record<string, unknown>;
  try {
    doc = JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
  for (const key of ["dependencies", "devDependencies"]) {
    const deps = doc[key] as Record<string, unknown> | undefined;
    const v = deps?.[dependency];
    if (typeof v === "string") return v;
  }
  return null;
}

export function extractYamlKey(text: string, key: string): string | null {
  let doc: unknown;
  try {
    doc = parseYaml(text);
  } catch {
    return null;
  }
  if (typeof doc !== "object" || doc === null) return null;
  const v = (doc as Record<string, unknown>)[key];
  return typeof v === "string" || typeof v === "number" ? String(v) : null;
}

export function extractMidenupChannelComponent(
  json: string,
  channel: string,
  component: string,
): string | null {
  const result = readMidenupChannelComponent(json, channel, component);
  return result.ok ? result.value : null;
}

const channelManifestSchema = z.object({
  channels: z.array(z.object({
    name: z.string().min(1),
    components: z.array(z.object({
      name: z.string().min(1),
      version: z.object({ kind: z.string(), version: z.string().min(1).optional() }),
    })),
  })),
});

function readMidenupChannelComponent(json: string, channel: string, component: string): Result<string | null> {
  let doc: z.infer<typeof channelManifestSchema>;
  try {
    doc = channelManifestSchema.parse(JSON.parse(json));
  } catch {
    return err("Invalid midenup channel manifest");
  }
  const comp = doc.channels.find((c) => c.name === channel)?.components.find((c) => c.name === component);
  if (!comp) return ok(null);
  if (comp.version.kind !== "registry" || !comp.version.version) {
    return err(`Cannot verify ${component} in midenup channel ${channel}: no registry version`);
  }
  return ok(comp.version.version);
}

type DepDetector = Extract<
  Detector,
  { type: "cargo-dep" | "npm-dep" | "yaml-manifest" | "midenup-channel" | "submodule-dep" }
>;

export function detectorLabel(d: DepDetector): string {
  switch (d.type) {
    case "cargo-dep":
      return `${d.dependency} (${d.path})`;
    case "npm-dep":
      return `${d.dependency} (${d.path})`;
    case "yaml-manifest":
      return `${d.key} (${d.path})`;
    case "midenup-channel":
      return `channel ${d.channel} → ${d.component}`;
    case "submodule-dep":
      return `${d.dependency} (${d.submodulePath} submodule)`;
  }
}

/** Resolve a git submodule pointer, then read a manifest at that pinned
 * commit in the submodule's source repo. Fully automated — no manual
 * override needed for template repos composed of submodules. */
async function runSubmoduleDetector(
  repo: string,
  branch: string,
  detector: Extract<DepDetector, { type: "submodule-dep" }>,
): Promise<Result<DetectedVersion>> {
  const pointer = await getSubmodulePointer(repo, detector.submodulePath, branch);
  if (!pointer.ok) return pointer as Result<DetectedVersion>;
  const file = await getRawFile(detector.sourceRepo, detector.path, pointer.value);
  if (!file.ok) return file as unknown as Result<DetectedVersion>;
  const raw =
    detector.manifest === "cargo"
      ? extractCargoDependency(file.value, detector.dependency)
      : extractNpmDependency(file.value, detector.dependency);
  return ok({
    raw,
    source: detectorLabel(detector),
    url: blobUrl(detector.sourceRepo, pointer.value, detector.path),
  });
}

/** Run one dependency detector against the repo's monitored branch. */
export async function runDepDetector(
  repo: string,
  branch: string,
  detector: DepDetector,
): Promise<Result<DetectedVersion>> {
  if (detector.type === "submodule-dep") return runSubmoduleDetector(repo, branch, detector);
  const file = await getRawFile(repo, detector.path, branch);
  if (!file.ok) return err(file.error);
  const url = blobUrl(repo, branch, detector.path);
  let raw: string | null;
  switch (detector.type) {
    case "cargo-dep":
      raw = extractCargoDependency(file.value, detector.dependency);
      break;
    case "npm-dep":
      raw = extractNpmDependency(file.value, detector.dependency);
      break;
    case "yaml-manifest":
      raw = extractYamlKey(file.value, detector.key);
      break;
    case "midenup-channel": {
      const pin = readMidenupChannelComponent(file.value, detector.channel, detector.component);
      if (!pin.ok) return pin;
      raw = pin.value;
      break;
    }
  }
  // raw === null: the manifest was fetched but the target is absent — that is
  // positive "not started" evidence, not a failure.
  return ok({ raw, source: detectorLabel(detector), url });
}
