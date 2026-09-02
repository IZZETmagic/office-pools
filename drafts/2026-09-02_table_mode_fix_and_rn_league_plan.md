# Table mode's frozen score, and the RN league build

**Date:** 2026-09-02 · **Status:** FOR APPROVAL — nothing built · **Scope:** SQL + web deploy (Part A), Expo app (Part B)

Two halves, written together because the second one determines how the first should be built. Part A
is a live defect with a mostly-cheap fix. Part B is the next body of work, and the choice it forces
is whether the fixes we have just made to the web read path are **web patches or a shared contract**.

---

## Part A — Table mode's score never responds to a goal (R25)

### What is actually wrong — three causes, stacked

`bonus_points` **is** Table mode's score, and `league_score_table` is its only writer.
`league_finalize_ranks` merely *reads* it as rung 4 of the sort cascade (verified in the live
function body — it writes `final_rank`, `previous_final_rank` and `updated_at`, nothing else).

So everything turns on *what calls `league_score_table`*. In production, exactly one thing does:

| | State |
|---|---|
| **The member's own save** — `table-prediction/route.ts:150` | ✅ works. `last_scored` lands within **200 ms** of `last_member_save` in three pools |
| **`league_after_standings_change(season_id)`** — snapshots the final table, then rescores every table pool in that season | ✅ **exists in the database and is correct.** ⛔ Called only from `syncLeagueFixtures.ts:576`, which is **not in the deployed 24 Aug code** |
| **A trigger on `league_standings`** | ❌ does not exist — the table has **zero** triggers |
| **The `league-standings` cron** | ❌ not scheduled, and not deployed |

**Consequence, measured 2026-09-02:** a table pool's score moves only while members can still edit.
After the deadline nobody can, so it stops. *Predict the Table* (locked 28 Aug) and *Premier League
Test Table Prediction* (locked 30 Aug) are frozen now. `league_standings` itself was last fetched
**2026-08-30 18:35** for every season, with completed fixtures since.

### The good news: the design is already right, and already written

`syncLeagueFixtures` does the correct thing on `Development`:

```
fixture completes → syncLeagueStandings()          one /standings call, ONLY when a fixture completed
                  → league_after_standings_change() snapshot first, then rescore every table pool
                  → league_entry_totals UPDATE
                  → broadcast_pool_leaderboard      the screen already updates for free
```

The gating (`if (res.changed?.some(c => c.is_completed))`) is deliberate and good — one api-football
call per completed-fixture batch, not one a minute. **Most of Part A is therefore the deploy (R21),
not new code.**

### A1 · The durability fix — a trigger on `league_standings`

Deploying restores the call, but leaves the recompute depending on *which code path wrote the
standings*. That is the exact condition migration **126** was created to remove for fixtures — *"the
engine does not wait for a deploy."* Table mode deserves the same, and it is the reason this defect
was invisible for a week.

**New migration 131** — statement-level `AFTER INSERT OR UPDATE` on `league_standings`, calling
`league_after_standings_change(season_id)` once per season touched.

Three details that are not optional:

- **Statement-level, not row-level.** The writer is one `upsert` of ~20 rows
  (`onConflict: 'season_id,club_id'`). A row trigger would rescore every table pool **20 times** per
  sync.
- **Diff the transition tables.** The upsert rewrites all 20 rows every time, *including unchanged
  ones*, so a naive trigger fires on every sync even when the table has not moved. Use
  `REFERENCING OLD TABLE / NEW TABLE` and compare `(rank, points, goals_diff, played)` — the same
  shape `broadcast_league_fixtures` and `score_league_fixture_on_change` already use.
- **Swallow errors, like 126 does.** Raising would roll back the feed's own standings write. Warn
  into the Postgres log; the next change retries.

Belt-and-braces with the deployed call is fine and intentional — `league_after_standings_change`
recomputes rather than increments, and there are 5 table pools. Same posture as `league_score_fixture`,
which both the app and the trigger call.

