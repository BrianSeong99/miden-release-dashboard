import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ComponentStatus } from "@/lib/types";
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

describe("ComponentNode", () => {
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
    expect(screen.getByText("Unknown")).toBeInTheDocument();
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

  it("blocked state renders red with the blocker reason", () => {
    render(
      <ComponentNode
        component={{ ...base, status: "blocked", tone: "red", reason: "2 open critical blockers: a, b" }}
      />,
    );
    expect(screen.getByText("Blocked")).toBeInTheDocument();
    expect(screen.getByText(/2 open critical blockers/)).toBeInTheDocument();
  });
});
