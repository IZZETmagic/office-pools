# Podium bonus — remediation runbook

**Status: ✅ COMPLETE — 2026-07-21.** Fix committed (`ea8d9da`), deployed to production,
and the full re-score executed over all 524 classic pools. Final audit: `ADD=0 / REMOVE=0`
on all six lines. Progressive champion 164→505, runner-up 276→493, third 26→112;
full_tournament unchanged at 335/249/55. Landed with no comms, by decision.

Post-run cleanup done: rank arrows zeroed (`snapshot_pool_ranks`, 3,998 entries), 3 phantom
`user_pending_actions` dots cleared, `analytics_sweep_enabled` restored to true. Rollback
snapshots `_podium_before_20260721` (1,117 rows) and `_pool_entries_before_20260721`
(4,999 rows) left in place — drop them once you're satisfied.

⚠ The run **surfaced** an unrelated live data-loss bug (it did not cause it): one pool's
predictions had already been destroyed by the "Delete Pool" button, so the re-score
correctly zeroed 26 members. Their displayed totals were restored from snapshot.
See `2026-07-21_delete_pool_data_loss.md` — **that bug is still open and unmitigated.**

*(Everything below is the original pre-run plan, kept for the record.)*
**Owed at time of writing:** 669 podium bonus rows / ~324,375 pts. Note the "~250 pools"
figure below proved wrong — the damage concentrated in **~73 pools**; 50 saw rank changes
and 13 changed their #1.

---

## What broke (one paragraph)

The podium was assembled from three mutually-unaware inputs: a hand-typed actual
podium (`tournament_awards`, 8 readers / 0 writers), a cascaded-bracket heuristic for
the predicted podium applied in *every* mode, and mode-conditional glue applied in
only one of four consumers. The 2026-07-20 fix corrected the first input, so
full_tournament came out right. Progressive did not: its podium was read off a
bracket cascaded from group-stage picks, which is fiction in a mode where members
predict the real fixtures round by round. Re-scoring recomputed the same wrong answer.

Signature: entry `MQuintero` (pool `a2cd55c7-…`) picked Spain 2‑1 in the real final,
was paid `match_winner_correct` "Correct winner (Spain)", and denied `champion_correct`
in the same write, one second apart.

## What changed

| file | change |
|---|---|
| `lib/podium.ts` **(new)** | Single owner. `resolveActualPodium()` derives the podium from the completed final / third-place matches, with `tournament_awards` demoted to an optional admin override. `resolveEntryPodiumPick()` dispatches on a **required** mode discriminant. |
| `lib/tournament.ts` | `requireExplicitPick` option on `getKnockoutWinner`/`getKnockoutLoser` so the FIFA-ranking fallback can't fabricate a member's "pick". |
| `lib/bracketResolver.ts` | `resolvePredictedPodium` (and its phantom-runner-up ternary) deleted; `computeEntryPredictedPodium` is now a thin adapter; `predictionMode` required. |
| `lib/bonusCalculation.ts` | Podium scored against the derived actual podium; `predictionMode` required — the compiler now catches a forgetful caller. |
| `lib/scoring/shadowBrackets.ts` | Hand-forked copy of the derivation deleted, calls the shared function. |
| `app/api/pools/[pool_id]/bonus/calculate/route.ts` | Now fetches and passes `prediction_mode` (it silently defaulted to `full_tournament`), rejects `bracket_picker`, and writes `special_predictions` through the shared resolver. |
| `app/api/pools/[pool_id]/entries/[entry_id]/breakdown/route.ts` | Actual podium derived, not gated on the hand-typed row. |
| `lib/__tests__/podium.test.ts` **(new)** | 13 tests. There were **zero** podium tests before. |
| `scripts/audit-podium.ts` **(new)** | Read-only standing audit — the ops guardrail. |
| `scripts/recalc-classic-podium-fix.ts` | Aborts if `prod_scoring_enabled` is false, and treats "0 entries scored in a pool that has members" as a failure. Previously a run with the kill switch off printed `pools ok: 523, failed: 0` having written nothing. |

## Verification already done (read-only, no writes)

```
npx tsx scripts/audit-podium.ts
```

