import { act, waitFor, within } from "@testing-library/react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { SWRConfig } from "swr";
import { expect, it, vi } from "vitest";
import type { DashboardSnapshot } from "@/lib/types";
import { DashboardClient } from "./dashboard-client";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

const builtAt = "2026-09-10T12:00:00.000Z";
const openedAt = "2026-09-10T16:48:00.000Z";
const initial: DashboardSnapshot = {
  generatedAt: builtAt,
  release: { name: "Miden v0.16", targetVersion: "0.16", targetDate: null },
  releases: [{ name: "Miden v0.16", targetVersion: "0.16", isDefault: true }],
  readiness: { level: "ready", readyCount: 1, totalCount: 1, criticalBlockerCount: 0 },
  components: [{
    id: "vm", label: "Miden VM", repo: "0xMiden/miden-vm", branch: "main", owner: "VM team",
    expectedVersion: "0.29.0", group: "chain", dependsOn: [], status: "stable-released",
    tone: "green", manual: false, reason: "Stable release published", latestStable: "0.29.4",
    latestRc: null, matchedRelease: "0.29.4", matchedPublishedAt: builtAt,
    deps: [], evidence: [], blockerIds: [], errors: [],
  }],
  rollups: [],
  environments: [],
  blockers: [],
};

it("hydrates a 288-minute-old dashboard with header freshness status and updates it after fetching fresh data", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(builtAt));
  const fresh: DashboardSnapshot = {
    ...initial,
    generatedAt: openedAt,
    components: [{ ...initial.components[0], latestStable: "0.29.5", matchedRelease: "0.29.5" }],
  };
  let resolveFetch!: (response: Response) => void;
  const pendingResponse = new Promise<Response>((resolve) => { resolveFetch = resolve; });
  const fetch = vi.fn(() => pendingResponse);
  vi.stubGlobal("fetch", fetch);
  const element = (
    <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
      <DashboardClient initial={initial} />
    </SWRConfig>
  );
  const container = document.createElement("div");
  container.innerHTML = renderToString(element);
  document.body.appendChild(container);
  const originalHeading = within(container).getByRole("heading", { name: "Miden Release Dashboard" });
  const onRecoverableError = vi.fn();
  let root: Root | undefined;
  try {
    vi.setSystemTime(new Date(openedAt));
    await act(async () => {
      root = hydrateRoot(container, element, { onRecoverableError });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(within(container).getByRole("heading", { name: "Miden Release Dashboard" })).toBe(originalHeading);
    const freshness = within(container).getByRole("status");
    expect(freshness.closest("header")).not.toBeNull();
    expect(freshness).toHaveTextContent("Refresh delayed · 288m old");
    expect(within(container).queryByRole("alert")).not.toBeInTheDocument();
    expect(container.querySelector("time")).toHaveTextContent("12:00:00 UTC");

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    await act(async () => {
      resolveFetch(new Response(JSON.stringify(fresh), { status: 200 }));
    });
    await waitFor(() => expect(within(container).getByRole("status")).toHaveTextContent("Scheduled every 15 minutes"));
    expect(container.querySelector("time")).toHaveAttribute("datetime", openedAt);
    expect(container.querySelector("time")).toHaveTextContent("16:48:00 UTC");
    expect(within(container).getByTestId("dag-node-vm")).toHaveTextContent("0.29.5");
    expect(onRecoverableError).not.toHaveBeenCalled();
  } finally {
    await act(async () => root?.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
