# Miden Release Dashboard

Internal dashboard answering **"where is the next Miden release across the dependency chain?"**
— automated GitHub + network monitoring for the protocol stack, compiler, debugger, SDKs,
applications and midenup, with DevEx and Walnut (Playground, Source verification) roll-ups.
The dashboard also includes DevNet/Testnet deployment visibility and tracked release work:
confirmed blockers, follow-ups and migrations. A release dropdown switches between the trains declared in `config/release.yaml`
(past, current and upcoming). Pins that lag their upstream's newest RC are flagged inline —
the layered-RC-skew problem the team otherwise reconstructs by hand.

The map uses five horizontal lanes grouped by purpose: Protocol, Build & tooling, SDKs,
Applications and Developer surfaces. Cards sharing a row or column do not imply a dependency;
only arrows do. Select a card to isolate its incoming and outgoing connections and inspect its
evidence. Select it again to restore all connections. Lane labels remain visible while scrolling.

## How data flows

- **Automated:** GitHub releases + dependency manifests per component (`config/release.yaml`
  defines the repo, monitored branch and detectors), the network monitor JSON at
  `status.{devnet,testnet}.miden.io/status`, and GitHub titles, assignees and issue/PR states
  for configured work and migration PRs.
  GitHub Pages serves generated per-release JSON. Deployment is scheduled every 15 minutes;
  GitHub can delay or drop scheduled runs. The browser checks those files every minute,
  bypassing cached snapshots; **Check for updates** retries immediately. A failed source degrades
  the affected evidence to **Unknown** — never a guess.
- **Manual:** work selection, release view, category, severity, dependencies and tracked criteria
  in `config/blockers.yaml`, plus any `manual-override` detector. Manual data is badged. Edit via PR.
  Owner and next-decision date must be explicit: use `null` when unconfirmed, rather than inventing
  an owner or deadline. Empty/missing fields still fail validation; every record needs a criterion.

## Release work

One table includes every configured component, including DevEx and Walnut surfaces, alongside
open blockers, follow-ups and migration PRs. **All** shows components and open or unverified work;
**Actions** shows unfinished components and that work; **Components** shows component rows.
Merged and closed work is omitted from every work-table view and count. It remains available in the timing history. A component remains visible even when
it has no open tracked work. Each issue or PR has a visible GitHub URL directly in its row.

Combine the group and type filters with search across work, components, owners, versions and
dependency checks. Sort by work item, group, component, state, next action, owner/assignee or date. State sorts
by attention priority; missing owners and dates remain last in either direction. Clear filters
restores all rows when a combination has no matches.

Expand a row for component checks and source links, including Docs snapshot/publication evidence,
Tutorials' MidenBank dependency and migration PRs. Work details also show the curated scope, exit
criterion and context. Component state, owner and publication/deployment date remain separate from
issue/PR state, assignee and decision date; closing work does not establish component readiness.

### Evidence and classification

- `category: blocker` means a confirmed release gate; `follow-up` tracks other work or risk;
  `migration` tracks version adoption. Category defaults to `follow-up`. Severity alone does not
  establish a release gate. A release view groups related work without proving that every entry
  blocks that release or currently affects its shipped artifacts.
- GitHub supplies current titles, assignees and issue/PR state; curated titles and owners are
  fallbacks when evidence is unavailable. Work with no GitHub assignee stays visibly unassigned.
  GitHub authorship does not establish ownership.
- Completed issues, merged PRs and PRs closed without merge remain in the source snapshots for
  evidence but do not appear as work rows. Closure or merge alone does not prove shipment.
  Source-backed criteria may record replacement PRs and published-tag inclusion when those have been checked.
- The original August 31 seed owners and September 3/7 dates were unconfirmed drafts. These are
  now null. Node fee collection is tracked under 0.17 following the upstream 0.17.1 plan;
  multisig sponsorship and wallet recovery remain follow-ups with current applicability unconfirmed.

## Release timing

