# Premier League backend — design v3

> **Status:** for Ryan, 2026-08-16. Supersedes `2026-08-16_premier_league_backend_design_v2.md` as a
> design. Keep v2 on disk for its review text (§R) — v3 cites it but does not reproduce it.
>
> **Round 3 of an audit → design → review loop.** v2 fixed v1's 8 criticals; the second review then
> returned **9 criticals and 14 highs**, and the completeness lens returned *needs-rework*. v3 closes
> all nine criticals, disposes of all fourteen highs and all seventeen mediums/lows, and answers the
> four questions v2 had no answer for.
>
> **Every load-bearing claim in this document was re-verified against live code and the live
> production database today.** Where v2 or a reviewer was wrong, I say so and show the evidence.
>
> **Honest scope, up front: v2 implied ten phases. v3 needs sixteen.** §14. Two of them (L0, L1) are
> urgent for reasons that have nothing to do with the Premier League shipping.

---

## 0. Scope, and what changed from v2

### 0.1 The decision being implemented (Ryan, 2026-08-15) — unchanged

Every competition gets its own backend structure. The Premier League is built ground-up. The World
Cup backend is frozen and restored — 623 live pools, 286,876 stored score rows, real members still
reading results. The front end reuses the World Cup UI repointed at league data. Predictions fork
into `league_predictions`; `pools`, `pool_members`, `pool_entries` and everything hanging off an
entry stay shared. Premier League only.

### 0.2 Live state, re-verified 2026-08-16 20:4x UTC

| | |
|---|---|
| `pools` | **624**; `prediction_mode='league_pickem'` = **1** (`c16a9a56-…`, code PTQPZ797) |
| that pool | `status='open'`, **`archived_at = 2026-08-16 19:38:02+00`**, `prediction_deadline = 2026-08-21 18:00:00+00`, `tournament_id = b1299174-…` still set, 3 members, 3 entries, 0 predictions |
| `pool_round_states` in state `'open'` **in the entire database** | **exactly one row** — that pool's `mw_1`, deadline `2026-08-21 19:00:00+00` |
| `matches WHERE stage='regular_season'` | 380 · `teams` 68 · `tournaments` 2 · `shadow_match_state` **484** (104 WC + 380 PL, already stamped) |
| `sync_settings` | `prod_scoring_enabled=true`, `leaderboard_broadcast_enabled=true`, `analytics_sweep_enabled=true` (`analytics_last_run_at` moved this minute), `pool_cache_enabled=true`. **No `shadow_reconcile_enabled` key, no `shadow_materialize_enabled` key** — both default to *enabled* in their readers |
| triggers on `shadow_entry_totals` | `broadcast_pool_leaderboard_ins` + `_upd`, both `tgenabled='O'` |
| triggers on `pool_entries` | **none** |
| `matches.on_match_completed` | `tgenabled='D'` — disabled |

The Premier League has been withdrawn from the create-pool wizard and the marketing strip, and the
one real league pool has been archived rather than deleted. **Neither of those closes the live
hazard**, for a reason nobody has stated before: see §0.3.

### 0.3 The thing that is live, dated, and not closed by archiving

pg_cron **jobid 3** (`0 0 * * *`, ACTIVE) POSTs a Supabase Edge Function named `auto-submit`
**whose source is not in this repository** — there is no `supabase/` directory at all. Its
`autoSubmitProgressiveRounds` branch selects:

```
pool_round_states .select('id, pool_id, round_key, deadline').eq('state','open').lt('deadline', now)
```

Unbounded, **and not joined to `pools`**. Every World Cup progressive round is `completed` (1,840)
or `locked` (121), so this branch has been a zero-row no-op for weeks. Verified live: **the first
and only row it will pick up is the league pool's `mw_1`, at 00:00 UTC on 22 August.**
`ROUND_MATCH_STAGES['mw_1']` is `undefined` → `[]` → `.in('stage', [])` → zero matches → `continue`
for every entry — and then the `UPDATE … SET state='in_progress'` runs *unconditionally* after the
entry loop.

**Archiving the pool does not stop this, because the query never reads `pools`.** Deleting the pool
does. That is why L0 exists and why it is dated.

### 0.4 What v3 carries forward from v2 unchanged

Kept because a finding did not force a change, and because rewriting a correct decision is how a
design loses the evidence behind it:

- **The eight tables** of v2 §1 (`league_seasons`, `league_clubs`, `league_matchweeks`,
  `league_fixtures`, `league_predictions`, `league_match_scores`, `league_entry_totals`,
  `league_fixture_state`) — same columns, same constraints, same indexes. v3 adds a **ninth**
  (`league_score_events`, §4) because side-effect ownership demanded a durable outbox.
- **`pools` option A**: nullable `league_season_id`, `tournament_id` loses `NOT NULL`, one
  exactly-one CHECK. Options B and C stay rejected for v2's reasons. v3 adds two more CHECKs (§2).
- **`CompetitionRef`** as the single competition discriminator, and the rule that a guard reads only
  columns its own SELECT names. Strengthened, not softened (§B).
- **`UNIQUE (season_id, provider_round)`** on `league_matchweeks` — the declarative kill for the
  ordinal-collision class.
- **Stored, frozen `lock_at`** — not a per-write `MIN(match_date)` aggregate.
- **Derived matchweek state, zero `pool_round_states` rows for a league pool** — the evidence for it
  (121 stuck rows, postponement deadlock, the 1,000-pool ceiling) is unrefuted and §0.3 has now
  *added* a reason. One consequence is corrected (§3.4).
- **SQL-only scoring, one implementation.** The Node engine is not forked. What changes is that the
  SQL engine now has a Node *orchestrator* in front of it, which is not the same thing (§4).
- **`league_fixtures.matchweek_id` as a hard FK** and `(kicked_off_at, fixture_number)` as the
  chronology pair.
- **`base_points` + `total_points`** column names on `league_match_scores`, the four-value
  `score_type` vocabulary, and the 22-key read-boundary synthesis.

### 0.5 What v3 changes structurally

| # | Change | Forced by |
|---|---|---|
| 1 | A **Node orchestrator** in front of the SQL drain, plus a durable `league_score_events` outbox | SW-C1 / CP-C1 |
| 2 | A **`fixtureStore(ref)` adapter** and a bucketed disposition for all **95** `.from('matches')` sites | SW-C2 |
| 3 | The **write path** is a first-class section: create → save → submit, with five mode gates, two seeders and one 404 named | UI-C1, CP-C3, CP-C4 |
| 4 | The **real cron surface**: 18 pg_cron jobs, 7 deployed edge functions, 2 dead repo routes | CP-C2 |
| 5 | Reveal is decided **from the deadline, never from the state string**, for a league | SW-H2 |
| 6 | `lite_recalc_entry` and `snapshot_pool_ranks` join the containment set (5 → **7** sites), and two of v2's four prescribed conjuncts are **corrected** | WC-C2, §B |
| 7 | `has_submitted_predictions` + `predictions_submitted_at` are set **inside the write RPC**, on first save | SW-H3, N7 |
| 8 | `pools.prediction_deadline` is **NULL for a league**, enforced by CHECK | CP-H1 |
| 9 | A **super-admin league fixture editor** with a `manual_override` flag | CP-H5 |
| 10 | **Sixteen phases**, not ten | honesty |

---

## A. Finding disposition

`WC` = R.wc-safety · `SW` = R.silent-wrongness · `UI` = R.ui-reuse · `CP` = R.completeness.
Nine criticals, fourteen highs — the exact counts in v2 §R. None dropped.

### A.1 The nine criticals

| # | Finding | v3 disposition |
|---|---|---|
| **WC-C1** | §1.7's printed `broadcast_pool_leaderboard()` body emits `n.point_adjustment`; `shadow_entry_totals` has no such column, so cron 19/20 abort every minute | **ACCEPTED. Fixed in the code block, not the prose** — §1.11 prints the `to_jsonb(n)->>` derivation inline. Re-verified live: `shadow_entry_totals` = `{entry_id, pool_id, match_points, current_match_rank, previous_match_rank, updated_at, bonus_points, total_points, final_rank, previous_final_rank}`. The reviewer is right, twice over: it is the same defect class as W1/N1, in the one shared-function edit the design takes. §B row 4 records the relation-by-relation check |
| **WC-C2** | `lite_recalc_entry` is an unlisted third writer of `pool_entries.scored_total_points` / `current_rank`, SECURITY DEFINER, called from the browser after every admin adjustment; falsifies D6's justification | **ACCEPTED, and the reviewer *understated* it.** Verified live: `proacl` grants EXECUTE to `PUBLIC`, `anon`, `authenticated`, `service_role`, and the body has **no authz check of any kind** — any anon caller can re-rank any pool by `pool_id`. That is a live World Cup authz hole independent of the league. §10.2 adds the league arm as containment site 5 **and** §15 D11 puts the authz hole in front of Ryan as its own decision |
| **SW-C1** / **CP-C1** | The SQL drain cannot call TypeScript, so `fanOutResultPushes`, `detectAndPushBadgesForPool` and `invalidatePoolCache` have no caller for a league pool — and v2's `success:false` deletes the block that fires them **today** | **ACCEPTED — and this is the finding that reshapes the design.** Verified: `recalculate.ts:103-112` currently calls all three inside the league early return. §4 is a new first-class section: outbox table + Node orchestrator (option d + option b, together), with the exhaustive four-plus-two side-effect list. `league_fixtures.result_pushes_sent_at` — the column v2 created with no writer, which the reviewer correctly read as the tell — now has one |
| **SW-C2** | v2 inventories 46 `from('predictions')` sites and never does the equivalent for fixtures; `grep` returns **95** `from('matches')` sites | **ACCEPTED.** §6 is the bucketed disposition of all 95, from the commissioned inventory. The `.from('matches')` ESLint confinement rule moves to **L2** alongside the predictions rule. The `/live` refresh-storm mechanism the reviewer derived is real and is named in §6.3 |
| **UI-C1** | `predictions/route.ts` carries mode gates v2 never examined; three break a league pool | **ACCEPTED, and there are FIVE not four** — verified by grep: `:81`, `:107`, `:156`, `:190`, `:231`, all the literal `=== 'progressive'`. §7.2 walks each. The reviewer's mechanism for gate 5 is also corrected: `predictions/round/route.ts` **cannot** set the flag today because it 400s at `:53` first; what actually sets it is the out-of-repo auto-submit edge function |
| **CP-C2** | v2 is blind to what the crons actually run: jobid 3 posts to an out-of-repo edge function carrying a drifted hand-copy of `lib/auto-submit.ts` | **ACCEPTED.** §5 is the full surface: 18 pg_cron jobs, 7 deployed edge functions, 2 dead repo routes, with a disposition each. §0.3 dates the hazard. Every containment predicate v2 wrote against `lib/auto-submit.ts` is confirmed to be **a no-op in production** |
| **CP-C3** | Nothing in v2 creates a league pool; both create routes 400/500 under the exactly-one CHECK, and the wizard catalogue never queries `league_seasons` | **ACCEPTED.** §7.1 covers all four creation surfaces plus a single `lib/competitions/catalogue.ts` loader. D8 is restated correctly: the outage is not "zero competitions in the wizard", it is "no code path produces a league pool at L15 either" |
| **CP-C4** | A league member cannot submit a matchweek: `predictions/round/route.ts` 400s at `:53` and 404s at `:76` | **ACCEPTED, with a correction.** Verified: the 400 at `:53` fires **first**, so the 404 at `:76` is unreachable today — both must be fixed, in that order. §7.3 |

### A.2 The fourteen highs

| # | Finding | v3 disposition |
|---|---|---|
| **WC-H1** | The guard rule has no compile-time enforcement: `createAdminClient()` is untyped, `competitionRef(row: object)` deleted the structural check, `poolData.ts:188` casts `as PoolData` | **ACCEPTED in full.** §B.2 restores the structural parameter type, makes `getPoolDataUncached` the one checked producer, and — the part that matters most — names `entryAnalytics.ts:62-68` as a select that **must be widened in the same commit**, because otherwise the throw takes down the live analytics sweep for all 623 World Cup pools |
| **WC-H2** | §7.1's conjunct on `shadow_detect_diffs`'s mismatch INSERT has no `po` alias in scope | **ACCEPTED — and I extended the check to all seven sites, because this is a guard-rule violation in the design's own containment list.** Verified by dumping every body: `shadow_eligible_entries` ✓ has `pools po`; `shadow_finalize_totals`'s `tmp_ft` ✓; `shadow_reconcile_adjustments`'s pool select ✓; `shadow_detect_diffs` **coverage** ✓ but **mismatch INSERT ✗** (only `shadow_entry_totals s JOIN pool_entries pe`). Two further sites v2 never listed have **no `pools` join at all**: `snapshot_pool_ranks` and `lite_recalc_entry`. §B.1 |
| **WC-H3** | `entryAnalytics.ts:268-278` is a **second** writer of `entry_xp_state`, driven by a live per-minute cron; v2's containment set misses it because it is TypeScript | **ACCEPTED.** Verified live: `analytics_sweep_enabled=true`, jobid 15 active at `* * * * *`, `analytics_last_run_at` moving. The route's own header comment saying "DRAFT, not enabled" is **stale and is what misled the review**. Containment site 6. L10's XP assertion becomes a provenance check, not a row count |
| **SW-H1** | Duplicate of WC-C1 (the `point_adjustment` code block) | **ACCEPTED**, same fix. Recorded separately because two independent reviewers found it, which is the signal that the prose/code split in v2 was the actual defect |
| **SW-H2** | The derived state machine reopens S1: `LOCKED_ROUND_STATES` contains `'locked'`, and derived state marks every future non-open matchweek `'locked'` → every future pick is revealed | **ACCEPTED — this is the sharpest finding in the review.** Verified at `lib/predictions/revealGate.ts:41` and `:117-120`. §3.4: for a league, reveal is decided **from the deadline alone**; `readRoundStates` nulls `state` for future league matchweeks before the gate sees it. The reviewer's own suggestion, taken as written |
| **SW-H3** | `has_submitted_predictions` is not "a UI affordance": four surfaces read it as "this member did nothing", and the Submit route refuses partial matchweeks | **ACCEPTED.** §7.4: the write RPC sets `has_submitted_predictions` **and** `predictions_submitted_at` on first save, in one statement, inside the transaction. That satisfies both this and N7 without reintroducing a scoring gate. `MembersTab.tsx:86` joins the `usesRounds` sweep |
| **UI-H1** | v2's ten-reader `pool_round_states` list is short by at least six, including the submit route | **ACCEPTED**, merged with CP-H3 into one mechanically-derived inventory (§3.5) |
| **UI-H2** | The admin **Rounds** tab renders for league pools and is a permanent red error toast | **ACCEPTED, and the reviewer's better option taken:** `rounds/route.ts` serves the derived rows through `readRoundStates` and `RoundsTab` hides its Open/Extend buttons. Hiding the tab loses the only surface showing 38 locks. §12 |
| **UI-H3** | The U3 class survives at `badges.ts:466` (`showtime`) and `:460` (`stadium_regular`) — and these write to append-only `badge_unlocks` and fire APNs | **ACCEPTED.** §8.6's table gains both rows, and the instruction is *grep the file for the literal `104` and for `stage !== 'group'`*, not fix named lines. Merged with the separate SW medium that found `:459`/`:460` independently |
| **CP-H1** | v2 never decides what `pools.prediction_deadline` holds for a league pool; six live consumers key on it | **ACCEPTED, NULL chosen, and CHECK-enforced.** `CHECK (league_season_id IS NULL OR prediction_deadline IS NULL)`. That one decision closes the reveal leak's `scope:'all'` branch, gate 3 of the save route, both auto-submit sweeps and the lazy page sweep. It **costs** the pre-lock nudges, which §11 repoints at `league_matchweeks.lock_at` in the same phase |
| **CP-H2** | §8 covers four sweeps; there are at least eight, plus the edge functions | **ACCEPTED.** §11 covers all eight repo sweeps + all seven edge functions, each with a disposition, each with the "log how many you excluded" rule |
| **CP-H3** | `.from('pool_round_states')` is **41 sites across 27 files**, not ten | **ACCEPTED**, merged with UI-H1. §3.5. The confinement lint rule moves to **L2** |
| **CP-H4** | `seedPoolRoundStates` still writes 38 rows for a league pool; nothing stops the next pool | **ACCEPTED, and it is worse than stated:** §0.3 shows those 38 rows are what the live edge function walks. §7.1 deletes the `league_pickem` branch and `insertLeagueRounds`, makes the function **throw** on a league ref, and deletes the **second, unnamed seeder** at `app/pools/[pool_id]/page.tsx:96-113` in the same commit as the `usesRounds` repoint at `:87` |
| **CP-H5** | No admin path to correct a league fixture, over a 9-month season | **ACCEPTED.** §12.3: a super-admin league fixture editor + `league_fixtures.manual_override boolean` the sync arm respects. This is a real regression against the World Cup's operational position and it is not optional |

### A.3 The mediums and lows — disposed of, not dropped

| # | Finding | Disposition |
|---|---|---|
| WC-M1 | Collapsing `getShadowReadPools` onto `getScoringSource` adds N `sync_settings` round-trips per page | **ACCEPTED.** Keep the collapse; memoize with `React.cache()` and an optional pre-resolved `Set` parameter for batch call sites. L9 verifies "no additional `sync_settings` reads per pool" |
| WC-M2 | L0's read-only CTE cannot verify `score_type`, which is what the substitutions control | **ACCEPTED, reviewer's method taken verbatim.** Prove the substitutions by **equivalence before the edit** — `bool_and(stage_has_scheduled_teams(stage) = (stage='group'))` over `DISTINCT stage`, and the same for `mode_submits_per_round`. Two pure reads. Keep the pricing CTE for base/multiplier/total |
| WC-M3 | `stage_uses_base_prices` omitted from the KEEP list while 046 lists all three as droppable | **ACCEPTED.** §10.4 enumerates all three with a status each, and the same note goes on `046_league_scoring.sql` beside its DO-NOT-RUN header |
| WC-M4 | Crons 19/20/15 armed during the revert steps | **ACCEPTED.** Verified: **both** `shadow_reconcile_matches` and `shadow_reconcile_adjustments` read `shadow_reconcile_enabled`, so one `sync_settings` write quiesces both. Analytics sweep has its own key. L1 step 0 sets both false and step 9 restores |
| WC-L1 | Two wrong line refs in L0 step 1 | **ACCEPTED.** The single required W11 edit is `.eq('tournament_id', pool.tournament_id)` on the `teams` select at `lib/poolData.ts:181-186`. The `recalculate.ts:129` item is dropped — that read already carries the filter |
| SW-M1 | The D6 mirror omits `previous_rank` and `last_rank_update` | **ACCEPTED.** Both added to the mirror (§8.3). `last_rank_update` is what hooks a league pool into cron 15; `previous_rank` is what makes ▲/▼ work for the seven non-adapter readers |
| SW-M2 | `badges.ts:459` `stadium_regular` | Merged into **UI-H3** |
| SW-L1 | "Exactly one open matchweek" is unsatisfiable for a sentinel-start pool | **ACCEPTED, restated:** *at most* one `open`; exactly one whenever the season has a matchweek with `lock_at > now()` at or after the pool's start. The sentinel case is an expected zero |
| UI-M1 | The `league_fixtures → MatchData` / `league_clubs → TeamData` mapping tables were dropped | **ACCEPTED.** §9.3 restores both explicitly, and L9's typed test covers `round_number`, `stage`, `match_number`, `home_team_id`, `away_team_id` |
| UI-M2 | §10 undercounts mobile by ~3× — 14 files, and `ProgressivePredictionWizard`'s `RoundKey` is a closed seven-value union | **ACCEPTED.** §13 names all 14 and states plainly that the wizard's union is a widening job, not a repoint |
| UI-M3 | Nothing writes `entry_round_submissions` / `has_submitted_predictions` for a league entry | **ACCEPTED**, closed by SW-H3's first-save write plus a per-season lock sweep for `entry_round_submissions` (§7.4) |
| UI-L1 | `LeagueTable` mounts behind `stageTab === 'group' && hasGroupResults` | **ACCEPTED.** §12.2 names the gate change alongside the mount, and §15 D9 states whether a league gets a standings surface in v1 |
| CP-M1 | Mid-season joiners have no per-entry start | **ACCEPTED as a decision, not a build item.** §15 **D12**: recommendation is *late joiners score from zero and the UI says so*, with `pool_entries.league_start_matchweek` designed but not built. Silence here is what the house rule forbids; a decision is not |
| CP-M2 | One-open-matchweek vs a DB that accepts any future pick | **ACCEPTED — resolved by making pick-ahead a real decision (§15 D13), not an accident.** Recommendation: allow pick-ahead, i.e. `state='open'` for every unlocked matchweek at or after start. This also removes the two-gate disagreement **and** is only safe because SW-H2's deadline-only reveal lands first. The two findings are coupled and must ship together |
| CP-M3 | `pool_match_prediction_accuracy` has three callers, not one | **ACCEPTED.** `poolData.ts:327`, `crowd/route.ts:39,52`, `entries/[entry_id]/analytics/route.ts:157`. Caller counts in v3 come from grep, stated as such |
| CP-M4 | `/play/[slug]` and `/tv/[slug]` absent | **ACCEPTED.** §12.4. Memory records both consumers share the component — run unfiltered `tsc` |
| CP-M5 | No cache-invalidation hook for a pure-SQL engine | **ACCEPTED**, folded into §4's drain — the Node route is a request context, which is the only place `revalidateTag` works |
| CP-L1 | Analytics sweep keys on `last_rank_update`, which the mirror does not stamp | Merged into **SW-M1** |
| CP-L2 | `notify-round-open` unmentioned | **ACCEPTED.** §11: explicit refusal + `readRoundStates` |
| CP-L3 | No season-end story | **ACCEPTED.** `hasSeasonEnded(last_kickoff_at)` beside `hasCompetitionEnded`, used by the catalogue loader. A season-complete notification is **explicitly out of v1** and recorded in §15 D14 rather than left silent |

### A.4 Where a reviewer was wrong, or incomplete

Reviewers can be wrong. Three cases, each verified:

1. **WC-H2 is right about `shadow_detect_diffs` but stops one site short.** It says the other three
   functions "take one conjunct cleanly". Two do. But v2's containment list is itself incomplete:
   `snapshot_pool_ranks` (verified body: `pool_entries pe` joined only to `pool_members pm`, no
   `pools` at all) and `lite_recalc_entry` (same shape, plus `match_scores`) reach league entries
   today and cannot take a `po.` conjunct either. §B.1.
2. **UI-C1 says four gates; there are five.** `:107` (`canEdit`) is the one it misses, and it is the
   gate that makes the GET report the season uneditable even when the POST would have worked.
3. **UI-C1's mechanism for gate 5 is wrong in a way that matters.** It attributes
   `has_submitted_predictions` to `predictions/round/route.ts:161-166`. Verified: that route returns
   **400 at `:53`** for any non-progressive pool, so it never reaches its own flag write. The actual
   writer is the out-of-repo `auto-submit` edge function (§0.3). The finding survives; the fix
   target moves, and it moves to a file that is not in this repository.

One reviewer claim I could not reproduce and am recording as *unverified*: `analytics-sweep`'s route
header calls itself a draft with a kill switch defaulting false. The **header is stale** — the flag
is `true` and the job is active. I have not read the route's default-when-absent branch, so if the
key is ever deleted the behaviour is unknown. L10 asserts on the flag's presence, not its default.

---

## B. The guard rule, and the audit that proves it was applied

### B.1 The rule, and the seven-site audit

> **A competition guard may only read columns the relation or SELECT that feeds it actually carries,
> and the parse must throw when they are absent — never default.**

Four instances of violating it have now shipped into these designs: `recalculate.ts` (v1),
`getScoringSource` (v1), `broadcast_pool_leaderboard`'s `n.point_adjustment` (v2), and
`shadow_detect_diffs`'s `po.` alias (v2 §7.1). **So for v3 I dumped `pg_get_functiondef` for every
function the design touches and checked each proposed predicate against the aliases actually in
scope.** Results — this table is the audit, not a summary of one:

| # | Object v3 modifies | Aliases/columns actually in scope (verified live) | v2's prescription | v3 |
|---|---|---|---|---|
| 1 | `shadow_eligible_entries` | `pool_entries pe`, `pool_members pm`, **`pools po`** | `AND po.league_season_id IS NULL` | **VALID** — one conjunct, as claimed |
| 2 | `shadow_finalize_totals` (`tmp_ft` CTE) | `pool_members pm`, `pool_entries pe`, **`pools po`** | same | **VALID** — one conjunct |
| 3 | `shadow_reconcile_adjustments` (pool select) | `pool_entries pe`, `pool_members pm`, **`pools po`**, `shadow_entry_totals se` | same | **VALID** — one conjunct |
| 4 | `shadow_detect_diffs` — **coverage** subquery | `pool_entries pe`, `pool_members pm`, **`pools po`**, `shadow_entry_totals st` | same | **VALID** — one conjunct. This is the site that would otherwise carry a permanently-red `league_pickem: {live:N, shadow:0}` key |
| 5 | `shadow_detect_diffs` — **mismatch INSERT** | `shadow_entry_totals s`, `pool_entries pe` — **no `pools`, no `pool_members`** | same | **INVALID — DROPPED.** Unresolvable alias. Also unnecessary: the join is INNER and originates at shadow, so absence cannot diff, and with site 3 applied a league entry can never acquire a `shadow_entry_totals` row |
| 6 | `snapshot_pool_ranks(uuid[])` | `pool_entries pe`, `pool_members pm` — **no `pools`** | *not listed in v2* | **NEW SITE.** Needs an added `JOIN pools po ON po.pool_id = pm.pool_id` before the conjunct, not a conjunct alone. Reached today: `sync-fixtures/route.ts:329-333` passes the league pool's `tournament_id` |
| 7 | `lite_recalc_entry(uuid, uuid)` | `pool_entries pe`, `pool_members pm`, `match_scores ms` — **no `pools`** | *not listed in v2* | **NEW SITE.** Guard is a scalar subquery naming its own relation: `IF (SELECT league_season_id FROM pools WHERE pool_id = p_pool_id) IS NOT NULL THEN …` |
| 8 | `broadcast_pool_leaderboard()` | transition table `new_rows` = **`shadow_entry_totals`** *or* **`league_entry_totals`**, depending on which trigger fired | emits `n.point_adjustment` | **CORRECTED.** `shadow_entry_totals` has no such column (verified column list). §1.11 uses `COALESCE((to_jsonb(n)->>'point_adjustment')::int, n.total_points - n.match_points - n.bonus_points)`, which is valid against **both** relations |
| 9 | `recalculatePool` league guard | `.select('pool_id, tournament_id, prediction_mode')` at `recalculate.ts:76` | widen to `COMPETITION_COLUMNS` | **CARRIED** |
| 10 | `getScoringSource` | signature `(admin, poolId, predictionMode: string)` — **no pool row** | take a `CompetitionRef` | **CARRIED**; the `predictionMode === 'league_pickem'` line at `readSource.ts:88` is deleted |
| 11 | `enforce_league_prediction_before_lock` | `league_fixtures f` (`is_completed`, `matchweek_id`, `fixture_id`), `league_matchweeks mw` (`lock_at`) | — | **CHECKED** against §1.3/§1.4 DDL. All four columns exist |
| 12 | `assert_league_prediction_pool` | `pool_entries pe.member_id` ✓, `pool_members pm.pool_id` ✓, `pools po.league_season_id` (added §2), `league_fixtures f.season_id` ✓ | — | **CHECKED.** Ordering constraint: the `pools` column must be added **before** this function is created |
| 13 | `reject_league_pool_prediction` on `predictions` | same three relations as 12 | — | **CHECKED** |
| 14 | `trg_league_adjustment_rescore` on `pool_entries` | `WHEN (OLD.point_adjustment IS DISTINCT FROM NEW.point_adjustment)` — `pool_entries` **has** `point_adjustment` ✓ (verified). Body joins out via `pool_entries.member_id` ✓ | — | **CHECKED.** Note: `pool_entries` currently has **zero** non-internal triggers, so this is the first |
| 15 | `refresh_league_matchweek_window` | `league_fixtures` (`matchweek_id`, `kickoff_at`, `is_completed`), `league_matchweeks` (all five window columns) | — | **CHECKED** against §1.3/§1.4. LEFT JOIN correction carried |
| 16 | `league_round_states(uuid)` | `pools` (`pool_id`, `league_season_id`, `created_at`, `league_start_matchweek`) — the last two added in §2 | — | **CHECKED** |
| 17 | `league_finalize_totals` | `pool_entries` (`point_adjustment` ✓, `predictions_submitted_at` ✓, `member_id` ✓ — all verified in the live column list) | — | **CHECKED** |
| 18 | Analytics-sweep containment | `entryAnalytics.ts:62` selects **`'tournament_id, prediction_mode'`** | *not listed in v2* | **NEW SITE (WC-H1/WC-H3).** Widening this select is a **precondition** of `getScoringSource` taking a `CompetitionRef`. Get the order wrong and the throw kills XP refresh for 623 pools |

