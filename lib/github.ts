import { err, ok, safeFetch, truncate } from "./fetch-utils";
import type { GhRelease, IssueLiveState, ReleaseHistory, Result, WorkEvidence } from "./types";
import { z } from "zod";

// Server-side GitHub REST adapter. GITHUB_TOKEN is read here and nowhere else;
// it never reaches the browser (only derived public data ends up in the
// snapshot). Without a token the unauthenticated 60/hr limit is far below the
// ~30 calls a refresh makes, so failures carry a "set GITHUB_TOKEN" hint.

const API = "https://api.github.com";

function headers(accept: string): Record<string, string> {
  const h: Record<string, string> = {
    Accept: accept,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "miden-release-dashboard",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function ghError(res: globalThis.Response, what: string): Promise<string> {
  if (
    (res.status === 403 || res.status === 429) &&
    res.headers.get("x-ratelimit-remaining") === "0"
  ) {
    return `GitHub rate limit exhausted while fetching ${what} — set GITHUB_TOKEN`;
  }
  let detail = "";
  try {
    const body = (await res.json()) as { message?: string };
    if (body.message) detail = `: ${body.message}`;
  } catch {
    // non-JSON body; status alone is enough
  }
  return truncate(`GitHub ${res.status} for ${what}${detail}`);
}

const releasePageSchema = z.array(z.object({
  tag_name: z.string(),
  prerelease: z.boolean(),
  draft: z.boolean(),
  published_at: z.string().nullable(),
  html_url: z.string(),
}));

/** Bounded release history. Incomplete history must never prove a debut date. */
export async function listReleaseHistory(repo: string): Promise<Result<ReleaseHistory>> {
  const releases: GhRelease[] = [];
  const visited = new Set<string>();
  let url = `${API}/repos/${repo}/releases?per_page=100`;
  const incomplete = (error: string) => ok({ releases, complete: false, error: truncate(error) });
  for (let page = 0; page < 3; page++) {
    visited.add(url);
    const res = await safeFetch(url, { headers: headers("application/vnd.github+json") });
    if (!res.ok) return page === 0 ? err(res.error) : incomplete(res.error);
    if (!res.value.ok) {
      const error = await ghError(res.value, `${repo} releases`);
      return page === 0 ? err(error) : incomplete(error);
    }
    try {
      const body = releasePageSchema.parse(await res.value.json());
      releases.push(...body.filter((r) => !r.draft).map((r) => ({
        tagName: r.tag_name, prerelease: r.prerelease, publishedAt: r.published_at, htmlUrl: r.html_url,
      })));
    } catch {
      const message = `unreadable releases payload for ${repo}`;
      return page === 0 ? err(message) : incomplete(message);
    }
    const links = res.value.headers.get("link") ?? "";
    const next = [...links.matchAll(/<([^>]+)>\s*;\s*rel="([^"]+)"/g)]
      .find((match) => match[2].split(/\s+/).includes("next"))?.[1];
    if (!next) return ok({ releases, complete: true });
    try {
      const candidate = new URL(next);
      candidate.searchParams.set("per_page", "100");
      // GitHub can canonicalize a named-repo endpoint to its numeric repo ID.
      const allowedPath = candidate.pathname.toLowerCase() === `/repos/${repo}/releases`.toLowerCase()
        || /^\/repositories\/\d+\/releases$/.test(candidate.pathname);
      if (candidate.origin !== API || candidate.username || candidate.password || !allowedPath || visited.has(candidate.href)) {
        return incomplete(`Invalid release pagination link for ${repo}`);
      }
      url = candidate.href;
    } catch {
      return incomplete(`Invalid release pagination link for ${repo}`);
    }
  }
  return incomplete(`Release history page limit reached for ${repo}`);
}

/** Compatibility view for callers that need release evidence without timing. */
export async function listReleases(repo: string): Promise<Result<GhRelease[]>> {
  const history = await listReleaseHistory(repo);
  return history.ok ? { ...history, value: history.value.releases } : history;
}

/** Raw file contents at a ref (the component's monitored branch). */
export async function getRawFile(
  repo: string,
  path: string,
  ref: string,
): Promise<Result<string>> {
  const url = `${API}/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`;
  const res = await safeFetch(url, { headers: headers("application/vnd.github.raw+json") });
  if (!res.ok) return err(res.error);
  if (!res.value.ok) return err(await ghError(res.value, `${repo}/${path}@${ref}`));
  return ok(await res.value.text());
}

/** JSON metadata inside a repository; consumers validate the endpoint shape. */
export async function getRepoJson(repo: string, path: string): Promise<Result<unknown>> {
  const res = await safeFetch(`${API}/repos/${repo}/${path}`, {
    headers: headers("application/vnd.github+json"),
  });
  if (!res.ok) return err(res.error);
  if (!res.value.ok) return err(await ghError(res.value, `${repo}/${path}`));
  try {
    return ok(await res.value.json());
  } catch {
    return err(`unreadable GitHub JSON for ${repo}/${path}`);
  }
}

/** Live state for an issue OR a pull request — the issues endpoint serves
 * both, and `pull_request.merged_at` distinguishes merged from closed without
 * a second round-trip. */
export async function getIssueState(
  repo: string,
  number: number,
): Promise<Result<IssueLiveState>> {
  const url = `${API}/repos/${repo}/issues/${number}`;
  const res = await safeFetch(url, { headers: headers("application/vnd.github+json") });
  if (!res.ok) return err(res.error);
  if (!res.value.ok) return err(await ghError(res.value, `${repo}#${number}`));
  try {
    const body = (await res.value.json()) as {
      state: "open" | "closed";
      title: string;
      html_url: string;
      assignees?: Array<{ login: string }>;
      pull_request?: { merged_at: string | null };
    };
    return ok({
      state: body.state,
      isPr: body.pull_request !== undefined,
      merged: Boolean(body.pull_request?.merged_at),
      title: body.title,
      htmlUrl: body.html_url,
      assignees: (body.assignees ?? []).map((assignee) => assignee.login),
    });
  } catch (e) {
    return err(`unreadable issue payload for ${repo}#${number}: ${e instanceof Error ? e.message : e}`);
  }
}

/** The commit SHA a git submodule is pinned to on the given ref. */
export async function getSubmodulePointer(
  repo: string,
  path: string,
  ref: string,
): Promise<Result<string>> {
  const url = `${API}/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`;
  const res = await safeFetch(url, { headers: headers("application/vnd.github+json") });
  if (!res.ok) return err(res.error);
  if (!res.value.ok) return err(await ghError(res.value, `${repo}/${path}@${ref}`));
  try {
    const body = (await res.value.json()) as { type?: string; sha?: string };
    if (body.type !== "submodule" || typeof body.sha !== "string") {
      return err(`${repo}/${path}@${ref} is not a submodule`);
    }
    return ok(body.sha);
  } catch (e) {
    return err(`unreadable submodule payload for ${repo}/${path}: ${e instanceof Error ? e.message : e}`);
  }
}

export function blobUrl(repo: string, ref: string, path: string): string {
  return `https://github.com/${repo}/blob/${encodeURIComponent(ref)}/${path}`;
}

const prSchema = z.object({
  draft: z.boolean(), created_at: z.iso.datetime(), merged_at: z.iso.datetime().nullable(),
  requested_reviewers: z.array(z.object({ login: z.string() })),
  requested_teams: z.array(z.object({ slug: z.string() })).optional(),
  head: z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/) }),
});