```
DERIVED podium (tournament_awards IGNORED): champion=Spain runnerUp=Argentina third=England [source=derived]
STORED  podium (tournament_awards row)   : champion=Spain runnerUp=Argentina third=England

===== PROGRESSIVE — 1910 submitted entries, 281 pools =====
  champion_correct       stored= 164  fixed-engine= 515  ADD= 352 (+306900 pts)  REMOVE=  1
  second_place_correct   stored= 276  fixed-engine= 503  ADD= 227 (+12925 pts)   REMOVE=  0
  third_place_correct    stored=  26  fixed-engine= 115  ADD=  90 (+4550 pts)    REMOVE=  1

===== FULL_TOURNAMENT — 1513 submitted entries, 243 pools =====
  champion_correct       stored= 335  fixed-engine= 335  ADD=0  REMOVE=0
  second_place_correct   stored= 249  fixed-engine= 249  ADD=0  REMOVE=0
  third_place_correct    stored=  55  fixed-engine=  55  ADD=0  REMOVE=0
```

- The first line is the permanence proof: with `tournament_awards` **ignored**, the engine
  derives the correct podium from `matches` alone. RC-0 cannot recur.
- full_tournament: **0 changes in all six directions** — the cascade contract is preserved.
- Tests 119/119 pass. `tsc` over the web app: 0 errors. Lint: identical to baseline
  (1029 problems, unchanged).

> ⚠ `npm run build` fails locally on `app/api/admin/branded-pools/upload-logo/route.ts`
> (`FormData.get`). **Pre-existing and unrelated** — `tsconfig.json` includes `**/*.ts`
> and only excludes the root `node_modules`, so React Native's global `FormData` from
> `mobile/node_modules` shadows the DOM one. Verified identical on a clean tree; with
> `mobile` excluded, `tsc` exits 0. Vercel doesn't install mobile deps, so prod builds pass.

---

## Run order — DO NOT re-score before deploying the code

Re-running the script against the old code is exactly what failed on 07-20.

### 1. Pre-flight

```sql
select setting_key, setting_value, updated_at from sync_settings
where setting_key in ('prod_scoring_enabled','shadow_read_enabled_pools',
                      'scoring_diff_writes_enabled','pool_cache_enabled');
-- REQUIRED: prod_scoring_enabled = true, shadow_read_enabled_pools = []
```

### 2. Snapshot for the diff and for comms

```sql
create table _podium_before_20260721 as
select entry_id, bonus_type, points_earned
from bonus_scores where bonus_category = 'tournament';
```

### 3. Deploy

Push to `Development` first for the Vercel pre-prod preview, then master when happy.

**Ship the scoring fix and the UI together.** `a818521`'s always-visible Tournament
Podium is already live and already wrong — a 40-entry replay returned a wrong country
40/40 times, never null. It is currently telling 352 progressive members in writing that
they picked a team they did not pick. A scoring-only deploy leaves it lying.

Do **not** OTA mobile until master is deployed — the mobile breakdown consumes the same
server-side derivation.

### 4. Re-score

Progressive is where 100% of the owed points are. Pushes are suppressed
(`SUPPRESS_PUSH_DELIVERY=true`), pools run sequentially, no time box.

```bash
npx tsx scripts/recalc-classic-podium-fix.ts                       # dry gate, writes nothing
npx tsx scripts/recalc-classic-podium-fix.ts --execute --limit=5   # canary
npx tsx scripts/audit-podium.ts --mode=progressive                 # verify canary
npx tsx scripts/recalc-classic-podium-fix.ts --execute             # full run
```

Coverage on the 07-20 run was provably complete (all 2,257 classic entries with a
match-104 prediction got a fresh `match_scores` row, and all 352 missing-champion
entries were among them) — the failure was derivation, not coverage. Nothing extra
is needed here.

### 5. Verify

```bash
npx tsx scripts/audit-podium.ts
# EXPECT: ADD=0 and REMOVE=0 on all six lines
```

```sql
-- Totals parity: bonus_points = SUM(bonus_scores) for every classic entry
select count(*) from pool_entries pe
join pool_members pm on pm.member_id = pe.member_id
join pools p on p.pool_id = pm.pool_id
left join (select entry_id, sum(points_earned) s from bonus_scores group by 1) b
  on b.entry_id = pe.entry_id
where p.prediction_mode in ('full_tournament','progressive')
  and coalesce(pe.bonus_points,0) <> coalesce(b.s,0);
-- EXPECT: 3 (known pre-existing orphans, unrelated to podium)
```

### 5b. Land it quietly (decided 2026-07-21)

No comms. 13 pools change their #1 and it flips silently. For that to actually
be quiet, three things have to be handled — otherwise the product announces the
run on its own:

**Before**
```sql
-- Stops the every-minute analytics sweep re-processing ~470 pools on top of the
-- run. Zero user impact: analytics_read_from_columns is false, nothing reads it.
update sync_settings set setting_value = 'false'::jsonb
where setting_key = 'analytics_sweep_enabled';
```
Also glance at cron job 10 (`push-matchday-recap`, hourly) — the final sits at the
edge of its 48h window. It is deduped by `push_matchday_recaps_sent`, but the run
rewrites `match_scores`, so confirm it has already fired for the final.

