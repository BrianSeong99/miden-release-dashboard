# Miden Release Dashboard

Internal dashboard answering **"where is the next Miden release across the dependency chain?"**
— automated GitHub + network monitoring for VM → Protocol → Node → SDKs → Guardian (OpenZeppelin)
→ Wallet, with DevEx and Walnut (Playground, Source verification) as roll-up stages, rendered as
a node-and-edge dependency graph with DevNet/Testnet deployment visibility and curated release
blockers. A release dropdown switches between the trains declared in `config/release.yaml`
(past, current and upcoming). Pins that lag their upstream's newest RC are flagged inline —
the layered-RC-skew problem the team otherwise reconstructs by hand.

## How data flows

- **Automated:** GitHub releases + dependency manifests per component (`config/release.yaml`
  defines the repo, monitored branch and detectors), the network monitor JSON at
  `status.{devnet,testnet}.miden.io/status`, and live state for each configured blocker.
  GitHub Pages serves generated per-release JSON, refreshed by the deployment workflow
  every 15 minutes; the browser checks those files every minute. A failed source degrades
  the affected evidence to **Unknown** — never a guess.
- **Manual:** `config/blockers.yaml` (and any `manual-override`
  detector). Manual data always renders a **Manual** badge. Edit via PR; the build fails on a
  blocker missing an owner, exit condition or decision date.

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
  **Prerelease deps**. These checks establish dependency alignment, not runtime validation.
- **Blockers:** docs publication remains factual; open critical blockers still prevent
  green group and release readiness.

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
JSON (`scripts/export-snapshots.ts`) and rebuilds the exported site every 15 minutes on a cron
(plus every push to `main`). The workflow's built-in `GITHUB_TOKEN` covers the API budget; no
secrets to configure. Live at https://brianseong99.github.io/miden-release-dashboard/.
