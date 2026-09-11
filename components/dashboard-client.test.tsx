import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

import type { DashboardSnapshot } from "@/lib/types";
import { DashboardClient } from "./dashboard-client";
import { SWRConfig } from "swr";

const at = "2026-08-31T12:00:00.000Z";

const snapshot: DashboardSnapshot = {
  generatedAt: new Date().toISOString(), // fresh so the header shows the normal schedule
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
      category: "blocker", kind: "issue",
      exitCondition: "fix merged", nextDecisionDate: "2026-09-03",
      url: "https://github.com/0xMiden/protocol/issues/3763",
      live: { state: "open", checkedAt: at },
    },
    {
      id: "b2", title: "Faucet fee asset", severity: "high", stage: "protocol", owner: "Wiktor",
      category: "follow-up", kind: "pull-request",
      exitCondition: "merged", nextDecisionDate: "2026-09-03",
      url: "https://github.com/0xMiden/protocol/pull/3766",
      live: { state: "merged", checkedAt: at },
    },
  ],
};

const renderDashboard = () => render(
  <SWRConfig value={{ provider: () => new Map(), errorRetryCount: 0, dedupingInterval: 0 }}>
    <DashboardClient initial={snapshot} />
  </SWRConfig>,
);

describe("DashboardClient", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => snapshot })));
  afterEach(() => vi.unstubAllGlobals());
  it("renders overview, DAG, and blockers from a full snapshot", () => {
    renderDashboard();
    expect(screen.getByRole("heading", { name: "Miden Release Dashboard" })).toBeInTheDocument();
    expect(screen.getAllByText("Miden VM").length).toBeGreaterThan(0);
    expect(screen.getByText("DevEx")).toBeInTheDocument();
    expect(screen.getByText("0.16.0-rc.3")).toBeInTheDocument(); // devnet chip
    expect(screen.getByText(/1 confirmed critical · 1 open · 1 closed\/merged/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Developer experience" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Release timing" })).toBeInTheDocument();
    expect(screen.getByTestId("component-docs")).toBeInTheDocument();
  });

  it("surfaces the first blocked component in the Now-blocking callout", () => {
    renderDashboard();
    const callout = screen.getByTestId("now-blocking");
    expect(callout).toHaveTextContent("Protocol — 1 open critical (mmagician)");
    expect(callout).toHaveTextContent("next decision 2026-09-03");
  });

  it("renders the release dropdown with the viewed release selected", () => {
    renderDashboard();
    const select = screen.getByRole("combobox", { name: "Release" });
    expect(select).toHaveValue("0.16");
    const labels = [...select.querySelectorAll("option")].map((o) => o.textContent);
    expect(labels).toEqual(["v0.15", "v0.16 (current)", "v0.17"]);
  });

  it("keeps the last snapshot on failure and lets the user retry a fresh deployment", async () => {
    const newer = { ...snapshot, generatedAt: "2026-09-11T06:12:12.000Z" };
    const fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValue({ ok: true, json: async () => newer });
    vi.stubGlobal("fetch", fetch);
    renderDashboard();
    expect(await screen.findByText(/Couldn’t check for newer data/)).toBeInTheDocument();
    expect(screen.getAllByText("Miden VM").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    await waitFor(() => expect(screen.queryByText(/Couldn’t check for newer data/)).not.toBeInTheDocument());
    expect(screen.getByText("06:12:12 UTC")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1]).toEqual({ cache: "no-store" });
  });

});
