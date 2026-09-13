import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// unstable_cache needs a request context; the orchestrator is tested bare.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
}));

import { buildSnapshot } from "./snapshot";
import * as configuration from "./config";

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, "../test/fixtures", name), "utf8");

/** Route every upstream URL the orchestrator hits to a canned payload.
 * Fixtures are real recorded API responses (2026-08-31); the rest are
 * minimal synthetic manifests that keep each component on the 0.16 train. */
function route(url: string): { body: string; status: number } {
  const u = new URL(url);
  if (u.hostname.startsWith("status.testnet")) return { body: fixture("env-status-testnet.json"), status: 200 };
  if (u.hostname.startsWith("status.devnet")) return { body: fixture("env-status-devnet.json"), status: 200 };
  if (/\/commits\/[^/]+$/.test(u.pathname)) return { body: JSON.stringify({ sha: "b".repeat(40) }), status: 200 };
  if (u.hostname === "0xmiden.github.io") return { body: fixture("midenup-channel-manifest.json"), status: 200 };
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
        state: "open", title: `Current title for ${u.pathname.split("/").slice(-3).join("/")}`,
        html_url: `https://github.com${u.pathname.replace(/^\/repos/, "")}`,
        assignees: [],
        pull_request: /\/(docs|tutorials|frontend-template|project-template|agent-tools|miden-playground|miden-source-code-verification)\/issues\//.test(u.pathname)
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

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("buildSnapshot", () => {
  it("reads released dependencies from the release commit, never a newer development branch", async () => {
    const fetch = vi.fn(async (url: string) => {
      const u = new URL(url);
      if (u.pathname === "/repos/0xMiden/node/releases") return new Response(JSON.stringify([{ tag_name: "v0.16.0", prerelease: false, draft: false, published_at: "2026-09-10T00:00:00Z", html_url: "https://github.com/0xMiden/node/releases/tag/v0.16.0" }]));
      if (u.pathname === "/repos/0xMiden/node/contents/Cargo.toml") return new Response(`[dependencies]\nmiden-protocol = "${u.searchParams.get("ref") === "b".repeat(40) ? "0.16" : "0.17.0-rc.3"}"`);
      if (u.pathname === "/repos/0xMiden/node/contents/Cargo.lock") return new Response('[[package]]\nname="miden-protocol"\nversion="0.16.1"\nsource="registry+https://github.com/rust-lang/crates.io-index"');
      const {body,status} = route(url); return new Response(body,{status});
    });
    vi.stubGlobal("fetch",fetch);
    const snap = await buildSnapshot("0.16");
    const node = snap.components.find((c) => c.id === "node")!;
    expect(node.dependencyRef).toMatchObject({kind:"release",ref:"v0.16.0"});
    expect(node.deps[0]).toMatchObject({raw:"0.16",resolvedVersion:"0.16.1",resolution:"locked"});
    expect(fetch.mock.calls.filter(([url]) => url.includes("/node/contents/")).every(([url]) => new URL(url).searchParams.get("ref") === "b".repeat(40))).toBe(true);
  });

  it("does not fall back to the development branch when a release ref cannot be resolved", async () => {
    vi.stubGlobal("fetch",async (url: string) => {
      if (url.includes("/node/commits/")) return new Response("offline",{status:503});
      const {body,status} = route(url); return new Response(body,{status});
    });
    const node = (await buildSnapshot("0.16")).components.find((c) => c.id === "node")!;
    expect(node.deps.every((d) => d.onTarget === null && d.error)).toBe(true);
    expect(node.dependencyRef).toBeUndefined();
  });

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
    expect(snap.components.map((c) => c.id)).toEqual(expect.arrayContaining([
      "vm", "protocol", "node", "compiler", "debugger", "midenup", "docs", "tutorials", "project-template", "agent-tools",
    ]));
    expect(snap.blockers.some((b) => b.id === "protocol-fee-guarded-multisig")).toBe(true);
    expect(snap.environments).toHaveLength(2);
    expect(snap.rollups.map((r) => r.group)).toEqual(["devex", "walnut"]);

    const byId = new Map(snap.components.map((c) => [c.id, c]));
    // Curated follow-ups are visible work, not automatically release blockers.
    expect(byId.get("protocol")?.status).toBe("rc-released");
    expect(byId.get("protocol")?.releaseTiming).toMatchObject({
      source: "github-release", historyComplete: true, stableState: "unreleased", firstStable: null,
      latestOnTrain: { tagName: "v0.16.0-rc.7", publishedAt: "2026-08-31T11:13:17Z" },
    });
    expect(byId.get("wallet")?.status).not.toBe("blocked");
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
    // Recorded fixtures: missing Faucet version is unverified; failed testnet probe is partial.
    const envs = Object.fromEntries(snap.environments.map((e) => [e.id, e.status]));
    expect(envs).toEqual({ devnet: "unknown", testnet: "partial" });
    expect(snap.readiness.level).not.toBe("blocked");
    expect(snap.readiness.criticalBlockerCount).toBe(0);
  });

  it("recognizes active v16 DevEx migration while main dependencies still target v15", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = new URL(url);
      if (/\/repos\/0xMiden\/(tutorials|frontend-template|project-template)\/contents\//.test(u.pathname)) {
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
    expect(byId.get("project-template")?.status).toBe("migrating");
    expect(byId.get("agent-tools")?.status).toBe("migrating");
    expect(byId.get("midenup")?.status).toBe("prerelease-deps");
    expect(byId.get("tutorials")?.evidence.some((e) => e.url.endsWith("/pull/249"))).toBe(true);
    expect(snap.rollups.find((r) => r.group === "devex")?.rollup.tone).toBe("amber");
    for (const [stage, number] of [["docs", 357], ["docs", 368], ["tutorials", 249], ["frontend-template", 28], ["frontend-template", 29], ["project-template", 64], ["agent-tools", 17]] as const) {
      expect(snap.blockers.find((b) => b.stage === stage && b.url.endsWith(`/${number}`))).toMatchObject({
        category: "migration", kind: "pull-request", severity: "medium", owner: null, nextDecisionDate: null,
        live: { state: "open" },
      });
    }
  });

  it.each([
    { state: "open", mergedAt: null, status: "migrating", workState: "open" },
    { state: "closed", mergedAt: "2026-09-11T07:00:00Z", status: "unknown", workState: "merged" },
  ])("tracks agent-tools migration PR #17 as $workState without inventing a dependency pin", async ({ state, mergedAt, status: expectedStatus, workState }) => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/repos/0xMiden/agent-tools/issues/17")) {
        return new Response(JSON.stringify({
          state, title: "Update agent skills for v0.16", assignees: [],
          html_url: "https://github.com/0xMiden/agent-tools/pull/17", pull_request: { merged_at: mergedAt },
        }));
      }
      const { body, status } = route(url);
      return new Response(body, { status });
    }));
    const snap = await buildSnapshot("0.16");
    expect(snap.components.find((c) => c.id === "agent-tools")).toMatchObject({
      status: expectedStatus, deps: [], latestStable: null, matchedRelease: null,
    });
    expect(snap.blockers.find((b) => b.stage === "agent-tools")).toMatchObject({
      category: "migration", kind: "pull-request", title: "Update agent skills for v0.16",
      url: "https://github.com/0xMiden/agent-tools/pull/17", live: { state: workState },
    });
  });

  it("keeps tutorials migrating when MidenBank remains on v0.15 after the other tutorials migrate", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = new URL(url);
      if (u.pathname === "/repos/0xMiden/tutorials/issues/249") {
        return new Response(JSON.stringify({
          state: "closed", title: "Migrate tutorials except MidenBank", assignees: [],
          html_url: "https://github.com/0xMiden/tutorials/pull/249", pull_request: { merged_at: "2026-09-11T07:00:00Z" },
        }));
      }
      if (u.pathname.startsWith("/repos/0xMiden/tutorials/contents/")) {
        if (u.pathname.endsWith("examples/miden-bank/integration/Cargo.toml")) {
          return new Response('[dependencies]\nmiden-client = "0.15.3"\n');
        }
        return new Response(u.pathname.endsWith("package.json")
          ? JSON.stringify({ dependencies: { "@miden-sdk/miden-sdk": "0.16.0" } })
          : '[dependencies]\nmiden-client = "0.16.0"\n');
      }
      const { body, status } = route(url);
      return new Response(body, { status });
    }));
    const snap = await buildSnapshot("0.16");
    const tutorials = snap.components.find((c) => c.id === "tutorials")!;
    expect(tutorials.status).toBe("migrating");
    expect(tutorials.deps.find((d) => d.url?.endsWith("examples/miden-bank/integration/Cargo.toml"))).toMatchObject({
      version: "0.15.3", onTarget: false, provesComponent: "rust-sdk",
    });
    expect(tutorials.deps).toEqual(expect.arrayContaining([
      expect.objectContaining({ version: "0.16.0", onTarget: true, provesComponent: "rust-sdk" }),
      expect.objectContaining({ version: "0.16.0", onTarget: true, provesComponent: "web-sdk" }),
    ]));
    expect(snap.blockers.find((b) => b.stage === "tutorials")?.live.state).toBe("merged");
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
    expect(snap.blockers.find((b) => b.stage === "docs" && b.url.endsWith("/357"))?.live.state).toBe("merged");
    expect(snap.blockers.find((b) => b.stage === "docs" && b.url.endsWith("/368"))?.live.state).toBe("open");
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
    expect(snap.blockers).toHaveLength(0);
    expect(snap.components.find((c) => c.id === "docs")?.status).toBe("docs-published");
    expect(snap.components.find((c) => c.id === "docs")?.releaseTiming).toMatchObject({
      source: "docs-deployment", firstStable: null, stableState: "not-monitored",
      latest: { publishedAt: "2026-09-09T12:00:00Z" },
    });
    const envs = Object.fromEntries(snap.environments.map((e) => [e.id, e.status]));
    // Recorded payloads: testnet runs 0.15.0 (current for this view), devnet
    // runs 0.16.0-rc.3 (a newer train -> ahead, not "behind").
    expect(envs).toEqual({ devnet: "ahead", testnet: "partial" });
  });

  it("degrades every failed source to Unknown without breaking the page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 })),
    );
    const snap = await buildSnapshot();
    expect(snap.components.length).toBeGreaterThan(0);
    for (const c of snap.components) {
      if (c.manual) continue;
      expect(c.status).toBe("unknown");
      expect(c.releaseTiming?.firstStable).toBeNull();
    }
    expect(snap.environments.every((e) => e.status === "unknown")).toBe(true);
    expect(snap.blockers.every((b) => b.live.state === "unknown")).toBe(true);
    expect(snap.blockers.every((b) => b.kind === "unknown")).toBe(true);
    expect(snap.blockers.find((b) => b.stage === "project-template")).toMatchObject({
      category: "migration", title: "Project template #64", owner: null, nextDecisionDate: null,
    });
    expect(snap.readiness.criticalBlockerCount).toBe(0);
  });

  it("fetches a shared repository's release history once per build and derives each product separately", async () => {
    const config = configuration.loadConfig();
    const debuggerConfig = config.release.releases.find((r) => r.targetVersion === "0.16")!.components.find((c) => c.id === "debugger")!;
    // Synthetic shared publisher: today's compiler/debugger repos are separate.
    debuggerConfig.repo = "0xMiden/compiler";
    debuggerConfig.detectors = [{ type: "github-release", tagPrefixes: ["miden-debug-v"] }];
    vi.spyOn(configuration, "loadConfig").mockReturnValue(config);
    const fetch = vi.fn(async (url: string) => {
      if (new URL(url).pathname === "/repos/0xMiden/compiler/releases") {
        return new Response(JSON.stringify([
          { tag_name: "v0.10.1", prerelease: false, draft: false, published_at: "2026-09-02T12:00:00Z", html_url: "https://github.com/0xMiden/compiler/releases/tag/v0.10.1" },
          { tag_name: "miden-debug-v0.10.3", prerelease: false, draft: false, published_at: "2026-09-01T12:00:00Z", html_url: "https://github.com/0xMiden/compiler/releases/tag/miden-debug-v0.10.3" },
        ]));
      }
      const { body, status } = route(url);
      return new Response(body, { status });
    });
    vi.stubGlobal("fetch", fetch);
    const snap = await buildSnapshot("0.16");
    expect(fetch.mock.calls.filter(([url]) => new URL(url).pathname === "/repos/0xMiden/compiler/releases")).toHaveLength(1);
    expect(snap.components.find((c) => c.id === "compiler")?.releaseTiming?.firstStable?.tagName).toBe("v0.10.1");
    expect(snap.components.find((c) => c.id === "debugger")?.releaseTiming?.firstStable?.tagName).toBe("miden-debug-v0.10.3");
    await buildSnapshot("0.16");
    expect(fetch.mock.calls.filter(([url]) => new URL(url).pathname === "/repos/0xMiden/compiler/releases")).toHaveLength(2);
  });

  it.each([
    { tag: "v0.28.0", status: "unknown", matched: null },
    { tag: "v0.29.0", status: "stable-released", matched: "0.29.0" },
  ])("keeps $tag partial release evidence from proving missing or global latest releases", async ({ tag, status: expectedStatus, matched }) => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const u = new URL(url);
      if (u.pathname === "/repos/0xMiden/miden-vm/releases") {
        if (u.searchParams.has("page")) return new Response("{}", { status: 503 });
        return new Response(JSON.stringify([{
          tag_name: tag, prerelease: false, draft: false, published_at: "2026-09-01T12:00:00Z",
          html_url: `https://github.com/0xMiden/miden-vm/releases/tag/${tag}`,
        }]), { headers: { link: '<https://api.github.com/repos/0xMiden/miden-vm/releases?per_page=100&page=2>; rel="next"' } });
      }
      const { body, status } = route(url);
      return new Response(body, { status });
    }));
    const snap = await buildSnapshot("0.16");
    expect(snap.components.find((c) => c.id === "vm")).toMatchObject({
      status: expectedStatus, matchedRelease: matched, latestStable: null, latestRc: null,
      releaseTiming: { historyComplete: false, latest: null, latestOnTrain: null, firstStable: null, error: expect.stringContaining("503") },
    });
  });

  it("uses live GitHub titles and assignees, including an explicitly unassigned issue", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/repos/0xMiden/protocol/issues/3765")) {
        return new Response(JSON.stringify({
          state: "open", title: "Updated fee behavior", html_url: "https://github.com/0xMiden/protocol/pull/3765",
          assignees: [{ login: "alice" }, { login: "bob" }], pull_request: { merged_at: null },
        }));
      }
      const { body, status } = route(url);
      return new Response(body, { status });
    }));
    const snap = await buildSnapshot("0.16");
    expect(snap.blockers.find((b) => b.id === "protocol-fee-guarded-multisig")).toMatchObject({
      title: "Updated fee behavior", owner: "alice, bob", kind: "pull-request", category: "follow-up",
      url: "https://github.com/0xMiden/protocol/pull/3765", live: { state: "open" },
    });
    expect(snap.blockers.find((b) => b.id === "protocol-fee-conversion-drain")).toMatchObject({
      title: "Current title for protocol/issues/3763", owner: null, kind: "issue",
    });
  });

  it("preserves curated fallback information as unknown when GitHub fails", async () => {
    const config = configuration.loadConfig();
    config.blockers[0] = { ...config.blockers[0], title: "Confirmed fallback title", owner: "release-driver" };
    vi.spyOn(configuration, "loadConfig").mockReturnValue(config);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/repos/0xMiden/protocol/issues/3765")) return new Response("{}", { status: 500 });
      const { body, status } = route(url);
      return new Response(body, { status });
    }));
    const snap = await buildSnapshot("0.16");
    expect(snap.blockers.find((b) => b.id === config.blockers[0].id)).toMatchObject({
      title: "Confirmed fallback title", owner: "release-driver", kind: "unknown", live: { state: "unknown" },
    });
  });

  it("deduplicates migration references already curated and shares one issue lookup per build", async () => {
    const config = configuration.loadConfig();
    config.blockers.push({
      id: "tutorial-migration-review", category: "follow-up", title: "Review the tutorials migration",
      severity: "medium", release: "0.16", stage: "tutorials", owner: null, nextDecisionDate: null,
      exitCondition: "Review the migration", github: { repo: "0xMiden/tutorials", number: 249 },
    });
    vi.spyOn(configuration, "loadConfig").mockReturnValue(config);
    const fetch = vi.fn(async (url: string) => {
      const { body, status } = route(url);
      return new Response(body, { status });
    });
    vi.stubGlobal("fetch", fetch);
    const snap = await buildSnapshot("0.16");
    expect(snap.blockers.filter((b) => b.url.endsWith("/tutorials/issues/249"))).toHaveLength(1);
    expect(snap.blockers.find((b) => b.id === "tutorial-migration-review")?.category).toBe("follow-up");
    expect(fetch.mock.calls.filter(([url]) => url.endsWith("/repos/0xMiden/tutorials/issues/249"))).toHaveLength(1);
    await buildSnapshot("0.16");
    expect(fetch.mock.calls.filter(([url]) => url.endsWith("/repos/0xMiden/tutorials/issues/249"))).toHaveLength(2);
  });

  it("keeps node #2501 in the v0.17 work list and out of v0.16", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const { body, status } = route(url);
      return new Response(body, { status });
    }));
    const current = await buildSnapshot("0.16");
    const next = await buildSnapshot("0.17");
    expect(current.blockers.some((b) => b.id === "node-batch-fees")).toBe(false);
    expect(next.blockers.find((b) => b.id === "node-batch-fees")).toMatchObject({
      category: "follow-up", kind: "issue", stage: "node", live: { state: "open" },
    });
  });

  it.each([
    { state: "open", critical: 1, status: "blocked" },
    { state: "closed", critical: 0, status: "rc-released" },
    { state: "unknown", critical: 1, status: "blocked" },
  ])("counts a confirmed blocker with $state evidence without counting critical follow-ups", async ({ state, critical, status: expectedStatus }) => {
    const config = configuration.loadConfig();
    config.blockers[0].category = "blocker";
    vi.spyOn(configuration, "loadConfig").mockReturnValue(config);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.endsWith("/repos/0xMiden/protocol/issues/3765")) {
        return state === "unknown" ? new Response("{}", { status: 500 }) : new Response(JSON.stringify({
          state, title: "Confirmed release gate", html_url: "https://github.com/0xMiden/protocol/issues/3765", assignees: [],
        }));
      }
      const { body, status } = route(url);
      return new Response(body, { status });
    }));
    const snap = await buildSnapshot("0.16");
    expect(snap.readiness.criticalBlockerCount).toBe(critical);
    expect(snap.components.find((c) => c.id === "protocol")?.status).toBe(expectedStatus);
  });
});
