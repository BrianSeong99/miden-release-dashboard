import type { ComponentStatus, PropagationTiming } from "./types";

function cell(value: string | number | null | undefined) {
  const text = String(value ?? "");
  // Public repository labels and tags can contain spreadsheet formulas.
  const safe = typeof value === "string" && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function timingCsv(components: ComponentStatus[], edges: PropagationTiming[], release: string, asOf: string, view: "components" | "dependencies") {
  const rows: (string | number | null | undefined)[][] = view === "components" ? [
    ["release_view", "observed_at_utc", "component", "target_train", "source", "history_complete", "first_stable_tag", "first_stable_at_utc", "first_stable_url", "latest_in_train_tag", "latest_in_train_at_utc", "latest_in_train_url", "latest_overall_tag", "latest_overall_at_utc", "latest_overall_url", "stable_state"],
    ...components.map((c) => {
      const t = c.releaseTiming;
      return [release, asOf, c.label, c.expectedVersion, t?.source ?? "unknown", String(t?.historyComplete ?? false),
        t?.firstStable?.tagName, t?.firstStable?.publishedAt, t?.firstStable?.htmlUrl,
        t?.latestOnTrain?.tagName, t?.latestOnTrain?.publishedAt, t?.latestOnTrain?.htmlUrl,
        t?.latest?.tagName, t?.latest?.publishedAt, t?.latest?.htmlUrl, t?.stableState ?? "unknown"];
    }),
  ] : [
    ["release_view", "observed_at_utc", "upstream", "downstream", "state", "calendar_release_gap_hours", "open_wait_hours", "upstream_first_stable_tag", "upstream_first_stable_at_utc", "upstream_url", "downstream_first_stable_tag", "downstream_first_stable_at_utc", "downstream_url"],
    ...edges.map((edge) => [release, asOf, edge.fromLabel, edge.toLabel, edge.state,
      (edge.state === "released" || edge.state === "downstream-first") && edge.elapsedMs !== null ? edge.elapsedMs / 3_600_000 : null,
      edge.state === "waiting" && edge.elapsedMs !== null ? edge.elapsedMs / 3_600_000 : null,
      edge.upstream?.tagName, edge.upstream?.publishedAt, edge.upstream?.htmlUrl,
      edge.downstream?.tagName, edge.downstream?.publishedAt, edge.downstream?.htmlUrl]),
  ];
  return rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
