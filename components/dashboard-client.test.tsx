import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DashboardSnapshot } from "@/lib/types";
import { DashboardClient } from "./dashboard-client";

const at = "2026-08-31T12:00:00.000Z";

const snapshot: DashboardSnapshot = {
  generatedAt: new Date().toISOString(), // fresh so the stale banner stays hidden
  release: { name: "Miden v0.16", targetVersion: "0.16", targetDate: null },
  readiness: { level: "blocked", readyCount: 4, totalCount: 7, criticalBlockerCount: 5 },
  components: [
    {
      id: "vm", label: "Miden VM", repo: "0xMiden/miden-vm", branch: "next", owner: "VM team",
      expectedVersion: "0.30.0", group: "chain", dependsOn: [], status: "stable-released",
      tone: "green", manual: false, reason: "Stable v0.30.0 is published", latestStable: "0.30.0",
      latestRc: null, deps: [], evidence: [], blockerIds: [], errors: [],
    },
    {
      id: "docs", label: "Docs", repo: "0xMiden/docs", branch: "main", owner: "Brian",
      expectedVersion: "0.16", group: "devex", dependsOn: [], status: "compatible",
      tone: "green", manual: false, reason: "on train", latestStable: null, latestRc: null,
      deps: [], evidence: [], blockerIds: [], errors: [],
    },
  ],
  devexRollup: { status: "compatible", tone: "green", reason: "Every DevEx surface is compatible" },
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
  blockers: [],
  pioneers: [
    {
      partner: "NubX", milestone: "m", releaseDependency: "Web SDK 0.16", status: "on-track",
      tone: "green", owner: "Brian", nextDecisionDate: "2026-09-07",
    },
  ],
};

describe("DashboardClient", () => {
  it("renders all four sections from a full snapshot", () => {
    render(<DashboardClient initial={snapshot} />);
    expect(screen.getByRole("heading", { name: "Miden Release Dashboard" })).toBeInTheDocument();
    expect(screen.getAllByText("Miden v0.16").length).toBeGreaterThan(0);
    expect(screen.getByText("Miden VM")).toBeInTheDocument();
    expect(screen.getByText("DevEx")).toBeInTheDocument();
    expect(screen.getByText("0.16.0-rc.3")).toBeInTheDocument(); // devnet chip
    expect(screen.getByText("NubX")).toBeInTheDocument();
    // Pioneers are manual → badge present; automated VM card carries none.
    expect(screen.getAllByText("Manual").length).toBeGreaterThan(0);
    expect(screen.getByText(/No critical blockers/)).toBeInTheDocument();
  });
});
