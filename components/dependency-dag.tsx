"use client";

import { useMemo, useState } from "react";
import { STATUS_LABEL } from "@/lib/status-engine";
import type { ComponentStatus, PioneerView, RollupStatus, Tone } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ComponentNode } from "./component-node";
import { DevexRollup, ROLLUP_LABEL } from "./devex-rollup";
import { PioneerList } from "./pioneer-list";
import { StatusDot } from "./status-badge";

// Node-and-edge DAG of the release chain. Nodes are compact status chips laid
// out in dependency layers (computed from config dependsOn, left to right);
// edges are the actual dependsOn relations. Clicking a node opens the full
// detail card below the graph. Hand-rolled layout — the graph is 8 fixed
// nodes, which does not justify a layout library.

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
    "\u2014"
  );
}

function buildDag(
  components: ComponentStatus[],
  devexRollup: RollupStatus,
  pioneers: PioneerView[],
) {
  const chain = components.filter((c) => c.group !== "devex");
  const devexChildren = components.filter((c) => c.group === "devex");
  const chainIds = new Set(chain.map((c) => c.id));
  const labelOf = new Map(chain.map((c) => [c.id, c.label]));

  const layers = computeLayers(chain);
  const devexCol = Math.max(0, ...layers.values()) + 1;
  const pioneersCol = devexCol + 1;

  // Group nodes into columns, preserving config order within a column.
  const columns = new Map<number, string[]>();
  for (const c of chain) {
    const col = layers.get(c.id) ?? 0;
    columns.set(col, [...(columns.get(col) ?? []), c.id]);
  }
  columns.set(devexCol, ["devex"]);
  if (pioneers.length > 0) columns.set(pioneersCol, ["pioneers"]);

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

  const nodes: DagNode[] = chain.map((c) => ({
    id: c.id,
    label: c.label,
    version: displayVersion(c),
    statusLabel: STATUS_LABEL[c.status],
    tone: c.tone,
    manual: c.manual,
    depLabels: c.dependsOn.filter((d) => chainIds.has(d)).map((d) => labelOf.get(d) ?? d),
    ...positions.get(c.id)!,
  }));

  const edges: DagEdge[] = [];
  for (const c of chain) {
    for (const dep of c.dependsOn) {
      if (chainIds.has(dep)) edges.push({ from: dep, to: c.id });
    }
  }

  // The DevEx roll-up inherits the union of its surfaces' chain dependencies.
  const devexDeps = [
    ...new Set(devexChildren.flatMap((c) => c.dependsOn).filter((d) => chainIds.has(d))),
  ];
  nodes.push({
    id: "devex",
    label: "DevEx",
    version: `${devexChildren.length} surfaces`,
    statusLabel: ROLLUP_LABEL[devexRollup.status],
    tone: devexRollup.tone,
    manual: false,
    depLabels: devexDeps.map((d) => labelOf.get(d) ?? d),
    ...positions.get("devex")!,
  });
  for (const dep of devexDeps) edges.push({ from: dep, to: "devex" });

  // Pioneers close the pipeline: one manually-curated roll-up node whose
  // edges come from the union of the partners' configured dependencies.
  if (pioneers.length > 0) {
    const worst = pioneers.some((p) => p.status === "blocked")
      ? { label: "Blocked", tone: "red" as Tone }
      : pioneers.some((p) => p.status === "at-risk")
        ? { label: "At risk", tone: "amber" as Tone }
        : pioneers.every((p) => p.status === "done")
          ? { label: "Done", tone: "green" as Tone }
          : { label: "On track", tone: "green" as Tone };
    const pioneerDeps = [
      ...new Set(pioneers.flatMap((p) => p.dependsOn ?? []).filter((d) => chainIds.has(d))),
    ];
    nodes.push({
      id: "pioneers",
      label: "Pioneers",
      version: `${pioneers.length} partners`,
      statusLabel: worst.label,
      tone: worst.tone,
      manual: true,
      depLabels: pioneerDeps.map((d) => labelOf.get(d) ?? d),
      ...positions.get("pioneers")!,
    });
    for (const dep of pioneerDeps) edges.push({ from: dep, to: "pioneers" });
  }

  const allLayers = new Map<string, number>([
    ...layers,
    ["devex", devexCol],
    ["pioneers", pioneersCol],
  ]);
  const colExtents = new Map<number, { top: number; bottom: number }>();
  for (const [col, ids] of columns) {
    const ys = ids.map((id) => positions.get(id)!.y);
    colExtents.set(col, { top: Math.min(...ys), bottom: Math.max(...ys) + NODE_H });
  }
  return { nodes, edges, canvasW, canvasH, layers: allLayers, colExtents };
}

/** Edge path. Adjacent columns connect right-edge to left-edge with a gentle
 * S-curve. An edge spanning further must not disappear behind the nodes in
 * between, and the column gaps are too narrow to complete a climb, so long
 * edges route over the top (or under the bottom): they leave the source's
 * top/bottom edge, run flat at an apex just clear of the columns they cross,
 * and drop into the target's top/bottom edge. Entry/exit x-offsets are spread
 * by span so parallel arrows into one node do not stack. */
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
      // Endpoints already level with the apex (the tall column's outer rows)
      // connect via their side edge; everything else goes over the top or
      // under the bottom of its own node.
      const sideExit = up ? from.y <= apex : from.y + NODE_H >= apex;
      const sideEntry = up ? to.y <= apex : to.y + NODE_H >= apex;
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
  devexRollup,
  pioneers,
}: {
  components: ComponentStatus[];
  devexRollup: RollupStatus;
  pioneers: PioneerView[];
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const { nodes, edges, canvasW, canvasH, layers, colExtents } = useMemo(
    () => buildDag(components, devexRollup, pioneers),
    [components, devexRollup, pioneers],
  );
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const selectedComponent = components.find((c) => c.id === selected);
  const devexChildren = components.filter((c) => c.group === "devex");

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
              <span className="truncate font-mono text-xs text-muted-foreground">{n.version}</span>
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

      <div id="dag-detail" data-testid="dag-detail" className={cn("empty:hidden", selected === "pioneers" ? "max-w-4xl" : "max-w-md")}>
        {selected === "devex" ? (
          <DevexRollup rollup={devexRollup} components={devexChildren} defaultOpen />
        ) : selected === "pioneers" ? (
          <PioneerList pioneers={pioneers} />
        ) : selectedComponent ? (
          <ComponentNode component={selectedComponent} />
        ) : null}
      </div>
    </section>
  );
}
