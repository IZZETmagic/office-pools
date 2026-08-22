# Premier League backend — design v3.1

> **Status:** for Ryan, 2026-08-22. Supersedes `2026-08-16_premier_league_backend_design_v3.md`.
> Keep v2 and v3 on disk for their review text; **v3.1 reproduces v3's own review in full as §R-v3
> (historical)** so a reader needs nothing from v1, v2 or v3 to act on this document.
>
> **Round 4 of an audit → design → review loop.** v2 fixed v1's 8 criticals. The second review
> returned 9 criticals and 14 highs, which v3 closed. The **third** review (§R-v3) returned **7
> criticals and 14 highs**. v3.1 applies fixes for all seven criticals, plus two further defects the
> mandated phase-order and guard-rule recheck surfaced. **v3.1 is v3 with those fixes applied — not a
> rewrite.** Every v3 section is carried forward; §0.1 is the changelog.
>
> **Every load-bearing claim was re-verified against live code and the live production database.**
> v3's verification was dated 2026-08-16; the live-state facts in §0.3 are re-verified 2026-08-22.
> Where v3 or a reviewer was wrong, I say so and show the evidence.
>
> **Honest scope, up front: sixteen phases, in a corrected order.** §14. The running order is now
> L0 → L1 → L2 → L3 → L4 → L5 → L6 → **L7 → L9 → L10 → L8** → L11 → L12 → L13 → L14 → L15. Two
> phases (L0, L1) are urgent for reasons that have nothing to do with the Premier League shipping,
> and **§0.4's dated hazard has now fired.**

---

## 0. Scope, and what changed

### 0.1 Changelog — v3 → v3.1

