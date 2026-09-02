"use client";

import { useMemo, useState } from "react";
import { STATUS_LABEL } from "@/lib/status-engine";
import { onTrain } from "@/lib/semver-utils";
import type { ComponentStatus, GroupRollupView, Tone } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ComponentNode } from "./component-node";
import { GroupRollup, ROLLUP_LABEL } from "./group-rollup";
import { StatusDot } from "./status-badge";

// Node-and-edge DAG of the release chain. Nodes are compact status chips laid
// out in dependency layers (computed from config dependsOn, left to right);
// edges are the actual dependsOn relations, with each roll-up group (DevEx,
// Walnut) as one aggregate node in a shared final column. Clicking a node
// opens the full detail card below the graph. Hand-rolled layout — the graph
// is ~9 fixed nodes, which does not justify a layout library.

const NODE_W = 150;
const NODE_H = 78;
const COL_GAP = 40;
const ROW_GAP = 32;
const PAD_X = 4;
const PAD_Y = 52; // headroom for long edges arcing over intermediate columns

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
  x: number;
  y: number;
}

interface DagEdge {
  from: string;
  to: string;
}

/** Longest-path layering over dependsOn, restricted to the nodes shown. */
function computeLayers(components: ComponentStatus[]): Map<string, number> {
  const byId = new Map(components.map((c) => [c.id, c]));
  const layers = new Map<string, number>();
  const visiting = new Set<string>();
  const layerOf = (id: string): number => {
    const cached = layers.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0; // crossValidate rejects cycles; belt and braces
    visiting.add(id);
    const c = byId.get(id);
    const deps = (c?.dependsOn ?? []).filter((d) => byId.has(d));
    const layer = deps.length === 0 ? 0 : 1 + Math.max(...deps.map(layerOf));
    visiting.delete(id);
    layers.set(id, layer);
    return layer;
  };
  for (const c of components) layerOf(c.id);
  return layers;
}

function displayVersion(c: ComponentStatus): string {
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

function relativeAge(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
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
) {
  const chain = components.filter((c) => !rollups.some((r) => r.group === c.group));
  const chainIds = new Set(chain.map((c) => c.id));
  const labelOf = new Map(chain.map((c) => [c.id, c.label]));

  const layers = computeLayers(chain);
  const rollupCol = Math.max(0, ...layers.values()) + 1;

  // Group nodes into columns, preserving config order within a column; all
  // roll-up groups stack in one shared final column.
  const columns = new Map<number, string[]>();
  for (const c of chain) {
    const col = layers.get(c.id) ?? 0;
    columns.set(col, [...(columns.get(col) ?? []), c.id]);
  }
  if (rollups.length > 0) {
    columns.set(rollupCol, rollups.map((r) => r.group));
  }

  const lastCol = Math.max(...columns.keys());
  const maxRows = Math.max(...[...columns.values()].map((ids) => ids.length));
  const canvasH = PAD_Y * 2 + maxRows * NODE_H + (maxRows - 1) * ROW_GAP;
  const canvasW = PAD_X * 2 + (lastCol + 1) * NODE_W + lastCol * COL_GAP;

  const positions = new Map<string, { x: number; y: number }>();
  for (const [col, ids] of columns) {
    const colH = ids.length * NODE_H + (ids.length - 1) * ROW_GAP;
    ids.forEach((id, row) => {
      positions.set(id, {
        x: PAD_X + col * (NODE_W + COL_GAP),
        y: (canvasH - colH) / 2 + row * (NODE_H + ROW_GAP),
      });
    });
  }

  const nodes: DagNode[] = chain.map((c) => {
    // A component on its own version train (Guardian 0.17, Wallet 1.16) gets
    // the train spelled out so its version does not read as a mistake.
    const ownTrain = !onTrain(c.expectedVersion, targetVersion);
    const version = displayVersion(c);
    return {
      id: c.id,
      label: c.label,
      version: ownTrain ? `${version} · ${trainOf(c.expectedVersion)} train` : version,
      age: relativeAge(c.matchedPublishedAt),
      statusLabel: STATUS_LABEL[c.status],
      tone: c.tone,
      manual: c.manual,
      depLabels: c.dependsOn.filter((d) => chainIds.has(d)).map((d) => labelOf.get(d) ?? d),
      ...positions.get(c.id)!,
    };
  });

  const edges: DagEdge[] = [];
  for (const c of chain) {
    for (const dep of c.dependsOn) {
      if (chainIds.has(dep)) edges.push({ from: dep, to: c.id });
    }
  }

  // Each roll-up inherits the union of its members' chain dependencies.
  const allLayers = new Map<string, number>(layers);
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
      ...positions.get(r.group)!,
    });
    for (const dep of deps) edges.push({ from: dep, to: r.group });
    allLayers.set(r.group, rollupCol);
  }

  const colExtents = new Map<number, { top: number; bottom: number }>();
  for (const [col, ids] of columns) {
    const ys = ids.map((id) => positions.get(id)!.y);
    colExtents.set(col, { top: Math.min(...ys), bottom: Math.max(...ys) + NODE_H });
  }
  return { nodes, edges, canvasW, canvasH, layers: allLayers, colExtents };
}

