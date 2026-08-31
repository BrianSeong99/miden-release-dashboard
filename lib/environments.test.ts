import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchEnvSnapshot } from "./environments";

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, "../test/fixtures", name), "utf8");

function mockFetch(body: string, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body, { status })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchEnvSnapshot", () => {
  it("parses the real testnet payload", async () => {
    mockFetch(fixture("env-status-testnet.json"));
    const res = await fetchEnvSnapshot("https://status.testnet.miden.io/status");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.nodeVersion).toBe("0.15.0");
    expect(res.value.networkName).toBe("Testnet");
    expect(res.value.lastUpdated).toMatch(/^20/);
    expect(res.value.services.length).toBeGreaterThan(0);
  });

  it("parses the real devnet payload (different service list)", async () => {
    mockFetch(fixture("env-status-devnet.json"));
    const res = await fetchEnvSnapshot("https://status.devnet.miden.io/status");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.nodeVersion).toMatch(/^0\.16\./);
  });

  it("tolerates a missing RPC service", async () => {
    mockFetch(JSON.stringify({ services: [{ name: "Faucet", details: {} }], network_name: "X" }));
    const res = await fetchEnvSnapshot("https://example.com/status");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.nodeVersion).toBeNull();
  });

  it("degrades to an error on non-JSON and HTTP failures", async () => {
    mockFetch("<html>", 200);
    expect((await fetchEnvSnapshot("https://x/status")).ok).toBe(false);
    mockFetch("{}", 503);
    const res = await fetchEnvSnapshot("https://x/status");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("503");
  });

  it("truncates long free-form service names", async () => {
    mockFetch(JSON.stringify({ services: [{ name: "x".repeat(500), details: {} }] }));
    const res = await fetchEnvSnapshot("https://x/status");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.services[0].name.length).toBeLessThanOrEqual(61);
  });
});