/** Current head checks and actual ready-for-review events; no synthetic dates. */
export async function getWorkEvidence(repo: string, number: number): Promise<Result<WorkEvidence>> {
  const detail = await getRepoJson(repo, `pulls/${number}`);
  if (!detail.ok) return detail;
  const parsed = prSchema.safeParse(detail.value);
  if (!parsed.success) return err("PR workflow metadata unavailable");
  const pr = parsed.data;
  const [checks, statuses, timeline] = await Promise.all([
    getRepoJson(repo, `commits/${pr.head.sha}/check-runs?per_page=100`),
    getRepoJson(repo, `commits/${pr.head.sha}/status?per_page=100`),
    getRepoJson(repo, `issues/${number}/timeline?per_page=100`),
  ]);
  const cs = z.object({ total_count: z.number(), check_runs: z.array(z.object({ status: z.string(), conclusion: z.string().nullable() })) });
  const ss = z.object({ state: z.string(), total_count: z.number(), statuses: z.array(z.unknown()) });
  const c = checks.ok ? cs.safeParse(checks.value) : null;
  const s = statuses.ok ? ss.safeParse(statuses.value) : null;
  let checkState: WorkEvidence["checks"] = "unknown";
  if (c?.success && s?.success && c.data.total_count === c.data.check_runs.length && s.data.total_count === s.data.statuses.length) {
    const runs = c.data.check_runs;
    if (runs.some((r) => r.status === "completed" && !["success", "neutral", "skipped"].includes(r.conclusion ?? "")) || ["failure", "error"].includes(s.data.state)) checkState = "failing";
    else if (runs.some((r) => r.status !== "completed") || (s.data.total_count > 0 && s.data.state === "pending")) checkState = "pending";
    else if (runs.length + s.data.total_count > 0) checkState = "passing";
  }
  const events = z.array(z.object({ event: z.string(), created_at: z.iso.datetime().optional() })).safeParse(timeline.ok ? timeline.value : null);
  // 100 events could be a truncated first page; don't infer a current review start.
  let readyAt: string | null = null;
  if (events.success && events.data.length < 100 && !pr.draft) {
    for (const event of events.data) {
      if (event.event === "convert_to_draft") readyAt = null;
      if (event.event === "ready_for_review") readyAt = event.created_at ?? null;
    }
  }
  return ok({ draft: pr.draft, reviewers: [...pr.requested_reviewers.map((r) => r.login), ...(pr.requested_teams ?? []).map((t) => `team:${t.slug}`)],
    checks: checkState, openedAt: pr.created_at, mergedAt: pr.merged_at, readyAt,
    error: checkState === "unknown" ? "Complete CI evidence unavailable; check GitHub before merging" : undefined });
}

export async function resolveReleaseRef(repo: string, tag: string): Promise<Result<string>> {
  const response = await getRepoJson(repo, `commits/${encodeURIComponent(tag)}`);
  if (!response.ok) return response;
  const parsed = z.object({ sha: z.string().regex(/^[a-f0-9]{40}$/) }).safeParse(response.value);
  return parsed.success ? ok(parsed.data.sha) : err(`Release commit could not be verified for ${tag}`);
}
