import { z } from "zod";
import { err, ok } from "./fetch-utils";
import { getRawFile, getRepoJson } from "./github";
import type { Result } from "./types";

export interface DocsSnapshot {
  version: string;
  snapshotExists: boolean;
  published: boolean;
  snapshotUrl: string;
  deploymentUrl: string | null;
  publishedAt: string | null;
}

const versionsSchema = z.array(z.string().min(1));
const directorySchema = z.array(z.object({
  type: z.enum(["file", "dir"]),
  name: z.string().min(1),
  path: z.string().min(1),
})).min(1);
const runsSchema = z.object({
  total_count: z.number().int().nonnegative(),
  workflow_runs: z.array(z.object({
    id: z.number().int().positive(),
    head_sha: z.string().regex(/^[a-f0-9]{40}$/),
    head_branch: z.string(),
    status: z.literal("completed"),
    conclusion: z.literal("success"),
    html_url: z.url(),
  })),
});
const jobsSchema = z.object({
  total_count: z.number().int().nonnegative(),
  jobs: z.array(z.object({
    status: z.string(),
    conclusion: z.string().nullable(),
    completed_at: z.iso.datetime({ offset: true }).nullable().optional(),
    steps: z.array(z.object({
      name: z.string(),
      status: z.string(),
      conclusion: z.string().nullable(),
    })),
  })),
});

async function snapshotExists(repo: string, ref: string, version: string): Promise<Result<boolean>> {
  let parsed: z.infer<typeof versionsSchema>;
  try {
    const versions = await getRawFile(repo, "versions.json", ref);
    if (!versions.ok) return versions;
    parsed = versionsSchema.parse(JSON.parse(versions.value));
  } catch {
    return err(`Invalid versions.json in ${repo}@${ref}`);
  }
  if (!parsed.includes(version)) return ok(false);

  const path = `versioned_docs/version-${version}`;
  const listing = await getRepoJson(repo, `contents/${path}?ref=${encodeURIComponent(ref)}`);
  if (!listing.ok) return listing;
  const directory = directorySchema.safeParse(listing.value);
  if (!directory.success || directory.data.some((entry) => entry.path !== `${path}/${entry.name}`)) {
    return err(`Listed docs snapshot ${path} is missing or invalid in ${repo}@${ref}`);
  }
  return ok(true);
}

/** A checked-in Docusaurus snapshot is distinct from one in a Pages deployment. */
export async function getDocsSnapshot(
  repo: string,
  branch: string,
  version: string,
  workflow: string,
): Promise<Result<DocsSnapshot>> {
  const current = await snapshotExists(repo, branch, version);
  if (!current.ok) return current;
  const snapshot: DocsSnapshot = {
    version,
    snapshotExists: current.value,
    published: false,
    snapshotUrl: current.value
      ? `https://github.com/${repo}/tree/${encodeURIComponent(branch)}/versioned_docs/version-${version}`
      : `https://github.com/${repo}/blob/${encodeURIComponent(branch)}/versions.json`,
    deploymentUrl: null,
    publishedAt: null,
  };
  if (!current.value) return ok(snapshot);

  const runs = await getRepoJson(repo,
    `actions/workflows/${encodeURIComponent(workflow)}/runs?branch=${encodeURIComponent(branch)}&status=success&per_page=1`,
  );
  if (!runs.ok) return runs;
  const parsedRuns = runsSchema.safeParse(runs.value);
  if (!parsedRuns.success ||
      (parsedRuns.data.total_count === 0) !== (parsedRuns.data.workflow_runs.length === 0)) {
    return err(`Invalid deployment workflow runs for ${repo}/${workflow}`);
  }
  const run = parsedRuns.data.workflow_runs[0];
  if (!run) return ok(snapshot);
  if (run.head_branch !== branch) return err(`Deployment run does not match monitored branch ${branch}`);
  snapshot.deploymentUrl = run.html_url;

  const jobs = await getRepoJson(repo, `actions/runs/${run.id}/jobs?per_page=100`);
  if (!jobs.ok) return jobs;
  const parsedJobs = jobsSchema.safeParse(jobs.value);
  if (!parsedJobs.success || parsedJobs.data.total_count !== parsedJobs.data.jobs.length) {
    return err(`Invalid or incomplete deployment jobs for ${repo} run ${run.id}`);
  }
  const deployed = parsedJobs.data.jobs.find((job) =>
    job.status === "completed" && job.conclusion === "success" && job.steps.some((step) =>
      step.name === "Deploy to GitHub Pages" && step.status === "completed" && step.conclusion === "success",
    ),
  );
  if (!deployed) return ok(snapshot);

  // Check the deployed commit, never infer publication from newer branch files.
  const published = await snapshotExists(repo, run.head_sha, version);
  if (!published.ok) return published;
  if (!published.value) return ok(snapshot);
  return ok({
    ...snapshot,
    published: true,
    snapshotUrl: `https://github.com/${repo}/tree/${run.head_sha}/versioned_docs/version-${version}`,
    publishedAt: deployed.completed_at ?? null,
  });
}