**Two general lessons the audit produced, both now rules:**

- A containment conjunct is only writable where a `pools` alias already exists. Where it does not,
  the correct form is either a new join (site 6) or a scalar subquery that names its own relation
  (site 7). "Add one conjunct to each" is not a portable instruction, and stating it as the
  *verification* — as v2 did — makes the verification enforce the bug.
- **Verification restated:** *`pg_get_functiondef` diff shows exactly one added conjunct in FOUR
  functions (sites 1–4), one added JOIN plus one conjunct in `snapshot_pool_ranks`, one added
  leading `IF` block in `lite_recalc_entry`, and NOTHING in `shadow_detect_diffs`'s mismatch INSERT.*

### B.2 Making the rule enforceable, not aspirational (WC-H1)

The reviewer is right that the rule currently has no compiler behind it. `lib/supabase/server.ts:63-77`
constructs the admin client with no `Database` generic, so every `.select()` yields `any`; and
`lib/poolData.ts:188` does `poolRes.data as PoolData`, so replacing `tournament_id: string` with
`competition: CompetitionRef` on `PoolData` produces an object with no `competition` key and no error
at the producer.

Three changes, all in L4:

```ts
// lib/competition/ref.ts
export type CompetitionRef =
  | { kind: 'world_cup'; tournamentId: string }
  | { kind: 'league';    seasonId: string }

export const COMPETITION_COLUMNS = 'tournament_id, league_season_id'

/** Structural, not `object` — v2 widened this and deleted the only static check. */
export interface CompetitionColumns {
  tournament_id: string | null
  league_season_id: string | null
}

export function competitionRef(row: CompetitionColumns): CompetitionRef {
  if (!('tournament_id' in row) || !('league_season_id' in row)) {
    throw new Error('competitionRef: select must include COMPETITION_COLUMNS')
  }
  if (typeof row.league_season_id === 'string') return { kind: 'league', seasonId: row.league_season_id }
  if (typeof row.tournament_id === 'string')    return { kind: 'world_cup', tournamentId: row.tournament_id }
  throw new Error('competitionRef: pool has neither competition')
}
```

1. **One checked producer.** `getPoolDataUncached` builds `competition: competitionRef(poolRes.data)`
   explicitly instead of casting. Every other consumer receives an already-valid ref.
2. **Enumerate the selects that feed a ref by grep, and widen them in the same commit.** The list is
   not "whatever the compiler finds", because the compiler cannot see `any`. Minimum set:
   `recalculate.ts:76`, **`entryAnalytics.ts:62`**, `badges.ts:89`, `poolData.ts:188`,
   `predictions/route.ts:63,150`, `bulk/route.ts`, `entries/[entry_id]/predictions/route.ts`,
   `leaderboard/route.ts`, `live/route.ts`, `home-scoring/route.ts`, `activity/route.ts`.
3. **A runtime throw is the last line, not the first.** L4's gate is a captured response diff across
   4 endpoints × 5 World Cup pools, plus a forced-throw test asserting the analytics sweep still
   processes 623 pools.

---

## 1. DDL — nine tables

Prefix `league_`. Nothing named for a bracket; nothing named for a country. **§§1.1–1.9 are carried
forward from v2 byte-for-byte unless a finding forced a change** — I am not re-litigating settled
DDL. Only the deltas are spelled out below; the unchanged bodies are in v2 §1 and remain
authoritative for column lists.

| Table | Status vs v2 |
|---|---|
| `league_seasons` (§1.1) | **unchanged** |
| `league_clubs` (§1.2) | **unchanged** |
| `league_matchweeks` (§1.3) | **unchanged** — including `UNIQUE (season_id, provider_round)`, stored `lock_at`, and `CHECK ((fixture_count = 0) = (lock_at IS NULL))` |
| `league_fixtures` (§1.4) | **+2 columns** (§1.4a) |
| `league_predictions` (§1.5) | **unchanged** |
| `league_match_scores` (§1.6) | **unchanged** — `base_points` + `total_points`, four-value `score_type` |
| `league_entry_totals` (§1.7) | **+1 column** (§1.7a) |
| `league_fixture_state` (§1.8) | **unchanged** |
| `league_bonus_scores` | **still not created** (v2 §1.9). Confirmed — a table with no writer invites one |
| **`league_score_events`** (§1.10) | **NEW** — the outbox that gives side effects an owner (SW-C1) |

### 1.4a `league_fixtures` — two added columns

```sql
-- CP-H5: a 9-month season needs a human override. The sync arm must not
-- silently undo a correction, which is the World Cup's `relinquish` lesson.
ALTER TABLE league_fixtures ADD COLUMN manual_override   boolean NOT NULL DEFAULT false;
ALTER TABLE league_fixtures ADD COLUMN manual_override_by uuid;
-- `result_pushes_sent_at` was already in v2 §1.4 with no writer and no reader.
-- §4 gives it both. It is the fixture-level idempotency key for result pushes.
```

### 1.7a `league_entry_totals` — the mirror needs one more

v2 stored `point_adjustment` here so the broadcast could emit it. Keep that. Add:

```sql
previous_final_rank integer   -- already present in v2
-- nothing new on this table; the SW-M1 additions land on pool_entries via the
-- mirror (§8.3), not here.
```

No change. Recorded so the diff is explicit rather than assumed.

### 1.10 `league_score_events` — the outbox (SW-C1 / CP-C1)

```sql
CREATE TABLE league_score_events (
  event_id     bigserial PRIMARY KEY,
  pool_id      uuid NOT NULL REFERENCES pools(pool_id)                 ON DELETE CASCADE,
  fixture_id   uuid NOT NULL REFERENCES league_fixtures(fixture_id)    ON DELETE CASCADE,
  kind         text NOT NULL,          -- 'fixture_scored' | 'pool_rescored'
  created_at   timestamptz NOT NULL DEFAULT now(),
  claimed_at   timestamptz,            -- lease: set by the drain, cleared on failure
  processed_at timestamptz,
  attempts     integer NOT NULL DEFAULT 0,
  last_error   text,
  CONSTRAINT league_score_events_kind_ck CHECK (kind IN ('fixture_scored','pool_rescored'))
);
-- One unprocessed event per (pool, fixture, kind). A re-score inside the same
-- minute coalesces instead of queueing a second push.
CREATE UNIQUE INDEX uq_lse_pending ON league_score_events (pool_id, fixture_id, kind)
  WHERE processed_at IS NULL;
CREATE INDEX idx_lse_pending ON league_score_events (created_at)
  WHERE processed_at IS NULL;
```

**Why a table and not `pg_net` from the drain.** Verified: `net.http_request_queue` has columns
`(id, method, url, headers, body, timeout_milliseconds)` — no attempt counter, no status, no
next-retry. Exactly one attempt, no dead-letter. Outcomes land in `net._http_response`, which holds
a rolling ~6 hours (776 rows spanning 13:45→19:44 today, all 200) and which
`grep -rn "_http_response" app lib scripts` shows **zero readers**. A dropped push would leave no
trace in the data. Ten simultaneous Saturday-15:00 kickoffs would also fire ten unbatched requests
from inside the scoring transaction. And the codebase's one existing trigger→HTTP bridge,
`notify_match_completed`, is **disabled in production** (`tgenabled='D'`) with an anon JWT baked into
its body — it is the pattern's own worked example of why not to copy it.

A committed row costs a minute when something breaks, not the event. "Is anything stuck?" is one
`SELECT`, alarmable from pg_cron SQL like jobid 21 — which matters because the thing that is broken
may be the Node side.

The two-source-of-truth objection (v2 §3.2(3)) does not apply: this table is not a *state* anyone
reads for correctness. Scoring is already committed before the event row exists. The outbox only
records *"a notification is owed"*, and a lost row degrades to a missing push, never to a wrong
score. §14 L8's verification includes "kill the drain for 10 minutes, restart, assert no event is
lost and none is double-sent".

### 1.11 `broadcast_pool_leaderboard()` — corrected body (WC-C1 / SW-H1)

**This code block is the artifact. There is no correction hidden in prose below it.**

Verified live before writing: `shadow_entry_totals` columns are exactly
`entry_id, pool_id, match_points, current_match_rank, previous_match_rank, updated_at, bonus_points,
total_points, final_rank, previous_final_rank`. **There is no `point_adjustment`.** Both
`broadcast_pool_leaderboard_ins` and `_upd` are attached to that table and both are enabled.

```sql
CREATE OR REPLACE FUNCTION broadcast_pool_leaderboard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE r record;
BEGIN
  -- W10: per-table switch falling back to the existing global key, so behaviour
  -- is byte-identical until someone sets the specific key.
  IF COALESCE(
       (SELECT setting_value FROM sync_settings
         WHERE setting_key = 'leaderboard_broadcast_enabled_' || TG_TABLE_NAME),
       (SELECT setting_value FROM sync_settings
         WHERE setting_key = 'leaderboard_broadcast_enabled'),
       to_jsonb(true)) = to_jsonb(false)
  THEN RETURN NULL; END IF;

  FOR r IN
    SELECT n.pool_id,
           jsonb_agg(jsonb_build_object(
             'entry_id',            n.entry_id,
             'match_points',        n.match_points,
             'bonus_points',        n.bonus_points,
             -- Old key retained so nothing reading it breaks.
             'total_points',        n.total_points,
             -- N2: LiveEntry and liveMerge compare these two. Emitting neither
             -- is why the merge writes `undefined` into both on every broadcast.
             'scored_total_points', n.total_points,
             -- GUARD RULE (§B row 8): this function is attached to TWO relations.
             -- shadow_entry_totals has no point_adjustment column; league_entry_totals
             -- does. to_jsonb(n) is valid against both; n.point_adjustment is not.
             -- Verified on the World Cup arm: 164 of 164 entries with a non-zero
             -- pool_entries.point_adjustment satisfy total = match + bonus + adjustment,
             -- so the derivation reproduces the stored value exactly.
             'point_adjustment',    COALESCE((to_jsonb(n)->>'point_adjustment')::int,
                                             n.total_points - n.match_points - n.bonus_points),
             'current_rank',        n.final_rank,
             'previous_rank',       n.previous_final_rank
           ) ORDER BY n.final_rank) AS entries
    FROM new_rows n WHERE n.pool_id IS NOT NULL GROUP BY n.pool_id
  LOOP
    PERFORM realtime.send(
      jsonb_build_object('pool_id', r.pool_id, 'entries', r.entries),
      'leaderboard_update', 'pool:' || r.pool_id::text || ':leaderboard', true);
  END LOOP;
  RETURN NULL;
END; $$;

CREATE TRIGGER broadcast_pool_leaderboard_ins AFTER INSERT ON league_entry_totals
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION broadcast_pool_leaderboard();
CREATE TRIGGER broadcast_pool_leaderboard_upd AFTER UPDATE ON league_entry_totals
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION broadcast_pool_leaderboard();
```

**Mandatory pre-attach test** (L7, before either league trigger exists): inside `BEGIN … ROLLBACK`,
apply the new body and force one `shadow_entry_totals` UPDATE; assert the emitted JSON carries all
seven `LiveEntry` keys and that `point_adjustment = total_points - match_points - bonus_points`.
PL/pgSQL resolves column references at *runtime*, so `CREATE OR REPLACE` succeeding proves nothing —
that is precisely how this defect would reach production.

**Why this is a launch blocker rather than a league feature.** The current payload writes `undefined`
into `point_adjustment` and `scored_total_points` on every broadcast, and `liveMerge.ts:76-97`
compares and then writes all six/seven fields. It has never been seen because the World Cup finished
before it shipped and `shadow_finalize_totals` is diff-aware, so no row reaches the transition table.
The Premier League's first goal is the first real execution.

### 1.12 RLS and league triggers — carried, with the guard-rule note

Unchanged from v2 §1.10: read-only `SELECT USING (true)` on the four calendar tables; four policies
transcribed from `predictions` onto `league_predictions` (own-select, admin-select, insert, update,
with `pe.predictions_locked = false AND po.archived_at IS NULL` carried over); deny-all on
`league_match_scores`, `league_entry_totals`, `league_fixture_state`, `league_score_events`.

`enforce_league_prediction_before_lock` (silent skip) and `assert_league_prediction_pool` (RAISE) are
unchanged and both pass §B rows 11–12. `refresh_league_matchweek_window`'s LEFT-JOIN correction is
carried and passes §B row 15.

---

## 2. The one touch on `pools`

Option A, unchanged. Nullable second FK, `tournament_id` loses `NOT NULL`, one exactly-one CHECK.
Options B (polymorphic) and C (bridging table) stay rejected for v2 §2.1's reasons.

```sql
ALTER TABLE pools ADD COLUMN league_season_id uuid REFERENCES league_seasons(season_id);
ALTER TABLE pools ALTER COLUMN tournament_id DROP NOT NULL;

ALTER TABLE pools ADD CONSTRAINT pools_exactly_one_competition CHECK (
  (tournament_id IS NOT NULL AND league_season_id IS NULL) OR
  (tournament_id IS NULL     AND league_season_id IS NOT NULL));

-- NEW (CP-C3): mode and competition cannot drift apart route-side.
ALTER TABLE pools ADD CONSTRAINT pools_league_mode_ck CHECK (
  (league_season_id IS NULL) = (prediction_mode <> 'league_pickem'));

-- NEW (CP-H1): the single decision that closes four separate failures.
ALTER TABLE pools ADD CONSTRAINT pools_league_no_pool_deadline_ck CHECK (
  league_season_id IS NULL OR prediction_deadline IS NULL);

CREATE INDEX idx_pools_league_season ON pools(league_season_id) WHERE league_season_id IS NOT NULL;

ALTER TABLE pools ADD COLUMN league_start_matchweek integer
  CHECK (league_start_matchweek IS NULL OR league_start_matchweek BETWEEN 1 AND 60);
COMMENT ON COLUMN pools.league_start_matchweek IS
  'First matchweek this pool plays. NULL = derive from pools.created_at.';
```

All 624 existing rows satisfy all three CHECKs today (the one league pool is deleted in L1 before
these land, and every World Cup pool has a non-NULL `tournament_id`, a bracket mode and whatever
deadline it has). `pools_tournament_id_fkey` survives. `DROP NOT NULL` does not rewrite the table.

**`pools_league_no_pool_deadline_ck` is the highest-value line in this section.** With
`prediction_deadline` guaranteed NULL for a league:

- `computeReveal`'s `scope:'all'` branch can never fire — `isDeadlinePassed(null)` is `false`;
- gate 3 of the save route (`:156-168`) cannot 403 the season;
- both auto-submit draft sweeps select `.lt('prediction_deadline', now)` with
  `.not('prediction_deadline','is',null)`, so a league pool drops out of both — **including the
  out-of-repo edge function**, which is the only containment that reaches it without a redeploy;
- the lazy sweep at `app/pools/[pool_id]/page.tsx:162-168` never fires.

It **costs** the pre-lock nudges. §11 repoints `firePendingDeadlineWarnings` and
`firePredictReminders` at `league_matchweeks.lock_at` in the same phase. That coupling is not
optional and is called out in L11's exit criteria.

### 2.1 The safeguard

`PoolData` drops `tournament_id` and gains `competition: CompetitionRef`, built by the one checked
producer (§B.2). `next.config.ts` already fails the build on type errors, so every
`pool.tournament_id` read becomes a compile error — **for the ~50 sites the compiler can see.** The
`any` holes are closed by the explicit grep list in §B.2 step 2, not by hope.

Explicitly **not** added: no `competition_kind` discriminator column. `prediction_mode` plus the two
CHECKs make it redundant, and a third source of truth is a third thing to disagree.

---

## 3. Round state — derived, and reveal-safe

### 3.1 The decision stands: a league pool holds ZERO `pool_round_states` rows

v2's evidence is unrefuted and §0.3 adds to it. Re-verified today: **121 rows across 42 of 281
progressive pools are still `state='locked'` a month after the final**; the completion-gated cascade
structurally deadlocks on a postponed fixture, which is routine in a league; and both driving selects
(`lib/auto-submit.ts:206-211`, `:385-388`) are unbounded, so past ~1,000 league pools all crossing
Saturday 12:30 together, PostgREST truncates silently.

And now the strongest argument, which is new: **the only `state='open'` row in the entire production
database is the league pool's `mw_1`, and an out-of-repo cron will walk it on 22 August and flip it
to `in_progress` with zero submissions.** Stored rows are not merely a maintenance cost here; they
are the surface an unversioned deployed function operates on.

### 3.2 The derivation function — one correction from v2

Carried from v2 §3.4 unchanged **except** the `open` arm, which changes if D13 (pick-ahead) is taken:

```sql
--            WHEN mw.matchweek_number = o.open_mw   THEN 'open'      -- D13 = one-at-a-time
--            WHEN mw.lock_at > now()                THEN 'open'      -- D13 = pick-ahead
```

Everything else — the `start_mw` sentinel (`matchweek_count + 1`, never NULL), the
`ORDER BY lock_at, matchweek_number` ordering that makes a postponement non-blocking, the
`fixture_count > 0` conjunct, the seven identical column names — is unchanged and passes §B row 16.

Health assertion restated per SW-L1: **at most one** `open` under D13-one-at-a-time; **at least one**
whenever the season has an unlocked matchweek at or after `start_mw`; the sentinel case is an
expected zero, not a violation.

### 3.3 The reveal correction — the finding v2's own decision created (SW-H2)

Verified at `lib/predictions/revealGate.ts:41`:

```ts
const LOCKED_ROUND_STATES = new Set(['locked', 'in_progress', 'completed'])
```

and `isRoundLocked` at `:117-120` returns `true` for any of them. The semantics are *"immutable
pool-wide, therefore safe to show everyone"*. In the World Cup that is sound only by accident: a
`locked` knockout round has no fixtures with teams, so it has no picks. **All 380 Premier League
fixtures exist with real club names in August.** Route a league into the progressive branch and
`computeReveal` returns `scope:'rounds'` containing every matchweek except the open one — including
all 37 future ones — and nothing at the database layer prevents a future pick existing.

**Fix, exactly as the reviewer proposed:**

1. `readRoundStates` **nulls the `state` field** for any league matchweek whose `lock_at > now()`
   before the row leaves the adapter. `isRoundLocked` then falls through to
   `isDeadlinePassed(round.deadline, now)`, and `deadline` **is** `lock_at`, which is exactly correct.
2. No new vocabulary, no new flag threaded through `computeReveal`, and the World Cup path is
   byte-identical because no World Cup round state is ever nulled.
3. `revealGate.ts:54` becomes `if (usesRounds(pool.prediction_mode))`; `PredictionMode` widens to
   four values from one exported place; both `as PredictionMode` casts
   (`bulk/route.ts:99`, `entries/[entry_id]/predictions/route.ts:106`) become `parsePredictionMode(x)`.
4. **`filterRevealedPredictions`'s third argument becomes a match → round-key map**, not match →
   stage. For a league the key is `mw_{n}` derived from `league_fixtures.matchweek_id`.
5. L6 verification: *store an MW38 pick while MW1 is open, then assert a second member's `/bulk` and
   `/entries/:id/predictions` responses contain none of it.*

This is what makes D13 (pick-ahead) safe to take. The two ship together or neither does.

### 3.4 `readRoundStates` — the one door

```ts
// lib/rounds/read.ts — the only place either shape is read.
export async function readRoundStates(admin, poolId, ref: CompetitionRef): Promise<RoundState[]>
```

League → RPC `league_round_states(poolId)` with the SW-H2 state-nulling applied on the way out.
World Cup → `pool_round_states`. Same seven column names both ways.

### 3.5 The complete reader inventory (UI-H1 + CP-H3)

v2 said "ten-odd, two in Expo". Mechanically: **41 sites across 27 files.** All route through
`readRoundStates`. Bucketed:

| Bucket | Sites |
|---|---|
| **Write gates — these decide whether a pick is accepted** | `predictions/round/route.ts:67-77` (`.single()` → **404**, CP-C4) · `predictions/route.ts:83` · `predictions/route.ts:192` · `predictions/unlock/route.ts:80` |
| **Read paths** | `app/pools/[pool_id]/page.tsx:89` · `bulk/route.ts` · `entries/[entry_id]/predictions/route.ts` · `rounds/route.ts:43` · `app/pools/page.tsx:191` · `app/dashboard/page.tsx:268` · `mobile/lib/useHomeData.ts:366-369` · `mobile/components/pool-detail/PoolInfoTab.tsx:466` |
| **Admin** | `admin/pools/[id]/route.ts:85` · `admin/pools/[id]/actions/route.ts:311, :789` · `admin/users/[id]/route.ts:182` · `admin/notify-round-open/route.ts:41` · `admin/send-pending-reminders:137` · `admin/send-template:89, :394, :583` |
| **Lifecycle** | `app/api/account/delete/route.ts:112` · `lib/roundMatches.ts:65` (file deleted, §9.5) |
| **Scripts** | `scripts/verify-bulk-reveal-gate.ts:68, :120` — **the privacy check for the visibility feature reads the table directly, so it cannot see a league pool's round state even after the reveal fix.** Same class as N3 |
| *(remainder: label/format-only reads, no behaviour)* | 12 further sites |

**The ESLint `no-restricted-syntax` rule confining `.from('pool_round_states')` to `lib/rounds/`
ships in L2**, so the list cannot grow during the build — the treatment v2 gave `.from('predictions')`
and withheld here.

---

# GAP 1

## 4. Side-effect ownership — SQL cannot call TypeScript

v2 §5.5 said `league_reconcile_fixtures()` would *"then fire XP/badges for the affected pools"*. It
is a plpgsql function invoked as `SELECT public.league_reconcile_fixtures()` from pg_cron. It cannot.
This is SW-C1 / CP-C1, and it is the finding that reshapes the design.

### 4.1 The exhaustive side-effect list

`grep -rn "fanOutResultPushes|detectAndPushBadgesForPool|invalidatePoolCache" app lib scripts components mobile`,
plus two the grep does not find because they live one level up:

| # | Side effect | Callers today | Owner in v3 |
|---|---|---|---|
| 1 | `fanOutResultPushes` (`lib/push/match-results.ts:79`) | exactly 2 — `recalculate.ts:104`, `:328` | league drain |
| 2 | `detectAndPushBadgesForPool` (`lib/push/badges.ts:79`) | exactly 2 — `recalculate.ts:107`, `:336` | league drain |
| 3 | `invalidatePoolCache` (`lib/poolData.ts:85`) | exactly 2 — `recalculate.ts:110`, `:343` | league drain (**must** be a request context — it wraps `revalidateTag`) |
| 4 | `snapshotPoolRanks` (`lib/scoring/snapshotRanks.ts:15`) | `sync-fixtures/route.ts:334` — the *caller*, not `recalculatePool` | league drain, **before** the score write, in the same run |
| 5 | `pool_entries` mirror + `last_rank_update` stamp (`recalculate.ts:593-621`) | in-transaction | `league_finalize_totals` (§8.3) |
| 6 | `entry_xp_state` write | `badges.ts:221-243` **and** `entryAnalytics.ts:268-278` — **two writers, not one** (WC-H3) | badge path via the drain; the sweep is contained until L10 |

**Verified today: `recalculate.ts:103-112` — the league early return — currently fires 1, 2 and 3.**
v2's S5 fix replaces that block with `success:false` and no side effects, which is why the reviewer
called it a regression against v1. It is.

