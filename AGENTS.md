<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project rules

- This is a read-only monitoring surface: no database, no notifications, no admin UI.
  Manual data changes go through `config/*.yaml` in a PR.
- Manual data must always render with the "Manual" badge; automated data never does.
- A failed upstream source degrades that card to "Unknown" — it must never break the page
  or be replaced with a guessed state.
- GitHub fetching (`lib/github.ts`), detector parsing (`lib/manifests.ts`) and status
  derivation (`lib/status-engine.ts`) stay independent and testable; the status engine is
  pure and does no I/O.
