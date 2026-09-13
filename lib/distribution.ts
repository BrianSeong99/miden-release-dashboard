import { z } from "zod";
import { safeFetch, err, ok } from "./fetch-utils";
import type { DistributionEvidence, Result } from "./types";

const schema = z.object({
  channels: z.array(z.object({ name: z.string(), components: z.array(z.looseObject({ name: z.string(), version: z.unknown() })) })),
  networks: z.record(z.string(), z.unknown()),
});

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export async function fetchPublicManifest(url: string): Promise<Result<string>> {
  const response = await safeFetch(url);
  if (!response.ok) return err(response.error);
  if (!response.value.ok) return err(`Published manifest returned HTTP ${response.value.status}`);
  try { return ok(await response.value.text()); } catch { return err("Published manifest could not be read"); }
}

/** Compare the selected channel and aliases that point to it on either side.
 * Changes to unrelated release channels cannot invalidate this release. */
export function compareDistribution(source: Result<string>, published: Result<string>, channel: string,
  sourceUrl: string, publishedUrl: string): DistributionEvidence {
  const base = { channel, sourceUrl, publishedUrl, changes: [] as string[] };
  if (!source.ok || !published.ok) return { ...base, state: "unknown", reason: "Source or published manifest could not be verified" };
  try {
    const desired = schema.parse(JSON.parse(source.value));
    const actual = schema.parse(JSON.parse(published.value));
    const a = desired.channels.find((c) => c.name === channel);
    const b = actual.channels.find((c) => c.name === channel);
    if (!a) return { ...base, state: "unknown", reason: `Channel ${channel} is not present in the development source` };
    const changes: string[] = [];
    if (!b) changes.push(`Channel ${channel} has not been published`);
    const versions = new Map(b?.components.map((c) => [c.name, canonical(c)]));
    for (const c of a.components) if (versions.get(c.name) !== canonical(c)) changes.push(`${c.name}: source and publication differ`);
    for (const c of b?.components ?? []) if (!a.components.some((d) => d.name === c.name)) changes.push(`${c.name}: removed in source`);
    for (const name of new Set([...Object.keys(desired.networks), ...Object.keys(actual.networks)])) {
      const from = desired.networks[name]; const to = actual.networks[name];
      if ((from === channel || to === channel) && from !== to) changes.push(`${name} alias: published ${String(to ?? "absent")}, source ${String(from ?? "absent")}`);
    }
    return { ...base, changes, state: changes.length ? "pending" : "published",
      reason: changes.length ? "Source updated; public channel publication is pending" : "Public channel and network aliases match the development source" };
  } catch { return { ...base, state: "unknown", reason: "Channel manifest format could not be verified" }; }
}
