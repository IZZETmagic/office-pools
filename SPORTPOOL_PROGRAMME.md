# SportPool Programme

Single source of truth for everything we want to build, fix, or decide — and for the
**decisions already made**, so they don't get re-litigated.

A *programme*, not a roadmap, because SportPool is now several distinct projects running under one
banner rather than one ordered list. Day-to-day delivery is still ordered by priority
(**Now → Later**) and tagged by category; the **Projects** below are the larger bodies of work those
items roll up into.

**Last updated:** 2026-07-25 · Renamed from `ROADMAP.md`; absorbed the product-decision record from
the multi-sport planning session (8 settled decisions, now under *Project: Multi-sport platform*).
· **2026-07-12:** full audit against the codebase — completed items moved to per-section **✅
Completed** tables; PARTIAL items annotated with what the code actually shows; post-deadline
prediction lock **shipped** (DB trigger), XL→Medium downgrade **done**, tie-break OTA **published**.
· **2026-07-19:** added *Boost banter engagement*, grounded in an organic banter-usage analysis
(~1,383 real messages / ~315 people; ~7% of members post, ~67% of feed is auto share-cards).

## Projects in this programme

| Project | What it is | Status |
|---|---|---|
| **Multi-sport platform** | Generalise the single World Cup product into a reusable multi-competition platform. Product decisions settled 2026-07-25; foundations still TODO. | 🔵 Designing |
| **Showdown / EPL launch** | H2H duels, persistent rivalries, and the first league season. Target Aug 2026. | 🔵 Designing |
| **Scale & scoring integrity** | Shadow engine, leaderboard precompute, IO reduction, scoring correctness. | 🟢 In flight |
| **World Cup wind-down** | Residual bugs, feedback surveys, knockout ops. | 🟡 Closing out |
| **Live match & rich football data** | Squads, line-ups, events, player pages. | ⚪ Not started |
| **Monetisation & cosmetics** | Sponsored pools, premium analytics, avatar IAP. | ⚪ Gated |

Each backlog item has four fields:

- **Is** — what it is, in plain English.
- **Touches** — the code / systems / tables it involves.
- **Effort** — rough order-of-magnitude estimate (not a commitment).
- **Done when** — the end goal and how we verify it.

**Legend** — Categories: `Bug` · `Scoring` · `Feature` · `Design` · `Mobile` · `Infra` · `Multi-sport` · `Ops`
Status: 🔥 active/hurting now · 🔒 blocked · ⏳ waiting on your timing call · ✅ done (verified in code 2026-07-12)

### The disclosure gate

Any mechanic that touches notifications, rewards, or social pressure must pass one question before
it ships:

> **Would it still work if you wrote its actual mechanism in a one-sentence tooltip?**
>
> *"We pre-built next season with your 14 members so you only have to confirm"* — passes.
> *"We hold your score back a day so you come back"* — fails.

Dark patterns are covert by definition. If explaining it kills it, it was manipulation. The full
five-gate version is under *Project: Multi-sport platform → Decision 8*.

---

## ✅ Recently shipped

> Completed and deployed to production. Kept here for visibility, then pruned once it's old news.

### HTTP security headers + security.txt `Infra` — SHIPPED 2026-07-11
- **What:** production HTTP hardening in `next.config.ts` `headers()` — `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=()/microphone=()/geolocation=()` on all routes; `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` on everything except `/tv/*` (frame-exempt via `/((?!tv/).*)`); plus a `security.txt`. Commit `d6d6042`, verified live on sportpool.io.
- **Watch for:** new embeddable surfaces must be added to the `/tv/*` negative-lookahead or they'll be frame-denied; `camera=()` will silently block future in-app photo *capture* (Avatars) until `camera=(self)` is allowed.

---

## 🔥 Now — active, can't wait

