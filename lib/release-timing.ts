import type { DocsSnapshot } from "./docs-snapshot";
import type { ComponentConfig } from "./schema";
import { isPrerelease, matchesReleaseTag, onTrain } from "./semver-utils";
import type { ComponentStatus, GhRelease, PropagationTiming, ReleaseHistory, ReleaseTiming, Result } from "./types";

const PUBLICATION_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function parseTimestamp(iso: string | null): number {
  if (iso === null || !PUBLICATION_TIMESTAMP.test(iso)) return NaN;
  // Date.parse normalizes impossible days (February 30 becomes March 2).
  // Validate the source calendar day separately so timezone offsets stay valid.
  const day = iso.slice(0, 10);
  const midnight = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== day) return NaN;
  return Date.parse(iso);
}

function observedTime(iso: string | null, asOf: number): number | null {
  const time = parseTimestamp(iso);
  return Number.isFinite(time) && Number.isFinite(asOf) && time <= asOf ? time : null;
}

function emptyTiming(source: ReleaseTiming["source"], stableState: ReleaseTiming["stableState"]): ReleaseTiming {
  return { source, stableState, historyComplete: false, latest: null, latestOnTrain: null, firstStable: null, history: [] };
}

/** Publication chronology for the component's own train, never pin adoption. */
export function deriveReleaseTiming(
  config: ComponentConfig,
  historyResult: Result<ReleaseHistory> | null,
  docsSnapshot: Result<DocsSnapshot> | null | undefined,
  asOfISO: string,
): ReleaseTiming {
  const asOf = parseTimestamp(asOfISO);
  if (config.detectors.some((d) => d.type === "docs-snapshot")) {
    const timing = emptyTiming("docs-deployment", "not-monitored");
    if (!docsSnapshot?.ok) return { ...timing, error: docsSnapshot?.error ?? "Docs deployment evidence unavailable" };
    const docs = docsSnapshot.value;
    if (!docs.published) return timing;
    if (observedTime(docs.publishedAt, asOf) === null) return { ...timing, error: "Docs deployment date is missing, invalid, or in the future" };
    // The workflow reports the latest redeploy of this snapshot, not its debut.
    const latest: GhRelease = {
      tagName: docs.version, prerelease: false, publishedAt: docs.publishedAt,
      htmlUrl: docs.deploymentUrl ?? docs.snapshotUrl,
    };
    return { ...timing, latest, latestOnTrain: latest, history: [latest] };
  }
  const detector = config.detectors.find((d) => d.type === "github-release");
  if (!detector) return emptyTiming("not-monitored", "not-monitored");
  const timing = emptyTiming("github-release", "unknown");
  if (!historyResult?.ok) return { ...timing, error: historyResult?.error ?? "Release history unavailable" };
  const { releases, complete, error } = historyResult.value;
  const product = releases.filter((r) => matchesReleaseTag(r.tagName, detector.tagPrefixes));
  const onTarget = product.filter((r) => onTrain(r.tagName, config.expectedVersion));
  const stable = onTarget.filter((r) => !r.prerelease && !isPrerelease(r.tagName));
  const dated = (items: GhRelease[]) => items.filter((r) => observedTime(r.publishedAt, asOf) !== null)
    .sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!));
  const datedProduct = dated(product);
  const datedTarget = dated(onTarget);
  const datedStable = dated(stable);
  const validObservation = Number.isFinite(asOf);
  return {
    ...timing,
    historyComplete: complete,
    // GitHub list order is not publication order: an unseen older record
    // could have been published most recently, so partial history proves neither.
    latest: complete && datedProduct.length === product.length ? datedProduct[0] ?? null : null,
    latestOnTrain: complete && datedTarget.length === onTarget.length ? datedTarget[0] ?? null : null,
    firstStable: complete && datedStable.length === stable.length ? datedStable.at(-1) ?? null : null,
    stableState: datedStable.length > 0 ? "published"
      : validObservation && config.expectedVersion !== null && complete && stable.length === 0 ? "unreleased" : "unknown",
    history: datedTarget.slice(0, 8),
    ...(error ? { error } : !validObservation ? { error: "Snapshot observation time is invalid" }
      : datedProduct.length !== product.length ? { error: "Release publication dates are missing, invalid, or in the future" } : {}),
  };
}

/** Calendar gaps along configured edges; independent version numbers are never compared. */
export function derivePropagation(components: ComponentStatus[], asOfISO: string): PropagationTiming[] {
  const byId = new Map(components.map((component) => [component.id, component]));
  const asOf = parseTimestamp(asOfISO);
  return components.flatMap((downstream) => downstream.dependsOn.flatMap((id): PropagationTiming[] => {
    const upstream = byId.get(id);
    if (!upstream) return [];
    const from = upstream.releaseTiming;
    const to = downstream.releaseTiming;
    const edge: PropagationTiming = {
      fromId: id, toId: downstream.id, fromLabel: upstream.label, toLabel: downstream.label,
      upstream: from?.firstStable ?? null, downstream: to?.firstStable ?? null, state: "unknown", elapsedMs: null,
    };
    if ((from && from.source !== "github-release") || (to && to.source !== "github-release")) {
      return [{ ...edge, state: "not-monitored" }];
    }
    if (!from?.historyComplete || !to?.historyComplete || !Number.isFinite(asOf)) return [edge];
    const upstreamAt = observedTime(edge.upstream?.publishedAt ?? null, asOf);
    const downstreamAt = observedTime(edge.downstream?.publishedAt ?? null, asOf);
    if (upstreamAt !== null && downstreamAt !== null) {
      const elapsedMs = downstreamAt - upstreamAt;
      return [{ ...edge, state: elapsedMs < 0 ? "downstream-first" : "released", elapsedMs }];
    }
    if (upstreamAt !== null && to.stableState === "unreleased") {
      return [{ ...edge, state: "waiting", elapsedMs: asOf - upstreamAt }];
    }
    if (from.stableState === "unreleased") return [{ ...edge, state: "upstream-pending" }];
    return [edge];
  }));
}
