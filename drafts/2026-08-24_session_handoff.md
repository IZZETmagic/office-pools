# Handoff — league pools, 2026-08-24

Pick up here. Everything below is on disk; nothing is committed.

## Read first

1. `drafts/2026-08-24_league_pools_full_plan.md` — **§0 wins over the rest of that file.**
   It carries Ryan's eleven journey changes and both rounds of settled decisions (§6 and §6b).
2. `memory/project_backlog_league_ingestion.md` — same decisions, compressed.

Two decisions overturn earlier records, both flagged in place: the Table add-on is now a
**standalone mode** (Decision 9 amended in `SPORTPOOL_PROGRAMME.md`), and the league table
comes from api-football **`/standings`**, not derived from our fixtures.

## Done and live in production

**L-A, steps 1–4.** `PTQPZ797` ("Premier League 2026/2027 Pool", 3 real members) is
un-archived and its 38 stale `pool_round_states` rows are deleted.

- Applied by `scripts/la-fix-live-league-pool.ts --apply` (idempotent; re-running is a no-op)
- Rollback: `drafts/2026-08-24_ptqpz797_unarchive_roundstates_rollback.sql`
- Earlier same-day rollback: `drafts/2026-08-24_ptqpz797_backfill_rollback.sql`
- Verified: `npx tsx scripts/verify-league-pool-member-view.ts` — both pools return 20 clubs,
  380 fixtures, 38 matchweeks, all entries readable, containment intact, no stray WC rows

## Still owed on L-A

- **A human clicking through in a browser as a member.** Cannot be done by an agent — it
  needs one of the three members' credentials. `league_predictions` is still **0 rows
  database-wide**; nobody has ever picked through the UI.
- **`app/competitions.ts` stays at `'upcoming'`** deliberately. Its own rule is *"flip to
  'open' only when a real matchweek has been scored and checked against a hand
  computation"*, and nothing has ever been scored. The stale "cannot score" claim in its
  comment was corrected; the flag was not touched.

## ✅ Migration 056 IS APPLIED — confirmed 2026-08-24

`pool_entries.retired_at`, `.pool_id` and `.user_id` all present in production. A second
session applied it and wrote `scripts/verify-soft-delete.ts`, which drives the whole round
trip against production on scratch data and tears it down afterwards.

**The round trip works for the detaching doors.** Verified end to end: an entry is
detached, stops scoring, leaves the leaderboard, survives a matchweek being played while
it is gone, and on rejoin is re-pointed at the new membership with
**points restored in full — 800, including the 400 from the away matchweek.**

## ✅ CLOSED 2026-08-24 — the stop-participating gap

Migration **057** adds `AND pe.retired_at IS NULL` to `league_score_fixture`'s `priced` CTE,
and `lib/poolData.ts` filters `.is('pool_entries.retired_at', null)` on **both** of its
`pool_members` reads. That is the whole fix: two filters, scoping held exactly as the plan
said — a per-entry detail view showing a retired entry is correct, not a bug.

`scripts/verify-soft-delete.ts` section 5 is now a hard assertion with a **control**: while
active, flipping a result costs the entry its 100-point exact (800 → 700); once retired, the
same flip does nothing (frozen at 800). Without that control the test would pass even if the
engine were broken entirely. Section 6 proves un-retiring puts them straight back.

⚠ Score rows are NOT deleted on retirement — decision 15 restores a season in full, so the
points must survive. 057 stops NEW scoring only; poolData is what hides them.

### ⚠ Found while doing it, NOT fixed — outside the agreed scope

1. **`lib/migrations/055` had drifted from production.** Its header claims to be a dump of
   the live definition; the applied body was 6,971 bytes, the file's 6,289. Ten comment
   lines, no code. `CREATE OR REPLACE` would have silently deleted them — caught by hashing
   `prosrc` before and after. 057 restores all ten. See
   `memory/project_migration_file_drift.md`.
2. **World Cup rank writers.** `shadow_finalize_totals` and `lite_recalc_entry` assign ranks
   without filtering `retired_at`, so a retired WC entry consumes a rank and leaves a gap
   (1, 3, 4…). Dormant — the WC completed 16 Jul 2026.
3. **Nothing writes `league_entry_totals.final_rank` yet.** The live-leaderboard phase's rank
   writer MUST carry the predicate.
4. **`lib/auto-submit.ts` does not filter `retired_at`** — a retired entry's drafts can still
   be auto-submitted, which sets `has_submitted_predictions` and makes it shadow-eligible.
5. 🔴 **Latent landmine, fix before May 2027.** auto-submit selects pools on
   `prediction_deadline < now()`. League pools escape only because their deadline sits at
   the season's last kickoff (2027-05-30). When that passes, league entries get swept and
   `has_submitted_predictions` / `auto_submitted` get set on them — the two columns that are
   the ONLY doors into the World Cup scoring selectors, i.e. the load-bearing constraint.

