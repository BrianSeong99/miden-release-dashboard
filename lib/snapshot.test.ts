import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// unstable_cache needs a request context; the orchestrator is tested bare.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
}));

import { buildSnapshot } from "./snapshot";

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, "../test/fixtures", name), "utf8");

/** Route every upstream URL the orchestrator hits to a canned payload.
 * Fixtures are real recorded API responses (2026-08-31); the rest are
 * minimal synthetic manifests that keep each component on the 0.16 train. */
function route(url: string): { body: string; status: number } {
  const u = new URL(url);
  if (u.hostname.startsWith("status.testnet")) return { body: fixture("env-status-testnet.json"), status: 200 };
  if (u.hostname.startsWith("status.devnet")) return { body: fixture("env-status-devnet.json"), status: 200 };
  if (u.pathname.endsWith("/releases")) return { body: fixture("releases-protocol.json"), status: 200 };
  if (/\/issues\/\d+$/.test(u.pathname)) {
    return {
      body: JSON.stringify({ state: "open", title: "t", html_url: `https://github.com${u.pathname}` }),
      status: 200,
    };
  }
  if (u.pathname.includes("/contents/")) {
    const file = decodeURIComponent(u.pathname.split("/contents/")[1]);
    const repo = u.pathname.split("/repos/")[1].split("/contents/")[0];
    if (repo === "0xMiden/agentic-template") {
      // submodule pointer lookup
      return {
        body: JSON.stringify({ type: "submodule", sha: "c5c3ad1e71b8213cc24397fcbe8eeed93ea00c17" }),
        status: 200,
      };
    }
    if (repo === "0xMiden/protocol") return { body: fixture("protocol-cargo.toml"), status: 200 };
    if (repo === "0xMiden/node") return { body: fixture("node-cargo.toml"), status: 200 };
    if (repo === "0xMiden/wallet") return { body: fixture("wallet-package.json"), status: 200 };
    if (repo === "0xMiden/docs") return { body: fixture("docs-release-manifest.yml"), status: 200 };
    if (repo === "0xMiden/midenup") return { body: fixture("midenup-channel-manifest.json"), status: 200 };
    if (file.endsWith("package.json")) {
      return {
        body: JSON.stringify({
          dependencies: { "@miden-sdk/miden-sdk": "0.16.0-rc.5", "@openzeppelin/guardian-client": "0.17.0-rc.1" },
        }),
        status: 200,
      };
    }
    return {
      body: '[workspace.dependencies]\nmiden-protocol = "0.16.0-rc.6"\nmiden-client = "0.16.0-rc.3"\nminen-nope = "0"\nmiden-node-proto-build = "0.16.0-rc.2"\n',
      status: 200,
    };
  }
  return { body: "not found", status: 404 };
}

afterEach(() => vi.unstubAllGlobals());

describe("buildSnapshot", () => {
  it("assembles the full dashboard from live-shaped payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const { body, status } = route(url);
        return new Response(body, { status });
      }),
    );

    const snap = await buildSnapshot();

    expect(snap.release.name).toBe("Miden v0.16");
    expect(snap.releases.map((r) => r.targetVersion)).toEqual(["0.15", "0.16", "0.17"]);
    expect(snap.releases.find((r) => r.isDefault)?.targetVersion).toBe("0.16");
    expect(snap.components).toHaveLength(13);
    expect(snap.blockers).toHaveLength(10);
    expect(snap.pioneers).toHaveLength(5);
    expect(snap.environments).toHaveLength(2);

    const byId = new Map(snap.components.map((c) => [c.id, c]));
    // Protocol & wallet carry open critical blockers → blocked outranks the RC.
    expect(byId.get("protocol")?.status).toBe("blocked");
    expect(byId.get("wallet")?.status).toBe("blocked");
    // Node: rc release + on-train exact pin.
    expect(byId.get("node")?.status).toBe("rc-released");
    // Docs manifest says next_version 0.16 → compatible.
    expect(byId.get("docs")?.status).toBe("compatible");
    // Agentic template is fully automated via submodule detectors now.
    expect(byId.get("agentic-template")?.manual).toBe(false);
    expect(byId.get("agentic-template")?.status).toBe("compatible");
    // Environments: devnet on the 0.16 train, testnet behind (recorded payloads).
    const envs = Object.fromEntries(snap.environments.map((e) => [e.id, e.status]));
    expect(envs).toEqual({ devnet: "current", testnet: "behind" });
    // Readiness reflects the blockers.
    expect(snap.readiness.level).toBe("blocked");
    expect(snap.readiness.criticalBlockerCount).toBe(5);
  });

  it("builds a past-release view: blockers filtered out, devnet reads ahead", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const { body, status } = route(url);
        return new Response(body, { status });
      }),
    );
    const snap = await buildSnapshot("0.15");
    expect(snap.release.targetVersion).toBe("0.15");
    expect(snap.blockers).toHaveLength(0); // all seed blockers gate 0.16
    const envs = Object.fromEntries(snap.environments.map((e) => [e.id, e.status]));
    // Recorded payloads: testnet runs 0.15.0 (current for this view), devnet
    // runs 0.16.0-rc.3 (a newer train -> ahead, not "behind").
    expect(envs).toEqual({ devnet: "ahead", testnet: "current" });
  });

  it("degrades every failed source to Unknown without breaking the page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 })),
    );
    const snap = await buildSnapshot();
    expect(snap.components).toHaveLength(13);
    for (const c of snap.components) {
      // Blockers' live state is unknown → conservatively blocking for critical
      // stages; everything else has no evidence → unknown. Manual stays manual.
      if (c.manual) continue;
      expect(["unknown", "blocked"]).toContain(c.status);
    }
    expect(snap.environments.every((e) => e.status === "unknown")).toBe(true);
    expect(snap.blockers.every((b) => b.live.state === "unknown")).toBe(true);
  });
});
