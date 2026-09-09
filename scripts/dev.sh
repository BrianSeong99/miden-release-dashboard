#!/usr/bin/env bash
# Local dev convenience: borrow the gh CLI's token for the session so the
# snapshot builds don't hit the anonymous rate limit, generate the static
# per-release JSON the client fetches, then start the dev server.
# No credential is written to disk. Fall back to whatever is already set.
export GITHUB_TOKEN="${GITHUB_TOKEN:-$(gh auth token 2>/dev/null)}"
npx tsx scripts/export-snapshots.ts || echo "snapshot generation failed — release switching will show stale data"
exec npm run dev
