import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BlockerView, ComponentStatus } from "@/lib/types";
import { ReleaseWorkTable } from "./release-work-table";

const at = "2026-09-11T12:00:00Z";
const component = (id: string, label: string, over: Partial<ComponentStatus> = {}): ComponentStatus => ({
  id, label, repo: `0xMiden/${id}`, branch: "main", owner: "Component team", expectedVersion: "0.16",
  group: "devex", dependsOn: [], status: "migrating", tone: "amber", manual: false, reason: "Migration in progress",
  latestStable: null, latestRc: null, matchedRelease: null, matchedPublishedAt: null, deps: [], evidence: [], blockerIds: [], errors: [], ...over,
});
const components = [
  component("protocol", "Protocol", { group: "chain", status: "stable-released", tone: "green", matchedRelease: "0.16.1", matchedPublishedAt: "2026-09-07T08:00:00Z" }),
  component("docs", "Docs", { owner: "Brian", docsSnapshot: { version: "0.16", snapshotExists: false, published: false, snapshotUrl: "https://github.com/0xMiden/docs/blob/main/versions.json", deploymentUrl: null, publishedAt: null }, evidence: [{ label: "Migration PR", url: "https://github.com/0xMiden/docs/pull/368" }] }),
  component("agentic-template", "Agentic template", { status: "not-started" }),
  component("tutorials", "Tutorials", { deps: [{ label: "MidenBank Web SDK", version: "0.15.0", raw: "^0.15.0", targetTrain: "0.16", onTarget: false, url: "https://github.com/0xMiden/tutorials/blob/main/MidenBank/package.json" }] }),
];
const workItem = (id: string, over: Partial<BlockerView> = {}): BlockerView => ({
  id, title: "Refresh docs", severity: "medium", category: "migration", kind: "pull-request", stage: "docs", owner: null,
  exitCondition: "Publish the v0.16 snapshot", nextDecisionDate: null, url: "https://github.com/0xMiden/docs/pull/368",
  live: { state: "open", checkedAt: at }, ...over,
});
const work = [
  workItem("docs"),
  workItem("old", { title: "Superseded fix", category: "follow-up", stage: "protocol", owner: "Past assignee", nextDecisionDate: "2026-09-01", live: { state: "closed", checkedAt: at } }),
  workItem("merged", { title: "Shipped fix", live: { state: "merged", checkedAt: at } }),
  workItem("risk", { title: "Verify regression", category: "blocker", stage: "protocol", severity: "critical", nextDecisionDate: "2026-09-02", live: { state: "unknown", checkedAt: at, error: "GitHub unavailable" } }),
];
const show = () => render(<ReleaseWorkTable components={components} work={work} generatedAt={at} />);
const row = (id: string) => screen.getByTestId(`work-row-${id}`);
const rowIds = () => screen.getAllByTestId(/^work-row-/).map((item) => item.getAttribute("data-testid"));

