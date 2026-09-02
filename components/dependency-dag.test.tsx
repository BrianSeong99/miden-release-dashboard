import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ComponentStatus, PioneerView, RollupStatus } from "@/lib/types";
import { DependencyDag } from "./dependency-dag";

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
  comp("guardian", "app", ["rust-sdk", "web-sdk"]),
  comp("wallet", "app", ["web-sdk", "guardian"]),
  comp("docs", "devex", ["rust-sdk", "web-sdk"], { status: "compatible", tone: "green" }),
  comp("midenup", "devex", ["rust-sdk", "node"], { status: "compatible", tone: "green" }),
];

const rollup: RollupStatus = { status: "compatible", tone: "green", reason: "all good" };

const pioneers: PioneerView[] = [
  {
    partner: "NubX", milestone: "m", releaseDependency: "Web SDK", dependsOn: ["web-sdk"],
    status: "on-track", tone: "green", owner: "Brian", nextDecisionDate: "2026-09-07",
  },
  {
    partner: "Lumina", milestone: "m", releaseDependency: "Guardian", dependsOn: ["guardian"],
    status: "at-risk", tone: "amber", owner: "Brian", nextDecisionDate: "2026-09-07",
  },
];

const dag = () => <DependencyDag components={components} devexRollup={rollup} pioneers={pioneers} />;

describe("DependencyDag", () => {
  it("renders one node per chain component plus the DevEx and Pioneers roll-ups", () => {
    render(dag());
    for (const id of ["vm", "protocol", "node", "rust-sdk", "web-sdk", "guardian", "wallet", "devex", "pioneers"]) {
      expect(screen.getByTestId(`dag-node-${id}`)).toBeInTheDocument();
    }
    // devex children are not their own nodes
    expect(screen.queryByTestId("dag-node-docs")).not.toBeInTheDocument();
    // pioneers roll up to the worst status, always marked manual
    expect(screen.getByTestId("dag-node-pioneers")).toHaveTextContent("At risk");
    expect(screen.getByTestId("dag-node-pioneers")).toHaveTextContent("manual");
  });

  it("draws one edge per dependsOn relation plus deduped devex edges", () => {
    const { container } = render(dag());
    // chain edges: vm->protocol, protocol->node, protocol->rust, node->rust,
    // protocol->web, node->web, rust->guardian, web->guardian, web->wallet,
    // guardian->wallet = 10; devex: rust, web, node = 3 (docs+midenup deduped);
    // pioneers: web-sdk, guardian = 2
    const paths = container.querySelectorAll("svg path:not(marker path)");
    expect(paths.length).toBe(15);
  });

  it("lays nodes out in dependency layers, left to right", () => {
    render(dag());
    const left = (id: string) =>
      Number.parseFloat(screen.getByTestId(`dag-node-${id}`).style.left);
    expect(left("vm")).toBeLessThan(left("protocol"));
    expect(left("protocol")).toBeLessThan(left("node"));
    expect(left("node")).toBeLessThan(left("rust-sdk"));
    expect(left("rust-sdk")).toBe(left("web-sdk")); // same layer, stacked
    expect(left("guardian")).toBeLessThan(left("wallet"));
    expect(left("wallet")).toBeLessThan(left("devex"));
    expect(left("devex")).toBeLessThan(left("pioneers"));
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

  it("clicking the DevEx node shows the surfaces list, actually expanded", () => {
    render(dag());
    fireEvent.click(screen.getByTestId("dag-node-devex"));
    expect(screen.getByTestId("dag-detail")).toHaveTextContent("docs");
    expect(screen.getByTestId("dag-detail")).toHaveTextContent("midenup");
    const details = screen.getByTestId("dag-detail").querySelector("details");
    expect(details?.open).toBe(true);
  });

  it("clicking the Pioneers node shows the partner cards", () => {
    render(dag());
    fireEvent.click(screen.getByTestId("dag-node-pioneers"));
    expect(screen.getByTestId("dag-detail")).toHaveTextContent("NubX");
    expect(screen.getByTestId("dag-detail")).toHaveTextContent("Lumina");
  });

  it("announces dependencies to screen readers", () => {
    render(dag());
    expect(screen.getByTestId("dag-node-wallet")).toHaveTextContent("Depends on web-sdk and guardian");
  });

  it("shows status tone and version on each node", () => {
    render(dag());
    const protocol = screen.getByTestId("dag-node-protocol");
    expect(protocol).toHaveTextContent("Blocked");
    expect(protocol).toHaveTextContent("0.16.0-rc.3");
  });
});