⚠ It calls `league_snapshot_final_standings` first, which **freezes the season-end table**. That is
correct and load-bearing (without it a June feed correction restates a paid award) — but it means the
trigger must not fire during a partial/failed standings write. The diff guard covers this: a failed
fetch writes nothing, so nothing fires.

### A2 · Schedule the standings refresh as a backstop

The sync only refreshes standings when a fixture completes *inside its own ~3h window*. If that tick
is missed — a deploy, an outage, an api-football blip — nothing retries until the next completion.
`/api/cron/league-standings` exists for this and is unscheduled. Suggested `*/30 * * * *`, after the
deploy. It joins the other three unscheduled league crons; **this is downstream of R21 and should be
scheduled in the same pass**, not as its own project.

### 🚦 A3 · The open question — what does "live table" mean?

Your example was:

> *"If it's a table set, then the table, based on the score, where they sit in a live table, should
> move and therefore recompute your points."*

**This is not what the current design does, and it is not a bug — it is an unanswered question.**
Standings are re-fetched when a fixture **completes**. A goal in the 20th minute does not move
`league_standings`, because api-football's `/standings` is a full-time table; league tables do not
update mid-match. So even fully deployed, a table pool's score moves at **full time**, not on the
goal.

Two answers, and they are genuinely different products:

| | What it means | Cost |
|---|---|---|
| **(a) Full-time is the truth** — current design | The table moves when games finish. Honest, matches every league table anyone has ever seen | Nothing. Ships with the deploy |
| **(b) A provisional live overlay** | Derive an in-flight table = ingested standings + deltas from matches currently being played, and score against that while a match is live | A new derived view, a second scoring path, and a rule for what happens when a provisional result flips back |

⚠ **(b) partially reopens a settled decision.** *League standings — ingested, not derived* exists
because a derived table cannot see points deductions. The way to have both is to keep the **ingested**
table as the source of truth and treat the overlay as **display-only until full time** — the same
split Showdown already uses, where the duel scoreline is live but `duel_points` is only paid on
settle. That is buildable and coherent, but it is a *mode design* change and wants its own slice.

**Recommendation: ship (a) with the deploy, and decide (b) separately.** It is the difference between
"correct within minutes of full time" and "correct within seconds of a goal", and the first one is
not currently true either.

### A4 · Verification

- Replay against a rolled-back transaction on production, the 105/106 way — move a real standings row,
  assert `bonus_points` changes for the table pools in that season and *only* those.
- Re-upsert **unchanged** standings and assert the trigger does **not** fire (the diff guard).
- Assert `league_snapshot_final_standings` is not called for a season that has fixtures remaining.
- `scripts/verify-table-mode.ts` exists — extend it with the trigger path rather than a new script.
- After deploy: confirm the two frozen pools move, and that `league_standings.fetched_at` advances.

### Order and size

| # | Step | Size | Notes |
|---|---|---|---|
| A1 | Migration 131 + tests | ~0.5 d | Independent of the deploy; safe to apply first |
| — | **The deploy (R21)** | — | Not this plan's to schedule, but A2 and the fix both sit behind it |
| A2 | Schedule `league-standings` (+ the other three league crons) | ~0.5 d | After deploy |
| A3 | **Decision only** | — | Needs your ruling before any live-overlay work |

---

## Part B — the RN league build

### The thing to understand before scoping anything

**Mobile cannot read league data at all.** Not "has no league screens" — cannot read.

- Mobile is direct-to-PostgREST: **~110 `.from()` table reads**, against **14 API routes**, every one
  of which is a write or a notification.
- Migration **050** closed four engine tables to clients — `league_match_scores`,
  `league_entry_totals`, `league_fixture_state`, `league_score_events` — RLS on, **zero policies**.
  They hold every number a league screen shows.
- The failure is silent. RLS with no policy is not a 403; PostgREST returns `[]` with `error: null`,
  so the screen renders a confident zero. This was found **four times in one afternoon on 30 August —
  on the web**, where the pattern is better understood than it would be in a new RN file.

The web does not read those tables the way mobile would: `app/pools/[pool_id]/page.tsx` is a
`force-dynamic` **server component** using the service-role client, having already established the
viewer is a member. RN has no server component and must never hold that key.

