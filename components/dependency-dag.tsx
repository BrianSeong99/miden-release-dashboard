"use client";

import { useMemo, useState } from "react";
import { STATUS_LABEL } from "@/lib/status-engine";
import { onTrain } from "@/lib/semver-utils";
import type { ComponentStatus, GroupRollupView, Tone } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useHydratedClock } from "@/lib/use-hydrated-clock";
import { ComponentNode } from "./component-node";
import { GroupRollup, ROLLUP_LABEL } from "./group-rollup";
import { StatusDot } from "./status-badge";
import { dependencyPath, layoutDependencies, NODE_H, NODE_W, type DependencyLane } from "@/lib/dependency-layout";

// Functional lanes group purpose. Only configured edges imply dependencies;
// selecting a component isolates its immediate upstream/downstream relations.

const TONE_TEXT: Record<Tone, string> = {
  green: "text-tone-green",
  amber: "text-tone-amber",
  red: "text-tone-red",
  gray: "text-tone-gray",
};

interface DagNode {
  id: string;
  label: string;
  version: string;
  /** Relative age of the matched release, e.g. "3d ago". */
  age: string | null;
  statusLabel: string;
  tone: Tone;
  manual: boolean;
  /** Labels of upstream dependencies, for the screen-reader summary. */
  depLabels: string[];
  lane: DependencyLane;
  dependsOn: string[];
}

interface DagEdge {
  from: string;
  to: string;
}

function laneOf(component: ComponentStatus): DependencyLane {
  if (["compiler", "debugger"].includes(component.id) || component.group === "toolchain") return "tools";
  if (component.group === "sdk" || component.group === "app") return component.group;
  return "protocol";
}

function displayVersion(c: ComponentStatus): string {
  if (c.group === "toolchain") return `Channel ${c.expectedVersion ?? "TBD"}`;
  if (c.expectedVersion === null) return "Target version TBD";
  // The release/RC on this view's train beats global latest — leftover RCs
  // (and, on past-release views, newer trains) must not mask what shipped.
  return (
    c.matchedRelease ??
    c.latestRc ??
    c.latestStable ??
    c.deps.find((d) => d.version)?.version ??
    "—"
  );
}