function trainOf(version: string): string {
  const [major, minor] = version.split(".");
  return `${major}.${minor}`;
}

/** Edge path. Adjacent columns connect right-edge to left-edge with a gentle
 * S-curve. An edge spanning further must not disappear behind the nodes in
 * between, and the column gaps are too narrow to complete a climb, so long
 * edges route over the top (or under the bottom): climb, run flat at an apex
 * just clear of the crossed columns, drop. Entry/exit x-offsets are spread by
 * span so parallel arrows into one node do not stack. */
function edgePath(
  from: DagNode,
  to: DagNode,
  fromCol: number,
  toCol: number,
  colExtents: Map<number, { top: number; bottom: number }>,
  canvasH: number,
): string {
  const x1 = from.x + NODE_W;
  const y1 = from.y + NODE_H / 2;
  const x2 = to.x;
  const y2 = to.y + NODE_H / 2;
  const span = toCol - fromCol;
  if (span > 1) {
    const between = [];
    for (let col = fromCol + 1; col < toCol; col++) {
      const ext = colExtents.get(col);
      if (ext) between.push(ext);
    }
    if (between.length > 0) {
      const up = (y1 + y2) / 2 <= canvasH / 2;
      const apex = up
        ? Math.max(8, Math.min(...between.map((e) => e.top)) - 14)
        : Math.min(canvasH - 8, Math.max(...between.map((e) => e.bottom)) + 14);
      // A node may only exit/enter vertically when it is the outermost row of
      // its column in the routing direction — an inner row would climb straight
      // through its sibling. Endpoints already level with the apex also
      // connect via their side edge.
      const fromExt = colExtents.get(fromCol);
      const toExt = colExtents.get(toCol);
      const fromOuter = up ? from.y === (fromExt?.top ?? from.y) : from.y + NODE_H === (fromExt?.bottom ?? from.y + NODE_H);
      const toOuter = up ? to.y === (toExt?.top ?? to.y) : to.y + NODE_H === (toExt?.bottom ?? to.y + NODE_H);
      const sideExit = !fromOuter || (up ? from.y <= apex : from.y + NODE_H >= apex);
      const sideEntry = !toOuter || (up ? to.y <= apex : to.y + NODE_H >= apex);
      const sx = sideExit ? x1 : from.x + NODE_W - 16 - span * 4;
      const sy = sideExit ? y1 : up ? from.y : from.y + NODE_H;
      const ex = sideEntry ? x2 : to.x + 12 + span * 8;
      const ey = sideEntry ? y2 : up ? to.y : to.y + NODE_H;
      // Climb, run flat at the apex, drop — the climb must finish inside the
      // source's own column, or the line dives behind the first crossed node.
      const runIn = Math.min(56, (ex - sx) / 3);
      return [
        `M ${sx} ${sy}`,
        `Q ${sx + (sideExit ? runIn * 0.6 : 6)} ${apex} ${sx + runIn} ${apex}`,
        `L ${ex - runIn} ${apex}`,
        `Q ${ex - (sideEntry ? runIn * 0.6 : 6)} ${apex} ${ex} ${ey}`,
      ].join(" ");
    }
  }
  const dx = Math.max(24, (x2 - x1) * 0.45);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

export function DependencyDag({
  components,
  rollups,
  targetVersion,
}: {
  components: ComponentStatus[];
  rollups: GroupRollupView[];
  targetVersion: string;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const { nodes, edges, canvasW, canvasH, layers, colExtents } = useMemo(
    () => buildDag(components, rollups, targetVersion),
    [components, rollups, targetVersion],
  );
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const selectedComponent = components.find((c) => c.id === selected);
  const selectedRollup = rollups.find((r) => r.group === selected);

  return (
    <section aria-label="Dependency graph" className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-xl border bg-card/40 pb-1">
        <div className="relative" style={{ width: canvasW, height: canvasH }}>
          <svg
            aria-hidden
            className="absolute inset-0"
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
            {edges.map((e) => {
              const from = nodeById.get(e.from);
              const to = nodeById.get(e.to);
              if (!from || !to) return null;
              const active = selected !== null && (e.from === selected || e.to === selected);
              return (
                <path
                  key={`${e.from}->${e.to}`}
                  d={edgePath(from, to, layers.get(e.from) ?? 0, layers.get(e.to) ?? 0, colExtents, canvasH)}
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
                "absolute flex cursor-pointer flex-col justify-center gap-0.5 rounded-lg border bg-card px-3 py-2 text-left transition-colors",
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

      <p className="text-xs text-muted-foreground">Select a node for its versions, owner, blockers and evidence.</p>
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
          <ComponentNode component={selectedComponent} />
        ) : null}
      </div>
    </section>
  );
}
