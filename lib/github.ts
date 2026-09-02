import { err, ok, safeFetch, truncate } from "./fetch-utils";
import type { GhRelease, IssueLiveState, Result } from "./types";

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

export async function listReleases(repo: string): Promise<Result<GhRelease[]>> {
  const url = `${API}/repos/${repo}/releases?per_page=30`;
  const res = await safeFetch(url, { headers: headers("application/vnd.github+json") });
  if (!res.ok) return err(res.error);
  if (!res.value.ok) return err(await ghError(res.value, `${repo} releases`));
  try {
    const body = (await res.value.json()) as Array<{
      tag_name: string;
      prerelease: boolean;
      draft: boolean;
      published_at: string | null;
      html_url: string;
    }>;
    return ok(
      body
        .filter((r) => !r.draft)
        .map((r) => ({
          tagName: r.tag_name,
          prerelease: r.prerelease,
          publishedAt: r.published_at,
          htmlUrl: r.html_url,
        })),
    );
  } catch (e) {
    return err(`unreadable releases payload for ${repo}: ${e instanceof Error ? e.message : e}`);
  }
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
      pull_request?: { merged_at: string | null };
    };
    return ok({
      state: body.state,
      isPr: body.pull_request !== undefined,
      merged: Boolean(body.pull_request?.merged_at),
      title: body.title,
      htmlUrl: body.html_url,
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
