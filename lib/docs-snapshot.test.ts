import { afterEach, describe, expect, it, vi } from "vitest";
import { getDocsSnapshot } from "./docs-snapshot";

const repo = "0xMiden/docs";
const sha = "a".repeat(40);
const runUrl = "https://github.com/0xMiden/docs/actions/runs/123";
const completedAt = "2026-09-10T07:00:00Z";
const directory = [{ type: "file", name: "index.md", path: "versioned_docs/version-0.16/index.md" }];
const run = { id: 123, head_sha: sha, head_branch: "main", status: "completed", conclusion: "success", html_url: runUrl };
const jobs = [{
  id: 456, status: "completed", conclusion: "success", completed_at: completedAt,
  steps: [{ name: "Deploy to GitHub Pages", status: "completed", conclusion: "success" }],
}];

type Reply = { body: unknown; status?: number };
function fixtures(overrides: Record<string, Reply> = {}) {
  const replies: Record<string, Reply> = {
    "contents/versions.json?ref=main": { body: ["0.16", "0.15"] },
    "contents/versioned_docs/version-0.16?ref=main": { body: directory },
    "actions/workflows/deploy-docs.yml/runs?branch=main&status=success&per_page=1": {
      body: { total_count: 1, workflow_runs: [run] },
    },
    "actions/runs/123/jobs?per_page=100": { body: { total_count: 1, jobs } },
    [`contents/versions.json?ref=${sha}`]: { body: ["0.16", "0.15"] },
    [`contents/versioned_docs/version-0.16?ref=${sha}`]: { body: directory },
    ...overrides,
  };
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const key = url.replace(`https://api.github.com/repos/${repo}/`, "");
    const reply = replies[key];
    if (!reply) return new Response(JSON.stringify({ message: `Unexpected request: ${key}` }), { status: 404 });
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
  }));
}

afterEach(() => vi.unstubAllGlobals());