**After**
```sql
-- 1. Zero the rank arrows. current_rank moves while previous_rank stays frozen at
--    the last matchday snapshot, so every board would show large ▲/▼ deltas and a
--    "Biggest Climber THIS MATCHDAY" card for a tournament that ended on the 19th.
select snapshot_pool_ranks(array(
  select pool_id from pools where prediction_mode in ('full_tournament','progressive')
));

-- 2. Clear the phantom red dots. Badge detection writes user_pending_actions even
--    with pushes suppressed, so members get an in-app dot + iOS app-icon bump for a
--    notification that was never delivered. Scope to the run's window ONLY.
delete from user_pending_actions
where action_type in ('badge_unlock','level_up')
  and created_at >= '<RUN_START_UTC>'
  and completed_at is null;

-- 3. Re-enable the sweep.
update sync_settings set setting_value = 'true'::jsonb
where setting_key = 'analytics_sweep_enabled';
```

Expect a fresh batch of `shadow_score_diffs` from job 21 — shadow's podium is
starved, so those diffs are expected noise, not corruption.

### 6. Comms — NOT being sent (decided 2026-07-21)

352 members gain a champion bonus averaging ~872 pts; ranks move materially in ~250
progressive pools. Two entries are correctly retracted by the re-score:

| entry | pool | loses | why |
|---|---|---|---|
| `79e26b21-4c7e-4db8-a800-6a2a574ff0ef` "ThomasHyper" | `05e3f600-…` | 400 pts (`champion_correct`) | actually picked Argentina |
| `0472f1d8-431e-4294-b2ff-fb95db68e013` "Danjert" | `01a7cfb7-…` | 25 pts (`third_place_correct`) | actually picked France |

---

## Deliberately NOT in this change

Each verified, each a separate decision:

1. **bracket_picker has no runner-up bonus at all.** 173 submitted BP entries called
   Argentina exactly and get only generic semi-final credit. 96 of 99 BP pools also pay
   more for the third-place match (10) than for reaching the final (8). Adding
   `bp_runner_up` means changing BP leaderboards after the tournament ended.
2. **140 BP entries never scored** (`has_submitted_predictions=false`); 15 have a fully
   complete bracket that would pass the submit endpoint's own validation, 3 picked Spain.
   `lib/auto-submit.ts` counts rows in `predictions`, a table BP never writes, so the
   deadline sweep is structurally blind to BP. Fairness call, not a technical one.
3. **43 full_tournament entries with a single prediction hold ~2,026 bonus points each.**
   `resolveBracketCore` computes group standings from an empty prediction map, every team
   goes 0‑0‑0, and the FIFA tiebreaker orders each group by ranking — crediting a
   non-predictor with "predicting" the real group winners. Inflates ~87 pools.
   **This is the biggest remaining correctness issue found and is unrelated to the podium.**
4. **206 FT entries never predicted the final** — podium genuinely underivable. Correct
   as-is, but the UI gives them no explanation.
5. **127 FT entries in 5 pools** have podium bonuses admin-set to 0; the UI hides the
   section entirely, so "disabled" is indistinguishable from "broken".
6. **3 classic entries show 0 pts on the leaderboard** while `bonus_scores` holds 4,975
   pts (predictions wiped after scoring, orphan rows never deleted). Two of them hold
   `current_rank` 7 and 8 tied with members on 2,575 and 1,900 pts.
7. **Stale-row retraction hole:** both bonus writers scope their DELETE to entries present
   in the newly-computed set, so an entry whose computed bonus set becomes *empty* keeps
   its old rows. Bounded to 10 entries today; totals are not inflated (they're recomputed
   in memory), the damage is phantom line items in the breakdown UI.
8. **Shadow engine.** Its podium fork is now deleted, but it still has no
   `tournament_awards` observer and goes stale after bulk recalcs. Keep
   `shadow_read_enabled_pools=[]` until a **podium-level** parity check passes — total-points
   parity is blind here, because both engines currently produce the same wrong 164.
   Also `shadow-parity-alarm` (jobid 21) is still failing: `shadow_score_diffs.match_id`
   needs to be nullable.
9. **`best_player` / `top_scorer`:** 623/623 pools carry a 100-pt setting for bonuses with
   no pick UI, no calculator and no award ingest. Structurally un-earnable, still shown as
   editable in mobile scoring-config and super admin.