Component details show exact publication timestamps in UTC and elapsed age. The **Release timing**
view separates the first stable release on the selected component train, its latest release on that
train, and the latest publication across all versions. Publication chronology uses GitHub's
`published_at`, not semantic-version order or the time this dashboard refreshed. Product tag filters
still apply; Guardian, Wallet, VM and tools keep their independently configured version trains.

**Dependency gaps** compare the first stable publications along each configured dependency edge.
Positive gaps, open waits, and downstream releases that preceded upstream stable remain distinct.
Open waits are measured at the snapshot's observation time. These calendar intervals establish a
release-flow baseline; they do not prove dependency adoption, active engineering time, causality or
individual performance. Patch releases cannot reset the first-stable baseline.

The existing release selector lets you compare past/current/upcoming trains; **Export CSV** downloads
the selected component or dependency table with UTC timestamps, signed numeric gaps and source URLs.
GitHub history reconstructs these baselines on every refresh, without introducing a database or
inventing historical observations. Available on-train history shows up to eight releases. History is
fetched in pages of 100, up to three pages per repository. Missing pages, failed sources or invalid
dates remain explicit; incomplete history cannot establish first or latest publication dates.

Docs show the **latest verified deployment** containing their snapshot, which may be a redeployment.
That date never stands in for first publication. Manifest-only components remain **Not tracked** for
release timing: a current dependency pin alone cannot tell us when adoption happened.

## Docs and DevEx evidence

- **Docs:** `docs-snapshot` checks that `versions.json` lists the target version and
  `versioned_docs/version-<version>` contains files. An open migration PR means **Migrating**;
  otherwise a missing snapshot means **Awaiting snapshot**. A checked-in snapshot is
  **Snapshot created** until publication is verified.
- **Publication:** the latest successful `deploy-docs.yml` run on the monitored branch must
  contain a successful **Deploy to GitHub Pages** step. The snapshot must also exist at
  that run's exact commit. A target label such as `next_version` does not prove publication.
- **Tutorials and templates:** configured open migration PRs show **Migrating**. Dependency
  pins must all be verified and stable to show **Compatible**; alpha/RC pins show amber
  **Prerelease deps**. Tutorial evidence includes the separate MidenBank integration pin because
  the current tutorial migration excludes it. Project-template skills and Agent tools have their
  own migration evidence. Agent tools is a skills-only surface without a supported manifest;
  its open migration PR establishes work in progress, not a verified dependency pin.
  These checks establish dependency alignment, not runtime validation.
- **Blockers:** docs publication remains factual. Only confirmed release blockers affect release
  gating; unrelated open issues, follow-ups and migration PRs do not make a shipped component red.

## Compiler, debugger and toolchains

Compiler and debugger releases have independent version lines. The v0.16 view tracks
compiler 0.10 and debugger 0.10 against VM 0.29; the v0.17 view tracks debugger 0.15
against VM 0.32. Compiler PR #1388 plans compiler 0.11 for v0.17 and is tracked as an active migration. GitHub release
tag prefixes distinguish these products from SDK/template and debugger subcrate releases.

The graph includes debugger → Rust SDK as a release dependency. In v0.16, compiler
also depends on protocol and debugger; the v0.17 compiler migration additionally waits
for Rust SDK, as recorded in compiler #1388. Debugger follows VM. Monitored Cargo pins still expose
whether the source has migrated to that topology.

midenup is a separate toolchain node, with per-channel compiler, debugger, VM, protocol,
SDK/client, node and supporting-tool pins. Each pin is checked against its own expected
version line. An absent channel cannot be ready, and alpha/RC pins remain amber.
These checks describe the configured distribution; they do not run tool installation tests.

## Source, publication and handoffs

Released dependency checks read the matched release tag's resolved commit, including its Cargo.lock.
Unreleased components use the configured development branch. Each component identifies that source.
A declared range is displayed separately from a uniquely resolved registry version; only lock evidence
or an exact declaration can trigger a patch/RC lag warning. Ambiguous, substituted or missing lock
entries do not prove the installed version. Dependency alignment does not prove runtime usability.