### "Delete Pool" destroys every member's predictions `Bug` `Data-loss` 🔥
- **Is:** `app/pools/[pool_id]/admin/SettingsTab.tsx:232-302` runs five un-transactional PostgREST deletes from the **browser**, predictions first. An RLS asymmetry makes it catastrophic: `predictions` DELETE is `is_pool_admin(pool_id)` (an admin can delete **everyone's**) while `pool_entries` has **no** admin DELETE policy, so step 2 silently deletes only the admin's own entry and **returns no error**. Any abort after step 1 leaves the pool alive with every member's predictions gone.
- **Impact:** **6 pools / 41 entries already destroyed**, the earliest in June — this has been happening quietly for weeks. **458 pools with an admin are one click away.** Risk is elevated post-tournament, when people tidy up pools.
- **Also:** `app/api/account/delete/route.ts` deletes predictions/entries/memberships across all pools at lines 33-85, then only checks "are you still a pool admin?" at line 90 — a pool owner who tries to delete their account keeps the account and loses everything everywhere.
- **Zero-deploy mitigation (verified safe, policy has one consumer):** `drop policy "Pool admins can delete predictions" on predictions;` → the button then fails loudly having destroyed nothing.
- **Proper fix:** server-side transactional delete (single Postgres function / soft-delete), move the account-delete guard to the top, add real `ON DELETE CASCADE`, and an alarm for non-`bracket_picker` pools with submitted entries but zero predictions.
- **Detail + full evidence:** `drafts/2026-07-21_delete_pool_data_loss.md`
- **Decision 2026-07-25:** the fix is **archive, not delete** — Delete Pool is removed from admins entirely, replaced with a reversible archive that keeps history; true deletion becomes a support action. Rationale: it destroys *other people's* data irreversibly on one person's tap, and once Crews keep history (*Project: Multi-sport platform → Decision 1*) it erases part of the crew's permanent record for everyone in it.
- **Status:** documented only, by decision 2026-07-21. **Not mitigated — still live.**

### Post-tournament feedback surveys — send them `Ops` ⏳
- **Is:** the two survey emails to pool admins (477) and non-admin players (3,652). Ready to fire, and time-boxed — the plan was "within ~1 week of the final."
- **Prep done 2026-07-21:** three blockers found and fixed, none of them visible from the "✅ built" status this item carried. **(a)** Every segment in `lib/email/segments.ts` silently truncated at PostgREST's 1,000-row cap — the player survey resolved to **146 recipients out of 3,958**, and a dry run would have reported that as the audience. Now paged via `fetchAll()` (all 15 segments, not just these two). **(b)** Both Tally forms were still **DRAFT** — every CTA 404'd. Published, and the "Anything else?" box that was marked required despite reading "Optional." is now optional. **(c)** No `maxDuration` on a ~41-batch send whose idempotency key is written *before* the first email; now `300` with 600 ms inter-batch pacing.
- **Also:** new `past_predictors_non_admin` segment so the 306 admin-and-player people get the admin survey only, never two emails. By decision, **no Resend topic** is attached — maximum reach, so per-category opt-outs aren't honored on these two sends.
- **Touches:** `lib/email/segments.ts`, `app/api/admin/send-template/route.ts`, `scripts/preflight-feedback-survey.ts`, super-admin **Templates** tab.
- **Blocked on:** a production deploy. The fix is local; the Templates tab runs against prod, so sending before the deploy resolves the old truncated audience *and* burns the idempotency key.
- **Runbook:** `drafts/2026-07-21_feedback_survey_send_runbook.md` — pre-flight, expected counts, and partial-send recovery.
- **Done when:** `npx tsx scripts/preflight-feedback-survey.ts` passes, both sends report 477/477 and 3,652/3,652, and responses are landing in Tally.

### Scoring config is internally inconsistent `Bug` `Scoring` 🔥
- **Is:** four defects in the pool-scoring settings, all verified in code 2026-07-25.
  1. **Three default sets disagree.** `app/api/pools/create/route.ts:5` gives new pools `group_exact_score: 100`; the engine fallback (`app/pools/[pool_id]/results/points.ts:69`) and the admin **Reset to defaults** button (`app/pools/[pool_id]/admin/ScoringTab.tsx:21`) both say `5`. **Pressing reset on a live pool rescales it ~20×** while leaving `bonus_champion_correct` at 1000 — turning the champion pick from ~10 group matches into ~200, and the other 103 fixtures into decoration.
  2. **The reset ladder is non-monotonic** — r16 `2`, QF `3`, **SF `2`**, 3rd `1.5`, final `3`. One click makes a semi-final worth less than a quarter-final.
  3. **`round_32_multiplier` is missing** from `SCORING_DEFAULTS` entirely — every new pool's first knockout round is priced by an unexamined column default.
  4. **Two settings are shown to members and read by zero scoring code** — `bonus_best_player_correct` / `bonus_top_scorer_correct` render at `ScoringRulesTab.tsx:382,386` **with a points value**. Members are looking at a rule that can never pay out.
- **Decision 2026-07-25:** **100/75/50 is canonical** — collapse to one exported constant. **Delete** the two dead bonuses from the UI and defaults. Fix the ladder's monotonicity and add `round_32_multiplier`. Longer term these are replaced by named presets (*Project: Multi-sport platform → Decision 6*).
- **Touches:** `app/api/pools/create/route.ts`, `app/pools/[pool_id]/results/points.ts`, `app/pools/[pool_id]/admin/ScoringTab.tsx`, `app/pools/[pool_id]/ScoringRulesTab.tsx`, `app/api/admin/branded-pools/route.ts`.
- **Effort:** ~half a day for 1–4; presets are a separate, larger piece.
- **Done when:** one constant defines defaults for every consumer, reset is non-destructive, the multiplier ladder is monotonic and validated on save, and no member-visible rule is unreachable by the scoring engine.

> Beyond that and the **recurring knockout ops** below, the master fix list from the June outages is fully resolved (verified in code 2026-07-12). Its residual threads are tracked as their own items: *Badge batch*, *Mobile*, *Post-deadline lock*, *IO reduction*.

### ✅ Completed (verified against code, 2026-07-12)
| Item | What shipped — evidence | Note |
|---|---|---|
| WC incident master fix list `Bug` `Ops` | Opening-day outage fixes all landed: per-match recalc (`app/api/cron/sync-fixtures/route.ts:401` → `recalculatePool({matchId})`), sweep overlap + time-box guard (`try_acquire_sweep_lock` RPC, `sweep_time_box_enabled` flag), phantom-diff fix, badge fraction bug (commit `4e920b0`). | Tracking snapshot, not a work item — residual threads live under other items below. |

## 🔁 Recurring each knockout round — SF/Final upcoming

> Not "done"-able — re-run **before every knockout round** or scores don't sync / pools don't open.

### Knockout fixture API-linking `Ops`
- **Is:** Knockout matches must be manually linked to the live data feed each round, or scores never sync.
- **Touches:** `scripts/map-knockout-fixtures.ts` (writes `external_match_id` onto `matches`); the api-football sync cron reads it. Auto-link path also exists (`lib/integrations/apiFootball/linkKnockoutFixtures.ts`) but only fires once api-football publishes the fixture.
- **Effort:** ~15–30 min per round.
- **Done when:** every knockout match for the round has an `external_match_id` and live scores flow. Done: R32 (06-28), R16 (07-04), QF (07-07 + #100 07-12), **both SFs linked 2026-07-12 (#101 France–Spain `1585131`, #102 England–Argentina `1586077`)**. Remaining: #103 (3rd place) + #104 (final) once teams resolve.

### Progressive round-open playbook `Ops`
- **Is:** Each round opens per-pool; super-admin bulk-opens the rest and (optionally) emails members.
- **Touches:** `pool_round_states` UPDATE (guard `state='locked'`); announce via `scripts/notify-r16-open.mjs` (Resend "Pool Activity" topic).
- **Effort:** ~30–60 min per round.
- **Done when:** all pools for the round are open by deadline. Done: R16 (07-04, 194 pools/796 emails), QF (07-07, 250 pools). Recurs SF/Final.

---

## ⏭️ Next — WC stability & scale

> These four overlap — they're one coordinated "get off expensive compute and scale to thousands" program, not four separate efforts.

### Leaderboard precompute (read-path flip) `Infra`
- **Is:** The leaderboard recomputes per-entry analytics on *every* page load; that's what saturated the DB in the June 16 outage. Precompute it once per score-change instead of per-view.
- **Touches:** read path `app/api/pools/[pool_id]/leaderboard/route.ts` + `app/pools/[pool_id]/LeaderboardTab.tsx`; storage = extra columns on `entry_xp_state`; writer = `analytics-sweep` cron + `lib/analytics/entryAnalytics.ts`. Backfill/cron **already live and verified no-op** (M1/M2 done); remaining is the **M4 read-path flip** (read columns, drop `force-dynamic`, add cache) behind flag `analytics_read_from_columns`.
- ⚠️ **Audit 2026-07-12:** M4 confirmed **not started** — the leaderboard route still imports `computeStreaks`/`computeFullXPBreakdown` and recomputes per-read (zero `entry_xp_state` reads); flag `analytics_read_from_columns` appears only in prose, never in code. The cited design doc `drafts/M4_read_path_flip.md` is **missing from the repo** — recreate it or drop the reference.
- **Effort:** ~2–3 days (calm-window deploy + load test). Bracket pools need a **separate** parallel-analytics track (~2–3 days more) — they score via `bonus_scores`, not `predictions`.
- **Done when:** backfill-vs-live parity = 0 diffs, the ~516ms leaderboard query drops to ~20ms, and a match-night load test holds on Medium compute.

### Scale downgrade XL→Medium `Infra` — ✅ DONE 2026-07-12
- **What happened:** Ryan downgraded XL→Medium himself as the tournament winds down. **Live-DB check 2026-07-12:** Phase-B was already 2/3 live — `pool_cache_enabled` **ON** and `scoring_diff_writes_enabled` **ON** in prod `sync_settings` (the earlier audit read the *code default* off, not the live value); only `sweep_time_box_enabled` remains off. Phase A hygiene applied 2026-06-30.
- **Still open (folds into other items):** flip the last flag `sweep_time_box_enabled` (crash fix), and **Phase D durable** — leaderboard precompute read-path flip + per-pool realtime broadcast, which is what keeps Medium comfortable at Showdown/EPL scale. See runbook `drafts/2026-07-12_xl_to_medium_downgrade_runbook.md`.
- **Watch:** CPU headroom / replication lag on the next live-ish window; the Phase-B flags are the rollback lever (bump compute back to XL if needed).

### Tournament IO reduction `Infra`
- **Is:** Punch list of background-IO cuts. **Largely done** — api-perf writer trimmed, policies consolidated, sync fan-out batched, per-match recalc + RLS initplan shipped; predictions auto-save is already a single round-trip (`predictions/route.ts:260`).
- **Touches:** Remaining open: drop 6 duplicate + 33 unused indexes (mechanical); realtime publication diet (remove tables that don't need live events — overlaps the broadcast migration).
- **Effort:** ~1 day for the index + realtime trims (pure DB migrations — no repo artifact to confirm).
- **Done when:** duplicate/unused indexes gone, realtime publication carries only tables that need it, no regression on a live day.

### Kickoff write spike `Infra`
- **Is:** At kickoff, a synchronous calc+write burst briefly spikes CPU (~4.3 on 2 cores) and replication lag. Recovered fine, but should be smoothed.
- **Touches:** the scoring sweep in `lib/scoring/recalculate.ts` + `app/api/cron/sync-fixtures/route.ts`; fix direction = precompute / batch / queue the burst.
- **Audit 2026-07-12:** `recalculate.ts` already batches (`batchSize = 50`, sequential `inBatches`, paginated reads) — the gap is a real queue/precompute, not zero mitigation. Folds into the precompute + scale work above.
- **Effort:** ~1 day incremental.
- **Done when:** kickoff no longer produces a CPU/replication spike on the Supabase graph.

### Shadow scoring engine `Infra` 🔒
- **Is:** A set-based, DB-native replacement for the Node recalc, running in parallel as a validation tool (not customer-facing). Match + bonus + rank parity-verified for group + R32; fully automated via reconciler crons.
- **Touches:** `shadow_*` tables (all 5 confirmed present: `shadow_resolved_brackets`, `shadow_score_diffs`, `shadow_match_scores`, `shadow_bonus_scores`, `shadow_entry_totals`) + RPCs, `lib/scoring/shadowBrackets.ts`, `app/api/cron/shadow-materialize/route.ts`, and reconciler **pg_cron** jobs (`drafts/2026-07-0*_shadow_*.sql`). Migration plan is read-path-first, reversible, pilot = mobile + one web pool via `shadow_read_enabled_pools`.
- **Effort:** low urgency near-term — it's a parallel tool. The durable knockout resolver that was deferred here **landed early (2026-07-11)** as part of the tie-break bug fix (shared prediction-only resolver); `shadow_resolved_brackets` was rebuilt on it (0 backfill errors).
- ✅ **Knockout parity RE-VERIFIED clean 2026-07-12:** fresh shadow-vs-live compare showed 392 knockout mismatches that were **100% staleness** (shadow last materialized 2026-07-10 18:47, before the 2026-07-11 tie-break live recalc). A forced `shadow_apply_changes` re-materialize dropped them to **0** (69,852 knockout match-score rows agree; end-to-end totals 3,416/3,418, the 2 residuals being orphan unsubmitted-entry rows). Shadow's knockout **logic is correct**.
- ✅ **Ground-truth correctness audit 2026-07-13:** validated the shadow bracket against **actual results** (not just vs live, which only proves reproduction): 0 scoring violations across 36,678 full_tournament knockout rows (0 false awards, 0 false denials, 0 points-on-wrong-teams); resolver qualification = exactly the 32 teams that reached R32; actual standings match an independent points/GD/GF ranking on all 48 group positions. Shadow bracket is **ground-truth-correct through the QF**, not merely live-parity.
- ✅ **Cutover-hardening shipped 2026-07-13** (DB objects live; `recalculate.ts` + `shadow-materialize` route changes pending a deploy): **(#4)** `v_shadow_worker_runs` repointed off the retired `shadow-drain-queue` to the live jobs; **(#3)** automated parity alarm `shadow_detect_diffs()` + `shadow-parity-alarm` pg_cron (jobid 21, `*/15`) writes `entry_total_mismatch` rows + reports coverage-by-mode; **(#2)** `shadow_dirty_pools` marker closes the bulk-recalc staleness gap — `recalculatePool` full recomputes (no `matchId`) flag the pool, the shadow-materialize cron drains + re-scores it (re-scoring completed matches so fresh brackets take, change-only so it's cheap).
- ⚠️ **Out of shadow scope (#1):** `bracket_picker` pools (1,012 entries / ~20%) have **no shadow arm** — scored by the separate `lib/bracketPickerScoring.ts`. The parity alarm's coverage report surfaces this (`bracket_picker: live 1012 / shadow 0`) so it can't be silently assumed covered at cutover. A bracket_picker shadow arm is a separate project, deferred.
- **Done when:** predicted brackets resolved once at entry submission (removing re-materialization); shadow read-path pilot (#5, deliberately deferred — direct customer impact) validated before any customer-facing flip.

### EAS OTA pending `Mobile` — ✅ SHIPPED 2026-07-12
- **What shipped:** production OTA of the Jul 11 tie-break resolver (`bracketResolver.ts`, `tournament.ts`, `usePredictions.ts`) to runtime `1.0.0` (last prod build 2026-07-06, unchanged runtime — verified via `eas build:list`; branch had zero prior updates). Published **native-only** (see *Mobile web-export* bug below): iOS update group `283a68d0…`, Android `5307e504…`, branch `production`.
- **Done:** testers on the ≥ Jul 6 build pull the update; mobile bracket display now matches the shipped web tie-break correction.

## ⏭️ Next — scoring correctness & data integrity

### Badge batch — persistence + semantics `Scoring` ⏳
- **Is:** The blatant fraction bug (Dark Horse/Upset Caller firing for everyone) is **already fixed** (commit `4e920b0`, verified live in `xpSystem.ts:256`/`:416`). What's left: (a) badges vanish on recompute because there's no persistence, and (b) a few badges whose copy ≠ logic.
- **Touches:** persistence = new append-only `badge_unlocks` table (see *Badge unlock history*); semantic fixes in `app/pools/[pool_id]/analytics/xpSystem.ts` — Contrarian Win (copy says "75%+", logic checks "differs from majority"), Lightning Rod (no deadline check), Quick Draw (24h measured from pool creation, not join); award-on-completion-only gating in `recalculate.ts` + `lib/push/badges.ts`; mirror every change into `lib/push/badges.ts` (push parity).
- ⚠️ **Audit 2026-07-12:** confirmed — `badge_unlocks` table **does not exist** (persistence not started; the only store is the *mutable* `entry_xp_state.earned_badge_ids` array, which shrinks on recompute); all 3 semantic mismatches still present; no completion gating (`detectAndPushBadgesForPool` fires after every write).
- **Effort:** persistence ~1–2 days; semantic copy/logic fixes ~0.5 day; completion-gating ~0.5 day.
- **Done when:** an earned badge never disappears across recalcs; each badge's copy matches its trigger; push and analytics never disagree.

### Post-deadline prediction lock `Bug` — ✅ SHIPPED 2026-07-12
- **What shipped:** DB trigger `trg_enforce_prediction_before_kickoff` on `public.predictions` (fn `enforce_prediction_before_kickoff`) — a `BEFORE INSERT OR UPDATE` row trigger that **silently skips** (returns null) any write to a match that has kicked off (`match_date <= now()`) or is completed. Migration `prediction_kickoff_lock`; SQL in `drafts/2026-07-12_prediction_kickoff_lock.sql`.
- **Why a DB trigger, not the route/RPC guard originally scoped:** predictions have four write paths with no shared app chokepoint — web `POST /predictions` → `save_predictions_batch` (SECURITY INVOKER), the web client's **full-set autosave** (`PredictionsFlow.tsx:377`), and **mobile's direct `.upsert()` in `usePredictions.ts` which bypasses every API route**. Only the row write is common to all. Silent-skip (not raise) is deliberate so a full-set batch still persists the still-open matches instead of failing wholesale.
- **Verified in prod:** a write to an upcoming match persists; a write to a completed match is skipped. Pre-fix footprint: 2,599 post-kickoff writes across 478 entries (latest 2026-07-11).

### Empty-bracket bonus inflation `Bug` `Scoring` ⏳
- **Is:** entries that predicted almost nothing collect most of the group bonuses. With no predictions a group's teams are all `played 0 / points 0 / GD 0`, so `calculateGroupStandings` falls through every tiebreaker to criterion 8, **FIFA ranking** (`lib/tournament.ts:398-414`) — and the resulting "predicted" table is just the seeded order, which is roughly what really happens. `calculateGroupStandingsBonuses` (`lib/bonusCalculation.ts:120`) gates only on the real matches being *complete*, never on the member having *predicted* them.
- **Same class as the podium's fabricated pick**, fixed in `ea8d9da` via `requireExplicitPick` (`lib/tournament.ts:641`); the group-standings path never got the equivalent gate. Criterion 8 is right as a cascade fallback, wrong as evidence of an opinion.
- **Measured (prod 2026-07-21):** 155 entries with 1–5 predictions all tournament — 66 full_tournament (avg **1,881** bonus vs **56** match pts) + 89 progressive (1,340 vs 233). A near-zero predictor earns **~77% of a full predictor's bonus** with ~2% of their match points. Tells: **994 `group_winner_and_runnerup` rows across 139 entries ≈ 7.2 of 12 groups called exactly right**, and `75pct_qualified_correct` fired for **140 of 140**. ≈ **243,000 pts** inflated.
- **Fix:** require the group's 6 matches (and, for the qualification bonus, all 48) to have been predicted before awarding; better, make an unpredicted group return an explicitly *unresolved* table so the phantom standings can't leak to any consumer. Regression test: zero group predictions ⇒ zero group/qualification bonuses.
- **Why deferred:** fixing it retroactively demotes ~155 real people (~87 pools move). Do it **before the next competition**, not during this one's wind-down.
- **Detail:** `drafts/2026-07-21_empty_bracket_bonus_inflation.md` · **Status:** deferred by decision 2026-07-21.

### Recalc orphan-row cleanup `Bug`
- **Is:** When an entry is un-submitted after being scored, its `match_scores` rows are left behind (11 seen in June).
- **Touches:** delete-scope logic in `lib/scoring/recalculate.ts` (currently only touches current entryTotals).
- ⚠️ **Audit 2026-07-12:** confirmed — deletes are scoped to `allEntryIds` derived from *submitted* entries only (`recalculate.ts:482`); an un-submitted entry drops out of that set, so its old `match_scores` are never touched. A one-off sweep is also needed to clear existing orphans.
- **Effort:** ~0.5 day.
- **Done when:** zero orphan `match_scores` rows for unsubmitted entries after any sweep.

### Perfect-group bonus `Scoring`
- **Is:** New optional scoring rule — bonus for nailing all 4 positions in a group. (Carson's feedback, May 2026.)
- **Touches:** scoring config (`ScoringRulesTab.tsx` + settings), bonus calc (`lib/bonusCalculation.ts` / `lib/scoring`), and the shadow engine mirror.
- **Audit 2026-07-12:** TODO — no perfect-group setting or award logic exists (`calculateGroupStandingsBonuses` only rewards winner/runner-up).
- **Effort:** ~1 day.
- **Done when:** admins can toggle it, it awards correctly on group completion, and shadow parity holds.

### Penalty-prediction redesign `Scoring`
- **Is:** Rework the "goes to penalties" knockout bonus so it can't be gamed by blanket check/uncheck. (George's feedback, May 2026.)
- **Touches:** ⚠️ **corrected 2026-07-12** — the gameable logic lives in `lib/bracketPickerScoring.ts:306` (+ emitted via `lib/scoring/bracket.ts`), **not** `lib/bonusCalculation.ts` as previously noted. It's a bracket_picker-mode rule; the full_tournament/progressive PSO path (`points.ts` `calculatePsoPoints`) predicts the actual shootout score and isn't gameable the same way. Interim workaround remains admins setting `bp_penalty_correct=0`.
- **Audit 2026-07-12:** TODO — logic still awards points whenever `predictedPenalty === actualWentToPenalties` (blanket strategy scores).
- **Effort:** ~1–2 days (needs a scoring-design decision first).
- **Done when:** the bonus rewards genuine skill, not a blanket strategy; verified against sample entries.

---

## 🚀 Post-WC near-term — Showdown / EPL launch (target Aug 2026)

### Showdown mode `Feature`
- **Is:** The flagship post-WC product — a head-to-head pick'em league. Every gameweek you're randomly paired with another pool member; beat their accuracy to take the points (3 win / 1 draw / 0 loss, 38-week season). Creates a personal league with named rivals and a "Banter Cup" side-pot. Full spec captured in notes.
- **Touches:** new pairing engine + duel-scoring model + `pool_templates`-style mode; reuses office mini-league, WhatsApp share, QR join, and OG-preview infra. Sub-tracks: **prep** (pairing engine, duel scoring, Banter Cup logic, schema on paper) · **animations** (Remotion server MP4 for the tunnel walk-out reveal, `next/og` previews, Reanimated + Skia in-app, Lottie hand-off) · **notifications** (below).
- **Audit 2026-07-12:** TODO — zero engine code (no pairing/duel/Banter-Cup/`pool_templates`); spec-only.
- **Effort:** multi-week epic — core ~1–2 wks, prep ~1 wk, animations ~1 wk.
- **Done when:** a 10-person pool can run a full season of weekly duels with correct scoring, standings, tiebreakers, and the Monday pairing reveal.

### Showdown notifications `Feature`
- **Is:** The engagement loop for Showdown — pairing-reveal push, duel-result push, Banter Cup standing-change push, plus deep links into the matchup card → reveal animation. Closes the virality loop (push → tap → reveal → screenshot → share).
- **Touches:** `expo-notifications` + existing `/api/notifications/*` endpoints + Resend; 4 new email templates; deep-link routing in the Expo app.
- **Audit 2026-07-12:** TODO — depends on Showdown mode; generic notification infra exists but nothing Showdown-specific is wired.
- **Effort:** ~4 days (launch-critical for Showdown).
- **Done when:** a completed gameweek fires the right pushes/emails and each deep-links to the animated matchup card.

### Avatars v1 `Feature`
- **Is:** Real profile avatars with an initials fallback. Gates Showdown matchup-card personalization.
- **Touches:** Supabase Storage bucket + `<Avatar>` component + upload UI (Expo + web) + profile screen.
- **Audit 2026-07-12:** TODO — only **initials-fallback placeholders** exist; no `avatars` bucket, no `avatar_url` column, no image upload (grep for `expo-image-picker`/`uploadAvatar` = 0).
- **Effort:** ~3–5 days.
- **Done when:** a user can upload an avatar that renders across web + mobile, with initials fallback when none is set.

### Match-day recap emails `Feature`
- **Is:** Replace the weekly recap with a per-match-day recap.
- **Touches:** `lib/push/recaps.ts` + `lib/email/resend.ts` + `AutomatedEmailsTab.tsx`; re-enable the email crons when a competition is live.
- ⚠️ **Audit 2026-07-12:** the matchday recap is **already built — but as an APNs push, not email** (`firePendingMatchdayRecaps` in `recaps.ts`, `app/api/cron/push-matchday-recap`, dedup table `push_matchday_recaps_sent`). No recap **email** template exists, and the **weekly** recap it was meant to replace is **still present** (`firePendingWeeklyRecaps` + `push-weekly-recap`). Remaining: decide push-vs-email, build the email template if wanted, retire weekly, confirm the cron is scheduled/enabled.
- **Effort:** ~1–2 days.
- **Done when:** a match day triggers one accurate recap (email if that's the decision); crons re-enabled and verified.

### ✅ Completed (verified against code, 2026-07-12)
| Item | What shipped — evidence | Note |
|---|---|---|
| Post-tournament feedback plan `Feature` | Both survey emails built — `poolAdminFeedbackSurveyTemplate` + `playerFeedbackSurveyTemplate` (`lib/email/templates.ts`), send route `app/api/admin/send-template/route.ts` (segments `pool_admins` + `past_predictors_non_admin`), super-admin UI `TemplatesTab.tsx`. | ⚠️ **"Built" was not "sendable" — see 2026-07-21 below.** Now ready; the two sends are the only remaining (ops) step. |

## 📋 Features — medium priority

### Badge unlock history `Feature`
- **Is:** Append-only record of badge unlocks so we can show "10× Lightning Rod" and per-badge timelines. (Also the persistence half of the Badge batch.)
- **Touches:** new `badge_unlocks` table + write on badge detection + read in the badge UI.
- ✅ **SHIPPED 2026-07-12 (capture half):** append-only `badge_unlocks` table (migration `badge_unlocks_history`; SQL `drafts/2026-07-12_badge_unlocks_history.sql`) + write in `lib/push/badges.ts` (idempotent upsert on every recalc) + one-time backfill of **15,934** existing unlocks. RLS: pool members can read their pools' unlocks.
- ✅ **Read half — web SHIPPED 2026-07-12:** `computeFullXPBreakdown` now takes `everEarnedBadgeIds` and unions them into the displayed badge set (display-only — XP/level stay on the live set; transient `top_dog` excluded). Wired in the web AnalyticsTab (lazy `badge_unlocks` fetch) + the entry-analytics route (so any mobile client consuming `/analytics` benefits server-side, no OTA).
- ✅ **Mobile also covered — no OTA (verified 2026-07-12):** the mobile FormTab, banter badge-flex, and activity feed all read badges from the **same `/analytics` route** (`FormTab` → `useEntryAnalytics` → `fetchEntryAnalytics` → `data.xp.earned_badges`); grep confirms **no mobile file reads `entry_xp_state.earned_badge_ids` directly**. So the server-side union reaches mobile as soon as the deploy is live.
- ✅ **Bracket-picker (`bp_*`) SHIPPED 2026-07-12:** `computeFullBPXPBreakdown` gained the same `everEarnedBadgeIds` display-only union; the `/bracket-analytics` route now **writes** earned `bp_*` badges to `badge_unlocks` (idempotent — both the pre-tournament submission-badge path and the full path) and passes ever-earned for the display union; web `AnalyticsTab` fetches + passes them. **Capture is server-side** (on any `/bracket-analytics` compute — mobile always hits it); the one edge is a web-only BP entry never computed server-side (no scoring-time BP badge path exists to hook, unlike full/progressive's `badges.ts`). **No BP backfill** — BP badges were never persisted anywhere to backfill from, so they populate lazily on next analytics view.
- **Done when:** unlocks recorded permanently + cumulative counts render — persistence, backfill, and the full/progressive **and** bracket-picker display all done. Remaining polish only: the profile trophy-case / cumulative-count *UI*, and the semantic/XP items under *Badge batch*.

### Super-admin project dashboard `Feature`
- **Is:** A lightweight visual of this roadmap inside super admin.
- **Touches:** a super-admin page reading `SPORTPOOL_PROGRAMME.md` (v1) — later possibly a `roadmap_items` table.
- **Audit 2026-07-12:** TODO — no roadmap tab in `SuperAdminDashboard.tsx`; no `roadmap_items` table.
- **Effort:** ~1–2 days (v1 read-only).
- **Done when:** the roadmap renders in super admin without hand-editing HTML.

### Creative pool-name award `Feature`
- **Is:** Admin-curated "hall of names" honouring great pool names. Lowest priority.
- **Touches:** a badge on the pool card (v1 = no voting/algorithm).
- **Audit 2026-07-12:** TODO — no code found.
- **Effort:** ~1 day.
- **Done when:** an admin can flag a pool name and a badge shows on its card.

### Enhanced super-admin stats `Feature`
- **Is:** New super-admin metrics — number of pool admins, average pool size, and how many users have deleted their account. `#SuperAdmin`
- **Touches:** the super-admin dashboard/stats page + aggregate queries over pools / members / deleted accounts.
- ✅ **SHIPPED 2026-07-12:** added to `app/api/admin/stats/route.ts` + surfaced in `StatsTab.tsx` — pool-admin count (`role='admin'` memberships: 606), average pool size (`totalPoolMembers / totalPools`), deleted-account count (`users.is_active = false`). Shown as overview-card subtitles (Users → "N deleted", Pools → "avg N", Predictions → "N admins").
- **Done when:** super admin shows admin count, average pool size, and deleted-account count, accurately — done.

### Lifetime trophy tracker `Feature`
- **Is:** Split the profile page's statistics section into its own navigable page with an achievements area — including cumulative counts of how many of each trophy/badge a user has earned. `#Achievements`
- **Touches:** profile page (web + mobile) → a dedicated stats/achievements sub-page; reads cumulative badge counts — depends on *Badge unlock history*'s append-only table for accurate lifetime totals.
- ✅ **Web v1 SHIPPED 2026-07-12:** the `badge_unlocks` gate is now satisfied (table built + backfilled). Added a **Trophy Case** section to the profile Statistics tab (`ProfilePage.tsx` `AchievementsSection`) — reads the user's `badge_unlocks` directly (RLS-safe), renders a tier-styled grid of every badge earned with cumulative "N×" counts (full/progressive + bracket-picker; Top Dog excluded as transient). Data path verified against real users (richest = Oracle 5× / Lightning Rod 5× / Stadium Regular 5×).
- ✅ **Per-badge timeline added 2026-07-12:** tapping a badge opens a modal listing which pools you earned it in (grouped by pool, with per-pool counts) + the date, via the `badge_unlocks → pools` FK. Data path verified (e.g. Oracle → Alabamaron22 ×3, Rochester ×2).
- **Known limitation:** timeline dates are the **backfill date** for pre-existing badges — accurate going forward; the *pool breakdown* is what's meaningful now.
- ✅ **All three follow-ups SHIPPED 2026-07-13:** (1) **left-pool fix** — additive `badge_unlocks` self-read RLS policy (`user_id` → `auth.uid()` via `users.auth_user_id`; migration `badge_unlocks_self_read`, draft `drafts/2026-07-13_badge_unlocks_self_read.sql`), so a user sees their own unlocks even in pools they've left; (2) **dedicated page** — the Trophy Case is now its own profile tab (`?tab=achievements`), moved out of Statistics with a full header; (3) **mobile** — a Trophy Case section on the mobile profile (`profile.tsx` `TrophyCaseSection`) reusing the `badgeIcon` medallions + cumulative counts (ships via OTA).
- **Remaining:** only the live-auth visual confirmation (can't render locally — types + data paths verified) and the mobile OTA push.

### Home-screen widgets `Feature` `Mobile`
- **Is:** Widgets so users see key info without opening the app — current pool rank, upcoming-match countdown, predictions still to make, recent leaderboard movement.
- **Touches:** iOS/Android home-screen widget extensions (WidgetKit / Expo) + a lightweight read API for the surfaced stats.
- **Audit 2026-07-12:** TODO — no widget/extension/app-group config anywhere.
- **Effort:** ~3–5 days.
- **Done when:** a user can add a widget showing at least rank + next-match countdown + outstanding predictions, refreshing sensibly.

### In-progress pool landing page `Feature`
- **Is:** A landing screen tailored to pools already underway (mid-tournament), surfacing what matters during play — current standings, recent results/movement.
- **Touches:** pool detail (web + mobile) — a mid-tournament layout variant keyed off pool/tournament state.
- **Audit 2026-07-12:** PARTIAL — the app already **defaults to the live leaderboard** on both platforms and rank-delta arrows exist (`LeaderboardTab.tsx:1106`, mobile `LeaderboardPodium.tsx:93`), but there's **no tournament-state-keyed layout variant** — the same static default serves pre/in-progress/completed pools alike.
- **Effort:** ~2–3 days.
- **Done when:** an active pool opens to an in-progress view that leads with live standings + recent movement.

### 2nd Chance Cup — full-tournament redemption `Feature` `Scoring`
- **Is:** A redemption side-game for `full_tournament` players whose locked bracket is busted. When the knockout stage starts, eligible players redraw predictions for the remaining matches and compete on a separate leaderboard — keeping busted players engaged.
- **Touches:** `full_tournament` mode — a second prediction set + separate leaderboard/scoring track + eligibility + an entry window at knockout start; scoring engine + shadow mirror.
- **Audit 2026-07-12:** TODO — no code found.
- **Effort:** ~1–2 weeks (new scoring track).
- **Done when:** after the knockout stage opens, eligible players can submit a fresh remaining-matches bracket that scores on its own leaderboard without affecting the main one.

### ✅ Completed (verified against code, 2026-07-12)
| Item | What shipped — evidence | Note |
|---|---|---|
| Admin member-management actions `Feature` | `app/pools/[pool_id]/admin/MembersTab.tsx` — view / adjust-points / unlock / promote / demote / remove / delete-entry; `point_adjustments` audit trail; mode-aware branches; mobile member-detail (`mobile/app/pool/[id]/member/[memberId].tsx`). | Full parity across all three modes. |
| Pool Info tab + non-admin leave `Feature` | Read-only Pool Info tab both platforms (web `PoolInfoTab.tsx`, mobile `PoolInfoTab.tsx`); leave via `/api/pools/[pool_id]/leave` (audit row + sole-admin guard); mobile stop-participating fix. | The PoolInfoTab 400-fix + leave are **in the pending EAS OTA** — live on web, not yet on testers' phones. |
| Activity tab — XP gains `Feature` | Mobile Activity tab real — `mobile/lib/useActivity.ts` synthesizes `xp_gain` items (match/bonus/badge XP), rendered in `ActivityCard.tsx`. | Mobile only; the web activity route stubs `xp_gain` ("NOT computed here yet") — web parity optional. |

## ⚽ Live match & rich football data

> A cluster from the board's "Others" column — richer team/player/match data plus live-match state. Mostly new api-football pulls + new detail screens; grouped so they can be built as one content system. **Audit theme (2026-07-12):** the api-football client only fetches fixtures/events/teams; the five "rich data" items below are all TODO and DB-gated. The live-state items are further along on **mobile** than web.

### Detailed team page `Feature`
- **Is:** Tap a team anywhere (fixtures, standings, predictions) to open a team detail page with its own tabs — squad list, honours/trophy history, etc. Parent for several items below.
- **Touches:** new team-detail route (web + mobile) + team data from the sports API (api-football).
- **Audit 2026-07-12:** TODO — no team-detail route; teams render as non-tappable flags+names.
- **Effort:** ~3–5 days.
- **Done when:** tapping a team opens a detail page with at least a squad tab and an honours/history tab.

### Full team squad `Feature`
- **Is:** A tab on the detailed team page showing the full team squad.
- **Touches:** the team-detail page (above) + squad endpoint from api-football.
- **Audit 2026-07-12:** TODO — no squad UI; api-football client has no squad/players endpoint.
- **Effort:** ~1 day (once *Detailed team page* exists).
- **Done when:** the team-detail page lists the full current squad.

### Player detail page `Feature`
- **Is:** Tap a player (from a squad, starting lineup, etc.) to see that player's history and detail.
- **Touches:** new player-detail route (web + mobile) + player data from api-football.
- **Audit 2026-07-12:** TODO — no player route or endpoint.
- **Effort:** ~3–5 days.
- **Done when:** tapping a player opens a page with their key history/details.

### Match line-ups `Feature`
- **Is:** A tab showing each team's line-up on a pitch appropriate to the sport (football pitch; formations like 4-4-2 / 4-2-3-1).
- **Touches:** match detail page + lineup endpoint from api-football + a pitch/formation renderer.
- **Audit 2026-07-12:** TODO — no lineup/formation code or endpoint.
- **Effort:** ~2–4 days.
- **Done when:** the match-detail page shows both line-ups on a pitch with formations, when the API provides them.

### Match events `Feature`
- **Is:** A tab (or section on the match-detail page) for in-match events — goals, red/yellow cards, subs — whatever the API exposes.
- **Touches:** match detail page + events endpoint from api-football.
- **Audit 2026-07-12:** TODO — `getFixtureEvents` IS fetched by the sync cron, but only **Card** events are kept (→ `match_conduct` for scoring); goals/subs are discarded, and there's no `match_events` table or events UI.
- **Effort:** ~1–2 days.
- **Done when:** the match-detail page lists match events (cards, goals, subs) for a live/completed match.

### Live match minutes (min / HT / FT) `Feature`
- **Is:** Show live match state — current minute elapsed, an HT indicator at halftime, FT at full-time.
- **Touches:** match cards/detail + live minute/status from api-football (`matches.live_minute`/`live_period` already populated).
- ✅ **Web SHIPPED 2026-07-12:** new shared `lib/matchStatus.ts` `getLiveClock` wired into the Results `MatchCard` — renders `45'`/HT/ET/PENS with the pulsing LIVE dot. Data already flowed (poolData `select('*')`); added the fields to `MatchData`/`ResultMatch` + mapping.
- ✅ **Bracket surface added 2026-07-12:** live clock + status wired into `BracketResultsTab` (knockout cells + Final/3rd-place cards), reusing `lib/matchStatus.ts`. StandingsTab intentionally skipped — it's group-stage standings and the group stage is complete (no live group matches). Remaining polish: explicit "FT" (currently implicit via the final-score box).
- **Done when:** live matches show the running minute, HT at halftime, and FT at full-time on **web** too — met for the Results tab.

### Match status notes (delayed / postponed / cancelled) `Feature`
- **Is:** Surface exception statuses — delayed, postponed, cancelled, abandoned, rescheduled — instead of assuming every match kicks off on time.
- **Touches:** match cards/detail + status detection (`matches.status_detail` + `original_match_date`; badging added in `00c4ae2`).
- ✅ **Web SHIPPED 2026-07-12:** `getMatchStatusBadge` (in the new shared `lib/matchStatus.ts`) wired into the Results `MatchCard` — Delayed/Postponed/Suspended/Cancelled/… render as amber/red pills. Mobile already had it.
- ✅ **Bracket surface added 2026-07-12** (`BracketResultsTab` cells + Final cards). StandingsTab skipped (group stage complete).
- **Done when:** a non-normal match clearly shows its exception status to users on **web** too — met for the Results tab.

### Key-match indicator (per player, in-pool) `Feature`
- **Is:** Flag a player's "key" matches in a pool — e.g. a very tightly predicted match, or one where the user's pick differs from the majority — to draw attention to high-leverage games.
- **Touches:** predictions/leaderboard views + a per-user/per-match calc comparing the user's pick vs the pool distribution.
- **Audit 2026-07-12:** TODO — only retrospective contrarian awards exist; nothing flags an upcoming/in-play match as key.
- **Effort:** ~1–2 days.
- **Done when:** a user sees their high-leverage matches flagged (contrarian pick and/or tight margin) in the pool.

### ✅ Completed (verified against code, 2026-07-12)
| Item | What shipped — evidence | Note |
|---|---|---|
| Live match indicator `Feature` | Web animated cues — `MatchCard.tsx` `animate-ping` "LIVE" dot, `StandingsTab`/`BracketResultsTab` `animate-pulse`; mobile LIVE cue on `LiveMatchCard`/`MatchResultRow`/detail header, all keyed off `status='live'`. | Mobile dot is static (not animated) — minor polish vs web. |
| Penalty-shootout scores on results `Feature` | Web `MatchCard.tsx:222` renders `PSO: h-a`; mobile `MatchResultRow.tsx:220` + match-detail header render `(h-a PSO)`; `home/away_score_pso` selected in read hooks. | ✅ **Already shipped** — supersedes the earlier "candidate to build" note. |

## 💬 Social & messaging

> Board "Others" cluster — connect players beyond a single pool's chat. Reuses the realtime Broadcast-from-DB infra from the July 2026 banter migration.

### Boost banter engagement `Feature` `Design` `Mobile`
- **Is:** Deepen engagement with the pool chat (banter) we already shipped — turn a mostly one-way feed into back-and-forth conversation and lift the share of members who ever post. A cluster of independently-shippable levers, not one build.
- **Why (data 2026-07-19):** organic banter = ~1,383 real typed messages from ~315 people across 118 pools — but only **~7% of members ever type**, **half of chatters post exactly once**, a **~30-person core drives a third** of all chat, and **~67% of the feed is auto "share cards" (badge-flex / standings-drop) that draw almost no replies**. Replies (<1%), @mentions, and reactions-on-text (from ~7 people total) are effectively unused. Activity spikes on match days → it's second-screen behaviour, so match-moment nudges are the biggest lever.
- **Levers (pick + sequence):**
  - **Match-moment push → chat** *(first slice)*: nudge members into banter at live beats (kickoff, goal, red card, full-time, big rank swing) via the existing push infra, deep-linking straight into the pool chat.
  - **Make share-cards conversational:** badge-flex / standings-drop / prediction-share cards should invite an inline reply or one-tap reaction instead of reading as a wall; consider auto-prompts ("Anyone catching Melanie? She just hit L9").
  - **Close the notification loop:** push/notify on @mention + reply so threads continue — today both are silent, so conversations die after one message.
  - **Discoverability:** surface the reaction / reply / @mention affordances on text messages (reactions come from ~7 people — the control is likely hard to find).
  - **First-message activation:** empty-state prompt + a re-engagement nudge for the 50% who posted exactly once.
- **Touches:** banter surfaces (mobile `usePoolBanter.ts` + `BanterSheet`, web `CommunityTab.tsx`); the rich-card types in `pool_messages.message_type` (`badge_flex` / `standings_drop` / `prediction_share`); push/email via `/api/notifications/*` + Resend + the match-day push cron; realtime Broadcast-from-DB infra (migration `022`).
- **Effort:** ~1–2 weeks for the full set; match-moment push ≈ 2–3 days as the first standalone slice.
- **Done when:** the share of members who post and the reply/reaction rate per message both climb against the 2026-07-19 baseline (illustrative targets: text-posters 7% → 15%, replies <1% → 10%).

### Direct messaging (1:1) `Feature`
- **Is:** Private 1:1 messaging between users, separate from pool chat. Today all chat is pool-scoped — no private conversations.
- **Touches:** a new DM data model + inbox UI (web + mobile); reuses realtime broadcast infra.
- **Audit 2026-07-12:** TODO — no DM/conversation table (confirmed no `direct_messages` table); all chat is `pool_messages`.
- **Effort:** ~1–2 weeks.
- **Done when:** two users can hold a private 1:1 conversation outside any pool.

### Admin messaging to pool members `Feature`
- **Is:** Let a pool admin message all members at once — announcements, reminders, nudges. Admins have no group channel today.
- **Touches:** an admin broadcast path → pool chat and/or push/email (reuses `/api/notifications/*` + Resend) + an admin UI entry point.
- **Audit 2026-07-12:** TODO — the only broadcast paths are **super-admin only** (`requireSuperAdmin`); no **pool**-admin → members path exists.
- **Effort:** ~2–3 days.
- **Done when:** an admin can send one message that reaches all pool members via in-app + push/email.

### Friends list `Feature`
- **Is:** Let users add each other as friends and keep a persistent cross-pool connections list. Today relationships only exist inside a shared pool.
- **Touches:** a new friends/relationship model + friend UI (add/list) + cross-pool surfacing.
- **Audit 2026-07-12:** TODO — no `friends` table; every `friend` hit is marketing copy.
- **Effort:** ~1 week.
- **Done when:** a user can add friends and see a persistent list that carries across pools.

### Picture sharing in chat `Feature`
- **Is:** Let players share images/screenshots in pool chat (brackets, results, banter, reactions). Chat is text-only today.
- **Touches:** chat composer + Supabase Storage upload + inline image rendering in the banter/chat list; ties to *Avatars v1* storage work.
- **Audit 2026-07-12:** TODO — banter composer is text + rich cards only; no image picker/upload/Storage bucket.
- **Effort:** ~2–3 days.
- **Done when:** a user can attach and send an image in pool chat and others see it inline.

### ✅ Completed (verified against code, 2026-07-12)
| Item | What shipped — evidence | Note |
|---|---|---|
| Chat auto-refresh / live messages `Feature` | Migration `022_banter_realtime_broadcast` (AFTER-INSERT trigger → `realtime.send` to private `pool:{id}`); both mobile `usePoolBanter.ts` and web `CommunityTab.tsx` subscribe to that private channel (`message_insert` + `reaction_insert`/`reaction_delete`) after `realtime.setAuth()`. Web converged onto the DB broadcast 2026-07-13 — dropped its old client-to-client rebroadcast, 5s poll, and `postgres_changes` reactions channel. Both surfaces update live. | Resolves the "back out two screens to see new messages" card. |

## 🎨 Design / UX polish — post-v1

### Migrate transactional emails to the new brand `Design`
- **Is:** Bring the rest of the email system onto the RN-app identity. The two feedback surveys were rebranded 2026-07-21 via a reusable `brandedTemplate()` (`lib/email/templates.ts`) — midnight header, gold accent strip, two-tone **Sport**​**Pool** wordmark (Nunito 900), primary-blue `#3B6EFF` CTA, tokens straight from `mobile/theme/colors.ts`. Every **other** template still renders through the legacy green (`#16a34a`) `baseTemplate()` (and `supportTemplate()` on slate `#1e293b`), so a user's inbox mixes old-green and new-blue Sport Pool mail.
- **Touches:** `lib/email/templates.ts` — repoint each template's `baseTemplate({...})` call to `brandedTemplate({...})` (same param shape, so it's near-mechanical): `deadlineReminderTemplate`, `roundDeadlineReminderTemplate`, `pendingPredictionsReminderTemplate`, `emptyPoolNudgeTemplate`, `soloPoolNudgeTemplate`, `smallPoolBoostTemplate`, `startAPoolTemplate`, `weMissYouTemplate`, `readyToJoinTemplate`, `pastPredictorHypeTemplate`, `bracketFixTemplate`, `pointsAdjustedTemplate`, the `custom` path, and the automated crons. Decide whether `supportTemplate` keeps its distinct "Support" header or folds in too.
- **Watch for:** per-template inline body colours — most bodies hard-code neutral `#525252`; on the new white surface that still reads fine, but sweep for any green (`#16a34a`) accents inside bodies/buttons that would now clash. Semantic colours (`pointsAdjustedTemplate`'s +/- green/red) are intentional — leave them. Re-render each through Resend to a test inbox before shipping; `@import` Nunito degrades to system fonts in Gmail/Outlook by design.
- **Effort:** ~half a day (mechanical swap + a visual pass on all ~15).
- **Done when:** every customer-facing email renders the new brand; no template still calls the green `baseTemplate`.

### Banter sheet polish `Design`
- **Is:** Smooth out the banter sheet — reaction long-press, quick-actions anchoring, and verify share-prediction + badge-flex against real data.
- **Touches:** `mobile/components/.../BanterSheet` + reaction/quick-action components.
- **Audit 2026-07-12:** PARTIAL — sheet is feature-complete (long-press + anchoring wired); remaining is subjective smoothness + real-data verification of share/flex.
- **Effort:** ~1–2 days.
- **Done when:** interactions feel smooth and share/flex render correctly with real data.

### Round / match-week label on upcoming matches (mobile) `Feature` `Mobile`
- **Is:** On the Predictions tab, label each upcoming match with the round it belongs to, using competition-appropriate wording — "Match Week 3" (EPL), "Round of 16" (WC knockout).
- **Touches:** `mobile/components/pool-detail/PredictionsTab.tsx` + `MatchPredictionRow.tsx` / `components/home/UpcomingMatchCard.tsx`; reads round/stage off the match plus lock state.
- **Audit 2026-07-12:** PARTIAL — label infra exists (`usePoolRounds.ts` `ROUND_LABELS`, shown on the entry status pill + wizard headers) but the per-upcoming-match rows carry no round label; wording is WC-only.
- **Effort:** ~0.5–1 day.
- **Done when:** a non-admin member sees the correct round/match-week label on upcoming matches, with wording matching the competition.

### Members' / all predictions after lock `Feature` `Mobile`
- **Is:** An **all-members** feature — once predictions lock, **any** member can see every *other* member's predictions, presented as a **read-only replay of the prediction wizard flow**. Same view on **web** too.
- **Touches:** a new section/list in `PredictionsTab.tsx` + a **read-only reuse of the wizard UI** (`BracketPickerWizard.tsx` / `ProgressivePredictionWizard.tsx`) + a read of all pool entries' `predictions`; plus a web equivalent.
- ⚠️ **Audit 2026-07-12:** PARTIAL — the read-only wizard replay is **built but admin-gated** (`readOnly` prop reached only via `?viewAs=admin` from the admin Members drill-down). Remaining = expose it to **any** member after lock (mobile + web); no web equivalent yet.
- **Effort:** ~1–2 days (mobile) + ~0.5–1 day (web).
- **Done when:** after lock, any member can browse every other member's predictions on mobile and web. ⚠️ Reveal **only after lock**, or it becomes a pre-deadline cheat sheet.

### Tab-swipe jitter (mobile) `Mobile`
- **Is:** Swiping left/right between pool tabs is janky — not clean or smooth.
- **Touches:** the pool-detail tab pager + `mobile/components/pool-detail/PoolTabBar.tsx`. ⚠️ A **different** tab issue (bottom-tab size-pop) was already fixed with `enableScreens(false)` — load-bearing, don't touch; per-tab Reanimated `entering` wrappers + `detachInactiveScreens={false}` were tried and **don't** help.
- **Audit 2026-07-12:** TODO — pager impl is reasonable (Reanimated SharedValue sync) but no fix commit / profiling evidence.
- **Effort:** ~1–2 days (investigation-heavy).
- **Done when:** tab swipes hold ~60fps with no dropped frames on a mid-tier device.

### Chat scroll jitter (mobile) `Mobile`
- **Is:** Scrolling the banter/chat is janky; needs to be smoothed out.
- **Touches:** `BanterSheet.tsx` + `mobile/app/pool/[id]/banter.tsx` + `mobile/lib/usePoolBanter.ts`. Prime suspects: list virtualization, re-renders on every realtime message, scroll inside the gorhom sheet.
- **Audit 2026-07-12:** TODO — `GiftedChat` (inverted FlatList) is the named suspect; only an open-latency mount fix exists, no scroll-jitter/virtualization work.
- **Effort:** ~1–2 days (investigation-heavy).
- **Done when:** chat scrolls smoothly at ~60fps, including while new messages arrive live.

### App-loading splash screen `Design`
- **Is:** Remove the `SP` app-icon flash shown during app open *before* the splash screen — go straight to the splash, or use the same blue. `#SplashScreen`
- **Touches:** app launch/splash config (Expo splash + iOS launch screen).
- **Audit 2026-07-12:** TODO — `expo-splash-screen` + a custom `Splash.tsx` smooth the native→JS handoff, but nothing addresses the pre-splash cold-start icon frame.
- **Effort:** ~0.5 day.
- **Done when:** app open shows a single clean splash (or matching blue) with no stray icon frame.

### On-theme trophies `Design`
- **Is:** Redesign the Form-tab trophies/badges so they fit the app's design system — the current ones work but feel off-theme. `#Achievements`
- **Touches:** badge/trophy visuals in the Form tab. Cross-refs *Form tab polish* + *Badge batch*.
- ✅ **Web SHIPPED 2026-07-13:** all **23** v4 medallions (12 full/progressive + **11 `bp_*`** — the bracket art DID exist, contra the earlier "SF Symbols" note) are web-optimized into `public/badges/` (resized 160px, 588 KB total) and rendered via a shared `<BadgeMedallion>` (emoji fallback for any id without art) in the profile **Trophy Case** + the pool **analytics badge grid** (`XPProgressSection`). Web badges now match the mobile medallions instead of bare emoji.
- **Effort:** ~1–2 days (design + asset pass) — web done; mobile already uses the medallions.
- **Remaining:** mobile Form-tab `bp_*` fallback can now point at the real art (it exists); any badge without a medallion still shows emoji.
- **Done when:** trophies/badges match the design system — done on web; mobile parity for `bp_*` is the tail.

### ✅ Completed (verified against code, 2026-07-12)
| Item | What shipped — evidence | Note |
|---|---|---|
| Form tab polish `Design` | `mobile/components/pool-detail/BadgeDetailSheet.tsx` wired into `FormTab.tsx` + `BPFormTab.tsx`; tapping a badge cell opens a sheet showing its earning condition. | — |
| Slide-up save button `Design` `Mobile` | Dirty-state sticky footer — `hasChanges` gates an absolute-positioned `SaveBar` in `SettingsTab.tsx` + `scoring-config.tsx`, with content padding reserved. | — |

## 🐞 Bugs — triage (unsorted severity)

> Captured from the board's "Bug" column. Severity not yet assessed — promote into the sections above as they're triaged.

### Mobile web-export breaks `eas update --platform all` `Bug` `Mobile`
- **Is:** `eas update` with its default `--platform all` fails during the **web** export's static render — `mobile/lib/supabase.ts:16` calls `expo-secure-store`'s `getItemAsync` in a Node context where the native module doesn't exist (`getValueWithKeyAsync is not a function`), aborting the export. Native iOS/Android bundles export fine. Hit during the 2026-07-12 tie-break OTA.
- **Touches:** `mobile/lib/supabase.ts` auth-storage adapter — guard SecureStore behind `Platform.OS !== 'web'` with a web/SSR-safe fallback. Web isn't a shipped Expo surface, so the **interim workaround is `eas update --platform ios` + `--platform android`** (what shipped the tie-break OTA).
- **Effort:** ~0.5 day.
- **Done when:** `eas update` (all platforms) completes without the SecureStore crash.

### Align quick-chat rich cards (web vs mobile) `Bug` `Design` `Mobile`
- **Is:** Rich cards in quick chat render differently on web vs the React Native app; they should look the same. `#BanterChat` `#Mobile`
- **Touches:** rich-card rendering in banter/quick-chat on both web and `mobile/`.
- **Audit 2026-07-12:** TODO — two separate implementations with **divergent metadata contracts** (web writes `entries`/`badges`; mobile reads `top_entries`/`badge_count`), so a card authored on one platform falls back to plain text on the other.
- **Effort:** ~1–2 days.
- **Done when:** a given rich card looks consistent across web and mobile.

### Pending-submissions logic (multi-entry) `Bug`
- **Is:** Fix the "all entries submitted?" logic for pools that allow more than one entry per user — the mobile "pending" notice should account for *all* of a user's entries. `#EntrySubmission`
- **Touches:** the submission-status checks (mobile dashboard notice + related surfaces) for multi-entry pools.
- **Audit 2026-07-12:** TODO — `useHomeData.ts:555` keys `needsPredictions` to the single best entry, not all entries.
- **Effort:** ~0.5–1 day.
- **Done when:** multi-entry pools correctly report submitted vs pending across all of a user's entries.

### Live-update tabs on member removal `Bug`
- **Is:** When a pool admin removes a member, all tabs should live-update — e.g. the Fees tab should immediately reflect the reduced pot. `#DeleteMember` `#LiveUpdates`
- **Touches:** member-removal path + live refresh of dependent tabs. Relates to *Admin member-management actions*.
- ⚠️ **Audit 2026-07-12:** PARTIAL — web `MembersTab` **does** call `/recalculate` (contrary to the board framing); the real gap is **no web realtime `pool_members` subscription** (mobile has one), so other viewers don't live-update. Also mobile removal omits the recalc call.
- **Effort:** ~1 day.
- **Done when:** removing a member updates every affected tab without a manual refresh.

### Match-detail page bug (app dashboard) `Bug`
- **Is:** A reported bug on the match-detail page reached from the app dashboard. Card has no detail.
- **Touches:** TBD — match-detail page in the mobile app.
- **Effort:** TBD — needs repro/specifics first.
- **Done when:** the (to-be-specified) match-detail issue is reproduced and fixed. ⚠️ **Needs specifics before it's actionable.**

## 📱 Mobile

### Pool card: level + form dots wrong (mobile) `Bug` `Mobile`
- **Is:** On the "Your Pools" tab, pool cards show correct **rank** and **points**, but the **Level** doesn't match the pool-detail Form tab and the **form dots** are missing or incomplete.
- **Touches:** two distinct root causes, both spanning `mobile/lib/useHomeData.ts` + `mobile/components/pools/PoolListItem.tsx`:
  - **Level** — the card computes `getLevel(pool.totalPoints)` (a *points*-based table) while the app shows an *XP*-based `current_level`.
  - **Form dots** — built from an unbounded `match_scores` query (`.in('entry_id', allEntryIds)`, no `.limit()`), so entries past PostgREST's 1000-row cap get empty/partial dots.
- **Audit 2026-07-12:** TODO — both root causes confirmed still present; `useHomeData.ts` never reads `entry_xp_state`. **Note:** `entry_xp_state` has `current_level` but **no `last_five` column** — the durable form-dots fix needs it added.
- **Effort:** ~0.5–1 day.
- **Done when:** the card's Level matches the Form tab and form dots render the correct last-5 for every pool. **Durable fix:** source both from precomputed `entry_xp_state` columns (`current_level` + a new `last_five`). Folds into *Leaderboard precompute*.

### Mobile error triage `Mobile`
- **Is:** Deferred residuals from the June error review.
- **Touches:** `user_presence` RLS failures (172k failed inserts); push-cron duplicate-key races (need `ON CONFLICT`); bracket-picks mobile submit gating.
- ⚠️ **Audit 2026-07-12:** PARTIAL — **2 of 3 done**: push-cron dedup ✅ (claim-on-insert pattern across all `push_*_sent` tables), bracket submit gating ✅ (`BracketPickerWizard.tsx:162`). Only `user_presence` RLS remains (a DB-side policy; also ships with the presence OTA).
- **Effort:** ~0.5–1 day (presence RLS only).
- **Done when:** zero presence RLS errors, zero duplicate-key errors, and bracket submit gates correctly on mobile.

### Expo migration eval `Mobile`
- **Is:** Evaluate replacing the Swift iOS app with Expo/RN for iOS + Android (post-WC).
- **Touches:** decision/spike, not a fixed build — assess feature parity + store deployment.
- **Audit 2026-07-12:** TODO (as a formal deliverable) — effectively **in progress**: the `mobile/` Expo app is already the go-forward customer surface; only the written go/no-go is outstanding.
- **Effort:** large — a scoping spike first, then a phased build if greenlit (weeks).
- **Done when:** a go/no-go decision with a scoped plan.

### ✅ Completed (verified against code, 2026-07-12)
| Item | What shipped — evidence | Note |
|---|---|---|
| Push + banter notification parity `Mobile` | `usePoolBanter.ts:620/639` call `notifyMessage`/`notifyMention` → `/api/notifications/{message,mention}` (`api.ts:594/575`); comment confirms it matches the Swift app's dual-endpoint behavior. | On-device confirmation after the OTA ship is the only follow-up. |

---

## 🌍 Project: Multi-sport platform

> Generalize the single World Cup product into a reusable multi-competition platform. **Audit 2026-07-12:** the foundations are genuinely **TODO** — the schema is hardcoded to a single tournament (`00000000-…-0001`, 63 files reference `tournament_id`, zero reference any competition abstraction); ingestion is one api-football integration with no adapter; no `pool_templates`/`survivor`/catalog exists.

**Product decisions below were settled 2026-07-25** and are not open for re-debate without a reason.
The *why* is recorded alongside each so the argument doesn't have to be re-run. Research behind them:
competitor UX across 14 platforms, a pool-format taxonomy, and behavioural research on retention and
organiser motivation.

---

### Decision 1 — The durable object is the Crew

A **Crew** is permanent. A **pool** (one crew playing one competition) is time-boxed and archives.
Today those are collapsed into one row — which is why the same group re-assembles from scratch every
season, and why the current `lifecycle` vs `accepting_members` work is harder than it should be (two
lifetimes modelled on one row).

- **Plural.** A person belongs to many crews — work, five-a-side, family. They overlap and have
  different tones. *This is why a single flat "people you've played with" list is the wrong shape:
  it merges distinct social circles.*
- **Keeps history** — all-time record, past seasons, rivalries.
- **Three ways to create, no gate:** (1) at pool creation — *"Save these 12 as a crew?"* — the
  primary path; (2) directly, any time; (3) discovered from a repeat group, as a **fallback**.
- **Captain + co-captain from the start.** Creator is captain. Co-captain exists day one so a crew is
  never frozen behind one dormant person.
- **Captain ≠ pool admin.** Captain owns *people*; a pool admin owns *one season*. Lets the
  season-running role rotate while the crew stays stable — and creates new admins from inside a group
  that already exists.
- **Any member can start a pool**; they become that pool's admin, and it still counts as the crew
  playing (carries crew history).
- **A crew can run several pools at once** — the office does the World Cup *and* March Madness.
- **Removal = "stops getting invited", not "erased".** History survives; the removed person is not
  notified.
- **Banter stays per pool**, not per crew.

### Decision 2 — Crews join a new season by held seat

Crew membership is consent to the **group**, not to every **competition**.

- **Held seat** — a reserved, visible spot (*"your spot's saved, picks lock Friday"*), shown as
  **pending**, not as an entry. **Releases at first lock** if unused, so there are no ghost entries
  on zero and nobody is publicly shown having failed to turn up.
- **Pool stays joinable after first lock** for long competitions — week 3 of 38 is viable; a bracket
  is not.
- *Why:* auto-join makes the **pool** pay (dead leaderboard); invite-only makes the **captain** pay
  (chasing — the second-most-cited reason organisers quit). The held seat makes the **platform** pay.
- **One reminder**, SportPool-branded. **Never in the captain's name** — LinkedIn survived the
  contact import and the first invite in *Perkins*; it lost $13M over reminders sent in users' names.
- **Roster review screen with reasons** ("email bounced", "never picked last season", "dormant 6
  months"). All checked by default except hard failures. A service to the captain, not a chore.
- **Run it back** stays as the one-tap shortcut: carries **the admin's own past setup** (competition,
  format, scoring), with **the crew chosen separately** — so "same setup, different group" is
  first-class. Guard against a crew already playing that competition.

### Decision 3 — The format screen stays, as a one-tap confirmation

- Recommended format **pre-selected**; primary button names it (*"Continue with Score Predictor"*).
  **Skipped entirely** when only one format exists, and by Run it back. Shows crew history.
- *Why keep it:* **the formats are the product.** For a multi-sport app, the fact a league crew can
  play Score Predictor, Last Man Standing or Final Table *is* the range. Hiding it makes SportPool
  look like a one-trick pick'em app.
- **A format is a named preset that carries its own scoring.** The admin chooses a game, never
  assembles one.
- **Crew selection lives on the name screen:** *Name · Crew · Who can join · Create*. "No crew" is
  valid → share-link path, then *"save these people as a crew?"*.

### Decision 4 — Sport filters, tournament ranks

- **Sport is asked once in onboarding** (~9 options, one screen, skippable) — not in the wizard. It
  powers the create picker, Discover, **and** "starting soon" notifications.
- **Filter on by default**, with a visible "Only sports I follow" toggle.
- **Event-driven breakthrough** — a competition punches through only when *starting soon* **and**
  *big*, honestly labelled. **Dismissible for that season.** Deliberately rare: a permanent "other
  sports" shelf becomes furniture.
- **Tournament preference ranks; it never filters.** Chips expand within the same onboarding screen;
  tap nothing and you get the whole sport. *A Premier League fan still wants the World Cup — narrowing
  must never hide a major event in a sport they follow.* Plus "Notify me" per competition, and derive
  the rest from behaviour.

### Decision 5 — Discover lists all public pools

- **All pools set to public are listed** — not a curated shelf. **Quality is a ranking problem, not a
  membership problem:** sort by joinability, share who actually picked, fill velocity, proximity to
  start. Dormant pools are listed but sink.
- **Honest state on every card** — *"Opens 8 Aug · 12 joined"* / *"Live · matchweek 3"* / *"Closed"*.
- **Three-way privacy:** private · **unlisted** *(stays the default)* · **listed** (opt-in).
- **Report path + fast unlist** — a listed pool is content published under our logo.
- **Official SportPool pools per major competition** — always live, guaranteed-good first experience
  for a crewless user, and a controlled surface for testing formats. Branded-pool machinery exists.

### Decision 6 — Scoring: one canonical scale, presets, locked at kickoff

- **100 / 75 / 50 is canonical.** Collapse the three disagreeing default sets into one exported
  constant. See *Scoring config is internally inconsistent* under 🔥 Now.
- **Named, versioned presets for new pools**, replacing the 43-knob surface. *(Assumed: the 622
  existing pools are grandfathered — re-scoring finished pools would be indefensible. Not explicitly
  ruled.)*
- **"Advanced" means a different game, not different numbers** — an admin asking for advanced scoring
  wants a confidence ladder or upset bonus, not `quarter_final_multiplier = 3.7`.
- **Scoring locks at first kickoff**, enforced by a **DB trigger** — mobile writes directly, so the UI
  is not a gate. Same lesson as `trg_enforce_prediction_before_kickoff`. Super-admin override requires
  a written reason and notifies members.
- Comparable scoring across pools is a **hard prerequisite for Showdown** — H2H duels need comparable
  weekly scores.

### Decision 7 — Platform as referee; admin keeps real powers up to kickoff

Admins don't quit from workload. A study of 71 lapsed community moderators found **conflict and time
ranked above workload**, with high emotional exhaustion and low task stress. They quit over the
argument, not the admin panel.

- **Platform enforces** locks, deadlines, round opening, reminders, scoring — **and says so in the
  UI** (*"SportPool locked picks — your commissioner can't change this"*), giving the admin something
  to point at. **Admin chooses** format, preset, roster, tone, house rules.
- Automate the *chores*, never the *choices* — removing judgment and autonomy together turns the
  commissioner into a spectator with a title.
- **Auto round-opening is a prerequisite, not polish.** The progressive World Cup needed super-admin
  bulk updates for 7 rounds; the EPL is 38 matchweeks × every pool.
- **The override wall is kickoff, not the deadline.** Freely allowed up to kickoff: extend a deadline,
  reopen a round for everyone, **reopen for one specific member**, nudge/remove/re-invite. **Nothing
  is accepted after a match starts, by anyone including super-admin.** *The risk isn't that admins
  cheat — it's that they can be accused of it.*
- **Members see the override log** (*"Ryan reopened matchweek 3 for Dave — 14:02, before kickoff"*).
  This **protects** the admin: it's their proof they were fair.
- **Wrong results route to super-admin**, fixed once at source — an admin hand-editing a result would
  create divergent realities across 600 pools.
- **Archive, not delete** — see the 🔥 Now item; Delete Pool is removed from admins entirely.
- **Instrument admin retention.** Currently invisible on every dashboard, and it is the biggest lever
  we found:

  | Path | Yield |
  |---|---|
  | +10% more admins (477 → 525) | +365 players |
  | +10% players per admin (7.6 → 8.4) | +382 players |
  | **Prevent 20% of admin churn (~95 admins)** | **+722 players** |

  An 11.6% organiser rate is ~**ten times** the classic ~1% creator benchmark — an outlier to defend,
  not a funnel to fix. The 478th admin is by construction the person with the smallest, least
  enthusiastic group.

### Decision 8 — The ethical test

The **disclosure gate** (top of this document) is adopted as a real gate, and is recorded in
`CLAUDE.md` (2026-07-25) so it fires when a feature is *proposed* rather than at merge time. The full
five, for genuinely new mechanics:

1. **Disclosure** — would it survive being explained in a tooltip?
2. **Affect** — which emotion does the work, and would the user thank you for it? Anticipation, pride,
   rivalry: fine. Guilt, shame, obligation, manufactured FOMO: not.
3. **Symmetry** — is exit as easy, fast and prominent as entry?
4. **Substitution** — does the user end up with more of what they came for, or just more sessions?
   Pair every mechanic with a quality counter-metric.
5. **Variance provenance** — is every element of uncertainty **inherited from the sport**? Randomness
   *we* add is gambling design whether or not money moves.

Standing check: assume a 15-year-old is in a family pool.

---

### Still open

- **Presets for new pools with existing pools grandfathered** — assumed yes, not explicitly ruled.
- **Crew-departure semantics** — history is immutable, but self-removal and exact removal behaviour
  aren't settled.
- **Where the format recommendation comes from** when crew history and global popularity disagree.
  (Settled for Run it back: the admin's own past setup.)
- **The breakthrough threshold** for out-of-sport events — instinct is deliberately high; the moment
  it fires often it stops working.
- **Discover ranking weights** — signals agreed, formula not.
- **Migration path** from today's `pools` table to Crew + Season without disturbing 622 live pools.
  Biggest unknown in the project.

### Not yet discussed

- The competition-shape × pool-format grid, and which format engines to build in what order.
- Showdown mechanics beyond "no playoff cut, matched pairing".
- Monetisation (tracked separately under 💎).

---

### Foundational work items

- **League ingestion (Premier League)** `Multi-sport` 🔥 — migration `024_multi_competition_league_support.sql`, `lib/integrations/apiFootball/importLeagueSeason.ts` and `scripts/import-league-season.ts` are **drafted, not applied**. ⚠️ **A league pool scores zero today, silently**: `checkKnockoutTeamsMatch` ([lib/scoring/core.ts:88](lib/scoring/core.ts)) returns `true` only for `'group'` or when teams aren't set; a `'regular_season'` fixture is neither, so it falls to `return false` and [core.ts:141](lib/scoring/core.ts) zeroes the match. Even after fixing the gate, `isGroupStage` selects the **point values** — the group/knockout binary is welded into the price lookup, not just the gate. Importing fixtures is **not** the last step before a working league pool.
- **Sync cron is single-tenant** `Multi-sport` — competition comes from three env globals (`app/api/cron/sync-fixtures/route.ts:67`). Looping over active tournaments (reading `external_league_id`/`external_season` per row, which 024 backfills) is the unlock for N competitions. WC = api-football league 1; EPL = league 39.
- **Data-model abstraction** `Multi-sport` — competition-instance model, now also carrying Crew + Season (Decision 1). Everything else depends on it.
- **Pool template system** `Multi-sport` — formats as named presets carrying their own scoring (Decision 3).
- **Sports-data ingestion** `Multi-sport` — pluggable fixtures/results/standings layer behind a provider interface.
- **Per-competition email cadence** `Multi-sport` — schedules per competition instead of global crons.
- **Competition catalog & lifecycle** `Multi-sport` — catalog, season rollover, clone-from-last-year. Date-computed state chips, **never authored** (Decision 4).
- **Per-competition branding** `Multi-sport` — theme/copy per sport. (The existing `branded-pools` feature is per-**pool** white-label — a different axis.)
- **Monetization model** `Multi-sport` — free vs freemium vs paid. Tracked under 💎.

## 💎 Later — monetization & cosmetics

### Sponsored pools `Feature` `Monetization`
- **Is:** For self-directed designed pools using the pool-payment model, let "ultra" / paying pools be marked as **sponsored** and pinned to the top of discovery. `#Monetization`
- **Touches:** a `sponsored` flag on pools + discovery sort (pin sponsored to top) + an admin marking path.
- **Audit 2026-07-12:** PARTIAL — the pin-to-top-of-discovery mechanic already ships, but keyed off **branding**, not a `sponsored` flag (`PoolsClient.tsx:289`, `useHomeData.ts:582`). Still need a real `sponsored` flag + paid-tier marking path.
- **Effort:** ~2–3 days.
- **Done when:** a pool can be marked sponsored and reliably appears pinned at the top of discovery.

### Premium analytics `Feature` `Monetization`
- **Is:** In-depth analytics as a paid premium feature — accuracy trends, H2H records, pick patterns, pool history. Deeper than the free analytics.
- **Touches:** an analytics surface gated behind an entitlement/paywall + the underlying stats.
- **Audit 2026-07-12:** TODO — no entitlement/paywall layer; analytics are ungated.
- **Effort:** large — multi-week; gated on a monetization decision.
- **Done when:** a paying user unlocks richer personal analytics not available on the free tier.

### Character avatars + cosmetics IAP `Feature`
- **Is:** Long-term play — a Bitmoji-style character system plus an IAP cosmetics economy (tunnel themes, walkout animations, victory celebrations).
- **Touches:** character rendering + IAP (App Store / Play billing) + cosmetics catalog.
- **Audit 2026-07-12:** TODO — no IAP/cosmetics/character code; also gated on the (unbuilt) Avatars v1.
- **Effort:** large — months; gated on Avatars v1 adoption + a Phase-2 monetization decision.
- **Done when:** *(gated — not scoped until the gate opens)*.

---

## 🧰 Streamlining & tech debt (background)

### Bounded reads & server-side aggregation (app-wide) `Infra`
- **Is:** Background "simplify how the app pulls data" cleanup. Many screens fetch large, unbounded row sets to the client and compute a small summary in JS — risking silent truncation at PostgREST's 1000-row cap and wasting egress + CPU. Move the work into the database. **Excludes scoring** (shadow engine owns that).
- **Touches:** the anti-pattern is an unbounded `.in('col', [manyIds])` with no `.limit()`/`.range()`. Sweep (2026-07-10): **161** `.in()` reads on web vs 53 bounded; **30** vs 7 on mobile. User-facing candidates first: mobile `useHomeData.ts`/`usePoolBanter.ts`/`useMatchDetail.ts`/`useActivity.ts`; web `dashboard`/`pools`/`leaderboard`/`activity`/`poolData.ts`/`entryAnalytics.ts`/`profile`. **Skip** scoring + admin one-offs. Fix menu: RPC + window function, view, precomputed columns, or `.range()` pagination. Do **not** raise `max-rows`.
- **Audit 2026-07-12:** the first, confirmed instance (mobile pool-card in `useHomeData.ts`) is **still unfixed** — nothing from this sweep has landed yet.
- **Effort:** ongoing/background — ~0.5–1 day per site.
- **Done when:** no user-facing screen depends on an unbounded multi-row fetch; re-running the sweep shows hot read paths are all bounded or DB-aggregated.

---

## 🧹 Housekeeping

### iCloud corrupts the local checkout `Infra`
- **Is:** The repo lives in iCloud-synced `~/Documents`, which corrupts build artifacts, spawns `" 2"`/`" 3"` duplicate files, and can even flip a byte in tracked source.
- **Touches:** local dev environment only. Workaround: diagnose build artifacts via a clean `npm ci` in a throwaway worktree first; scan `git diff` for null bytes before committing.
- ⚠️ **Audit 2026-07-12:** the hazard is **live right now** — duplicate `.git/index 2` / `.git/index 3` and `.next/* 2` files are present on disk.
- **Effort:** ~1 hour — move the repo off iCloud.
- **Done when:** the working copy lives outside iCloud sync and phantom build failures stop.

---

## 📎 Reference docs (architecture deep-dives, not backlog items)

- `drafts/2026-07-02_shadow_engine_audit_report.md`
- `drafts/2026-07-05_match_status_display_plan.md`
- `drafts/2026-07-09_scoring_table_architecture_deepdive.md`
- ~~`drafts/M4_read_path_flip.md`~~ — ⚠️ **missing from the repo** (referenced by *Leaderboard precompute* but never created / was removed — recreate or drop the reference).