**#4 is order-sensitive and v2 got it wrong.** `snapshotPoolRanks` must freeze `current_rank →
previous_rank` **before** the scoring that moves the rank, or ▲/▼ is wrong for that tick. v2 put the
league equivalent in its own pg_cron job, which lets it interleave with the drain. In v3 it is a step
inside one orchestrator run.

### 4.2 The four options, and the choice

| | Verdict |
|---|---|
| **(a) `pg_net` from the drain / an AFTER trigger** | **Rejected.** One attempt, no retry, no dead-letter (verified from `net.http_request_queue`'s column list). Outcomes purge in ~6h and have **zero readers** in the repo. Ten simultaneous kickoffs = ten unbatched requests inside the scoring transaction. The one live instance of this pattern, `notify_match_completed`, is **disabled** with an anon JWT in its body. And a lost message leaves no trace in the data |
| **(b) Outbox drained by a Node cron** | **Taken, as the durability half.** §1.10 |
| **(c) Supabase Edge Function** | **Rejected, hard.** The side effects import the Next.js app's own modules — `detectAndPushBadgesForPool` pulls `BADGE_DEFINITIONS`/`LEVELS` from `analytics/xpSystem` and `computePoolEntryAnalytics` from `entryAnalytics`, which pulls `readEntryScoring` from `readSource`. Porting means hand-forking the XP engine — *"parity is not an oracle"*. It cannot call `revalidateTag` at all. And the repo has **no `supabase/functions/` directory**, which is exactly how the live `auto-submit` copy drifted (§5). A sixth unversioned Deno copy of badge logic is the worst option available |
| **(d) Thin Node orchestrator: pg_cron + pg_net → Next.js route → RPC the drain → run the side effects** | **Taken, as the transport half.** It is the shape the product already runs — 9 live jobs of exactly this form, two directly analogous routes (`/api/cron/shadow-materialize` RPCs then does TS follow-up; `/api/cron/sync-fixtures` calls SQL then `recalculatePool` then `snapshotPoolRanks`). Zero new concepts, zero new secrets (vault `sync_cron_secret` + `process.env.CRON_SECRET`, the pattern at `sync-fixtures/route.ts:42-52`). It is a real request context, so `invalidatePoolCache` works — **no other option gives that**. It preserves the single-owner rule: SQL stays the only scoring implementation |

**(b) + (d) together.** They are not alternatives; (b) is what makes (d) survive a deploy window.

### 4.3 The shape

```
pg_cron  league-reconcile  (* * * * *)  → POST https://sportpool.io/api/cron/league-reconcile
```

```ts
// app/api/cron/league-reconcile/route.ts   (auth: sync_cron_secret, per sync-fixtures/route.ts:42-52)
// 1. RPC league_pools_going_live()   -> pool_ids whose next matchweek's first fixture just went live
//    await snapshotPoolRanks(poolIds)                       // SIDE EFFECT 4, ordered FIRST
// 2. RPC league_reconcile_fixtures() -> { scored: n, pools: uuid[] }
//    (pure SQL: advisory lock on hashtext('league_process_queue') — a DISTINCT key from
//     'shadow_process_queue', so the two engines never serialise against each other;
//     diff league_fixtures vs league_fixture_state; league_score_fixture each;
//     league_finalize_totals(affected); upsert the state mirror;
//     INSERT INTO league_score_events (pool_id, fixture_id, 'fixture_scored')
//       ON CONFLICT DO NOTHING)
// 3. RPC league_claim_score_events(p_cap => 40)  -> claimed rows, claimed_at = now()
// 4. per distinct pool, sequentially, capped:
//      await fanOutResultPushes()                            // SIDE EFFECT 1
//      await detectAndPushBadgesForPool(poolId)              // SIDE EFFECT 2
//      invalidatePoolCache(poolId)                           // SIDE EFFECT 3
//      stamp league_fixtures.result_pushes_sent_at
// 5. RPC league_complete_score_events(ids) | league_release_score_events(ids, err)
```

Caps follow the existing `CAP=40` / `RECALC_BATCH_SIZE=25` pattern. An unclaimed or released row is
simply picked up next tick — no poison-row special case beyond `attempts > 5 → alarm, stop
retrying`, surfaced by `league_scoring_health`.

`league_snapshot_ranks` as a **separate pg_cron job is deleted.** It becomes step 1 of this route.

### 4.4 What this changes about the "SQL-only scoring" rule

Nothing. Scoring is still one implementation, in SQL, computed once and stored. The Node layer runs
only things that are *already* TypeScript and already tested, and it holds no scoring logic. The
distinction the house rule cares about — one owner of the numbers — is intact.

### 4.5 A fourth and fifth score-table selector, folded in

`getScoringSource` is not the only mechanism. Verified: `badges.ts:376` picks by
`isProdScoringEnabled`; `match-results.ts:84` does the same; `recaps.ts:311` and `:123` read
`match_scores` directly. That is five mechanisms across four files. **All of them dispatch on
`CompetitionRef` in L9/L10.** A league pool that reads `match_scores` gets an empty array and calls
it a legitimate zero — the exact shape of "the RN home screen's form/accuracy/streak were dead".

---

# GAP 2

## 5. The real cron and edge-function surface (CP-C2)

**`vercel.json` is `{}` — three bytes, no `crons` key. Every scheduled thing in SportPool is
pg_cron + pg_net.** Reading `vercel.json` to decide what is scheduled gives the wrong answer for
every cron in this product, and it is what made a reviewer call the live analytics sweep a draft.

`pg_net 0.19.5`, `pg_cron 1.6.4`, both healthy. 18 jobs live.

### 5.1 pg_cron — all 18, with a league disposition each

| job | schedule | target | league disposition |
|---|---|---|---|
| 1 | `0 * * * *` | edge `send-deadline-reminders` | **inert** — `active=false`. See §5.3 note on re-enabling |
| 2 | `0 20 * * 0` | edge `send-weekly-recap` | **inert** — `active=false`, superseded by 11 |
| **3** | `0 0 * * *` | **edge `auto-submit`** | **HOSTILE AND DATED — see §0.3.** L0 |
| 4 | `0 * * * *` | edge `send-round-deadline-reminders` | **inert** — `active=false`. ⚠ this is the one that would be round-keyed; memory records "re-enable jobs 1/2/4" as open backlog, and re-enabling it lands on league matchweeks with no containment |
| 5 | `0 14 * * *` | edge `send-countdown-emails` | **permanently inert** — `KICKOFF` hardcoded `2026-06-11T00:00:00Z`, early-returns on line 1. Dead weight, not a risk |
| **8** | `* * * * *` | `/api/cron/sync-fixtures` | **ACTIVE ON THE LEAGUE TODAY.** `syncTargets.ts` selects `tournaments` rows with `external_league_id NOT NULL`, so the PL row is a confirmed live target; it will ingest 380 fixtures' scores from 21 Aug and call `recalculatePool` at `route.ts:448`. Disarm in L0, re-arm in L1 step 9, add the league branch in L3 |
| 9 | `*/30 * * * *` | `/api/cron/push-deadline-warnings` | pools by `status='open'` + `prediction_deadline` in 24h, **no competition filter**. Goes silent for a league once §2's NULL CHECK lands → **repoint at `league_matchweeks.lock_at`** (L11) |
| 10 | `0 * * * *` | `/api/cron/push-matchday-recap` | buckets by `(tournament_id, date)`, no filter → zero league recaps. **Repoint** (L11) |
| 11 | `0 20 * * 0` | `/api/cron/push-weekly-recap` | reads `match_scores` at `recaps.ts:311`. **Repoint + `league_match_scores` arm keyed on `calculated_at`** (L11). For a weekly competition this is the highest-value cadence the product owns |
| 12 | `*/30 * * * *` | `/api/cron/push-match-starting` | `matches` in T+60..T+90 unfiltered (`time-based.ts:47-56`), then pools `.eq('tournament_id', …)` at `:68-72`. **Repoint** (L11) |
| 13 | `0 17 * * *` | `/api/cron/push-predict-reminders` | keys on `prediction_deadline` → silent for a league. **Repoint at the open matchweek** (L11) |
| 14 | `15 4 * * *` | inline `DELETE FROM api_perf_log` | competition-agnostic. **Untouched** |
| **15** | `* * * * *` | `/api/cron/analytics-sweep` | **ACTIVE, `analytics_sweep_enabled=true`, ran this minute.** Selects any entry whose `last_rank_update` moved, no competition filter; `entryAnalytics.ts:62` selects `'tournament_id, prediction_mode'`. **Containment site 6** (L4), then a league arm (L10) |
| 18 | `*/15 * * * *` | `/api/cron/shadow-materialize` | kill switch `shadow_materialize_enabled` is **ABSENT** and the route treats absent as ENABLED (`route.ts:44-49`). League needs no equivalent (§4.2 of v2 — the lock precedes first kickoff, so a league prediction can never change after its fixture is scored). Leave inert, record why |
| 19 | `* * * * *` | SQL `shadow_reconcile_matches()` | reads `shadow_reconcile_enabled`, **absent → TRUE**. Already stamps `shadow_match_state` for all 380 PL fixtures (484 rows verified). Quiesced during L1; unreachable after the fork |
| 20 | `*/2 * * * *` | SQL `shadow_reconcile_adjustments()` | same flag. **Containment site 3** |
| 21 | `*/15 * * * *` | SQL `shadow_detect_diffs()` | **Containment site 4 — coverage subquery only** (§B row 5) |

**Two dead repo routes**, kept for reference, called by nothing:
`app/api/cron/auto-submit/route.ts`, `app/api/cron/reconcile-schedule/route.ts`.

### 5.2 The seven deployed edge functions

| name | live path | disposition |
|---|---|---|
| **`auto-submit`** | **cron 3, ACTIVE.** Hand-copied fork of `lib/auto-submit.ts` + `lib/auto-archive.ts`, with a literal 7-key `ROUND_MATCH_STAGES`, unbounded pool selects, its own inline green `baseTemplate()` (branding the repo deleted in Jul 2026), and **no `autoCompleteProgressiveRounds`** — which is the real explanation for the 121 stuck World Cup rounds: that function has never run in production at all | **§5.3** |
| `send-countdown-emails` | cron 5, permanently inert | leave; note in the inventory |
| `send-match-results` | only invoker is `notify_match_completed()`, `tgenabled='D'` | **no live path** |
| `send-deadline-reminders` | only invoker is cron 1, `active=false` | **no live path** |
| `send-round-deadline-reminders` | only invoker is cron 4, `active=false` | **no live path; flag the re-enable risk** |
| `send-weekly-recap` | only invoker is cron 2, `active=false` | **no live path** |
| `send-countdown-retry` | **no invoker at all** — no cron, no `pg_proc` reference | orphaned; delete or leave, but record it |

### 5.3 What to do about `auto-submit` — the decision, not a hedge

**Recommendation: retire the edge function and point cron 3 at `/api/cron/auto-submit`, in L1.**

Reasoning:

- Every containment predicate v2 wrote against `lib/auto-submit.ts` is a **verified no-op in
  production**. Writing more of them without fixing this is writing tests for dead code.
- The repo route already contains `autoCompleteProgressiveRounds`, which the edge copy lacks. Making
  the repo the live implementation is *also* the fix for a World Cup defect that has been silently
  live for months.
- Two implementations of the same sweep is the drift that produced this finding.
- L0 does not depend on this. L0's protection is deleting the pool (which removes the one `open`
  row) plus §2's NULL deadline CHECK (which removes league pools from the draft branch permanently,
  edge function or not). **Two independent defences, one of which does not require touching
  un-versioned code.**

If Ryan would rather not repoint a live cron during a rebuild, the fallback is: add
`.is('league_season_id', null)` to the edge function's three pool selects and redeploy it — but that
requires source that does not exist in this repository, which is the argument for retiring it.

**L1 must assert which of the two is live before any predicate is written.**

---

# GAP 3

## 6. The `matches` reader disposition — all 95 sites (SW-C2)

`grep -rn "from('matches')" app lib mobile components scripts` → **95 sites**. v2 named ~15.

Under option A, `pools.tournament_id` is NULL for a league pool and `.eq('tournament_id', null)`
renders as `tournament_id=eq.null` — **zero rows, HTTP 200, no error.** §6.6 of v2 argued the fork
turns readers into *unreachable* code; that is true for the shadow engine and **false for the app**,
where they become silent-empty.

### 6.1 The adapter and the lint rule

```ts
// lib/fixtures/store.ts — the only place either shape is read.
export interface FixtureStore {
  forCompetition(): Promise<MatchData[]>
  forRound(roundKey: string): Promise<MatchData[]>       // returns the ERROR, never []
  byIds(ids: string[]): Promise<MatchData[]>
  counts(): Promise<{ total: number; completed: number }>
  live(): Promise<MatchData[]>
}
export function fixtureStore(ref: CompetitionRef): FixtureStore
```

**The ESLint rule confining `.from('matches')` to `lib/fixtures/` ships in L2**, alongside the
`predictions` and `pool_round_states` rules — not L13. Same reason: the inventory must not grow
during the build.

### 6.2 Buckets

Five dispositions, every one of the 95 in exactly one.

| Disposition | Meaning | Count |
|---|---|---|
| **UNAFFECTED** | Bracket-only by construction, or gated by a mode/stage filter a league can never satisfy | 41 |
| **REPOINT** | Goes through `fixtureStore(ref)` | 22 |
| **BRANCH** | Needs a league arm *and* a stated behaviour when there is none | 24 |
| **REFUSE** | Returns an explicit error for a league pool | 4 |
| **DEAD** | A league arm exists but is orphaned by the fork; delete it so it cannot mislead | 4 |

### 6.3 The sites that decide whether the product works

Not the whole table — the ones whose failure mode is *silently wrong* rather than *silently empty*:

| Site | What actually happens | Disposition |
|---|---|---|
| **`app/api/pools/[pool_id]/live/route.ts:109`** | `eq.null` → `[]`. `completed_matches: 0` while the client holds N completed fixtures → `needsFullRefresh` (`liveMerge.ts:26-28`) true on **every** tick → `PoolDetail.tsx:704` calls `router.refresh()` on the 30s poll **and** on every debounced broadcast → a permanent full-RSC refresh storm during the exact window the product guarantees live standings. Separately `liveIds` is always empty, so `readMatchScoresNarrow` and `readEntryStats` never run: totals move via the broadcast while form dots, hit rate, streak and per-match scores stay frozen | **REPOINT** |
| **`app/api/pools/[pool_id]/predictions/route.ts:364`** | **Silently wrong, not empty.** `predicted = 0` (picks are in `league_predictions`) and `total = 0`, so `0 < 0` is false, the completeness gate **passes**, the entry is stamped `has_submitted_predictions=true` + `predictions_submitted_at=now()` (the N7 rank tiebreaker) and a "Predictions submitted" email is sent — **for zero picks** | **REFUSE** (409) |
| **`app/profile/page.tsx:344`** | **COMPLETELY UNSCOPED.** Verified live: returns **484** today (104 WC + 380 PL), so **every World Cup member's profile already shows the wrong denominator** at `ProfilePage.tsx:900/905/981/1039`. This is W11's twin, it is a live World Cup bug, and it is in no version of this design | **BRANCH — and it is an L1 fix, not an L13 one** |
| `app/dashboard/page.tsx:79, :103` | `userTournamentIds` has **no `.filter(Boolean)`**, so NULL enters the array. Verified in SQL: a `uuid[]` with a NULL element under `= ANY()` returns the World Cup rows and nothing for the league — silent-partial, no error | **BRANCH** |
| `app/pools/page.tsx:125` | `tournamentIds` **does** `.filter(Boolean)`, so no query is issued at all; the Map lookup misses and `totalMatches` falls to 0 → **wrong `highest_level`** on the pool card | **BRANCH** |
| `app/api/pools/[pool_id]/bulk/route.ts:88` | Empty stage map → `filterRevealedPredictions` does `allowed.has(map.get(id) ?? '')` → **fails closed**, every other member's picks dropped permanently. It does **not** leak; the SW-H2 leak is on the `scope:'all'` branch, which bypasses this map | **BRANCH** |
| `entries/[entry_id]/predictions/route.ts:187` | Same map, same fail-closed → a league member never sees another member's picks, all season, with a 200 and an empty array. This is the shipped visibility feature | **BRANCH** |
| `app/api/pools/[pool_id]/leaderboard/route.ts:92` | `[]` — and `matches` is `[]` not `null`, so the `!matches` 500 guard does not fire. No matchday MVP, no upcoming fixtures, `total_count: 0` | **REPOINT** |
| `lib/analytics/entryAnalytics.ts:72` | `[]`; the `if (!matches) return []` guard does not fire (it is `[]`, not `null`) so it computes analytics over nothing. **Its pool select at `:62` must be widened before `getScoringSource` takes a ref** (§B row 18) | **REPOINT** |
| `app/api/matches/[match_id]/{scores,stats}/route.ts` | `.single()` → **404** for every league fixture; kills the whole match-detail surface. Only consumers are `mobile/lib/api.ts:552,579` | **REPOINT** |
| `app/api/users/[user_id]/activity/route.ts:634` | `.in('match_id', fixtureIds)` → no rows → every league score event renders **"TBD vs TBD"** with a null date | **REPOINT** |
| `entries/[entry_id]/breakdown/route.ts:173` | `[]` → the breakdown modal has a correct header total and **no rows beneath it** — compounds U1 | **REPOINT** |
| `lib/auto-archive.ts:43, :49, :61` | `tournamentIds` from `pools.map(p => p.tournament_id)`; the league contributes NULL. Fails safe via `totalCount > 0`, so **a completed season stays `open` forever** | **BRANCH** |
| `app/play/[slug]/getTournamentSummary.ts:84` | Called unguarded at `page.tsx:77` → `0 of 0`; `:60` maps `league_pickem` to the label **"Full Tournament"** | **BRANCH** (§12.4) |
| `app/api/pools/[pool_id]/bonus/calculate/route.ts:77` | `[]`. Note `:166` **bulk-deletes bonus rows BEFORE** the refusal at `:181` — running it is destructive | **REFUSE** (400, moved above the delete) |
| `app/api/admin/send-pending-reminders/route.ts:159` · `send-template/route.ts:413` | `ROUND_MATCH_STAGES['mw_7']` → `undefined` → `.in('stage', [])` → 0 rows → `totalRoundMatches === 0` → **silent `continue`**, no log line. Zero matchweek lock reminders | **BRANCH** (N4) |
| `app/api/admin/notify-round-open/route.ts:65` · `app/api/pools/[pool_id]/rounds/route.ts:54` | Both **already have** a matchweek arm against the old schema, and both are unreachable because the caller filters `prediction_mode='progressive'` first | **DEAD** — delete the arms, or the next reader believes league support exists |
| `app/admin/super/MatchesTab.tsx` (5 sites) · `app/admin/super/page.tsx:177` | Post-fork a league fixture never appears, so **there is no admin surface that can hand-fix a PL score** | **UNAFFECTED** here, but this is CP-H5 → §12.3 |
| `lib/integrations/apiFootball/importLeagueSeason.ts:312, :463` | The importer that put the 380 rows in `matches` | **REPOINT** (L2) |
| `app/api/admin/advance-teams/route.ts` (7 sites) | Bracket-only. `:62` is globally unscoped and reads the 380 PL rows today, filtered downstream by stage — benign, and the unscoped read memory already tracks | **UNAFFECTED** |

**One correction to the reviewer:** it lists `lib/email/segments.ts:305` as unnamed and needing
treatment. Verified: that site filters to the five World Cup knockout stages for a historical
one-shot `bracket_fix_affected` segment. A league fixture can never match. **UNAFFECTED** — a false
positive, recorded so nobody re-raises it.

### 6.4 The ordering constraint that makes this dangerous

**`/live` must be repointed in the same phase as `poolData.ts`, or before it.** If L9 repoints
`lib/poolData.ts:199-205` at `league_fixtures` while `/live` still reads `matches`, the refresh storm
above is *created* by the fix. L5 does the fixture repoint as one phase for exactly this reason.

---

# GAP 4

## 7. The league write path, end to end (CP-C3, CP-C4, UI-C1, CP-H4, SW-H3)

Three joints, each of which is currently broken independently. v2 addressed none of them.

### 7.1 Create a pool

**Four creation surfaces**, not one.

| Surface | Today | v3 |
|---|---|---|
| `app/api/pools/create/route.ts` | `:56` 400s when `tournament_id` is missing; `:68` inserts it; **`prediction_mode` is never validated** — any string reaches the DB and a CHECK violation surfaces as a 500 at `:84`; `:139` seeds round states for `progressive` **or `league_pickem`** | `:44-54` accept `league_season_id`. `:56-58` becomes an **XOR**: `if (!pool_name?.trim() || (!!tournament_id === !!league_season_id)) return 400`. Passing *both* must 400 here, not reach the CHECK as a 500. Replace the untyped mode with `parsePredictionMode(x)` that throws. **Force `prediction_deadline = NULL`** for a league (§2). `:139` → `=== 'progressive'` only. Zero every `knockout_*`, multiplier, `pso_*` and `bonus_*` price, leaving `group_exact_score / group_correct_difference / group_correct_result` — otherwise the admin ScoringTab shows prices nothing honours |
| `app/api/admin/branded-pools/route.ts` | `:103-105`, `:132-157`, `:217` — same three defects. `GET :46-55` also selects `tournaments(name)`, NULL for a league | Same three edits. Add `league_seasons(competition_name, season_label)` to the GET and collapse both into one display field, or the branded-pool admin list shows a blank competition column |
| `components/pools/CreatePoolModal.tsx` | **Half-live.** `:131` filters leagues out of the query, but `isLeagueTournament` (`:154`), the `league_pickem` mode card (`:466-469`), `effectiveMode` (`:164-168`) and the "Matchweek 1 Deadline" label (`:570`) all remain. `effectiveMode` currently *coerces* a stale `league_pickem` back to `full_tournament` | Consume the catalogue loader below. `effectiveMode` keys on `entry.kind === 'league'` and the coercion **inverts**: a league entry forces `league_pickem` and the three bracket modes become un-offerable. **Do not leave `:154`/`:466`/`:570` half-armed** — `:466` is what makes `effectiveMode` reachable at all |
| `mobile/app/create-pool.tsx` | Catalogue at `:156-157` is `.or('format.is.null,format.eq.groups_knockout')`; **zero occurrences of `league_pickem` anywhere in `mobile/`**. It cannot create a league pool and will not do so accidentally | **No change until L14.** When it changes it is an OTA, so per memory's EAS rule the API must already accept `league_season_id` *and* still accept a body without it, deployed first |

**One catalogue loader.** `lib/competitions/catalogue.ts` returns
`{kind:'world_cup', tournamentId, …} | {kind:'league', seasonId, …}`, unioning `tournaments`
(bracket formats, not ended by `hasCompetitionEnded`) with `league_seasons` (not ended by a new
`hasSeasonEnded(last_kickoff_at)`, CP-L3). Consumed by all three creation surfaces.
`app/competitions.ts` is the **landing-strip marketing array only** (`app/page.tsx:7`) — flipping it
to `'open'` creates nothing. **D8 restated: the outage is not "the wizard offers zero competitions
between L0 and L15"; it is "there is no code path that produces a league pool at L15 either."**

**Both seeders die (CP-H4).**

1. `lib/poolRoundStates.ts` — delete `:67-87` (the `league_pickem` branch) and `insertLeagueRounds`
   (`:105-150`). `seedPoolRoundStates` must **throw** on a league ref, not return `{seeded:0}` — a
   silent zero is indistinguishable from a failed seed, and §3.1's invariant then has no enforcement.
2. **`app/pools/[pool_id]/page.tsx:96-113` lazily inserts seven hardcoded World Cup round keys when
   `roundStates.length === 0`.** It is unreachable today only because `:87` gates on
   `=== 'progressive'`. §12 prescribes changing `:87` to `usesRounds()` — **doing that without
   deleting `:96-113` first turns a dead branch into an active writer of `group`/`round_32`/…/`final`
   rows into a league pool.** Delete the lazy seed in the same commit, or before it.

Health assertion (§10.5):
`count(*) FROM pool_round_states prs JOIN pools po USING (pool_id) WHERE po.league_season_id IS NOT NULL` = **0**.

### 7.2 Save picks — five mode gates, not four (UI-C1)

`app/api/pools/[pool_id]/predictions/route.ts`, verified by grep. All five are the literal
`=== 'progressive'`.

| Line | Gate | What a `league_pickem` pool hits |
|---|---|---|
| `:81` (GET) | builds `roundStatus` from `pool_round_states` + `entry_round_submissions` | false → **the response has no `roundStatus` key at all**. Every per-round consumer gets nothing |
| `:107` (GET) | `canEdit` ternary — **the gate the reviewer missed** | takes the else: `!has_submitted && !locked && !isPastDeadline`. Goes false permanently the moment either fires |
| `:156-168` (POST) | else-branch rejects on the pool-wide deadline | **403 "Prediction deadline has passed"** from 2026-08-21 18:00Z, for all 38 matchweeks |
| `:190-218` (POST) | round `state !== 'open'` 403, round-deadline 403, already-submitted-this-round 403 | **skipped entirely.** The client *does* send `roundKey` (`ProgressivePredictionsFlow.tsx:295`); only the mode literal skips it |
| `:231-233` (POST) | `mode !== 'progressive' && entry.has_submitted_predictions` → 403 | **403 on every save, forever**, once the flag is set |

Also `:70-73` (GET) counts the denominator as `matches WHERE tournament_id = pool.tournament_id` —
380 today, 0 under option A. Wrong either way.

**A third failure neither v2 nor the review names: the accepted-but-dropped save.** Because gate 4 is
skipped, a save into an already-locked matchweek is accepted: the RPC runs, the BEFORE trigger
returns NULL for those rows, and the route returns **200 with a fresh `lastSaved`** — the UI shows
"Saved". §4.1 of v2 justified the silent-skip lock by saying *"the UI shows the matchweek as locked
before a member can hit it"*. That justification rests entirely on a gate that is skipped for the
mode it was written for.

**And the route can already detect it and does not.** `save_predictions_batch` returns `inserted`
from the upsert's `RETURNING`; a BEFORE trigger returning NULL suppresses the row from `RETURNING`.
So `insertedIds.length < toUpsert.length` is an exact, free signal. `:274` collects them and never
compares.

**Changes:**

1. All five literals → `usesRounds(pool.prediction_mode)`. Widen the pool selects at `:63-67` and
   `:150-154` to carry `COMPETITION_COLUMNS`.
2. `:190`'s round lookup goes through `readRoundStates(admin, poolId, ref)`, **not**
   `.from('pool_round_states')….single()`. A league pool has no row; `.single()` on zero rows returns
   `data: null` **plus an error this call site discards**, so the whole `if (roundState)` block is
   skipped and the save is accepted. Note the asymmetry: this discard **fails open** where the submit
   route's identical read **fails closed** (404).
3. **`roundKey` becomes required for a rounds pool.** Today `&& roundKey` at `:190` means omitting it
   skips validation.
4. **Validate fixture membership.** Nothing checks that the posted `matchId`s belong to `roundKey`.
   A client can post MW38 ids with `roundKey:'mw_1'` and pass the open-round gate. This matters far
   more for a league: all 380 fixtures exist with real club names in August, so every future
   matchweek is pickable by id from day one. **This is the write-side half of SW-H2** — if pick-ahead
   is writable, the read gate is the only thing between MW38 picks and every other member.
5. **The write:** `save_league_predictions_batch(p_entry_id uuid, p_predictions jsonb)`, SECURITY
   INVOKER (so RLS enforces ownership exactly as today), upserting `league_predictions` on
   `(entry_id, fixture_id)`, returning `{inserted, predicted}`. Routed through
   `predictionStore(ref).upsert()` so no route names a table.
6. **409 on a short return.** Compare `inserted.length` against the request length and name the
   dropped fixture ids. This is what makes D10's silent-skip trade-off honest instead of a second
   silent-empty.
7. **§7.4's two flags, set inside the RPC transaction.**
8. GET `:70-73`'s denominator becomes the open matchweek's `league_matchweeks.fixture_count`, with
   the season total as a separate field. **Never a `matches` count.**
9. The **PUT all-at-once handler** (`:295-412`) → **409 `{error:'league pools submit per matchweek'}`**,
   returned **before** any write. Today it would stamp `has_submitted_predictions` and email for zero
   picks (§6.3).

### 7.3 Submit a matchweek (CP-C4)

`app/api/pools/[pool_id]/predictions/round/route.ts`:

- `:53` — `if (!pool || pool.prediction_mode !== 'progressive') return 400 'Pool is not in progressive mode'`.
  **This fires first.** Verified by grep. So the 404 at `:76` is unreachable *today*, and the
  reviewer's claim that this route sets `has_submitted_predictions` is wrong — it never gets there.
- `:67-77` — `pool_round_states … .eq('round_key', roundKey).single()` → **404 'Round not found'** for
  a league pool, once `:53` is fixed.
- `:121-127` — 400 unless `predictedCount >= totalRoundMatches`. A member who picks 9 of 10 **cannot
  submit at all**.

**Fix, in order:** `:53` → `usesRounds()`; `:67-77` → `readRoundStates`; `:121-127` keeps the
completeness requirement for the *explicit* Submit action but is no longer load-bearing, because
§7.4 sets the flags on first save. L6 verification: *a league member submits matchweek 1 through the
real route and gets 200; then saves a pick in matchweek 2 and gets 200.*

### 7.4 The two flags, and who sets them (SW-H3 + N7 + UI-M3)

Removing the submission gate from scoring is right — it dissolves S4 at the root. But
`has_submitted_predictions` is **not** "a UI affordance". Four surfaces read it as *this member did
nothing*: `analyticsHelpers.ts:354-366` (crowd consensus drops their predictions), `:665-677`/`:722`
(pool-wide accuracy over a subset; `totalEntries` under-reports), `AnalyticsTab.tsx:427-436`
(`if (submittedEntryIds.size < 2) return null` — the whole comparison section vanishes),
`admin/MembersTab.tsx:86,143-170` (`isProgressive` is a literal, so a league falls to the
`has_submitted_predictions` arm of `memberStatus`).

And `predictions_submitted_at` is the **rank tiebreaker** (§8.3). Left NULL, a member who never
presses Submit sorts last on every tiebreak, all season, silently.

**Decision: both are set on the entry's FIRST SAVED PREDICTION, in one statement, inside
`save_league_predictions_batch`'s transaction, guarded by `.is('predictions_submitted_at', null)`.**

A second PostgREST call would re-open the discarded-error hole on the value the leaderboard tiebreak
depends on — which is the whole reason it goes in the RPC.

`entry_round_submissions` gets a **per-season sweep** at matchweek lock: for every entry with ≥1
`league_prediction` in the matchweek that just locked, write `has_submitted = true` and
`prediction_count`. Cheap (one statement per matchweek per season, 38 total), set-based, and it
keeps the submission chips honest for a member who never pressed the button.

**The tension is real and both sides are satisfiable:** making saves work requires the flag *not* to
gate them (gate 5 → `usesRounds`), while the display surfaces require it to be *set*. Stating it is
the point.

### 7.5 The write-path invariants, as assertions

Added to `league_scoring_health` (§10.5):

```
no pool with league_season_id IS NOT NULL has a row in pool_round_states
no pool with league_season_id IS NOT NULL has a non-NULL prediction_deadline
every entry with >=1 league_prediction has has_submitted_predictions = true
                                        AND predictions_submitted_at IS NOT NULL
no league_prediction exists for a fixture whose matchweek locked before the row's created_at
```

---

## 8. The scoring engine

Carried from v2 §5 with three changes: the drain gets an orchestrator (§4), the mirror gets two more
columns, and `badges.ts` gets two more fixes.

### 8.1 Where it lives: SQL only, one implementation

Unchanged. `lib/scoring/recalculate.ts` is the enforcement point, with the select widened at `:76`
per §B row 9. The early return returns `success: false` with an explanatory error **and** — this is
the v3 change — the L8 orchestrator exists before that edit lands, so the side effects are never
orphaned. **Phase order is load-bearing: L8 ships before L7's `success:false` edit, not after.**

### 8.2 `league_score_fixture(p_fixture_id uuid, p_final boolean)`

Unchanged from v2 §5.2. Eligibility: the entry's pool has `league_season_id = fixture.season_id`; a
`league_predictions` row exists; the fixture has both goals; `is_completed OR (NOT p_final AND
status='live')`. **No submission gate** — a stored league prediction *is* an eligible one, because
`enforce_league_prediction_before_lock` makes a post-lock write impossible.

`score_type`: `exact` / `winner_gd` / `winner` / `miss`. **No `teams_match` gate** — a league fixture
names its own teams; that gate is the entire content of the bug that makes a league pool score zero
today. Points: flat base from `pool_settings.group_*`, `COALESCE`d to `5/3/1`. No multiplier, no PSO.
`base_points = total_points`. Diff-aware upsert.

### 8.3 `league_finalize_totals(p_pool_ids uuid[])` — the mirror, corrected

Aggregation and the rank cascade are unchanged:

```
RANK() OVER (PARTITION BY pool_id
  ORDER BY total_points DESC, exact_count DESC, correct_count DESC,
           bonus_points DESC, predictions_submitted_at ASC NULLS LAST)