**So there is no port. There is a new server surface both surfaces call.**

### The size of the gap, as a number

| | Web | Mobile |
|---|---|---|
| `lib/league/*` shared read/write layer | **4,930 lines** | — |
| League-specific pool surfaces | **~13,000 lines** | — |
| League references anywhere in `mobile/` | — | **1** (a comment saying why it is hidden) |

Mobile has 30 screens, 94 components and 34 hooks, all World-Cup-shaped.

### B1 · The read contract — the piece everything else waits on

One server-owned read per league surface, returning **what a screen renders and nothing else**.

This is also **the fix for R23 items 4–5**, which are still open on the web:
`readLeaguePoolView` pages **all 380 fixtures / 175 kB** per request per viewer, outside the cache,
whichever tab is open. Done as a contract, that gets fixed once for both surfaces. Done as a web
patch, it gets solved twice and diverges — which is how the two surfaces came to disagree about
levels in the first place.

Shape:

- `GET /api/pools/:id/league?view=duel|picks|table|survivor|leaderboard` — per **surface**, not
  per table, so the payload is the screen.
- Server-side auth: membership established once, service-role read after, exactly as the page does.
- The **season** half (`fixtures`, `clubs`, `matchweeks`, `standings` — ~197 kB, identical for every
  viewer of every pool on that season) behind `unstable_cache` keyed `league-season:{seasonId}`,
  invalidated from the sync's own `changed` array, **never a TTL**. A TTL either serves a stale score
  during a match or is too short to help.
- The **per-viewer** half stays uncached — median pool is 1 member, so there is nobody to share it with.

⚠ **Do not put the live half in the cache.** Migration 125 already carries score, status and minute
over the broadcast. Cache the *stable* season — who plays whom, when, where — and let the broadcast
own everything that moves. Caching what moves is how you serve a 0–0 through a goal.

### B2 · Realtime — Broadcast, and delete the `postgres_changes` consumers

Supabase's own docs: *Broadcast is "the recommended method for scalability and security"*;
`postgres_changes` "does not scale as well". Measured here today: **realtime WAL decoding is 26.69%
of 355.5 DB-hours**, against **1.2%** for every SQL scoring engine combined.

Web is already on Broadcast. Mobile is not — **5 of its 6 channels** are `postgres_changes`
(`usePoolEntries`, `useMemberRoster`, `useHomeData`, `HomeDataProvider`, `usePendingActions`); only
`usePoolDetail`'s leaderboard channel uses Broadcast.

Ten tables remain in the `supabase_realtime` publication, led by `user_pending_actions` (37,747 rows),
`pool_entries` (5,039) and `pool_members` (4,863).

**RN league screens must subscribe to `pool:{id}:leaderboard` and apply the payload directly** —
never re-fetch on a change event. Retiring the five existing consumers is the same piece of work and
should not be a separate one, because adding league screens on the old pattern puts the 26.69% back.

### B3 · Give mobile a cache

`react-query` was decided **2026-07-26** and never started — no `@tanstack` in
`mobile/package.json`. Six surfaces refetch on `useFocusEffect`, so every tab switch re-runs a full
load. Adding league tabs on top multiplies that. This is small, decided, and blocks nothing else.

### B4 · Screens, in this order

Smallest first, and deliberately not in the order they were built on web:

1. **Pick'em** — the only mode a member can reach in production today. Matchweek stepper, picks,
   leaderboard. Proves the contract end to end.
2. **Table** — one screen, one drag-order input. ⚠ The lock is enforced in the **database** (078), so
   mobile inherits the rule rather than re-implementing it. Depends on Part A being right.
3. **Last Man Standing** — one pick per round; the club-once rule and matchweek lock are both in SQL.
4. **Showdown** — largest by an order of magnitude: the band, the sealed draw, the walkout reveal, the
   recap. Do it last, when the contract has been proven three times.

### B5 · What NOT to port

The web surfaces were built fast and carry things that should not be copied:

