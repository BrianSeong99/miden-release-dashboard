import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ComponentStatus, GroupRollupView } from "@/lib/types";
import { DependencyDag } from "./dependency-dag";
import { loadConfig } from "@/lib/config";

const comp = (
  id: string,
  group: ComponentStatus["group"],
  dependsOn: string[],
  over: Partial<ComponentStatus> = {},
): ComponentStatus => ({
  id,
  label: id,
  repo: `0xMiden/${id}`,
  branch: "next",
  owner: "o",
  expectedVersion: "0.16.0",
  group,
  dependsOn,
  status: "rc-released",
  tone: "amber",
  manual: false,
  reason: `${id} reason`,
  latestStable: "0.15.0",
  latestRc: "0.16.0-rc.3",
  matchedRelease: "0.16.0-rc.3",
  matchedPublishedAt: null,
  deps: [],
  evidence: [],
  blockerIds: [],
  errors: [],
  ...over,
});

const components: ComponentStatus[] = [
  comp("vm", "chain", [], { status: "stable-released", tone: "green" }),
  comp("protocol", "chain", ["vm"], { status: "blocked", tone: "red" }),
  comp("node", "chain", ["protocol"]),
  comp("rust-sdk", "sdk", ["protocol", "node"]),
  comp("web-sdk", "sdk", ["protocol", "node"]),
  comp("guardian", "app", ["rust-sdk", "web-sdk"], { expectedVersion: "0.17.0" }),
  comp("wallet", "app", ["web-sdk", "guardian"]),
  comp("docs", "devex", ["rust-sdk", "web-sdk"], { status: "compatible", tone: "green" }),
  comp("midenup", "devex", ["rust-sdk", "node"], { status: "compatible", tone: "green" }),
  comp("playground", "walnut", ["web-sdk"], { status: "migrating", tone: "amber" }),
  comp("source-verification", "walnut", ["rust-sdk", "web-sdk"], { status: "migrating", tone: "amber" }),
];

const rollups: GroupRollupView[] = [
  { group: "devex", label: "DevEx", rollup: { status: "compatible", tone: "green", reason: "all good" } },
  { group: "walnut", label: "Walnut", rollup: { status: "in-progress", tone: "amber", reason: "upgrades open" } },
];

const dag = () => (
  <DependencyDag components={components} rollups={rollups} targetVersion="0.16" />
);

describe("DependencyDag", () => {
  it.each(["0.16", "0.17"])("shows the %s compiler/debugger topology and an inspectable midenup node", (train) => {
    const release = loadConfig().release.releases.find((r) => r.targetVersion === train)!;
    const configured = release.components.map((c) => comp(c.id, c.group, c.dependsOn, {
      label: c.label, expectedVersion: c.expectedVersion,
    }));
    render(<DependencyDag components={configured} rollups={rollups} targetVersion={train} />);
    const left = (id: string) => Number.parseFloat(screen.getByTestId(`dag-node-${id}`).style.left);
    expect(left("debugger")).toBeGreaterThan(left("vm"));
    expect(left("rust-sdk")).toBeGreaterThan(left("debugger"));
    if (train === "0.17") {
      expect(left("compiler")).toBe(left("debugger"));
      expect(screen.getByTestId("dag-node-compiler")).toHaveTextContent("Target version TBD");
    } else expect(left("compiler")).toBeGreaterThan(left("protocol"));
    expect(screen.getByTestId("dag-node-midenup")).toHaveTextContent(`Channel ${train}`);
    fireEvent.click(screen.getByTestId("dag-node-midenup"));
    expect(screen.getByTestId("dag-detail")).toHaveTextContent("Channel");
    expect(screen.getByTestId("dag-detail")).not.toHaveTextContent("Latest stable");
  });

  it("renders one node per chain component plus each roll-up group", () => {
    render(dag());
    for (const id of ["vm", "protocol", "node", "rust-sdk", "web-sdk", "guardian", "wallet", "devex", "walnut"]) {
      expect(screen.getByTestId(`dag-node-${id}`)).toBeInTheDocument();
    }
    // group members are not their own nodes
    expect(screen.queryByTestId("dag-node-docs")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dag-node-playground")).not.toBeInTheDocument();
    expect(screen.getByTestId("dag-node-walnut")).toHaveTextContent("In progress");
  });

  it("draws one edge per dependsOn relation plus deduped roll-up edges", () => {
    const { container } = render(dag());
    // chain: 10; devex: rust, web, node = 3; walnut: web, rust = 2
    const paths = container.querySelectorAll("svg path:not(marker path)");
    expect(paths.length).toBe(15);
  });

  it("lays nodes out in dependency layers, roll-ups stacked in a final column", () => {
    render(dag());
    const left = (id: string) =>
      Number.parseFloat(screen.getByTestId(`dag-node-${id}`).style.left);
    expect(left("vm")).toBeLessThan(left("protocol"));
    expect(left("rust-sdk")).toBe(left("web-sdk"));
    expect(left("wallet")).toBeLessThan(left("devex"));
    expect(left("devex")).toBe(left("walnut"));
  });

  it("spells out a component's own train when it differs from the release", () => {
    render(dag());
    expect(screen.getByTestId("dag-node-guardian")).toHaveTextContent("0.17 train");
    expect(screen.getByTestId("dag-node-node")).not.toHaveTextContent("train");
  });

  it("clicking a node opens its detail card; clicking again closes it", () => {
    render(dag());
    expect(screen.getByTestId("dag-detail")).toBeEmptyDOMElement();
    fireEvent.click(screen.getByTestId("dag-node-protocol"));
    expect(screen.getByTestId("dag-detail")).toHaveTextContent("protocol reason");
    expect(screen.getByTestId("dag-node-protocol")).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByTestId("dag-node-protocol"));
    expect(screen.getByTestId("dag-detail")).toBeEmptyDOMElement();
  });

  it("clicking a roll-up node shows its surfaces list, actually expanded", () => {
    render(dag());
    fireEvent.click(screen.getByTestId("dag-node-walnut"));
    expect(screen.getByTestId("dag-detail")).toHaveTextContent("playground");
    expect(screen.getByTestId("dag-detail")).toHaveTextContent("source-verification");
    const details = screen.getByTestId("dag-detail").querySelector("details");
    expect(details?.open).toBe(true);
  });

  it("announces dependencies to screen readers", () => {
    render(dag());
    expect(screen.getByTestId("dag-node-wallet")).toHaveTextContent("Depends on web-sdk and guardian");
  });
});
