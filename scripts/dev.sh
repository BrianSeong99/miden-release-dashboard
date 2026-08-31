#!/usr/bin/env bash
# Local dev convenience: borrow the gh CLI's token for the session so the
# dashboard's ~30 GitHub calls per refresh don't hit the anonymous rate limit.
# No credential is written to disk. Fall back to whatever is already set.
export GITHUB_TOKEN="${GITHUB_TOKEN:-$(gh auth token 2>/dev/null)}"
exec npm run dev