- **`DuelsTab.tsx` is 2,616 lines with 23 `useMemo` blocks** deriving verdicts, form, streaks and
  movement client-side. RN should receive those computed. Where a number does not exist server-side
  yet, that is a gap in the contract, not a reason to compute it twice.
- **The `/duel-live` fetch.** Web still round-trips per goal per viewer for per-fixture points,
  because the broadcast payload does not carry them. **Put them in the payload before RN ships** —
  the engine has just computed them, so it is close to free, and it removes a fetch from both
  surfaces at once. (This is R23's spirit applied to the push side.)
- **Anything that reads a deny-all table directly.** `denyAllTables.guard.test.ts` scans `app/` and
  `lib/` — **extend its walk to `mobile/`** as part of B1, before the first league screen exists,
  not after.

### Sizing

Deliberately order-of-magnitude, and **B1 is the one that cannot be sized until it is designed**.

| Gate | Work | Size |
|---|---|---|
| **M0** | Deploy (R21) — everything else assumes production matches the code | — |
| **B1** | The read contract + season cache | **needs a design pass first** |
| **B2** | Broadcast on mobile, retire 5 `postgres_changes` consumers | ~2 d + an OTA |
| **B3** | react-query | ~1 d |
| **B4** | Screens: Pick'em → Table → LMS → Showdown | per mode, Showdown ≫ the rest |

---

## Part C — Last Man Standing settles a week late

Added 2026-09-02 after walking the flow mode by mode. **LMS is the one mode whose timing does not
match the spec.** Table, Pick'em and Showdown all do.

**Today:** `trg_league_settle_lms` fires on `league_matchweeks.ranks_snapshot_at`, which only goes
non-NULL when every fixture in the matchweek is played *and* scored. So a member whose club lost at
3pm on Saturday is told on Monday night.

**Wanted:** judged at the final whistle of their own club's game.

### The rule is already right — except one case

Read from `league_lms_settle`:

| Case | Code | Spec |
|---|---|---|
| No pick | out | — |
| Picked club has no completed fixture this matchweek | **survives** (*"not beaten"*) | ✅ still in |
| Picked club won | survives | ✅ still in |
| Picked club lost | out | ✅ out |
| Picked club **drew** | **out** | ⚠ **not stated — needs a ruling** |

A draw is a legitimate football result, and at the ~65–70% weekly survival rate the design assumes,
eliminating on draws roughly doubles the weekly cull. Whichever way it goes it should be written down,
because it is the difference between a round lasting four weeks and eight.

### ⚠ The trap: elimination and round-closure are not the same event

`league_lms_settle` also **closes the round** when one player is left (`IF v_left <= 1`), stamps
winners, recomputes `rounds_won`, and opens the next round with everybody back in.

Judge progressively and a Saturday 3pm result can take the field from 3 to 1 — **closing the round and
crowning a winner whose own club plays on Monday.** That is worse than settling late.

So the change is **not** moving the trigger. It is splitting one function into two events:

| Event | When | Does |
|---|---|---|
| **Eliminate** | each fixture's final whistle | judges only the entries whose picked club played in *that* fixture |
| **Close the round** | matchweek complete — where it is today | counts survivors, stamps winners, opens the next round |

Which also means the elimination arm can hang off `league_fixtures` directly (alongside
`score_league_fixture_on_change`) rather than off the matchweek snapshot, and the closure arm stays on
`ranks_snapshot_at`.

⚠ Keep the two existing guards when splitting: a matchweek with **no fixtures** must not eliminate
anybody (migration 106 — it once eliminated all ten members of a pool in production), and a matchweek
**before the pool existed** must not either (`IF p_matchweek < v_first`).

**Size:** ~1 day, plus the draw ruling. Independent of the deploy and of Part B.

---

## What I need from you


1. **A3 — full-time or a live overlay for Table mode?** Recommendation: ship full-time now, decide the
   overlay separately.
2. **Is B1 a contract or web patches?** This is the fork. Contract = fix R23 4–5 once and RN inherits
   it. Patches = do it twice and let the surfaces drift.
3. **Approval to start A1** (migration 131) — it is independent of the deploy and safe to apply first.