## 🟡 Matchweek rhythm — read side done, write side awaiting a call

`lib/league/read.ts` → `openMatchweekId()`: **the earliest matchweek that is neither locked
nor finished.** One rule gives all of decision 16, self-driving — no cron, no stored state,
no migration, because the instant N−1's `lock_at` passes N *becomes* the earliest unlocked
one. Both league pools now read `1 completed · 36 locked · 1 open` (was 37 open), and the
verify script's advisory note is a hard check.

**UPDATE — migration 058 applied 2026-08-24, phase 3 CLOSED.** Verified both directions on
scratch data by `scripts/verify-matchweek-rhythm.ts`: the open matchweek accepts a pick, a
later one is refused, the already-played rule still holds. The positive case is the
load-bearing one — a silent-skip trigger that rejected *everything* would have stopped all
picking on the live pool with no error anywhere.

⚠ **The trap it created:** 058 silently drops a pick for a non-open matchweek, so any script
seeding a whole season of picks up front keeps only the first matchweek's. It broke
`verify-soft-delete.ts` (4 of 8 landed); fixed by picking week by week.

The original description of the gap follows.

**The database does not enforce it yet.** `enforce_league_prediction_before_lock` knows
"finished?" and "locked?" but not "open?", so the UI will not offer matchweek 30 in August
while the API will happily store a pick for it. The artifact is explicit that it must hold
"no matter what someone is using".
`lib/migrations/058_only_the_open_matchweek_accepts_picks.sql` closes it and is **written
but NOT APPLIED** — it changes what the DB will write for a live pool, which was outside the
agreed scope. `league_predictions` is still 0 rows, so this is the cheapest moment to apply
it. Ryan's call.

## Step 2 — soft deletion, written, not live

Four doors destroyed entries, not the three the plan listed:

| Door | Route | Now |
|---|---|---|
| leave | `pools/[pool_id]/leave` | retires entries, then deletes membership → FK detaches |
| stop participating | `pools/[pool_id]/stop-participating` | retires, membership untouched |
| admin removes an entry | `pools/[pool_id]/entries/[entry_id]/delete` | retires |
| discard a spare | `pools/[pool_id]/entries` DELETE | retires |

New: `lib/entries/retire.ts` (+ 11 tests in `lib/entries/__tests__/retire.test.ts`), and
`pools/join` now restores prior entries and re-scores them.

**The trap that was found in door 4:** it guarded itself with
`pool_entries.has_submitted_predictions` — a column the league write path *deliberately
never sets*, because those two columns are the only doors by which a league entry reaches
the World Cup scoring selectors. So for a league entry the guard was permanently false and
the endpoint would have discarded a full season believing it was an empty spare. It now
asks `league_predictions` directly.

**Why the FK approach and not a `left_at` flag:** 136 sites read `pool_members` and 23
migrations carry RLS keyed on membership. Filtering `left_at` at every one of them leaves a
departed member with live pool access if a single site is missed. Instead: `pool_entries`
has no `pool_id`, so every read reaches an entry *through* `pool_members` — including the
league engine (055 inner-joins it). An entry with `member_id = NULL` is therefore already
invisible everywhere, with no read changed. Ryan approved this explicitly.

## Known gap the next phase must close

`lib/league/read.ts` → `matchweekToRoundState` deliberately opens **every** future
matchweek — its comment reads *"week 30 is predictable in August, which is the whole
difference from a bracket."* Ryan's decision 16 is **strictly one matchweek open at a
time**. So the matchweek-rhythm phase is a change to documented, intentional behaviour, not
filling a gap. `verify-league-pool-member-view.ts` logs the mismatch on every run.

## The programme — what "continue the Premier League plan" means

**The spec is `drafts/2026-08-24_league_pools_full_plan.md` §0.12**, which carries the
revised phase table with estimates. Do not re-derive an order; that one is Ryan's.

| # | Phase | Days | State |
|---|---|---|---|
| 1 | L-A — make the live pool work | 0.5 | ✅ done, bar a human browser pass |
| 2 | L-M — soft deletion | 1–2 | ✅ done — 056 + 057, all four doors, round-trip verified |
| 3 | L-N — matchweek rhythm, auto open/close | 1 | ✅ done — read side + migration 058 (DB enforcement), both verified |
| 4 | L-B′ — live leaderboard: ranks, movement, **in-match scoring**, pushed updates | 4–5 | ✅ done — migrations 059–063 |
| 5 | L-C — Results depth | 2–3 | ✅ done — migrations 064–066 + the picking screen |
| 6 | L-F — notifications, email + push | 3–4 | ✅ done — migrations 071–074 + sending |
| 7 | L-D′ — live league table from `/standings` | 2–3 | ✅ done — migrations 075–076 + Table tab |
| 8 | L-E′ — Table **mode** | 3–4 | ✅ done — migrations 077–082, `scripts/verify-table-mode.ts` |
| 9 | L-O — wizard + weekly reveal | 2–3 | ✅ done — the wizard offers both league modes; the reveal fires per matchweek. `scripts/verify-weekly-reveal.ts` |
| 10 | Showdown · LMS · Form tab · mobile · second league | — | ⬜ |

