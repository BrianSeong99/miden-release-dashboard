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

## Release work evidence

- `category: blocker` means a confirmed release gate; `follow-up` tracks other work or risk;
  `migration` tracks version adoption. Category defaults to `follow-up`. Severity alone does not
  establish a release gate. A release view groups related work without proving that every entry
  blocks that release or currently affects its shipped artifacts.
- GitHub supplies current titles, assignees and issue/PR state; curated titles and owners are
  fallbacks when evidence is unavailable. Work with no GitHub assignee stays visibly unassigned.
  GitHub authorship does not establish ownership.
- Completed issues, merged PRs and PRs closed without merge have distinct meanings. Closed work
  remains in history; closure or merge alone does not prove shipment. Source-backed criteria may
  record replacement PRs and published-tag inclusion when those have been checked.
- The original August 31 seed owners and September 3/7 dates were unconfirmed drafts. These are
  now null. Node fee collection is tracked under 0.17 following the upstream 0.17.1 plan;
  multisig sponsorship and wallet recovery remain follow-ups with current applicability unconfirmed.

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
against VM 0.32. The v0.17 compiler target remains TBD until confirmed. GitHub release
tag prefixes distinguish these products from SDK/template and debugger subcrate releases.

The graph includes debugger → Rust SDK as a release dependency. In v0.16, compiler
also depends on protocol and debugger; v0.17 places compiler and debugger directly
after VM, following the planned release topology. Monitored Cargo pins still expose
whether the source has migrated to that topology.

midenup is a separate toolchain node, with per-channel compiler, debugger, VM, protocol,
SDK/client, node and supporting-tool pins. Each pin is checked against its own expected
version line. An absent channel cannot be ready, and alpha/RC pins remain amber.
These checks describe the configured distribution; they do not run tool installation tests.

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