function relativeAge(iso: string | null, now: number): string | null {
  if (!iso) return null;
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return "today";
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function buildDag(
  components: ComponentStatus[],
  rollups: GroupRollupView[],
  targetVersion: string,
  now: number,
) {
  const chain = components.filter((c) => !rollups.some((r) => r.group === c.group));
  const chainIds = new Set(chain.map((c) => c.id));
  const labelOf = new Map(chain.map((c) => [c.id, c.label]));

  const nodes: DagNode[] = chain.map((c) => {
    // A component on its own version train (Guardian 0.17, Wallet 1.16) gets
    // the train spelled out so its version does not read as a mistake.
    const ownTrain = c.expectedVersion !== null && !onTrain(c.expectedVersion, targetVersion);
    const version = displayVersion(c);
    return {
      id: c.id,
      label: c.label,
      version: ownTrain && c.expectedVersion ? `${version} · ${trainOf(c.expectedVersion)} train` : version,
      age: relativeAge(c.matchedPublishedAt, now),
      statusLabel: STATUS_LABEL[c.status],
      tone: c.tone,
      manual: c.manual,
      depLabels: c.dependsOn.filter((d) => chainIds.has(d)).map((d) => labelOf.get(d) ?? d),
      lane: laneOf(c),
      dependsOn: c.dependsOn.filter((id) => chainIds.has(id)),
    };
  });

  const edges: DagEdge[] = [];
  for (const c of chain) {
    for (const dep of c.dependsOn) {
      if (chainIds.has(dep)) edges.push({ from: dep, to: c.id });
    }
  }

  // Each roll-up inherits the union of its members' chain dependencies.
  for (const r of rollups) {
    const members = components.filter((c) => c.group === r.group);
    const deps = [
      ...new Set(members.flatMap((c) => c.dependsOn).filter((d) => chainIds.has(d))),
    ];
    nodes.push({
      id: r.group,
      label: r.label,
      version: `${members.length} surfaces`,
      age: null,
      statusLabel: ROLLUP_LABEL[r.rollup.status],
      tone: r.rollup.tone,
      manual: false,
      depLabels: deps.map((d) => labelOf.get(d) ?? d),
      lane: "surfaces",
      dependsOn: deps,
    });
    for (const dep of deps) edges.push({ from: dep, to: r.group });
  }

  const layout = layoutDependencies(nodes);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  return {
    ...layout,
    nodes: layout.nodes.map((node) => ({ ...nodeById.get(node.id)!, ...node })),
    edges,
  };
}

function trainOf(version: string): string {
  const [major, minor] = version.split(".");
  return `${major}.${minor}`;
}

export function DependencyDag({
  components,
  rollups,
  targetVersion,
  generatedAt,
}: {
  components: ComponentStatus[];
  rollups: GroupRollupView[];
  targetVersion: string;
  generatedAt: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const now = useHydratedClock(generatedAt);
  const { nodes, edges, width: canvasW, height: canvasH, lanes } = useMemo(
    () => buildDag(components, rollups, targetVersion, now),
    [components, rollups, targetVersion, now],
  );
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const selectedComponent = components.find((c) => c.id === selected);
  const selectedRollup = rollups.find((r) => r.group === selected);

  return (
    <section aria-label="Dependency graph" className="flex min-w-0 flex-col gap-4">
      <p className="text-xs text-muted-foreground">Lanes group components by purpose. Arrows show dependencies.</p>
      <div tabIndex={0} role="region" aria-label="Scrollable dependency map" className="overflow-x-auto rounded-[24px] bg-muted p-1 focus-visible:outline-2 focus-visible:outline-brand">
        <div className="relative" style={{ width: canvasW, height: canvasH }}>
          {lanes.map((lane) => (
            <div key={lane.id} data-testid={`dag-lane-${lane.id}`} className="absolute left-0 w-full border-b border-card last:border-b-0" style={{ top: lane.y, height: lane.height }}>
              <span className="sticky left-0 z-10 flex h-full w-24 items-center bg-muted px-3 text-xs font-medium text-muted-foreground">{lane.label}</span>
            </div>
          ))}
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0"
            width={canvasW}
            height={canvasH}
            viewBox={`0 0 ${canvasW} ${canvasH}`}
          >
            <defs>
              <marker id="dag-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0.5 L 7.5 4 L 0 7.5 z" fill="var(--tone-gray)" />
              </marker>
              <marker id="dag-arrow-active" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0.5 L 7.5 4 L 0 7.5 z" fill="var(--brand)" />
              </marker>
            </defs>
            {edges.map((e, index) => {
              const from = nodeById.get(e.from);
              const to = nodeById.get(e.to);
              if (!from || !to) return null;
              const active = selected !== null && (e.from === selected || e.to === selected);
              if (selected !== null && !active) return null;
              return (
                <path
                  key={`${e.from}->${e.to}`}
                  data-from={e.from}
                  data-to={e.to}
                  d={dependencyPath(from, to, index)}
                  opacity={active ? 1 : 0.7}
                  strokeLinejoin="round"
                  fill="none"
                  stroke={active ? "var(--brand)" : "var(--tone-gray)"}
                  strokeWidth={active ? 2 : 1.5}
                  markerEnd={active ? "url(#dag-arrow-active)" : "url(#dag-arrow)"}
                />
              );
            })}
          </svg>
          {nodes.map((n) => (
            <button
              key={n.id}
              type="button"
              data-testid={`dag-node-${n.id}`}
              aria-expanded={selected === n.id}
              aria-controls="dag-detail"
              onClick={() => setSelected(selected === n.id ? null : n.id)}
              className={cn(
                "absolute flex cursor-pointer flex-col justify-center gap-0.5 rounded-[18px] border border-border/60 bg-card px-3 py-2 text-left transition-colors",
                "hover:border-brand/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                selected === n.id && "border-brand ring-1 ring-brand",
              )}
              style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H }}
            >
              <span className="flex items-center gap-1.5 overflow-hidden">
                <StatusDot tone={n.tone} />
                <span className="truncate text-sm font-semibold">{n.label}</span>
              </span>
              <span className="truncate font-mono text-xs text-muted-foreground">
                {n.version}
                {n.age && ` · ${n.age}`}
              </span>
              <span className={cn("truncate text-[11px] font-medium", TONE_TEXT[n.tone])}>
                {n.statusLabel}
                {n.manual && " · manual"}
              </span>
              {n.depLabels.length > 0 && (
                <span className="sr-only">Depends on {n.depLabels.join(" and ")}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <p aria-live="polite" className="text-xs text-muted-foreground">
        {selected && nodeById.has(selected)
          ? `Showing dependencies into and out of ${nodeById.get(selected)!.label}. Select it again to show all connections.`
          : "Select a component to isolate its connections and inspect versions, owner, blockers and evidence."}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium">Legend:</span>
        <span className="flex items-center gap-1.5"><StatusDot tone="green" /> compatible or released</span>
        <span className="flex items-center gap-1.5"><StatusDot tone="amber" /> migrating, RC or uncertain</span>
        <span className="flex items-center gap-1.5"><StatusDot tone="red" /> blocked</span>
        <span className="flex items-center gap-1.5"><StatusDot tone="gray" /> unknown or stale</span>
      </div>

      <div id="dag-detail" data-testid="dag-detail" className="max-w-md empty:hidden">
        {selectedRollup ? (
          <GroupRollup
            title={selectedRollup.label}
            rollup={selectedRollup.rollup}
            components={components.filter((c) => c.group === selectedRollup.group)}
            defaultOpen
          />
        ) : selectedComponent ? (
          <ComponentNode component={selectedComponent} now={now} />
        ) : null}
      </div>
    </section>
  );
}
