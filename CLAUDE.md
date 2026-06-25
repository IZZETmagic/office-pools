# Project context for Claude

## Challenge, don't just agree

Ryan is a beginner at the engineering side and relies on Claude to be the expert. When he proposes an approach or reasons out loud, **evaluate it on the merits and push back when it's wrong, incomplete, or optimises for the wrong goal** — even if he sounds confident. Agreeing reflexively, flip-flopping to match his latest message, or validating a plan to be agreeable is a failure. State the trade-off, give a clear recommendation with the reason, and name the one fact that would change the call. Being straight is more valuable than being agreeable.

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

## Core architecture principle: compute once, store, read everywhere

**Every value shown in the web app or mobile app must be read from the database — never recomputed on the client or per request.**

- Any derived/calculated value — match scores, points, ranks, XP, levels, form, streaks, badges, crowd stats, any analytics — is computed **exactly once** by a **single server-side process** (the scoring sweep / a background cron) and **written to the database**.
- The client (web UI/UX and the mobile app) and the read APIs they call must **only pull** those stored values. They must **not** recalculate them on render, on page load, or per viewer.
- Rationale: per-viewer / per-request recomputation does not scale (it caused the 2026-06-16 read-saturation outage and forced an expensive compute upgrade), it lets the same value drift between surfaces (leaderboard vs form tab vs cards), and only a stored value can be cached.
- One calculation → one stored result → many cheap reads. If two surfaces show the "same" number, they must read the **same column**, not each run their own calculation.

**Current state (in flight):** the leaderboard tab, form/analytics tab, and the APIs behind them still recompute analytics on read (the violation we're removing). The fix — precompute into `entry_xp_state`, keep fresh via the `analytics-sweep` cron, then flip the read path — is tracked in `memory/project_backlog_leaderboard_precompute.md`. Match points and ranks already follow this principle (computed by the scoring sweep, stored on `pool_entries`, read directly). Bracket-pool analytics are a separate precompute still to build. When adding any new displayed value, follow this principle from the start: compute it in the sweep/cron, store it, read it.

## Working on this project

- The product is **office-pools**, a pick'em pool app currently shipping a FIFA World Cup 2026 product. Post-WC roadmap is in `ROADMAP.md`.
- Single-builder project. Linear sequencing assumed. See `ROADMAP.md` §4 R-02.
- Stack: Next.js (web), Swift iOS app (to be replaced by Expo in Phase 3b), Supabase (Postgres + edge functions + crons), Resend (email), Vercel (deploy).
- Cron state is described in `memory/project_backlog_emails.md`. Most email crons are currently disabled pre-tournament.

## Conventions

- New backlog items: create `memory/project_backlog_<topic>.md` with `name`/`description`/`type: project` frontmatter, add a one-line entry to `memory/MEMORY.md`, and add a row to `ROADMAP.md` §2 with the roadmap phase that picks it up.
- Tech debt discovered during a change: add it to `ROADMAP.md` §3 with the phase that clears it.
- New risks: add to `ROADMAP.md` §4 with a mitigation.