midenup checks the public downloadable manifest and compares the selected channel with `next`, including
network aliases relevant to that channel. A source update does not establish publication. Unrelated
channel edits do not affect the selected view; malformed or unreachable manifests remain unknown.

Environment cards expand to show each service's version, health and available probe result. Release
`serviceVersions` explicitly maps independently versioned services such as Note Transport. Unknown
pairings and unknown probes remain visible; a healthy endpoint does not imply a successful proving test.
Faucet and Note Transport also have component rows with their independent publication dates.

The work table includes **Next action**, requested reviewers/waiting parties, and the affected outcome.
GitHub provides draft status, current-head checks and requested reviewers; it never substitutes a
reviewer for the assignee. A manually confirmed `handoff` includes the action, waiting party, outcome,
confirmer, confirmation timestamp and evidence URL. `gateScope: outcome` limits a confirmed blocker to
its named outcome without making the whole release red. Use `gateScope: release` only for an explicit
release gate; omitted scope preserves the existing release-gate behavior.

**Migration flow** in Release timing reconstructs PR opened, ready-for-review and merged dates,
plus calendar preparation/review intervals and open waits. It includes completed tracked PRs for
measurement while keeping them out of the work queue. Ready dates require a GitHub timeline event;
truncated histories remain unknown. CSV exports preserve these dates and gaps. Merge alone is not
proof that a release contains the change or that it was deployed. No synthetic adoption date is inferred.

Optional component `verification` records a specific version/environment test result with observed UTC
time, confirmer and evidence. It is visibly manual and separate from publication status. Without such
evidence, usage verification reads **Not recorded**. Service probes remain automated observations.

Selected meeting notes or Slack threads can be translated into these YAML fields using existing
connectors. Keep private notes and private source links outside this public repository; corroborate
published changes with public evidence. Validate every config diff with `npm run validate-config`.

## Develop

```
npm install
cp .env.example .env.local   # set GITHUB_TOKEN (fine-grained PAT, public-repo read)
npm run dev
```

Without `GITHUB_TOKEN` the ~30 GitHub calls per refresh exhaust the anonymous rate limit and
automated cards show Unknown with a token hint; the page still renders.

## Verify

```
npm run lint && npx tsc --noEmit && npm run test:coverage && npm run build
```

`npm run build` also runs `scripts/validate-config.ts` (prebuild) against `config/*.yaml`.

## Deploy

GitHub Pages, fully static: `.github/workflows/pages.yml` regenerates the per-release snapshot
JSON (`scripts/export-snapshots.ts`) and rebuilds the exported site on a schedule at minutes
7, 22, 37 and 52 (plus every push to `main`). Scheduling avoids peak quarter-hour boundaries,
but GitHub Actions does not guarantee those times. The compact header freshness status shows actual
snapshot age after 30 minutes; checking for updates cannot trigger a server rebuild. Maintainers
can run the Pages workflow manually if a scheduled event is delayed. The workflow's built-in `GITHUB_TOKEN` covers the API budget; no
secrets to configure. Live at https://brianseong99.github.io/miden-release-dashboard/.

## Link previews

Open Graph and Twitter cards use the committed 1200 × 630 `public/og-image.png`.
The artwork matches the dashboard and contains no release versions or live status that could go stale.
To update it, edit `scripts/generate-og-image.tsx` and run `npx tsx scripts/generate-og-image.tsx`.
Commit the regenerated PNG with the source changes. No image generation service is needed at runtime.

The header and share image use the official Miden wordmark from [miden.xyz](https://www.miden.xyz/).
The original [SVG wordmark](https://cdn.prod.website-files.com/6a26670ad40ec24a0a8e0c5f/6a2902fbde181744161d90f7_miden-logo.svg)
and [48 × 48 favicon](https://cdn.prod.website-files.com/6a26670ad40ec24a0a8e0c5f/6a69a8f54e36c9647c85f5a1_miden%20favicon.png)
are stored unchanged in `public/brand/`, so the site and image generator do not depend on external asset requests.
