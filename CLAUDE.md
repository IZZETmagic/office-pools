# Project context for Claude

## Read this first: `ROADMAP.md`

`ROADMAP.md` at the repo root is the single source of truth for project state — roadmap, backlog, tech debt, and risks/dependencies. **Consult it before:**

- proposing or planning new features
- prioritising work or sequencing tasks
- recommending refactors (cross-check against §3 tech debt — may already be scheduled)
- making architectural choices (cross-check against §4 risks)
- estimating effort or timeline impact (cross-check against §1 phases)

When something material to the project changes (new feature decided, debt resolved, risk materialised, backlog item added, roadmap reshuffled), **update `ROADMAP.md`** as part of the same change. Long-form backlog detail lives in `memory/project_backlog_*.md`; `ROADMAP.md` keeps the index.

## How project documents fit together

- `ROADMAP.md` — project hub. Roadmap, backlog index, tech debt, risks. **Start here.**
- `memory/project_backlog_*.md` — long-form detail for each backlog item. Auto-loaded into Claude memory.
- `memory/MEMORY.md` — index of memory files for cross-session recall.
- `PLAN.md` — feature-specific implementation plan (currently: FIFA Annex C third-place distribution). Will be archived once that feature ships (see `ROADMAP.md` §3 TD-07).
- `AGENTS.md` — Vercel platform best practices, not project-specific.
- `README.md` — user-facing project intro.

## Working on this project

- The product is **office-pools**, a pick'em pool app currently shipping a FIFA World Cup 2026 product. Post-WC roadmap is in `ROADMAP.md`.
- Single-builder project. Linear sequencing assumed. See `ROADMAP.md` §4 R-02.
- Stack: Next.js (web), Swift iOS app (to be replaced by Expo in Phase 3b), Supabase (Postgres + edge functions + crons), Resend (email), Vercel (deploy).
- Cron state is described in `memory/project_backlog_emails.md`. Most email crons are currently disabled pre-tournament.

## Conventions

- New backlog items: create `memory/project_backlog_<topic>.md` with `name`/`description`/`type: project` frontmatter, add a one-line entry to `memory/MEMORY.md`, and add a row to `ROADMAP.md` §2 with the roadmap phase that picks it up.
- Tech debt discovered during a change: add it to `ROADMAP.md` §3 with the phase that clears it.
- New risks: add to `ROADMAP.md` §4 with a mitigation.
