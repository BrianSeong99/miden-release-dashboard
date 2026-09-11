import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ComponentStatus, ReleaseTiming } from "@/lib/types";
import { ComponentNode } from "./component-node";

const base: ComponentStatus = {
  id: "node",
  label: "Node",
  repo: "0xMiden/node",
  branch: "next",
  owner: "Node team",
  expectedVersion: "0.16.0",
  group: "chain",
  dependsOn: [],
  status: "rc-released",
  tone: "amber",
  manual: false,
  reason: "Prerelease v0.16.0-rc.3 is published",
  latestStable: "0.15.2",
  latestRc: "0.16.0-rc.3",
  matchedRelease: "0.16.0-rc.3",
  matchedPublishedAt: null,
  deps: [
    {
      label: "miden-protocol (Cargo.toml)",
      version: "0.16.0-rc.4",
      raw: "=0.16.0-rc.4",
      targetTrain: "0.16",
      onTarget: true,
      url: "https://github.com/0xMiden/node/blob/next/Cargo.toml",
    },
  ],
  evidence: [{ label: "release v0.16.0-rc.3", url: "https://github.com/x" }],
  blockerIds: [],
  errors: [],
};

const timing = (overrides: Partial<ReleaseTiming> = {}): ReleaseTiming => ({
  source: "github-release", historyComplete: true, latest: null, latestOnTrain: null,
  firstStable: null, stableState: "unreleased", history: [], ...overrides,
});

describe("ComponentNode", () => {
  it("keeps docs rows visible when snapshot evidence cannot be fetched", () => {
    render(<ComponentNode component={{ ...base, id: "docs", label: "Docs", status: "unknown", tone: "gray", docsSnapshot: null }} />);
    expect(screen.getByText("Snapshot").nextSibling).toHaveTextContent("Unknown");
    expect(screen.getByText("Publication").nextSibling).toHaveTextContent("Unknown");
    expect(screen.queryByText("Latest stable")).not.toBeInTheDocument();
  });

  it("shows snapshot and publication evidence for docs instead of GitHub release rows", () => {
    render(<ComponentNode component={Object.assign({ ...base, id: "docs", label: "Docs", expectedVersion: "0.16" }, {
      docsSnapshot: {
        version: "0.16", snapshotExists: false, published: false,
        snapshotUrl: "https://github.com/0xMiden/docs/blob/main/versions.json",
        deploymentUrl: null, publishedAt: null,
      },
    })} />);
    expect(screen.getByText("Snapshot")).toBeInTheDocument();
    expect(screen.getByText("Not created")).toBeInTheDocument();
    expect(screen.getByText("Publication").nextSibling).toHaveTextContent("Not published");
    expect(screen.getByText("Latest deployment").nextSibling).toHaveTextContent("Not published");
    expect(screen.queryByText("Latest stable")).not.toBeInTheDocument();
    expect(screen.queryByText("Latest RC")).not.toBeInTheDocument();
  });

  it("renders versions, owner, dep check and evidence", () => {
    render(<ComponentNode component={base} />);
    expect(screen.getByText("Node")).toBeInTheDocument();
    expect(screen.getByText("RC released")).toBeInTheDocument();
    expect(screen.getByText("0.15.2")).toBeInTheDocument();
    expect(screen.getByText(/0\.16\.0-rc\.4/)).toBeInTheDocument();
    expect(screen.getByText("Node team")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /release v0\.16\.0-rc\.3/ })).toBeInTheDocument();
    expect(screen.queryByText("Manual")).not.toBeInTheDocument();
  });

  it("unknown state shows the error and last-check context", () => {
    render(
      <ComponentNode
        component={{
          ...base,
          status: "unknown",
          tone: "gray",
          reason: "No usable evidence for this component",
          errors: ["GitHub rate limit exhausted — set GITHUB_TOKEN"],
          deps: [],
          evidence: [],
          latestStable: null,
          latestRc: null,
        }}
      />,
    );
    expect(screen.getByText("Released").nextSibling).toHaveTextContent("Unknown");
    expect(screen.getByText(/rate limit/)).toBeInTheDocument();
  });

  it("manual override always shows the Manual badge", () => {
    render(
      <ComponentNode
        component={{ ...base, manual: true, manualNote: "submodules deferred", status: "not-started", tone: "amber", reason: "Manually set" }}
      />,
    );
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });

  it("flags an on-train pin that lags the upstream's newest release", () => {
    render(
      <ComponentNode
        component={{
          ...base,
          deps: [{ ...base.deps[0], staleBehind: "0.16.0-rc.7" }],
        }}
      />,
    );
    expect(screen.getByText(/0\.16\.0-rc\.7 out/)).toBeInTheDocument();
  });

  it("blocked state renders red with the blocker reason", () => {
    render(
      <ComponentNode
        component={{ ...base, status: "blocked", tone: "red", reason: "2 open critical blockers: a, b" }}
      />,
    );
    expect(screen.getByText("Blocked")).toBeInTheDocument();
    expect(screen.getByText(/2 open critical blockers/)).toBeInTheDocument();
  });

  it("dates the release on the component's own version train", () => {
    render(<ComponentNode component={{ ...base, id: "vm", label: "Miden VM", expectedVersion: "0.29.0",
      matchedRelease: "0.29.4", matchedPublishedAt: "2026-09-09T06:30:45Z" }} now={Date.parse("2026-09-11T09:30:45Z")} />);
    expect(screen.getByText("Released").nextSibling).toHaveTextContent("2026-09-09 06:30:45 UTC");
    expect(screen.getByText("Released").nextSibling).toHaveTextContent("2d 3h ago");
  });

  it("labels docs time as the latest deployment rather than a first release", () => {
    render(<ComponentNode component={{ ...base, id: "docs", label: "Docs", docsSnapshot: {
      version: "0.16", snapshotExists: true, published: true,
      snapshotUrl: "https://github.com/0xMiden/docs/blob/main/versions.json",
      deploymentUrl: "https://github.com/0xMiden/docs/actions/runs/123", publishedAt: "2026-09-10T02:03:04Z",
    } }} />);
    expect(screen.getByText("Latest deployment").nextSibling).toHaveTextContent("2026-09-10 02:03:04 UTC");
    expect(screen.queryByText("Released")).not.toBeInTheDocument();
  });

  it.each([
    [timing({ source: "not-monitored", stableState: "not-monitored" }), "Not monitored"],
    [timing(), "Not released"],
    [timing({ stableState: "unknown", historyComplete: false, error: "GitHub unavailable" }), "Unknown"],
  ])("distinguishes absent publication evidence: %s", (releaseTiming, expected) => {
    render(<ComponentNode component={{ ...base, matchedRelease: null, releaseTiming }} />);
    expect(screen.getByText("Released").nextSibling).toHaveTextContent(expected);
  });

  it("does not call a known RC unreleased when its timestamp is unavailable", () => {
    render(<ComponentNode component={{ ...base, releaseTiming: timing() }} />);
    expect(screen.getByText("Released").nextSibling).toHaveTextContent("Unknown");
    expect(screen.queryByText("Not released")).not.toBeInTheDocument();
  });
});
