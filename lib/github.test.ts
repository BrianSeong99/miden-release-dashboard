import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getIssueState, getRawFile, getSubmodulePointer, listReleaseHistory, listReleases } from "./github";

const fixture = (name: string) =>
  fs.readFileSync(path.join(__dirname, "../test/fixtures", name), "utf8");

let lastRequest: { url: string; init?: RequestInit } | null = null;

function mockFetch(body: string, status = 200, headers: Record<string, string> = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      lastRequest = { url, init };
      return new Response(body, { status, headers });
    }),
  );
}

beforeEach(() => {
  lastRequest = null;
  delete process.env.GITHUB_TOKEN;
});
afterEach(() => vi.unstubAllGlobals());

describe("listReleases", () => {
  it("maps tags and prerelease flags, dropping drafts", async () => {
    mockFetch(fixture("releases-protocol.json"));
    const res = await listReleases("0xMiden/protocol");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value[0].tagName).toMatch(/^v0\.16\.0-rc\./);
    expect(res.value[0].prerelease).toBe(true);
    expect(res.value.every((r) => r.htmlUrl.startsWith("https://"))).toBe(true);
  });

  it("reports rate-limit exhaustion with a token hint", async () => {
    mockFetch("{}", 403, { "x-ratelimit-remaining": "0" });
    const res = await listReleases("0xMiden/protocol");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("GITHUB_TOKEN");
  });

  it("sends the token only when configured", async () => {
    mockFetch("[]");
    await listReleases("0xMiden/protocol");
    expect((lastRequest?.init?.headers as Record<string, string>).Authorization).toBeUndefined();
    process.env.GITHUB_TOKEN = "test-token";
    await listReleases("0xMiden/protocol");
    expect((lastRequest?.init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-token",
    );
  });
});

describe("listReleaseHistory", () => {
  const release = (tag: string) => ({
    tag_name: tag, prerelease: false, draft: false, published_at: "2026-09-01T12:00:00Z",
    html_url: `https://github.com/x/y/releases/tag/${tag}`,
  });

  it("follows GitHub next links with 100 releases per page and preserves distinct raw tags", async () => {
    const fetch = vi.fn(async (url: string) => new URL(url).searchParams.get("page") === "2"
      ? new Response(JSON.stringify([release("v0.16.0")]))
      : new Response(JSON.stringify([release("V0.16.0")]), {
          headers: { link: '<https://api.github.com/repositories/123/releases?per_page=100&page=2>; rel="next", <https://api.github.com/repositories/123/releases?per_page=100&page=2>; rel="last"' },
        }));
    vi.stubGlobal("fetch", fetch);
    const result = await listReleaseHistory("x/y");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.complete).toBe(true);
    expect(result.value.releases.map((r) => r.tagName)).toEqual(["V0.16.0", "v0.16.0"]);
    expect(fetch.mock.calls.map(([url]) => new URL(url).searchParams.get("per_page"))).toEqual(["100", "100"]);
  });

  it("marks capped history incomplete instead of claiming the first release was found", async () => {
    const fetch = vi.fn(async (url: string) => {
      const page = Number(new URL(url).searchParams.get("page") ?? 1);
      return new Response(JSON.stringify([release(`v0.16.${page}`)]), {
        headers: { link: `<https://api.github.com/repos/x/y/releases?per_page=100&page=${page + 1}>; rel="next"` },
      });
    });
    vi.stubGlobal("fetch", fetch);
    const result = await listReleaseHistory("x/y");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ complete: false, error: expect.stringContaining("limit") });
    expect(result.value.releases).toHaveLength(3);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("keeps already-fetched history when a later page fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => new URL(url).searchParams.has("page")
      ? new Response(JSON.stringify({ message: "Unavailable" }), { status: 503 })
      : new Response(JSON.stringify([release("v0.16.1")]), {
          headers: { link: '<https://api.github.com/repos/x/y/releases?per_page=100&page=2>; rel="next"' },
        })));
    const result = await listReleaseHistory("x/y");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({ complete: false, error: expect.stringContaining("503") });
    expect(result.value.releases.map((r) => r.tagName)).toEqual(["v0.16.1"]);
  });

  it("does not follow pagination links to another origin", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const fetch = vi.fn(async () => new Response(JSON.stringify([release("v0.16.0")]), {
      headers: { link: '<https://untrusted.example/releases?page=2>; rel="next"' },
    }));
    vi.stubGlobal("fetch", fetch);
    const result = await listReleaseHistory("x/y");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.complete).toBe(false);
    expect(result.value.error).toContain("pagination");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("returns a failure when the first page is unreadable", async () => {
    mockFetch('{"message":"not a releases list"}');
    const result = await listReleaseHistory("x/y");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("unreadable releases");
  });
});