**v3.1 = v3 + seven fixes.** No section of v3 was deleted. §R (v3's third adversarial review) is
carried forward verbatim as **§R-v3 (historical)**, with each of the seven criticals marked CLOSED
and pointed at the section that closes it — the evidence is the point, so it is not summarised away.

| # | Critical (§R-v3) | What was wrong | What v3.1 does instead | Sections changed | Phases moved |
|---|---|---|---|---|---|
| **C1** | L1 step 0's quiescence write matches zero rows | `UPDATE sync_settings … WHERE setting_key='shadow_reconcile_enabled'` matches **0 rows and reports success** — the key does not exist, which §0.3 itself states. So the whole World Cup revert would have run against a live shadow engine. Worse: jobs **18** (`shadow-materialize`) and **21** (`shadow-parity-alarm`) read **no flag at all**, so no `sync_settings` write can reach them, and the prescribed read-back `SELECT shadow_reconcile_matches()` is itself a full writer unless the flag lands first | **Belt AND braces.** L1 step 0 becomes 0a–0d: capture five baseline watermarks; **INSERT** (not UPDATE) the two kill switches plus assert exactly 1 row for `analytics_sweep_enabled`; `UPDATE cron.job SET active=false WHERE jobid IN (18,19,20,21)`; then prove quiescence three ways — behavioural flag read-back **strictly after** the INSERT, a cron-state count, and a 90-second settle window against the 0a baseline. Step 11 reverses all four sub-steps explicitly | §0.3 (job table), §5.1 row 18, §A.3 WC-M4, §14 L1 steps 0 and 11 | none |
| **C2** | L0 installs a guard reading a column that does not exist until L4 | `IF (SELECT league_season_id FROM pools …)` goes into a **live SECURITY DEFINER function 623 World Cup pools call**, two weeks of phases before `pools.league_season_id` exists. PL/pgSQL resolves column refs at first execution, so `CREATE OR REPLACE` succeeds and the first real call raises — and **both** call sites discard the error (`MembersTab.tsx:412` has no error destructure at all), so every World Cup adjustment would land un-re-ranked, silently, on every surface | The guard becomes **permanently column-agnostic**, not temporarily: `IF EXISTS (SELECT 1 FROM public.pools WHERE pool_id = p_pool_id AND prediction_mode = 'league_pickem') THEN RETURN; END IF;`, shipped as `lib/migrations/049_lite_recalc_entry_league_guard.sql`. `EXISTS` over a scalar subquery because the scalar form is three-valued and falls to the World Cup arm for an unknown pool id. **`PERFORM league_rescore_pool(p_pool_id)` is DELETED, not deferred** — `trg_league_adjustment_rescore` (§8.5) already fires on the `point_adjustment` UPDATE both call sites make *before* the RPC, so the PERFORM would rescore the season twice | §10.2, §B rows 7 and 19, §14 L0 step 3 | none — the dependency is **removed**, not moved |
| **C3** | The league drain's push owner can never see a league fixture | §4.3 step 4 called `fanOutResultPushes()`, a **zero-argument global cursor over `matches`** (`match-results.ts:87`), then stamped `league_fixtures.result_pushes_sent_at` unconditionally afterwards — so §10.5's `result_pushes_sent_at IS NOT NULL` assertion certifies a send that never happened, for 38 matchweeks. §4.5 also cited the wrong line (`:84` is the score-table selector; the gate is the cursor) and missed two sites: `:65`, the claim UPDATE that writes the column, and `:471`, a **sixth** score-table mechanism hard-coded to `match_scores` | **Parameterised rewrite in place**, not a fork: a `PushCompetition` descriptor threads through one shared `fanOutForMatch`; `fanOutLeagueResultPushes(admin, fixtureIds)` is driven by the outbox, not a second global cursor. `result_pushes_sent_at` gets **exactly one writer** — `claimLeagueFixture()`, a conditional UPDATE **before** any send — and a new `league_fixtures.result_push_recipients integer` carries the evidence afterwards. The streak reader gets a league arm ordered `(kicked_off_at DESC, fixture_number DESC)`, never `calculated_at` | §1.4a (three columns), §4.3 step 4, §4.5 (**six** mechanisms), §6.1, §6.3, §9.2a, §10.5 | none (L8 moves for C7, not C3) |
| **C4** | `pool_entries.previous_rank` for a league entry has no writer | Three mechanisms cancel: §4.3 step 1 called the World Cup helper, §10.2 contained the function it calls, and `league_entry_totals.previous_final_rank` — the column §8.3 mirrors *from* — was written by nothing in v3. §10.5 asserted equality, so **NULL = NULL certified it green**. Live consumers this kills: every ▲/▼, `broadcast_pool_leaderboard`'s `previous_rank` key (which then **overwrites** correct client values with `null`), Biggest Climber / Biggest Faller, and the entire rank-change push | **A claim, not a detection.** `league_matchweeks.ranks_snapshot_at` + `league_snapshot_matchweek_ranks()` — one statement, three chained data-modifying CTEs: claim every unclaimed matchweek whose first fixture has started, freeze `previous_final_rank := final_rank` for every entry of every pool in those seasons, mirror into `pool_entries.previous_rank` in the same transaction. Idempotent, so a `* * * * *` drain cannot re-freeze the baseline. **`league_pools_going_live()` is DELETED** — with a claim column the "just went live" edge no longer needs inferring | §1.3a, §4.3 step 1, §8.3a, §10.5, §B row 20 | L2 (+1 column), L7 (+1 function), L8 (+1 RPC call, +1 backfill) |
| **C5 + C6** | **One defect, two halves** — the adapter nulls `state`, the save gate 403s on a non-`'open'` state | §3.3 put the SW-H2 fix inside `readRoundStates`, "the one door". The nulling predicate (`lock_at > now()`) is a **superset of the open set under both D13 branches**, so no league matchweek could ever leave the adapter as `'open'`. Measured blast radius: **69 state comparisons across 21 files, 61 of them reachable for a league**. `RoundStateValue` is a non-nullable union, so it could not even be implemented without widening it and pushing a null-check onto all 61. Two surfaces would **throw** (`PoolInfoTab.tsx:149` and mobile `:477` call `.charAt(0)` on it); one would fail **silently** (`RoundStatusCard.tsx:16-27` is an exhaustive switch with no default → `undefined` → the badge vanishes). And §7.2's save gate, routed through the same adapter, would 403 **every save** | **Applied as ONE mechanism: the adapter reports facts, the gate owns policy.** `readRoundStates` always returns the real derived `state`; the league reveal rule lives inside `computeReveal`, dispatched on `pool.prediction_mode`, which is already a required field of `RevealPool` — so there is nothing for a caller to forget. The state-string shortcut is **allow-listed to `progressive`**, not deny-listed against `league_pickem`, so a rounds mode added later fails **closed**. `parsePredictionMode` **throws** rather than defaulting. `RoundStateValue` is **not** widened. `readRoundStates` gains an ordering contract (`deadline ASC NULLS LAST, round_key`), which fixes a pick-ahead consequence the nulling was accidentally masking. And §2 gains `ALTER TABLE pools ALTER COLUMN prediction_deadline DROP NOT NULL` — without it `pools_league_no_pool_deadline_ck` is **unsatisfiable** and the second defence §2 claims does not exist | §2, §3.3, §3.4, §3.5, §7.2, §7.3, §12.1, §B rows 22–23 | `league_round_states` + `lib/rounds/read.ts` move **L7 → L6** |
| **C7** | L8 cannot pass its own exit criteria | L8 verified "≥1 `prediction_result` push" and "a non-empty `entry_xp_state.last_five`" — but `detectAndPushBadgesForPool` early-returns on a NULL `tournament_id` (fixed in L10) and `fanOutResultPushes` cannot see a league fixture (fixed in "L9/L10"). And `last_five` needs **five** deliverables, not two: `getScoringSource`'s third value, both read arms, the fixture mapping, and `entryAnalytics.ts`'s league arm. The prescribed fix — hoisting two `badges.ts` rows into L8 — would split an **append-only, APNs-firing** file across two phases | **Re-order the phases; do not move the dependencies.** Running order becomes **L7 → L9 → L10 → L8**. L7 is already self-contained and now ships `scripts/seed-league-verification-pool.ts`. L9 is pure code and its "asserts non-empty" criterion is satisfiable from L7's scored rows. L10's writers are directly callable, and the provenance test gets **stronger** with no drain built. L8 then finds all four side effects already have league arms, so its exit criteria become satisfiable verbatim. **No phase's duration changes** | §4.3, §4.5, §6.3, §8.1, §8.6 (+`:384` row, + atomicity rule), §14 preamble, §14 L7/L8/L9/L10, §14.1 | **L8 moves to after L10**; L9 and L10 move to immediately after L7 |

**Was any finding refuted?** No critical was refuted, but **two prescribed remedies were rejected and
replaced**, and in both cases v3's underlying shape stands:

1. **C2's reviewer prescribed moving the guard to L4 and keeping `league_season_id`.** Rejected. It
   relocates the identical guard-rule violation one function deeper — `league_rescore_pool` does not
   exist until L7 — and it buys nothing afterwards, because from L4 `pools_league_mode_ck` makes the
   two predicates equivalent **by CHECK constraint**, not by convention. Re-replacing the body of a
   live SECURITY DEFINER function that 623 pools call, to swap one provably-equivalent predicate for
   another, is pure downside. **v3's placement of the guard at L0 stands**; only the predicate
   changes. Corroboration for the mode predicate: the shipped `getScoringSource`
   (`readSource.ts:83-91`) already discriminates league pools by `prediction_mode`, with a comment
   arguing exactly this — "a new league pool is correct the moment it exists, with no operational
   step to forget."
2. **C6's own author rejected their finding's proposed remedy** — an exported
   `toRevealRoundStates(rows, ref)` mapper applied at the call sites — as **fail-open**: it puts the
   privacy rule outside the gate, so a fourth reveal consumer added later leaks by omission and
   nothing in the type system forces the call. C5's remedy (the rule inside `computeReveal`) is
   fail-safe by construction and was taken instead. **§16.2 item 4 stands verbatim** — "the reveal
   gate is decided from the deadline, never from a state string, for a league" — and is now
   implemented where it cannot be forgotten.

**Two further defects fixed, because the mandated recheck commands it** (not among the seven; both
are guard-rule violations already recorded in §R-v3 and left open by v3):

- **§14 L2 created two triggers whose functions read `pools.league_season_id`, a column L4 adds** —
  and one of them, `reject_league_pool_prediction`, sits on the shared, **live** `predictions` table.
  Installed at L2 it would raise on every World Cup prediction write from the first call. Both
  triggers now ship in **L4**, the phase that adds the column. §14 L2 and L4, §B rows 12–13.
- **§B row 6's prescription for `snapshot_pool_ranks` does not fit the function's body.** It says
  "add a `JOIN pools po ON po.pool_id = pm.pool_id` before the conjunct", but the live body has no
  top-level join at all — `pm` exists only inside an `IN` subquery. The join goes **inside the
  subquery**. §B row 6, §10.2.

**Carried forward OPEN, unchanged:** the fourteen highs and seventeen mediums/lows of §R-v3, except
the three the seven fixes dissolve (marked DISSOLVED in place, with a pointer).

**Phase-order and guard-rule recheck:** performed end to end after the changes; the result is
recorded in §14.0. It found the two defects listed above and nothing else.

### 0.2 The decision being implemented (Ryan, 2026-08-15) — unchanged

Every competition gets its own backend structure. The Premier League is built ground-up. The World
Cup backend is frozen and restored — 623 live pools, 286,876 stored score rows, real members still
reading results. The front end reuses the World Cup UI repointed at league data. Predictions fork
into `league_predictions`; `pools`, `pool_members`, `pool_entries` and everything hanging off an
entry stay shared. Premier League only.

### 0.3 Live state, re-verified 2026-08-22 ~01:45 UTC

**Six things changed between v3's verification (16 Aug) and this one (22 Aug), and three of them
change what the plan has to do.** They are marked ⚠.

| | |
|---|---|
| **the season** | ⚠ **STARTED.** Matchweek 1 kicked off 21 Aug 19:00. Fixtures are completing and are being ingested **onto World Cup tables** — `matches` with `stage='regular_season'` |
| `pools` | **624**; `prediction_mode='league_pickem'` = **1** (`c16a9a56-7550-46b6-a58a-8f6b124a8f32`, code PTQPZ797) |
| that pool | ⚠ **RESTORED by its own admin on 21 Aug.** `archived_at = NULL`, `status='open'`, `prediction_deadline = 2026-08-21 18:00:00+00` (**passed**), `tournament_id = b1299174-…` still set, 3 members, 3 entries, **0 predictions** |
| `pool_round_states` in state `'open'` **in the entire database** | ⚠ **ZERO rows.** On 16 Aug there was exactly one — that pool's `mw_1`. Verified 2026-08-22 01:46 UTC it is now `in_progress`. **That is §0.4's dated hazard having fired** |
| `matches WHERE stage='regular_season'` | 380 · `teams` 68 · `tournaments` 2 · `shadow_match_state` **484** (104 WC + 380 PL, already stamped) |
| `sync_settings` | **exactly 16 keys.** `prod_scoring_enabled=true`, `leaderboard_broadcast_enabled=true`, `analytics_sweep_enabled=true`, `pool_cache_enabled=true`, `shadow_rederive_enabled=true`. **No `shadow_reconcile_enabled` key, no `shadow_materialize_enabled` key** — both default to *enabled* in their readers, and an `UPDATE` on either matches zero rows and reports success (this is C1) |
| `cron.job` | **17 rows.** jobid 18 `shadow-materialize` `*/15 * * * *`, 19 `shadow-reconcile` `* * * * *`, 20 `shadow-reconcile-adjustments` `*/2 * * * *`, 21 `shadow-parity-alarm` `*/15 * * * *` — **all four ACTIVE**, all owned by `postgres`. 19 and 20 fired within the last two minutes |
| `lite_recalc_entry` | ⚠ **migration 047 IS APPLIED.** `proacl = {postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}` — `PUBLIC` and `anon` are gone. Still `SECURITY DEFINER`, `proconfig = NULL` (no `SET search_path`), and still **no in-body authz check of any kind**. That check is migration **048**, not yet written |
| the fixture-scored backlog | `SELECT count(*)` over cron 19's own diff predicate returns **0** — the reconciler is fully caught up, and all 380 `regular_season` rows carry a non-NULL `status`. This is why C1's L1 step 5 matters: deleting those 380 `shadow_match_state` rows makes that predicate return **380** |
| triggers on `shadow_entry_totals` | `broadcast_pool_leaderboard_ins` + `_upd`, both `tgenabled='O'` |
| triggers on `pool_entries` | **none** |
| `matches.on_match_completed` | `tgenabled='D'` — disabled |

The Premier League is off the create-pool wizard and off the marketing strip. **The pool is no
longer archived**, so v3's "archiving does not close the hazard" argument has been overtaken by a
sharper one: nothing closes it, and §0.4 records what has already happened.

### 0.4 The thing that was live and dated — it has now FIRED

pg_cron **jobid 3** (`0 0 * * *`, ACTIVE) POSTs a Supabase Edge Function named `auto-submit`
**whose source is not in this repository** — there is no `supabase/` directory at all. Its
`autoSubmitProgressiveRounds` branch selects:

```
pool_round_states .select('id, pool_id, round_key, deadline').eq('state','open').lt('deadline', now)
```

Unbounded, **and not joined to `pools`**. Every World Cup progressive round is `completed` (1,840)
or `locked` (121), so this branch was a zero-row no-op for weeks. v3 predicted: *"the first and only
row it will pick up is the league pool's `mw_1`, at 00:00 UTC on 22 August."*
`ROUND_MATCH_STAGES['mw_1']` is `undefined` → `[]` → `.in('stage', [])` → zero matches → `continue`
for every entry — and then the `UPDATE … SET state='in_progress'` runs *unconditionally* after the
entry loop.

**⚠ It fired.** Verified 2026-08-22 01:46 UTC: `mw_1` is `in_progress`, and there are now **zero**
`state='open'` rows in the entire production database. The prediction was exact. No member data was
harmed only because that pool holds **0 predictions** — the outcome was luck, not containment.

**Archiving the pool did not stop it, because the query never reads `pools`** — and the pool is no
longer archived anyway. Deleting the pool does stop it. **L0 step 1 is still required**, because the
same branch will walk the next `open` row the moment one exists, and because a second matchweek's
row would be created by the very seeders §7.1 deletes.

**A second live hazard, discovered by the C6 verification and not present in v3.** The pool's
`prediction_deadline` (2026-08-21 18:00Z) has now **passed**. `computeReveal`
(`lib/predictions/revealGate.ts:56`) tests `mode === 'progressive'`, which is false for
`league_pickem`, so it falls through to the pool-deadline arm at `:66` and returns
`{revealed: true, scope: 'all'}` — **every member's picks, all 38 matchweeks, to every other
member.** It leaks nothing today for exactly one reason: that pool holds 0 predictions. Three things
close it, in increasing order of durability: deleting the pool (L1 step 4), §2's
`pools_league_no_pool_deadline_ck` (L4), and C6's mode switch inside `computeReveal` (L6). **If L1
slips, deleting the pool is the one-line mitigation** — and it is the same mitigation the first
hazard needs.

### 0.5 What v3.1 carries forward from v2 and v3 unchanged

Kept because a finding did not force a change, and because rewriting a correct decision is how a
design loses the evidence behind it. Everything in v3 that the seven fixes do not name is carried
forward **byte-for-byte**:

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
  (121 stuck rows, postponement deadlock, the 1,000-pool ceiling) is unrefuted and §0.4 has now
  *added* a reason. One consequence is corrected (§3.4).
- **SQL-only scoring, one implementation.** The Node engine is not forked. What changes is that the
  SQL engine now has a Node *orchestrator* in front of it, which is not the same thing (§4).
- **`league_fixtures.matchweek_id` as a hard FK** and `(kicked_off_at, fixture_number)` as the
  chronology pair. v3.1 extends that pair to a sixth reader — the streak detector (§9.2a, C3).
- **`base_points` + `total_points`** column names on `league_match_scores`, the four-value
  `score_type` vocabulary, and the 22-key read-boundary synthesis.

### 0.6 What v3 changed structurally, and the one row v3.1 adds

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
| **11** | **v3.1:** the sixteen phases run in a **corrected order** — L7 → L9 → L10 → L8 — and the side-effect drain owns its own fixture cursor, its own rank-snapshot claim and its own push idempotency key | §R-v3 C3, C4, C7 |

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
| **CP-C2** | v2 is blind to what the crons actually run: jobid 3 posts to an out-of-repo edge function carrying a drifted hand-copy of `lib/auto-submit.ts` | **ACCEPTED.** §5 is the full surface: 18 pg_cron jobs, 7 deployed edge functions, 2 dead repo routes, with a disposition each. §0.4 dates the hazard. Every containment predicate v2 wrote against `lib/auto-submit.ts` is confirmed to be **a no-op in production** |
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
| — | *(v3.1 note)* | The seven criticals of §R-v3 are dispositioned in **§0.1**, not here. §A remains v3's disposition of the **second** review, carried forward unchanged so the audit trail stays readable end to end |
| **CP-H3** | `.from('pool_round_states')` is **41 sites across 27 files**, not ten | **ACCEPTED**, merged with UI-H1. §3.5. The confinement lint rule moves to **L2** |
| **CP-H4** | `seedPoolRoundStates` still writes 38 rows for a league pool; nothing stops the next pool | **ACCEPTED, and it is worse than stated:** §0.4 shows those 38 rows are what the live edge function walks. §7.1 deletes the `league_pickem` branch and `insertLeagueRounds`, makes the function **throw** on a league ref, and deletes the **second, unnamed seeder** at `app/pools/[pool_id]/page.tsx:96-113` in the same commit as the `usesRounds` repoint at `:87` |
| **CP-H5** | No admin path to correct a league fixture, over a 9-month season | **ACCEPTED.** §12.3: a super-admin league fixture editor + `league_fixtures.manual_override boolean` the sync arm respects. This is a real regression against the World Cup's operational position and it is not optional |

### A.3 The mediums and lows — disposed of, not dropped

| # | Finding | Disposition |
|---|---|---|
| WC-M1 | Collapsing `getShadowReadPools` onto `getScoringSource` adds N `sync_settings` round-trips per page | **ACCEPTED.** Keep the collapse; memoize with `React.cache()` and an optional pre-resolved `Set` parameter for batch call sites. L9 verifies "no additional `sync_settings` reads per pool" |
| WC-M2 | L0's read-only CTE cannot verify `score_type`, which is what the substitutions control | **ACCEPTED, reviewer's method taken verbatim.** Prove the substitutions by **equivalence before the edit** — `bool_and(stage_has_scheduled_teams(stage) = (stage='group'))` over `DISTINCT stage`, and the same for `mode_submits_per_round`. Two pure reads. Keep the pricing CTE for base/multiplier/total |
| WC-M3 | `stage_uses_base_prices` omitted from the KEEP list while 046 lists all three as droppable | **ACCEPTED.** §10.4 enumerates all three with a status each, and the same note goes on `046_league_scoring.sql` beside its DO-NOT-RUN header |
| WC-M4 | Crons 19/20/15 armed during the revert steps | ⚠ **v3's disposition was inoperative and is CORRECTED here (C1).** Both `shadow_reconcile_matches` and `shadow_reconcile_adjustments` do read `shadow_reconcile_enabled` — but **that key does not exist**, so v3's `UPDATE` matched zero rows and reported success, and both stayed armed. Two more jobs, **18** and **21**, read no flag at all and cannot be reached by any `sync_settings` write. The scope is also wrong: it is crons **18/19/20/21** plus 15, not 19/20/15. L1 step 0 is now four sub-steps — INSERT the two absent keys, deactivate four `cron.job` rows, and prove quiescence behaviourally — and step 11 reverses all of it |
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
   writer is the out-of-repo `auto-submit` edge function (§0.4). The finding survives; the fix
   target moves, and it moves to a file that is not in this repository.

One reviewer claim I could not reproduce and am recording as *unverified*: `analytics-sweep`'s route
header calls itself a draft with a kill switch defaulting false. The **header is stale** — the flag
is `true` and the job is active. I have not read the route's default-when-absent branch, so if the
key is ever deleted the behaviour is unknown. L10 asserts on the flag's presence, not its default.

---

## B. The guard rule, and the audit that proves it was applied

### B.1 The rule, and the twenty-six-object audit

> **A competition guard may only read columns the relation or SELECT that feeds it actually carries,
> and the parse must throw when they are absent — never default.**

**Eight** instances have now shipped into these designs — four in v1/v2, and **four more in v3
itself**, every one of the latter caught by §R-v3 and closed here:

| # | Instance | Where |
|---|---|---|
| 1 | `recalculate.ts` | v1 |
| 2 | `getScoringSource` | v1 |
| 3 | `broadcast_pool_leaderboard`'s `n.point_adjustment` | v2 |
| 4 | `shadow_detect_diffs`'s `po.` alias | v2 §7.1 |
| **5** | §B row 6 / §10.2 prescribe `snapshot_pool_ranks` an added `JOIN pools po ON po.pool_id = pm.pool_id` "before the conjunct" — **`pm` exists only inside an `IN` subquery**, so the prescription is written against an alias layout the function does not have. The same shape as instance 4, **inside the section written to eliminate it** | v3 |
| **6** | L0 installs a `lite_recalc_entry` guard reading `pools.league_season_id`, a column **L4** adds, into a live SECURITY DEFINER function | v3 (C2) |
| **7** | §10.2's L4 form of the same guard calls `league_rescore_pool`, a function **L7** creates. PL/pgSQL resolves function references at runtime exactly as it does columns | v3 (C2) |
| **8** | L2 creates `assert_league_prediction_pool` and `reject_league_pool_prediction`, both of which read `pools.league_season_id` — **L4**'s column — and the second sits on the shared, **live** `predictions` table | v3 |

**So the audit is now a hard ordering rule, not just a per-site check:**

> **No trigger, function, guard or prescription may be CREATED in a phase earlier than the phase that
> creates every relation, column and function it names.** Where a guard can be written against
> something that already exists (instance 6 → `pools.prediction_mode`), prefer that and remove the
> ordering dependency entirely rather than moving it.

**For v3.1 I re-dumped `pg_get_functiondef` for every function the design touches and checked each
proposed predicate against the aliases actually in scope, and I added a phase column.** Results —
this table is the audit, not a summary of one:

| # | Object v3 modifies | Aliases/columns actually in scope (verified live) | v2's prescription | v3 |
|---|---|---|---|---|
| 1 | `shadow_eligible_entries` | `pool_entries pe`, `pool_members pm`, **`pools po`** | `AND po.league_season_id IS NULL` | **VALID** — one conjunct, as claimed |
| 2 | `shadow_finalize_totals` (`tmp_ft` CTE) | `pool_members pm`, `pool_entries pe`, **`pools po`** | same | **VALID** — one conjunct |
| 3 | `shadow_reconcile_adjustments` (pool select) | `pool_entries pe`, `pool_members pm`, **`pools po`**, `shadow_entry_totals se` | same | **VALID** — one conjunct |
| 4 | `shadow_detect_diffs` — **coverage** subquery | `pool_entries pe`, `pool_members pm`, **`pools po`**, `shadow_entry_totals st` | same | **VALID** — one conjunct. This is the site that would otherwise carry a permanently-red `league_pickem: {live:N, shadow:0}` key |
| 5 | `shadow_detect_diffs` — **mismatch INSERT** | `shadow_entry_totals s`, `pool_entries pe` — **no `pools`, no `pool_members`** | same | **INVALID — DROPPED.** Unresolvable alias. Also unnecessary: the join is INNER and originates at shadow, so absence cannot diff, and with site 3 applied a league entry can never acquire a `shadow_entry_totals` row |
| 6 | `snapshot_pool_ranks(uuid[])` | Live body: `UPDATE pool_entries pe … WHERE pe.member_id IN (SELECT pm.member_id FROM pool_members pm WHERE pm.pool_id = ANY(p_pool_ids))`. **`pe` is the only top-level alias; `pm` is scoped to the `IN` subquery; there is no `pools`** | *not listed in v2*; v3 said "add a JOIN before the conjunct" | ⚠ **v3's prescription CORRECTED (instance 5).** There is no "before the conjunct" — no top-level join exists. **The JOIN and the conjunct both go INSIDE the subquery:** `IN (SELECT pm.member_id FROM pool_members pm JOIN pools po ON po.pool_id = pm.pool_id WHERE pm.pool_id = ANY(p_pool_ids) AND po.league_season_id IS NULL)`. Phase **L4** (needs `pools.league_season_id`). Reached today: `sync-fixtures/route.ts:329-333` passes the league pool's `tournament_id` |
| 7 | `lite_recalc_entry(uuid, uuid)` | Re-verified 2026-08-22: `prosecdef=true`, `provolatile='v'`, `proconfig=NULL` (**no `SET search_path`**), body references `pool_entries`, `match_scores`, `pool_members` and **no `pools`**, and declares **no variables** (no DECLARE block, so no plpgsql column/variable ambiguity) | v3: scalar subquery on `pools.league_season_id`, at **L0** | ⚠ **CORRECTED (C2; instances 6 and 7).** `pools.league_season_id` is **L4** and `league_rescore_pool` is **L7**, so v3's form raises on first call from a function 623 live pools invoke, and both call sites discard the error. v3.1: `IF EXISTS (SELECT 1 FROM public.pools WHERE pool_id = p_pool_id AND prediction_mode = 'league_pickem') THEN RETURN; END IF;` — reads only columns that exist **today**, `EXISTS` because the scalar form is three-valued, `public.`-qualified because `proconfig` is NULL, and `PERFORM league_rescore_pool` **deleted** (§8.5's trigger owns it). Phase **L0**, migration `049`, never revisited |
| 8 | `broadcast_pool_leaderboard()` | transition table `new_rows` = **`shadow_entry_totals`** *or* **`league_entry_totals`**, depending on which trigger fired | emits `n.point_adjustment` | **CORRECTED.** `shadow_entry_totals` has no such column (verified column list). §1.11 uses `COALESCE((to_jsonb(n)->>'point_adjustment')::int, n.total_points - n.match_points - n.bonus_points)`, which is valid against **both** relations |
| 9 | `recalculatePool` league guard | `.select('pool_id, tournament_id, prediction_mode')` at `recalculate.ts:76` | widen to `COMPETITION_COLUMNS` | **CARRIED** |
| 10 | `getScoringSource` | signature `(admin, poolId, predictionMode: string)` — **no pool row** | take a `CompetitionRef` | **CARRIED**; the `predictionMode === 'league_pickem'` line at `readSource.ts:88` is deleted |
| 11 | `enforce_league_prediction_before_lock` | `league_fixtures f` (`is_completed`, `matchweek_id`, `fixture_id`), `league_matchweeks mw` (`lock_at`) | — | **CHECKED** against §1.3/§1.4 DDL. All four columns exist |
| 12 | `assert_league_prediction_pool` on `league_predictions` | `pool_entries pe.member_id` ✓, `pool_members pm.pool_id` ✓, **`pools po.league_season_id` (added §2, phase L4)**, `league_fixtures f.season_id` ✓ | — | **CHECKED**, and the ordering constraint is now **enforced by the phase table**: v3 stated it here and then had §14 create the trigger in **L2**. ⚠ **Moved to L4** (instance 8). Safe: `league_predictions` cannot hold a row until L6. The season-identity check genuinely needs the FK — `prediction_mode` cannot verify that the entry's pool plays *this* season — so unlike row 7 the dependency is real and the phase moves instead |
| 13 | `reject_league_pool_prediction` on **`predictions`** (shared, LIVE, 623 pools) | same three relations as 12 | — | **CHECKED**, ⚠ **moved to L4** (instance 8). This is the dangerous half: installed at L2 it reads `pools.league_season_id` on **every World Cup prediction write** and raises from the first call. Moving it to L4 is the minimum fix. Writing it against `prediction_mode` instead would also work and would remove the dependency (row 7's treatment) — **either is acceptable; L4 is chosen so rows 12 and 13 stay one migration**. What is not acceptable is L2 |
| 14 | `trg_league_adjustment_rescore` on `pool_entries` | `WHEN (OLD.point_adjustment IS DISTINCT FROM NEW.point_adjustment)` — `pool_entries` **has** `point_adjustment` ✓ (verified). Body joins out via `pool_entries.member_id` ✓ | — | **CHECKED.** Note: `pool_entries` currently has **zero** non-internal triggers, so this is the first |
| 15 | `refresh_league_matchweek_window` | `league_fixtures` (`matchweek_id`, `kickoff_at`, `is_completed`), `league_matchweeks` (all five window columns) | — | **CHECKED** against §1.3/§1.4. LEFT JOIN correction carried |
| 16 | `league_round_states(uuid)` | `pools` (`pool_id`, `league_season_id`, `created_at`, `league_start_matchweek`) — the last two added in §2 | — | **CHECKED** |
| 17 | `league_finalize_totals` | `pool_entries` (`point_adjustment` ✓, `predictions_submitted_at` ✓, `member_id` ✓ — all verified in the live column list) | — | **CHECKED** |
| 18 | Analytics-sweep containment | `entryAnalytics.ts:62` selects **`'tournament_id, prediction_mode'`** | *not listed in v2* | **NEW SITE (WC-H1/WC-H3).** Widening this select is a **precondition** of `getScoringSource` taking a `CompetitionRef`. Get the order wrong and the throw kills XP refresh for 623 pools |
| **19** | `lite_recalc_entry` league guard, final form (C2) | Reads `public.pools(pool_id, prediction_mode)` — **and nothing else**. Both columns exist today | *new in v3.1* | **CHECKED.** Phase **L0**. The three pre-existing unqualified relation references are deliberately untouched (behaviour change → 048) |
| **20** | `league_snapshot_matchweek_ranks()` (C4) | `league_matchweeks(matchweek_id, season_id, lock_at, ranks_snapshot_at)` — `ranks_snapshot_at` added §1.3a, **L2** · `pools(pool_id, league_season_id)` — added §2, **L4** · `league_entry_totals(entry_id, pool_id, final_rank, previous_final_rank)` — **L2** · `pool_entries(entry_id, previous_rank)` — today. ⚠ **`pool_entries` has NO `pool_id` column** (verified live) — that is why the mirror joins on `entry_id` | *new in v3.1* | **CHECKED.** Created in **L7**; every relation and column exists by **L4**. Containment is a **join, not a predicate**: only a league entry has a `league_entry_totals` row, so the mirror provably cannot touch a World Cup entry |
| **21** | `claimLeagueFixture()` (C3) | `league_fixtures(fixture_id, result_pushes_sent_at)` — both **L2** (`result_pushes_sent_at` was already in v2 §1.4) | *new in v3.1* | **CHECKED.** Phase **L8**. Sole writer of the column. Modelled byte-for-byte on `claimMatch` (`match-results.ts:60-72`), whose conditional-UPDATE-then-send order is the pattern v3 inverted |
| **22** | `fanOutForMatch` / `fanOutLeagueResultPushes` (C3) | Descriptor-selected score table only (`match_scores` \| `shadow_match_scores` \| `league_match_scores`). The ~200 shared lines read `pool_entries`, `pool_members`, `pools` — all shared, all present today | *new in v3.1* | **CHECKED.** Phase **L8**. The league arm reads **no `sync_settings` key**, so it has no dependency on `getScoringSource` (L9) |
| **23** | `detectAndPushStreak` league arm (C3, §9.2a) | `league_match_scores(entry_id, score_type, total_points, kicked_off_at, fixture_number)` — all **L2** (v2 §1.6) | *not named in v3* | **CHECKED.** Phase **L8**. Ordering is the **pair** `(kicked_off_at DESC, fixture_number DESC)`, never `calculated_at` |
| **24** | `computeReveal` mode switch (C5 + C6) | `RevealPool.prediction_mode` — **already the first required field** of the type (`revealGate.ts:22-26`), so no select widens and no call site changes shape | *v3 put the fix in the adapter instead* | **CHECKED.** Phase **L6**. Allow-list (`mode === 'progressive'`), not deny-list, so an unrecognised rounds mode fails **closed**. `parsePredictionMode` throws rather than defaulting — a default lands on `scope:'all'`, the branch that reveals a whole entry |
| **25** | `predictions/route.ts:190` save gate (C6) | `readRoundStates` rows: `round_key`, `state`, `deadline`. **`state` is a non-nullable `RoundStateValue`** — the whole point of C5 | v3: same read, but the adapter nulled `state` | **CHECKED.** Phase **L6**. `roundKey` required (400 without it); a lookup miss is **404**, not a skip |
| **26** | `readRoundStates` (C5) | League: `league_round_states(uuid)`'s ten columns. World Cup: `pool_round_states`' eleven. The exported `RoundState` is the **seven-column intersection**; the three league-only columns (`match_count`, `completed_match_count`, `matchweek_number`) are optional | v3: nulled `state` on the way out | **CHECKED.** Phase **moved L7 → L6** (C6 E5). Legal: `league_round_states` reads `pools.league_season_id` and `pools.league_start_matchweek` (**L4**) and `league_matchweeks` (**L2**), and L6 > L4 > L2. Rows are ordered `deadline ASC NULLS LAST, round_key` |

**Two general lessons the audit produced, both now rules:**

- A containment conjunct is only writable where a `pools` alias already exists. Where it does not,
  the correct form is either a new join (site 6) or a scalar subquery that names its own relation
  (site 7). "Add one conjunct to each" is not a portable instruction, and stating it as the
  *verification* — as v2 did — makes the verification enforce the bug.
- **Verification restated (v3.1):** *`pg_get_functiondef` diff shows exactly one added conjunct in
  FOUR functions (sites 1–4); one added JOIN plus one conjunct **inside the `IN` subquery** of
  `snapshot_pool_ranks` and **nothing at its top level**; one added leading `IF EXISTS` block in
  `lite_recalc_entry` naming **`prediction_mode`, not `league_season_id`**, and **no
  `league_rescore_pool` call anywhere in it**; and NOTHING in `shadow_detect_diffs`'s mismatch
  INSERT.*
- **Third lesson, from v3's own four failures:** three of them (instances 6, 7, 8) were not wrong
  predicates — they were **correct predicates in the wrong phase**. A per-site alias check cannot
  catch that. That is why the audit table now carries a phase, and why §14.0 re-runs the ordering
  check across all sixteen phases after every change to the plan.

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
| `league_matchweeks` (§1.3) | **+1 column** (§1.3a) — otherwise unchanged, including `UNIQUE (season_id, provider_round)`, stored `lock_at`, and `CHECK ((fixture_count = 0) = (lock_at IS NULL))` |
| `league_fixtures` (§1.4) | **+3 columns** (§1.4a) |
| `league_predictions` (§1.5) | **unchanged** |
| `league_match_scores` (§1.6) | **unchanged** — `base_points` + `total_points`, four-value `score_type` |
| `league_entry_totals` (§1.7) | **+1 column** (§1.7a) |
| `league_fixture_state` (§1.8) | **unchanged** |
| `league_bonus_scores` | **still not created** (v2 §1.9). Confirmed — a table with no writer invites one |
| **`league_score_events`** (§1.10) | **NEW** — the outbox that gives side effects an owner (SW-C1) |

### 1.3a `league_matchweeks` — one added column (C4)

```sql
-- C4: the rank-snapshot CLAIM. Third per-SEASON watermark on a table that
-- already carries open_notified_at and lock_reminder_sent_at (v2 §1.3).
-- Per-season, not per-pool: every pool of a season shares one baseline
-- instant, which is what makes the arrows comparable across pools.
ALTER TABLE league_matchweeks ADD COLUMN ranks_snapshot_at timestamptz;
```

Why a claim column and not a detection predicate: v3 named `league_pools_going_live()` — *"pool_ids
whose next matchweek's first fixture just went live"* — with no body and no definition of *"just"*.
On a `* * * * *` drain the natural predicate stays true for the ~2 hours a fixture is live, so the
baseline would be re-frozen every minute, `previous_final_rank` would always equal `final_rank`,
every arrow would read flat, and **both §10.5 assertions would stay green** — the identical
user-visible outcome as having no writer at all. A claim column cannot do that. §8.3a owns it, and
**`league_pools_going_live()` is deleted from the design.**

### 1.4a `league_fixtures` — three added columns

```sql
-- CP-H5: a 9-month season needs a human override. The sync arm must not
-- silently undo a correction, which is the World Cup's `relinquish` lesson.
ALTER TABLE league_fixtures ADD COLUMN manual_override   boolean NOT NULL DEFAULT false;
ALTER TABLE league_fixtures ADD COLUMN manual_override_by uuid;

-- C3 (SW-C1 evidence column). `result_pushes_sent_at` was already in v2 §1.4
-- with no writer and no reader; §4 gives it both. It is the fixture-level
-- idempotency key for result pushes, written by the CLAIM before any send —
-- exactly as `claimMatch` writes matches.result_pushes_sent_at at
-- match-results.ts:60-72 — and it has EXACTLY ONE WRITER.
--
-- A stamp cannot be its own witness. result_push_recipients is written AFTER
-- the fan-out returns and is what §10.5 actually asserts on:
--   NULL = claimed but the run died mid-flight
--   0    = ran and legitimately found nobody (opted out, no push_token)
--   > 0  = addressed N payloads
-- It counts payloads ADDRESSED, not devices delivered, because a zero inside
-- sendPushToUser (apns.ts:299-311) is legitimate and must not read as failure.
-- This is the minimum durable evidence available: there is no push-audit table
-- anywhere in the schema (verified — sendPushToUser writes no log row), so the
-- review's prescribed "count actual prediction_result push rows" has nothing
-- to count.
ALTER TABLE league_fixtures ADD COLUMN result_push_recipients integer;
```

**Trap, stated here because it is invisible at the call site:** `league_release_score_events` must
**never** clear `result_pushes_sent_at`. The outbox event and the push claim are two different
idempotency keys — the event governs whether the *drain* retries, the claim governs whether
*members* get a second copy of the same result. Clearing the stamp on release converts a retry into
duplicate pushes to every member of every pool that scored that fixture.

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
-- C6: this line is MANDATORY and v3 omitted it. Verified live —
-- pools.prediction_deadline is is_nullable='NO' with no default, and §2's DDL
-- drops NOT NULL on tournament_id ONLY. Without the DROP, the CHECK below is
-- UNSATISFIABLE for any league row, §7.1's "force prediction_deadline = NULL"
-- raises 23502 at insert, and the second defence §2 relies on does not exist.
ALTER TABLE pools ALTER COLUMN prediction_deadline DROP NOT NULL;

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

**And it is now the *second* defence, not the first (C6).** v3 presented the NULL deadline as the
thing that closes `computeReveal`'s `scope:'all'` branch. It does — but only from L4, and only if
the `DROP NOT NULL` above ships with it. The **primary** defence is the mode switch inside
`computeReveal` (§3.3), because that one is a property of the gate rather than of the data, and it
cannot be undone by a route that forgets to pass NULL. The two are independent, which is the point:
if either is bypassed the other still holds. §0.4 records what the absence of *both* looks like on
production right now — a restored league pool whose deadline has passed and which
`computeReveal` therefore reports as `{revealed:true, scope:'all'}`.

**One more consequence nobody named (§R-v3, completeness HIGH).** `admin/SettingsTab.tsx:715-770`
renders a *Prediction Deadline* editor **unconditionally** and `handleSaveAll` writes it in a single
client-side `pools` update at `:365`/`:369-378`, alongside nine other fields. Under the CHECK, a
league admin saving *any* setting takes a constraint violation on all ten. That file is in neither
v2's 21-module list nor §12.1's six additions. It is carried forward as OPEN, and it is the one
§R-v3 finding outside the seven that will bite on the first league admin action after L4.

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

v2's evidence is unrefuted and §0.4 adds to it. Re-verified today: **121 rows across 42 of 281
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

#### The fix v3 prescribed, and why v3.1 does not ship it (C5 + C6)

v3 put the fix **inside the adapter**: *"`readRoundStates` nulls the `state` field for any league
matchweek whose `lock_at > now()` before the row leaves the adapter"*, restated in §3.4 as "the one
door … with the SW-H2 state-nulling applied on the way out". Two reviewers found the same defect
from opposite ends, and they are two halves of one problem:

- **The nulling predicate is a superset of the open set.** Under D13-pick-ahead the `open` arm is
  literally `WHEN mw.lock_at > now() THEN 'open'` — byte-identical to the nulling condition. Under
  D13-one-at-a-time the open matchweek is the earliest one with `lock_at > now()`. **Under both
  branches, no league matchweek can ever leave the adapter carrying `state='open'`.**
- **§7.2's save gate reads that same adapter.** `predictions/route.ts:198-201` is
  `if (roundState) { if (roundState.state !== 'open') return 403 … }`. The row object still exists
  after nulling, so `if (roundState)` is truthy and `null !== 'open'` **403s every save, forever.**

The blast radius was measured, not estimated. `state === '…'` / `state !== '…'` against the four
round-state literals, excluding tests, is **68 comparison sites across 20 files**; adding
`revealGate.ts:118`'s `LOCKED_ROUND_STATES.has(round.state)` Set lookup gives **69 sites across 21
files**, of which **61 are reachable for a league pool** after §7 and §12 repoint. Three
consequences v3 did not see:

1. **It cannot be implemented without widening a shared type.** `app/pools/[pool_id]/types.ts:257`
   is `export type RoundStateValue = 'locked' | 'open' | 'in_progress' | 'completed'` and `:263` is
   `state: RoundStateValue`. Adding `| null` pushes a null-check obligation onto all 61 reachable
   sites — or, under schedule pressure, an `as RoundStateValue` cast that hides the whole thing from
   the compiler.
2. **Two rendered surfaces throw.** `app/pools/[pool_id]/PoolInfoTab.tsx:149` is
   `rs.state.charAt(0).toUpperCase() + rs.state.slice(1)`, and mobile `PoolInfoTab.tsx:477` is the
   same expression with the prop typed `state: string` at `:468`. A null `state` is a TypeError
   during render: error boundary on web, red screen in Expo.
3. **A third surface fails silently, which is worse.** `components/predictions/RoundStatusCard.tsx:16-27`
   is `function getStateBadge(state: RoundStateValue)` — an exhaustive `switch` with **no default**.
   A null returns `undefined`, React renders nothing, the badge vanishes with no error anywhere.
   That is this codebase's documented recurring failure mode, introduced by the fix for a privacy
   bug.

And this is live, not hypothetical: `PoolDetail.tsx:275` already reads
`usesRounds(pool.prediction_mode)`, and `usesRounds` (`competitionRounds.ts:221-223`) already
returns true for `league_pickem` — so `:1449` already mounts `ProgressivePredictionsFlow` and `:996`
already adds the Rounds tab for the one live league pool.

**One correction to the reviewer, for the record:** the `MembersTab.tsx` claim is true only
conditionally. `:87` is `const isProgressive = pool.prediction_mode === 'progressive'`, a literal,
so the `/rounds` fetch at `:103`/`:120` never fires for a league today. The nulling would break it
**again, after** §12.1 repoints `:87` to `usesRounds()` — which is worse, because the file will have
been marked fixed.

#### The mechanism v3.1 ships instead

**One sentence: the adapter reports facts, the gate owns policy.** `readRoundStates` always returns
the true derived `state`; the league reveal rule is expressed **exactly once**, inside
`computeReveal`, as *"a matchweek is revealable only when its deadline has passed"*, ignoring the
state vocabulary entirely. Write gates then read a real `'open'` and work.

This preserves §16.2 item 4 **verbatim** — *"the reveal gate is decided from the deadline, never
from a state string, for a league"* — and it needs no new field on the adapter row and no flag
threaded anywhere, because `computeReveal` **already receives `pool.prediction_mode`** as the first
required field of `RevealPool` (`revealGate.ts:22-26`). The type system already forces every caller
to pass it. There is nothing extra for a call site to forget.

Why deadline-only is exact rather than a hedge: `league_round_states`' fourth output column **is**
`mw.lock_at`, and `lock_at` is the matchweek's frozen first kickoff — the single instant after which
no member can change that matchweek. `revealGate.ts:8-10` states the gate's one hard rule as *never
see picks for a scope they can still change*. `isDeadlinePassed(deadline, now)` **is** that rule,
computed directly instead of inferred from a label.

**Six edits. No DDL, no data migration, no widened `RoundStateValue`.**

1. **`lib/predictions/revealGate.ts` — widen the mode union and add the parser.** Replaces `:20`.
   `PredictionMode` becomes all four values from **one exported place**, and
   `parsePredictionMode(x)` **throws** on an unrecognised string rather than defaulting. Defaulting
   to `'full_tournament'` lands on the `scope:'all'` branch, which is the branch that reveals a
   whole entry — a silent default on a privacy gate is the worst available behaviour.
2. **`lib/predictions/revealGate.ts` — branch on the mode inside `computeReveal`.** Replaces
   `:51-69` and `:117-120`. One boolean, `stateIsAuthoritative`, threads into `isRoundLocked`. Both
   `LOCKED_ROUND_STATES` and `isRoundLocked` are private to this file with exactly one call site
   each (grepped), so the blast radius is this file. Add a `never` exhaustiveness guard on the
   switch.

   **The polarity is the one judgement call here, and it is load-bearing.** Write
   `allowStateString = mode === 'progressive'` — an **allow-list**. Do **not** write
   `deadlineOnly = mode === 'league_pickem'`. A rounds mode added later (a Championship pickem, a
   Showdown league) then defaults to the deadline-only path and fails **closed**. A deny-list would
   default it to the revealing path and fail **open**, silently, on a privacy gate.
3. **The three `computeReveal` consumers** — v3 said two; there are three. `bulk/route.ts:99` and
   `entries/[entry_id]/predictions/route.ts:105` (v3 cited `:106`; off by one) swap the
   `as PredictionMode` cast for `parsePredictionMode(…)`; `scripts/verify-bulk-reveal-gate.ts:137`
   does the same and reads its round states through `readRoundStates` at `:119-122`.
4. **`entries/[entry_id]/predictions/route.ts:108`** — a site v3 does not list and nothing else
   catches. `:108` is `if (mode === 'progressive') { … fetch roundStates … }`. Left as-is, a league
   pool leaves `roundStates` as `[]`, `computeReveal` returns `{revealed:false}` (because
   `roundKeys.length === 0`), and **every non-owner gets a permanent 403** at `:125-134` —
   *"These predictions unlock once the pool closes for everyone"* — including for matchweeks that
   locked in September. Fail-closed, so it is safe, but the member-predictions-visibility feature
   never works for a league and nothing alarms. Change it to `usesRounds(mode)`.
5. **`filterRevealedPredictions`'s third argument becomes a match → round-key map**, not match →
   stage. For a league the key is `'mw_' || matchweek_number`, built from
   `league_fixtures.matchweek_id → league_matchweeks.matchweek_number` — **not** from `matches`.
   `bulk/route.ts:88` is `.eq('tournament_id', pool.tournament_id)`, which for a league pool is
   `.eq(col, null)` → zero rows, HTTP 200. §6.3 already buckets that site as BRANCH and correctly
   notes it fails closed, so it is not a leak — but it is a permanent non-reveal, and the map has to
   come from somewhere real.
6. **`lib/rounds/read.ts` — no nulling, plus an ordering contract.** See §3.4.

**L6 verification, and why v3's version was vacuous.** v3 said: *store an MW38 pick while MW1 is
open, then assert a second member's `/bulk` and `/entries/:id/predictions` contain none of it.*
`/bulk` gets its predictions from `getPoolBulkDataUncached` (`lib/poolData.ts:485-498`), which reads
`.from('predictions')`. A league pool's picks are in `league_predictions`, so `allPredictions` is
`[]` and the assertion **passes because the response contains nothing at all** — the exact
silent-wrongness this document exists to prevent. Three consequences:

- Route `/bulk` through `predictionStore(ref)` **in L6** (the store is already an L6 deliverable),
  presenting league rows as `{match_id: fixture_id, …}` so `gatePoolPredictions`' generic constraint
  is unchanged.
- Build the reveal map per edit 5.
- **Make the verification fail loud:** assert first that member B's `/bulk` contains **≥1** of
  member A's MW1 predictions (proving the pipe carries league rows at all), and only then that it
  contains **none** of the MW38 pick. A test that can only pass by emptiness is not a test.

**Still required, and not replaced by any of this:** §7.2 change 4 — validate that posted
`matchId`s belong to `roundKey`. The reveal gate stops others *seeing* a future pick; it does not
stop one *existing*. Both halves of SW-H2 ship together, in L6.

This is what makes D13 (pick-ahead) safe to take. The two ship together or neither does.

### 3.4 `readRoundStates` — the one door, and it reports facts

```ts
// lib/rounds/read.ts — the only place either shape is read.
// Rows are returned ordered `deadline ASC NULLS LAST, round_key`.
// `state` is ALWAYS a real RoundStateValue. It is never nulled. (C5)
export async function readRoundStates(admin, poolId, ref: CompetitionRef): Promise<RoundState[]>
```

League → RPC `league_round_states(poolId)`, **unmodified on the way out**. World Cup →
`pool_round_states`. Same seven column names both ways. The reveal policy lives in `computeReveal`
(§3.3), not here — an adapter that lies about state to protect one consumer breaks the other 60.

**The ordering contract is not cosmetic**, and it is a D13-pick-ahead consequence that the nulling
was accidentally masking. `app/pools/page.tsx:202-205` and `app/dashboard/page.tsx:279-282` both
compute `openRounds = roundStates.filter(r => r.state === 'open')` and then take
`unsubmittedOpenRounds[0]`, and neither underlying select carries an `ORDER BY`. Under pick-ahead
all 38 unlocked matchweeks are `'open'`, so `[0]` is **arbitrary**: the dashboard card can read
"Matchweek 31" while the member needs Matchweek 2, and `ROUND_LABELS[...] ?? key`
(`page.tsx:211`) falls back to the raw `mw_31`. With the contract, `[0]` is the soonest matchweek —
exactly D13's stated client default. The league arm gets it free by preserving the RPC's
`ORDER BY lock_at, matchweek_number`.

**§3.4's v3 claim "Same seven column names both ways" is true only of the intersection** (§R-v3,
ui-reuse LOW). `league_round_states` returns ten columns including `match_count`,
`completed_match_count` and `matchweek_number`; `pool_round_states` has none of those three. The
adapter's `RoundState` type is the intersection; the three extra league columns are available to
league-only consumers through a widened optional shape. Carried forward as recorded, not fixed.

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

