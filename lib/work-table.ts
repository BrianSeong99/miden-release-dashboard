import { isOpenWork, nextWorkAction } from "./release-work";
import { STATUS_LABEL } from "./status-engine";
import type { BlockerView, ComponentStatus, Tone } from "./types";

export interface WorkRow {
  id: string;
  kind: "component" | "blocker" | "follow-up" | "migration";
  title: string;
  group: string;
  groupLabel: string;
  componentId: string;
  componentLabel: string;
  owner: string | null;
  ownerLabel: "Owner" | "Assignee";
  status: string;
  tone: Tone;
  active: boolean;
  nextAction: string;
  waitingOn: string | null;
  blocksOutcome: string | null;
  date: string | null;
  dateLabel: "Released" | "Latest release (any train)" | "Latest deployment" | "Decision date";
  url: string;
  component?: ComponentStatus;
  work?: BlockerView;
}

export interface WorkTableOptions {
  view: "all" | "actions" | "components";
  group: string;
  type: "all" | WorkRow["kind"];
  query: string;
  sort: "title" | "group" | "component" | "owner" | "status" | "date" | "nextAction";
  direction: "asc" | "desc";
}

const GROUP_LABEL: Record<string, string> = {
  chain: "Protocol", sdk: "SDKs", app: "Applications", toolchain: "Tooling", devex: "DevEx", walnut: "Walnut", other: "Other",
};
const READY_COMPONENTS = new Set(["stable-released", "docs-published", "compatible"]);
const WORK_TONE: Record<BlockerView["live"]["state"], Tone> = { open: "amber", unknown: "gray", closed: "gray", merged: "green" };
const collator = new Intl.Collator("en", { sensitivity: "base", numeric: true });
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function validDate(value: string | null | undefined): string | null {
  if (!value || (!/^\d{4}-\d{2}-\d{2}$/.test(value) && !TIMESTAMP.test(value))) return null;
  const day = value.slice(0, 10);
  const midnight = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== day || !Number.isFinite(Date.parse(value))) return null;
  return value;
}

function groupOf(component?: ComponentStatus): string {
  if (!component) return "other";
  return component.id === "compiler" || component.id === "debugger" ? "toolchain" : component.group;
}

/** Keep all components, plus work that is open or whose current state is unknown. */
export function buildWorkRows(components: readonly ComponentStatus[], work: readonly BlockerView[]): WorkRow[] {
  const byId = new Map(components.map((component) => [component.id, component]));
  const componentRows = components.map((component): WorkRow => {
    const group = groupOf(component);
    const historical = component.expectedVersion === null && !component.matchedPublishedAt ? component.releaseTiming?.latest : null;
    return {
      id: `component-${component.id}`, kind: "component", title: component.label,
      group, groupLabel: GROUP_LABEL[group] ?? "Other", componentId: component.id, componentLabel: component.label,
      owner: component.owner?.trim() || null, ownerLabel: "Owner", status: STATUS_LABEL[component.status], tone: component.tone,
      nextAction: component.distribution?.state === "pending" ? "Publish the updated channel"
        : component.distribution?.state === "unknown" ? "Verify channel publication"
        : component.status === "snapshot-created" ? "Publish the docs snapshot"
        : component.status === "awaiting-snapshot" ? "Create the versioned docs snapshot"
        : component.status === "unknown" ? "Confirm missing evidence"
        : READY_COMPONENTS.has(component.status) ? "—" : "Inspect migration and release evidence",
      waitingOn: null, blocksOutcome: null,
      active: !READY_COMPONENTS.has(component.status), date: validDate(component.matchedPublishedAt ?? historical?.publishedAt),
      dateLabel: component.id === "docs" || component.docsSnapshot !== undefined || component.status === "docs-published" ? "Latest deployment" : historical ? "Latest release (any train)" : "Released",
      url: `https://github.com/${component.repo}`, component,
    };
  });
  const workRows = work.filter(isOpenWork).map((item): WorkRow => {
    const component = byId.get(item.stage);
    const group = groupOf(component);
    const status = item.live.state === "closed" ? item.kind === "pull-request" ? "Closed, unmerged" : "Closed"
      : { open: "Open", merged: "Merged", unknown: "Unknown" }[item.live.state];
    return {
      id: `work-${item.id}`, kind: item.category ?? "follow-up", title: item.title,
      group, groupLabel: GROUP_LABEL[group] ?? "Other", componentId: item.stage, componentLabel: component?.label ?? item.stage,
      owner: item.owner?.trim() || null, ownerLabel: "Assignee", status, tone: WORK_TONE[item.live.state], active: isOpenWork(item),
      nextAction: nextWorkAction(item),
      waitingOn: item.handoff?.waitingOn ?? (item.workflow?.reviewers.join(", ") || null),
      blocksOutcome: item.handoff?.blocksOutcome ?? item.blockingDependency ?? null,
      date: validDate(item.nextDecisionDate), dateLabel: "Decision date", url: item.url, component, work: item,
    };
  });
  return [...componentRows, ...workRows];
}

function searchableText(row: WorkRow): string {
  const component = row.component;
  return [
    row.title, row.componentLabel, row.componentId, row.groupLabel, row.owner, row.status, row.kind,
    row.nextAction, row.waitingOn, row.blocksOutcome, row.work?.exitCondition, row.work?.blockingDependency,
    component?.expectedVersion, component?.matchedRelease, component?.latestStable, component?.latestRc,
    ...(component?.dependsOn ?? []),
    ...(component?.deps.flatMap((dep) => [dep.label, dep.version, dep.raw]) ?? []),
  ].filter(Boolean).join(" ").toLowerCase();
}

function statusPriority(row: WorkRow): number {
  if (row.status === "Blocked" || (row.kind === "blocker" && row.status === "Open")) return 0;
  if (row.status === "Unknown") return 1;
  if (row.status === "Open") return 2;
  if (row.active) return 3;
  return row.kind === "component" ? 4 : 5;
}

/** Filter intersections and stable sorts operate on a new array, never source data. */
export function filterAndSortWorkRows(rows: readonly WorkRow[], options: WorkTableOptions): WorkRow[] {
  const terms = options.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = rows.filter((row) =>
    (options.view === "all" || (options.view === "actions" && row.active)
      || (options.view === "components" && row.kind === "component"))
    && (options.group === "all" || row.group === options.group)
    && (options.type === "all" || row.kind === options.type)
    && (terms.length === 0 || terms.every((term) => searchableText(row).includes(term))),
  );
  const direction = options.direction === "asc" ? 1 : -1;
  return filtered.sort((a, b) => {
    let comparison: number;
    if (options.sort === "owner" || options.sort === "date") {
      const aValue = options.sort === "owner" ? a.owner?.trim() || null : validDate(a.date);
      const bValue = options.sort === "owner" ? b.owner?.trim() || null : validDate(b.date);
      // Missing values stay last, independently of the requested direction.
      if ((aValue === null) !== (bValue === null)) return aValue === null ? 1 : -1;
      comparison = aValue === null || bValue === null ? 0
        : options.sort === "date" ? Date.parse(aValue) - Date.parse(bValue) : collator.compare(aValue, bValue);
    } else if (options.sort === "status") comparison = statusPriority(a) - statusPriority(b);
    else {
      const field = options.sort === "group" ? "groupLabel" : options.sort === "component" ? "componentLabel" : options.sort === "nextAction" ? "nextAction" : "title";
      comparison = collator.compare(a[field], b[field]);
    }
    return comparison * direction || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
}