```

`point_adjustment` copied from `pool_entries`; `total_points = match + bonus + adjustment` (the fold
is mandatory — `readEntryScoring` reconstructs the adjustment as `tp - mp - bp`). Diff-aware write to
`league_entry_totals`, because the broadcast trigger uses the statement's transition table and
`PoolDetail.tsx:754` depends on unchanged rows never reaching it.

**Then mirrors into `pool_entries` — SIX columns now, not four (SW-M1):**

```
match_points, bonus_points, scored_total_points, current_rank,
previous_rank        -- from league_entry_totals.previous_final_rank
last_rank_update = now()
```

`previous_rank` is read directly off `pool_entries` at `dashboard/page.tsx:61,469-473`,
`CommunityTab.tsx:954-955`, `DesktopSidebar.tsx:384`, `community/helpers.tsx:196-200`,
`LeaderboardTab.tsx:789,814,1109` and by six mobile readers — every ▲/▼ that does not go through
`readEntryScoring`. Without it they read NULL, which is a legitimate "no movement yet", forever.

`last_rank_update` is the **only** change-detector cron 15 uses. Without it a league pool is never
selected by the analytics sweep even after L10 enables the league arm — and a future engineer turning
the switch on will see it "work".

### 8.4 The drain

Per §4.3. `league_reconcile_fixtures()` holds an advisory lock on `hashtext('league_process_queue')`
— **a distinct key from `shadow_process_queue`**, so the two engines never serialise against each
other. It writes `league_score_events` rows and returns counts; it fires nothing.

### 8.5 Entry-side recompute (S5)

`league_rescore_pool(p_pool_id uuid)` re-scores every completed/live fixture of the pool's season and
finalizes. `POST /api/pools/[pool_id]/recalculate` dispatches on `CompetitionRef`. Plus the durable
backstop for the path with no route behind it:

```sql
CREATE TRIGGER trg_league_adjustment_rescore
  AFTER UPDATE OF point_adjustment ON pool_entries
  FOR EACH ROW WHEN (OLD.point_adjustment IS DISTINCT FROM NEW.point_adjustment)
  EXECUTE FUNCTION league_rescore_on_adjustment();   -- first statement is the league test
```

Passes §B row 14. Note `pool_entries` currently carries **zero** non-internal triggers, so this is the
first — worth saying out loud in the migration header.

### 8.6 XP and badges — five defects in one file, not three (S2, S7, UI-H3)

| Line | Defect | Fix |
|---|---|---|
| `badges.ts:89-91` | `.select('pool_id, pool_name, tournament_id')` then `if (!tournamentId) return`. NULL for every league pool | Widen to `COMPETITION_COLUMNS`, take a `CompetitionRef`, delete the guard. `:132-135` fetches `league_fixtures` instead |
| `badges.ts:376` | `isProdScoringEnabled ? 'match_scores' : 'shadow_match_scores'` — a **third** score-table mechanism | Dispatch off the same `getScoringSource(ref)` as everything else (§4.5) |
| `badges.ts:453` | `lightning_rod` = `predictionCount >= matches.length`; `matches` empty → **everyone earns it after their first matchweek** | Denominator = the season's fixture count |
| **`badges.ts:460`** | `if (predictionCount >= 104) earnedIds.push('stadium_regular')` — a World Cup literal, no competition scope. A league member crosses it around **matchweek 11 of 38** | Same denominator |
| **`badges.ts:466`** | `if (match && match.stage !== 'group') earnedIds.push('showtime')` — "Correct exact score in a knockout match", 80 XP, Gold. A synthesised `regular_season` is not `'group'`, so **the first league exact score awards it** | Positive knockout test |

**Both new rows write to `badge_unlocks`, which is append-only (`:254-272`), and each unlock fires an
APNs push (`:309`).** They are wrong awards that cannot be withdrawn and that actively notify the
member — strictly worse than the `xpSystem` copies, whose output is recomputed each run.
**Instruction: grep this file for the literal `104` and for `stage !== 'group'`, do not fix named
lines.**

And the XP rules themselves (U3): `xpSystem.ts:336` and `:498` express "not a knockout match" as
`stage === 'group'`, so a synthesised `regular_season` fires the +25 Knockout King bonus on **every**
non-miss league prediction — up to ~380 phantom events per entry per season, inflating `total_xp` and
`current_level` on the **shared** leaderboard and in Banter member levels. Invert both to a positive
knockout test using `BRACKET_KNOCKOUT_STAGES` (`lib/competitionFormat.ts:43`), so an unrecognised
stage awards **nothing** rather than everything. `:489`'s `>= 104` literal → the pool's own fixture
count; `formatStageLabel` (`:656-665`) through `roundLabel`; and revisit `BADGE_DEFINITIONS` copy at
`:96-110` — "Predict all 12 groups", "Predict all 104 matches", "Correctly predict the World Cup
Final result" render verbatim in a league member's trophy grid.

Without this file fixed, `leaderboard/route.ts:201-202` gates `matchPoints`/`bonusPoints` on the
`entry_xp_state` row existing, so a league pool renders **"Total 450 pts" beside "Match 0 / Bonus 0"**,
empty form dots, 0% hit rate and Level 1 for everyone all season. Every value is plausible.

---

## 9. The read path

### 9.1 One door for source selection (S6, N1, N3)

```ts
export async function getScoringSource(
  admin: AdminClient, poolId: string, ref: CompetitionRef,
  preresolved?: Set<string>,          // WC-M1: batch callers pass the flag once
): Promise<ScoringSource> {           // 'league' | 'shadow' | 'prod'
  if (ref.kind === 'league') return 'league'
  const pools = preresolved ?? await getShadowReadPools(admin)
  return pools.has(poolId) ? 'shadow' : 'prod'
}
```

The `predictionMode === 'league_pickem'` line at `readSource.ts:88` is **deleted** — mode is not
competition, and that line is why a league pool reads empty `shadow_*` tables today.
`getShadowReadPools` becomes module-private, wrapped in `React.cache()`, with a CI assertion of
exactly one caller. The **eight** bypass sites route through `getScoringSource`:
`app/pools/page.tsx:143` · `app/dashboard/page.tsx:204` · `app/profile/page.tsx:87` ·
`admin/pools/[id]/route.ts:108` · `admin/users/[id]/route.ts:146` · `activity/route.ts:601` ·
`home-scoring/route.ts:125` · **`scripts/verify-read-paths.ts:53`** — the last one being the script
memory says to run before enabling any pool, built on the bypass, so it can never see a league pool.

L9 verifies **both** the collapse and "no additional `sync_settings` reads per pool" (WC-M1).

### 9.2 `readMatchScores` league arm — 22 keys, named

Unchanged from v2 §6.2. Stored: `entry_id, pool_id, score_type, total_points, base_points,
predicted_home_score, predicted_away_score, actual_home_score, actual_away_score, calculated_at`.
Mapped: `match_id ← fixture_id`, `match_number ← fixture_number`, `stage ← 'regular_season'`.
Constants: `multiplier 1`, `pso_points 0`, `teams_match true`. NULL: the six team/PSO fields. Plus
`kicked_off_at` and `matchweek_number`, because ordering is the **pair**
`(kicked_off_at DESC, fixture_number DESC)` in the four narrow readers.

### 9.3 The fixture and club mappings — restored (UI-M1)

v2 dropped these while claiming to supersede v1. They are strictly more widely read than the score
row, and each omission is silent.

**`league_fixtures` → `MatchData`:**

| `MatchData` key | Source | Why it is load-bearing |
|---|---|---|
| `match_id` | `fixture_id` | |
| `match_number` | `fixture_number` | `ProgressivePredictionsFlow:220` sorts on it |
| `match_date` | `kickoff_at` | `LocalTime` renders device-local |
| `stage` | literal `'regular_season'` | `competitionRounds.matchInRound` (`:158`) requires `stage === 'regular_season' && round_number === n`; **missing → `matchesInRound` returns `[]` → 38 empty prediction screens** |
| `round_number` | `league_matchweeks.matchweek_number` | same test |
| `round_label` | `league_matchweeks.label` | |
| `home_team_id` / `away_team_id` | `home_club_id` / `away_club_id` | `ProgressivePredictionsFlow:200` does `byId.get(match.home_team_id)`; **missing → every card renders "TBD v TBD"** |
| `home_score` / `away_score` | `home_goals` / `away_goals` | |
| `is_completed`, `status`, `live_minute`, `live_period`, `live_added`, `venue` | direct | |
| `group_letter`, `winner_team_id`, `home_score_pso`, `away_score_pso`, `home_team_placeholder`, `away_team_placeholder` | `null` | |

**`league_clubs` → `TeamData`:** `team_id ← club_id`, `country_name ← name`,
`country_code ← abbreviation`, `flag_url ← crest_url`, `group_letter ← null`,
`fifa_ranking_points ← null`. The `{country_name, country_code, flag_url}` shape stays as a wart on
the *type*, not the screen — renaming it touches every prediction flow and match card for zero
user-visible benefit. Fix it when a third sport forces it.

**L9's typed test covers `stage`, `round_number`, `match_number`, `home_team_id`, `away_team_id` on
the fixture arm and `stage`, `base_points`, `match_number` on the score arm** — the keys a prose
omission-list loses.

### 9.4 Separate SQL functions, not shared branches (W7)

`pool_match_prediction_accuracy` and `entry_match_score_summary` keep byte-identical bodies. New
siblings `league_match_prediction_accuracy(uuid)` and `league_entry_match_summary(uuid[])`, with TS
dispatch at **all three** callers of the first (CP-M3): `poolData.ts:327`, `crowd/route.ts:39,52`,
`entries/[entry_id]/analytics/route.ts:157`. Caller counts in v3 come from grep, stated as such.

### 9.5 What the fork makes unreachable, and two files disposed of

`shadow_reconcile_matches`, the three `FROM predictions` reads inside `shadow_score_match`, the
cross-engine `DELETE … NOT EXISTS` purge, `trg_shadow_bump_inputs_matches`, `advance-teams`,
`advancementTriggerFor`, `resolvePredictedBracket`, `shadow_entry_bracket` — **all structurally
unreachable** for a league fixture. State that in the migration header; it is the strongest single
argument for the purpose-built tables.

- **`lib/competitionRounds.ts` — RETAIN with surgery.** Keep `matchweekKey`/`matchweekNumber`,
  `sortRoundKeys` (lexically `mw_10` precedes `mw_2` — verified at `:184-201`), `roundLabel`,
  `roundShortLabel`, `usesRounds` (`:222`, already handles `league_pickem`), `usesBracket`. Delete
  `leagueRoundDefs` and `roundDefsFor` (`:105-126`) — they take the `matches`-table shape the fork
  removes. Make `nextRoundKey` bracket-only.
- **`lib/roundMatches.ts` — DELETE.** Preserve its one durable idea — *return the error, not an empty
  list* (`:44`) — in the bracket-only replacement, and **stop discarding it** at
  `lib/auto-submit.ts:262`, `:570` and `rounds/[round_key]/state/route.ts:298`.

Skipped rather than run-and-discarded for a league: `poolData.ts:265` `match_conduct` (PL tiebreakers
are GD then goals scored), `poolData.ts:347` `tournament_awards`, `poolData.ts:208` knockout-stripping
(which survives today only by `[].every() === true`), `ResultsTab.tsx:156-180`
`resolvePredictedBracket` over 380 fixtures.

---

## 10. Containment of World Cup machinery — seven sites, not four

### 10.1 The four SQL selectors v2 named

Each fix is additive and provably false for every World Cup pool. **Alias validity checked
individually** — §B.1 is the audit.

| Function | What it does to a league pool | Change |
|---|---|---|
| `shadow_reconcile_adjustments` (cron 20) | Its pool select is a LEFT JOIN that explicitly picks up `se.entry_id IS NULL AND COALESCE(pe.point_adjustment,0) <> 0`. **One adjustment on one league entry drags the whole pool into `shadow_finalize_totals` within 2 minutes**, inserting zeroed `shadow_entry_totals` rows and firing `broadcast_pool_leaderboard_ins` — a live wrong-data zero-push. Today there are 0 such rows only because all 3 entries have `point_adjustment = 0`. That is luck, not containment | `AND po.league_season_id IS NULL` — **alias valid** |
| `shadow_finalize_totals` (`tmp_ft`) | Unfiltered when `p_pool_ids IS NULL`; admits any entry with `has_submitted_predictions OR point_adjustment <> 0`. Belt-and-braces for every future NULL call, including scripts | `AND po.league_season_id IS NULL` — **alias valid** |
| `shadow_eligible_entries` (W6) | First arm is `pe.has_submitted_predictions`, which §7.4 now sets on first save. Every league entry would flow into `shadow_entries_needing_rederive` → a row in `shadow_entry_bracket_state` — league data in frozen World Cup scoring state. **§7.4 makes this predicate mandatory rather than belt-and-braces** | `AND po.league_season_id IS NULL` — **alias valid** |
| `shadow_detect_diffs` (cron 21) | Coverage rollup groups by `prediction_mode`, so `league_pickem` becomes its own permanently-red `{live:N, shadow:0}` key | `AND po.league_season_id IS NULL` **on the coverage subquery ONLY.** The mismatch INSERT has no `pools` alias in scope and needs none — INNER from shadow, absence cannot diff (§B row 5) |

### 10.2 The three sites v2 missed

| Site | Why it reaches a league pool | Change |
|---|---|---|
| **`lite_recalc_entry`** (WC-C2) | SECURITY DEFINER, **EXECUTE granted to `PUBLIC`/`anon`/`authenticated`/`service_role`** (verified `proacl`), **no authz check of any kind**, no pool/mode/archive predicate. Called from the browser at `admin/MembersTab.tsx:412` and from `mobile/components/pool-detail/AdjustPointsSheet.tsx:162` after every adjustment. On a league pool `match_scores` is empty so tiebreakers 2 and 3 collapse to 0 for everyone, and it re-ranks on `created_at`; it also **overwrites** `scored_total_points` with `0 + 0 + adjustment`. §7.5's totals-only health check stays green while the ranks are wrong. Blocked today **only** by `member_pool_writable` on the archived pool — and the RPC itself has no archive check, so a direct call still lands | Leading `IF (SELECT league_season_id FROM pools WHERE pool_id = p_pool_id) IS NOT NULL THEN PERFORM league_rescore_pool(p_pool_id); RETURN; END IF;` — a scalar subquery naming its own relation (§B row 7). **Separately: see §15 D11** |
| **`snapshot_pool_ranks`** | Verified body joins `pool_entries pe` to `pool_members pm` and **nothing else**. `sync-fixtures/route.ts:329-333` selects pools `.in('tournament_id', snapshotTournamentIds)`, and the league pool carries the PL `tournament_id` — so the moment a PL fixture goes live, whatever garbage `current_rank` holds is copied into `previous_rank`. Cannot fail loudly | Add `JOIN pools po ON po.pool_id = pm.pool_id` **then** the conjunct — not a conjunct alone (§B row 6) |
| **`/api/cron/analytics-sweep`** (WC-H3) | TypeScript, which is why v2's SQL-only containment list missed it. jobid 15 ACTIVE at `* * * * *`, flag `true`, ran this minute. Pool scope is "any entry whose `last_rank_update` moved" — and §8.3's mirror now stamps exactly that. `entryAnalytics.ts:62` selects `'tournament_id, prediction_mode'`, so it is **also** the select that must be widened before `competitionRef` throws (§B row 18). Per-pool failures land in an `errors[]` array, not a raise | `.is('league_season_id', null)` on its pool resolution **with a logged skip count**, from L4 until L10 lands the league arm |

### 10.3 Left deliberately inert, with justification

`shadow_score_match`'s three `predictions` reads (unreachable, §9.5) · `shadowBrackets.ts:195,:501,:636`
(bracket resolution; `:501`'s purge-then-rewrite has nothing to purge) · `shadow_calculate_bonuses`
and `shadow_calculate_bp_bonuses` (called only with pool ids derived from `shadow_match_scores` or
`prediction_mode='bracket_picker'`) · `shadow-materialize:82,91` (§5.1) · migration 032's quarantine
net (disarmed once `shadow_eligible_entries` is contained).

### 10.4 What is KEPT permanently — all three predicate functions named (WC-M3)

| Function | Status |
|---|---|
| `mode_submits_per_round(text)` | **KEPT.** Live bodies reference it; `pg_depend` records **0**, so a `DROP` succeeds silently and from the next minute cron 19 raises `function does not exist` and aborts the whole reconcile transaction |
| `stage_has_scheduled_teams(text)` | **KEPT**, same reason |
| `stage_uses_base_prices(text)` | **Unreferenced by any live body (046d removed it) — but LEAVE IT.** `046_league_scoring.sql:474-478` lists all three as droppable, and the asymmetry between that list and a two-name list is what invites an implementer to reconcile them by dropping all three |

The same three-line note goes as a header comment on `046_league_scoring.sql` beside its DO-NOT-RUN
marker, because that file is where the droppable claim lives.

Also kept: `matches.round_number`, `matches.round_label`, `idx_matches_tournament_round` (U4 —
`MATCH_COLUMNS` at `poolData.ts:54` names `round_number` and `:198-205` destructures only
`{ data: matchesRaw }`, so dropping it blanks fixtures for all 623 pools with no error anywhere);
the four `tournaments` ingest columns; `pools_prediction_mode_check` including `'league_pickem'`;
`lib/competitionFormat.ts` entire; `backup_shadow_*_pre_r20` (kept and **not** restored).

### 10.5 `league_scoring_health` — the outcome layer

```
completed_fixtures > 0 AND eligible_entries > 0
  ⇒ scored_rows  > 0
  ⇒ totals_rows  = eligible_entries
  ⇒ xp_rows      = eligible_entries, written by the badge path            -- S2 + WC-H3 provenance
  ⇒ pool_entries.scored_total_points = league_entry_totals.total_points
  ⇒ pool_entries.current_rank        = league_entry_totals.final_rank      -- WC-C2 rank drift
  ⇒ pool_entries.previous_rank       = league_entry_totals.previous_final_rank
  ⇒ at most one matchweek 'open'; at least one whenever an unlocked
       matchweek exists at or after the pool's start                       -- SW-L1
  ⇒ no entry has league_predictions in a locked matchweek with zero
       league_match_scores rows                                            -- S4
  ⇒ every completed fixture has result_pushes_sent_at IS NOT NULL          -- SW-C1
  ⇒ zero league_score_events with attempts > 5                             -- outbox poison
  ⇒ the four §7.5 write-path invariants