**The `state` string itself has a second, larger inventory, and v3.1 leaves it intact (C5).**
`state === '…'` / `state !== '…'` against the four round-state literals, plus
`revealGate.ts:118`'s Set lookup, is **69 sites across 21 files**, of which **61 are reachable for a
league pool**: `admin/RoundsTab.tsx` (13), `ProgressivePredictionsFlow.tsx` (9), mobile
`ProgressivePredictionWizard.tsx` (8), `RoundStatusCard.tsx` (5), web `PoolInfoTab.tsx` (4), mobile
`PoolInfoTab.tsx` (4), mobile `RoundsTab.tsx` (4), `admin/super/PoolsTab.tsx` (4), mobile
`PredictionsTab.tsx` (2), `predictions/route.ts` (`:93`, `:199`), and one each in
`predictions/round/route.ts:79`, `rounds/route.ts:101`, `admin/pools/[id]/route.ts:130`,
`app/pools/page.tsx:203`, `app/dashboard/page.tsx:280`, `EntriesListView.tsx:100`. The 8 not
reachable: `rounds/[round_key]/state/route.ts` (4, refused for a league), `lib/poolRoundStates.ts:143`
(seeder, deleted in L6), `lib/auto-submit.ts:473` and `advance-teams/route.ts:428` (WC cascade, zero
league rows).

**These 61 sites are the reason `state` must stay a real, non-nullable `RoundStateValue`.** They are
not repointed, not widened and not audited by this design — they simply keep working, which is what
"reuse the World Cup UI" is supposed to mean.

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
| 1 | `fanOutResultPushes` (`lib/push/match-results.ts:79`) | exactly 2 — `recalculate.ts:104`, `:328` | league drain, via **`fanOutLeagueResultPushes(admin, fixtureIds)`** — a sibling entry point over one shared `fanOutForMatch` (C3, §4.5) |
| 2 | `detectAndPushBadgesForPool` (`lib/push/badges.ts:79`) | exactly 2 — `recalculate.ts:107`, `:336` | league drain |
| 3 | `invalidatePoolCache` (`lib/poolData.ts:85`) | exactly 2 — `recalculate.ts:110`, `:343` | league drain (**must** be a request context — it wraps `revalidateTag`) |
| 4 | `snapshotPoolRanks(admin, poolIds)` (`lib/scoring/snapshotRanks.ts:15`) | `sync-fixtures/route.ts:334` — the *caller*, not `recalculatePool` | **NOT reused.** `snapshot_pool_ranks` is containment site 6, so its prod arm updates 0 rows for exactly the pools the drain would pass it, and its shadow arm targets `shadow_entry_totals`, which §10.1 guarantees a league entry never reaches. Replaced by **`league_snapshot_matchweek_ranks()`** (C4, §8.3a) — a claim, not a detection |
| 5 | `pool_entries` mirror + `last_rank_update` stamp (`recalculate.ts:593-621`) | in-transaction | `league_finalize_totals` (§8.3) |
| 6 | `entry_xp_state` write | `badges.ts:221-243` **and** `entryAnalytics.ts:268-278` — **two writers, not one** (WC-H3) | badge path via the drain; the sweep is contained until L10 |

**Verified today: `recalculate.ts:103-112` — the league early return — currently fires 1, 2 and 3.**
v2's S5 fix replaces that block with `success:false` and no side effects, which is why the reviewer
called it a regression against v1. It is.

**#4 is order-sensitive and v2 got it wrong.** The baseline must freeze `current_rank →
previous_rank` **before** the scoring that moves the rank, or ▲/▼ is wrong for that tick. v2 put the
league equivalent in its own pg_cron job, which lets it interleave with the drain. In v3 it is a step
inside one orchestrator run.

**And v3 got it wrong a second way (C4): it named a caller but never wrote a writer.** Verified:
`pool_entries.previous_rank` has exactly **one** writer in the whole database — `snapshot_pool_ranks`
— and zero TypeScript writers (`recalculate.ts:546` says so in a comment). v3's step 1 called that
World Cup helper, §10.2 contained it, and `league_entry_totals.previous_final_rank` — the column
§8.3 mirrors *from* — was written by nothing at all. §10.5 then asserted
`pool_entries.previous_rank = league_entry_totals.previous_final_rank`, which is **NULL = NULL**, so
the health layer certified it green.

Three consumer classes the v3 finding did not name, all verified, and they are why the fix must
target `league_entry_totals.previous_final_rank` rather than the `pool_entries` mirror alone:

- **Realtime.** `broadcast_pool_leaderboard()` emits `'previous_rank', n.previous_final_rank`, and
  §1.11 attaches it to `league_entry_totals` INSERT and UPDATE. `liveMerge.ts:84,96` and mobile
  `usePoolDetail.ts:241` compare it and then **write it into every entry**. An unwritten
  `previous_final_rank` does not leave arrows flat — it **actively overwrites** whatever correct
  value the page fetched with `null`, on the first live broadcast of every matchweek.
- **Superlatives and push.** `leaderboard/route.ts:294-298` (Biggest Climber / Biggest Faller)
  filters on `previous_rank != null`; `match-results.ts:377` is
  `if (me.current_rank == null || me.previous_rank == null) continue` — the entire rank-change push
  ("you overtook X", `:434` `old_rank`) is dead for all 38 matchweeks.
- **Source attribution.** Seven of the thirteen §8.3 readers do **not** read the mirror:
  `poolData.ts:257` overwrites `e.previous_rank` from `readEntryScoring`, whose totals-table arm
  (`readSource.ts:159,176`) reads `previous_final_rank`. So `LeaderboardTab.tsx:789,814,1109`,
  `CommunityTab.tsx:954`, `DesktopSidebar.tsx:384`, `community/helpers.tsx:196-200` and mobile
  `LeaderboardRow.tsx:20` / `LeaderboardPodium.tsx:94` break because of the **source** column, not
  the mirror. Writing `pool_entries.previous_rank` alone would fix the activity feed and fix nothing
  on the leaderboard, the live broadcast or mobile.

§8.3a owns both, in one statement.

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

// 1. SIDE EFFECT 4 — the rank baseline, ordered FIRST. (C4)
//    const { data: frozen, error } = await admin.rpc('league_snapshot_matchweek_ranks')
//    if (error) throw error            // <- THROW, do not push into errors[]
//    One idempotent claim-and-freeze statement (§8.3a). No poolIds argument: the
//    function finds its own unclaimed matchweeks. `league_pools_going_live()` and
//    `snapshotPoolRanks()` are BOTH deleted from this route.
//
//    Why throw where sync-fixtures/route.ts:331-341 swallows: there the snapshot is
//    incidental to the sync; here it is the ONLY writer of previous_final_rank, and a
//    swallowed failure is a silently flat season. Failing the request costs one minute —
//    the cron retries and the outbox holds the backlog.

// 2. RPC league_reconcile_fixtures() -> { scored: n, pools: uuid[] }
//    (pure SQL: advisory lock on hashtext('league_process_queue') — a DISTINCT key from
//     'shadow_process_queue', so the two engines never serialise against each other;
//     diff league_fixtures vs league_fixture_state; league_score_fixture each;
//     league_finalize_totals(affected); upsert the state mirror;
//     INSERT INTO league_score_events (pool_id, fixture_id, 'fixture_scored')
//       ON CONFLICT DO NOTHING)

// 3. RPC league_claim_score_events(p_cap => 40)  -> claimed rows, claimed_at = now()
//    const fixtureIds = [...new Set(claimed.map(e => e.fixture_id))]

// 4a. SIDE EFFECT 1 — pushes, ONCE for the whole claimed set, fixture-scoped. (C3)
//     await fanOutLeagueResultPushes(admin, fixtureIds)
//     Inside, per fixture: claimLeagueFixture(fixtureId) does
//       UPDATE league_fixtures SET result_pushes_sent_at = now()
//        WHERE fixture_id = $1 AND result_pushes_sent_at IS NULL RETURNING fixture_id
//     -> zero rows means already sent; skip. The CLAIM is the idempotency key and it is
//     written BEFORE any send. Nothing else writes that column. After the fan-out returns,
//     league_fixtures.result_push_recipients is set to the count of payloads addressed.
//     NOTE: the route no longer stamps result_pushes_sent_at. v3's post-hoc unconditional
//     stamp is DELETED — it certified a send that never happened.

// 4b. per distinct pool, sequentially, capped:
//      await detectAndPushBadgesForPool(poolId)              // SIDE EFFECT 2
//      invalidatePoolCache(poolId)                           // SIDE EFFECT 3

// 5. RPC league_complete_score_events(ids) | league_release_score_events(ids, err)
//    league_release_score_events MUST NOT clear result_pushes_sent_at (§1.4a trap).
```

Caps follow the existing `CAP=40` / `RECALC_BATCH_SIZE=25` pattern. An unclaimed or released row is
simply picked up next tick — no poison-row special case beyond `attempts > 5 → alarm, stop
retrying`, surfaced by `league_scoring_health`.

`league_snapshot_ranks` as a **separate pg_cron job is deleted.** It becomes step 1 of this route.

**Why step 4a takes an explicit fixture-id list rather than a cursor.** The drain already knows
exactly which fixtures changed. A second global cursor would be a second source of truth, and
`.limit(50)` on a 380-fixture season is a starvation hazard the World Cup never had (104 matches,
never more than 8 completing at once; a league Saturday completes 10 at 17:00 and 5 more by 19:30).
The World Cup entry point keeps its **exact zero-argument signature**, so `recalculate.ts:104` and
`:328` need no edit.

### 4.4 What this changes about the "SQL-only scoring" rule

Nothing. Scoring is still one implementation, in SQL, computed once and stored. The Node layer runs
only things that are *already* TypeScript and already tested, and it holds no scoring logic. The
distinction the house rule cares about — one owner of the numbers — is intact.

### 4.5 Six score-table mechanisms, and the one that is a fixture cursor (C3)

`getScoringSource` is not the only mechanism. Verified: `badges.ts:376` picks by
`isProdScoringEnabled`; `match-results.ts:84` does the same; `recaps.ts:311` and `:123` read
`match_scores` directly; and **`match-results.ts:471` (`detectAndPushStreak`) reads
`.from('match_scores')` hard-coded**, ordered `calculated_at DESC` `.limit(10)`. That is **six**
mechanisms across four files, not five. All of them dispatch on `CompetitionRef`. A league pool that
reads `match_scores` gets an empty array and calls it a legitimate zero — the exact shape of "the RN
home screen's form/accuracy/streak were dead".

**But §4.5's real defect was pointing at the wrong line.** `match-results.ts:84` genuinely is a
score-table selector; it is not the gate. The gate is the `.from('matches')` select at **`:87`**:

```
.from('matches')
.select('match_id, match_number, home_score_ft, away_score_ft, home_team:teams!… , away_team:teams!…')
.eq('is_completed', true).is('result_pushes_sent_at', null).limit(50)
```

`:97-98` is `const matches = (pending ?? []) as unknown as PendingMatch[]; if (matches.length === 0) return`
— silent exit, no error, no log, and `const { data: pending }` discards any PostgREST error. A
league fixture is in `league_fixtures`, so this returns `[]` and the function exits before anything.
**Two further sites v3 and its reviewer both miss:** `:65`, the `.from('matches')` conditional
UPDATE inside `claimMatch` that writes the very column this finding is about, and `:471` above.

**Why it works today and breaks later, which no pre-flight observation of production can catch.**
Production has no `league_*` tables. The 380 Premier League fixtures are in `matches` with
`stage='regular_season'`, one is completed, and its `result_pushes_sent_at` is already NOT NULL. So
`fanOutResultPushes` **sees league fixtures right now**, via `recalculate.ts:104`'s league early
return. L1 (delete the league rows) plus L2 (`league_fixtures`) is what converts a working path into
a silent no-op — **the regression is created by the build.**

**The shape: parameterised rewrite in place, not a parallel file.** Roughly 200 lines of
`fanOutForMatch` — entry→user resolution via `pool_entries`/`pool_members`, pool names, MVP, rank
shake-ups — read only shared tables and are competition-agnostic. Forking them re-creates the
hand-fork whose lesson is already recorded (*"parity is not an oracle"*).

```ts
type PushCompetition =
  | { kind: 'world_cup'; scoreTable: 'match_scores' | 'shadow_match_scores' }
  | { kind: 'league';    scoreTable: 'league_match_scores' }
```

The league arm reads **no flag** — a league pool has exactly one score table — so it makes no extra
`sync_settings` round trip and has **no dependency on `getScoringSource`**. That matters for phase
order: the push league arm does not wait on L9.

**The streak reader (`:471`) and its ordering.** `detectAndPushStreak` takes the descriptor, filters
memberships by competition, and for a league reads `league_match_scores` ordered
**`(kicked_off_at DESC, fixture_number DESC)`** — **not** `calculated_at DESC`. §9.2 already
establishes that pair as the correct chronology for the four narrow readers; nothing in v3 carried
it into the streak reader, and `calculated_at` reorders under any re-score or backfill, which
silently corrupts a streak. Both columns are on `league_match_scores` (v2 §1.6).

**Error discipline, which is part of this fix and not polish.** Every new query destructures
`{ data, error }` and **throws on error**. `const { data } = await …` is how a 400 becomes an empty
array becomes a legitimate-looking zero. The two new `league_clubs` / `league_fixtures` reads use
plain `.in()` lookups rather than a PostgREST FK embed, because `league_fixtures` has **two** FKs to
`league_clubs` (`home_club_id`, `away_club_id`) and an embed would need a constraint-name hint whose
failure mode is exactly a discarded 400 → `null` data → silent early return.

**ESLint decision, made here so the implementer does not have to make it.** L2's rule confining
`.from('matches')` to `lib/fixtures/` will flag `:65` and `:87` the day it lands. **Name
`lib/push/match-results.ts` as a stated exception in §6.1**, with §6.3's new rows as the reason: the
rule exists to stop *fixture reads* proliferating, and a cursor-plus-claim over a push-bookkeeping
column cannot be served by a `MatchData`-returning door. The alternative — adding
`pendingResultPushes(limit)` and `claimResultPushes(id)` to `FixtureStore` — puts a **write** into
an interface §6.1 describes as read-only. Either is defensible; leaving it undecided is not.

---

# GAP 2

## 5. The real cron and edge-function surface (CP-C2)

**`vercel.json` is `{}` — three bytes, no `crons` key. Every scheduled thing in SportPool is
pg_cron + pg_net.** Reading `vercel.json` to decide what is scheduled gives the wrong answer for
every cron in this product, and it is what made a reviewer call the live analytics sweep a draft.

`pg_net 0.19.5`, `pg_cron 1.6.4`, both healthy. ⚠ **`cron.job` holds 17 rows, not 18** — v3 said 18;
re-verified 2026-08-22 it is 17, and the table below is all of them.

### 5.1 pg_cron — all 17, with a league disposition each

| job | schedule | target | league disposition |
|---|---|---|---|
| 1 | `0 * * * *` | edge `send-deadline-reminders` | **inert** — `active=false`. See §5.3 note on re-enabling |
| 2 | `0 20 * * 0` | edge `send-weekly-recap` | **inert** — `active=false`, superseded by 11 |
| **3** | `0 0 * * *` | **edge `auto-submit`** | **HOSTILE AND DATED — see §0.4.** L0 |
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
| **18** | `*/15 * * * *` | `/api/cron/shadow-materialize` | ⚠ **CORRECTED (C1). This job is ACTIVE and it is a third writer into the same tables.** v3 said "leave inert, record why" — verified 2026-08-22, `active = true`, last fired 01:30. Kill switch `shadow_materialize_enabled` is **ABSENT** and the route's guard is `if (enabledRow?.setting_value === false \|\| … === 'false')`, so `maybeSingle()` → null → `undefined === false` is false → **it does not skip**. Every pass it runs `reconcileVersionedBrackets` (unconditional) and `reconcileStaleEntries` (gated on `shadow_rederive_enabled`, which is **true**), and `reconcileStaleEntries` (`shadowBrackets.ts:~850`) calls `admin.rpc('shadow_apply_changes', …)`, whose live body takes `pg_advisory_xact_lock(hashtext('shadow_process_queue'))` and then `shadow_score_match` / `shadow_calculate_bonuses` / `shadow_calculate_bp_bonuses` / `shadow_finalize_totals`. It reads **no `sync_settings` key at all** (verified: `position('shadow_reconcile_enabled' in pg_get_functiondef(...)) = 0`), so **no flag can stop it — only `cron.job.active = false` can.** Both its selectors return 0 rows today, but `shadow_entries_needing_rederive`'s body is built on `shadow_eligible_entries(NULL)`, and **L1 step 7 rewrites `shadow_eligible_entries`** — L1 is precisely the event most likely to flip that selector non-zero mid-revert. Disarmed in L1 step 0c. League needs no equivalent (§4.2 of v2 — the lock precedes first kickoff, so a league prediction can never change after its fixture is scored) |
| 19 | `* * * * *` | SQL `shadow_reconcile_matches()` | reads `shadow_reconcile_enabled`, **absent → TRUE**. Already stamps `shadow_match_state` for all 380 PL fixtures (484 rows verified). Quiesced during L1; unreachable after the fork |
| 20 | `*/2 * * * *` | SQL `shadow_reconcile_adjustments()` | same flag. **Containment site 3** |
| 21 | `*/15 * * * *` | SQL `shadow_detect_diffs()` | **Containment site 4 — coverage subquery only** (§B row 5). ⚠ **Reads no flag either** (C1) — like job 18, only `cron.job.active = false` reaches it. Disarmed in L1 step 0c |

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

**One stated exception: `lib/push/match-results.ts` (C3).** `:65` and `:87` are a conditional-UPDATE
claim and a cursor over `matches.result_pushes_sent_at`, a push-bookkeeping column. The rule exists
to stop *fixture reads* proliferating, and neither of those can be served by a
`MatchData`-returning door — `FixtureStore` is read-only by design. The exception is written into
the rule's `allow` list with §6.3's two new rows cited as the reason, so the next reader does not
have to re-derive it.

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
| **`lib/push/match-results.ts:87`** (C3) | The result-push **cursor**. `.eq('is_completed', true).is('result_pushes_sent_at', null).limit(50)` over `matches`; `:97-98` exits silently on `[]` with the PostgREST error discarded. Works for the Premier League **today** (the 380 fixtures are in `matches`); L1+L2 turn it into a permanent no-op, and §4.3's post-hoc stamp then certified the send that never happened. Named in neither v3 §6.3 nor its review | **REPOINT** — parameterised on `PushCompetition`; league arm is `fanOutLeagueResultPushes(admin, fixtureIds)`, driven by the outbox (§4.5). L8 |
| **`lib/push/match-results.ts:65`** (C3) | `claimMatch`'s conditional UPDATE — the site that **writes** `matches.result_pushes_sent_at` before any send. Cited nowhere in v3 or its review. The league sibling `claimLeagueFixture` is modelled on it exactly | **REPOINT** — L8 |
| **`lib/push/match-results.ts:471`** (C3) | `detectAndPushStreak` reads `.from('match_scores')` **hard-coded**, `calculated_at DESC`, `.limit(10)` — a **sixth** score-table mechanism the `:84` selector does not reach. Zero rows for a league entry → no streak push ever. Also a latent World Cup inconsistency: in shadow mode the rest of the fan-out reads `shadow_match_scores` while streaks read prod | **BRANCH** — league arm on `league_match_scores` ordered `(kicked_off_at DESC, fixture_number DESC)`. L8 |
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

   **C6 — this only works because `readRoundStates` no longer nulls `state`.** v3 routed this gate
   through the adapter *and* had the adapter null `state` for every league matchweek with
   `lock_at > now()`, which is the same predicate as `'open'`. The row object survives the nulling,
   so `if (roundState)` stays truthy and `null !== 'open'` **403s every save for all 38
   matchweeks**. §3.3 fixes it at the source: the adapter returns the real `state`, and the reveal
   policy that motivated the nulling now lives inside `computeReveal`. This line is unchanged from
   v3; what changed is that it is now correct.
3. **`roundKey` becomes required for a rounds pool** — 400 without it. Today `&& roundKey` at `:190`
   means omitting it skips validation entirely.

   **And the lookup fails CLOSED on a miss: 404, not skip.** After
   `readRoundStates(...).find(r => r.round_key === roundKey)` returns undefined, return 404. Today's
   `.single()`-plus-discarded-error path is the fail-open half of the asymmetry in change 2; making
   the miss a 404 aligns this route with the submit route (§7.3) rather than leaving two gates on
   the same table disagreeing about what "no row" means.
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
the v3 change — the drain exists before that edit lands, so the side effects are never orphaned.

**Phase order is load-bearing, and v3.1 restates it correctly (C7).** The `success:false` edit is
owned by **L8**, and L8 now runs **after L10** (§14 preamble). Until L8 lands, `recalculate.ts:104`'s
league early return keeps firing `fanOutResultPushes`, `detectAndPushBadgesForPool` and
`invalidatePoolCache` exactly as it does today — that is deliberate, it is the v1 behaviour the
reviewer was right to defend, and L7, L9 and L10 must all leave it alone. Phrasing it as v3 did
("L8 ships before L7's `success:false` edit") reads as though L7 owns the edit; it does not.

**A second thing §8.1 must say and did not (§R-v3, buildability HIGH).** The block at
`recalculate.ts:104` is `if (isLeaguePool || (pool.prediction_mode !== 'bracket_picker' && !(await isProdScoringEnabled(adminClient))))`
— **the same early return is also the World Cup's shadow-cutover path.** Replacing the whole block
with `success:false` would refuse every non-bracket World Cup pool while `prod_scoring_enabled` is
false. The edit **splits** the condition: the league arm returns `success:false`; the shadow arm is
left byte-identical. Carried forward as an explicit L8 instruction.

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

### 8.3a `league_snapshot_matchweek_ranks()` — the ONE owner of `previous_final_rank` (C4)

The single writer of the rank baseline and of its `pool_entries` mirror. SECURITY DEFINER, pinned
`search_path`, EXECUTE to `service_role` only. **One statement, three chained data-modifying CTEs.**
Returns the number of totals rows frozen.

```sql
CREATE OR REPLACE FUNCTION league_snapshot_matchweek_ranks() RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
WITH claimed AS (
  -- (1) CLAIM. Every unclaimed matchweek whose first fixture has started.
  --     Reads league_matchweeks(matchweek_id, season_id, lock_at, ranks_snapshot_at) ONLY.
  UPDATE league_matchweeks mw
     SET ranks_snapshot_at = now()
   WHERE mw.ranks_snapshot_at IS NULL
     AND mw.lock_at IS NOT NULL
     AND mw.lock_at <= now()
  RETURNING mw.matchweek_id, mw.season_id
),
frozen AS (
  -- (2) FREEZE. previous_final_rank := final_rank for every entry of every pool
  --     in a claimed season. Diff-aware, so unchanged rows never reach
  --     broadcast_pool_leaderboard's transition table.
  UPDATE league_entry_totals t
     SET previous_final_rank = t.final_rank
    FROM pools po
   WHERE po.pool_id = t.pool_id
     AND po.league_season_id IN (SELECT DISTINCT season_id FROM claimed)
     AND t.previous_final_rank IS DISTINCT FROM t.final_rank
  RETURNING t.entry_id, t.previous_final_rank
)
-- (3) MIRROR, same transaction. Joined on entry_id, NOT through pool_members.
UPDATE pool_entries pe
   SET previous_rank = f.previous_final_rank
  FROM frozen f
 WHERE pe.entry_id = f.entry_id;
$$;
```

**Four decisions inside it are load-bearing.**

- **The claim and the freeze are ONE statement.** A matchweek can never be marked claimed without
  its baseline being written, and calling the function every minute is idempotent. This is what
  kills the re-freeze failure mode that `league_pools_going_live()` would have had: on a
  `* * * * *` drain, a "just went live" predicate stays true for the ~2 hours the fixture is live,
  so the baseline would be re-frozen every minute, `previous_final_rank` would always equal
  `final_rank`, and **both §10.5 assertions would stay green while every arrow read flat.**
- **The freeze carries `AND t.previous_final_rank IS DISTINCT FROM t.final_rank`.** §8.3 and §1.11
  both depend on unchanged rows never reaching `broadcast_pool_leaderboard`'s transition table;
  without the conjunct the snapshot fires a no-op leaderboard broadcast to every pool of the season.
  With it, the one broadcast that *does* fire carries the new flat baseline to live clients, which
  is correct and wanted.
- **The mirror joins on `entry_id`, not through `pool_members`.** GUARD RULE: **`pool_entries` has
  no `pool_id` column** (verified live) — that is exactly why `snapshot_pool_ranks` detours through
  `pool_members`. Joining `league_entry_totals` on `entry_id` is simpler *and* structurally
  contained: only a league entry has a totals row, so the statement provably cannot touch a World
  Cup entry. **The containment is a join, not a predicate**, which is the strongest form available.
- **It does NOT stamp `last_rank_update`.** That column means *the rank moved*, and it is the sole
  change-detector for cron 15 (`analytics-sweep/route.ts:73-78`). §8.3's mirror stamps it when ranks
  actually move. Stamping it at snapshot time would pull every league pool into the sweep before a
  single score changed.

**Relations it reads, per the guard rule** (§B row 20): `league_matchweeks(matchweek_id, season_id,
lock_at, ranks_snapshot_at)` — `ranks_snapshot_at` added in §1.3a, **L2**; `pools(pool_id,
league_season_id)` — added in §2, **L4**; `league_entry_totals(entry_id, pool_id, final_rank,
previous_final_rank)` — **L2**; `pool_entries(entry_id, previous_rank)` — exists today. It names no
column it does not read, and every column exists by **L4**; the function is created in **L7**.