Steps 1–6 ≈ 12–15 days ⇒ Pick'em is a real product with a rhythm and a live table.
Steps 7–8 ≈ 5–7 more ⇒ the newcomer audience is served.

**The product intent** — the plain-English version of every member journey, which Ryan
reviewed and signed off — is the artifact *A Season in a League Pool*:
https://claude.ai/code/artifact/418dcfe3-c7ed-4899-b36c-64aa6faa7f55
Read it (WebFetch works on artifact URLs) before building anything member-facing. It is the
source of truth for what each mode should *feel* like; the plan is the source of truth for
how it is built.

## Rules of engagement — Ryan's, learned the hard way

- **Plan before executing.** Ryan ended a session over this. For anything touching shared
  plumbing or more than a couple of files, write the approach and get approval first.
  See `memory/feedback-plan-before-executing.md`.
- **Never `git push`.** Committing locally is fine; pushing master is a production deploy
  Ryan controls. Each "push it" is one-time permission.
  See `memory/feedback-no-auto-push.md`.
- **The migration ships BEFORE any code names its column.** The `entry_xp_state` lesson was
  seven hours of silent 400s from exactly that ordering.
- **THE LOAD-BEARING CONSTRAINT:** the league write path must NEVER set
  `pool_entries.has_submitted_predictions` or `.point_adjustment`. Those two columns are
  the only doors by which a league entry reaches the World Cup scoring selectors. Asserted
  by test — extend that test with every phase.
- **Verify before asserting.** Check the data or the code before stating a diagnosis as
  fact. See `memory/feedback-verify-before-asserting.md`.
- **Say items by name, never by code** — *"the matchweek rhythm phase"*, not *"L-N"*. The
  letters are row IDs and they renumber.
- **Run `scripts/verify-select-columns.ts` before any `DROP COLUMN`**, and deploy the code
  fix first. See `memory/project_incident_dropped_column_outage.md`.
- **The disclosure gate** in `CLAUDE.md` applies to every mechanic touching notifications,
  rewards, streaks, social pressure or engagement — apply it at design time, not review.
- **Do not flip `app/competitions.ts` to `'open'`** until a real matchweek has been scored
  and hand-checked. Ryan will decide; do not offer it as a tidy-up.

## Verification scripts — run these, they exist for a reason

```
npx tsx scripts/verify-league-pool-member-view.ts   # would a member see a working pool?
npx tsx scripts/verify-soft-delete.ts               # the full retire/restore round trip
npx tsx scripts/verify-league-aggregates.ts         # matchweek aggregates vs fixtures
npx tsx scripts/verify-select-columns.ts            # no code selects a dropped column
npx vitest run                                      # 424 passing / 6 skipped at handoff
```

## Late additions — after the handoff was first written

- **`.env.local` was reorganised** into five labelled sections (Supabase, Resend, APNs,
  API-Football, Analytics). Verified byte-identical: 13 variables before and after, and the
  6-line `APNS_PRIVATE_KEY` PEM untouched. Backup in the session scratchpad.
- **`DATABASE_URL` is NOT set.** There is a commented placeholder at the bottom of the
  Supabase section with instructions. Ryan pasted the project URL
  (`https://….supabase.co`) there by mistake — that is the REST endpoint, already present
  as `NEXT_PUBLIC_SUPABASE_URL`. What psql needs is the `postgresql://…` URI from
  Project Settings → Database → Connection string → URI.
  **If the Supabase MCP is available in this session, ignore all of that and use
  `apply_migration` — `DATABASE_URL` was only ever a fallback.**
- ⚠ **Two lines of the APNs private key PEM were printed into the previous session's
  transcript** by a faulty masking filter. Ryan was told to rotate the APNs auth key
  (Apple Developer → Certificates, Identifiers & Profiles → Keys), then update
  `APNS_KEY_ID` and `APNS_PRIVATE_KEY` in `.env.local` and in Vercel. **Check whether this
  was done; if not, remind him.** Nothing else was exposed.

## Environment notes

- The Supabase MCP was connected mid-session and never became reachable — MCP servers
  attach at **session start**. A `supabase` entry was added to `.mcp.json` (gitignored per
  commit `7e12247`); it needs `claude /mcp` to authenticate.
- `npx tsc --noEmit` reports pre-existing failures unrelated to any of this: `FormData` and
  a `routes.d 3.ts` duplicate — both the known iCloud corruption
  (`memory/project_env_icloud_corruption.md`). Filter to changed files when checking.