describe("getRawFile", () => {
  it("requests raw content at the given ref", async () => {
    mockFetch("file body");
    const res = await getRawFile("0xMiden/protocol", "Cargo.toml", "release/v0.16.0-rc");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toBe("file body");
    expect(lastRequest?.url).toContain("ref=release%2Fv0.16.0-rc");
    expect((lastRequest?.init?.headers as Record<string, string>).Accept).toBe(
      "application/vnd.github.raw+json",
    );
  });

  it("surfaces GitHub errors as Result errors", async () => {
    mockFetch(JSON.stringify({ message: "Not Found" }), 404);
    const res = await getRawFile("0xMiden/none", "x", "main");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("404");
  });
});

describe("getSubmodulePointer", () => {
  it("returns the pinned commit sha for a submodule entry", async () => {
    mockFetch(JSON.stringify({ type: "submodule", sha: "c5c3ad1e71b8213cc24397fcbe8eeed93ea00c17" }));
    const res = await getSubmodulePointer("0xMiden/agentic-template", "frontend-template", "main");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toBe("c5c3ad1e71b8213cc24397fcbe8eeed93ea00c17");
  });

  it("rejects paths that are not submodules", async () => {
    mockFetch(JSON.stringify({ type: "file", sha: "abc" }));
    const res = await getSubmodulePointer("0xMiden/agentic-template", "README.md", "main");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("not a submodule");
  });
});

describe("getIssueState", () => {
  it("distinguishes a merged PR from a closed one via merged_at", async () => {
    mockFetch(
      JSON.stringify({
        state: "closed",
        title: "t",
        html_url: "https://github.com/x/y/pull/1",
        pull_request: { merged_at: "2026-08-01T00:00:00Z" },
      }),
    );
    const res = await getIssueState("x/y", 1);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.isPr).toBe(true);
    expect(res.value.merged).toBe(true);
  });

  it("reads plain issues", async () => {
    mockFetch(JSON.stringify({ state: "open", title: "t", html_url: "https://x" }));
    const res = await getIssueState("x/y", 2);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toMatchObject({ state: "open", isPr: false, merged: false, assignees: [] });
  });

  it("returns the current title and every GitHub assignee login", async () => {
    mockFetch(JSON.stringify({
      state: "open", title: "Clarify recovery behavior", html_url: "https://github.com/x/y/issues/3",
      assignees: [{ login: "alice", id: 1 }, { login: "bob", id: 2 }],
    }));
    const res = await getIssueState("x/y", 3);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.title).toBe("Clarify recovery behavior");
    expect(res.value.assignees).toEqual(["alice", "bob"]);
  });

  it("does not invent an owner when GitHub has no assignees", async () => {
    mockFetch(JSON.stringify({
      state: "open", title: "Unassigned issue", html_url: "https://github.com/x/y/issues/4",
      assignees: [], user: { login: "author-is-not-owner" },
    }));
    const res = await getIssueState("x/y", 4);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.assignees).toEqual([]);
  });
});