**One-time backfill, executed in L8 BEFORE the cron is armed:** set
`league_matchweeks.ranks_snapshot_at = lock_at` for every matchweek whose `lock_at` is already past
at the moment the drain goes live, so the first tick does not retro-freeze a season's worth of
baselines into one instant. Then call the function once and assert it returns 0.

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

### 8.6 XP and badges — SIX defects in one file, not three (S2, S7, UI-H3, C7)

| Line | Defect | Fix |
|---|---|---|
| `badges.ts:89-91` | `.select('pool_id, pool_name, tournament_id')` then `if (!tournamentId) return`. NULL for every league pool | Widen to `COMPETITION_COLUMNS`, take a `CompetitionRef`, delete the guard. `:132-135` fetches `league_fixtures` instead |
| `badges.ts:376` | `isProdScoringEnabled ? 'match_scores' : 'shadow_match_scores'` — a **third** score-table mechanism | Dispatch off the same `getScoringSource(ref)` as everything else (§4.5) |
| `badges.ts:453` | `lightning_rod` = `predictionCount >= matches.length`; `matches` empty → **everyone earns it after their first matchweek** | Denominator = the season's fixture count |
| **`badges.ts:460`** | `if (predictionCount >= 104) earnedIds.push('stadium_regular')` — a World Cup literal, no competition scope. A league member crosses it around **matchweek 11 of 38** | Same denominator |
| **`badges.ts:466`** | `if (match && match.stage !== 'group') earnedIds.push('showtime')` — "Correct exact score in a knockout match", 80 XP, Gold. A synthesised `regular_season` is not `'group'`, so **the first league exact score awards it** | Positive knockout test |
| **`badges.ts:384`** (C7 — **sixth row, unlisted in v3**) | `.from('predictions').select('prediction_id', {count:'exact', head:true}).eq('entry_id', entryId)`. For a league entry this counts **zero forever**, so `lightning_rod` and `stadium_regular` are **never awarded all season** — silent, plausible, and in the **opposite direction** from `:453`/`:460`. Two defects on the same two badges cancelling in different directions is precisely the state in which a spot-check looks fine | Route through `predictionStore(ref).countForEntry(entryId)` |

**Both new rows write to `badge_unlocks`, which is append-only (`:254-272`), and each unlock fires an
APNs push (`:309`).** They are wrong awards that cannot be withdrawn and that actively notify the
member — strictly worse than the `xpSystem` copies, whose output is recomputed each run.

**ATOMICITY RULE (C7): all six `badges.ts` lines and both `xpSystem` inversions ship in ONE commit,
in L10, and `badges.ts` is never split across phases.** The review proposed hoisting rows 1–2 into
L8 to make L8's exit criteria satisfiable. That is unsafe: the moment row 1 lands (guard deleted,
`:133` reading `league_fixtures` whose synthesised `stage` is `'regular_season'` per §9.3),
`computeBadgeState` awards `showtime` on the **first** exact score at `:462-467`. Those ids are
written to `badge_unlocks` at `:258-272`, which is append-only, and **that write happens BEFORE the
`if (!snapshot?.seeded) return` first-run guard at `:278`** — so pollution lands on run one even
when the push is suppressed, and on run two `:287-308` fires an APNs push per new badge. Splitting
this file across two phases converts a code defect into an irreversible member-facing one. §14
solves L8's exit criteria by **re-ordering the phases** instead (L7 → L9 → L10 → L8).
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

### 9.2a The streak reader's chronology (C3)

`readMatchScores`' four narrow readers order on the pair `(kicked_off_at DESC, fixture_number DESC)`
(§9.2). **`detectAndPushStreak` (`lib/push/match-results.ts:471`) is a fifth reader and v3 did not
carry the pair into it.** Its World Cup body is `.from('match_scores')` — hard-coded, not routed
through any selector — ordered `calculated_at DESC` `.limit(10)`.

For a league it reads `league_match_scores` and it **must** order
`(kicked_off_at DESC, fixture_number DESC)`. `calculated_at` is a write timestamp: it reorders under
any re-score, any `league_rescore_pool` after an admin fixture correction (§12.3), and any backfill
— and a reordered streak is silently wrong rather than empty, which is the failure class this
document is organised around. Both columns are on `league_match_scores` (v2 §1.6).

The same line is a latent **World Cup** inconsistency worth recording: in shadow mode the rest of
the fan-out reads `shadow_match_scores` while streaks read prod. Not fixed here — it is a World Cup
question, and this document freezes the World Cup backend — but named so it is not re-derived.

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
| **`lite_recalc_entry`** (WC-C2) | SECURITY DEFINER, no pool/mode/archive predicate. Called from the browser at `admin/MembersTab.tsx:412` and from `mobile/components/pool-detail/AdjustPointsSheet.tsx:162` after every adjustment. On a league pool `match_scores` is empty so tiebreakers 2 and 3 collapse to 0 for everyone, and it re-ranks on `created_at`; it also **overwrites** `scored_total_points` with `0 + 0 + adjustment`. §7.5's totals-only health check stays green while the ranks are wrong. ⚠ **Two v3 facts are now stale (re-verified 2026-08-22).** (a) Migration **047 is applied** — `proacl` is `{postgres, authenticated, service_role}`; `PUBLIC` and `anon` are gone. It is still SECURITY DEFINER with **no in-body authz check** (that is 048). (b) v3 said the league pool is blocked *"only by `member_pool_writable` on the archived pool"* — **the pool was restored by its own admin on 21 Aug**, `archived_at = NULL`, so that block is gone and the hazard is live right now | **See below — the predicate changed (C2).** |

**The `lite_recalc_entry` guard, in full (C2).** v3 prescribed
`IF (SELECT league_season_id FROM pools WHERE pool_id = p_pool_id) IS NOT NULL THEN PERFORM league_rescore_pool(p_pool_id); RETURN; END IF;`
and scheduled it in **L0**. Both halves are wrong, and both are guard-rule violations:

- **`pools.league_season_id` does not exist until L4** — roughly two weeks of phases later.
  PL/pgSQL resolves column references at plan time on first execution, so `CREATE OR REPLACE`
  succeeds and the **first real call** raises `column "league_season_id" does not exist`. L0's
  verify is `pg_get_functiondef` text inspection plus two cron reads plus a row count — **nothing in
  L0 executes the function.** And both call sites swallow the error: `MembersTab.tsx:412` is
  `await supabase.rpc(...)` with **no error destructure at all**, followed immediately by a green
  success toast; `AdjustPointsSheet.tsx:162-169` `console.warn`s it. So from L0 to L4 every
  adjustment on all 623 World Cup pools would land un-re-ranked, invisibly, on both surfaces.
- **`league_rescore_pool` does not exist until L7** (`SELECT count(*) FROM pg_proc WHERE proname='league_rescore_pool'` = 0).
  PL/pgSQL resolves function references at runtime exactly as it does columns, so the reviewer's
  prescribed "swap it in L4" relocates the identical defect one function deeper — a **fifth**
  instance of the guard-rule violation, in the same live function.

**The predicate v3.1 ships, once, at L0, never touched again:**

```sql
-- lib/migrations/049_lite_recalc_entry_league_guard.sql
-- (048 is reserved by 047's own header for the in-body authz check — D11.)
IF EXISTS (
  SELECT 1 FROM public.pools
  WHERE pool_id = p_pool_id
    AND prediction_mode = 'league_pickem'
) THEN
  RETURN;
END IF;
```

Four reasons this is the right shape, each verified:

1. **It reads only `public.pools(pool_id, prediction_mode)`** — both exist today. The phase-ordering
   dependency is **removed**, not moved.
2. **`EXISTS`, not a scalar subquery.** The scalar form is three-valued: for a `p_pool_id` matching
   no row it evaluates to NULL, PL/pgSQL treats `IF NULL` as false, and the World Cup arm runs.
   Verified: `((SELECT prediction_mode FROM public.pools WHERE pool_id='00000000-…') = 'league_pickem') IS NULL`
   → **true**, whereas the same `EXISTS` returns **false**. Same outcome today; `EXISTS` is
   boolean-total, so no future reader has to reason about it.
3. **`public.` qualification** because `lite_recalc_entry` has `proconfig = NULL` — no
   `SET search_path` — so its search_path is the caller's. The three existing unqualified references
   (`pool_entries`, `match_scores`, `pool_members`) are **deliberately left alone**: qualifying them,
   or adding `SET search_path`, is a behaviour change to a live function and belongs in 048.
   Minimum diff.
4. **It is permanent, not a stand-in.** From L4, §2's
   `pools_league_mode_ck CHECK ((league_season_id IS NULL) = (prediction_mode <> 'league_pickem'))`
   makes the mode and the FK equivalent **by database constraint**. Re-replacing a live SECURITY
   DEFINER function's body to swap one provably-equivalent predicate for another is pure downside.
   If that CHECK is ever widened to admit a second league prediction mode, widen this list in the
   same migration. Precedent: `lib/scoring/readSource.ts:83-91`, the shipped `getScoringSource`,
   already discriminates league pools by `prediction_mode` and its comment argues exactly this.

**`PERFORM league_rescore_pool(p_pool_id)` is DELETED from the design, not deferred.** Both call
sites `UPDATE pool_entries.point_adjustment` with the user's own client **before** calling the RPC
(`MembersTab.tsx:404-407`, `AdjustPointsSheet.tsx:153-160`), and §8.5's `trg_league_adjustment_rescore`
is `AFTER UPDATE OF point_adjustment … WHEN (OLD.point_adjustment IS DISTINCT FROM NEW.point_adjustment)`.
The trigger already fires the rescore on that UPDATE; the PERFORM would rescore the season **twice**.
Nothing is lost — an adjustment whose ledger total is unchanged does not fire the trigger and does
not need a rescore either. Deleting it also **dissolves** §R-v3's silent-wrongness MEDIUM
("anon-reachable unbounded re-score") rather than deferring it behind D11. **D11 still stands on its
own merits**: 047 removed the reachability, 048 still owes the in-body check.
| **`snapshot_pool_ranks`** | ⚠ **v3's description of the body is wrong, and so is the fix it prescribes** (§R-v3, wc-safety MEDIUM; corrected here under the guard rule). The live body has **no top-level join at all**: `UPDATE pool_entries pe SET previous_rank = pe.current_rank WHERE pe.member_id IN (SELECT pm.member_id FROM pool_members pm WHERE pm.pool_id = ANY(p_pool_ids));`. `pm` exists **only inside the `IN` subquery**, so "add a `JOIN pools po ON po.pool_id = pm.pool_id` before the conjunct" has nowhere to go — the same shape as the WC-H2 defect §B exists to eliminate. Reached today because `sync-fixtures/route.ts:329-333` selects pools `.in('tournament_id', snapshotTournamentIds)` and the league pool still carries the PL `tournament_id`, so the moment a PL fixture goes live whatever garbage `current_rank` holds is copied into `previous_rank`. Cannot fail loudly | **The join goes INSIDE the subquery:** `… WHERE pe.member_id IN (SELECT pm.member_id FROM pool_members pm JOIN pools po ON po.pool_id = pm.pool_id WHERE pm.pool_id = ANY(p_pool_ids) AND po.league_season_id IS NULL)`. One added JOIN and one added conjunct, both inside the subquery, nothing at top level (§B row 6). Lands in **L4**, where `pools.league_season_id` exists |
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
  ⇒ AND, because NULL = NULL would certify the C4 defect green:                -- C4
       every league_matchweek with lock_at <= now() has ranks_snapshot_at NOT NULL
       AND, for every pool of a season with >=1 claimed matchweek and >1 entry,
       count(*) FILTER (WHERE previous_final_rank IS NOT NULL) = eligible_entries
  ⇒ at most one matchweek 'open'; at least one whenever an unlocked
       matchweek exists at or after the pool's start                       -- SW-L1
  ⇒ no entry has league_predictions in a locked matchweek with zero
       league_match_scores rows                                            -- S4
  ⇒ every completed fixture has result_pushes_sent_at IS NOT NULL          -- SW-C1 (claim)
  ⇒ AND result_push_recipients IS NOT NULL for every such fixture          -- C3 (evidence)
       NULL here = claimed but the run died mid-flight. 0 is legitimate
       (everyone opted out / no push_token) and must NOT read as failure;
       it is NULL, not 0, that is the alarm. The stamp alone cannot be its
       own witness, which is what made v3's version certify a send that
       never happened.
  ⇒ zero league_score_events with attempts > 5                             -- outbox poison
  ⇒ the four §7.5 write-path invariants
