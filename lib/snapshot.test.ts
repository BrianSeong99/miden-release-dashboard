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
  if (u.pathname === "/repos/0xMiden/docs/actions/workflows/deploy-docs.yml/runs") {
    return { body: JSON.stringify({ total_count: 1, workflow_runs: [{
      id: 123, head_sha: "a".repeat(40), head_branch: "main", status: "completed",
      conclusion: "success", html_url: "https://github.com/0xMiden/docs/actions/runs/123",
    }] }), status: 200 };
  }
  if (u.pathname === "/repos/0xMiden/docs/actions/runs/123/jobs") {
    return { body: JSON.stringify({ total_count: 1, jobs: [{
      status: "completed", conclusion: "success", completed_at: "2026-09-09T12:00:00Z",
      steps: [{ name: "Deploy to GitHub Pages", status: "completed", conclusion: "success" }],
    }] }), status: 200 };
  }
  if (/\/issues\/\d+$/.test(u.pathname)) {
    return {
      body: JSON.stringify({
        state: "open", title: "t", html_url: `https://github.com${u.pathname}`,
        pull_request: /\/(docs|tutorials|frontend-template|miden-playground|miden-source-code-verification)\/issues\//.test(u.pathname)
          ? { merged_at: null } : undefined,
      }),
      status: 200,
    };
  }
  if (u.pathname.includes("/contents/")) {
    const file = decodeURIComponent(u.pathname.split("/contents/")[1]);
    const repo = u.pathname.split("/repos/")[1].split("/contents/")[0];
    if (repo.startsWith("walnuthq/")) {
      // playground apps/web/package.json and SCV manifests: keep them on 0.15
      // so the walnut group reads Migrating (their 0.16 PRs are open).
      if (file.endsWith("package.json")) {
        return { body: JSON.stringify({ dependencies: { "@miden-sdk/miden-sdk": "0.15.9" } }), status: 200 };
      }
      return { body: '[dependencies]\nmiden-client = "0.15"\n', status: 200 };
    }
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
    if (repo === "0xMiden/docs") {
      if (file === "versions.json") return { body: '["0.15", "0.14"]', status: 200 };
      if (file === "versioned_docs/version-0.15") return { body: JSON.stringify([
        { type: "dir", name: "builder", path: "versioned_docs/version-0.15/builder" },
      ]), status: 200 };
      return { body: fixture("docs-release-manifest.yml"), status: 200 };
    }
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
    expect(snap.components).toHaveLength(17);
    expect(snap.blockers).toHaveLength(10);
    expect(snap.environments).toHaveLength(2);
    expect(snap.rollups.map((r) => r.group)).toEqual(["devex", "walnut"]);

    const byId = new Map(snap.components.map((c) => [c.id, c]));
    // Protocol & wallet carry open critical blockers → blocked outranks the RC.
    expect(byId.get("protocol")?.status).toBe("blocked");
    expect(byId.get("wallet")?.status).toBe("blocked");
    // Node: rc release + on-train exact pin.
    expect(byId.get("node")?.status).toBe("rc-released");
    // A next_version label is not a snapshot; open migration PRs show progress.
    expect(byId.get("docs")?.status).toBe("migrating");
    // Agentic template is fully automated via submodule detectors now.
    expect(byId.get("agentic-template")?.manual).toBe(false);
    expect(byId.get("agentic-template")?.status).toBe("prerelease-deps");
    // Walnut surfaces: 0.15 pins + open 0.16 migration PRs -> Migrating.
    expect(byId.get("playground")?.status).toBe("migrating");
    expect(byId.get("source-verification")?.status).toBe("migrating");
    // RC-skew: node pins protocol rc.4 while protocol's matched RC is rc.7.
    const nodeDep = byId.get("node")?.deps.find((d) => d.provesComponent === "protocol");
    expect(nodeDep?.staleBehind).toBe("0.16.0-rc.7");
    // Environments: devnet on the 0.16 train, testnet behind (recorded payloads).
    const envs = Object.fromEntries(snap.environments.map((e) => [e.id, e.status]));
    expect(envs).toEqual({ devnet: "current", testnet: "behind" });
    // Readiness reflects the blockers.
    expect(snap.readiness.level).toBe("blocked");
    expect(snap.readiness.criticalBlockerCount).toBe(5);
  });

  it("recognizes active v16 DevEx migration while main dependencies still target v15", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = new URL(url);
      if (/\/repos\/0xMiden\/(tutorials|frontend-template)\/contents\//.test(u.pathname)) {
        return new Response(u.pathname.endsWith("package.json")
          ? JSON.stringify({ dependencies: { "@miden-sdk/miden-sdk": "0.15.3" } })
          : '[dependencies]\nmiden-client = "0.15"\n');
      }
      const { body, status } = route(url);
      return new Response(body, { status });
    }));
    const snap = await buildSnapshot("0.16");
    const byId = new Map(snap.components.map((c) => [c.id, c]));
    expect(byId.get("docs")?.status).toBe("migrating");
    expect(byId.get("tutorials")?.status).toBe("migrating");
    expect(byId.get("frontend-template")?.status).toBe("migrating");
    expect(byId.get("project-template")?.status).toBe("prerelease-deps");
    expect(byId.get("midenup")?.status).toBe("prerelease-deps");
    expect(byId.get("tutorials")?.evidence.some((e) => e.url.endsWith("/pull/249"))).toBe(true);
    expect(snap.rollups.find((r) => r.group === "devex")?.rollup.tone).toBe("amber");
  });

  it("keeps docs in progress when one migration PR closes and another remains open", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/repos/0xMiden/docs/issues/357")) {
        return new Response(JSON.stringify({ state: "closed", title: "Migration guide", html_url: "https://github.com/0xMiden/docs/pull/357", pull_request: { merged_at: "2026-09-10T09:00:00Z" } }));
      }
      const { body, status } = route(url);
      return new Response(body, { status });
    }));
    const snap = await buildSnapshot("0.16");
    expect(snap.components.find((c) => c.id === "docs")?.status).toBe("migrating");
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
    expect(snap.components.find((c) => c.id === "docs")?.status).toBe("docs-published");
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
    expect(snap.components).toHaveLength(17);
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
