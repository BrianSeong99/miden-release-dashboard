import { fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ComponentStatus, GhRelease } from "@/lib/types";
import { ReleaseTimingPanel } from "./release-timing-panel";

const at = "2026-09-11T12:00:00Z";
const release = (tagName: string, publishedAt: string): GhRelease => ({ tagName, publishedAt, prerelease: false, htmlUrl: `https://github.com/example/repo/releases/tag/${tagName}` });
const first = release("v0.16.0", "2026-09-05T12:00:00Z");
const later = release("v0.16.1", "2026-09-07T15:00:00Z");
function component(id: string, overrides: Partial<ComponentStatus> = {}): ComponentStatus {
  return { id, label: id, repo: `example/${id}`, branch: "main", owner: "Team", expectedVersion: "0.16", group: "chain", dependsOn: [],
    status: "stable-released", tone: "green", manual: false, reason: "Published", latestStable: "0.16.1", latestRc: null,
    matchedRelease: "0.16.1", matchedPublishedAt: later.publishedAt, deps: [], evidence: [], blockerIds: [], errors: [],
    releaseTiming: { source: "github-release", historyComplete: true, latest: later, latestOnTrain: later, firstStable: first, stableState: "published", history: [later, first] }, ...overrides };
}

describe("ReleaseTimingPanel", () => {
  it("shows UTC dates, evidence links and recent history separately from the first stable baseline", () => {
    render(<ReleaseTimingPanel components={[component("Protocol")]} generatedAt={at} releaseVersion="0.16" />);
    const table = screen.getByRole("region", { name: "Component release dates" });
    expect(within(table).getByText("First stable in train")).toBeInTheDocument();
    expect(within(table).getAllByText("2026-09-05 12:00:00 UTC").length).toBeGreaterThan(0);
    expect(within(table).getAllByRole("link", { name: "v0.16.0" })[0]).toHaveAttribute("href", first.htmlUrl);
    expect(within(table).getByText("Available releases in train (2)")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Export CSV" })).toHaveAttribute("download", "miden-0.16-components-timing.csv");
  });

  it("switches to signed release gaps and keeps unknown and unmonitored evidence explicit", () => {
    const upstream = component("Protocol");
    const sdk = component("SDK", { dependsOn: ["Protocol"], releaseTiming: { ...upstream.releaseTiming!, firstStable: later } });
    const early = component("Compiler", { dependsOn: ["Protocol"], releaseTiming: { ...upstream.releaseTiming!, firstStable: release("v0.10.0", "2026-09-04T12:00:00Z") } });
    const docs = component("Docs", { dependsOn: ["Protocol"], releaseTiming: { source: "docs-deployment", firstStable: null, latest: later, latestOnTrain: later, history: [], historyComplete: false, stableState: "not-monitored" } });
    render(<ReleaseTimingPanel components={[upstream,sdk,early,docs]} generatedAt={at} releaseVersion="0.16" />);
    expect(screen.getByText("First publication not tracked")).toBeInTheDocument();
    expect(screen.getByText("Latest docs deployment")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Dependency gaps" }));
    expect(screen.getByRole("button", { name: "Dependency gaps" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("2d 3h")).toBeInTheDocument();
    expect(screen.getByText("1d 0h earlier")).toBeInTheDocument();
    expect(screen.getByText("Downstream released first")).toBeInTheDocument();
    expect(screen.getByText("Release dates not tracked")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Export CSV" }).getAttribute("href")).toContain("calendar_release_gap_hours");
  });

  it("renders old snapshots without timing as unknown and keeps server age deterministic", () => {
    const components = [component("Old", { releaseTiming: undefined })];
    const html = renderToString(<ReleaseTimingPanel components={components} generatedAt={at} releaseVersion="0.16" />);
    expect(html).toContain("Unknown");
    const dated = renderToString(<ReleaseTimingPanel components={[component("Protocol")]} generatedAt={at} releaseVersion="0.16" />);
    expect(dated.replace(/<!--.*?-->/g, "")).toContain("6d 0h ago");
  });
});

it("shows merged migration evidence only in the timing view, with exportable gaps", () => {
  const work = [{id:"m",title:"Adopt protocol",kind:"pull-request",stage:"protocol",category:"migration",severity:"medium",owner:null,exitCondition:"Merge",nextDecisionDate:null,url:"https://github.com/o/r/pull/1",live:{state:"merged",checkedAt:at},workflow:{draft:false,reviewers:[],checks:"passing",openedAt:"2026-09-09T00:00:00Z",readyAt:"2026-09-10T00:00:00Z",mergedAt:"2026-09-11T00:00:00Z"}}] as import("@/lib/types").BlockerView[];
  render(<ReleaseTimingPanel components={[component("Protocol")]} work={work} generatedAt={at} releaseVersion="0.16" />);
  fireEvent.click(screen.getByRole("button",{name:"Migration flow"}));
  expect(screen.getByRole("region",{name:"Migration flow timing"})).toHaveTextContent("Adopt protocol");
  expect(screen.getByRole("link",{name:/Export CSV/}).getAttribute("href")).toContain("review_to_merge_hours");
});