describe("getDocsSnapshot", () => {
  it("proves publication from a completed Pages deploy containing the version at its exact commit", async () => {
    fixtures();
    const result = await getDocsSnapshot(repo, "main", "0.16", "deploy-docs.yml");
    expect(result).toMatchObject({ ok: true, value: {
      version: "0.16", snapshotExists: true, published: true,
      snapshotUrl: `https://github.com/0xMiden/docs/tree/${sha}/versioned_docs/version-0.16`,
      deploymentUrl: runUrl, publishedAt: completedAt,
    } });
  });

  it("reports no snapshot when the branch does not list the version without requiring deployment evidence", async () => {
    fixtures({ "contents/versions.json?ref=main": { body: ["0.15"] } });
    expect(await getDocsSnapshot(repo, "main", "0.16", "deploy-docs.yml")).toMatchObject({
      ok: true, value: {
        snapshotExists: false, published: false, deploymentUrl: null, publishedAt: null,
        snapshotUrl: "https://github.com/0xMiden/docs/blob/main/versions.json",
      },
    });
  });

  it.each([
    ["missing directory", { body: { message: "Not Found" }, status: 404 }],
    ["empty directory", { body: [] }],
    ["file instead of directory", { body: { type: "file", name: "version-0.16" } }],
    ["malformed directory listing", { body: [{}] }],
  ] as const)("treats a listed version with %s as unknown", async (_, reply) => {
    fixtures({ "contents/versioned_docs/version-0.16?ref=main": reply });
    expect((await getDocsSnapshot(repo, "main", "0.16", "deploy-docs.yml")).ok).toBe(false);
  });

  it.each([{}, ["0.16", null], "0.16"])("rejects malformed versions.json %j", async (body) => {
    fixtures({ "contents/versions.json?ref=main": { body } });
    expect((await getDocsSnapshot(repo, "main", "0.16", "deploy-docs.yml")).ok).toBe(false);
  });

  it("returns unknown when a versions response fails while reading its body", async () => {
    vi.stubGlobal("fetch", async () => new Response(new ReadableStream({
      start(controller) { controller.error(new Error("Connection interrupted")); },
    })));
    expect((await getDocsSnapshot(repo, "main", "0.16", "deploy-docs.yml")).ok).toBe(false);
  });

  it("keeps an existing snapshot unpublished when there has been no successful workflow run", async () => {
    fixtures({ "actions/workflows/deploy-docs.yml/runs?branch=main&status=success&per_page=1": {
      body: { total_count: 0, workflow_runs: [] },
    } });
    expect(await getDocsSnapshot(repo, "main", "0.16", "deploy-docs.yml")).toMatchObject({
      ok: true, value: { snapshotExists: true, published: false, deploymentUrl: null },
    });
  });

  it("does not confuse a snapshot merged after the deployment with a published snapshot", async () => {
    fixtures({ [`contents/versions.json?ref=${sha}`]: { body: ["0.15"] } });
    expect(await getDocsSnapshot(repo, "main", "0.16", "deploy-docs.yml")).toMatchObject({
      ok: true, value: { snapshotExists: true, published: false, deploymentUrl: runUrl, publishedAt: null },
    });
  });

  it.each(["skipped", "failure"])("does not treat a %s deployment step as publication", async (conclusion) => {
    fixtures({ "actions/runs/123/jobs?per_page=100": { body: { total_count: 1, jobs: [{
      ...jobs[0], steps: [{ name: "Deploy to GitHub Pages", status: "completed", conclusion }],
    }] } } });
    expect(await getDocsSnapshot(repo, "main", "0.16", "deploy-docs.yml")).toMatchObject({
      ok: true, value: { snapshotExists: true, published: false, publishedAt: null },
    });
  });

  it("requires a Pages deployment step rather than just a successful build", async () => {
    fixtures({ "actions/runs/123/jobs?per_page=100": { body: { total_count: 1, jobs: [{
      ...jobs[0], steps: [{ name: "Build website", status: "completed", conclusion: "success" }],
    }] } } });
    expect(await getDocsSnapshot(repo, "main", "0.16", "deploy-docs.yml")).toMatchObject({
      ok: true, value: { published: false },
    });
  });

  it.each([
    ["workflow API failure", "actions/workflows/deploy-docs.yml/runs?branch=main&status=success&per_page=1", { body: {}, status: 503 }],
    ["malformed runs", "actions/workflows/deploy-docs.yml/runs?branch=main&status=success&per_page=1", { body: {} }],
    ["wrong branch", "actions/workflows/deploy-docs.yml/runs?branch=main&status=success&per_page=1", { body: { total_count: 1, workflow_runs: [{ ...run, head_branch: "preview" }] } }],
    ["missing run commit", "actions/workflows/deploy-docs.yml/runs?branch=main&status=success&per_page=1", { body: { total_count: 1, workflow_runs: [{ ...run, head_sha: null }] } }],
    ["jobs API failure", "actions/runs/123/jobs?per_page=100", { body: {}, status: 403 }],
    ["malformed jobs", "actions/runs/123/jobs?per_page=100", { body: { jobs: [{}] } }],
    ["incomplete job listing", "actions/runs/123/jobs?per_page=100", { body: { total_count: 2, jobs } }],
    ["missing published directory", `contents/versioned_docs/version-0.16?ref=${sha}`, { body: { message: "Not Found" }, status: 404 }],
  ] as const)("returns unknown for %s instead of guessing publication", async (_, path, reply) => {
    fixtures({ [path]: reply });
    expect((await getDocsSnapshot(repo, "main", "0.16", "deploy-docs.yml")).ok).toBe(false);
  });

  it("accepts a successful deployment without an optional completion timestamp", async () => {
    fixtures({ "actions/runs/123/jobs?per_page=100": { body: { total_count: 1, jobs: [{ ...jobs[0], completed_at: null }] } } });
    expect(await getDocsSnapshot(repo, "main", "0.16", "deploy-docs.yml")).toMatchObject({
      ok: true, value: { published: true, publishedAt: null },
    });
  });
});
