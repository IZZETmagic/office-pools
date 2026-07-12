# Roadmap

Single source of truth for everything we want to build, fix, or decide.
Ordered by priority (**Now → Later**), tagged by category.

**Last updated:** 2026-07-12 · Full audit against the codebase — completed items moved to per-section **✅ Completed** tables; PARTIAL items annotated with what the code actually shows.

Each item has four fields:

- **Is** — what it is, in plain English.
- **Touches** — the code / systems / tables it involves.
- **Effort** — rough order-of-magnitude estimate (not a commitment).
- **Done when** — the end goal and how we verify it.

**Legend** — Categories: `Bug` · `Scoring` · `Feature` · `Design` · `Mobile` · `Infra` · `Multi-sport` · `Ops`
Status: 🔥 active/hurting now · 🔒 blocked · ⏳ waiting on your timing call · ✅ done (verified in code 2026-07-12)

---

## ✅ Recently shipped

> Completed and deployed to production. Kept here for visibility, then pruned once it's old news.

### Knockout tie-break scoring bug `Bug` `Scoring` — RESOLVED 2026-07-11
- **What it was:** In `full_tournament` pools, tied *predicted* groups were scored differently than they were displayed — real-world cards leaked into predicted standings and the tiebreaker used UEFA order instead of FIFA — so a correct knockout pick could score 0. Confirmed via Eliel's ticket (correct R16 Mexico–England, scored 0).
- **Fix:** one shared, **prediction-only**, FIFA-ordered group resolver. `resolveFullBracket` split into `resolvePredictedBracket` (no conduct — can't leak) and `resolveActualBracket`; comparator reordered to FIFA WC (points → overall GD → overall GF → H2H → conduct on actual only → FIFA ranking). All 17 call sites migrated (web + mobile). Commits `1757b99` (fix) + `fae59f1` (rollout tooling); 89 tiebreaker tests pass.
- **Rollout:** push-suppressed recalc of 239/239 pools, 0 failures — 386 of 1,513 entries moved across 78 pools (243 up, 143 down). Eliel's provisional `+300` reversed (now earns it organically, total unchanged). Shadow re-materialized (0 errors). Correction comms sent to Eliel + the 80 affected pool admins (81/81).
- **Loose end:** ✅ resolved — Vercel prod build confirmed green (Ryan, 2026-07-12). Fully shipped, no open threads.

### HTTP security headers + security.txt `Infra` — SHIPPED 2026-07-11
- **What:** production HTTP hardening in `next.config.ts` `headers()` — `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy: camera=()/microphone=()/geolocation=()` on all routes; `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` on everything except `/tv/*` (frame-exempt via `/((?!tv/).*)`); plus a `security.txt`. Commit `d6d6042`, verified live on sportpool.io.
- **Watch for:** new embeddable surfaces must be added to the `/tv/*` negative-lookahead or they'll be frame-denied; `camera=()` will silently block future in-app photo *capture* (Avatars) until `camera=(self)` is allowed.

---

## 🔥 Now — active, can't wait

> Nothing open here beyond the **recurring knockout ops** below — the master fix list from the June outages is fully resolved (verified in code 2026-07-12). Its residual threads are tracked as their own items: *Badge batch*, *Mobile*, *Post-deadline lock*, *IO reduction*.

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
- **Done when:** every knockout match for the round has an `external_match_id` and live scores flow. Done: R32 (06-28), R16 (07-04), QF (07-07 + #100 07-12). **Pending: #102 England–Argentina (SF, Jul 15) — api-football hadn't published the fixture as of Jul 12; re-run before kickoff. #103/#104 once teams resolve.**

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

### Scale downgrade XL→Medium `Infra`
- **Is:** Get off the expensive XL/4-core Supabase tier back to Medium, with zero user-visible change.
- **Touches:** **Phase A applied** (2026-06-30): wrapped `auth.uid()` in 55 RLS policies + dropped 5 dup indexes (`drafts/2026-06-30_phaseA_rls_initplan_and_index_hygiene.sql`). **Phase B** = flip already-built flags in `sync_settings`: `sweep_time_box_enabled` (crash fix), `scoring_diff_writes_enabled` (needs index first, canary via `scripts/canary-recalc.ts`), `pool_cache_enabled` (biggest egress lever). **Phase C** = the downgrade. **Phase D** = durable (consumes the precompute item + per-pool realtime broadcast).
- **Audit 2026-07-12:** all three Phase-B flags confirmed present in code and default-OFF (`sync-fixtures/route.ts:333`, `recalculate.ts:630`/`diffWrite.ts:12`, `poolData.ts:276`). "Phase A applied" is a prod-DB state — the repo proves the draft SQL exists, not that it was run.
- **Effort:** ~1–2 days across calm windows + one live-day of watching CPU graphs.
- **Done when:** running on Medium, leaderboard stays live during a match, `auth_rls_initplan` advisor = 0, and CPU headroom holds on a live match day.

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
- **Done when:** predicted brackets resolved once at entry submission (removing re-materialization). 🔒 No longer blocked by the tie-break bug (fixed 2026-07-11), but cutover still needs a **fresh knockout parity check** — parity hasn't been independently re-verified since the resolved-brackets rebuild.

### EAS OTA pending `Mobile`
- **Is:** Finished mobile fixes committed to master but not yet shipped to phones via `eas update`.
- **Touches:** presence publisher (`mobile/lib/PresenceProvider.tsx`) + PoolInfoTab 400-fix + onboarding + Fees tab (`e02048d`), bundled for an Expo OTA update.
- **Audit 2026-07-12:** the **only** mobile change since the Jul 6 "Mobile production snapshot" (`1d45297`) is the Jul 11 tie-break resolver (3 JS files: `bracketResolver.ts`, `tournament.ts`, `usePredictions.ts`); no native/config change since. `runtimeVersion` policy is `appVersion` = "1.0.0" (unchanged). So **if the last production build was ≥ Jul 6**, this is a safe JS-only OTA (~30 min) that mainly brings mobile bracket display in line with the shipped tie-break correction. Confirm the baseline with `eas update:list --branch production` / `eas build:list` before pushing.
- **Effort:** ~30 min — it's built; just push the OTA. You control the timing.
- **Done when:** testers' phones pull the update and the fixes are live.

## ⏭️ Next — scoring correctness & data integrity

### Badge batch — persistence + semantics `Scoring` ⏳
- **Is:** The blatant fraction bug (Dark Horse/Upset Caller firing for everyone) is **already fixed** (commit `4e920b0`, verified live in `xpSystem.ts:256`/`:416`). What's left: (a) badges vanish on recompute because there's no persistence, and (b) a few badges whose copy ≠ logic.
- **Touches:** persistence = new append-only `badge_unlocks` table (see *Badge unlock history*); semantic fixes in `app/pools/[pool_id]/analytics/xpSystem.ts` — Contrarian Win (copy says "75%+", logic checks "differs from majority"), Lightning Rod (no deadline check), Quick Draw (24h measured from pool creation, not join); award-on-completion-only gating in `recalculate.ts` + `lib/push/badges.ts`; mirror every change into `lib/push/badges.ts` (push parity).
- ⚠️ **Audit 2026-07-12:** confirmed — `badge_unlocks` table **does not exist** (persistence not started; the only store is the *mutable* `entry_xp_state.earned_badge_ids` array, which shrinks on recompute); all 3 semantic mismatches still present; no completion gating (`detectAndPushBadgesForPool` fires after every write).
- **Effort:** persistence ~1–2 days; semantic copy/logic fixes ~0.5 day; completion-gating ~0.5 day.
- **Done when:** an earned badge never disappears across recalcs; each badge's copy matches its trigger; push and analytics never disagree.

### Post-deadline prediction lock `Bug`
- **Is:** Predictions on *completed* matches can still be edited (`predictions_locked` isn't enforced post-kickoff). Users edit picks after a match, and it causes shadow/prod scoring divergence (the recurring "...024" edge).
- **Touches:** server-side save path `app/api/pools/[pool_id]/predictions/route.ts` + the RPC; decide the rule per mode, then enforce it.
- ⚠️ **Audit 2026-07-12:** confirmed — the save route guards only on pool/round deadline + the `predictions_locked` flag + `has_submitted_predictions`; there is **no per-match kickoff/`is_completed` check**, so a progressive pick on an already-kicked-off match inside a still-open round saves fine.
- **Effort:** ~0.5 day.
- **Done when:** saves for a match past kickoff are rejected (or explicitly allowed by a stated rule) consistently across all three modes.

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
| Post-tournament feedback plan `Feature` | Both survey emails built — `poolAdminFeedbackSurveyTemplate` + `playerFeedbackSurveyTemplate` (`lib/email/templates.ts`, real Tally URLs), send route `app/api/admin/send-template/route.ts:187` (segments `pool_admins` + `past_predictors`), super-admin UI `TemplatesTab.tsx`. | Firing the two sends post-final + collecting responses is the only remaining (ops) step. |

## 📋 Features — medium priority

### Badge unlock history `Feature`
- **Is:** Append-only record of badge unlocks so we can show "10× Lightning Rod" and per-badge timelines. (Also the persistence half of the Badge batch.)
- **Touches:** new `badge_unlocks` table + write on badge detection + read in the badge UI.
- **Audit 2026-07-12:** TODO — confirmed `badge_unlocks` table absent; the `badge_unlock` grep hits are a transient `action_type` enum in `user_pending_actions`, not a ledger.
- **Effort:** ~1–2 days.
- **Done when:** unlocks are recorded permanently and cumulative counts render per user/entry.

### Super-admin project dashboard `Feature`
- **Is:** A lightweight visual of this roadmap inside super admin.
- **Touches:** a super-admin page reading `ROADMAP.md` (v1) — later possibly a `roadmap_items` table.
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
- **Audit 2026-07-12:** TODO — **0 of the 3** metrics exist in `app/api/admin/stats/route.ts` (raw `totalPoolMembers`/`totalPools` exist but no average; no admin-count; no deleted-account count).
- **Effort:** ~0.5–1 day.
- **Done when:** super admin shows admin count, average pool size, and deleted-account count, accurately.

### Lifetime trophy tracker `Feature`
- **Is:** Split the profile page's statistics section into its own navigable page with an achievements area — including cumulative counts of how many of each trophy/badge a user has earned. `#Achievements`
- **Touches:** profile page (web + mobile) → a dedicated stats/achievements sub-page; reads cumulative badge counts — depends on *Badge unlock history*'s append-only table for accurate lifetime totals.
- **Audit 2026-07-12:** TODO — profile has no achievements sub-page; gated on the (absent) `badge_unlocks` table.
- **Effort:** ~2–3 days (gated on *Badge unlock history* for real cumulative counts).
- **Done when:** a user can open a dedicated statistics page from their profile and see lifetime achievement/trophy counts.

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
- ⚠️ **Audit 2026-07-12:** PARTIAL — **mobile DONE** (`getLiveClock` renders min/HT/ET/PENS + FT on `LiveMatchCard`/`MatchResultRow`/detail), **web NOT** (customer surfaces show only a "LIVE" badge; `live_minute` surfaces only in super-admin). Remaining = the web-side minute/HT/FT display.
- **Effort:** ~1 day (web only).
- **Done when:** live matches show the running minute, HT at halftime, and FT at full-time on **web** too.

### Match status notes (delayed / postponed / cancelled) `Feature`
- **Is:** Surface exception statuses — delayed, postponed, cancelled, abandoned, rescheduled — instead of assuming every match kicks off on time.
- **Touches:** match cards/detail + status detection (`matches.status_detail` + `original_match_date`; badging added in `00c4ae2`).
- ⚠️ **Audit 2026-07-12:** PARTIAL — **mobile DONE** (full badge system in `mobile/lib/matchStatus.ts`), **web NOT** (no component reads `status_detail`). Remaining = the web-side status display.
- **Effort:** ~1 day (web only).
- **Done when:** a non-normal match clearly shows its exception status to users on **web** too.

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
| Chat auto-refresh / live messages `Feature` | Migration `022_banter_realtime_broadcast` (AFTER-INSERT trigger → `realtime.send` to private `pool:{id}`); mobile `usePoolBanter.ts:703` broadcast channel; web `CommunityTab.tsx:386` broadcast + 5s poll fallback. Both surfaces update live. | Resolves the "back out two screens to see new messages" card. |

## 🎨 Design / UX polish — post-v1

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
- **Audit 2026-07-12:** PARTIAL — v4 medallion artwork (`assets/badge-previews-v4/`) exists for the 12 full/progressive badges; `bp_*` bracket badges still fall through to SF Symbols.
- **Effort:** ~1–2 days (design + asset pass).
- **Done when:** trophies/badges match the design system across the Form tab.

### ✅ Completed (verified against code, 2026-07-12)
| Item | What shipped — evidence | Note |
|---|---|---|
| Form tab polish `Design` | `mobile/components/pool-detail/BadgeDetailSheet.tsx` wired into `FormTab.tsx` + `BPFormTab.tsx`; tapping a badge cell opens a sheet showing its earning condition. | — |
| Slide-up save button `Design` `Mobile` | Dirty-state sticky footer — `hasChanges` gates an absolute-positioned `SaveBar` in `SettingsTab.tsx` + `scoring-config.tsx`, with content padding reserved. | — |

## 🐞 Bugs — triage (unsorted severity)

> Captured from the board's "Bug" column. Severity not yet assessed — promote into the sections above as they're triaged.

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

## 🌍 Later — multi-sport platform (long-horizon epic)

> Generalize the single World Cup product into a reusable multi-competition platform. **Audit 2026-07-12:** all seven are genuinely foundational/**TODO** — the schema is hardcoded to a single tournament (`00000000-…-0001`, 63 files reference `tournament_id`, zero reference any competition abstraction); ingestion is one api-football integration with no adapter; no `pool_templates`/`survivor`/catalog exists.

- **Data-model abstraction** `Multi-sport` — competition-instance model (foundational; everything else depends on it).
- **Pool template system** `Multi-sport` — bracket / pick'em / survivor / score-prediction modes per competition.
- **Sports-data ingestion** `Multi-sport` — pluggable fixtures/results/standings layer to replace the single WC feed.
- **Per-competition email cadence** `Multi-sport` — schedules per competition instead of global crons.
- **Competition catalog & lifecycle** `Multi-sport` — catalog, season rollover, clone-from-last-year.
- **Per-competition branding** `Multi-sport` — theme/copy per sport. (Note: the existing `branded-pools` feature is per-**pool** white-label, a different axis.)
- **Monetization model** `Multi-sport` — decide free vs freemium vs paid beyond friends-and-family.

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
