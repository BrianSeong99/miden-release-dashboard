export const NODE_W = 160;
export const NODE_H = 78;
const COL_GAP = 48;
const LABEL_W = 112;
const LANE_H = 122;

export const DEPENDENCY_LANES = [
  { id: "protocol", label: "Protocol" },
  { id: "tools", label: "Build & tooling" },
  { id: "sdk", label: "SDKs" },
  { id: "app", label: "Applications" },
  { id: "surfaces", label: "Developer surfaces" },
] as const;

export type DependencyLane = (typeof DEPENDENCY_LANES)[number]["id"];
interface LayoutItem {
  id: string;
  lane: DependencyLane;
  dependsOn: string[];
}

export interface PositionedDependency extends LayoutItem {
  x: number;
  y: number;
  column: number;
}

/** Purpose determines the row; only actual dependencies determine ordering.
 * Independent peers take separate slots in their row without adding edges. */
export function layoutDependencies(items: LayoutItem[]) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const placed = new Map<string, PositionedDependency>();
  const occupied = new Set<string>();
  const visiting = new Set<string>();
  const lanes = DEPENDENCY_LANES.filter((lane) => items.some((item) => item.lane === lane.id))
    .map((lane, row) => ({ ...lane, y: row * LANE_H, height: LANE_H }));

  function place(id: string): PositionedDependency | undefined {
    if (placed.has(id)) return placed.get(id);
    // Configuration validation rejects cycles before this view is rendered.
    if (visiting.has(id)) return undefined;
    const item = byId.get(id);
    if (!item) return undefined;
    visiting.add(id);
    const deps = item.dependsOn.map(place).filter((dep) => dep !== undefined);
    let column = deps.length ? Math.max(...deps.map((dep) => dep.column)) + 1 : 0;
    while (occupied.has(`${item.lane}:${column}`)) column++;
    occupied.add(`${item.lane}:${column}`);
    const position = {
      ...item,
      column,
      x: LABEL_W + column * (NODE_W + COL_GAP),
      y: lanes.find((lane) => lane.id === item.lane)!.y + 26,
    };
    placed.set(id, position);
    visiting.delete(id);
    return position;
  }
  items.forEach((item) => place(item.id));
  const nodes = items.map((item) => placed.get(item.id)!);
  return {
    nodes,
    lanes,
    width: Math.max(LABEL_W, ...nodes.map((node) => node.x + NODE_W)) + 24,
    height: lanes.length * LANE_H,
  };
}

/** Use column and row gutters so long connections never pass behind cards. */
export function dependencyWaypoints(from: PositionedDependency, to: PositionedDependency, index: number) {
  const start = { x: from.x + NODE_W, y: from.y + NODE_H / 2 };
  const end = { x: to.x, y: to.y + NODE_H / 2 };
  if (from.lane === to.lane && to.column === from.column + 1) return [start, end];
  const exitX = start.x + 12 + (index % 3) * 6;
  const entryX = end.x - 12 - (index % 3) * 6;
  const gutterY = to.y - 10 - (index % 4) * 4;
  return [start, { x: exitX, y: start.y }, { x: exitX, y: gutterY },
    { x: entryX, y: gutterY }, { x: entryX, y: end.y }, end];
}
