# Miden Release Dashboard

Internal dashboard answering **"where is the next Miden release across the dependency chain?"**
— automated GitHub + network monitoring for VM → Protocol → Node → SDKs → Guardian → Wallet →
DevEx, with DevNet/Testnet deployment visibility, curated critical blockers, and launch-critical
Pioneers.

## How data flows

- **Automated:** GitHub releases + dependency manifests per component (`config/release.yaml`
  defines the repo, monitored branch and detectors), the network monitor JSON at
  `status.{devnet,testnet}.miden.io/status`, and live state for each configured blocker.
  Refreshed through one shared 5-minute server cache; the browser polls `/api/status` every
  minute. A failed source degrades that card to **Unknown** — never a guess.
- **Manual:** `config/blockers.yaml` and `config/pioneers.yaml` (and any `manual-override`
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

Vercel, with **Deployment Protection enabled** (internal audience) and `GITHUB_TOKEN` set as a
server-side environment variable.