```

That is **fifteen** assertions, not thirteen (C3 + C4 each add one). L8's exit criterion says
"green on all thirteen"; it is now **fifteen**.

Run as a Vitest fixture in CI **and** as a pg_cron alarm. It checks *results, not code paths*, which
is why it catches readers nobody thought of — but it is **blind to the reveal leak (§3.3) and to
mobile (§13)**, and the design should not pretend otherwise. C3 and C4 are both cases of an
assertion that was *present in v3 and structurally incapable of failing*: `NULL = NULL` for the rank
mirror, and a stamp written by the same step that was supposed to be proving itself. **An assertion
that cannot fail is worse than a missing one**, because it occupies the slot.

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
| `autoSubmitDraftEntries` (`auto-submit.ts:103`) | **the edge function**, not the repo route | §0.4 | **Closed by §2's NULL deadline CHECK** (works against the edge copy too) + `.is('league_season_id', null)` + logged skip in the repo copy + §5.3's retirement |
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

**The sixteen phases are unchanged in name, scope and duration. Three of them changed position
(C7).** The running order is:

> **L0 → L1 → L2 → L3 → L4 → L5 → L6 → L7 → L9 → L10 → L8 → L11 → L12 → L13 → L14 → L15**

The numbers are not renumbered, because each name is bound to its work and renumbering would break
every cross-reference in §§1–13. **L8 sits between L10 and L11 in this document**, where it runs.

**Dependency order, restated (C7):**

- **L4 must precede L5.**
- **L4 must precede any guard that reads `pools.league_season_id`** — which is why the two league
  triggers of §B rows 12–13 moved out of L2 (§B.1, instance 8).
- **L6 must precede L7's verification**, because `league_round_states` and `lib/rounds/read.ts`
  moved into L6 (C6 E5).
- **L7 must precede L9**, because the read arms have nothing to return until a matchweek has been
  scored — and L7's synthetic matchweek is what gives L9's "asserts non-empty" criterion something
  to assert on.
- **L9 must precede L10**, because `entry_xp_state.last_five` is produced by
  `computePoolEntryAnalytics`, which needs `getScoringSource`'s third value, both read arms and the
  `league_fixtures → MatchData` mapping — all L9.
- **L10 must precede L8**, because L8's exit criteria name a `prediction_result` push and a
  non-empty `last_five`, and until L10 lands `detectAndPushBadgesForPool` early-returns on a NULL
  `tournament_id`.
- **L8 has no successor dependency at all.** Nothing in L9 or L10 calls the drain;
  `writePoolEntryAnalytics(admin, poolId)` and `detectAndPushBadgesForPool(poolId)` are both
  exported and directly callable. v3's stated "L8 must precede L9's read flip" was an inversion: it
  is true of L9's *user-facing* flip, not of L9's plumbing, and L7 already satisfies the only part
  that needs data.

### 14.0 The phase-order and guard-rule recheck (run after every change to this plan)

Performed end to end on v3.1, across all sixteen phases, against two questions:

**(a) Does any phase's exit criteria depend on a later phase?** One did, and it is C7: L8's. Fixed
by re-ordering, not by moving dependencies. **After the re-order: no.** Checked phase by phase —
L0 (no deps), L1 (no deps), L2 (no deps), L3 (needs L2's `league_fixtures` + `manual_override`),
L4 (no deps beyond L2), L5 (needs L4's `CompetitionRef`), L6 (needs L4's `pools` columns and L2's
`league_matchweeks`/`league_predictions`), L7 (needs L2's `ranks_snapshot_at`, L6's adapter),
L9 (needs L7's scored rows), L10 (needs L9's read arms), L8 (needs L10's badge arm and L7's snapshot
function), L11 (needs L2's `lock_at`), L12 (needs L7's `league_rescore_pool` and L6's adapter),
L13, L14, L15 (no forward deps).

**Two known exceptions, both pre-existing, both recorded rather than silently carried:**

1. **L5's verification names an L9 deliverable.** §6.1's `FixtureStore` returns
   `Promise<MatchData[]>` and the `league_fixtures → MatchData` mapping is §9.3, owned by L9. L5's
   verify requires a synthetic league pool to render `/live` correctly. §R-v3 raised this
   (buildability MEDIUM) and v3 did not close it; **the re-order does not worsen it** — L9 still
   follows L5 — and v3.1 does not close it either. It is the largest remaining ordering question and
   the honest options are: hoist §9.3's mapping into L5, or weaken L5's verification to a
   `league_fixtures` row-count check. **Recommendation: hoist the mapping into L5.** Recorded, not
   decided, because it changes L5's and L9's scopes and that is a plan change Ryan owns.
2. **L1 step 2's equivalence gate reads the league data that L1 steps 4 and 6 have not deleted yet**,
   so it returns FALSE as written (§R-v3, wc-safety HIGH). Intra-phase, not inter-phase, and outside
   the seven. **Carried forward OPEN.** The fix is one line — run step 2 *after* steps 4 and 6, or
   scope its `DISTINCT` to the surviving rows — but changing L1's step order is not something to do
   as a side effect of a different fix.

**(b) Is any guard installed before the column, table or function it reads exists?** Three were, all
in v3: instances 6, 7 and 8 of §B.1. **After the fixes: no.** Every one of the 26 rows of §B.1 now
carries the phase that creates it, and every relation each row names exists at or before that phase.
The two guards that could avoid the dependency entirely rather than move it — `lite_recalc_entry`
(row 7) and, optionally, `reject_league_pool_prediction` (row 13) — are written against
`pools.prediction_mode`, which exists today.

---

### L0 — Disarm. Before 22 August. (hours)

Not a build phase. This is the live hazard of §0.4.

1. `UPDATE cron.job SET active = false WHERE jobid = 3;` — the `auto-submit` edge function. ⚠ **v3
   said "this alone prevents the 22 Aug `mw_1 → in_progress` flip". It no longer can — the flip
   already happened (§0.4).** What disarming it now prevents is the *next* one: the branch walks any
   `open` row whose deadline has passed, unbounded and unjoined to `pools`, and §7.1's two seeders
   are still live until L6. Still required, still first, and now retrospective rather than
   preventive — which is itself the argument for L1 not slipping.
2. `UPDATE cron.job SET active = false WHERE jobid = 8;` — `api-football-sync`. The PL row is a
   confirmed live target and burns API calls every minute until the data is gone.
3. Add the leading league guard to **`lite_recalc_entry`** as
   `lib/migrations/049_lite_recalc_entry_league_guard.sql` (§10.2, §B row 19). **The predicate is
   `prediction_mode`, not `league_season_id`** — C2. One `IF EXISTS` block reading only
   `public.pools(pool_id, prediction_mode)`, both of which exist today; the league arm is a bare
   `RETURN`, and there is **no `PERFORM league_rescore_pool`** (§8.5's trigger owns that, and both
   call sites already UPDATE `point_adjustment` before calling the RPC). Provably inert for 623
   pools. This is what protects against the mobile `AdjustPointsSheet` call site, which no web
   deploy can recall.
   *(048 is reserved by 047's header for the in-body authz check — D11. Do not take that number.)*

*Verify:* `SELECT jobid, active FROM cron.job WHERE jobid IN (3,8)` → both false ·
`pg_get_functiondef('lite_recalc_entry')` shows exactly one added leading block, containing
`prediction_mode` and containing **zero** occurrences of `league_season_id` and **zero** of
`league_rescore_pool` · ⚠ **and then actually EXECUTE it**, because text inspection is precisely
what would have let C2 through: inside `BEGIN … ROLLBACK`, call
`lite_recalc_entry(<a real World Cup entry_id>, <its pool_id>)` and assert it returns without error
and that the entry's `scored_total_points` is unchanged; then call it with a `p_pool_id` that
matches **no row** and assert it also returns without error (the `EXISTS`-vs-scalar case) ·
`SELECT count(*) FROM pool_round_states WHERE state='open'` — **expect 0**, and understand why:
§0.4's hazard already fired on 22 Aug and `mw_1` is `in_progress`. v3's "still 1, unchanged" is no
longer the right assertion. What step 1 now buys is that the **next** `open` row cannot be walked.
*Rollback:* re-arm both jobs; drop the `IF` block. Seconds.

---

### L1 — Revert: World Cup restored, league data removed (1 day)

Order matters; each step's count is asserted before the next runs.

0. **Quiesce — belt AND braces (C1).** v3's single `UPDATE … WHERE setting_key='shadow_reconcile_enabled'`
   **matches zero rows and reports success**, because the key does not exist — §0.3 says so. And
   even a working flag reaches only two of the four shadow jobs: **18 and 21 read no `sync_settings`
   key at all**, so only `cron.job.active = false` stops them. Neither brake alone covers all four,
   and cron deactivation alone cannot stop a hand-run or a stray HTTP call. Do both, in this order,
   then prove it **behaviourally**. All four sub-steps are reversible (step 11).

   **0a. Capture the baseline.** Keep these five values; 0d compares against them.
   ```sql
   SELECT now()                                            AS t0,
          (SELECT count(*)         FROM shadow_match_state)  AS sms_n,
          (SELECT max(scored_at)   FROM shadow_match_state)  AS sms_wm,
          (SELECT max(updated_at)  FROM shadow_entry_totals) AS set_wm,
          (SELECT max(detected_at) FROM shadow_score_diffs)  AS ssd_wm,
          (SELECT setting_value FROM sync_settings
            WHERE setting_key = 'analytics_last_run_at')     AS an_wm;
   ```

   **0b. INSERT the two kill switches** — they do not exist, which is the whole defect.
   `sync_settings`' PK is `(setting_key)`, so `ON CONFLICT (setting_key)` is valid.
   ```sql
   INSERT INTO sync_settings (setting_key, setting_value, updated_at) VALUES
     ('shadow_reconcile_enabled',   to_jsonb(false), now()),
     ('shadow_materialize_enabled', to_jsonb(false), now())
   ON CONFLICT (setting_key) DO UPDATE
     SET setting_value = EXCLUDED.setting_value, updated_at = now();
   -- assert: 2 rows

   UPDATE sync_settings SET setting_value = to_jsonb(false), updated_at = now()
    WHERE setting_key = 'analytics_sweep_enabled';
   -- assert: EXACTLY 1 row. This key DOES exist; 0 rows here is the same class of
   -- bug as the one this step replaces — STOP.
   ```

   **0c. Deactivate the four shadow crons.** Jobs 18 and 21 read no flag, so this is the only brake
   that reaches them.
   ```sql
   UPDATE cron.job SET active = false WHERE jobid IN (18,19,20,21);
   -- assert: 4 rows. Jobs 3 and 8 are already inactive from L0 — do not re-arm here.
   ```

   **0d. Prove quiescence.** Three assertions, none of which is a row count on the write itself.

   *(i) Behavioural flag read-back — **must run AFTER 0b, never before.*** With the key absent these
   two calls execute the **full reconcile** — DELETE, UPSERT and `broadcast_pool_leaderboard` on up
   to 25 matches — manually firing the exact writer step 0 just disarmed. After 0b the guard returns
   **before** `pg_try_advisory_lock`, so both are inert and take no lock.
   ```sql
   SELECT shadow_reconcile_matches()     = '{"skipped":"disabled"}'::jsonb AS m_quiet,
          shadow_reconcile_adjustments() = '{"skipped":"disabled"}'::jsonb AS a_quiet;
   -- both must be TRUE. Either false ⇒ the flag did not land ⇒ STOP.
   ```

   *(ii) Cron state.*
   ```sql
   SELECT count(*) AS still_armed FROM cron.job
    WHERE jobid IN (3,8,18,19,20,21) AND active;
   -- must be 0.
   ```

   *(iii) Settle window.* Wait **90 seconds** — longer than the fastest schedule (`* * * * *`) — then
   re-read the five values from 0a. `sms_n`, `sms_wm`, `set_wm` and `ssd_wm` must all be
   **unchanged**, and `analytics_last_run_at` must be unchanged too. The analytics sweep is an HTTP
   route (job 15), not a pg function, so it has no SQL read-back; a **frozen `analytics_last_run_at`
   is its behavioural witness**, because the route's early return at `:59-61` precedes the watermark
   upsert at `:104`. Any of the five moving means something is still writing — **STOP and find it
   before step 1.**

   **Why this matters more than it looks.** Today `SELECT count(*)` over cron 19's own diff predicate
   returns **0** — the reconciler is fully caught up — and all 380 `regular_season` rows carry a
   non-NULL `status`. The moment **step 5** deletes their 380 `shadow_match_state` rows, that
   predicate returns exactly **380** (a LEFT JOIN miss makes every tuple `IS DISTINCT FROM` a NULL
   row). At `LIMIT 25` on a 60-second schedule that is **~16 minutes of a live writer running
   straight through steps 6 and 7** — including the window between step 7's two sequential
   `CREATE OR REPLACE`s on `shadow_score_match`, where cron 19 would execute a committed
   half-reverted body against World Cup matches. Every count in L1 is an assertion over a quiet
   database, and until 0d passes, the database is not quiet.
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
11. **Un-quiesce — reverse 0b and 0c explicitly, in that order (C1).**
    ```sql
    UPDATE sync_settings SET setting_value = to_jsonb(true), updated_at = now()
     WHERE setting_key IN ('shadow_reconcile_enabled',
                           'shadow_materialize_enabled',
                           'analytics_sweep_enabled');
    -- assert: 3 rows.  (The first two are now PRESENT and true, which is
    -- behaviourally identical to their previous absent-means-enabled state but
    -- leaves an operable switch behind. Do NOT delete them.)

    UPDATE cron.job SET active = true WHERE jobid IN (8,18,19,20,21);
    -- assert: 5 rows.  Job 3 stays DISARMED — see step 10 / D15.
    ```
    Then re-run 0d(iii) inverted: within 90 seconds `analytics_last_run_at` must **move**, and
    `shadow_reconcile_matches()` must no longer return `{"skipped":"disabled"}`. A quiescence you
    cannot un-do is an outage.

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

Nine tables including `league_matchweeks.ranks_snapshot_at` (§1.3a, C4) and
`league_fixtures.result_push_recipients` (§1.4a, C3); RLS (including the four transcribed
`league_predictions` policies); **two** of the four league triggers; `league_score_events`. Retarget
`importLeagueSeason.ts` at `league_*`.

⚠ **Only `enforce_league_prediction_before_lock` and `refresh_league_matchweek_window` ship here.**
They read `league_fixtures` and `league_matchweeks` only (§B rows 11 and 15), both created in this
phase. **`assert_league_prediction_pool` and `reject_league_pool_prediction` move to L4** (§B rows
12–13, §B.1 instance 8): both read `pools.league_season_id`, which L4 adds, and the second sits on
the shared, **live** `predictions` table — installed here it would raise on every World Cup
prediction write from the first call. Nothing is lost by waiting: `league_predictions` cannot hold a
row until L6.
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

`league_season_id`, `league_start_matchweek`, **`DROP NOT NULL` on `tournament_id` AND on
`prediction_deadline`** (§2 — the second is C6 E4 and v3 omitted it; without it
`pools_league_no_pool_deadline_ck` is unsatisfiable and §7.1's forced NULL raises 23502), all three
CHECKs. The discriminated union on `PoolData` and the structural, throwing `competitionRef()`.
**Widen every select on §B.2's grep list in the same commit — `entryAnalytics.ts:62` is not
optional.** All seven containment sites (§10.1–10.2), with `snapshot_pool_ranks`' JOIN and conjunct
placed **inside its `IN` subquery** (§B row 6 — v3's "before the conjunct" has nowhere to go).
**Plus the two league triggers moved out of L2** (§B rows 12–13). **Ship the mobile hard-block OTA.**

*Verify:* capture `/leaderboard`, `/live`, `/match-scores` and `/bulk` for **five** World Cup pools —
one per `prediction_mode`, one archived, one with a non-zero `point_adjustment` — before the sweep,
and assert **byte-identical** responses after (W9) · `pg_get_functiondef` diff shows exactly one
conjunct in sites 1–4, one JOIN + one conjunct in `snapshot_pool_ranks`, one leading block in
`lite_recalc_entry`, and **nothing** in `shadow_detect_diffs`'s mismatch INSERT · the analytics sweep
still processes 623 pools after one full cycle (`analytics_last_run_at` advances, `errors[]` empty) ·
`count(*) from pools where league_season_id is not null` = 0 · `npm run build` clean.
Add to *Verify:* `INSERT` a throwaway league-shaped `pools` row with `prediction_deadline` NULL and
assert it succeeds (proving `DROP NOT NULL` landed), then roll it back · a `predictions` INSERT for
a World Cup entry still succeeds with both new triggers installed (proving the L2 → L4 move did not
just relocate the outage) · `pg_get_functiondef('snapshot_pool_ranks')` shows the added JOIN and
conjunct **inside** the subquery and nothing at top level.
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
`save_league_predictions_batch` with the two flags in-transaction, the submit route, the 409s.
Surface mobile's `flushPending` error.

**Plus, moved into this phase from L7 (C6 E5): `league_round_states` and `lib/rounds/read.ts`.**
§7.2 change 2 and this phase's own reveal verification both need the adapter, and it is legal here —
`league_round_states` reads `pools.league_season_id` and `pools.league_start_matchweek` (L4) and
`league_matchweeks` (L2), and L6 > L4 > L2.

**And the reveal fix is C5 + C6's mechanism, not v3's state-nulling.** All six edits of §3.3 land
here: the widened `PredictionMode` with a **throwing** `parsePredictionMode`; the mode switch inside
`computeReveal` with the **allow-list** polarity (`mode === 'progressive'`) and a `never`
exhaustiveness guard; the three consumers; `entries/[entry_id]/predictions/route.ts:108` →
`usesRounds(mode)`; `filterRevealedPredictions`' round-key map built from
`league_fixtures.matchweek_id → league_matchweeks.matchweek_number`; and `readRoundStates` returning
the **real** `state` plus the `deadline ASC NULLS LAST, round_key` ordering contract.
`RoundStateValue` is **not** widened to `| null` — see §3.5 for the 61 reachable sites that depend
on it staying a real value. Route `/bulk` through `predictionStore(ref)` in this phase too, or the
reveal verification below is vacuous.

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

⚠ **Two corrections to the reveal verification, both C6.** (a) **Make it fail loud.** v3's version —
"assert member B's `/bulk` contains none of it" — passes on an **empty response**, and a league
pool's `/bulk` *is* empty today because `getPoolBulkDataUncached` (`poolData.ts:485-498`) reads
`.from('predictions')`. Assert **first** that B's `/bulk` contains **≥1** of A's *MW1* predictions,
and only then that it contains **none** of the MW38 pick. (b) **Add the save-gate regression the
nulling would have caused:** a member saves a pick into the **open** matchweek and gets **200** —
not 403. That single assertion is what proves C5 and C6 were fixed as one mechanism rather than two
patches that re-collide.
*Rollback:* possible, but **from here a league pool may hold member data** — reverting means
exporting picks first.

---

### L7 — Scoring engine, SQL only (4–5 days)

`league_score_fixture`, `league_finalize_totals` (six-column mirror), **`league_snapshot_matchweek_ranks`
(§8.3a, C4 — the sole writer of `previous_final_rank` and its `pool_entries` mirror)**,
`league_rescore_pool`, `league_reconcile_fixtures`, the corrected `broadcast_pool_leaderboard()` and
its two league triggers, `trg_league_adjustment_rescore`.
**`league_round_states` and `lib/rounds/read.ts` have moved to L6** (C6 E5).
**No cron is armed in this phase, and `recalculatePool` is NOT yet changed** — its early return keeps
firing the three side effects until **L8**, which now runs after L10. L9 and L10 must leave it alone
too.

**New deliverable (C7): `scripts/seed-league-verification-pool.ts`.** L7 already builds a synthetic
matchweek — 10 fixtures, ≥3 entries, hand-computed expected points. **Commit it as a seed script**,
so L9, L10 and L8 each verify against the *same* pool instead of re-deriving one. This is what makes
the re-ordered L9 and L10 verifiable without the drain.

*Verify:* **the §1.11 pre-attach test first** — inside `BEGIN … ROLLBACK`, force a
`shadow_entry_totals` UPDATE against the new body and assert the emitted JSON carries all seven
`LiveEntry` keys with `point_adjustment = total_points - match_points - bonus_points` · then a
synthetic matchweek (10 fixtures, ≥3 entries, hand-computed expected points) driven by manual RPC
calls: every scoring output correct; `final_rank` matches a hand-applied tiebreak cascade; the
diff-aware upsert produces **zero** broadcasts on an unchanged re-run; the broadcast payload captured
**off the wire** carries all seven keys; an entry that made picks and never pressed Submit scores
normally; a postponed MW7 fixture leaves MW7 `in_progress` and **MW8 still opens**; an admin
`point_adjustment` moves `league_entry_totals` via the trigger; `pool_entries.previous_rank` and
`last_rank_update` are both written · **and the C4 snapshot, explicitly:** call
`league_snapshot_matchweek_ranks()` once and assert it claims the matchweek and freezes
`previous_final_rank`; call it **again immediately** and assert it returns **0** and changes
nothing (idempotence — this is the assertion that would have caught `league_pools_going_live`'s
re-freeze); assert it stamps `ranks_snapshot_at` but **not** `last_rank_update`; and assert an
unchanged entry produces **no** `broadcast_pool_leaderboard` emission (the
`IS DISTINCT FROM` conjunct).
*Rollback:* drop the league functions and triggers. The broadcast function reverts to the captured
live body — **capture it before the edit.**

### L9 — Read path (3 days) — **runs immediately after L7** (C7)

Every deliverable is pure code, and nothing in it calls the drain. v3 placed it after L8 on the
stated dependency "L8 must precede L9's read flip" — true of the *user-facing* flip, false of the
plumbing, which correctly returns empty until scored rows exist. **L7's seed pool supplies those
rows**, so the "asserts non-empty" criterion below is satisfiable here and needs no drain.

`getScoringSource(ref)` third value with the memoized flag read, the eight `getShadowReadPools`
callers collapsed, `readMatchScores` + the four narrow readers, the fixture/club mappings (§9.3),
`league_entry_match_summary`, `league_match_prediction_accuracy` at **all three** callers.
`recalculatePool` is still **not** changed in this phase.

*Verify:* against **`scripts/seed-league-verification-pool.ts`'s pool, scored by L7's manual RPC
calls** — naming the data source is the point, because "asserts non-empty" is only meaningful if the
reader knows what wrote the rows · a league arm in `scripts/verify-read-paths.ts` that **asserts
non-empty** · both new sibling
functions leave the World Cup bodies `pg_get_functiondef`-identical · a typed test naming
`stage`/`base_points`/`match_number` on the score arm and
`stage`/`round_number`/`match_number`/`home_team_id`/`away_team_id` on the fixture arm · a CI
assertion that `getShadowReadPools` has exactly one caller · **no additional `sync_settings` reads
per pool** on `/pools` and `/dashboard` (WC-M1).
*Rollback:* code only.

---

### L10 — Analytics, XP, badges (3 days) — **runs immediately after L9** (C7)

`writePoolEntryAnalytics(admin, poolId)` and `detectAndPushBadgesForPool(poolId)` are both exported
and **directly callable** — neither needs a cron or a drain to be exercised. Running this phase
before L8 makes the provenance test **stronger**, not weaker: with the drain not yet built, a green
`entry_xp_state` assertion can only have come from the direct badge call.

Adapter wiring into `entryAnalytics.ts` and the league arm of the analytics sweep (lifting the L4
containment); the `xpSystem` knockout inversion and the `104` literals; **all SIX `badges.ts` fixes**
— `:89-91`, `:376`, `:384` (the sixth, unlisted in v3 — C7), `:453`, `:460`, `:466` — including
`showtime` and `stadium_regular`; badge copy. `recalculatePool` is still **not** changed.

⚠ **ATOMICITY (C7): all six `badges.ts` lines and both `xpSystem` inversions ship in ONE commit, and
`badges.ts` is never split across phases** (§8.6). The review proposed hoisting rows 1–2 into L8 to
make L8's exit criteria satisfiable; that would award `showtime` on the first exact score, write it
to append-only `badge_unlocks` **before** the `if (!snapshot?.seeded) return` first-run guard at
`:278`, and fire an APNs push per new badge on run two. The phase re-order solves L8's problem
without touching this file's atomicity.

*Verify:* every eligible entry has an `entry_xp_state` row with `total_completed = 10`, non-zero
`hit_rate`, populated `last_five` — produced by a **direct call** to `detectAndPushBadgesForPool`
against L7's seed pool, with no cron and no drain in the picture · **provenance:** run the assertion
with `analytics_sweep_enabled` **off**, so a green result proves the badge path wrote it, not the
sweep (WC-H3) · `lightning_rod` and `stadium_regular` **are** awarded once their real
thresholds are crossed and **not before** — the `:384` fix means a league entry's prediction count
is no longer a permanent zero, and the `:453`/`:460` fixes mean the denominator is the season's, so
the two defects can no longer cancel and look correct · **zero** Knockout
King events on a league entry · **zero** `showtime` and **zero** `stadium_regular` in `badge_unlocks`
for league entries after two matchweeks · `lightning_rod` not awarded after one matchweek ·
`pool_entries.{scored_total_points, current_rank, previous_rank}` all match
`league_entry_totals` · `shadow_detect_diffs()` clean.
*Rollback:* code only, **except `badge_unlocks` is append-only** — a wrong award in this phase cannot
be withdrawn. Run it against a synthetic pool first.

---

### L8 — The side-effect drain (3–4 days) — **runs after L10** (C7)

**Position, not scope, is what changed.** v3 ran L8 immediately after L7, where **five** of its exit
criteria's dependencies did not exist yet. Running it after L10 makes the criteria below satisfiable
verbatim — nothing is weakened or deferred. Duration is unchanged.

`league_score_events` drain RPCs, `/api/cron/league-reconcile`, the pg_cron entry, and **only then**
the `recalculatePool` `success:false` edit and the `/recalculate` league dispatch.

**Two additions (C3):**

- **`fanOutLeagueResultPushes(admin, fixtureIds)`** and the `PushCompetition` parameterisation of
  `fanOutResultPushes` / `fanOutForMatch` / `detectAndPushStreak` (§4.5, §9.2a). `result_pushes_sent_at`
  is written by **`claimLeagueFixture()` before any send** and has exactly one writer;
  `result_push_recipients` is written after the fan-out returns. The route's post-hoc unconditional
  stamp is **deleted**. `league_release_score_events` must **never** clear the claim (§1.4a trap).
  The World Cup entry point keeps its zero-argument signature, so `recalculate.ts:104` and `:328`
  need no edit.
- **The C4 one-time backfill, executed BEFORE the cron is armed:** set
  `league_matchweeks.ranks_snapshot_at = lock_at` for every matchweek already past its lock at the
  moment the drain goes live, so the first tick does not retro-freeze a season of baselines into one
  instant. Then call `league_snapshot_matchweek_ranks()` once and assert it returns **0**.

**And the `success:false` edit SPLITS the condition, it does not replace the block** (§8.1).
`recalculate.ts:104` is `if (isLeaguePool || (prediction_mode !== 'bracket_picker' && !prodScoringEnabled))`
— the second disjunct is the World Cup's shadow-cutover path. League arm → `success:false`; shadow
arm → byte-identical.

*Verify:* a completing league fixture produces ≥1 `prediction_result` push **(now satisfiable — L10
landed the `badges.ts` league arm and this phase landed the push league arm)**, a non-empty
`entry_xp_state.last_five` **(now satisfiable — L9 landed `getScoringSource`'s third value, both read
arms and the fixture mapping; L10 landed `entryAnalytics.ts`'s league arm)**, and an
`invalidatePoolCache` call in the route's logs · **`result_pushes_sent_at` NOT NULL *and*
`result_push_recipients` NOT NULL** for that fixture, and re-running the drain sends **nothing**
(the claim is the idempotency key) · **the rank baseline came from `league_snapshot_matchweek_ranks`,
ordered first:** `previous_rank` reflects the **pre-fixture** rank, not the post-, and
`league_matchweeks.ranks_snapshot_at` is stamped for that matchweek and unchanged on the next tick ·
a deliberately-failed RPC in step 1 **throws and fails the request** rather than landing in an
`errors[]` array · **kill the drain for 10 minutes, restart, and assert no event is lost and none is
double-sent** · `league_scoring_health` green on **all fifteen** assertions (thirteen in v3, plus one
each from C3 and C4) · a **streak** push uses `(kicked_off_at, fixture_number)` ordering, verified by
re-scoring a fixture and asserting the streak is unchanged · World Cup: cron 19/20 unaffected,
`shadow_detect_diffs()` clean, and `fanOutResultPushes()` with no arguments still behaves exactly as
before against a World Cup pool.
*Rollback:* disarm the cron — scoring stops, data intact, and the outbox holds the backlog. Revert
the `success:false` commit last.

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

L0 is hours. L1 is a day. **The irreducible spine is L2 → L3 → L4 → L5 → L6 → L7 → L9 → L10 → L8**
— roughly **31–37 working days** of build before a league pool can score correctly and notify
anyone. It is the same nine phases and the same durations v3 booked; the re-order (C7) moved L9 (3d)
and L10 (3d) *into* the spine and moved L8 (3–4d) to its end, because L8's exit criteria genuinely
depend on both. **v3's "26–33 days" understated the spine by exactly the six days it had assumed
could run afterwards.**

L11 → L15 is another 16–19. Call it **10–13 weeks of focused work** — unchanged, because nothing was
added and nothing was cut — and the Premier League season started on **21 August**, which has now
happened (§0.3).

**That is the honest statement, and it is the one thing in this document Ryan most needs.** The
season is already underway, and it will be long over before L15 at this pace. §15 D8 is where that
gets decided rather than discovered, and it is now a decision about a season **in progress** rather
than one about to start — which strengthens option (a) and weakens option (b).

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
an explicit member action. It is cheap and I believe it is right, but it is the one mechanism here
that no existing code resembles. **It still has no phase, no cron owner and no assertion** — §R-v3
raised that twice, from two lenses, and v3.1 does not close it. It is the largest *stated but
unowned* item in the plan.

**Newly least certain, v3.1: L5's dependency on L9's `MatchData` mapping** (§14.0 exception 1). The
re-order did not create it and does not worsen it, but it is now the only remaining phase-order
question, and the two honest resolutions have different costs. My recommendation is to hoist §9.3's
mapping into L5; I am not confident enough in that to write it into the plan without Ryan.

**Least certain about the fixes themselves:** C3's `result_push_recipients` counts payloads
*addressed*, not devices *delivered*, because there is no push-audit table anywhere in the schema
(verified: `sendPushToUser` writes no log row, and touches only `push_tokens` and
`get_user_badge_count`). That is the strongest evidence available without inventing one — but it
means a fixture where APNs itself fails for everyone still reads as a healthy N. If that matters,
the answer is a push-audit table, and it is a separate project.

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
   **v3.1 keeps this sentence verbatim and changes only where it is implemented** — inside
   `computeReveal`, dispatched on `pool.prediction_mode`, rather than by an adapter that lies about
   `state` to 61 other readers. And the polarity is part of the guarantee: **allow-list the modes
   that may use the state string**, so anything unrecognised fails closed.
5. **An assertion that cannot fail is worse than a missing one.** Two of the seven criticals (C3, C4)
   were defects whose health check was *present and structurally incapable of failing* — `NULL =
   NULL`, and a stamp written by the step it was meant to be proving. §10.5 now says how each
   assertion could fail, and L6's reveal test asserts a **positive** case before its negative one.
6. **A guard is not correct until it has been executed.** Three of v3's four guard-rule failures were
   correct predicates in the wrong phase, and every one of them would have survived
   `pg_get_functiondef` text inspection. L0's verify now *calls* `lite_recalc_entry`; §1.11's
   pre-attach test already *fires* a trigger. Text inspection proves nothing about a language that
   resolves names at runtime.







---

# R-v3. Third adversarial review — five lenses, against v3 (HISTORICAL)

> **Carried forward verbatim. Do not delete it — the evidence is the point.** This is the review of
> **v3**, not of this document. Every one of its **seven criticals is marked CLOSED** immediately
> under its heading, with a pointer to the section of v3.1 that closes it; three further findings
> are marked **DISSOLVED** (the fix for a critical removed the mechanism they describe) and two
> **CLOSED** because the mandated phase-order and guard-rule recheck fixed them. Everything not so
> marked is **carried forward OPEN**.
>
> **Section numbers cited below are v3's.** v3.1 inserted a changelog as §0.1, so v3's §0.1–§0.5 are
> v3.1's §0.2–§0.6. Every other section number is unchanged.
>
> Unlike the previous round, these reviewers read v3 **from disk**. (The first v3 attempt returned
> the design as a chat reply, only the last 12 KB survived, and three of five reviewers reviewed the
> fragment without noticing. The buildability gate caught it. The workflow now writes the design to
> a file and instructs reviewers to halt if handed a fragment.)

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

> ✅ **CLOSED in v3.1 — C1.** See **§14 L1 step 0 (0a–0d)** and **step 11**, plus **§5.1 rows 18 and
> 21** and **§A.3 WC-M4**. The finding is confirmed and was **incomplete on two points**, both now
> covered: (a) `UPDATE cron.job SET active=false WHERE jobid IN (19,20,21)` omits **jobid 18**, a
> third writer that reads no flag at all — `/api/cron/shadow-materialize`'s guard is
> `enabledRow?.setting_value === false`, so an absent key means `undefined === false` → it does
> **not** skip, and `reconcileStaleEntries` calls `shadow_apply_changes`, which takes the shadow
> advisory lock and re-scores; its selector is built on `shadow_eligible_entries`, which **L1 step 7
> rewrites**. (b) The prescribed read-back `SELECT shadow_reconcile_matches()` is **itself a full
> writer** unless the flag lands first, so 0d(i) is explicitly ordered after 0b. The analytics half
> has no SQL read-back — job 15 is an HTTP route — so its witness is a frozen
> `analytics_last_run_at`, which works because the route's early return precedes the watermark
> upsert.

**Failure.** L1 step 0 reports success; nothing is quiesced. Step 5 deletes the 380 `shadow_match_state` rows while the 380 `matches` rows still exist (they go in step 6). Within ≤60s cron 19's diff query — `FROM matches m LEFT JOIN shadow_match_state st … WHERE (m.home_score_ft, …) IS DISTINCT FROM (st.home_score_ft, …)` — matches all 380, takes 25 per run, calls `shadow_score_match` on each (which DELETEs, UPSERTs and fires `broadcast_pool_leaderboard`), and re-INSERTs `shadow_match_state`. Step 5's assertion and the L1 verify's `shadow_match_state = 104` are then racing a writer and will report whatever the cron last left. Worse, step 7 does two sequential `CREATE OR REPLACE`s on `shadow_score_match`, leaving a committed half-reverted body that cron 19 can execute against World Cup matches — while the L1 verify explicitly instructs "do not re-score — `shadow_score_match` DELETEs, UPSERTs and fires the broadcast", an instruction only the human obeys. The stated premise "Every count below is then an assertion over a quiet database (WC-M4)" is false for every count in L1.

**Fix.** Quiesce with the mechanism L0 already uses and that provably works: `UPDATE cron.job SET active=false WHERE jobid IN (19,20,21);` as step 0, restored in step 11. If the flag is preferred, it must be an upsert — `INSERT INTO sync_settings(setting_key, setting_value) VALUES ('shadow_reconcile_enabled', to_jsonb(false)) ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value` — and step 0 must end with a behavioural read-back, not a write: `SELECT shadow_reconcile_matches()` must return `{"skipped":"disabled"}` before step 1 begins. Add the same read-back for `analytics_sweep_enabled` (that key does exist, so its UPDATE works — which is exactly why the failure is easy to miss).

### [CRITICAL] L0 step 3 installs a guard that reads a column which does not exist yet, into a SECURITY DEFINER function that 623 live World Cup pools call. L0 says "Add the leading league guard to `lite_recalc_entry` (§10.2)", and §10.2 / §B row 7 both specify the predicate `IF (SELECT league_season_id FROM pools WHERE pool_id = p_pool_id) IS NOT NULL THEN … RETURN; END IF;`. I verified `pools` has no `league_season_id` column today — it is added in §2, which lands in **L4**, roughly two weeks of phases later. PL/pgSQL resolves column references at runtime, so `CREATE OR REPLACE` succeeds and the function raises on first call. §1.11 states this exact mechanism ("CREATE OR REPLACE succeeding proves nothing — that is precisely how this defect would reach production") and §B row 12 states the exact ordering constraint for a sibling function, and neither is applied here. L0 calls the change "Provably inert for 623 pools".

> ✅ **CLOSED in v3.1 — C2.** See **§10.2** ("The `lite_recalc_entry` guard, in full"), **§B rows 7
> and 19**, **§B.1 instances 6–7**, and **§14 L0 step 3**. The finding is confirmed and
> **understated twice**: both call sites swallow the error, not just mobile (`MembersTab.tsx:412`
> has no error destructure at all and fires a green toast immediately after), and §10.2's claim that
> the league pool is "blocked today only by `member_pool_writable` on the archived pool" is **stale**
> — the pool was restored on 21 Aug. **The reviewer's own fix was rejected**: swapping to
> `league_season_id` at L4 relocates the identical violation into `league_rescore_pool`, which L7
> creates. v3.1 uses `prediction_mode` — which exists today and is CHECK-equivalent from L4 — so the
> ordering dependency is *removed* rather than moved, and deletes the `PERFORM league_rescore_pool`
> entirely (§8.5's trigger already owns it).

**Failure.** From the moment L0 lands until L4, every call to `lite_recalc_entry` raises `column "league_season_id" does not exist`. It is called after every admin point adjustment from `/Users/ryansousa/Documents/GitHub/office-pools/app/pools/[pool_id]/admin/MembersTab.tsx:412` (web, all 623 World Cup pools) and from `/Users/ryansousa/Documents/GitHub/office-pools/mobile/components/pool-detail/AdjustPointsSheet.tsx:162`, where the error is swallowed by `console.warn` at `:168` — the adjustment lands, the pool is never re-ranked, and nothing surfaces. That mobile call site is in a shipped OTA bundle that no web deploy can recall, which is the very reason §10.2 gives for putting the guard in the database. L0's verification is `pg_get_functiondef('lite_recalc_entry')` shows exactly one added leading block — a text grep that cannot detect this — plus two cron checks and a `pool_round_states` count. Nothing in L0 executes the function.

**Fix.** At L0 use a predicate over a column that exists today: `IF (SELECT prediction_mode FROM pools WHERE pool_id = p_pool_id) = 'league_pickem' THEN RETURN; END IF;` — this is exactly as effective against the archived league pool and against the mobile call site, and `pools_prediction_mode_check` already carries `'league_pickem'` (verified). Swap it to the `league_season_id` form in L4, which already re-touches this function as containment site 5. Add one line to L0's verify: inside `BEGIN … ROLLBACK`, call `lite_recalc_entry` on a real World Cup entry and assert no exception and a non-zero re-rank.

### [HIGH] L1 step 2's equivalence gate is guaranteed to return FALSE, because it reads the league data that steps 4 and 6 have not deleted yet. Step 2 runs `SELECT bool_and(stage_has_scheduled_teams(stage) = (stage='group')) FROM (SELECT DISTINCT stage FROM matches) s;` and the analogous check for `mode_submits_per_round`, and says "Both must be true". Verified live bodies: `stage_has_scheduled_teams(p_stage)` is `p_stage IN ('group','regular_season')` and `mode_submits_per_round(p_mode)` is `p_mode IN ('progressive','league_pickem')`. At step 2 the 380 `regular_season` rows are still in `matches` (deleted at step 6) and the one `league_pickem` pool is still in `pools` (deleted at step 4). I ran the step exactly as written against production: `stage_equiv = false`, `mode_equiv = false`. The intent is right — the substitutions ARE a semantic no-op on the surviving data — but the gate is pointed at the wrong row set.

**Failure.** The revert halts at step 2 on a false alarm, before any of the ordered, count-asserted steps run. The likelier and worse outcome: an implementer reads `false` as "the substitution is not safe" and starts editing `shadow_score_match` to reconcile it — and `shadow_score_match` is the one function in the revert whose pricing block (def-lines 48-54, 046d single-base) must be left byte-identical. WC-M2's whole point was to prove the substitutions before editing; as scheduled, the proof fires a false negative at exactly the moment it is meant to build confidence.

**Fix.** Either move step 2 to run after steps 4 and 6, or scope both reads to the surviving data and leave it where it is: `SELECT bool_and(stage_has_scheduled_teams(stage) = (stage='group')) FROM (SELECT DISTINCT stage FROM matches WHERE stage <> 'regular_season') s;` and `SELECT bool_and(mode_submits_per_round(prediction_mode) = (prediction_mode='progressive')) FROM (SELECT DISTINCT prediction_mode FROM pools WHERE prediction_mode <> 'league_pickem') p;`. Still two pure reads, and both now return true.

### [HIGH] L2 creates a trigger on the shared, live `predictions` table whose function reads `pools.league_season_id` — a column L4 adds. §B row 13 defines `reject_league_pool_prediction` as reading "the same three relations as 12", and row 12's relations include `pools po.league_season_id (added §2)`. Row 12 then states the ordering constraint in so many words: "the `pools` column must be added **before** this function is created". §14 orders L2 ("the four league triggers") before L4 ("`league_season_id` … all three CHECKs"), violating the constraint the audit just wrote down. D3 names the trigger `trg_aa_predictions_reject_league_pool` and it is BEFORE INSERT OR UPDATE FOR EACH ROW on `predictions`.

> ✅ **CLOSED in v3.1 — by the mandated phase-order and guard-rule recheck, not by one of the seven.**
> See **§14 L2**, **§14 L4**, **§B rows 12–13** and **§B.1 instance 8**. Both league triggers that
> read `pools.league_season_id` move from L2 to **L4**, the phase that adds the column. The two that
> stay in L2 (`enforce_league_prediction_before_lock`, `refresh_league_matchweek_window`) read only
> `league_*` relations created in L2. §B.1 now carries a phase per row and a hard ordering rule, and
> §14.0 re-runs the check across all sixteen phases.

**Failure.** Between L2 and L4 — roughly 6-9 days by v3's own estimates — every INSERT or UPDATE on `predictions` raises `column "league_season_id" does not exist`, on the shared World Cup table. Current exposure is limited because the last `predictions` write was 2026-07-19, but it is not zero: `mobile/lib/usePredictions.ts:291-299` re-queues failed upserts into `pendingRef` and retries forever, so any device holding a pending write loops silently against a hard error, and any admin, backfill or migration script touching `predictions` fails. L2's verification checks only league-table row counts (1 season, 20 clubs, 38 matchweeks, 380 fixtures) plus `npm run lint`, so nothing in the phase would catch it. The same defect affects `assert_league_prediction_pool`, though that one is confined to `league_predictions`.

**Fix.** Move the `ALTER TABLE pools ADD COLUMN league_season_id` out of L4 and into L2 ahead of the triggers, or move all three `pools.league_season_id`-reading league functions out of L2 into L4. Then add to whichever phase creates the `predictions` trigger: inside `BEGIN … ROLLBACK`, insert one row into `predictions` for a World Cup entry and assert it lands with no exception. §B row 12's ordering note should be restated as a phase-level dependency in §14, not left as a footnote in the audit table.

### [MEDIUM] §B row 6 mis-describes `snapshot_pool_ranks`, so the fix it prescribes has nowhere to go and its verification cannot detect a wrong placement. The row says the "verified body" joins `pool_entries pe` to `pool_members pm` and prescribes "an added `JOIN pools po ON po.pool_id = pm.pool_id` before the conjunct". The live body has no join at all: `UPDATE pool_entries pe SET previous_rank = pe.current_rank WHERE pe.member_id IN (SELECT pm.member_id FROM pool_members pm WHERE pm.pool_id = ANY(p_pool_ids));`. `pm` exists only inside the IN subquery. This is the same shape as the WC-H2 defect §B exists to eliminate — a prescription written against an alias layout that is not the one in the function.

> ✅ **CLOSED in v3.1 — by the guard-rule recheck.** See **§B row 6** and **§10.2**. The live body has
> no top-level join; `pm` is scoped to the `IN` subquery. **The JOIN and the conjunct both go inside
> the subquery.** Recorded as instance **5** of the guard-rule violations in §B.1 — the same shape as
> WC-H2, inside the section written to eliminate it.

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

> ✅ **CLOSED in v3.1 — C3.** See **§4.5** (six mechanisms, and the `:87` cursor vs the `:84`
> selector), **§4.3 step 4a**, **§1.4a** (`result_push_recipients`), **§6.3** (three new rows:
> `:87`, `:65`, `:471`), **§6.1** (the stated ESLint exception), **§9.2a** and **§10.5**. Two sites
> the reviewer also missed are now named: `:65`, the claim UPDATE that writes the column, and
> `:471`, a sixth score-table mechanism hard-coded to `match_scores`. **The reviewer's prescribed
> §10.5 remedy — "a count of actual `prediction_result` push rows per completed fixture" — is not
> implementable**: `sendPushToUser` writes no log row and there is no push-audit table anywhere in
> the schema, so that assertion would have nothing to count. `result_push_recipients` is the
> implementable substitute.

**Failure.** lib/push/match-results.ts:79 `fanOutResultPushes()` takes no arguments and selects `.from('matches').eq('is_completed',true).is('result_pushes_sent_at',null).limit(50)`, then `if (matches.length === 0) return`. A league fixture lives in `league_fixtures`, so the query returns [] and the function returns immediately — no error, no log. §4.3 step 4 then runs `stamp league_fixtures.result_pushes_sent_at`. §10.5 asserts `every completed fixture has result_pushes_sent_at IS NOT NULL -- SW-C1` and passes. Result: zero `prediction_result` pushes for all 380 fixtures of the season, with the health check green and L8's verification ('a completing league fixture produces ≥1 prediction_result push') the only thing standing between this and production. Note the semantic inversion: in the World Cup path `result_pushes_sent_at` is written by `claimMatch` (match-results.ts:64-71) as an atomic claim *inside* the fan-out, which is what prevents double-sends; v3 demotes it to a post-hoc stamp written by the caller.

**Fix.** Give `fanOutResultPushes` a `CompetitionRef` (or an explicit fixture-id list) and a league arm reading `league_fixtures` + `league_match_scores`, keeping the claim-then-send shape so `result_pushes_sent_at` is written by the claim, not by the drain. Delete the unconditional stamp from §4.3 step 4. Change the §10.5 assertion from 'result_pushes_sent_at IS NOT NULL' to a count of actual `prediction_result` push rows per completed fixture — the stamp cannot be its own evidence. Add `lib/push/match-results.ts:86` to §6's bucketed disposition as REPOINT.

### [CRITICAL] `pool_entries.previous_rank` for a league entry has no writer. Three mechanisms cancel out: §4.3 step 1 calls the World Cup helper, §10.2 contains the function that helper calls, and `league_entry_totals.previous_final_rank` — the column §8.3 mirrors from — is never written by anything in v3. §4.3 deletes `league_snapshot_ranks` as a pg_cron job and never specifies a replacement body. This is SW-M1 answered in prose only.

> ✅ **CLOSED in v3.1 — C4.** See **§1.3a** (`ranks_snapshot_at`), **§8.3a**
> (`league_snapshot_matchweek_ranks`, the sole owner), **§4.3 step 1**, **§4.1** (the widened
> consumer list), **§10.5** and **§B row 20**. The finding is confirmed and the consequence is
> **wider than stated**: `broadcast_pool_leaderboard` emits `previous_final_rank` and
> `liveMerge.ts:96` **writes it into every entry**, so an unwritten column does not leave arrows
> flat — it actively overwrites correct values with `null`; and seven of the thirteen §8.3 readers
> break on the *source* column, not the mirror, so writing `pool_entries.previous_rank` alone would
> have fixed the activity feed and nothing else. The reviewer's own fix was **incomplete**: an
> `UPDATE … WHERE pool_id = ANY(p_pool_ids)` driven by `league_pools_going_live()` re-freezes the
> baseline every minute for the ~2 hours a fixture is live, producing the identical user-visible
> outcome as no writer at all. A claim column is what makes it idempotent.

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

> ⊘ **DISSOLVED in v3.1 — C2.** The `PERFORM league_rescore_pool(p_pool_id)` is **deleted from the
> design**, not deferred behind D11, so the mechanism this finding describes no longer exists. Two
> notes: migration **047 is applied**, so `anon` no longer holds EXECUTE at all; and **D11 still
> stands on its own merits** — the function is still SECURITY DEFINER with no in-body authz check,
> which is migration 048.

**Failure.** Verified live: `lite_recalc_entry` has `prosecdef = true` and `proacl = {=X/postgres, postgres=X, anon=X, authenticated=X, service_role=X}` — `=X` is PUBLIC — and the body (dumped in full) contains no authz check, no pool predicate and no archive predicate. v3 is right about all of this. But §10.2's prescribed guard is `IF (SELECT league_season_id FROM pools WHERE pool_id = p_pool_id) IS NOT NULL THEN PERFORM league_rescore_pool(p_pool_id); RETURN; END IF;`, and §8.5 defines `league_rescore_pool` as 're-scores every completed/live fixture of the pool's season and finalizes' — up to 380 fixtures × N entries. Any anonymous caller who knows or guesses a pool_id can then drive an unbounded re-score at will, once per request, with no rate limit. L0 step 3 is safe because it lands the bare `RETURN` form before `league_rescore_pool` exists; the hazard is the §10.2 final form landing in L4 while D11 sits in a separate queue.

**Fix.** Make D11 a hard prerequisite listed inside L4's steps rather than a parallel decision: `REVOKE EXECUTE ON FUNCTION lite_recalc_entry(uuid,uuid) FROM PUBLIC, anon;` plus `IF NOT is_pool_admin(p_pool_id) THEN RAISE EXCEPTION` as the first statement, applied before the league arm gains its `PERFORM`. v3 already establishes that both callers (`admin/MembersTab.tsx:412`, `mobile/.../AdjustPointsSheet.tsx:162`) run as authenticated pool admins, so neither breaks.

### [MEDIUM] §B row 6's prescription for `snapshot_pool_ranks` — 'Needs an added `JOIN pools po ON po.pool_id = pm.pool_id` before the conjunct' — does not fit the function's actual body, and L4's verification restates the same wrong shape. §B is the section whose stated purpose is catching exactly this, and it is presented in §16.2 as the first non-negotiable.

> ✅ **CLOSED in v3.1 — same fix as the wc-safety MEDIUM above.** Two lenses found it independently,
> which is the signal that §B's per-site check needed a phase column and an executed verification,
> not just a re-read. §B row 6, §10.2, §B.1 instance 5.

**Failure.** The live body is `UPDATE pool_entries pe SET previous_rank = pe.current_rank WHERE pe.member_id IN (SELECT pm.member_id FROM pool_members pm WHERE pm.pool_id = ANY(p_pool_ids))`. There is no FROM/JOIN clause at the top level and the alias `pm` exists only inside the IN-subquery, so there is nothing for a `JOIN pools po` to attach to — §B row 6's own description ('`pool_entries pe`, `pool_members pm`') reads the subquery alias as though it were in the outer statement's scope, which is the same misread the rule forbids. L4's exit criterion compounds it: 'pg_get_functiondef diff shows ... one JOIN + one conjunct in `snapshot_pool_ranks`'. An implementer following it literally produces a syntax error, so this fails loudly rather than silently — but the verification statement is again encoding the wrong shape, which is the meta-failure §B.1's closing lesson identifies in v2.

**Fix.** Correct §B row 6 and L4's criterion to: one added conjunct *inside the IN-subquery* — `... WHERE pm.pool_id = ANY(p_pool_ids) AND EXISTS (SELECT 1 FROM pools po WHERE po.pool_id = pm.pool_id AND po.league_season_id IS NULL)`. (Alternatively rewrite as `UPDATE ... FROM pool_members pm JOIN pools po ON po.pool_id = pm.pool_id WHERE pe.member_id = pm.member_id AND ...`, but that changes the statement's shape and should be stated as such rather than as 'an added JOIN'.) Resolve against the finding above on whether this site should be contained at all.

### [MEDIUM] The `entry_round_submissions` per-season lock sweep — which v3 itself flags in §16.1 as 'the one mechanism in v3 that no existing code resembles' — has no phase in §14, no cron owner in §11, and no assertion in §7.5 or §10.5. It is a sweep with no runner, which is the same tell v3 correctly used to catch `result_pushes_sent_at`.

**Failure.** §7.4 specifies 'a per-season sweep at matchweek lock: for every entry with ≥1 league_prediction in the matchweek that just locked, write has_submitted = true and prediction_count'. Searching the document, `entry_round_submissions` appears only at lines 160, 900, 987 and 1771 — the disposition table, the gate description, the specification itself, and the least-certain list. L11's body names 'all eight sweeps of §11, the per-season matchweek-open/lock-reminder cron' and does not include it; L6's body names the in-transaction flags and does not include it. §7.5's four write-path invariants and §10.5's thirteen assertions both omit it. If it is never built, `predictions/route.ts:81`'s `roundStatus` (built from `pool_round_states` + `entry_round_submissions`) reports every matchweek unsubmitted for every member all season, and admin MembersTab submission chips stay empty — a plausible-looking 'nobody submitted' that is indistinguishable from the truth.

**Fix.** Name it as an explicit L11 deliverable attached to the new per-season matchweek cron (it fires at the same instant, on the same 38 rows), and add one line to §10.5: 'every entry with ≥1 league_prediction in a locked matchweek has a matching entry_round_submissions row with has_submitted = true'. That converts it from an unowned paragraph into something the health cron can fail on.

### [LOW] §3.3 item 3 cites `revealGate.ts:54` as the line to change to `usesRounds(pool.prediction_mode)`; the actual mode branch is at :56.

> ✅ **CLOSED in v3.1 — C6.** Corrected to `:56` in §3.3, along with a second off-by-one the review
> did not catch: `entries/[entry_id]/predictions/route.ts:106` → `:105`.

**Failure.** `lib/predictions/revealGate.ts:54` is `now: Date,` (a parameter of `computeReveal`); the `if (pool.prediction_mode === 'progressive') {` branch is at :56. An implementer editing the cited line edits the signature. Trivially self-correcting, but v3 makes a point of correcting line refs elsewhere (WC-L1 drops two wrong ones from L0 step 1), and this is the single most load-bearing line in the design's own stated privacy guarantee (§16.2 item 4).

**Fix.** Change the citation to `revealGate.ts:56`. While there, note that `PredictionMode` is exported from this same file at :20 as the three-value union — that is the 'one exported place' §3.3 item 3 refers to widening, worth stating explicitly since `RevealPool.prediction_mode` is typed against it at :23.

## R.ui-reuse — **sound-with-fixes**

**Were the previous findings actually fixed?** Genuinely fixed, verified against code, not reworded: UI-C1 — all five gates confirmed at the exact lines (predictions/route.ts :81 roundStatus, :107 canEdit ternary, :156-168 pool-deadline 403, :190-218 round gates, :231-233 submitted 403), and the mechanism correction is right: predictions/round/route.ts:37-ish 400s before its own flag write, so the review's attribution was wrong and v3 says so. v3 also adds a real original finding the review missed — the accepted-but-dropped save, with the free signal at :274 (`insertedIds.push(...(saved?.inserted ?? []))`) confirmed present and uncompared. UI-H1/CP-H3 — substantive: 40 sites/24 files by my grep vs v3's 41/27, and the lint rule genuinely moved to L2. UI-H2 — verified end to end: rounds/route.ts:37 returns 400 for non-progressive, RoundsTab.tsx:69-80 throws a generic Error and toasts "Failed to load rounds data" discarding the body, and PoolDetail.tsx:996 mounts the tab on usesRoundFlow. UI-H3 — verified exactly: badges.ts:453 lightning_rod, :460 `predictionCount >= 104`, :466 `match.stage !== 'group'`, plus :89-91 and :376. The "grep for the literal 104 and for `stage !== 'group'`" instruction is the right form. UI-M1 — restored and load-bearing: competitionRounds.ts:151-153 requires `stage === 'regular_season' && round_number === n`, so dropping either key does produce empty prediction screens. UI-L1 — verified: ResultsView.tsx:258 is `{stageTab === 'group' && hasGroupResults && (…)}` with hasGroupResults at :150 testing `m.stage === 'group'`; the gate change is correctly named as same-commit work. UI-M3 — closed by §7.4's in-RPC first-save write. Fixed but with a wrong citation: SW-H3 (finding 4) — the decision is right, one of its four evidence sites is bracket-picker-only and unreachable. Partially fixed: UI-M2 (finding 5) — the count is right but assembled from a different file set than the table, and understates rather than overstates. Not fixed, and it is new damage introduced by v3's own SW-H2 fix: finding 1.

v3 is a complete document (1,795 lines, all 19 sections, DDL and phase bodies present) and its UI-reuse architecture claim is honest and holds: the reuse boundary (MatchData / TeamData / EntryScoring plus the six-column pool_entries mirror) is the right one, forking predictions does NOT drag the leaderboard, XP or badges into forking, and the one genuinely unusable component is correctly identified. Its quantitative claims survive independent grep: 40 pool_round_states sites / 24 files (v3 says 41/27), 94 from('matches') (says 95), 46 from('predictions') (says 46), 14 mobile stage files, StandingsTab 629 lines, BaseTeamTable 105 lines. Line citations are accurate to within 1-3 lines across every component I checked. One critical defect: §3.3's reveal fix nulls `state` inside the shared readRoundStates adapter, which makes every league matchweek un-pickable and 403s every save. One high: L13 references 27 modules that §12 does not enumerate — 21 of them exist only in v2.

### [CRITICAL] §3.3's SW-H2 fix nulls `state` inside `readRoundStates` — the single shared adapter every reader uses (§3.4: "the one door"; §3.5: "All route through readRoundStates"). The nulling condition is `lock_at > now()`, which is true of the OPEN matchweek under both D13 branches (one-at-a-time picks the earliest unlocked matchweek; pick-ahead marks every unlocked one 'open'). So no league matchweek ever reaches any consumer with `state='open'`. v3 presents "no new flag threaded through computeReveal" as the virtue of this approach; that rejection is exactly what causes the damage, because the state string is load-bearing for ~40 other readers, not just the reveal gate.

> ✅ **CLOSED in v3.1 — C5, applied as ONE mechanism with C6 below.** See **§3.3** ("The mechanism
> v3.1 ships instead"), **§3.4**, **§3.5** (the 69-site / 21-file measurement), **§7.2 change 2** and
> **§B rows 24–26**. Confirmed, and worse than stated in three ways v3.1 records: `RoundStateValue`
> is a non-nullable union so the nulling could not be implemented without widening it across 61
> reachable sites; two surfaces would **throw** during render (`PoolInfoTab.tsx:149` and mobile
> `:477` call `.charAt(0)` on it); and `RoundStatusCard.tsx:16-27` is an exhaustive switch with no
> default, so the badge would vanish **silently**. The reveal rule moves into `computeReveal`, where
> `pool.prediction_mode` is already a required argument, and the state string is **allow-listed to
> `progressive`** so a future rounds mode fails closed.

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

> ✅ **CLOSED in v3.1 — C6, applied as ONE mechanism with C5 above.** See **§3.3**, **§7.2 changes
> 2–3**, **§2** (`ALTER COLUMN prediction_deadline DROP NOT NULL`), **§14 L6**, and **§0.4** (the
> live leak this verification discovered). Two findings from this review are folded in: the save
> gate now fails **closed** on a lookup miss (404) instead of skipping, and
> `entries/[entry_id]/predictions/route.ts:108` — a site v3 never lists — becomes `usesRounds(mode)`,
> without which every non-owner gets a permanent 403 all season. **This reviewer explicitly rejected
> their own proposed remedy** (an exported `toRevealRoundStates` mapper at the call sites) as
> fail-open, and took C5's instead. Two v3 line citations are corrected: `revealGate.ts:54` → `:56`,
> and `entries/[entry_id]/predictions/route.ts:106` → `:105`. And v3's §2 claim that
> `isDeadlinePassed(null)` closes the `scope:'all'` branch was **unsatisfiable** —
> `pools.prediction_deadline` is `is_nullable='NO'` — which is why the `DROP NOT NULL` is now
> mandatory.

**Failure.** The open matchweek is by definition the one with `lock_at > now()`, so the adapter nulls its state too. A league member saving a pick in the open matchweek hits `null !== 'open'` and gets 403 "Round is not open for predictions" — for every matchweek, all season. This holds under BOTH D13 branches: under one-at-a-time the open matchweek is nulled along with the future 'locked' ones; under pick-ahead every matchweek is 'open' and every one gets nulled. L6's verification ("submit MW1 → 200, then save a pick in MW2 → 200") fails on the first assertion, and the implementer must invent a resolution the document explicitly rejects: "No new vocabulary, no new flag threaded through computeReveal."

**Fix.** Do not null in the adapter. Keep `readRoundStates` returning true state, and apply the transform at the two reveal call sites via an exported mapper in lib/predictions/revealGate.ts — `toRevealRoundStates(rows, ref)` which nulls `state` where `ref.kind === 'league' && lock_at > now()` and is the only thing `computeReveal` ever sees. One function, no new vocabulary threaded anywhere, and the write gates keep reading real state.

### [CRITICAL] L8's verification depends on two L9/L10 deliverables, so the phase cannot pass its own exit criteria. L8 verifies "a completing league fixture produces ≥1 `prediction_result` push" and "a non-empty `entry_xp_state.last_five`". Verified: `detectAndPushBadgesForPool` (lib/push/badges.ts:79) selects `'pool_id, pool_name, tournament_id'` at :83-85 and does `if (!tournamentId) return` at :91 — NULL for every league pool — and it is the writer of `last_five` at :230. Its fix is scheduled in L10 ("the five `badges.ts` fixes"). `fanOutResultPushes` (lib/push/match-results.ts:79) takes NO arguments, scans `.from('matches')` globally with `.is('result_pushes_sent_at', null).limit(50)`, and picks its score table from `isProdScoringEnabled` at :84 — §4.5 schedules that dispatch for "L9/L10".

> ✅ **CLOSED in v3.1 — C7.** See the **§14 preamble** (running order), **§14.0**, **§8.1**,
> **§8.6** (the sixth `badges.ts` row at `:384` and the atomicity rule), and **§14 L7 / L9 / L10 /
> L8**. Confirmed, and the dependency set is **larger than stated — five deliverables, not two**:
> `last_five` comes from `computePoolEntryAnalytics`, which needs `getScoringSource`'s third value,
> both read arms, the `league_fixtures → MatchData` mapping and `entryAnalytics.ts`'s league arm.
> **The reviewer's prescribed fix was rejected as unsafe**: hoisting §8.6 rows 1–2 into L8 awards
> `showtime` on the first exact score and writes it to append-only `badge_unlocks` *before* the
> first-run guard at `:278`, converting a code defect into an irreversible member-facing one. v3.1
> **re-orders the phases instead** — L7 → L9 → L10 → L8 — which costs nothing: no scope moves, no
> verification is weakened, and no duration changes.

**Failure.** Run L8 exactly as written and the drain fires two functions that are no-ops for a league pool: no push, no `entry_xp_state` row, no `last_five`. Both assertions fail with nothing to debug, because neither function errors. Compounding it, §4.3's pseudocode calls `await fanOutResultPushes()` inside a "per distinct pool, sequentially" loop — the wrong shape for a global no-arg sweep, so an implementer following it issues N redundant full-table scans. §4.3 also writes `await snapshotPoolRanks(poolIds)` where the real signature (lib/scoring/snapshotRanks.ts:15) is `(admin, poolIds)`.

**Fix.** Move into L8 the two things its verification actually needs: `badges.ts`'s `COMPETITION_COLUMNS` widening + ref dispatch (§8.6 rows 1-2), and a `league_fixtures` arm in `fanOutResultPushes` with a `poolIds`/`fixtureIds` parameter. Leave L10 the XP-semantics and badge-literal fixes. Correct §4.3's two call signatures in the pseudocode block.

### [HIGH] The 95-site fixture disposition — GAP 2, the whole point of §6 — exists only as bucket counts. §6.2 gives 41 UNAFFECTED / 22 REPOINT / 24 BRANCH / 4 REFUSE / 4 DEAD (=95, verified: `grep -rn "from('matches')" app lib mobile components scripts` returns exactly 95). §6.3 then says "Not the whole table" and names roughly 35 sites. §A.1 cites "the commissioned inventory" as the source; no such artifact exists — I checked every file in drafts/ and none carries a bucketed site list.

**Failure.** L5 is booked at 5-6 days against a list the implementer must re-derive and re-adjudicate from scratch for ~60 sites. The BRANCH bucket is the dangerous one: §6.2 defines it as "Needs a league arm *and* a stated behaviour when there is none", and the behaviour is stated for about 8 of the 24. An implementer inventing those 16 behaviours is exactly the silent-wrongness the document exists to prevent — and §6's own examples (dashboard:79 NULL-in-uuid[], pools/page.tsx:125 fails-closed, bulk:88 fails-closed vs the scope:'all' leak) show that near-identical-looking sites have opposite correct answers.

**Fix.** Append the full 95-row table as an appendix: `path:line | bucket | behaviour for a league pool`. The counts prove it was produced; publishing it is the deliverable L5 consumes. Until it is on disk, L5's duration estimate is not defensible either.

### [HIGH] L2's exit criterion is unsatisfiable as written. It ships all three `no-restricted-syntax` confinement rules and verifies "`npm run lint` green with the three new rules". Verified counts today: `.from('matches')` 95, `.from('predictions')` 46, `.from('pool_round_states')` 41 = 182 existing violations. None of the three sanctioned homes exists at L2 — `lib/fixtures/store.ts` is L5, `lib/rounds/read.ts` is L7, the prediction store is L6. next.config.ts sets no `eslint.ignoreDuringBuilds`, so Next's default lint-on-build applies and the build fails.

**Failure.** An engineer reaching L2's verification step finds 182 lint errors and a red build, with no specified way forward. They will either downgrade the rules to `warn` (which defeats "the list cannot grow during the build" — the stated reason for moving them to L2) or sprinkle 182 `eslint-disable` comments, which is a day of undirected work hidden behind one line and which future sites can copy.

**Fix.** Specify the baseline mechanism: ship each rule as an `overrides` block whose `files` glob EXCLUDES an explicit, enumerated list of today's violating paths, and add a CI check asserting the exception list never grows. Restate L2's verification as "lint green; the three exception lists total exactly 182 entries; the no-growth check is wired."

### [HIGH] `league_pools_going_live()` is named in §4.3 with a one-line description ("pool_ids whose next matchweek's first fixture just went live") and no mechanism for "just". The World Cup detects this edge with run-local state — verified at app/api/cron/sync-fixtures/route.ts:276: `if (anyNewlyLive && !someMatchAlreadyLive) snapshotTournamentIds.push(tournamentId)`. A pure SQL RPC on a `* * * * *` schedule has no equivalent, and nothing in the DDL (§1.3 `league_matchweeks`, §1.4 `league_fixtures`, §1.8 `league_fixture_state`) records that a matchweek's snapshot has been taken.

> ⊘ **DISSOLVED in v3.1 — C4.** `league_pools_going_live()` is **deleted from the design**. The
> "just went live" edge is no longer inferred; `league_matchweeks.ranks_snapshot_at` claims it
> (§1.3a, §8.3a). This finding was correct and its reasoning is exactly why a detection predicate
> was rejected in favour of a claim.

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


---

# V. Fourth review — verification of v3.1

Three checks, run against this file on disk: closure, regression, buildability.

| Check | Verdict | Critical | High |
|---|---|---|---|
| closure | **sound-with-fixes** | 0 | 2 |
| regression | **sound-with-fixes** | 1 | 3 |
| buildability | **sound-with-fixes** | 2 | 3 |

**Total: 3 critical, 8 high.**

⚠ **The checks DISAGREE on closure and the regression pass is right.** The closure check reports
7 of 7 closed; the regression check reports 5 of 7, and identifies C4 and C3 as not closed. Two
independent reviewers then found the same root cause for C4 and both verified it empirically
against production. It was reproduced a third time by hand:

```
CREATE OR REPLACE FUNCTION public._probe_ret_int() RETURNS integer LANGUAGE sql AS $$
  UPDATE pool_entries SET previous_rank = previous_rank WHERE false;
$$;
-- ERROR: 42P13: return type mismatch in function declared to return integer
-- DETAIL: Function's final statement must be SELECT or INSERT/UPDATE/DELETE/MERGE RETURNING.
```

So **v3.1 is 5 of 7, not 7 of 7.** Treat the closure check's headline as unreliable and this
section as the record.

## V.closure — **sound-with-fixes**

**Closure assessment.** 7 of 7 closed with a concrete, verifiable mechanism — none is prose-only. C1: L1 step 0a–0d + step 11 (I dumped both live bodies: `shadow_reconcile_matches`/`shadow_reconcile_adjustments` do return exactly `{"skipped":"disabled"}` *before* `pg_try_advisory_lock`, `sync_settings` PK is `(setting_key)` so the ON CONFLICT is valid, and `scored_at`/`updated_at`/`detected_at`/`analytics_last_run_at` all exist for the 0a watermarks; the analytics-sweep route's guard is `=== true || === 'true'` at :58 with the watermark upsert at :101, so the frozen-watermark witness works). C2: the `IF EXISTS … prediction_mode='league_pickem'` guard reads only `public.pools(pool_id, prediction_mode)`, both of which exist today, and L0's verify now *executes* the function; deleting `PERFORM league_rescore_pool` is justified — I confirmed both call sites UPDATE `point_adjustment` before the RPC (MembersTab.tsx:403-407 with no error destructure on the RPC at :412, AdjustPointsSheet.tsx:152-169 console.warn). C3: claim-before-send via `claimLeagueFixture`, one writer, `result_push_recipients` as separate evidence; `match-results.ts` :65/:87/:471 are all real and `fanOutForMatch` is genuinely fixture-scoped across pools, so a fixture-level claim is the right key. C4: `ranks_snapshot_at` claim column + `league_snapshot_matchweek_ranks()`; `pool_entries` really has no `pool_id`, so the entry_id join is correct, and `snapshot_pool_ranks`' live body matches the corrected §B row 6 exactly. C5+C6: applied as one mechanism and they do NOT re-collide — the adapter returns a real non-nullable `RoundStateValue`, `predictions/route.ts:199`'s `state !== 'open'` gate therefore works, and `RevealPool.prediction_mode` is confirmed the first required field of the type. C7: re-order L7→L9→L10→L8; the rejection of the reviewer's hoist is verified correct — `badge_unlocks` upsert is at :258-272, *before* the `if (!snapshot?.seeded) return` at :278. Residual defects are in two closures' artifacts and verifications, not in their mechanisms.

### [HIGH] L6's reveal verification — the launch-blocking privacy test that proves C5+C6 landed — asserts the leak it exists to catch. §3.3 ("Make the verification fail loud") and §14 L6 both say: store an MW38 pick **while MW1 is open**, then "assert **first** that member B's `/bulk` contains **≥1** of member A's MW1 predictions (proving the pipe carries league rows at all), and only then that it contains **none** of the MW38 pick." §16.2 item 5 elevates this to a non-negotiable: "L6's reveal test asserts a **positive** case before its negative one." But under C5's own mechanism an `'open'` matchweek is by construction one whose deadline has not passed — §3.2's two D13 arms are `WHEN mw.matchweek_number = o.open_mw` (earliest unlocked) and `WHEN mw.lock_at > now() THEN 'open'` — and the league reveal rule is `isDeadlinePassed(round.deadline, now)` alone. So A's MW1 picks are correctly NOT revealed to B, and I confirmed `bulk/route.ts` passes `isAdmin: false` into `gatePoolPredictions`, so nothing else lets them through.

**Failure.** An implementer runs L6's exit criteria against a correct implementation and the FIRST assertion fails. The stated purpose of that assertion is 'proving the pipe carries league rows at all', so the natural diagnosis is 'the reveal gate is too tight' — and the two cheapest ways to make it pass are to reinstate the state-string path for league (`state !== 'open'`) or to special-case the current matchweek. Either one re-opens SW-H2/S1 for every open matchweek: all 380 fixtures exist with real club names in August, so member B reads member A's live, still-editable picks. The document's own §16.2 item 4 calls this 'a privacy guarantee with a member's name on it'.

**Fix.** Make the positive control a LOCKED matchweek, not the open one. Restate as: score and lock MW1, leave MW2 open, store an MW38 pick; assert B's `/bulk` contains ≥1 of A's **MW1** picks (deadline passed ⇒ revealed — this is the non-empty-pipe proof), **none** of A's MW2 picks (open ⇒ not revealed), and **none** of the MW38 pick. Same three assertions, same loud-failure property, no leak demanded. Fix the identical wording in §3.3 and in §14 L6's ⚠(a).

### [HIGH] §8.3a's printed `league_snapshot_matchweek_ranks()` — the sole mechanism closing C4 — cannot be created as written, and the assertion that proves C4 is closed cannot be written against it. It is declared `RETURNS integer LANGUAGE sql` ("Returns the number of totals rows frozen") but its final statement is `UPDATE pool_entries pe SET previous_rank = f.previous_final_rank FROM frozen f WHERE pe.entry_id = f.entry_id;` with no RETURNING. PostgreSQL (verified server: 17.6) rejects this at CREATE time: `return type mismatch in function declared to return integer` / `DETAIL: Function's final statement must be SELECT or INSERT/UPDATE/DELETE RETURNING.` §4.3 step 1, §14 L7 and §14 L8 all consume a return value: L7 says "call it **again immediately** and assert it returns **0** … this is the assertion that would have caught `league_pools_going_live`'s re-freeze"; L8's backfill says "call the function once and assert it returns **0**".

**Failure.** L7's migration aborts on the CREATE. The likely repair under schedule pressure is either (a) change it to `RETURNS void`, which silently deletes the idempotence assertion that is the entire reason a claim column was chosen over a detection predicate, or (b) append `RETURNING 1` to the mirror UPDATE — after which a second call claims nothing, `frozen` is empty, the mirror updates zero rows, and a scalar SQL function with no result row returns **NULL, not 0**, so `assert returns 0` still fails and gets weakened to `assert no error`. Either way C4 ships with the same shape of unfalsifiable check §10.5 says is 'worse than a missing one'.

**Fix.** Make the mirror a third data-modifying CTE and end on a SELECT: `…, mirrored AS (UPDATE pool_entries pe SET previous_rank = f.previous_final_rank FROM frozen f WHERE pe.entry_id = f.entry_id RETURNING pe.entry_id) SELECT count(*)::int FROM mirrored;`. Still one statement, still idempotent, and `returns 0` becomes literally true on the second call.

### [MEDIUM] C3's replacement for the post-hoc stamp makes §10.5's two `result_pushes_sent_at` / `result_push_recipients` assertions unpassable for any completed fixture that no pool scored. `result_pushes_sent_at` now has "EXACTLY ONE WRITER" — `claimLeagueFixture()` — and it is reached only for `fixtureIds = [...new Set(claimed.map(e => e.fixture_id))]` out of `league_claim_score_events`. Outbox rows are `INSERT INTO league_score_events (pool_id, fixture_id, 'fixture_scored')` with `pool_id uuid NOT NULL` (§1.10), so a fixture that no pool played produces no event, is never claimed, and is never stamped. §10.5 asserts `every completed fixture has result_pushes_sent_at IS NOT NULL` plus `result_push_recipients IS NOT NULL for every such fixture`, and §1.4a defines NULL as the alarm state ("claimed but the run died mid-flight").

**Failure.** D12's stated normal case — a pool created mid-season, e.g. at MW20 — leaves ~190 completed fixtures of that season with no event and no stamp. `league_scoring_health` goes red the day that pool exists and stays red for the remaining 18 matchweeks, and the red is byte-identical to a genuine dropped push. It is also guaranteed at launch under D8(b): every fixture completed before the season's first league pool was created. The panel becomes noise, which is the same end state as an assertion that cannot fail.

**Fix.** Scope both assertions to fixtures the drain was actually responsible for: `… every completed fixture THAT HAS >=1 league_score_events ROW has result_pushes_sent_at IS NOT NULL`, and the same qualifier on `result_push_recipients`. Add a separate, separately-alarming count of completed fixtures with zero events so the excluded set is stated rather than hidden — the same rule §11 applies to every sweep.

### [MEDIUM] §3.3 no longer names the line that routes a league pool into `computeReveal`'s rounds branch at all. v3's §3.3 item 3 was "change `revealGate.ts:54` to `usesRounds(pool.prediction_mode)`" (§R-v3's LOW corrects :54 → :56). v3.1 renumbered the six edits and item 3 is now "The three `computeReveal` consumers". Edit 2 says only: "branch on the mode inside `computeReveal`. Replaces `:51-69` and `:117-120`. One boolean, `stateIsAuthoritative`, threads into `isRoundLocked`" — and the one explicit polarity instruction in the whole section is `allowStateString = mode === 'progressive'`, which is about the state-string shortcut, not the branch selector. §14 L6 repeats only "the mode switch inside `computeReveal` with the **allow-list** polarity (`mode === 'progressive'`)". Verified in code: `revealGate.ts:56` is `if (pool.prediction_mode === 'progressive')` and `:66-68` is the `scope:'all'` pool-deadline arm.

**Failure.** An implementer threads the boolean into `isRoundLocked` (edit 2's only stated content) and reads the one printed polarity literal as applying to the dispatch, leaving `:56` as `=== 'progressive'`. A league pool then falls to `:66`; §2's `pools_league_no_pool_deadline_ck` guarantees `prediction_deadline IS NULL`, `isDeadlinePassed(null)` is `false`, and `computeReveal` returns `{revealed: false}` forever. Combined with edit 4 (`entries/[entry_id]/predictions/route.ts:108` → `usesRounds(mode)`, which now *fetches* round states) the round states are read and then ignored. Result: the shipped member-predictions-visibility feature returns 200 with an empty array for every league member for all 38 matchweeks, and no assertion in §10.5 looks at reveal (§10.5 says so itself: 'blind to the reveal leak'). Fail-closed, so not a leak — but it is the plausible-empty class.

**Fix.** Add one clause to §3.3 edit 2: "`:56`'s `pool.prediction_mode === 'progressive'` becomes `usesRounds(mode)`; the `never` exhaustiveness guard is over the four-value `PredictionMode` union, and `allowStateString = mode === 'progressive'` applies only inside `isRoundLocked`." Two distinct booleans, named once each — the section currently calls the same one `stateIsAuthoritative` and `allowStateString` in adjacent paragraphs.

### [MEDIUM] C2's closure transfers ownership of the league rescore to `trg_league_adjustment_rescore`, but §8.5 gives that trigger's function no security context and L7 gives it no World Cup regression assertion. §10.2 deletes `PERFORM league_rescore_pool` on the grounds that "§8.5's `trg_league_adjustment_rescore` … already fires on the `point_adjustment` UPDATE both call sites make *before* the RPC". Verified: both call sites issue that UPDATE with the **user's own** authenticated client (`MembersTab.tsx:403-407`, `AdjustPointsSheet.tsx:152-160`), so the AFTER trigger body executes under that user's RLS. §1.12 makes `league_match_scores`, `league_entry_totals`, `league_fixture_state` and `league_score_events` **deny-all**. §8.5 declares only `EXECUTE FUNCTION league_rescore_on_adjustment()`; it never says SECURITY DEFINER or `SET search_path`, and §B row 14 checks columns only. §8.3a and §1.11 both state SECURITY DEFINER explicitly for their functions, so the omission reads as deliberate.

**Failure.** The first admin point adjustment on a league pool fires the trigger, `league_rescore_pool` → `league_finalize_totals` attempts a write into deny-all `league_entry_totals`, RLS refuses, the trigger raises, and the enclosing `pool_entries` UPDATE rolls back — so the adjustment itself is refused, which is strictly worse than the pre-C2 state where it landed un-re-ranked. Separately, this is the FIRST trigger on `pool_entries` (verified: zero non-internal triggers today) and it fires on every one of the 623 World Cup pools' adjustments too; L4's verify has exactly the right assertion for the sibling `predictions` trigger ("a `predictions` INSERT for a World Cup entry still succeeds with both new triggers installed") and L7 has no equivalent for this one.

**Fix.** State `SECURITY DEFINER SET search_path TO 'public','pg_temp'` on `league_rescore_on_adjustment()` (and on `league_rescore_pool`) in §8.5, and add the mirror of L4's assertion to L7's verify: inside `BEGIN … ROLLBACK`, UPDATE `point_adjustment` on a real World Cup entry with the trigger installed and assert it commits and re-ranks.

### [LOW] C7's re-order is made verifiable by `scripts/seed-league-verification-pool.ts`, which L7 defines as "a synthetic matchweek — 10 fixtures, ≥3 entries" (one matchweek). L10 then verifies against that same pool: "**zero** `showtime` and **zero** `stadium_regular` in `badge_unlocks` for league entries **after two matchweeks**", "`lightning_rod` not awarded after one matchweek", and "`lightning_rod` and `stadium_regular` **are** awarded once their real thresholds are crossed". With the §8.6 fixes those thresholds are the season fixture count (380) and, for `stadium_regular`, the same denominator — verified at `badges.ts:453` (`predictionCount >= matches.length`) and `:460` (`>= 104`).

**Failure.** The two-matchweek criteria are unrunnable against a one-matchweek seed pool, so they either get silently skipped or 'pass' vacuously against data that cannot exercise them — and the positive criterion ('are awarded once their real thresholds are crossed') needs 380 predictions per entry, which no seed pool will hold. C7's whole claim is that L10 becomes verifiable *before* the drain exists; that claim rests on a dataset the plan does not produce.

**Fix.** Make the seed script two matchweeks (20 fixtures) so the 'after two matchweeks' assertions are runnable, and replace the positive threshold criterion with a unit test over `computeBadgeState` with an injected fixture count — the awards themselves are append-only and must not be exercised against real `badge_unlocks`.

### [LOW] Two exit criteria are contingent on undecided §15 items and do not say so. (a) L6 verifies "submit MW1 → 200, then save a pick in MW2 → **200** (the UI-C1 regression test)". §7.2's gate 4 is `state !== 'open'` → 403, and §3.2's D13-one-at-a-time arm makes exactly one matchweek `'open'`, so MW2 returns 403 under that branch. D13 is an open decision (§15) whose recommendation is pick-ahead. (b) §10.5's new C4 assertion — "for every pool of a season with >=1 claimed matchweek and >1 entry, `count(*) FILTER (WHERE previous_final_rank IS NOT NULL) = eligible_entries`" — is violated by any entry created after the most recent matchweek lock, because §8.3a freezes only at lock time; under D12 ("late joining is the *normal* case") that is a routine state.

**Failure.** (a) L6 fails its own exit criterion under one branch of a decision Ryan has not made, with no stated resolution — the implementer either blocks or edits the gate. (b) `league_scoring_health` goes red for up to a week every time anyone joins a pool mid-matchweek, which is legitimate data, not a defect.

**Fix.** (a) Add one clause to L6: "assumes D13 = pick-ahead; under one-at-a-time this assertion inverts to MW2 save → 403." (b) Scope the FILTER to entries whose `created_at` precedes the season's most recent `ranks_snapshot_at`.

## V.regression — **sound-with-fixes**

**Closure assessment.** Five of seven are closed; two are not. CLOSED AND VERIFIED: **C2** — I dumped the live function: `lite_recalc_entry(p_entry_id uuid, p_pool_id uuid) RETURNS void`, plpgsql, no DECLARE block, `proconfig=NULL`, body touches only `pool_entries`/`match_scores`/`pool_members`. The prescribed `IF EXISTS (SELECT 1 FROM public.pools WHERE pool_id = p_pool_id AND prediction_mode='league_pickem') THEN RETURN; END IF;` is valid today (both columns exist, `RETURN;` is legal in a void function, the parameter name matches so there is no plpgsql ambiguity), and deleting the `PERFORM league_rescore_pool` removes the L7 dependency rather than moving it. **C7** — the re-order is sound: `recalculate.ts:104`'s league early return does fire all three side effects and is untouched until L8; `badges.ts` atomicity holds; nothing in L9/L10 needs the drain. **C5+C6 (mechanism half)** — verified `revealGate.ts`: `LOCKED_ROUND_STATES` and `isRoundLocked` each have exactly one call site, `RevealPool.prediction_mode` is already the first required field, and `pools_prediction_mode_check` admits exactly four values, so a throwing `parsePredictionMode` is safe for all 624 pools. **C1 (substance half)** — verified both `shadow_reconcile_matches()` and `shadow_reconcile_adjustments()` return literally `jsonb_build_object('skipped','disabled')` before `pg_try_advisory_lock` when the flag is false, so 0d(i) is a valid behavioural probe; `analytics_last_run_at` does exist in `sync_settings` (16 keys total, as stated) and the analytics route's flag early-return precedes its watermark upsert, so 0d(iii)'s witness is real and not a NULL=NULL tautology. NOT CLOSED: **C4** — the function that is the entire fix cannot be created (finding 1). **C3** — the diagnosis and the claim-before-send shape are right, but the claim lost the `is_completed` predicate the deleted cursor was carrying (finding 2), and two of its own evidence assertions are unsatisfiable (findings 6, 8). The C1 and C5+C6 fixes each carry one new World Cup exposure (findings 3, 4).

### [CRITICAL] C4's `league_snapshot_matchweek_ranks()` — the sole writer of `previous_final_rank` and the whole content of the C4 fix — cannot be created as printed in §8.3a. It is `LANGUAGE sql ... RETURNS integer`, and its final statement is `UPDATE pool_entries pe SET previous_rank = f.previous_final_rank FROM frozen f WHERE pe.entry_id = f.entry_id;` with no RETURNING. PostgreSQL requires the final statement of a SQL-language function with a non-void return type to be SELECT or INSERT/UPDATE/DELETE/MERGE ... RETURNING. I confirmed this empirically against this exact production instance (project ujthamlehjyubbzxbnes) with a probe function of the same shape: `ERROR: 42P13: return type mismatch in function declared to return integer / DETAIL: Function's final statement must be SELECT or INSERT/UPDATE/DELETE/MERGE RETURNING.` The §B row 20 audit checked that every column exists and passed it CHECKED — a column-existence audit cannot see this, which is precisely the third lesson §B.1 draws about itself. §16.2 item 6 says 'a guard is not correct until it has been executed'; nothing in L7 executes this one before relying on it.

**Failure.** L7 runs the migration; `CREATE FUNCTION league_snapshot_matchweek_ranks` aborts with 42P13 and the phase stops. If an implementer 'fixes' it by changing the signature to RETURNS void, three downstream contracts silently break instead: §4.3 step 1's `const { data: frozen, error } = await admin.rpc('league_snapshot_matchweek_ranks')` gets null and the route has no count to log; L7's idempotence assertion 'call it again immediately and assert it returns 0' can never pass (null is not 0), so the one test written to catch the re-freeze failure mode is dead; and L8's backfill gate 'call the function once and assert it returns 0' is dead the same way. The prose claim 'Returns the number of totals rows frozen' is false under every repair that keeps LANGUAGE sql, because the last statement counts mirrored `pool_entries` rows, not frozen totals rows.

**Fix.** Make it `LANGUAGE plpgsql`: keep the identical single statement with the three chained CTEs, then `GET DIAGNOSTICS v_mirrored = ROW_COUNT;` and `RETURN v_mirrored;`. If the stated semantics ('totals rows frozen') are wanted rather than rows mirrored, add a fourth CTE `SELECT count(*) FROM frozen` and return that. Add to L7's verify: create the function and call it inside `BEGIN … ROLLBACK` before anything depends on it — the same pre-attach discipline §1.11 already mandates for `broadcast_pool_leaderboard`.

### [HIGH] C3 replaced `fanOutResultPushes`' global cursor with an explicit fixture-id list from the outbox, but did not carry the cursor's `.eq('is_completed', true)` predicate into the replacement. Verified at /Users/ryansousa/Documents/GitHub/office-pools/lib/push/match-results.ts:87-95 the World Cup gate is the cursor, and `claimMatch` at :60-72 carries no completeness test of its own — it does not need one, because nothing un-completed ever reaches it. §4.3 step 4a's `claimLeagueFixture(fixtureId)` is specified as `UPDATE league_fixtures SET result_pushes_sent_at = now() WHERE fixture_id = $1 AND result_pushes_sent_at IS NULL RETURNING fixture_id` — no completeness predicate — and step 4a's input is `[...new Set(claimed.map(e => e.fixture_id))]`. §8.2 scores live fixtures (`is_completed OR (NOT p_final AND status='live')`) and §4.3 step 2 emits a `fixture_scored` event for every affected pool on every state diff, so a live goal produces exactly such an event. Nothing between the outbox and the claim filters for completion (grepped the whole document for `is_completed`; it appears nowhere in §4.3, §4.5 or §1.4a).

**Failure.** The 19:00 kickoff scores at minute 12. `league_reconcile_fixtures` diffs the goal, scores it live, inserts a `fixture_scored` event per pool. One minute later the drain claims the events, `claimLeagueFixture` stamps `result_pushes_sent_at = now()` and `fanOutLeagueResultPushes` sends every member of every pool a 'Final result' push and a rank-change push built on a 1-0 mid-match scoreline. At full time the fixture completes, a second event is emitted, the claim returns zero rows, and the real result is never pushed to anyone — for all 380 fixtures. Both new §10.5 assertions read green: `result_pushes_sent_at IS NOT NULL` and `result_push_recipients > 0`. This is a member-facing wrong notification that v3 did not have, because v3's `fanOutResultPushes()` could not see a league fixture at all.

**Fix.** Add the predicate to the claim, where the deleted cursor used to hold it: `UPDATE league_fixtures SET result_pushes_sent_at = now() WHERE fixture_id = $1 AND is_completed = true AND result_pushes_sent_at IS NULL RETURNING fixture_id`. Belt and braces: filter `fixtureIds` to completed fixtures in §4.3 step 4a before calling `fanOutLeagueResultPushes`. Add to L8's verify: score a fixture live, run the drain, assert zero pushes and `result_pushes_sent_at IS NULL`; then complete it and assert exactly one push round.

### [HIGH] C6 adds `ALTER TABLE pools ALTER COLUMN prediction_deadline DROP NOT NULL` (§2, phase L4) and replaces the guarantee with nothing. Verified live: `pools.prediction_deadline` is `is_nullable='NO'` with no default today. The only new constraint is `pools_league_no_pool_deadline_ck CHECK (league_season_id IS NULL OR prediction_deadline IS NULL)`, which is one-directional — it forbids a deadline on a league pool but does not require one on a World Cup pool. And nothing route-side compensates: /Users/ryansousa/Documents/GitHub/office-pools/app/api/pools/create/route.ts destructures `prediction_deadline` at :49 and passes it straight into the insert at :70 with the only validation being `if (!pool_name?.trim() || !tournament_id)` at :56; /Users/ryansousa/Documents/GitHub/office-pools/app/api/admin/branded-pools/route.ts does the identical thing at :82 and :137. The database NOT NULL is currently the sole thing rejecting a World Cup pool created without a deadline. v3 omitted the DROP (that was the C6 defect) — but the fix went one step too far and deleted the invariant instead of narrowing it.

**Failure.** From L4 onward, any caller that omits `prediction_deadline` — the branded-pool admin form, a mobile build, a script, a partner integration — creates a World Cup pool with a NULL deadline and gets a 201. Every downstream consumer then fails silently and permanently for that pool: `computeReveal` falls to `isDeadlinePassed(null, now)` which returns false at revealGate.ts:135, so the shipped member-predictions-visibility feature never unlocks; save gate 3 at predictions/route.ts:156-168 never fires, so picks stay editable past kickoff at the route layer; both auto-submit draft sweeps carry `.not('prediction_deadline','is',null)` so drafts are never auto-submitted; `firePendingDeadlineWarnings` (cron 9) and `firePredictReminders` (cron 13) never fire. Nothing errors and nothing alarms — §10.5 only looks at league pools.

**Fix.** Narrow the invariant instead of dropping it. Keep the DROP NOT NULL (it is needed), and replace `pools_league_no_pool_deadline_ck` with the biconditional: `ALTER TABLE pools ADD CONSTRAINT pools_deadline_matches_competition CHECK ((league_season_id IS NULL) = (prediction_deadline IS NOT NULL));`. Combined with `pools_exactly_one_competition` this says exactly 'a World Cup pool must have a deadline, a league pool must not'. It validates against all 624 rows today (the column is NOT NULL, so every existing row satisfies it once the one league pool is deleted in L1). Add a 400 for a missing deadline on the World Cup branch of both create routes so the failure is a 400 and not a 500.

### [HIGH] C1 makes L1's quiescence real for the first time (v3's UPDATE matched zero rows), but step 11 un-quiesces BEFORE the phase's own `*Verify:*` block runs, and proves un-quiescence by hand-invoking a writer. Step 11 sets the three flags true and runs `UPDATE cron.job SET active = true WHERE jobid IN (8,18,19,20,21)`, then asserts `shadow_reconcile_matches()` 'must no longer return {"skipped":"disabled"}'. Only after that does the Verify block recompute `base_points/multiplier/total_points` over `shadow_match_scores ⋈ matches ⋈ pool_settings` and diff against stored, and open two World Cup pools in a browser. Step 7 has just rewritten five call sites across four shadow functions. §5.1's own job-18 row states the risk in terms: `shadow_entries_needing_rederive` is built on `shadow_eligible_entries`, 'and L1 step 7 rewrites `shadow_eligible_entries` — L1 is precisely the event most likely to flip that selector non-zero mid-revert'. Step 0d(i) also explicitly warns that calling `shadow_reconcile_matches()` with the flag enabled 'execute[s] the full reconcile — DELETE, UPSERT and broadcast_pool_leaderboard on up to 25 matches'. Step 11 does exactly that deliberately.

**Failure.** Step 11 completes at T+0. Cron 18 fires within 15 minutes and cron 19 within 60 seconds, against a shadow engine whose four rewritten function bodies nobody has verified yet. `reconcileStaleEntries` calls `shadow_apply_changes`, which takes `pg_advisory_xact_lock(hashtext('shadow_process_queue'))` and runs `shadow_score_match` / `shadow_calculate_bonuses` / `shadow_finalize_totals` over World Cup entries. The Verify block's read-only CTE then diffs stored `shadow_match_scores` against a recomputation of the same (now rewritten) pricing — so a botched substitution in step 7 produces rows that agree with themselves and the diff comes back clean. 623 pools, 286,876 score rows, and the check designed to catch it has been rendered self-confirming. Step 11's own probe fires the same writer one more time for good measure.

**Fix.** Move step 11 to after the `*Verify:*` block — the revert is not proven until the CTE diff is clean, `matches WHERE stage='regular_season'` is 0, `teams` is 48, `pools` is 623 and two World Cup pools have rendered in a browser. Replace step 11's probe with non-writing evidence: `SELECT jobid, active FROM cron.job WHERE jobid IN (8,18,19,20,21)` all true, `SELECT setting_value FROM sync_settings WHERE setting_key IN ('shadow_reconcile_enabled','shadow_materialize_enabled','analytics_sweep_enabled')` all true, then wait 90 seconds and assert `analytics_last_run_at` has moved — never call `shadow_reconcile_matches()` by hand.

### [MEDIUM] C4's replacement for the NULL=NULL tautology is a §10.5 assertion that is structurally red for the whole first matchweek of every season, which is the same failure in the other direction — an alarm that fires when nothing is wrong is one operators mute. The assertion is: 'for every pool of a season with >=1 claimed matchweek and >1 entry, count(*) FILTER (WHERE previous_final_rank IS NOT NULL) = eligible_entries'. But `previous_final_rank` is by construction NULL until the SECOND claim. At MW1's `lock_at` nothing has been scored, so `league_entry_totals` has no rows yet (or `final_rank` is NULL), and the freeze CTE's `AND t.previous_final_rank IS DISTINCT FROM t.final_rank` conjunct writes nothing. `league_finalize_totals` then creates the rows during MW1 with `previous_final_rank` NULL — correctly, since §8.3a is declared the sole owner of that column, and I verified the World Cup sibling `shadow_finalize_totals`' upsert column list is `(entry_id, pool_id, match_points, bonus_points, total_points, final_rank, updated_at)` and does not touch `previous_final_rank`, so a faithful league copy will not either.

**Failure.** MW1 locks. The pg_cron alarm and the CI fixture both go red for every league pool and stay red for a week until MW2 locks. Same for every pool created after a matchweek has already been claimed — which under D12 (late joiners are the normal case over nine months) is most pools, each red until the next lock. By the time a genuine C4 regression appears, the assertion is a known-noisy line nobody reads. §16.2 item 5 says an assertion that cannot fail is worse than a missing one; an assertion that always fails at season start has the same effect on the operator.

**Fix.** Scope it to the state where it can only be violated by a real defect: require the season to have >=2 matchweeks with `ranks_snapshot_at IS NOT NULL`, and restrict the FILTER population to entries whose `league_entry_totals` row existed before the most recent `ranks_snapshot_at` (e.g. `WHERE t.updated_at < (SELECT max(ranks_snapshot_at) FROM league_matchweeks mw JOIN pools po ON po.league_season_id = mw.season_id WHERE po.pool_id = t.pool_id)`). Keep the unconditional half — 'every league_matchweek with lock_at <= now() has ranks_snapshot_at NOT NULL' — which is the one that actually catches a dead writer.

### [MEDIUM] §10.5's C3 assertion 'every completed fixture has result_pushes_sent_at IS NOT NULL, AND result_push_recipients IS NOT NULL for every such fixture' cannot hold for any completed fixture that no pool scored, and C3 made the stamp strictly harder to reach than v3's version. The stamp now has exactly one writer, `claimLeagueFixture`, and it is only ever called with fixture ids that came out of `league_claim_score_events` — which only holds rows that `league_reconcile_fixtures` inserted per (pool, fixture) for pools it actually scored. A fixture with no eligible entry anywhere produces no event and is therefore never claimed and never stamped. v3's post-hoc unconditional stamp was wrong for the reason C3 gives, but it did at least always satisfy the assertion; the corrected mechanism does not, and the assertion was not adjusted alongside it.

**Failure.** D12/D13 put mid-season joining at the centre of the product: a pool created at MW20 leaves 190 completed fixtures with `result_pushes_sent_at IS NULL` forever. The same is true of the whole window from L2 (tables exist, importer has loaded 380 fixtures) to L15 (first real pool), during which the season is completing and zero pools exist — the alarm is red across the entire build. Fifteen assertions run as one green/red fixture, so one permanently-red member takes the whole health layer with it and the fourteen that do work stop being read.

**Fix.** Scope the assertion to fixtures the engine was actually asked to push for: `... FROM league_fixtures f WHERE f.is_completed AND EXISTS (SELECT 1 FROM league_match_scores s WHERE s.fixture_id = f.fixture_id)`. Alternatively, have the drain stamp a fixture it processed with zero eligible entries as `result_pushes_sent_at = now(), result_push_recipients = 0` — but only for fixtures it saw, which still leaves the pre-pool window, so the scoped assertion is the smaller correct fix.

### [MEDIUM] C3 gives two contradictory instructions about the World Cup arm of `detectAndPushStreak`, on a live APNs path that v3 did not touch at all. §4.5 says it 'takes the descriptor, filters memberships by competition', and L8's deliverable list is 'the `PushCompetition` parameterisation of `fanOutResultPushes` / `fanOutForMatch` / `detectAndPushStreak`' — under which the World Cup arm's `scoreTable` becomes `isProdScoringEnabled ? 'match_scores' : 'shadow_match_scores'`. §9.2a says of the exact same line: 'Not fixed here — it is a World Cup question, and this document freezes the World Cup backend — but named so it is not re-derived.' Verified at /Users/ryansousa/Documents/GitHub/office-pools/lib/push/match-results.ts:471 the current read is `.from('match_scores').select('score_type, calculated_at').eq('entry_id', …).order('calculated_at', {ascending:false}).limit(10)` — hard-coded, reached from a loop over every membership of the user.

**Failure.** `prod_scoring_enabled` is `true` today, so both readings produce `match_scores` and the ambiguity is invisible at L8. Memory records `prod_scoring_enabled=false` as the next planned gate. The moment it flips, the descriptor reading silently repoints every World Cup streak read from `match_scores` to `shadow_match_scores` — different row counts, different `calculated_at` ordering — and 3/5/10-match streak pushes start firing or stopping for 623 pools' worth of members with no code change, no deploy and no alarm. The implementer has to guess which of the two sentences governs, and the guess is invisible in review.

**Fix.** Say which. Given §0.2's rule that the World Cup backend is frozen, pin the World Cup arm to the literal `'match_scores'` inside `detectAndPushStreak` and let only the league arm take its table from the descriptor. Record the shadow-mode inconsistency as a World Cup item and leave it. Also state explicitly whether 'filters memberships by competition' is intended — today the function loops every pool the user belongs to regardless of which match completed, so that filter is itself an unstated behaviour change for 623 pools, and L8's exit criteria only assert the league arm's ordering.

### [MEDIUM] §9.2a and §B row 23 — both new in v3.1 — assert that `kicked_off_at` and `fixture_number` are columns of `league_match_scores` ('Both columns are on `league_match_scores` (v2 §1.6)', and row 23 lists all five as landing in L2). But §9.2, which is the only column list for that table anywhere in v3.1, does not say that. It reads: 'Stored: entry_id, pool_id, score_type, total_points, base_points, predicted_home_score, predicted_away_score, actual_home_score, actual_away_score, calculated_at. Mapped: match_id ← fixture_id, match_number ← fixture_number, stage ← 'regular_season'. … Plus `kicked_off_at` and `matchweek_number`.' So `fixture_number` appears only as the source of a mapped read-boundary key, the 'Plus' clause adds `matchweek_number` rather than `fixture_number`, and neither is in the Stored list. The document's own header claims a reader 'needs nothing from v1, v2 or v3 to act on', and §1's table marks `league_match_scores` unchanged from v2 rather than reproducing it — so the implementer cannot check the assertion against anything in the file. This is the guard-rule class: a predicate asserted against a relation whose column list is not in front of the reader.

**Failure.** If the two columns are not stored on `league_match_scores`, the C3 streak fix cannot be written as specified — `.order('kicked_off_at', …).order('fixture_number', …)` returns a PostgREST 42703, and per §4.5's own error-discipline note a `const { data } = await …` swallows it into an empty array, which reads as 'this entry has no streak'. The implementer's likely repair is to fall back to `calculated_at DESC`, which is exactly the ordering §9.2a exists to forbid and whose failure — a streak silently reordered by any re-score or admin fixture correction — is silent rather than empty.

**Fix.** Reproduce `league_match_scores`' full column list in §9.2 (it is ten to twelve columns) and state `kicked_off_at timestamptz` and `fixture_number integer` as stored, denormalised from `league_fixtures` at score time, with the reason (they are the chronology pair and must not move under re-score). If they are not to be stored, say so and specify the join to `league_fixtures` that the streak arm and the four narrow readers must carry instead — but not both.

## V.buildability — **sound-with-fixes**

**Closure assessment.** Both of my v3 criticals are genuinely closed, verified against code, not reworded.

C6 (§3.3's adapter nulling vs §7.2's save gate — mutually exclusive). CLOSED. §3.3 now says `readRoundStates` "always returns the true derived `state`" and §3.4 states "`state` is ALWAYS a real RoundStateValue. It is never nulled." The policy moved into `computeReveal`, where I verified `RevealPool.prediction_mode` really is the first required field (`lib/predictions/revealGate.ts:22-26`), so no call site can forget it. I re-read the gate the collision was on — `app/api/pools/[pool_id]/predictions/route.ts:190-206` is exactly `if (roundState) { if (roundState.state !== 'open') return 403 ... }` — and with a real `'open'` it passes. `RoundStateValue` at `app/pools/[pool_id]/types.ts:257` is confirmed a non-nullable four-value union, so refusing to widen it is right. The allow-list polarity (`mode === 'progressive'`) is the correct fail-closed choice, and `pools_prediction_mode_check` is confirmed to hold exactly four values, so a throwing `parsePredictionMode` cannot take down a live route. §2's `ALTER COLUMN prediction_deadline DROP NOT NULL` is present, which the CHECK genuinely needed. My own prescribed remedy (a `toRevealRoundStates` call-site mapper) was correctly rejected as fail-open; C5's is better.

C7 (L8 cannot pass its own exit criteria). CLOSED for the mechanism I named. Running order is L7 → L9 → L10 → L8, restated in the §14 preamble, in §14.0 and in each phase body, and L8 physically sits after L10 in the file. `scripts/seed-league-verification-pool.ts` gives L9/L10/L8 a shared data source, which is what makes "asserts non-empty" meaningful without a drain. §8.1's split-the-condition instruction is correct — I re-read `lib/scoring/recalculate.ts:104` and the condition really is `isLeaguePool || (prediction_mode !== 'bracket_picker' && !prodScoringEnabled)`, and lines 103-112 really do fire all three side effects today, so "leave the shadow arm byte-identical" is the right edit. The sixth `badges.ts` row at `:384` and the atomicity rule are both present, and rejecting my hoist of rows 1-2 into L8 is correct: `badge_unlocks` is append-only and the write precedes the first-run guard.

I also re-verified the other five fixes' factual base. C1: `sync_settings` holds exactly 16 keys with `shadow_reconcile_enabled`/`shadow_materialize_enabled` absent, PK is `(setting_key)` so the `ON CONFLICT` is valid, `analytics_last_run_at` exists, `shadow_match_state.scored_at` / `shadow_score_diffs.detected_at` / `shadow_entry_totals.updated_at` all exist so 0a runs, both reconcile functions return literally `{"skipped":"disabled"}` so 0d(i)'s equality holds, and `cron.job` has 17 rows with 3/8/15/18/19/20/21 active. `analytics-sweep/route.ts` kill switch does precede the watermark upsert, so the frozen-watermark witness works. C2: `lite_recalc_entry(p_entry_id uuid, p_pool_id uuid)`, `prosecdef=true`, `proconfig=NULL`, no DECLARE block, no `pools` reference — the `IF EXISTS` guard fits. Both call sites do UPDATE `point_adjustment` before the RPC (`MembersTab.tsx:404-407`, `AdjustPointsSheet.tsx:152-160`), so deleting the `PERFORM` is sound. C3: `claimMatch` at `:63-72`, the zero-arg cursor at `:79-95`, `fanOutForMatch` at `:126`, the hard-coded `match_scores` streak read at `:470` — all confirmed, and `fanOutForMatch` being private makes the parameterisation in place feasible. One incidental worry I checked and cleared: `BRACKET_KNOCKOUT_STAGES` does include `third_place`, so L10's knockout inversion is semantically identical for the World Cup.

### [CRITICAL] §8.3a's `league_snapshot_matchweek_ranks()` — the single new artifact C4 rests on — cannot be created. It is `LANGUAGE sql ... RETURNS integer` and its final statement is `UPDATE pool_entries pe SET previous_rank = f.previous_final_rank FROM frozen f WHERE pe.entry_id = f.entry_id;` with no RETURNING. PostgreSQL rejects that at CREATE time.

**Failure.** I ran the exact shape against the production database: `CREATE OR REPLACE FUNCTION public._probe_ret_int() RETURNS integer LANGUAGE sql AS $$ UPDATE pool_entries SET previous_rank = previous_rank WHERE false; $$;` returns `ERROR: 42P13: return type mismatch in function declared to return integer / DETAIL: Function's final statement must be SELECT or INSERT/UPDATE/DELETE/MERGE RETURNING.` L7 halts on its first migration statement. The return value is not decorative either — §4.3 step 1 destructures it (`const { data: frozen, error } = await admin.rpc('league_snapshot_matchweek_ranks')`) and L7's idempotence assertion is literally "call it again immediately and assert it returns 0", which §8.3a calls "the assertion that would have caught `league_pools_going_live`'s re-freeze". §1.11 sets the standard this block fails: "This code block is the artifact. There is no correction hidden in prose below it."

**Fix.** Make the mirror a fourth data-modifying CTE and end on a SELECT: `..., mirrored AS (UPDATE pool_entries pe SET previous_rank = f.previous_final_rank FROM frozen f WHERE pe.entry_id = f.entry_id RETURNING 1) SELECT count(*)::int FROM mirrored;`. Then fix the assertion that now becomes ambiguous: a first call that claims a matchweek while `league_entry_totals` is still empty also returns 0, so L7's idempotence test must compare `league_matchweeks.ranks_snapshot_at` before/after as well as the return value — otherwise "returns 0" cannot distinguish "nothing left to do" from "claimed but froze nothing".

### [CRITICAL] L8's exit criterion "`league_scoring_health` green on all fifteen assertions" is unsatisfiable, because §10.5's new C4 assertion contradicts §8.3a's own L8 backfill and is false for the first matchweek of every season. This is the same class of defect as C7 — a phase that cannot pass its own gate — arriving through a different door than the one the re-order closed.

**Failure.** §10.5 asserts "every league_matchweek with lock_at <= now() has ranks_snapshot_at NOT NULL AND, for every pool of a season with >=1 claimed matchweek and >1 entry, count(*) FILTER (WHERE previous_final_rank IS NOT NULL) = eligible_entries". Two ways that is red at L8. (a) §8.3a's mandatory L8 backfill sets `ranks_snapshot_at = lock_at` for every already-past matchweek *deliberately without freezing anything* ("so the first tick does not retro-freeze a season's worth of baselines") — so every backfilled matchweek is claimed with `previous_final_rank` NULL, and the assertion fails by construction the moment the backfill runs. (b) Even for a genuine matchweek 1 the claim fires at `lock_at`, when nothing has been scored and `league_entry_totals` holds no rows, so `frozen` returns zero rows and the assertion is red for the entire first matchweek. L7's seed pool is one synthetic matchweek, so an engineer running L8's verification against the seed pool the plan tells them to use gets a red health check with correct data and no defect to find.

**Fix.** Qualify the second half to seasons that have had a *prior* claimed matchweek, and exempt backfilled claims: assert `previous_final_rank IS NOT NULL` only for pools whose season has >=2 matchweeks with `ranks_snapshot_at IS NOT NULL`. Cheapest durable form: give the backfill its own marker (`UPDATE league_matchweeks SET ranks_snapshot_at = lock_at, ranks_backfilled = true`) and scope the assertion to `ranks_snapshot_at IS NOT NULL AND NOT ranks_backfilled`. Then correct L8's exit line so "all fifteen" is a number the phase can actually reach.

### [HIGH] §14.0's clean bill on question (a) is false for L2, and L2 is one of the phases it names explicitly. L2's exit criterion "`npm run lint` green with the three new rules" depends on L5, L6 and L14 — the phases that create the sanctioned homes and repoint the sites — so L2's exit criteria do depend on later phases.

**Failure.** I re-counted today: `.from('matches')` 95, `.from('predictions')` 46, `.from('pool_round_states')` 41 = 182 existing violations. `lib/fixtures/` and `lib/rounds/` do not exist in the repo at all (`lib/predictions/` contains only `revealGate.ts` and `__tests__`), and per the plan they arrive in L5 and L6; the mobile prediction sites are L14. `next.config.ts` fails the build on lint errors. So an engineer at L2 hits 182 errors and a red build, and §14.0 tells them there is nothing to find — it says "Checked phase by phase — L0 (no deps), L1 (no deps), L2 (no deps)". §14.0 is the artifact that certifies the whole re-ordering this revision is built on; a false negative in it is worse than the underlying lint problem, which §0.1 does at least disclose as carried-forward OPEN. Note the same recheck did surface two other defects, so it is not inert — it just skipped the one phase whose gate is a whole-repo assertion rather than a local one.

**Fix.** Two lines. In §14 L2, replace the verification with the baseline mechanism: ship each rule as an `overrides` block whose `files` glob excludes an enumerated list of today's violating paths, plus a CI check that the list never grows; restate the gate as "lint green; the three exception lists total exactly 182 entries; the no-growth check is wired". In §14.0, record L2 as a third known exception alongside L5 and L1 step 2 rather than listing it as "(no deps)" — the recheck's value is that it is believed, so an entry it gets wrong costs more than one it omits.

### [HIGH] C2 made `trg_league_adjustment_rescore` the sole owner of the adjustment→rescore path, but `league_rescore_on_adjustment()` has no printed body and neither it nor `league_rescore_pool` is declared SECURITY DEFINER anywhere in the document — while §1.12 puts deny-all RLS on the tables they must write.

**Failure.** C2 deletes `PERFORM league_rescore_pool` from `lite_recalc_entry` on the correct observation that both call sites UPDATE `point_adjustment` first (I verified `MembersTab.tsx:404-407` and `AdjustPointsSheet.tsx:152-160`). But that UPDATE runs on the admin's own `supabase` client as the `authenticated` role, so the AFTER trigger it fires runs as `authenticated` too unless the function is SECURITY DEFINER. §1.12 specifies "deny-all on `league_match_scores`, `league_entry_totals`, `league_fixture_state`, `league_score_events`". Grepping the document, the only two functions given SECURITY DEFINER are `broadcast_pool_leaderboard()` (line 544) and `league_snapshot_matchweek_ranks()` (line 1563) — so the omission reads as intentional rather than assumed. Unless declared, the rescore's writes are refused by RLS, the exception propagates out of the AFTER trigger, and the admin's whole `pool_entries` UPDATE aborts with a raw policy-violation string on a trigger attached to the table all 623 World Cup pools use. Separately, §8.5 gives the function only a comment — "first statement is the league test" — and §B row 14 only says the body "joins out via `pool_entries.member_id`", so the predicate and the guard both have to be invented on a live shared table.

**Fix.** Print `league_rescore_on_adjustment()` in §8.5 the way §8.3a prints its sibling: `LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'`, first statement `IF NOT EXISTS (SELECT 1 FROM public.pools po JOIN public.pool_members pm ON pm.pool_id = po.pool_id WHERE pm.member_id = NEW.member_id AND po.prediction_mode = 'league_pickem') THEN RETURN NULL; END IF;` (the same `prediction_mode` predicate C2 chose, for the same reason), and declare `league_rescore_pool` SECURITY DEFINER as well. Add to L7's verification: adjust `point_adjustment` on a World Cup entry **as an authenticated pool admin, not service-role**, and assert the UPDATE succeeds and the trigger is a no-op; then do the same on a league entry and assert the season re-scores.

### [HIGH] L6's exit criterion requires the create wizard to offer the Premier League, and L15's deliverable is making the create wizard offer the Premier League. The gating mechanism between them is named exactly once — in L15's *rollback* line, "flip `app/competitions.ts` and the catalogue filter" — and specified nowhere.

**Failure.** L6 ships "both create routes + the catalogue loader" and verifies "create a league pool through the real wizard and assert `pool_round_states` = 0 and `prediction_deadline` IS NULL". §7.1's loader unions `league_seasons` filtered only by `hasSeasonEnded(last_kickoff_at)`, and §7.1 tells `CreatePoolModal` to "Consume the catalogue loader" — I confirmed the only thing hiding leagues today is the hard-coded `.or('format.is.null,format.eq.groups_knockout')` at `CreatePoolModal.tsx:131`, which that change removes. So on the plain reading, Premier League 2026/27 appears in the live wizard at L6 — before scoring (L7/L8), reads (L9), XP and badges (L10), notifications (L11), UI (L13) and mobile (L14) exist. Every failure §6.3 enumerates then reaches real members, and §0.3's "the Premier League is off the create-pool wizard" quietly stops being true nine phases early. On the other reading, some unnamed filter keeps it hidden and L6 cannot execute its own verification. An engineer has to invent which.

**Fix.** Name the gate in §7.1 and give it a phase: `lib/competitions/catalogue.ts` takes an `includeUnreleased` argument (or reads a `league_catalogue_enabled` `sync_settings` key, defaulting closed), L6's verification passes the unreleased flag from a script rather than the browser, and L15's deliverable becomes "flip the one flag". State in L6 that the wizard stays closed to real users until L15 — that sentence is what stops the door drifting open during a nine-phase build.

### [MEDIUM] §3.3's six-edit list never states the one change that lets a league pool enter `computeReveal`'s rounds branch at all — the `pool.prediction_mode === 'progressive'` test at `revealGate.ts:56`. §R-v3's closure note claims "Corrected to `:56` in §3.3", and it is not there.

**Failure.** I grepped the whole document: `revealGate.ts:56` appears only in §0.4 (describing today's live leak) and in the historical §R-v3 closure text at lines 3026 and 3136. §3.3's edit 2 says only "branch on the mode inside `computeReveal`. Replaces `:51-69` and `:117-120`" and then spends its whole body on the `allowStateString` polarity — which is a decision *inside* the rounds branch. I verified the live code: `computeReveal` at `:56` is `if (pool.prediction_mode === 'progressive') { ...rounds... }` and everything else falls through to `isDeadlinePassed(pool.prediction_deadline, now)`. An engineer who implements edit 2 literally and leaves `:56` alone gets a league pool taking the deadline arm with `prediction_deadline` guaranteed NULL by §2's CHECK — `{revealed: false}` for every member, every matchweek, all season. Fail-closed, so it is not a leak, but it silently kills the shipped member-predictions-visibility feature for every league pool, and it is the identical failure §3.3 edit 4 exists to fix at `entries/[entry_id]/predictions/route.ts:108`. L6's verification would catch it — but only because C6 added the positive assertion; v3's version would have passed on an empty response.

**Fix.** Add it as an explicit edit in §3.3, worded the way edit 4 already is: "`revealGate.ts:56` — `if (pool.prediction_mode === 'progressive')` becomes `if (usesRounds(mode))`, so `league_pickem` takes the rounds branch; the `allowStateString` allow-list then decides whether the state string may be trusted inside it." And correct the §R-v3 LOW's closure note, which currently certifies a correction the body does not contain.

### [MEDIUM] `result_push_recipients IS NULL` is specified as a permanent alarm with no remediation path, because §1.4a forbids anything from clearing the claim that produced it.

**Failure.** §4.3 step 4a writes `result_pushes_sent_at` in `claimLeagueFixture()` before any send; §10.5 then alarms on `result_push_recipients IS NULL` for a completed fixture and §1.4a explains it as "claimed but the run died mid-flight". §1.4a's trap also states `league_release_score_events` must **never** clear `result_pushes_sent_at`, and nothing else writes it ("EXACTLY ONE WRITER"). So a drain that dies between the claim and the fan-out leaves a fixture that (a) can never be re-claimed, so its members never receive that result push, and (b) trips a health assertion that no documented action can clear. Over 380 fixtures and nine months this will happen; the health cron then carries a permanently red assertion, which is how a health layer stops being read. This is the price of the claim-before-send inversion C3 correctly restored, and it is the one consequence C3 does not name.

**Fix.** One sentence in §1.4a and one line in L8's runbook: recovery is a super-admin action that sets both `result_pushes_sent_at = NULL` and `result_push_recipients = NULL` for the named fixture, deliberately accepting the duplicate-push risk for that one fixture, and it is the *only* sanctioned second writer. Alternatively bound the claim — `WHERE result_pushes_sent_at IS NULL OR (result_push_recipients IS NULL AND result_pushes_sent_at < now() - interval '15 minutes')` — which keeps one writer and makes the recovery automatic; say which.

### [LOW] §5.1 and §14 L1 disagree about which step re-arms cron 8.

**Failure.** §5.1 row 8 says of `api-football-sync`: "Disarm in L0, re-arm in L1 step 9, add the league branch in L3". L1 step 9 is the `matches_stage_check` / `tournaments_tournament_type_check` revert and does not touch `cron.job`; the actual re-arm is in step 11's `UPDATE cron.job SET active = true WHERE jobid IN (8,18,19,20,21)` (asserting 5 rows, which is correct). An operator working the revert from the cron table rather than from §14 either re-arms the fixture sync at step 9 — while steps 9 and 10 still run against a database whose league rows have just been deleted — or leaves it disarmed believing step 9 covered it. Harmless today because the Premier League `tournaments` row is gone by then, but the two sections are the only two places the job's lifecycle is written down.

**Fix.** Change §5.1 row 8 to read "re-arm in L1 step 11". While there, note that step 11's assertion of 5 rows already encodes the correct set.