```

Run as a Vitest fixture in CI **and** as a pg_cron alarm. It checks *results, not code paths*, which
is why it catches readers nobody thought of — but it is **blind to the reveal leak (§3.3) and to
mobile (§13)**, and the design should not pretend otherwise.

---

## 11. Notifications and lifecycle sweeps — all eight, plus the edge functions (CP-H2)

**Rule, applied to every row: a sweep that excludes rows must log how many it excluded.** A sweep
that processed nothing looks identical to a sweep with nothing to do.

| Sweep | Cron | League failure | Disposition |
|---|---|---|---|
| `firePendingDeadlineWarnings` (`deadline-warnings.ts:34`) | 9, `*/30`, ACTIVE | Selects `status='open'` + `prediction_deadline` in 24h. With §2's NULL CHECK, **zero lock reminders across 38 matchweeks** | **Repoint at `league_matchweeks.lock_at`** — mandatory, same phase as the CHECK |
| `firePredictReminders` (`time-based.ts:146`) | 13, daily 17:00, ACTIVE | Same key | **Repoint at the derived open matchweek** |
| `fireMatchStartingPushes` (`time-based.ts:48-72`) | 12, `*/30`, ACTIVE | `matches` T+60..T+90 unfiltered, then pools `.eq('tournament_id',…)` | **Repoint at `league_fixtures`** |
| `firePendingMatchdayRecaps` (`recaps.ts:45-63`) | 10, hourly, ACTIVE | Groups by `(tournament_id, date)`; also reads `match_scores` at `:123` | **Repoint**, and fold the score table into the `CompetitionRef` dispatch (§4.5) |
| `firePendingWeeklyRecaps` (`recaps.ts:280`) | 11, Sun 20:00, ACTIVE | Reads `match_scores` directly at `:311` | **Repoint + `league_match_scores` arm keyed on `calculated_at`.** For a weekly competition this is the natural "your week in the league" moment and it would simply never fire |
| `fanOutResultPushes` | none — called from `recalculatePool` | No caller for a league (SW-C1) | **§4's drain** |
| `autoSubmitDraftEntries` (`auto-submit.ts:103`) | **the edge function**, not the repo route | §0.3 | **Closed by §2's NULL deadline CHECK** (works against the edge copy too) + `.is('league_season_id', null)` + logged skip in the repo copy + §5.3's retirement |
| `autoArchivePools` (`auto-archive.ts:33-70`) | same edge function | `tournamentIds` from `pools.map(p => p.tournament_id)`; NULL for a league; fails safe via `totalCount > 0`, so **a completed season stays `open` forever** | **Repoint at `league_seasons.last_kickoff_at` + `league_matchweeks.completed_fixture_count`** |
| `sendAutoRoundOpenNotifications` | same | Selects `pool_round_states`, which a league pool has none of | **Naturally league-free** — but add the predicate with a logged skip so the exclusion is *stated*, not incidental |
| `admin/notify-round-open/route.ts` (CP-L2) | manual | Reads `pool_round_states:41` and has an orphaned matchweek arm at `:65-68` | **Explicit refusal** — *"matchweek opening is derived from the fixture calendar and cannot be announced by hand"* — and route the round-state read through `readRoundStates` |
| **Matchweek-open + lock-reminder** | new | — | **A per-SEASON cron** reading `league_matchweeks.open_notified_at` / `lock_reminder_sent_at`, fanning out to every pool of that season in one set-based pass. 38 rows total, not 38 × N per-pool transitions. A failed send cannot block state, which is the coupling that broke round_32 on 2026-06-28 |

**N4 — `ROUND_MATCH_STAGES[key] ?? []` appears at five sites**, not one:
`rounds/[round_key]/state/route.ts:105` (correctly guarded by `!isMatchweekKey`),
`advance-teams/route.ts:395` and `:434` (bracket-only, correct), `send-template/route.ts:403` and
`send-pending-reminders/route.ts:159` (both **silent `continue`** for `mw_*`). The last two get the
fixture adapter; the first three are verified correct as-is.

---

## 12. UI reuse — the honest total, extended

v2's count: **21 shared web modules edited, 2 new components, 1 unusable.** v3 adds **6** modules
from the review and **1** new admin surface. New total: **27 edited, 3 new, 1 unusable.** The
architecture claim survives — no finding forces a parallel UI, and the reuse boundary
(`MatchData` / `TeamData` / `EntryScoring`) is right — but the work is roughly 4× what v1 booked.

### 12.1 The six additions to v2's list of 21

| File | What breaks | Fix |
|---|---|---|
| `app/api/pools/[pool_id]/predictions/route.ts` | Five mode gates (§7.2) | `usesRounds()` ×5, `readRoundStates`, required `roundKey`, membership validation, 409 on short return |
| `app/api/pools/[pool_id]/predictions/round/route.ts` | 400 then 404 (§7.3) | `usesRounds()`, `readRoundStates` |
| `app/pools/[pool_id]/admin/RoundsTab.tsx` + `rounds/route.ts` (UI-H2) | `PoolDetail.tsx:996` adds the tab whenever `usesRoundFlow` (true for `league_pickem`); `RoundsTab.fetchRounds` GETs `/rounds`, which 400s at `:37`; the component throws, catches, and shows *"Failed to load rounds data"* — **permanently**, discarding the response body so v2's improved refusal message never reaches anyone | **Serve the derived rows** through `readRoundStates` and hide Open/Extend for a league. Hiding the tab is the cheaper option but loses the only surface showing 38 locks |
| `admin/MembersTab.tsx:86,143-170` (SW-H3) | `isProgressive` is a literal, so `memberStatus` falls to the `has_submitted_predictions` arm | `usesRounds()`. v2 listed this file only for `ViewPredictionsModal` |
| `app/profile/page.tsx:344` (§6.3) | Unscoped `matches` count — **484 today, already wrong for every World Cup member** | Scope it. **L1, not L13** |
| `app/play/[slug]/*` + `app/tv/[slug]/*` (CP-M4) | `getTournamentSummary(pool.tournament_id)` with a `(tournamentId: string)` signature; `ROAD_STAGES` is six hardcoded World Cup stages; `phase='pre'` whenever total=0; the `mode` ternary has no league arm, so the label reads **"Full Tournament"** all season | League arm reading `league_fixtures` with a matchweek progress strip; phase from `completed_fixture_count` vs `fixture_count`; mode via the widened `POOL_MODE_INFO`. Memory: **both consumers share the component — run unfiltered `tsc`** |

### 12.2 The two new components, with their mount points corrected (UI-L1)

1. **`LeagueTable`** — the 20-row standings table (P, W, D, L, GF, GA, GD, Pts), derived in SQL from
   `league_fixtures`. The reusable piece is `BaseTeamTable` (105 lines), **not** `StandingsTab.tsx`.
   **The mount is not free:** `ResultsView.tsx:253-266` is inside
   `{stageTab === 'group' && hasGroupResults && (…)}`, and `hasGroupResults` (`:148-153`) tests
   `m.stage === 'group'`. A league pool satisfies neither. **The gate must become matchweek-tab-aware
   in the same commit**, or the component ships and never renders.
2. **`MatchweekPicker`** — the 38-cell strip replacing the A–L group strip.

### 12.3 The third new component — the league fixture editor (CP-H5)

The World Cup has a human override: `admin/super/MatchesTab.tsx` writes `matches` at `:289`, `:385`,
`:440`, `:533`, `:686` and fans out `/recalculate` per pool; `matches/[id]/relinquish` exists.
`league_fixtures` would have exactly one writer — the sync arm — and **no human override anywhere**.

When api-football reports a result late, wrong, or not at all — an abandoned match, a VAR correction
after full time, a postponement recorded 0-0 — nobody could fix it, and 38 matchweeks of picks would
be scored against it. `league_reconcile_fixtures` only reacts to a *change* in the feed, so a fixture
the feed never corrects stays wrong permanently.

**Build:** a super-admin editor writing `league_fixtures` (goals, status, `is_completed`, kickoff)
that sets `manual_override = true` (§1.4a) and calls `league_rescore_pool` for the affected pools;
the L3 sync arm skips any fixture with `manual_override`. The relinquish route is the precedent for
clearing the flag. **This is not optional** — a 9-month season with no override is a materially worse
operational position than the competition it replaces.

### 12.4 Cannot be reused (U8)

`app/pools/[pool_id]/StandingsTab.tsx` — 629 lines, group-partitioned throughout (`stage === 'group'`
at `:509`/`:521`, a `GROUP_LETTERS` loop at `:549-551`, an A–L selector at `:595`). **Do not re-enable
it at `PoolDetail.tsx:109`** — that config flip mounts a component which finds nothing and renders
twelve empty group cards behind an A–L selector.

### 12.5 Genuinely untouched

`PoolDetail.tsx:769-782` realtime subscription (given §1.11) · `liveMerge.ts` · `LeaderboardTab` ·
`CommunityTab`/Banter · `EveryoneElseSection` / `EntriesListView` / `SpectatorEntryView` (once the
mirror lands) · `ProgressivePredictionsFlow`'s round model · the leaderboard and `/live` response
contracts · every share-card.

---

## 13. Mobile (S9, UI-M2)

**The exposure.** `mobile/lib/useHomeData.ts:206-224` lists pools straight off `pool_members` with no
competition filter; `usePoolEntries.ts:61-67` the same. Tapping a league pool opens the World Cup
flow, which fetches `.eq('tournament_id', tournamentId)` (`useMatchDetail.ts:240`) — `eq.null`, zero
rows, no error, "no matches". **Layer 2 does not save it:** `usePredictions.ts:291-299` upserts and,
on error, `console.warn`s and re-queues into `pendingRef` — so the guard trigger fires, the warning is
swallowed, the app says "saved", and it retries forever.

**The last OTA was 2026-07-30**, so nothing since is on devices — including the format filter in
`150ab5e`. A tester can create a `full_tournament` pool on Premier League 2026/27 from a field build
today. **Deleting the `tournaments` row is the only thing that closes that**, which is L1.

**v2 named five mobile items. `grep -l "quarter_final\|round_32" mobile/` returns 14 files.** Named,
because an underestimated repoint means an indefinitely extended block:

| File | Nature |
|---|---|
| `mobile/components/pool-detail/ProgressivePredictionWizard.tsx:43` | `type RoundKey = 'group' \| 'round_32' \| … \| 'final'` — a **closed seven-value union**, so a matchweek cannot be represented at all. **This is a widening job, not a repoint** — the mobile analogue of what `150ab5e` already did to the web flow |
| `mobile/lib/usePoolRounds.ts:7-19` | Hardcodes the same seven keys |
| `mobile/app/pool/[id]/breakdown.tsx:23,578` | **U1 verbatim** — `STAGE_ORDER.map` over the same seven literals |
| `mobile/components/pool-detail/PredictionsTab.tsx:50` | `isProgressive = predictionMode === 'progressive'` |
| `mobile/lib/stage.ts:10-16` · `mobile/app/(tabs)/results.tsx:51-53,175,214` · `mobile/app/pool/[id]/entry/[entryId].tsx:34-36,97,157` | Stage label maps and filters |
| `usePredictions.ts:103,291` · `useHomeData.ts:449` · `useMatchDetail.ts:223` · `banter.tsx:885` · `BanterSheet.tsx:2294` | `from('predictions')` repoints |
| `useHomeData.ts:366-369` · `PoolInfoTab.tsx:466` | `pool_round_states` → `readRoundStates` |
| `AdjustPointsSheet.tsx:152-168` | Calls `lite_recalc_entry` and **swallows the RPC error at `:168`** — the adjustment lands, the rank silently does not. **This is why "just don't call it" is not a fix: the call site is shipped inside an OTA bundle on testers' devices and cannot be recalled by a web deploy.** Only the §10.2 DB-side guard reaches it |
| `mobile/lib/api.ts:258,552,579` | `by_stage`, match scores, match stats |

**Sequence:** L4 ships the **hard block** OTA (`useHomeData`/`usePoolEntries` filter
`.is('league_season_id', null)`; pool detail shows *"This pool needs the latest app version"*) —
**before** the web door opens. L6 surfaces `flushPending`'s upsert error in the UI. L14 is the real
repoint. Memory's EAS rules: publish **per-platform** (`--platform all` crashes on Expo web export),
**from `mobile/`**, and verify the API side is deployed *before* an OTA that calls new routes — with
step 1 the inverse case, where the OTA must land *before* the door opens.

---

## 14. Phased build order — sixteen phases

**v2 implied ten. It is sixteen, and I am not compressing it to look achievable.** The growth is
almost entirely the four gap sections: side-effect ownership is a phase of its own, the 95-site
fixture repoint is a phase of its own, the write path is a phase of its own, and the admin/ops
surface the World Cup already has is a phase of its own. Nothing here is padding; each phase has a
verification that can fail and a rollback that has been thought through.

Dependency order is real — L4 must precede L5, L7 must precede L8, L8 must precede L9's read flip.

---

### L0 — Disarm. Before 22 August. (hours)

Not a build phase. This is the live hazard of §0.3.

1. `UPDATE cron.job SET active = false WHERE jobid = 3;` — the `auto-submit` edge function. **This
   alone prevents the 22 Aug `mw_1 → in_progress` flip.**
2. `UPDATE cron.job SET active = false WHERE jobid = 8;` — `api-football-sync`. The PL row is a
   confirmed live target and burns API calls every minute until the data is gone.
3. Add the leading league guard to **`lite_recalc_entry`** (§10.2) — one `IF` block, before
   `league_rescore_pool` exists, so the league arm is `RETURN` rather than a call. Provably inert for
   623 pools. This is what protects against the mobile `AdjustPointsSheet` call site, which no web
   deploy can recall.

*Verify:* `SELECT jobid, active FROM cron.job WHERE jobid IN (3,8)` → both false ·
`pg_get_functiondef('lite_recalc_entry')` shows exactly one added leading block ·
`SELECT count(*) FROM pool_round_states WHERE state='open'` still 1, unchanged, and still not
`in_progress` on 22 Aug 00:05.
*Rollback:* re-arm both jobs; drop the `IF` block. Seconds.

---

### L1 — Revert: World Cup restored, league data removed (1 day)

Order matters; each step's count is asserted before the next runs.

0. **Quiesce.** `UPDATE sync_settings SET setting_value='false' WHERE setting_key='shadow_reconcile_enabled'`
   — verified: **both** `shadow_reconcile_matches` and `shadow_reconcile_adjustments` read that key,
   so one write stops crons 19 and 20. Also `analytics_sweep_enabled='false'`. Every count below is
   then an assertion over a quiet database (WC-M4).
1. **Annotate both poison sources.** `drafts/2026-08-14_pre046_shadow_rollback.sql` — correct the
   header (line 12/16 says "run this whole file") and mark lines **71-76** ⚠ DO-NOT-RESTORE. And
   `lib/migrations/046_league_scoring.sql:176-180`, which still holds the two-base
   `stage_uses_base_prices` CASE and is `CREATE OR REPLACE`-idempotent, so re-running it silently
   undoes 046d across ~597 pools. Add the three-function KEEP note (§10.4) beside it.
2. **Prove the substitutions by equivalence, BEFORE editing** (WC-M2). Two pure reads:
   `SELECT bool_and(stage_has_scheduled_teams(stage) = (stage='group')) FROM (SELECT DISTINCT stage FROM matches) s;`
   and the same for `mode_submits_per_round(prediction_mode)` over `DISTINCT prediction_mode FROM pools`.
   Both must be true, which proves each substitution site is a semantic no-op on the remaining data.
3. **Code first, DB second.** `lib/poolData.ts:181-186` — add `.eq('tournament_id', pool.tournament_id)`
   to the `teams` select (W11: 68 rows today, so **every World Cup pool's `TeamData[]` carries 20
   English clubs right now**). **`app/profile/page.tsx:344`** — scope the unscoped `matches` count
   (484 today; every World Cup member's profile denominator is already wrong). Confirm the wizard and
   marketing-strip withdrawal already landed. *Drop v2's `recalculate.ts:129` item — verified, that
   read already carries the filter.*
4. Delete the **38 `pool_round_states`** rows of pool `c16a9a56-…`, then the pool with its 3 members,
   3 entries and 1 `pool_settings`. **Explicitly and first** — `pools_tournament_id_fkey` is
   `ON DELETE CASCADE`, so deleting the tournament later takes a 3-member pool silently.
5. Delete the **380 `shadow_match_state`** rows keyed to league matches (484 → 104).
6. Delete the **380 `matches`** rows, then the **20 `teams`** rows (after the matches —
   `matches_home_team_id_fkey` has no cascade), then the `tournaments` row `b1299174-…` **last**.
7. **Revert four shadow functions by token substitution over the LIVE `pg_get_functiondef` output**,
   guarded on exact occurrence counts. In `shadow_score_match`: `NOT stage_has_scheduled_teams(stage)`
   → `stage <> 'group'` **first** (expect 2), then bare `stage_has_scheduled_teams(stage)` →
   `stage = 'group'` (expect 3) — **five sites in two forms, not three**; and
   `mode_submits_per_round(po.prediction_mode)` → `po.prediction_mode = 'progressive'` (expect 3).
   **Leave def-lines 48-54 exactly as live — that is 046d single-base pricing.**
   `shadow_eligible_entries` and `shadow_finalize_totals` from the rollback file's clean hunks
   (`:249-266`, `:270-end`). **`shadow_calculate_bonuses` has no rollback artifact anywhere** — same
   one-token substitution at def-line 24 (expect 1).
8. Revert `enforce_prediction_before_kickoff` from `045_*.sql:178-193` — **before** anything touches
   `matches.round_number`, because PL/pgSQL resolves column refs at runtime.
9. Revert `matches_stage_check` and `tournaments_tournament_type_check`. **Do not** drop
   `round_number`, `round_label`, `idx_matches_tournament_round`, the four `tournaments` ingest
   columns, or any of the three predicate functions (§10.4).
10. **Decide and execute D15** — retire the `auto-submit` edge function and point cron 3 at
    `/api/cron/auto-submit`, or leave it disarmed. **Assert which is live before writing any
    predicate against it.**
11. Un-quiesce: `shadow_reconcile_enabled` and `analytics_sweep_enabled` back to true; re-arm cron 8.

*Verify:* `pg_get_functiondef` on all five functions matches pre-046 **except** the deliberate 046d
keep — assert the def still contains `COALESCE(ps.group_exact_score, 5)       AS base_exact` and
**zero** occurrences of `knockout_exact_score` · a read-only CTE recomputes
`base_points / multiplier / total_points` over `shadow_match_scores ⋈ matches ⋈ pool_settings` and
diffs against stored (**do not re-score** — `shadow_score_match` DELETEs, UPSERTs and fires the
broadcast) · `matches WHERE stage='regular_season'` = 0 · `teams` = 48 · `pools` = 623 ·
`shadow_match_state` = 104 · **open two World Cup pools in a browser and confirm fixtures, results and
a points breakdown render** — the one check that catches a discarded PostgREST error.
*Rollback:* fully reversible. The importer is idempotent by `external_match_id` and re-pulls the
season in one command.

---

### L2 — DDL, importer, lint rules (3–4 days)

Nine tables, RLS (including the four transcribed `league_predictions` policies), the four league
triggers, `league_score_events`. Retarget `importLeagueSeason.ts` at `league_*`.
**Ship all three ESLint confinement rules here** — `.from('predictions')` → `lib/predictions/`,
`.from('matches')` → `lib/fixtures/`, `.from('pool_round_states')` → `lib/rounds/` — plus the single
exported `PredictionMode` and the ban on inline literal unions of mode strings.

*Verify:* 1 season, 20 clubs, 38 matchweeks, 380 fixtures; `count(*) group by matchweek_id` = 10 for
all 38; every `lock_at` = its matchweek's `min(kickoff_at)`; the empty-has-no-lock CHECK holds;
`matches`/`teams` unchanged from L1; `npm run lint` green with the three new rules.
*Rollback:* `DROP TABLE` — nothing references these yet.

---

### L3 — Sync arm (2 days)

League branch in `/api/cron/sync-fixtures` writing `league_fixtures`, respecting `manual_override`,
plus the matchweek-window trigger.

*Verify:* a replayed payload moves a kickoff and `lock_at` follows **while still future** and does
**not** move once past · deleting the last fixture of a matchweek zeroes `fixture_count` (the LEFT
JOIN correction) · a completed fixture writes goals, `is_completed` and `completed_fixture_count` ·
a fixture with `manual_override=true` is skipped · the World Cup's sync run notes unchanged.
*Rollback:* remove the branch.

---

### L4 — `pools` touch, `CompetitionRef`, containment, mobile block (4–5 days)

`league_season_id`, `league_start_matchweek`, `DROP NOT NULL`, all three CHECKs (§2). The
discriminated union on `PoolData` and the structural, throwing `competitionRef()`. **Widen every
select on §B.2's grep list in the same commit — `entryAnalytics.ts:62` is not optional.** All seven
containment sites (§10.1–10.2). **Ship the mobile hard-block OTA.**

*Verify:* capture `/leaderboard`, `/live`, `/match-scores` and `/bulk` for **five** World Cup pools —
one per `prediction_mode`, one archived, one with a non-zero `point_adjustment` — before the sweep,
and assert **byte-identical** responses after (W9) · `pg_get_functiondef` diff shows exactly one
conjunct in sites 1–4, one JOIN + one conjunct in `snapshot_pool_ranks`, one leading block in
`lite_recalc_entry`, and **nothing** in `shadow_detect_diffs`'s mismatch INSERT · the analytics sweep
still processes 623 pools after one full cycle (`analytics_last_run_at` advances, `errors[]` empty) ·
`count(*) from pools where league_season_id is not null` = 0 · `npm run build` clean.
*Rollback:* DDL yes; the type sweep is a revert commit. **This is the last fully-cheap-to-revert
phase.**

---

### L5 — Fixture reader repoint — the 95 sites (5–6 days)

`lib/fixtures/store.ts` and every REPOINT / BRANCH / REFUSE / DEAD disposition in §6.
**`/live` and `poolData.ts` land in this phase together** (§6.4) — repointing one without the other
creates the refresh storm.

*Verify:* a synthetic league pool renders `/live` with `completed_matches` matching the fixture table
and **`needsFullRefresh` false on a steady tick** (capture the client's refresh calls over 3 minutes;
expect zero) · `/api/matches/:id/scores` and `/stats` return 200 for a league fixture ·
`app/profile` shows the correct denominator for a World Cup member · `npm run lint` green (the
`.from('matches')` rule now has teeth) · the five-pool World Cup response diff from L4 re-run and
still byte-identical.
*Rollback:* code only, but the response-diff harness must be re-run — this phase touches World Cup
read paths.

---

### L6 — The write path (4–5 days)

§7 end to end: both create routes + the catalogue loader, both seeders deleted, the five save gates,
`save_league_predictions_batch` with the two flags in-transaction, the submit route, the 409s, the
reveal-gate fix with `parsePredictionMode` and the **state-nulling** of §3.3. Surface mobile's
`flushPending` error.

*Verify:* create a league pool through the real wizard and assert `pool_round_states` = 0 and
`prediction_deadline` IS NULL · a pick saves and **reads back through RLS as the anon client**, not
just service-role · `has_submitted_predictions` and `predictions_submitted_at` are both set by the
**first save** · submit MW1 → 200, then save a pick in MW2 → **200** (the UI-C1 regression test) · a
pick written after `lock_at` is silently skipped **and the route returns 409 naming the dropped
fixture ids** · a save posting MW38 ids with `roundKey:'mw_1'` is rejected · **store an MW38 pick
while MW1 is open, then assert a second member's `/bulk` and `/entries/:id/predictions` contain none
of it** (SW-H2 — the launch-blocking one) · a `predictions` insert for a league entry is skipped with
a WARNING and **the surrounding batch's World Cup rows still land** · a `league_predictions` insert
for a World Cup entry RAISES · `scripts/verify-bulk-reveal-gate.ts` with a league case returns
*not-revealed* for an unlocked matchweek and *revealed* for a locked one.
*Rollback:* possible, but **from here a league pool may hold member data** — reverting means
exporting picks first.

---

### L7 — Scoring engine, SQL only (4–5 days)

`league_score_fixture`, `league_finalize_totals` (six-column mirror), `league_rescore_pool`,
`league_reconcile_fixtures`, `league_round_states`, `lib/rounds/read.ts`, the corrected
`broadcast_pool_leaderboard()` and its two league triggers, `trg_league_adjustment_rescore`.
**No cron is armed in this phase, and `recalculatePool` is NOT yet changed** — its early return keeps
firing the three side effects until L8 replaces them.

*Verify:* **the §1.11 pre-attach test first** — inside `BEGIN … ROLLBACK`, force a
`shadow_entry_totals` UPDATE against the new body and assert the emitted JSON carries all seven
`LiveEntry` keys with `point_adjustment = total_points - match_points - bonus_points` · then a
synthetic matchweek (10 fixtures, ≥3 entries, hand-computed expected points) driven by manual RPC
calls: every scoring output correct; `final_rank` matches a hand-applied tiebreak cascade; the
diff-aware upsert produces **zero** broadcasts on an unchanged re-run; the broadcast payload captured
**off the wire** carries all seven keys; an entry that made picks and never pressed Submit scores
normally; a postponed MW7 fixture leaves MW7 `in_progress` and **MW8 still opens**; an admin
`point_adjustment` moves `league_entry_totals` via the trigger; `pool_entries.previous_rank` and
`last_rank_update` are both written.
*Rollback:* drop the league functions and triggers. The broadcast function reverts to the captured
live body — **capture it before the edit.**

---

### L8 — The side-effect drain (3–4 days)

`league_score_events` drain RPCs, `/api/cron/league-reconcile`, the pg_cron entry, and **only then**
the `recalculatePool` `success:false` edit and the `/recalculate` league dispatch.

*Verify:* a completing league fixture produces ≥1 `prediction_result` push, a non-empty
`entry_xp_state.last_five`, an `invalidatePoolCache` call in the route's logs, and
`result_pushes_sent_at` stamped · `snapshotPoolRanks` runs **before** the score write in the same tick
(assert `previous_rank` reflects the pre-fixture rank, not the post-) · **kill the drain for 10
minutes, restart, and assert no event is lost and none is double-sent** · `league_scoring_health`
green on all thirteen assertions · World Cup: cron 19/20 unaffected, `shadow_detect_diffs()` clean.
*Rollback:* disarm the cron — scoring stops, data intact, and the outbox holds the backlog. Revert
the `success:false` commit last.

---

### L9 — Read path (3 days)

`getScoringSource(ref)` third value with the memoized flag read, the eight `getShadowReadPools`
callers collapsed, `readMatchScores` + the four narrow readers, the fixture/club mappings (§9.3),
`league_entry_match_summary`, `league_match_prediction_accuracy` at **all three** callers.

*Verify:* a league arm in `scripts/verify-read-paths.ts` that **asserts non-empty** · both new sibling
functions leave the World Cup bodies `pg_get_functiondef`-identical · a typed test naming
`stage`/`base_points`/`match_number` on the score arm and
`stage`/`round_number`/`match_number`/`home_team_id`/`away_team_id` on the fixture arm · a CI
assertion that `getShadowReadPools` has exactly one caller · **no additional `sync_settings` reads
per pool** on `/pools` and `/dashboard` (WC-M1).
*Rollback:* code only.

---

### L10 — Analytics, XP, badges (3 days)

Adapter wiring into `entryAnalytics.ts` and the league arm of the analytics sweep (lifting the L4
containment); the `xpSystem` knockout inversion and the `104` literals; the five `badges.ts` fixes
including `showtime` and `stadium_regular`; badge copy.

*Verify:* every eligible entry has an `entry_xp_state` row with `total_completed = 10`, non-zero
`hit_rate`, populated `last_five` · **provenance:** run the assertion with `analytics_sweep_enabled`
**off**, so a green result proves the badge path wrote it, not the sweep (WC-H3) · **zero** Knockout
King events on a league entry · **zero** `showtime` and **zero** `stadium_regular` in `badge_unlocks`
for league entries after two matchweeks · `lightning_rod` not awarded after one matchweek ·
`pool_entries.{scored_total_points, current_rank, previous_rank}` all match
`league_entry_totals` · `shadow_detect_diffs()` clean.
*Rollback:* code only, **except `badge_unlocks` is append-only** — a wrong award in this phase cannot
be withdrawn. Run it against a synthetic pool first.

---

### L11 — Notifications and lifecycle sweeps (3 days)

All eight sweeps of §11, the per-season matchweek-open/lock-reminder cron, `notify-round-open`'s
refusal, and the edge-function dispositions. **`firePendingDeadlineWarnings` and
`firePredictReminders` must be repointed in this phase** — §2's NULL CHECK already silenced them.

*Verify:* a synthetic matchweek locking 24h out fires exactly one lock reminder per member and logs
a skip count for excluded pools · a matchday recap fires for a league fixture date · a weekly recap
includes `league_match_scores` rows · a completed season archives · every sweep logs how many rows it
excluded.
*Rollback:* code only.

---

### L12 — Admin and ops surfaces (3 days)

The league fixture editor + `manual_override` (§12.3), `RoundsTab`/`rounds/route.ts` serving derived
rows, `ScoringTab` gating the multiplier/PSO/bonus cards off for a league.

*Verify:* a super admin corrects a fixture score, the affected pools re-score within one tick, and
the next sync run **does not undo it** · the Rounds tab lists 38 matchweeks with locks and no red
toast · the Scoring tab shows only the three prices the league engine reads.
*Rollback:* code only.

---

### L13 — UI (5–7 days)

The 27 modules of §12, `LeagueTable` **with its gate change**, `MatchweekPicker`, the
`page.tsx:96-113` lazy-seed deletion **before** the `:87` `usesRounds` repoint, `/play` and `/tv`.

*Verify:* **in a browser, on a real league pool with a scored matchweek** — leaderboard, Banter,
Form, Results, Predictions, Pool Info, points breakdown, admin View Predictions, admin Scoring,
`/play/[slug]`, `/tv/[slug]`. Memory's standing lesson: a green build is not verification.
*Rollback:* code only.

---

### L14 — Mobile repoint (4–5 days + OTA)

The 14 files of §13, including widening `ProgressivePredictionWizard`'s `RoundKey` union.

*Verify:* on a real device build against a real league pool — home, pool detail, predictions wizard,
breakdown, results, entry view, Banter. Publish **per-platform**, **from `mobile/`**, API deployed
first.
*Rollback:* OTA rollback to the previous runtime.

---

### L15 — Open the door (1 day)

`league_scoring_health` cron alarm live; the catalogue loader offers Premier League 2026/27;
`app/competitions.ts` → `'open'`.

*Verify:* create a real pool, invite two people, submit a matchweek, and **watch a live fixture move
the leaderboard without a page refresh** — the one test that exercises §1.11 with real data.
*Rollback:* flip `app/competitions.ts` and the catalogue filter — one deploy.

---

### 14.1 Critical path and honest duration

L0 is hours. L1 is a day. **L2 → L8 is the irreducible spine** — roughly 26–33 working days of build
before a league pool can score correctly and notify anyone. L9 → L15 is another 22–27. Call it
**10–13 weeks of focused work**, and the Premier League season starts on 21 August.

**That is the honest statement, and it is the one thing in this document Ryan most needs.** The
season will be underway long before L15. §15 D8 is where that gets decided rather than discovered.

---

## 15. Open decisions

| # | Decision | Recommendation |
|---|---|---|
| **D1** | Keep `'league_pickem'` in `pools_prediction_mode_check` through the revert? | **Keep.** A value in a shared column, not World Cup structure. Four files still name it |
| **D2** | Edit `broadcast_pool_leaderboard()` — a shared function 623 pools use | **Take it, as a launch blocker, not a league feature.** It is a live latent defect: the payload writes `undefined` into two `LiveEntry` fields on every broadcast. The `to_jsonb` derivation means **zero DDL on any World Cup table**, and it is verified correct on the World Cup arm (164/164). §1.11's pre-attach test is not optional |
| **D3** | Two touches on shared-table triggers: `trg_aa_predictions_reject_league_pool` on `predictions`, `trg_league_adjustment_rescore` on `pool_entries` | **Take both.** Each is provably inert for 623 pools. The first converts *every* missed writer — including ones nobody enumerated — from silent-zero into a logged skip. Note `pool_entries` currently has **zero** non-internal triggers, so the second is the first one there |
| **D4** | **Seven** containment sites, not four | **Take all seven**, with the per-site alias treatment of §B.1. Two of v2's four prescriptions were wrong as written; the verification statement was wrong in a way that would have enforced the bug |
| **D5** | `pool_settings.group_*` as the flat league tier vs new `league_*` price columns | **Reuse `group_*`.** New columns mean a new admin surface, a new default, and a new way for two pools to be incomparable — a stated Showdown prerequisite. The naming smell is a sport-#3 job |
| **D6** | Mirror totals into `pool_entries` vs routing ten direct readers through `readSource` | **Mirror — six columns**, `previous_rank` and `last_rank_update` included. v2's justification ("`recalculatePool` refuses league pools so there is no second writer") was **false**: `lite_recalc_entry` is one. That does not kill the mirror; it means the mirror needs D4 site 5 |
| **D7** | Round state derived, zero `pool_round_states` rows | **Take derived.** 121 stuck rows, structural postponement deadlock, a silent 1,000-pool ceiling — and now the strongest reason: **the only `open` row in production is the one an out-of-repo cron will corrupt on 22 August.** The one real cost (41 readers) is closed by one adapter, one lint rule and one OTA |
| **D8** | **The season starts 21 August and the build finishes ~10–13 weeks later.** What ships in between? | **My recommendation: nothing league-shaped ships mid-season on a partial build.** The alternatives are (a) launch Premier League 2027/28 in August 2027 with a complete backend, using the intervening season to build and test against live data nobody is scored on; (b) launch mid-season at L15 with a `league_start_matchweek` and accept that members join at MW20; (c) compress by cutting scope — and the only cuttable things are the admin fixture editor (L12) and the mobile repoint (L14), which are exactly the two you regret cutting over nine months. **I recommend (a), and I think (b) is defensible.** This is the biggest call in the document and it is Ryan's |
| **D9** | Does a league pool get a standings surface in v1? | **Yes — `LeagueTable` in the Results slot, with the gate change (§12.2).** For the Premier League the table is the competition's signature artifact; shipping without it is conspicuous. But it does **not** get `StandingsTab` |
| **D10** | Lock trigger: silent-skip vs `RAISE` | **Silent-skip, plus the 409.** Consistency with `enforce_prediction_before_kickoff` and mobile's direct writes argue for the skip; §7.2's `inserted.length < request.length` comparison is what makes the trade-off honest instead of a second silent-empty. v2's justification for the skip rested on a gate that is skipped for the mode it was written for — that is now fixed |
| **D11** | **NEW — `lite_recalc_entry` is `SECURITY DEFINER` with `EXECUTE` granted to `anon` and no authz check.** Any anonymous caller can re-rank any pool by `pool_id`. This is a **live World Cup hole**, independent of the league | **Fix it, separately from this project.** Minimum: `REVOKE EXECUTE … FROM anon`, and add `IF NOT is_pool_admin(p_pool_id) THEN RAISE EXCEPTION` as the first statement. Both the web and mobile callers run as authenticated pool admins, so neither breaks. I am flagging rather than folding it in because it deserves its own change and its own verification |
| **D12** | **NEW — mid-season joiners.** `pool_entries` has no start-matchweek column; `league_finalize_totals` aggregates everything with no start filter | **Record explicitly that late joiners score from zero, and put a line on screen saying so.** Over a 9-month season late joining is the *normal* case and the product's purpose is bringing people in — but per-entry starts change the rank cascade and the leaderboard's meaning, and that is a product decision, not a schema one. `pool_entries.league_start_matchweek` is designed and **not built** in v1. Silence here is what the house rule forbids; a recorded decision is not |
| **D13** | **NEW — pick-ahead.** The DB accepts a pick for any unlocked matchweek; the derived function offers only one | **Allow pick-ahead** — `state='open'` for every unlocked matchweek at or after `start_mw`, client defaults to the soonest. It removes the two-gate disagreement, and "you may only pick next week" is a restriction nobody chose for a competition whose whole 38-week calendar exists in August. **This is only safe once §3.3's deadline-only reveal lands. The two ship together or neither does** |
| **D14** | **NEW — season-end moment.** The last matchweek of a 9-month competition passes with no winner declared, no email, no push, no UI change until the archive sweep fires two weeks later | **Out of v1, recorded rather than left silent.** `hasSeasonEnded()` ships (it is needed by the catalogue loader anyway); the notification does not. Note the World Cup has no equivalent either, so this is a gap the product already has |
| **D15** | **NEW — retire the `auto-submit` edge function and point cron 3 at `/api/cron/auto-submit`?** | **Retire it, in L1.** Two implementations of one sweep is the drift that produced CP-C2, the repo copy contains `autoCompleteProgressiveRounds` which the edge copy lacks (and which has therefore **never run in production** — the real explanation for the 121 stuck rounds), and the edge source does not exist in this repository so it cannot be reviewed or tested. The fallback — patch and redeploy the edge function — requires source nobody has |

---

## 16. Where I am least certain, and what I would not compromise on

### 16.1 Least certain

**The scope call, D8.** Everything else in this document is a technical judgement I can defend from
evidence. D8 is a product and business call about a season that starts in five days against a build
that takes ten to thirteen weeks, and I have deliberately not softened either number to make the
other look better. If I am wrong anywhere, it is in the duration estimate for L5 (95 sites, many with
subtle failure modes) and L13 (27 modules, verified only in a browser) — both could be longer, not
shorter.

**The `entry_round_submissions` lock sweep** (§7.4). It is the piece with the least prior art: a
per-season set-based write at matchweek lock, satisfying display surfaces that were designed around
an explicit member action. It is cheap and I believe it is right, but it is the one mechanism in v3
that no existing code resembles.

### 16.2 What I would not compromise on

1. **The guard rule, and the audit that proves it was applied.** Four instances of "reads a column
   its query does not carry" have shipped into these designs — including one inside v2's own
   containment prescription, and one inside the verification statement for it. §B is not a
   restatement of the rule; it is the per-relation check, and it changed three prescriptions.
2. **The side effects have a durable owner** (§4). A SQL drain that fires nothing is not a scoring
   engine; it is half of one. The outbox costs a table and buys "a dropped push is a minute, not an
   event, and it is one `SELECT` to find".
3. **`league_fixtures.matchweek_id` as a hard FK, and `(kicked_off_at, fixture_number)` as the
   chronology** — the two places the World Cup's shape is quietly wrong for a league, and far cheaper
   to get right now than to retrofit once a season's picks are stored against them.
4. **The reveal gate is decided from the deadline, never from a state string, for a league** (§3.3).
   All 380 fixtures exist with real club names in August. Every other product decision in this
   document can be revisited; that one is a privacy guarantee with a member's name on it.







---

# R. Third adversarial review — five lenses, against this file

Unlike the previous round, these reviewers read this document **from disk**. (The first v3 attempt
returned the design as a chat reply, only the last 12 KB survived, and three of five reviewers
reviewed the fragment without noticing. The buildability gate caught it. The workflow now writes the
design to a file and instructs reviewers to halt if handed a fragment.)

| Lens | Verdict | Critical | High |
|---|---|---|---|
| wc-safety | **needs-rework** | 2 | 2 |
| silent-wrongness | **sound-with-fixes** | 2 | 3 |
| ui-reuse | **sound-with-fixes** | 1 | 1 |
| completeness | **sound-with-fixes** | 0 | 3 |
| buildability | **sound-with-fixes** | 2 | 5 |

**Total: 7 critical, 14 high.** All five lenses independently confirm the v2 findings were genuinely fixed and verified against live code, not reworded.

## R.wc-safety — **needs-rework**

**Were the previous findings actually fixed?** GENUINELY FIXED (verified against production, not just reworded):

• WC-C1 / SW-H1 (`broadcast_pool_leaderboard` emits `n.point_adjustment`) — REAL FIX. Live `shadow_entry_totals` columns are exactly `entry_id, pool_id, match_points, current_match_rank, previous_match_rank, updated_at, bonus_points, total_points, final_rank, previous_final_rank` — no `point_adjustment`, so v2's body would have aborted crons 19/20 every minute. §1.11's `COALESCE((to_jsonb(n)->>'point_adjustment')::int, n.total_points - n.match_points - n.bonus_points)` is valid against both relations, and the derivation is *exact by construction*, not just empirically: `shadow_finalize_totals` computes `total_points = COALESCE(ms.mp,0) + COALESCE(bs.bp,0) + COALESCE(f.point_adjustment,0)`. I checked all 4,270 `shadow_entry_totals` rows: **0 disagree** with `pool_entries.point_adjustment` (164 non-zero). The mandatory pre-attach BEGIN…ROLLBACK test is the correct gate. Also verified the live body currently emits only 6 keys and reads only the global `leaderboard_broadcast_enabled`, so the new per-table COALESCE is behaviour-preserving.

• WC-H2 (alias audit) — REAL FIX for 5 of 6 sites, and it changed the design rather than restating it. Verified per-body: `shadow_eligible_entries` ✓ has `pools po`; `shadow_finalize_totals`'s `tmp_ft` ✓; `shadow_reconcile_adjustments`'s pool select ✓; `shadow_detect_diffs` coverage subquery ✓ has `JOIN pools po`; `shadow_detect_diffs` mismatch INSERT is `FROM shadow_entry_totals s JOIN pool_entries pe` with **no `pools` and no `pool_members`** — v3 is right to DROP the conjunct there, and the "INNER from shadow, absence cannot diff" argument holds given sites 2 and 3 are contained. The corrected verification statement ("NOTHING in shadow_detect_diffs's mismatch INSERT") is the real fix; v2's version would have enforced the bug. The one exception is `snapshot_pool_ranks` — see finding 5.

• WC-C2 (`lite_recalc_entry`) — DIAGNOSIS genuinely fixed and correctly extended. Verified: `lite_recalc_entry(uuid,uuid) RETURNS void`, `prosecdef=true`, `proacl = {=X/postgres, postgres=X, anon=X, authenticated=X, service_role=X}` — EXECUTE to PUBLIC and `anon`, and the body has no authz, no pool/mode/archive predicate. D11 correctly escalates this as a live World Cup hole. `RETURNS void` also means the prescribed bare `RETURN;` is valid. But the *remedy as scheduled* introduces a new critical — finding 2.

• WC-H1 — addressed properly. Verified `entryAnalytics.ts:62` really is `.select('tournament_id, prediction_mode')`, and naming it as a precondition of `competitionRef` throwing is the correct ordering call.

• WC-H3 — verified: jobid 15 is ACTIVE at `* * * * *`, `analytics_sweep_enabled` exists in `sync_settings`. Containment site 6 plus the provenance-not-row-count XP assertion is right.

• WC-L1 — verified: `lib/poolData.ts:181-186`'s `teams` select carries no `.eq('tournament_id', …)`, and `teams` holds 68 rows, so every World Cup pool's `TeamData[]` really does carry 20 English clubs today. Correct fix, correctly moved to L1.

• SW-H2 (reveal) — mechanism verified sound. `lib/predictions/revealGate.ts:41` is `new Set(['locked','in_progress','completed'])` and `:117-120` is `if (round.state && LOCKED_ROUND_STATES.has(round.state)) return true; return isDeadlinePassed(...)`. Nulling `state` in the adapter genuinely falls through to the deadline with zero World Cup behaviour change.

• L1 step 7's substitution counts — verified exactly right: `shadow_score_match` has 2 `NOT stage_has_scheduled_teams(stage)`, 5 total `stage_has_scheduled_teams(`, 3 `mode_submits_per_round(po.prediction_mode)`; `shadow_calculate_bonuses` has exactly 1. The "def-lines 48-54" pinpoint of the 046d block is correct, the literal `COALESCE(ps.group_exact_score, 5)       AS base_exact` is present with that exact spacing, and there are zero `knockout_exact_score` references. This is the best-specified part of the revert.

• RLS — clean. Zero policies in `public` reference `tournament_id`, so `ALTER COLUMN tournament_id DROP NOT NULL` cannot break World Cup RLS. FK delete-order in L1 step 6 is right: `matches_home/away/winner_team_id_fkey` are all NO ACTION (so matches must precede teams) and `pools_tournament_id_fkey` is genuinely `ON DELETE CASCADE` (so the tournament must go last). `pool_entries` has zero non-internal triggers, as claimed.

ACCEPTED IN PROSE BUT NOT ACTUALLY FIXED:

• WC-M4 ("crons 19/20/15 armed during the revert steps") — this is the clearest case. v3 marks it ACCEPTED and writes L1 step 0 to quiesce with a single `UPDATE sync_settings … WHERE setting_key='shadow_reconcile_enabled'`. That key **does not exist** — a fact v3 itself states in §0.2 — so the UPDATE matches 0 rows and reports success. The finding is reworded, not closed. Finding 1.

• WC-M3 (`stage_uses_base_prices` omitted from the KEEP list) — "fixed" by adding it to §10.4's KEEP table, but the function does not exist in any schema. Finding 6.

v3's World Cup *analysis* is now substantially sound and mostly verified-correct against production — WC-C1's broadcast fix is exact by construction, the six-site alias audit is real and changed three prescriptions, RLS is untouched, and L1's function-substitution counts and 046d pinpoints are accurate to the character. But the two phases scheduled to run first — L0 (hours, dated 22 Aug) and L1 (one day) — each contain a defect that breaks or invalidates World Cup machinery, and both are the document's own named failure class. L0 installs a guard reading `pools.league_season_id`, a column that provably does not exist until L4, into a SECURITY DEFINER function called from live World Cup admin surfaces on web and a shipped mobile OTA that swallows the error. L1's quiescence step writes to a `sync_settings` key that does not exist, so the entire revert — including a `CREATE OR REPLACE` on `shadow_score_match` — runs against a shadow engine reconciling every 60 seconds, and L1 step 2's equivalence gate is guaranteed to return FALSE because it reads the league data it has not deleted yet (I ran it: both halves false). None of the three are caught by their own verifications. All three fixes are one or two lines.

### [CRITICAL] L1 step 0's quiescence write matches zero rows, so the entire World Cup revert runs against a live shadow engine. Step 0 is `UPDATE sync_settings SET setting_value='false' WHERE setting_key='shadow_reconcile_enabled'`. That key does not exist — v3 states this itself in §0.2 ("No `shadow_reconcile_enabled` key … defaults to enabled in their readers") and I verified it: `sync_settings` holds 16 keys and neither `shadow_reconcile_enabled` nor `shadow_materialize_enabled` is among them. An UPDATE matching no rows is silent success. Both `shadow_reconcile_matches` (jobid 19, `* * * * *`, active) and `shadow_reconcile_adjustments` (jobid 20, `*/2`, active) read the key as `COALESCE((SELECT setting_value …), to_jsonb(true))`, so both stay armed. Step 11's un-quiesce UPDATE is equally a no-op, which hides the omission. This is WC-M4 marked ACCEPTED and then closed with an inoperative statement.

**Failure.** L1 step 0 reports success; nothing is quiesced. Step 5 deletes the 380 `shadow_match_state` rows while the 380 `matches` rows still exist (they go in step 6). Within ≤60s cron 19's diff query — `FROM matches m LEFT JOIN shadow_match_state st … WHERE (m.home_score_ft, …) IS DISTINCT FROM (st.home_score_ft, …)` — matches all 380, takes 25 per run, calls `shadow_score_match` on each (which DELETEs, UPSERTs and fires `broadcast_pool_leaderboard`), and re-INSERTs `shadow_match_state`. Step 5's assertion and the L1 verify's `shadow_match_state = 104` are then racing a writer and will report whatever the cron last left. Worse, step 7 does two sequential `CREATE OR REPLACE`s on `shadow_score_match`, leaving a committed half-reverted body that cron 19 can execute against World Cup matches — while the L1 verify explicitly instructs "do not re-score — `shadow_score_match` DELETEs, UPSERTs and fires the broadcast", an instruction only the human obeys. The stated premise "Every count below is then an assertion over a quiet database (WC-M4)" is false for every count in L1.

**Fix.** Quiesce with the mechanism L0 already uses and that provably works: `UPDATE cron.job SET active=false WHERE jobid IN (19,20,21);` as step 0, restored in step 11. If the flag is preferred, it must be an upsert — `INSERT INTO sync_settings(setting_key, setting_value) VALUES ('shadow_reconcile_enabled', to_jsonb(false)) ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value` — and step 0 must end with a behavioural read-back, not a write: `SELECT shadow_reconcile_matches()` must return `{"skipped":"disabled"}` before step 1 begins. Add the same read-back for `analytics_sweep_enabled` (that key does exist, so its UPDATE works — which is exactly why the failure is easy to miss).

### [CRITICAL] L0 step 3 installs a guard that reads a column which does not exist yet, into a SECURITY DEFINER function that 623 live World Cup pools call. L0 says "Add the leading league guard to `lite_recalc_entry` (§10.2)", and §10.2 / §B row 7 both specify the predicate `IF (SELECT league_season_id FROM pools WHERE pool_id = p_pool_id) IS NOT NULL THEN … RETURN; END IF;`. I verified `pools` has no `league_season_id` column today — it is added in §2, which lands in **L4**, roughly two weeks of phases later. PL/pgSQL resolves column references at runtime, so `CREATE OR REPLACE` succeeds and the function raises on first call. §1.11 states this exact mechanism ("CREATE OR REPLACE succeeding proves nothing — that is precisely how this defect would reach production") and §B row 12 states the exact ordering constraint for a sibling function, and neither is applied here. L0 calls the change "Provably inert for 623 pools".

**Failure.** From the moment L0 lands until L4, every call to `lite_recalc_entry` raises `column "league_season_id" does not exist`. It is called after every admin point adjustment from `/Users/ryansousa/Documents/GitHub/office-pools/app/pools/[pool_id]/admin/MembersTab.tsx:412` (web, all 623 World Cup pools) and from `/Users/ryansousa/Documents/GitHub/office-pools/mobile/components/pool-detail/AdjustPointsSheet.tsx:162`, where the error is swallowed by `console.warn` at `:168` — the adjustment lands, the pool is never re-ranked, and nothing surfaces. That mobile call site is in a shipped OTA bundle that no web deploy can recall, which is the very reason §10.2 gives for putting the guard in the database. L0's verification is `pg_get_functiondef('lite_recalc_entry')` shows exactly one added leading block — a text grep that cannot detect this — plus two cron checks and a `pool_round_states` count. Nothing in L0 executes the function.

**Fix.** At L0 use a predicate over a column that exists today: `IF (SELECT prediction_mode FROM pools WHERE pool_id = p_pool_id) = 'league_pickem' THEN RETURN; END IF;` — this is exactly as effective against the archived league pool and against the mobile call site, and `pools_prediction_mode_check` already carries `'league_pickem'` (verified). Swap it to the `league_season_id` form in L4, which already re-touches this function as containment site 5. Add one line to L0's verify: inside `BEGIN … ROLLBACK`, call `lite_recalc_entry` on a real World Cup entry and assert no exception and a non-zero re-rank.

### [HIGH] L1 step 2's equivalence gate is guaranteed to return FALSE, because it reads the league data that steps 4 and 6 have not deleted yet. Step 2 runs `SELECT bool_and(stage_has_scheduled_teams(stage) = (stage='group')) FROM (SELECT DISTINCT stage FROM matches) s;` and the analogous check for `mode_submits_per_round`, and says "Both must be true". Verified live bodies: `stage_has_scheduled_teams(p_stage)` is `p_stage IN ('group','regular_season')` and `mode_submits_per_round(p_mode)` is `p_mode IN ('progressive','league_pickem')`. At step 2 the 380 `regular_season` rows are still in `matches` (deleted at step 6) and the one `league_pickem` pool is still in `pools` (deleted at step 4). I ran the step exactly as written against production: `stage_equiv = false`, `mode_equiv = false`. The intent is right — the substitutions ARE a semantic no-op on the surviving data — but the gate is pointed at the wrong row set.

**Failure.** The revert halts at step 2 on a false alarm, before any of the ordered, count-asserted steps run. The likelier and worse outcome: an implementer reads `false` as "the substitution is not safe" and starts editing `shadow_score_match` to reconcile it — and `shadow_score_match` is the one function in the revert whose pricing block (def-lines 48-54, 046d single-base) must be left byte-identical. WC-M2's whole point was to prove the substitutions before editing; as scheduled, the proof fires a false negative at exactly the moment it is meant to build confidence.

**Fix.** Either move step 2 to run after steps 4 and 6, or scope both reads to the surviving data and leave it where it is: `SELECT bool_and(stage_has_scheduled_teams(stage) = (stage='group')) FROM (SELECT DISTINCT stage FROM matches WHERE stage <> 'regular_season') s;` and `SELECT bool_and(mode_submits_per_round(prediction_mode) = (prediction_mode='progressive')) FROM (SELECT DISTINCT prediction_mode FROM pools WHERE prediction_mode <> 'league_pickem') p;`. Still two pure reads, and both now return true.

### [HIGH] L2 creates a trigger on the shared, live `predictions` table whose function reads `pools.league_season_id` — a column L4 adds. §B row 13 defines `reject_league_pool_prediction` as reading "the same three relations as 12", and row 12's relations include `pools po.league_season_id (added §2)`. Row 12 then states the ordering constraint in so many words: "the `pools` column must be added **before** this function is created". §14 orders L2 ("the four league triggers") before L4 ("`league_season_id` … all three CHECKs"), violating the constraint the audit just wrote down. D3 names the trigger `trg_aa_predictions_reject_league_pool` and it is BEFORE INSERT OR UPDATE FOR EACH ROW on `predictions`.

**Failure.** Between L2 and L4 — roughly 6-9 days by v3's own estimates — every INSERT or UPDATE on `predictions` raises `column "league_season_id" does not exist`, on the shared World Cup table. Current exposure is limited because the last `predictions` write was 2026-07-19, but it is not zero: `mobile/lib/usePredictions.ts:291-299` re-queues failed upserts into `pendingRef` and retries forever, so any device holding a pending write loops silently against a hard error, and any admin, backfill or migration script touching `predictions` fails. L2's verification checks only league-table row counts (1 season, 20 clubs, 38 matchweeks, 380 fixtures) plus `npm run lint`, so nothing in the phase would catch it. The same defect affects `assert_league_prediction_pool`, though that one is confined to `league_predictions`.

**Fix.** Move the `ALTER TABLE pools ADD COLUMN league_season_id` out of L4 and into L2 ahead of the triggers, or move all three `pools.league_season_id`-reading league functions out of L2 into L4. Then add to whichever phase creates the `predictions` trigger: inside `BEGIN … ROLLBACK`, insert one row into `predictions` for a World Cup entry and assert it lands with no exception. §B row 12's ordering note should be restated as a phase-level dependency in §14, not left as a footnote in the audit table.

### [MEDIUM] §B row 6 mis-describes `snapshot_pool_ranks`, so the fix it prescribes has nowhere to go and its verification cannot detect a wrong placement. The row says the "verified body" joins `pool_entries pe` to `pool_members pm` and prescribes "an added `JOIN pools po ON po.pool_id = pm.pool_id` before the conjunct". The live body has no join at all: `UPDATE pool_entries pe SET previous_rank = pe.current_rank WHERE pe.member_id IN (SELECT pm.member_id FROM pool_members pm WHERE pm.pool_id = ANY(p_pool_ids));`. `pm` exists only inside the IN subquery. This is the same shape as the WC-H2 defect §B exists to eliminate — a prescription written against an alias layout that is not the one in the function.

**Failure.** An implementer following §B row 6 literally adds `JOIN pools po ON po.pool_id = pm.pool_id` at the UPDATE's top level, where `pm` is not in scope, and gets a syntax/alias error — the loud case. The quiet case is worse: L4's verification is a text diff asserting "one JOIN plus one conjunct in `snapshot_pool_ranks`", which is satisfied by a join placed anywhere, including one that changes which entries the UPDATE touches. `snapshot_pool_ranks` writes `previous_rank` for World Cup entries on every `sync-fixtures` tick, and a wrong join here silently corrupts every ▲/▼ arrow across 623 pools — the exact failure §10.2 says "cannot fail loudly".

**Fix.** Restate site 6 as the actual edit: `… WHERE pe.member_id IN (SELECT pm.member_id FROM pool_members pm JOIN pools po ON po.pool_id = pm.pool_id WHERE pm.pool_id = ANY(p_pool_ids) AND po.league_season_id IS NULL)`. Replace L4's text-diff assertion for this site with a behavioural one: call `snapshot_pool_ranks` with a World Cup pool id and assert the returned row count is unchanged from a pre-edit capture, and with a league pool id and assert it returns 0.

### [LOW] §10.4 instructs the implementer to preserve a function that does not exist. `stage_uses_base_prices` is absent from `pg_proc` in every schema (verified by name search across all namespaces). §10.4 lists it as "Unreferenced by any live body (046d removed it) — but LEAVE IT", and prescribes the same three-name note as a header comment on `lib/migrations/046_league_scoring.sql`. The two names that matter are verified correct and load-bearing: `mode_submits_per_round(text)` and `stage_has_scheduled_teams(text)` both exist and are referenced by `shadow_score_match`, `shadow_eligible_entries`, `shadow_finalize_totals` and `shadow_calculate_bonuses` — dropping either would abort cron 19 within a minute, exactly as §10.4 warns.

**Failure.** An implementer looking for `stage_uses_base_prices` to preserve it will not find it, and has to decide whether the audit table is stale or whether someone already dropped it. In a section whose stated purpose is preventing a mistaken `DROP` of the two functions that ARE live, a third entry that cannot be checked weakens the two that can. Same class as §5.1 stating "18 pg_cron jobs" while its own table lists 17 and production has 17 (jobids 1,2,3,4,5,8,9,10,11,12,13,14,15,18,19,20,21) — a count mismatch inside the section written to answer "v2 is blind to what the crons actually run".

**Fix.** Reduce §10.4 to the two functions that exist, and record the third as already-dropped: 046d removed `stage_uses_base_prices`, which is precisely why `046_league_scoring.sql:474-478`'s three-name droppable list must not be trusted — one is gone and two would take the shadow engine down. Correct §5.1's header to 17.

## R.silent-wrongness — **sound-with-fixes**

**Were the previous findings actually fixed?** Genuinely fixed, verified against live code/DB — not reworded:

SW-H1/WC-C1 (point_adjustment): REAL FIX. Live `broadcast_pool_leaderboard()` confirmed to emit neither `point_adjustment` nor `scored_total_points`, and `shadow_entry_totals` has no such column. I executed v3's exact expression against `shadow_entry_totals` in the trigger's grouped-jsonb_agg shape — it parses and runs. The derivation is exact: 4,270/4,270 rows agree with `pool_entries.point_adjustment` (164 non-zero, 0 disagree). The "PL/pgSQL resolves column refs at runtime, so CREATE OR REPLACE proves nothing" pre-attach test is the right safeguard and is a real mechanism.

SW-C2 (fixture inventory): REAL FIX for `matches`. grep returns exactly 95; the buckets, the L2 lint rule, and the /live ordering constraint are all real. `liveMerge.ts:26-28` confirms `needsFullRefresh` compares `live.completed_matches !== completedLocally`, so the refresh-storm mechanism in §6.3 is correct as described. NOT generalized to the twin table — see finding on 31 `.from('teams')` sites.

SW-H2 (reveal leak): REAL FIX. Traced `revealGate.ts:117-120`: `isRoundLocked` returns true only when `state` is truthy AND in LOCKED_ROUND_STATES, otherwise falls through to `isDeadlinePassed(round.deadline)`. Nulling `state` for `lock_at > now()` does exactly what §3.3 claims, `deadline` is `lock_at`, and no World Cup row is ever nulled. The write-side half (fixture-membership validation, §7.2 item 4) and the D13 coupling are correctly identified as inseparable.

SW-H3 (has_submitted_predictions): REAL FIX. Setting it in-RPC is right, and the coupling to `shadow_eligible_entries` containment is correctly spotted — I confirmed `shadow_finalize_totals`' `tmp_ft` CTE does carry `JOIN pools po`, so §B row 2's "VALID, one conjunct" is accurate.

SW-L1: fixed, correctly restated as "at most one".

MERELY RESTATED, NOT FIXED:

SW-M1 (`previous_rank`/`last_rank_update` in the mirror): the column was added to the mirror and the reason for it was written up well — but nothing in v3 writes the source column it mirrors from, and the design's own containment turns off the only function that could. See finding 2. This is the one v2 finding on this lens that v3 answers in prose and not in mechanism.

SW-C1/CP-C1 (orphaned side effects): the ARCHITECTURE is genuinely fixed — the outbox and Node orchestrator are the right shape and the rejection of pg_net/edge-function is well evidenced. But two of the six side effects it claims to own are still no-ops as specified: `fanOutResultPushes` (finding 1) and `snapshotPoolRanks` (finding 2). The ownership problem is solved; two of the owned things still don't fire.

v3 is a substantially stronger document than v2 and I could not find a fabricated claim in it — every live-state assertion I re-ran came back exactly as printed. The nine criticals are addressed with real mechanisms, not intentions; WC-C1's derivation in particular I verified row-by-row (4,270/4,270). The architecture (fork, outbox + orchestrator, derived matchweeks, deadline-only reveal, one checked CompetitionRef producer) holds up under adversarial reading.

The failures that remain are all of the same species and all on this lens: v3 closes a gap in one place and leaves its structural twin open, then writes a verification that is specified to the incomplete list and therefore passes. Two are critical because the product is silently degraded for a whole 38-week season and `league_scoring_health` goes green over both: no result pushes will ever fire for a league fixture (while the drain stamps the column that asserts they did), and `pool_entries.previous_rank` has no writer (while the health check compares NULL to NULL). A third — the outbox's partial unique index — drops real score changes precisely when the drain is slow, which is the Saturday-15:00 scenario the outbox was built for, and L8's stated test is structurally blind to it.

None of these invalidate the design. Each has a small, local fix. But L8's and L10's exit criteria must change, or all three ship green.

### [CRITICAL] §4.3 step 4 makes `fanOutResultPushes` the league drain's push owner, but that function is a global cursor over the `matches` table and can never see a league fixture — and the drain then stamps `league_fixtures.result_pushes_sent_at` unconditionally afterwards, so §10.5's assertion certifies a send that never happened. §4.5 repoints the wrong line: it names `match-results.ts:84` (the `scoreTable` selector) when the gate is the `.from('matches')` select at :86-95. `match-results.ts` also appears nowhere in §6.3's named 95-site dispositions.

**Failure.** lib/push/match-results.ts:79 `fanOutResultPushes()` takes no arguments and selects `.from('matches').eq('is_completed',true).is('result_pushes_sent_at',null).limit(50)`, then `if (matches.length === 0) return`. A league fixture lives in `league_fixtures`, so the query returns [] and the function returns immediately — no error, no log. §4.3 step 4 then runs `stamp league_fixtures.result_pushes_sent_at`. §10.5 asserts `every completed fixture has result_pushes_sent_at IS NOT NULL -- SW-C1` and passes. Result: zero `prediction_result` pushes for all 380 fixtures of the season, with the health check green and L8's verification ('a completing league fixture produces ≥1 prediction_result push') the only thing standing between this and production. Note the semantic inversion: in the World Cup path `result_pushes_sent_at` is written by `claimMatch` (match-results.ts:64-71) as an atomic claim *inside* the fan-out, which is what prevents double-sends; v3 demotes it to a post-hoc stamp written by the caller.

**Fix.** Give `fanOutResultPushes` a `CompetitionRef` (or an explicit fixture-id list) and a league arm reading `league_fixtures` + `league_match_scores`, keeping the claim-then-send shape so `result_pushes_sent_at` is written by the claim, not by the drain. Delete the unconditional stamp from §4.3 step 4. Change the §10.5 assertion from 'result_pushes_sent_at IS NOT NULL' to a count of actual `prediction_result` push rows per completed fixture — the stamp cannot be its own evidence. Add `lib/push/match-results.ts:86` to §6's bucketed disposition as REPOINT.

### [CRITICAL] `pool_entries.previous_rank` for a league entry has no writer. Three mechanisms cancel out: §4.3 step 1 calls the World Cup helper, §10.2 contains the function that helper calls, and `league_entry_totals.previous_final_rank` — the column §8.3 mirrors from — is never written by anything in v3. §4.3 deletes `league_snapshot_ranks` as a pg_cron job and never specifies a replacement body. This is SW-M1 answered in prose only.

**Failure.** `lib/scoring/snapshotRanks.ts:15` `snapshotPoolRanks` RPCs two functions: `snapshot_pool_ranks` (live body verified: `UPDATE pool_entries pe SET previous_rank = pe.current_rank WHERE pe.member_id IN (SELECT pm.member_id FROM pool_members pm WHERE pm.pool_id = ANY(p_pool_ids))`) and `shadow_snapshot_ranks` (live body verified: `UPDATE shadow_entry_totals SET previous_final_rank = final_rank WHERE pool_id = ANY(p_pool_ids)`, wrapped in a swallowing try/catch at snapshotRanks.ts:26-30). Neither touches `league_entry_totals`. §10.2 then adds `league_season_id IS NULL` to `snapshot_pool_ranks`, so the prod arm updates 0 rows for exactly the pools the drain calls it for; the shadow arm updates 0 rows because a league pool has no `shadow_entry_totals` row by design. Step 1 is therefore a complete no-op, and §8.3's mirror copies a never-written `previous_final_rank` (NULL) into `pool_entries.previous_rank`. §10.5's assertion `pool_entries.previous_rank = league_entry_totals.previous_final_rank` is NULL vs NULL and reports no violations. Every ▲/▼ indicator — the 13 web readers §8.3 itself enumerates (dashboard/page.tsx:61,469-473, CommunityTab.tsx:954-955, DesktopSidebar.tsx:384, LeaderboardTab.tsx:789,814,1109) plus six mobile readers — renders 'no movement' for all 38 matchweeks. §8.3 names this exact outcome as the reason the column was added.

**Fix.** Create `league_snapshot_ranks(p_pool_ids uuid[])` as a direct analogue of the verified `shadow_snapshot_ranks` body: `UPDATE league_entry_totals SET previous_final_rank = final_rank WHERE pool_id = ANY(p_pool_ids)`. Call it from drain step 1 in place of `snapshotPoolRanks` (which is the World Cup helper and should not be called for a league pool at all). Then resolve the contradiction with §10.2 site 6 explicitly — with step 1 no longer calling it, containing `snapshot_pool_ranks` is pure defence-in-depth and is fine. Strengthen the §10.5 assertion to `IS DISTINCT FROM` plus 'previous_final_rank IS NOT NULL for every entry once ≥2 matchweeks are complete', so NULL=NULL can no longer pass.

### [HIGH] The outbox's partial unique index `uq_lse_pending (pool_id, fixture_id, kind) WHERE processed_at IS NULL` combined with step 2's `ON CONFLICT DO NOTHING` silently discards a genuine new score change whenever a prior event for the same fixture is claimed-but-not-yet-processed — and step 2 advances the `league_fixture_state` mirror in the same statement, so the change is never re-detected. L8's stated test cannot see this failure mode.

**Failure.** Drain run A: step 2 scores fixture F, upserts the state mirror, inserts event E; step 3 claims E (claimed_at set, processed_at still NULL); step 4 begins its per-pool sequential awaits. Run A can easily exceed the 60s schedule — step 4 is capped at 40 pools, sequential, with `detectAndPushBadgesForPool` in each iteration — and v3 specifies no overlap guard for the Node route (the advisory lock on `hashtext('league_process_queue')` is inside `league_reconcile_fixtures`, i.e. step 2 only). Run B starts: step 2 detects a further goal in F, re-scores, upserts the state mirror (consuming the diff), and its `INSERT ... ON CONFLICT DO NOTHING` collides with E, which is still `processed_at IS NULL` — the event is dropped with no error. Run A completes and marks E processed. From the next tick onward `league_fixtures` and `league_fixture_state` agree, so no event is ever generated for the second goal: no result push and no `invalidatePoolCache` for the final score, leaving a stale cached leaderboard. L8's verification is 'kill the drain for 10 minutes, restart, assert no event is lost' — with the drain dead nothing is claimed, so the index behaves as a genuine coalesce and the test passes. The precedent for the missing guard is explicit: `app/api/cron/sync-fixtures/route.ts:352-353` says overlapping sweeps 'compounding under load is what melted the DB' and :398 acquires `try_acquire_sweep_lock` with a TTL.

**Fix.** Two lines. Scope the index to unclaimed rows only — `WHERE processed_at IS NULL AND claimed_at IS NULL` — so a claimed event can no longer suppress a new one (and make `league_release_score_events` delete rather than un-claim when an unclaimed sibling already exists). Simpler and equivalent: drop `uq_lse_pending` entirely, since step 4 already iterates 'per distinct pool' and therefore coalesces duplicates anyway; keep `idx_lse_pending`. Separately, wrap `/api/cron/league-reconcile` in the existing `try_acquire_sweep_lock` pattern. Replace L8's test with one that exercises the real path: score a fixture, hold the drain mid-step-4, push a second score change, and assert a second event exists and is processed.

### [HIGH] §9.3's restored `league_fixtures → MatchData` mapping table omits the embedded `home_team` / `away_team` objects, which every repointed `matches` query carries today and which 17+ shared UI modules read. L9's typed test is specified to the same incomplete key list, so it passes while the gap ships.

**Failure.** Every `matches` select in the repoint set carries the PostgREST FK embed — `lib/poolData.ts:202`, `leaderboard/route.ts:93`, `breakdown/route.ts:174`, `entries/[entry_id]/analytics/route.ts:91`, `entryAnalytics.ts:74`, `activity/route.ts:637`, `matches/[match_id]/stats/route.ts:77`, `getTournamentSummary.ts:88`, `time-based.ts:51`, `match-results.ts:90`, `recalculate.ts:125`, plus 7 mobile hooks — as `home_team:teams!matches_home_team_id_fkey(country_name, country_code, flag_url)`. Consumers read `m.home_team.country_name` at PoolDetail.tsx:991, ResultsTab.tsx:171,206, LeaderboardTab.tsx:186, AnalyticsTab.tsx:346,379, CommunityTab.tsx:164,185, SharePredictionModal.tsx:200, analyticsHelpers.ts:175, MembersTab.tsx:940,1321 and others — every one written as `m.home_team ? {...} : null`, so an absent key fails soft to null with no error. A `fixtureStore` adapter built to §9.3's table as printed returns `home_team_id` but no `home_team`, and every league match card, share card, results row and Banter card renders a blank club name and no crest. §9.3 lists 20 keys and neither of these two; L9's stated coverage is 'round_number, stage, match_number, home_team_id, away_team_id' — all five present, test green. This is precisely the class UI-M1 raised ('each omission is silent'), reintroduced inside the artifact restored to close it.

**Fix.** Add two rows to §9.3's table: `home_team` and `away_team`, each synthesised from `league_clubs` as `{country_name: name, country_code: abbreviation, flag_url: crest_url}` keyed off `home_club_id`/`away_club_id`. Add both to L9's typed test key list. Cheapest structural guard: make `MatchData`'s home_team/away_team non-optional in the type so the compiler catches an adapter that omits them, rather than relying on the test list.

### [HIGH] 31 `.from('teams')` sites receive no inventory, no adapter, no bucketed disposition and no lint rule — the identical omission SW-C2 raised for `matches`, fixed for `matches` and left open for the table it joins to. Worse, L1 step 3 creates the league failure as a side effect of a correct World Cup fix.

**Failure.** `grep -rn "from('teams')" app lib mobile components scripts` returns 31. §6.1's `FixtureStore` interface has no club/team method; the three L2 ESLint confinement rules cover `predictions`, `matches` and `pool_round_states` only; and the only mention of clubs anywhere in v3 is §9.3's prose mapping table. Concretely: L1 step 3 correctly adds `.eq('tournament_id', pool.tournament_id)` to the `teams` select at `lib/poolData.ts:181-186` to fix W11 — for a league pool under option A that is `tournament_id=eq.null`, which returns zero rows with HTTP 200, so `PoolSharedData.teams` is `[]` for every league pool from L1 onward. Same shape at `leaderboard/route.ts:97`, `breakdown/route.ts:183`, `entries/[entry_id]/analytics/route.ts:95`, `matches/[match_id]/scores/route.ts:80`, `dashboard/page.tsx:142`, `profile/page.tsx:217`, and mobile `usePredictions.ts:127`. `ProgressivePredictionsFlow:200` does `byId.get(match.home_team_id)` against that array — every prediction card renders 'TBD v TBD', which §9.3 itself names as the failure it is trying to prevent.

**Fix.** Do for `teams` exactly what §6 does for `matches`: bucket all 31 sites into UNAFFECTED / REPOINT / BRANCH / REFUSE / DEAD, add a club door (`clubStore(ref)`, or a `clubs()` method on `FixtureStore`) returning the §9.3 `TeamData` shape, and extend the L2 ESLint rule to confine `.from('teams')` to `lib/fixtures/`. Land it in L5 alongside the fixture repoint, since L1 is what opens the hole.

### [MEDIUM] §10.2's final form of the `lite_recalc_entry` league arm calls `league_rescore_pool(p_pool_id)` inside a SECURITY DEFINER function that grants EXECUTE to `anon` with no authz check — turning a live authz hole into an unauthenticated full-season re-score. D11 defers the REVOKE to a separate project, so the ordering is left to chance.

**Failure.** Verified live: `lite_recalc_entry` has `prosecdef = true` and `proacl = {=X/postgres, postgres=X, anon=X, authenticated=X, service_role=X}` — `=X` is PUBLIC — and the body (dumped in full) contains no authz check, no pool predicate and no archive predicate. v3 is right about all of this. But §10.2's prescribed guard is `IF (SELECT league_season_id FROM pools WHERE pool_id = p_pool_id) IS NOT NULL THEN PERFORM league_rescore_pool(p_pool_id); RETURN; END IF;`, and §8.5 defines `league_rescore_pool` as 're-scores every completed/live fixture of the pool's season and finalizes' — up to 380 fixtures × N entries. Any anonymous caller who knows or guesses a pool_id can then drive an unbounded re-score at will, once per request, with no rate limit. L0 step 3 is safe because it lands the bare `RETURN` form before `league_rescore_pool` exists; the hazard is the §10.2 final form landing in L4 while D11 sits in a separate queue.

**Fix.** Make D11 a hard prerequisite listed inside L4's steps rather than a parallel decision: `REVOKE EXECUTE ON FUNCTION lite_recalc_entry(uuid,uuid) FROM PUBLIC, anon;` plus `IF NOT is_pool_admin(p_pool_id) THEN RAISE EXCEPTION` as the first statement, applied before the league arm gains its `PERFORM`. v3 already establishes that both callers (`admin/MembersTab.tsx:412`, `mobile/.../AdjustPointsSheet.tsx:162`) run as authenticated pool admins, so neither breaks.

### [MEDIUM] §B row 6's prescription for `snapshot_pool_ranks` — 'Needs an added `JOIN pools po ON po.pool_id = pm.pool_id` before the conjunct' — does not fit the function's actual body, and L4's verification restates the same wrong shape. §B is the section whose stated purpose is catching exactly this, and it is presented in §16.2 as the first non-negotiable.

**Failure.** The live body is `UPDATE pool_entries pe SET previous_rank = pe.current_rank WHERE pe.member_id IN (SELECT pm.member_id FROM pool_members pm WHERE pm.pool_id = ANY(p_pool_ids))`. There is no FROM/JOIN clause at the top level and the alias `pm` exists only inside the IN-subquery, so there is nothing for a `JOIN pools po` to attach to — §B row 6's own description ('`pool_entries pe`, `pool_members pm`') reads the subquery alias as though it were in the outer statement's scope, which is the same misread the rule forbids. L4's exit criterion compounds it: 'pg_get_functiondef diff shows ... one JOIN + one conjunct in `snapshot_pool_ranks`'. An implementer following it literally produces a syntax error, so this fails loudly rather than silently — but the verification statement is again encoding the wrong shape, which is the meta-failure §B.1's closing lesson identifies in v2.

**Fix.** Correct §B row 6 and L4's criterion to: one added conjunct *inside the IN-subquery* — `... WHERE pm.pool_id = ANY(p_pool_ids) AND EXISTS (SELECT 1 FROM pools po WHERE po.pool_id = pm.pool_id AND po.league_season_id IS NULL)`. (Alternatively rewrite as `UPDATE ... FROM pool_members pm JOIN pools po ON po.pool_id = pm.pool_id WHERE pe.member_id = pm.member_id AND ...`, but that changes the statement's shape and should be stated as such rather than as 'an added JOIN'.) Resolve against the finding above on whether this site should be contained at all.

### [MEDIUM] The `entry_round_submissions` per-season lock sweep — which v3 itself flags in §16.1 as 'the one mechanism in v3 that no existing code resembles' — has no phase in §14, no cron owner in §11, and no assertion in §7.5 or §10.5. It is a sweep with no runner, which is the same tell v3 correctly used to catch `result_pushes_sent_at`.

**Failure.** §7.4 specifies 'a per-season sweep at matchweek lock: for every entry with ≥1 league_prediction in the matchweek that just locked, write has_submitted = true and prediction_count'. Searching the document, `entry_round_submissions` appears only at lines 160, 900, 987 and 1771 — the disposition table, the gate description, the specification itself, and the least-certain list. L11's body names 'all eight sweeps of §11, the per-season matchweek-open/lock-reminder cron' and does not include it; L6's body names the in-transaction flags and does not include it. §7.5's four write-path invariants and §10.5's thirteen assertions both omit it. If it is never built, `predictions/route.ts:81`'s `roundStatus` (built from `pool_round_states` + `entry_round_submissions`) reports every matchweek unsubmitted for every member all season, and admin MembersTab submission chips stay empty — a plausible-looking 'nobody submitted' that is indistinguishable from the truth.

**Fix.** Name it as an explicit L11 deliverable attached to the new per-season matchweek cron (it fires at the same instant, on the same 38 rows), and add one line to §10.5: 'every entry with ≥1 league_prediction in a locked matchweek has a matching entry_round_submissions row with has_submitted = true'. That converts it from an unowned paragraph into something the health cron can fail on.

### [LOW] §3.3 item 3 cites `revealGate.ts:54` as the line to change to `usesRounds(pool.prediction_mode)`; the actual mode branch is at :56.

**Failure.** `lib/predictions/revealGate.ts:54` is `now: Date,` (a parameter of `computeReveal`); the `if (pool.prediction_mode === 'progressive') {` branch is at :56. An implementer editing the cited line edits the signature. Trivially self-correcting, but v3 makes a point of correcting line refs elsewhere (WC-L1 drops two wrong ones from L0 step 1), and this is the single most load-bearing line in the design's own stated privacy guarantee (§16.2 item 4).

**Fix.** Change the citation to `revealGate.ts:56`. While there, note that `PredictionMode` is exported from this same file at :20 as the three-value union — that is the 'one exported place' §3.3 item 3 refers to widening, worth stating explicitly since `RevealPool.prediction_mode` is typed against it at :23.

## R.ui-reuse — **sound-with-fixes**

**Were the previous findings actually fixed?** Genuinely fixed, verified against code, not reworded: UI-C1 — all five gates confirmed at the exact lines (predictions/route.ts :81 roundStatus, :107 canEdit ternary, :156-168 pool-deadline 403, :190-218 round gates, :231-233 submitted 403), and the mechanism correction is right: predictions/round/route.ts:37-ish 400s before its own flag write, so the review's attribution was wrong and v3 says so. v3 also adds a real original finding the review missed — the accepted-but-dropped save, with the free signal at :274 (`insertedIds.push(...(saved?.inserted ?? []))`) confirmed present and uncompared. UI-H1/CP-H3 — substantive: 40 sites/24 files by my grep vs v3's 41/27, and the lint rule genuinely moved to L2. UI-H2 — verified end to end: rounds/route.ts:37 returns 400 for non-progressive, RoundsTab.tsx:69-80 throws a generic Error and toasts "Failed to load rounds data" discarding the body, and PoolDetail.tsx:996 mounts the tab on usesRoundFlow. UI-H3 — verified exactly: badges.ts:453 lightning_rod, :460 `predictionCount >= 104`, :466 `match.stage !== 'group'`, plus :89-91 and :376. The "grep for the literal 104 and for `stage !== 'group'`" instruction is the right form. UI-M1 — restored and load-bearing: competitionRounds.ts:151-153 requires `stage === 'regular_season' && round_number === n`, so dropping either key does produce empty prediction screens. UI-L1 — verified: ResultsView.tsx:258 is `{stageTab === 'group' && hasGroupResults && (…)}` with hasGroupResults at :150 testing `m.stage === 'group'`; the gate change is correctly named as same-commit work. UI-M3 — closed by §7.4's in-RPC first-save write. Fixed but with a wrong citation: SW-H3 (finding 4) — the decision is right, one of its four evidence sites is bracket-picker-only and unreachable. Partially fixed: UI-M2 (finding 5) — the count is right but assembled from a different file set than the table, and understates rather than overstates. Not fixed, and it is new damage introduced by v3's own SW-H2 fix: finding 1.

v3 is a complete document (1,795 lines, all 19 sections, DDL and phase bodies present) and its UI-reuse architecture claim is honest and holds: the reuse boundary (MatchData / TeamData / EntryScoring plus the six-column pool_entries mirror) is the right one, forking predictions does NOT drag the leaderboard, XP or badges into forking, and the one genuinely unusable component is correctly identified. Its quantitative claims survive independent grep: 40 pool_round_states sites / 24 files (v3 says 41/27), 94 from('matches') (says 95), 46 from('predictions') (says 46), 14 mobile stage files, StandingsTab 629 lines, BaseTeamTable 105 lines. Line citations are accurate to within 1-3 lines across every component I checked. One critical defect: §3.3's reveal fix nulls `state` inside the shared readRoundStates adapter, which makes every league matchweek un-pickable and 403s every save. One high: L13 references 27 modules that §12 does not enumerate — 21 of them exist only in v2.

### [CRITICAL] §3.3's SW-H2 fix nulls `state` inside `readRoundStates` — the single shared adapter every reader uses (§3.4: "the one door"; §3.5: "All route through readRoundStates"). The nulling condition is `lock_at > now()`, which is true of the OPEN matchweek under both D13 branches (one-at-a-time picks the earliest unlocked matchweek; pick-ahead marks every unlocked one 'open'). So no league matchweek ever reaches any consumer with `state='open'`. v3 presents "no new flag threaded through computeReveal" as the virtue of this approach; that rejection is exactly what causes the damage, because the state string is load-bearing for ~40 other readers, not just the reveal gate.

**Failure.** Verified against the reused components. `components/predictions/ProgressivePredictionsFlow.tsx:86` `roundStates.find(rs => rs.state === 'open')` → undefined, so no default round selects. `:159` `isRoundOpen = state === 'open'` → false → `:164` `isReadOnly` true → `:529/:540` pass `onUpdatePrediction={undefined}` and `readOnly`, so every matchweek form is read-only. `:447` `const state = rs?.state ?? 'locked'` → all 38 pills render locked and `:465` gives them `opacity-50 cursor-default`. `:494`/`:547` the Submit bar never renders. `app/api/pools/[pool_id]/predictions/route.ts:196` `if (roundState.state !== 'open') return 403` — the gate §7.2 change 2 explicitly repoints at `readRoundStates` — 403s every save. `app/pools/[pool_id]/admin/MembersTab.tsx` `currentOpenRoundKey` is undefined → `memberStatus` returns 'awaiting' for every member all season. Net: a league pool ships with a prediction screen nobody can type into and a save route that refuses everything. Separately, under D13 pick-ahead (v3's own recommendation) the leak the nulling exists to close cannot occur: future matchweeks are 'open', not 'locked', so `isRoundLocked` (`lib/predictions/revealGate.ts:116-119`) already returns false for them — the nulling is pure loss there.

**Fix.** Do not destroy the state in the shared adapter. Put the league branch in the one consumer that needs it: `computeReveal` already receives `pool` (with `prediction_mode`) and `revealGate.ts:54` is being changed to `usesRounds()` anyway — add a league arm where `isRoundLocked` skips `LOCKED_ROUND_STATES` (`:44`) and uses `isDeadlinePassed(round.deadline, now)` alone. One branch, one file, `deadline` is already `lock_at`, World Cup path still byte-identical, and all forty other readers keep a usable state string. If the reveal gate must stay state-only, the alternative is an extra `reveal_safe boolean` on the adapter row that only the gate reads — but never overwrite `state`.

### [HIGH] L13 tells the implementer to build "The 27 modules of §12", but §12 enumerates only six additions plus the new admin editor. The other 21 exist solely in v2 §9.2, and v3's own header says to keep v2 "for its review text (§R)" — it never tells the reader that §9.2 is still the authoritative work list. The arithmetic is also not a file count: 21+6 double-counts `app/pools/[pool_id]/admin/MembersTab.tsx` (already row 6 of v2's 21, which v3 acknowledges — "v2 listed this file only for ViewPredictionsModal") and treats multi-file rows as one (`RoundsTab.tsx` + `rounds/route.ts`; `app/play/[slug]/*` + `app/tv/[slug]/*`; `admin/MatchesTab.tsx` + `admin/ScoringTab.tsx`).

**Failure.** An implementer working from v3 alone — which is what "supersedes v2 as a design" invites — builds 6 modules and believes the UI phase is done. The 21 unreproduced items include the ones that make the product legible: `PointsBreakdownModal.tsx:812-818` (U1, blank Match Points under a correct total), `lib/poolModeInfo.ts:14` (a league member's Pool Info tab currently reads "All 104 matches…"), `PoolInfoTab.tsx:85,:132` (the whole per-round deadline list hidden), `HowToPlayTab.tsx:32` ("your FIFA World Cup 2026 prediction pool"), `ScoringRulesTab.tsx:268`, `results/MatchCard.tsx:58` (380 rows of "regular_season"), `community/helpers.tsx:304` (verified — the seven-case switch with `default: return stage`), `DashboardClient.tsx:181`, `ProfilePage.tsx:125`. None of these is in v3.

**Fix.** Reproduce v2 §9.2's 21-row table in v3 §12 (or as an appendix §12.6) so the work list is in one document, and state the unit — "27 rows, 31 files" or whatever the reconciled count is. Cheap: it is a copy of a table that already exists.

### [MEDIUM] §12.5 lists "`ProgressivePredictionsFlow`'s round model" as genuinely untouched. The hedge ("round model") is technically defensible, but combined with finding 2 it means the single most member-visible surface has no complete instruction anywhere in v3. The component's form dispatch is a hard binary on the World Cup shape.

**Failure.** Verified at `components/predictions/ProgressivePredictionsFlow.tsx:522` (`selectedRound === 'group'` → `GroupStageForm`) and `:533` (`selectedRound !== 'group'` → `KnockoutStageForm`). Every league matchweek key (`mw_1`…`mw_38`) takes the knockout arm, so a member predicting a 1-1 draw in a Premier League fixture is offered a penalty shootout — v2's U5, which prescribes a `psoApplies` prop gating `KnockoutStageForm.tsx:289` and `:40-46`. v3 never restates it, and a reader of §12.5 alone concludes the prediction flow needs no work at all.

**Fix.** Add one row to §12.1 naming the `:522`/`:533` dispatch and `KnockoutStageForm`'s PSO gate, and narrow §12.5's entry to "`ProgressivePredictionsFlow`'s round-key model and save loop (the form dispatch at `:522`/`:533` is not — see U5)".

### [MEDIUM] SW-H3's fourth cited surface is wrong, and the real one is worse. §7.4 cites `AnalyticsTab.tsx:427-436` ("`if (submittedEntryIds.size < 2) return null` — the whole comparison section vanishes") as evidence that `has_submitted_predictions` is not a UI affordance.

**Failure.** Verified: that block is inside `bpPoolComparison`, whose first line is `if (!isBracketPicker || !isEntrySubmitted || !bpXpBreakdown) return null` (`app/pools/[pool_id]/AnalyticsTab.tsx:425`). `isBracketPicker` is `predictionMode === 'bracket_picker'` (`:150`), so for a `league_pickem` pool the cited code is unreachable — a false positive carried from the review into the design. The actual dependency is broader and more severe: `:142` `const isEntrySubmitted = selectedEntry?.has_submitted_predictions ?? false`, gating `predictionResults` at `:158`, `insights` at `:270` and `:392`. An unflagged league entry therefore gets an entirely empty Form tab, not a missing comparison section. (The other three citations check out: `analyticsHelpers.ts:358` and `:669` are exact.)

**Fix.** Swap the citation to `AnalyticsTab.tsx:142` + `:158,:270,:392` and describe the consequence as "the Form tab renders empty". This strengthens §7.4's decision rather than weakening it — no change to the fix, which is already first-save flag writing inside `save_league_predictions_batch`.

### [LOW] §13's headline count and §13's table are two different sets, and the headline is the weaker artifact. "`grep -l "quarter_final\|round_32" mobile/` returns 14 files" is literally true (verified, 14), but four of those 14 are bracket-only engines a league never reaches — `BracketPickerWizard.tsx`, `lib/bracket/bracketPickerResolver.ts`, `lib/bracket/bracketResolver.ts`, `lib/bracket/tournament.ts` — and two more, `app/pool/[id]/scoring-config.tsx` and `lib/usePoolSettings.ts`, appear in neither the grep rationale nor the table.

**Failure.** The §13 table itself names 15 files plus `usePoolEntries.ts` in prose, so the real repoint set is ≥16 and the "14" understates it — L14's 4–5 days is optimistic, not padded. The omitted `scoring-config.tsx` is mobile's analogue of the admin ScoringTab problem: verified at `:30-33`, `:137-140`, `:169-170` it renders and writes `psoEnabled`/`psoExact`/`psoDiff`/`psoResult` and knockout prices, so a mobile pool admin can set prices for a league pool that the flat league engine (§8.2: `group_*` only, no multiplier, no PSO) will never read.

**Fix.** Drop the grep as the count — let the table be the count — and add `mobile/app/pool/[id]/scoring-config.tsx` + `mobile/lib/usePoolSettings.ts` as rows, gating the PSO and knockout cards off for a league the same way §12's `ScoringTab` row does on web.

## R.completeness — **sound-with-fixes**

**Were the previous findings actually fixed?** Genuinely fixed, not reworded — I checked each against code rather than against the prose. CP-C1: §4 is a real new section, not a paragraph — printed `league_score_events` DDL, a step-numbered orchestrator, a six-row side-effect table with verified caller counts, the `snapshotPoolRanks` ordering correction, and a dedicated phase (L8) sequenced BEFORE the `success:false` edit. I verified the premise at /Users/ryansousa/Documents/GitHub/office-pools/lib/scoring/recalculate.ts:103-112: the league early return does today fire fanOutResultPushes, detectAndPushBadgesForPool and invalidatePoolCache, exactly as claimed. CP-C2: §5 enumerates 18 pg_cron jobs and 7 edge functions with a disposition each; I spot-checked jobids 3/8/15 live — all three ACTIVE with the URLs and schedules stated, and §0.3's dated 22-Aug mw_1 hazard is a new and correct derivation. CP-C3: §7.1 names four creation surfaces, one catalogue loader and both seeders, including the previously-unnamed lazy seed at app/pools/[pool_id]/page.tsx:96-113, with the ordering constraint against the :87 usesRounds repoint. CP-C4: fixed and corrected — the :53 400 does fire before the :76 404. CP-H2: §11 has eleven rows, not four. CP-H3: §3.5 is a mechanically-derived bucketed inventory plus an L2 lint rule (my grep returns 40 sites to v3's 41 — immaterial; the same ±1 applies to matches, 94 vs 95). CP-H4/H5 and CP-M1–M5, CP-L1–L3 all landed as real build items or as recorded decisions (D12/D13/D14). The one v2 finding fixed but under-propagated is CP-H1: NULL prediction_deadline is decided and CHECK-enforced, and §2 enumerates four things the CHECK closes and one thing it costs — but it misses a fifth consequence (finding 3). I also verified two of v3's own load-bearing claims rather than taking them on trust: `lite_recalc_entry` is SECURITY DEFINER with `anon=X` in proacl (v3 is right, and right to escalate it to D11), and `entry_round_submissions.round_key` has no CHECK constraint, so v3's `mw_N` writes are legal. v3 is honest about its evidence.

v3 is complete on the lens I returned needs-rework on. The four completeness criticals are structurally closed, the cron and edge-function surface is real, the write path exists end to end, and §16.1 names its own weakest mechanism. Six silences remain after walking the lifecycle again. Two sit on the critical path of v3's own phase plan: the admin unlock route silently corrupts the league rank tiebreaker v3 has just made load-bearing, and nothing in the design makes a `league_seasons` row a sync target after L1 deletes its `tournaments` row — so L3 can pass its own verification and still never run. One is a new failure created by v3's headline `prediction_deadline` CHECK, in a file that appears in neither v2's 21-module list nor v3's 6 additions. The rest are the `entry_round_submissions` sweep with no owner, the new matchweek notification with no opt-out category, and a blank competition column in the super-admin pool list.

### [HIGH] /Users/ryansousa/Documents/GitHub/office-pools/app/api/pools/[pool_id]/predictions/unlock/route.ts:58-64 unconditionally sets `pool_entries.predictions_submitted_at = null` and `has_submitted_predictions = false` for every prediction mode, and its round-level reset at :76 is gated on the literal `prediction_mode === 'progressive'`. v3 §8.3 makes `predictions_submitted_at ASC NULLS LAST` the fifth key of `league_finalize_totals`' rank cascade, and §7.4 sets it exactly once, on first save, guarded by `.is('predictions_submitted_at', null)`. v3 mentions this route exactly once, at §3.5 line 598, as a `pool_round_states` reader — §7 never covers it, §B.2's widen-these-selects list never includes its `.select('prediction_mode')` at :71, and no phase touches it.

**Failure.** An admin uses the one-click Unlock on a member in matchweek 20 — a routine ADMIN-category action with its own email template. Two outcomes, both wrong. (a) The member never saves again: `predictions_submitted_at` is NULL and they sort last on every tiebreak for the remaining 18 matchweeks; this branch does alarm, since §7.5's third invariant catches it. (b) The member re-picks, which is the entire point of unlocking: the first-save guard sees NULL, re-stamps `now()`, and their tiebreaker becomes a matchweek-20 timestamp instead of their matchweek-1 one. They drop behind everyone they were level with, permanently, and `league_scoring_health` stays green because the column is non-NULL and every total reconciles. Independently, :76's `progressive` literal means `entry_round_submissions` is never reset for a league, so the entry-level flag clears while all 38 matchweek chips still read submitted — unlock is half-applied with no error.

**Fix.** Do not tiebreak on a column an admin route nulls. Change `league_finalize_totals`' fifth ORDER BY key to `(SELECT min(created_at) FROM league_predictions lp WHERE lp.entry_id = pe.entry_id) ASC NULLS LAST`, or add an immutable `pool_entries.first_prediction_at` written by `save_league_predictions_batch` and never cleared. Separately add the route to §7.2's sweep: :76 → `usesRounds(pool.prediction_mode)` reading `readRoundStates`, and widen :71's select to COMPETITION_COLUMNS. Add one §7.5 invariant: the league tiebreak column is monotonic per entry.

### [HIGH] Nothing in v3 makes a `league_seasons` row a sync target. /Users/ryansousa/Documents/GitHub/office-pools/lib/integrations/apiFootball/syncTargets.ts resolves every target from `tournaments` rows carrying `external_league_id`, and the `SyncTarget` type has a required `tournamentId` that the whole sync loop keys on — /Users/ryansousa/Documents/GitHub/office-pools/app/api/cron/sync-fixtures/route.ts:90, :144, :172, :247, :277, :332, :425. L1 step 6 deletes the Premier League `tournaments` row. L3 says only 'League branch in /api/cron/sync-fixtures writing league_fixtures'. v3 names syncTargets.ts once, in §5.1's cron-8 row, purely as evidence that the PL is a live target today; `SyncTarget` and `loadSyncTargets` appear nowhere in v3 or v2. The route already carries `target.format === 'league'` branches at :109 and :115 — that concept dies with the `tournaments` row and v3 does not say so.

**Failure.** L3 is built and passes its own gate, because every L3 verification step ('a replayed payload moves a kickoff', 'a completed fixture writes goals') is driven by a hand-fed payload rather than a real cron tick. Cron 8 then runs every minute against a target list containing only the World Cup: zero league fixtures ever ingest — no kickoffs, no goals, no live status. The L8 drain finds nothing to diff, `league_scoring_health`'s guard clause is `completed_fixtures > 0 AND eligible_entries > 0` so it stays green by vacuity, and the failure first surfaces at L15's browser check, after L4 through L14 have been built on top of it. This is exactly the shape §11's own rule was written for — 'a sweep that processed nothing looks identical to a sweep with nothing to do' — applied to every sweep except this one.

**Fix.** Make `SyncTarget` a discriminated union on CompetitionRef — `{kind:'world_cup'; tournamentId} | {kind:'league'; seasonId}` — and give `loadSyncTargets` a second arm unioning `league_seasons` on `external_league_id IS NOT NULL`, in L3 not L5. Change L3's exit criterion from a replayed payload to: one real cron tick logs the league target by name and reports a non-zero fixture-touch count, with both competitions in the run notes.

### [HIGH] /Users/ryansousa/Documents/GitHub/office-pools/app/pools/[pool_id]/admin/SettingsTab.tsx renders a 'Prediction Deadline' date+time editor unconditionally at :715-770 (the only mode branch is the caption text at :720 and an extra progressive note at :723), and `handleSaveAll` puts the result into a single client-side `supabase.from('pools').update()` at :365 and :369-378, alongside pool name, description, status, accepting_members, privacy, max participants, max entries and entry fee. v3 §2 introduces `pools_league_no_pool_deadline_ck` and calls it 'the highest-value line in this section', enumerating four failures it closes and one cost (the nudges). This is a fifth consequence and it is not named. The file appears in neither v2's 21-module list nor v3's 6 additions. It also carries `POOL_MODE_INFO[pool.prediction_mode as PredictionMode] ?? POOL_MODE_INFO.full_tournament` at :569 — the identical fallback defect v2 flagged at PoolInfoTab.tsx:89 and fixed only there.

**Failure.** A league pool admin opens Settings, renames the pool, closes it to new members, and — because the form invites it — types a date into the Prediction Deadline field. The single UPDATE violates the new CHECK; :378-381 surfaces the raw Postgres message ('new row for relation "pools" violates check constraint "pools_league_no_pool_deadline_ck"') and every other change in that payload is lost with it, with no indication which field caused it. Meanwhile :569's fallback means the Settings mode card describes their league pool as 'One deadline covers the whole tournament. All 104 matches…' — which is what invited the deadline entry in the first place.

**Fix.** Add SettingsTab to §12.1's table with two lines: hide the :715-770 deadline Card when `usesRounds(pool.prediction_mode)`, pointing at the matchweek surface as :723 already does for progressive; and never place `prediction_deadline` in `updatePayload` for a league pool. :569 is fixed for free by v2's poolModeInfo.ts widening — just name this second call site so the grep is done once.

### [MEDIUM] The `entry_round_submissions` lock sweep has no owner. §7.4 prescribes it in one sentence — 'a per-SEASON sweep at matchweek lock … one statement per matchweek per season, 38 total' — and §16.1 correctly flags it as the mechanism with the least prior art. But §11's sweep inventory, which is the design's register of everything scheduled, has no row for it; §14 has no phase that builds it; §7.5's four write-path invariants cover `has_submitted_predictions` but not `entry_round_submissions`; and §10.5's thirteen health assertions never look at it. It is the only prescribed mechanism in v3 with no table row, no phase and no assertion.

**Failure.** The item with no home is the item that does not get built, and nothing in the design notices. §7.4 itself names the four consumers that then read wrong: AnalyticsTab.tsx:427-436 returns null and the whole comparison section vanishes; analyticsHelpers.ts:354-366 drops the member from crowd consensus; :665-677 and :722 under-report pool-wide accuracy; and every per-matchweek submission chip reads 'not submitted' for all 38 weeks for members who picked every game. Every one of those renders a plausible number.

**Fix.** Give it a row in §11 — the per-season matchweek cron proposed in that same table already watches the lock transition, so this is one extra statement in a job that must exist anyway — a line in L11's scope, and a fifth §7.5 invariant: every entry with >=1 league_prediction in a locked matchweek has an entry_round_submissions row for that mw_N with has_submitted = true.

### [MEDIUM] §11's new per-season matchweek-open + lock-reminder cron states no push category and no email topic. Every existing fan-out in this product passes a PushCategory from /Users/ryansousa/Documents/GitHub/office-pools/lib/push/categories.ts:12-20, stored as boolean columns on `push_notification_preferences` and surfaced on the Profile screen; every email passes a TopicKey from /Users/ryansousa/Documents/GitHub/office-pools/lib/email/topics.ts:1-8. Neither file is mentioned anywhere in v2 or v3. This is the only recurring notification a league member receives, and it fires 38 times over nine months.

**Failure.** Two branches, both bad, and the design picks neither. Shipped without a category, the dispatcher has no opt-out column to check and a member receives 38 unmutable pushes across a nine-month season — failing the product's own disclosure gate and its 'no bad feelings' purpose in the one feature designed to be habitual. Shipped silently on PREDICTIONS, a member who muted World Cup deadline reminders in July receives no matchweek lock warnings at all, all season, and no preferences screen anywhere names matchweeks — so the opt-out is invisible in both directions.

**Fix.** State the mapping in §11's new row: POOL_ACTIVITY for the matchweek-open announcement and PREDICTIONS for the lock reminder, matching the existing PUSH_CATEGORY_LABELS copy, with the email arm on TOPICS.PREDICTIONS. If a distinct category is wanted instead, add the push_notification_preferences column and the Profile-screen row to L11's scope explicitly — it is a migration plus a UI row, not free.

### [LOW] /Users/ryansousa/Documents/GitHub/office-pools/app/admin/super/page.tsx:196-201 selects `pools` with an embedded `tournaments(name)`, which resolves to null for every league pool. v3 §7.1 identifies and fixes exactly this defect for the branded-pools GET at branded-pools/route.ts:46-55 ('or the branded-pool admin list shows a blank competition column') and does not fix it for the main super-admin pool list, which is the surface Ryan actually operates from. §6.3 lists app/admin/super/page.tsx:177 as UNAFFECTED — that is the adjacent `matches` query, not this one. The same select is also unbounded against 624 rows, inside the documented 1,000-row PostgREST cap.

**Failure.** Every league pool in the super-admin Pools tab shows a blank competition, so the one operator view that answers 'which pools are on which competition' cannot answer it for the new competition — during exactly the period when league pools are the ones needing attention. At around 1,000 pools the same select begins silently truncating the list.

**Fix.** Apply §7.1's branded-pools remedy to this select too: add `league_seasons(competition_name, season_label)` and collapse both into one display field in PoolsTab.tsx. Page it with .range() in the same commit.

## R.buildability — **sound-with-fixes**

**Were the previous findings actually fixed?** The buildability lens was not one of v2's four named review lenses, so the closest predecessor is R.completeness, which returned needs-rework. Genuinely fixed, verified against code and DB, not reworded: CP-C2 (§5's 18 pg_cron jobs + 7 edge functions is accurate against cron.job, and the vercel.json-is-{} observation is the correct root cause of the earlier "analytics-sweep is a draft" error); CP-C3 (§7.1 names four creation surfaces with real per-line edits — create/route.ts:139, branded-pools:217 and the CreatePoolModal lines at :154/:165/:468/:570 all exist as described); CP-C4 (fixed, with a correct new finding that :53 fires before :76); CP-H4 (both seeders named, and the second one at page.tsx:96-113 is verbatim what the document says, including the seven hardcoded World Cup keys); CP-H2 (all eight sweeps plus edge functions, each with a disposition); CP-H1 (NULL deadline, CHECK-enforced, with the four consequences correctly traced); CP-M1/CP-M2 (converted from silence into recorded decisions D12/D13 — a real fix for a completeness lens, though D13 is one half of my critical #1); CP-M3 and CP-L1/L2/L3 (all closed with grep-derived counts, stated as such). Answered architecturally but NOT schedulably: CP-C1. §4 genuinely solves side-effect ownership — the outbox plus Node orchestrator is the right shape and the four-option comparison is well argued — but the phase that owns it (L8) does not include the badges.ts and match-results.ts league arms without which the owned functions remain no-ops, so the finding is closed in design and reopened in the build order. Acknowledged but still WHAT-without-HOW: CP-H5 (the fixture editor is four sentences against a 1,648-line precedent). Nothing I checked was merely reworded.

v3 is complete (1,795 lines, all 19 sections, DDL and phase bodies present — not a fragment) and its factual base is the strongest of the three drafts: every live claim I spot-checked held (68 teams, 484 matches / 380 regular_season, 624 pools, exactly one state='open' round row, 484 shadow_match_state, crons 3/8/15/19/20/21 active, entryAnalytics.ts:62's narrow select, profile/page.tsx:344 unscoped, the lazy seeder at page.tsx:96-113 verbatim, the live broadcast_pool_leaderboard body emitting exactly six keys so §1.11's two added keys are correct). The architecture is sound and no finding of mine invalidates a structural decision. But on the buildability lens it is not yet a build document: three phases cannot be executed as written (L2's lint gate is unsatisfiable against 182 existing violations with no baseline mechanism; L5 depends on a 95-site inventory that exists only as bucket counts and on a mapping scheduled for L9; L8 verifies two outcomes that depend on L9/L10 deliverables), and one pair of sections is mutually exclusive — §3.3's adapter-level state-nulling makes §7.2's own save gate 403 every league pick. Four SQL objects the drain depends on (league_pools_going_live, league_claim/complete/release_score_events) are signatures without semantics, and the two with real hidden decisions — matchday edge detection and lease expiry — are exactly where a wrong guess is silent. Twelve of the thirteen findings have a one-paragraph or one-clause fix; the thirteenth is publishing an appendix the document says it already produced.

### [CRITICAL] §3.3's reveal fix and §7.2's save gate are mutually exclusive, and the document forecloses the escape hatch. §3.3 item 1 puts the state-nulling inside the adapter: `readRoundStates` "nulls the `state` field for any league matchweek whose `lock_at > now()` before the row leaves the adapter", restated in §3.4 ("League → RPC `league_round_states(poolId)` with the SW-H2 state-nulling applied on the way out"). §7.2 change 2 then routes the save gate through that same adapter: "`:190`'s round lookup goes through `readRoundStates(admin, poolId, ref)`". Verified at app/api/pools/[pool_id]/predictions/route.ts:199 the gate is `if (roundState.state !== 'open') return 403`.

**Failure.** The open matchweek is by definition the one with `lock_at > now()`, so the adapter nulls its state too. A league member saving a pick in the open matchweek hits `null !== 'open'` and gets 403 "Round is not open for predictions" — for every matchweek, all season. This holds under BOTH D13 branches: under one-at-a-time the open matchweek is nulled along with the future 'locked' ones; under pick-ahead every matchweek is 'open' and every one gets nulled. L6's verification ("submit MW1 → 200, then save a pick in MW2 → 200") fails on the first assertion, and the implementer must invent a resolution the document explicitly rejects: "No new vocabulary, no new flag threaded through computeReveal."

**Fix.** Do not null in the adapter. Keep `readRoundStates` returning true state, and apply the transform at the two reveal call sites via an exported mapper in lib/predictions/revealGate.ts — `toRevealRoundStates(rows, ref)` which nulls `state` where `ref.kind === 'league' && lock_at > now()` and is the only thing `computeReveal` ever sees. One function, no new vocabulary threaded anywhere, and the write gates keep reading real state.

### [CRITICAL] L8's verification depends on two L9/L10 deliverables, so the phase cannot pass its own exit criteria. L8 verifies "a completing league fixture produces ≥1 `prediction_result` push" and "a non-empty `entry_xp_state.last_five`". Verified: `detectAndPushBadgesForPool` (lib/push/badges.ts:79) selects `'pool_id, pool_name, tournament_id'` at :83-85 and does `if (!tournamentId) return` at :91 — NULL for every league pool — and it is the writer of `last_five` at :230. Its fix is scheduled in L10 ("the five `badges.ts` fixes"). `fanOutResultPushes` (lib/push/match-results.ts:79) takes NO arguments, scans `.from('matches')` globally with `.is('result_pushes_sent_at', null).limit(50)`, and picks its score table from `isProdScoringEnabled` at :84 — §4.5 schedules that dispatch for "L9/L10".

**Failure.** Run L8 exactly as written and the drain fires two functions that are no-ops for a league pool: no push, no `entry_xp_state` row, no `last_five`. Both assertions fail with nothing to debug, because neither function errors. Compounding it, §4.3's pseudocode calls `await fanOutResultPushes()` inside a "per distinct pool, sequentially" loop — the wrong shape for a global no-arg sweep, so an implementer following it issues N redundant full-table scans. §4.3 also writes `await snapshotPoolRanks(poolIds)` where the real signature (lib/scoring/snapshotRanks.ts:15) is `(admin, poolIds)`.

**Fix.** Move into L8 the two things its verification actually needs: `badges.ts`'s `COMPETITION_COLUMNS` widening + ref dispatch (§8.6 rows 1-2), and a `league_fixtures` arm in `fanOutResultPushes` with a `poolIds`/`fixtureIds` parameter. Leave L10 the XP-semantics and badge-literal fixes. Correct §4.3's two call signatures in the pseudocode block.

### [HIGH] The 95-site fixture disposition — GAP 2, the whole point of §6 — exists only as bucket counts. §6.2 gives 41 UNAFFECTED / 22 REPOINT / 24 BRANCH / 4 REFUSE / 4 DEAD (=95, verified: `grep -rn "from('matches')" app lib mobile components scripts` returns exactly 95). §6.3 then says "Not the whole table" and names roughly 35 sites. §A.1 cites "the commissioned inventory" as the source; no such artifact exists — I checked every file in drafts/ and none carries a bucketed site list.

**Failure.** L5 is booked at 5-6 days against a list the implementer must re-derive and re-adjudicate from scratch for ~60 sites. The BRANCH bucket is the dangerous one: §6.2 defines it as "Needs a league arm *and* a stated behaviour when there is none", and the behaviour is stated for about 8 of the 24. An implementer inventing those 16 behaviours is exactly the silent-wrongness the document exists to prevent — and §6's own examples (dashboard:79 NULL-in-uuid[], pools/page.tsx:125 fails-closed, bulk:88 fails-closed vs the scope:'all' leak) show that near-identical-looking sites have opposite correct answers.

**Fix.** Append the full 95-row table as an appendix: `path:line | bucket | behaviour for a league pool`. The counts prove it was produced; publishing it is the deliverable L5 consumes. Until it is on disk, L5's duration estimate is not defensible either.

### [HIGH] L2's exit criterion is unsatisfiable as written. It ships all three `no-restricted-syntax` confinement rules and verifies "`npm run lint` green with the three new rules". Verified counts today: `.from('matches')` 95, `.from('predictions')` 46, `.from('pool_round_states')` 41 = 182 existing violations. None of the three sanctioned homes exists at L2 — `lib/fixtures/store.ts` is L5, `lib/rounds/read.ts` is L7, the prediction store is L6. next.config.ts sets no `eslint.ignoreDuringBuilds`, so Next's default lint-on-build applies and the build fails.

**Failure.** An engineer reaching L2's verification step finds 182 lint errors and a red build, with no specified way forward. They will either downgrade the rules to `warn` (which defeats "the list cannot grow during the build" — the stated reason for moving them to L2) or sprinkle 182 `eslint-disable` comments, which is a day of undirected work hidden behind one line and which future sites can copy.

**Fix.** Specify the baseline mechanism: ship each rule as an `overrides` block whose `files` glob EXCLUDES an explicit, enumerated list of today's violating paths, and add a CI check asserting the exception list never grows. Restate L2's verification as "lint green; the three exception lists total exactly 182 entries; the no-growth check is wired."

### [HIGH] `league_pools_going_live()` is named in §4.3 with a one-line description ("pool_ids whose next matchweek's first fixture just went live") and no mechanism for "just". The World Cup detects this edge with run-local state — verified at app/api/cron/sync-fixtures/route.ts:276: `if (anyNewlyLive && !someMatchAlreadyLive) snapshotTournamentIds.push(tournamentId)`. A pure SQL RPC on a `* * * * *` schedule has no equivalent, and nothing in the DDL (§1.3 `league_matchweeks`, §1.4 `league_fixtures`, §1.8 `league_fixture_state`) records that a matchweek's snapshot has been taken.

**Failure.** The natural implementation — "the next matchweek's first fixture has status='live'" — stays true for the ~2 hours the fixture is live. `snapshot_pool_ranks` then re-freezes `current_rank → previous_rank` every single minute, so `previous_rank` always equals `current_rank` and every ▲/▼ arrow reads flat for the entire matchday, plus Biggest Climber / Biggest Faller read zero. No error, no log, plausible output — and §10.5's health check compares `pool_entries.previous_rank` to `league_entry_totals.previous_final_rank`, which would agree because both are wrong the same way.

**Fix.** Name the edge explicitly. Either (a) evaluate it against the diff mirror in step 1, before step 2 upserts it: `league_fixtures.status='live' AND league_fixture_state.status IS DISTINCT FROM 'live'` — and state that the step-1-before-step-2 ordering is what makes it work; or (b) add `league_matchweeks.ranks_snapshot_at timestamptz` and have the RPC claim it with `UPDATE … WHERE ranks_snapshot_at IS NULL RETURNING`. Either way, say which.

### [HIGH] The outbox lease has no expiry rule, and `league_claim_score_events(p_cap)` is given as a signature with no predicate. §1.10 documents `claimed_at` as "lease: set by the drain, cleared on failure" and §4.3 says "An unclaimed or released row is simply picked up next tick", but nothing says what reclaims a row whose drain died mid-flight. `attempts` has no stated incrementer, and the claim predicate is not said to exclude `attempts > 5` even though §4.3 specifies "attempts > 5 → alarm, stop retrying".

**Failure.** A drain that crashes between step 3 (claim) and step 5 (complete/release) leaves `claimed_at` set and `processed_at` NULL permanently. The row is never re-claimed, so the push is lost silently — and because `uq_lse_pending` is partial on `WHERE processed_at IS NULL`, the stuck row also blocks `ON CONFLICT DO NOTHING` from ever queueing a replacement event for that `(pool_id, fixture_id, kind)`. L8's own test — "kill the drain for 10 minutes, restart, assert no event is lost and none is double-sent" — fails on exactly this interleaving, and passes or fails depending on when the kill lands, which is worse than failing.

**Fix.** State the claim body: `UPDATE league_score_events SET claimed_at = now(), attempts = attempts + 1 WHERE event_id IN (SELECT event_id FROM league_score_events WHERE processed_at IS NULL AND attempts <= 5 AND (claimed_at IS NULL OR claimed_at < now() - interval '5 minutes') ORDER BY created_at LIMIT p_cap FOR UPDATE SKIP LOCKED) RETURNING *`. Add the stale-lease case to L8's verification as its own assertion.

### [HIGH] The `recalculatePool` edit is described as replacing a block that serves two purposes, and neither v2 nor v3 says to split it. Verified at lib/scoring/recalculate.ts:104 the condition is `if (isLeaguePool || (pool.prediction_mode !== 'bracket_picker' && !(await isProdScoringEnabled(adminClient))))` — the same early return is the World Cup's shadow-cutover path. §8.1 says only "The early return returns `success: false` with an explanatory error", and §4.1 says "v2's S5 fix replaces that block with `success:false` and no side effects".

**Failure.** An implementer replaces the block body and the `prod_scoring_enabled=false` rollback lever — the documented next gate per memory — becomes a hard `success:false` for ~600 World Cup pools with their side-effect pushes deleted. It is inert today only because the flag is `true`, so nothing catches it until the day someone flips it, which is the day they most need it to work.

**Fix.** One sentence in §8.1: "Extract the league arm into its own `if` ABOVE the existing condition and leave the shadow-cutover arm's condition and body byte-identical." Add to L8's verification: `pg`-independent — set `prod_scoring_enabled=false` in a test and assert a `full_tournament` pool still returns `success:true` and still fires the three side effects.

### [MEDIUM] L5 cannot be verified without an L9 deliverable. §6.1's `FixtureStore` interface returns `Promise<MatchData[]>` from four of its five methods, and the `league_fixtures → MatchData` mapping is §9.3 — which L9's phase body lists as its own deliverable ("the fixture/club mappings (§9.3)"). L5's verification requires a synthetic league pool to render `/live` with correct `completed_matches` and `/api/matches/:id/scores` to return 200.

**Failure.** Neither is reachable until the mapping exists, so L5 either slips or the implementer builds the mapping ad hoc in L5 and then finds L9 prescribing it again — with §9.3's specific load-bearing keys (`stage: 'regular_season'`, `round_number`, `home_team_id`) discovered late rather than up front. §9.3 itself warns these omissions are silent: a missing `stage` gives "38 empty prediction screens", a missing `home_team_id` gives "TBD v TBD".

**Fix.** Move §9.3's fixture and club mappings into L5's body and its typed test (`stage`, `round_number`, `match_number`, `home_team_id`, `away_team_id`) into L5's verification. Leave L9 the score-row arm (§9.2) only.

### [MEDIUM] `refresh_league_matchweek_window` and `league_matchweeks_empty_has_no_lock_ck` contradict each other in a reachable state, and §B declares the trigger clean because the audit checks column existence, not constraint compatibility. The CHECK (v2 §1.3, carried unchanged) is `CHECK ((fixture_count = 0) = (lock_at IS NULL))`. The trigger's lock CASE is `lock_at = CASE WHEN mw.lock_at IS NULL OR mw.lock_at > now() THEN agg.first_k ELSE mw.lock_at END`. §B row 15 marks it "CHECKED against §1.3/§1.4" on the basis that the named columns exist.

**Failure.** A matchweek that is already past its lock and then loses its last fixture gets `fixture_count = 0` from the aggregate while the CASE takes its `ELSE` branch and keeps the frozen non-NULL `lock_at` → CHECK violation → the whole statement aborts, rolling back the fixture DELETE that fired it. L3's verification tests precisely this path ("deleting the last fixture of a matchweek zeroes `fixture_count` (the LEFT JOIN correction)") and will raise instead of pass whenever the fixture belongs to a locked matchweek. In production it would abort a sync run.

**Fix.** Pick one and state it: either weaken the CHECK to `CHECK (fixture_count > 0 OR lock_at IS NULL OR lock_at <= now())`, or add `WHEN COALESCE(agg.n,0) = 0 THEN NULL` as the first arm of the lock CASE. Also note in §B that the audit covers alias/column resolution only, so constraint interactions still need a separate pass.

### [MEDIUM] §5.3 misstates what L0 does, in the one section arguing L0 is sufficient. It says: "L0 does not depend on this. L0's protection is deleting the pool (which removes the one `open` row) plus §2's NULL deadline CHECK … Two independent defences." L0's actual three steps are: disable cron jobid 3, disable cron jobid 8, add the `lite_recalc_entry` guard. The pool deletion is L1 step 4. The `prediction_deadline` CHECK is L4.

**Failure.** A reader deciding how much of L0 is urgent — which is the whole framing of §0.3's dated 22 August hazard — is told L0 carries two defences it does not carry. If L1 slips past 22 August (it is scoped at one day but gated on Ryan's D15 decision at step 10), the only thing actually standing between the live database and the `mw_1 → in_progress` flip is a single disabled cron row that anyone can re-enable.

**Fix.** Restate §5.3's bullet: "L0's protection is disarming jobid 3, and that is a single point of failure by design because it is reversible in seconds. The durable replacements are the pool deletion (L1 step 4) and the NULL-deadline CHECK (L4)."

### [MEDIUM] Two named deliverables are WHAT with no HOW, inside phases whose durations assume otherwise. (a) §12.3's super-admin league fixture editor gets four sentences — writes goals/status/is_completed/kickoff, sets `manual_override`, calls `league_rescore_pool`. No route, no list/filter surface, no fan-out shape. Its World Cup analogue app/admin/super/MatchesTab.tsx is 1,648 lines (measured), and L12 packs the editor, the RoundsTab rework and the ScoringTab gating into 3 days. (b) §12.2's `LeagueTable` is "the 20-row standings table (P, W, D, L, GF, GA, GD, Pts), derived in SQL from `league_fixtures`" — no function name, no signature, and the tiebreak rule appears only in passing in §9.5 ("PL tiebreakers are GD then goals scored").

**Failure.** Both are load-bearing and neither can be started from the text. The standings function in particular is a new SQL object that appears in no DDL section, no §B audit row and no phase deliverable list — it exists only as a clause inside a UI bullet, so it is the kind of item that gets discovered on day 4 of a 5-7 day phase. §16.1 already flags L5 and L13 as the likely underestimates; these two are why.

**Fix.** Give the standings derivation a name, a signature and a §B row (`league_standings(p_season_id uuid) RETURNS TABLE (club_id uuid, played int, won int, drawn int, lost int, gf int, ga int, gd int, points int)`, ordered `points DESC, gd DESC, gf DESC, name ASC`). For the editor, name the route and say it reuses the MatchesTab shell, or split L12 into two phases and re-price it.

### [LOW] §3.4's claim "Same seven column names both ways" is true only of the intersection. v2 §3.4's `league_round_states` has a 10-column `RETURNS TABLE` including `match_count`, `completed_match_count` and `matchweek_number`; verified against information_schema, `pool_round_states` has none of those three (its columns are id, pool_id, round_key, state, deadline, opened_at, closed_at, completed_at, opened_by, created_at, updated_at).

**Failure.** Whoever types the unified `RoundState` type must decide what the World Cup arm returns for the three league-only fields. If they default them to 0 rather than leaving them optional/undefined, any consumer that later reads `match_count` gets a confident 0 for all 623 World Cup pools — the silent-empty pattern, on a shared type.

**Fix.** State it: `RoundState` has seven required fields plus three optional league-only ones, and the World Cup arm leaves them `undefined`, never 0.

### [LOW] §3.2 presents the D13 `open` arm as two commented alternatives without stating the knock-on edits. Taking pick-ahead (`WHEN mw.lock_at > now() THEN 'open'`) makes the next CASE arm `WHEN mw.lock_at > now() THEN 'locked'` unreachable and leaves the `o` CTE (and its `ORDER BY lock_at, matchweek_number LIMIT 1` subquery) computed but unused.

**Failure.** Harmless at runtime, but it leaves dead code in the one function whose CASE-arm ordering §3.2 asks the reader to reason about carefully, and a later maintainer reading `WHEN mw.lock_at > now() THEN 'locked'` will reasonably conclude future matchweeks are locked — which is the exact belief SW-H2 was raised to correct.

**Fix.** Print the full post-D13 CASE rather than a two-line diff, with the dead arm and the `o` CTE removed.