describe("ReleaseWorkTable", () => {
  it("includes components and open work, excluding merged and closed items from rows and counts", () => {
    show();
    expect(screen.getByRole("status")).toHaveTextContent("6 of 6 items");
    expect(screen.queryByText("Superseded fix")).not.toBeInTheDocument();
    expect(screen.queryByText("Shipped fix")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^History/ })).not.toBeInTheDocument();
    expect(row("component-agentic-template")).toBeInTheDocument();
    expect(row("component-docs")).toHaveTextContent("Brian");
    expect(row("component-docs")).toHaveTextContent("Not published");
    expect(row("work-docs")).toHaveTextContent("Unassigned");
    expect(row("work-docs")).toHaveTextContent("Decision dateNot set");
    expect(row("work-docs")).not.toHaveTextContent("Brian");
    expect(within(row("component-protocol")).getByText("2026-09-07 08:00:00 UTC")).toHaveAttribute("datetime", "2026-09-07T08:00:00Z");
    expect(screen.queryByText("2026-09-01")).not.toBeInTheDocument();
    expect(screen.getByText("2026-09-02")).toHaveClass("text-tone-red");
  });

  it("keeps only active issues and PRs when switching views", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: /^Actions/ }));
    expect(screen.getByRole("status")).toHaveTextContent("5 of 6 items");
    expect(screen.queryByTestId("work-row-component-protocol")).not.toBeInTheDocument();
    expect(screen.queryByTestId("work-row-work-old")).not.toBeInTheDocument();
    expect(row("work-risk")).toHaveTextContent("Unknown");
    fireEvent.click(screen.getByRole("button", { name: /^Components/ }));
    expect(rowIds()).toHaveLength(4);
    expect(row("component-agentic-template")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^All/ }));
    expect(rowIds()).toHaveLength(6);
    expect(screen.queryByTestId("work-row-work-merged")).not.toBeInTheDocument();
    expect(screen.queryByTestId("work-row-work-old")).not.toBeInTheDocument();
  });

  it("intersects group, type, and search filters and recovers from no results", () => {
    show();
    fireEvent.change(screen.getByRole("combobox", { name: "Group" }), { target: { value: "devex" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Type" }), { target: { value: "migration" } });
    expect(rowIds()).toEqual(["work-row-work-docs"]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "agentic" } });
    expect(screen.getByText("No items match these filters.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all work" }));
    expect(screen.getByRole("status")).toHaveTextContent("6 of 6 items");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "agentic" } });
    expect(rowIds()).toEqual(["work-row-component-agentic-template"]);
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "MidenBank" } });
    expect(rowIds()).toEqual(["work-row-component-tutorials"]);
  });

  it("sorts visible rows from keyboard-accessible column buttons", () => {
    show();
    const sort = screen.getByRole("button", { name: "Sort by Work item" });
    fireEvent.click(sort);
    expect(sort.closest("th")).toHaveAttribute("aria-sort", "ascending");
    expect(rowIds()[0]).toBe("work-row-component-agentic-template");
    fireEvent.click(sort);
    expect(sort.closest("th")).toHaveAttribute("aria-sort", "descending");
    expect(rowIds()[0]).toBe("work-row-work-risk");
    fireEvent.click(screen.getByRole("button", { name: "Sort by Date" }));
    expect(rowIds().slice(0, 2)).toEqual(["work-row-work-risk", "work-row-component-protocol"]);
  });

  it("retains docs snapshot, migration, and Bank dependency evidence in expandable rows", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Show details for Docs" }));
    const docs = screen.getByTestId("component-docs");
    expect(docs).toHaveTextContent("SnapshotNot created");
    expect(docs).toHaveTextContent("PublicationNot published");
    expect(within(docs).getByRole("link", { name: "Migration PR" })).toHaveAttribute("href", "https://github.com/0xMiden/docs/pull/368");
    expect(screen.getByRole("button", { name: "Hide details for Docs" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Show details for Tutorials" }));
    expect(screen.queryByTestId("component-docs")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "MidenBank Web SDK" })).toHaveAttribute("href", "https://github.com/0xMiden/tutorials/blob/main/MidenBank/package.json");
    expect(screen.getByTestId("component-tutorials")).toHaveTextContent("0.15.0 ✗");
    fireEvent.click(screen.getByRole("button", { name: "Show details for Refresh docs" }));
    expect(screen.getByText("Publish the v0.16 snapshot")).toBeInTheDocument();
    expect(screen.getByTestId("component-docs")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show details for Verify regression" }));
    expect(screen.getByText("GitHub unavailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide details for Verify regression" }));
    expect(screen.queryByText("GitHub unavailable")).not.toBeInTheDocument();
  });

  it("removes newly merged work even after clearing filters", () => {
    const { rerender } = show();
    fireEvent.click(screen.getByRole("button", { name: /^Actions/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "Type" }), { target: { value: "migration" } });
    expect(rowIds()).toEqual(["work-row-work-docs"]);
    rerender(<ReleaseWorkTable components={components} work={work.map((item) => item.id === "docs" ? { ...item, live: { state: "merged", checkedAt: at } } : item)} generatedAt={at} />);
    expect(screen.getByText("No items match these filters.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.queryByTestId("work-row-work-docs")).not.toBeInTheDocument();
    expect(row("component-docs")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("5 of 5 items");
  });

  it("shows a direct GitHub URL without requiring row expansion", () => {
    show();
    const link = within(row("work-docs")).getByRole("link", { name: "View Refresh docs: https://github.com/0xMiden/docs/pull/368" });
    expect(link).toHaveTextContent("github.com/0xMiden/docs/pull/368");
    expect(link).toHaveAttribute("href", "https://github.com/0xMiden/docs/pull/368");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("button", { name: "Show details for Refresh docs" })).toHaveAttribute("aria-expanded", "false");
  });

  it("distinguishes an empty dataset from an empty filter result", () => {
    render(<ReleaseWorkTable components={[]} work={[]} generatedAt={at} />);
    expect(screen.getByText("No components or release work tracked for this version.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show all work" })).not.toBeInTheDocument();
  });
});

it("searches and sorts next actions while keeping reviewers separate from assignees", () => {
  const waiting = workItem("review", {owner:"implementer", workflow:{draft:false,reviewers:["reviewer"],checks:"passing",openedAt:at,readyAt:null,mergedAt:null}});
  render(<ReleaseWorkTable components={components} work={[waiting]} generatedAt={at} />);
  expect(row("work-review")).toHaveTextContent("Review requested");
  expect(row("work-review")).toHaveTextContent("Waiting on reviewer");
  expect(row("work-review")).toHaveTextContent("implementer");
  fireEvent.change(screen.getByRole("searchbox"),{target:{value:"reviewer"}});
  expect(rowIds()).toEqual(["work-row-work-review"]);
  fireEvent.click(screen.getByRole("button",{name:"Sort by Next action"}));
  expect(screen.getByRole("columnheader",{name:/Next action/})).toHaveAttribute("aria-sort","ascending");
  fireEvent.click(screen.getByRole("button",{name:"Show details for Refresh docs"}));
  expect(screen.getByText("Migration milestones")).toBeInTheDocument();
});

it("shows Bridge Portal's historical release without claiming it shipped on the selected train", () => {
  const latest = {tagName:"v0.1.0",prerelease:false,publishedAt:"2026-07-23T06:56:31Z",htmlUrl:"https://github.com/0xMiden/bridge-portal/releases/tag/v0.1.0"};
  const bridge = component("bridge-portal","Bridge Portal",{group:"app",expectedVersion:null,status:"not-started",latestStable:"0.1.0",releaseTiming:{source:"github-release",historyComplete:true,latest,latestOnTrain:null,firstStable:null,stableState:"unknown",history:[]}});
  render(<ReleaseWorkTable components={[bridge]} work={[]} generatedAt={at} />);
  expect(row("component-bridge-portal")).toHaveTextContent("Applications");
  expect(row("component-bridge-portal")).toHaveTextContent("v0.1.0Latest (any train)");
  expect(row("component-bridge-portal")).toHaveTextContent("Latest release (any train)");
  expect(row("component-bridge-portal")).toHaveTextContent("2026-07-23 06:56:31 UTC");
  fireEvent.click(screen.getByRole("button",{name:/Show details for Bridge Portal/}));
  expect(screen.getAllByText("Latest release (any train)")).toHaveLength(2);
});
