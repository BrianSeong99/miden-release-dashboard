import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

import type { DashboardSnapshot } from "@/lib/types";
import { DashboardClient } from "./dashboard-client";

const at = "2026-08-31T12:00:00.000Z";

const snapshot: DashboardSnapshot = {
  generatedAt: new Date().toISOString(), // fresh so the stale banner stays hidden
  release: { name: "Miden v0.16", targetVersion: "0.16", targetDate: null },
  releases: [
    { name: "Miden v0.15", targetVersion: "0.15", isDefault: false },
    { name: "Miden v0.16", targetVersion: "0.16", isDefault: true },
    { name: "Miden v0.17", targetVersion: "0.17", isDefault: false },
  ],
  readiness: { level: "blocked", readyCount: 4, totalCount: 7, criticalBlockerCount: 2 },
  components: [
    {
      id: "vm", label: "Miden VM", repo: "0xMiden/miden-vm", branch: "next", owner: "VM team",
      expectedVersion: "0.30.0", group: "chain", dependsOn: [], status: "stable-released",
      tone: "green", manual: false, reason: "Stable v0.30.0 is published", latestStable: "0.30.0",
      latestRc: null, matchedRelease: "0.30.0", matchedPublishedAt: at, deps: [], evidence: [],
      blockerIds: [], errors: [],
    },
    {
      id: "protocol", label: "Protocol", repo: "0xMiden/protocol", branch: "next", owner: "Protocol team",
      expectedVersion: "0.16.0", group: "chain", dependsOn: ["vm"], status: "blocked",
      tone: "red", manual: false, reason: "1 open critical blocker", latestStable: null,
      latestRc: "0.16.0-rc.7", matchedRelease: "0.16.0-rc.7", matchedPublishedAt: at, deps: [],
      evidence: [], blockerIds: ["b1"], errors: [],
    },
    {
      id: "docs", label: "Docs", repo: "0xMiden/docs", branch: "main", owner: "Brian",
      expectedVersion: "0.16", group: "devex", dependsOn: [], status: "compatible",
      tone: "green", manual: false, reason: "on train", latestStable: null, latestRc: null,
      matchedRelease: null, matchedPublishedAt: null, deps: [], evidence: [], blockerIds: [], errors: [],
    },
  ],
  rollups: [
    { group: "devex", label: "DevEx", rollup: { status: "compatible", tone: "green", reason: "Every DevEx surface is compatible" } },
  ],
  environments: [
    {
      id: "devnet", label: "DevNet", status: "current", tone: "green", manual: false,
      version: "0.16.0-rc.3", reason: "All services on 0.16.0-rc.3", lastUpdated: at,
      checkedAt: at, statusUrl: "https://status.devnet.miden.io/status",
    },
    {
      id: "testnet", label: "Testnet", status: "behind", tone: "amber", manual: false,
      version: "0.15.0", reason: "Node runs 0.15.0, expected the 0.16.0 train", lastUpdated: at,
      checkedAt: at, statusUrl: "https://status.testnet.miden.io/status",
    },
  ],
  blockers: [
    {
      id: "b1", title: "Fee drain", severity: "critical", stage: "protocol", owner: "mmagician",
      exitCondition: "fix merged", nextDecisionDate: "2026-09-03",
      url: "https://github.com/0xMiden/protocol/issues/3763",
      live: { state: "open", checkedAt: at },
    },
    {
      id: "b2", title: "Faucet fee asset", severity: "high", stage: "protocol", owner: "Wiktor",
      exitCondition: "merged", nextDecisionDate: "2026-09-03",
      url: "https://github.com/0xMiden/protocol/pull/3766",
      live: { state: "merged", checkedAt: at },
    },
  ],
};

describe("DashboardClient", () => {
  it("renders overview, DAG, and blockers from a full snapshot", () => {
    render(<DashboardClient initial={snapshot} />);
    expect(screen.getByRole("heading", { name: "Miden Release Dashboard" })).toBeInTheDocument();
    expect(screen.getByText("Miden VM")).toBeInTheDocument();
    expect(screen.getByText("DevEx")).toBeInTheDocument();
    expect(screen.getByText("0.16.0-rc.3")).toBeInTheDocument(); // devnet chip
    expect(screen.getByText(/1 critical · 0 other open · 1 resolved/)).toBeInTheDocument();
  });

  it("surfaces the first blocked component in the Now-blocking callout", () => {
    render(<DashboardClient initial={snapshot} />);
    const callout = screen.getByTestId("now-blocking");
    expect(callout).toHaveTextContent("Protocol — 1 open critical (mmagician)");
    expect(callout).toHaveTextContent("next decision 2026-09-03");
  });

  it("renders the release dropdown with the viewed release selected", () => {
    render(<DashboardClient initial={snapshot} />);
    const select = screen.getByRole("combobox", { name: "Release" });
    expect(select).toHaveValue("0.16");
    const labels = [...select.querySelectorAll("option")].map((o) => o.textContent);
    expect(labels).toEqual(["v0.15", "v0.16 (current)", "v0.17"]);
  });
});
