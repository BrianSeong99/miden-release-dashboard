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
  Refreshed through one shared 5-minute server cache; the browser polls `/api/status` every
  minute. A failed source degrades that card to **Unknown** — never a guess.
- **Manual:** `config/blockers.yaml` (and any `manual-override`
  detector). Manual data always renders a **Manual** badge. Edit via PR; the build fails on a
  blocker missing an owner, exit condition or decision date.

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
