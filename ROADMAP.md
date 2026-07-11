# Roadmap

Single source of truth for everything we want to build, fix, or decide.
Ordered by priority (**Now → Later**), tagged by category.

**Last updated:** 2026-07-10 · Consolidated from working notes.

Each item has four fields:

- **Is** — what it is, in plain English.
- **Touches** — the code / systems / tables it involves.
- **Effort** — rough order-of-magnitude estimate (not a commitment).
- **Done when** — the end goal and how we verify it.

**Legend** — Categories: `Bug` · `Scoring` · `Feature` · `Design` · `Mobile` · `Infra` · `Multi-sport` · `Ops`
Status: 🔥 active/hurting now · 🔒 blocked · ⏳ waiting on your timing call

---

## 🔥 Now — active, can't wait

### Knockout tie-break scoring bug `Bug` 🔥
- **Is:** In `full_tournament` pools, when a user's predicted group ends in a tight tie, the app *shows* one team advancing but *scores* as if the other did — so a correct knockout pick can score 0. Confirmed via Eliel's ticket (predicted R16 Mexico–England correctly, got 0).
- **Touches:** The scoring path (`lib/scoring/full.ts`) passes real-world `conductData` (cards) into the tiebreaker; the display/bonus path (`app/api/pools/[pool_id]/bonus/calculate/route.ts`) does not — so `resolveH2HTiebreaker` in `lib/tournament.ts` picks different winners. Fix = one shared, FIFA-ordered, **prediction-only** group resolver used by display, scoring, bonuses, and shadow materialization (`lib/bracketResolver`, `lib/scoring/shadowBrackets.ts`). Also fixes a wrong H2H-before-overall-GD ordering (UEFA vs FIFA order).
- **Effort:** ~1–2 days: shared-resolver refactor + full recalc of all `full_tournament` pools + remove Eliel's provisional `+300` adjustment.
- **Done when:** display and scoring agree on every group winner; the ~350/1770 affected entries re-score correctly; Eliel scores the 300 organically (adjustment removed so he doesn't double-count). ⚠️ Recalc visibly changes some scores — coordinate timing/comms.

### WC incident master fix list `Bug` `Ops`
- **Is:** The tiered working list from the June opening-day outages. **Mostly resolved** — sync re-enable, crash-chain fixes, phantom-diff, sweep overlap guard, per-match recalc, badge fraction bug: all shipped. What remains is small and already lives under other roadmap items below (badge persistence/semantics → *Badge batch*; presence RLS + dup-key races → *Mobile*; orphan-row cleanup + post-deadline edit lock → *Data integrity*; index/realtime trims → *IO reduction*).
- **Touches:** n/a — a tracking snapshot, not a work item.
- **Effort:** n/a.
- **Done when:** the open threads (listed as their own items) are closed. No independent work.

## 🔁 Recurring each knockout round — SF/Final upcoming

> Not "done"-able — re-run **before every knockout round** or scores don't sync / pools don't open.

### Knockout fixture API-linking `Ops`
- **Is:** Knockout matches must be manually linked to the live data feed each round, or scores never sync.
- **Touches:** `scripts/map-knockout-fixtures.ts` (writes `external_match_id` onto `matches`); the api-football sync cron reads it.
- **Effort:** ~15–30 min per round.
- **Done when:** every knockout match for the round has an `external_match_id` and live scores flow. Done: R32 (06-28), R16 (07-04), QF 3/4 (07-07). **Pending: #100 Argentina–Switzerland before Jul 12. Next: SF.**

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
- **Touches:** read path `app/api/pools/[pool_id]/leaderboard/route.ts` + `app/pools/[pool_id]/LeaderboardTab.tsx`; storage = extra columns on `entry_xp_state`; writer = `analytics-sweep` cron (jobid 15) + `lib/analytics/entryAnalytics.ts`. Backfill/cron **already live and verified no-op** (M1/M2 done); remaining is the **M4 read-path flip** (read columns, drop `force-dynamic`, add cache) behind flag `analytics_read_from_columns` — design in `drafts/M4_read_path_flip.md`.
- **Effort:** ~2–3 days (calm-window deploy + load test). Bracket pools need a **separate** parallel-analytics track (~2–3 days more) — they score via `bonus_scores`, not `predictions`.
- **Done when:** backfill-vs-live parity = 0 diffs, the ~516ms leaderboard query drops to ~20ms, and a match-night load test holds on Medium compute.

### Scale downgrade XL→Medium `Infra`
- **Is:** Get off the expensive XL/4-core Supabase tier back to Medium, with zero user-visible change.
- **Touches:** **Phase A applied** (2026-06-30): wrapped `auth.uid()` in 55 RLS policies + dropped 5 dup indexes (`drafts/2026-06-30_phaseA_...sql`). **Phase B** = flip already-built flags in `sync_settings`: `sweep_time_box_enabled` (crash fix), `scoring_diff_writes_enabled` (needs index first, canary via `scripts/canary-recalc.ts`), `pool_cache_enabled` (biggest egress lever). **Phase C** = the downgrade. **Phase D** = durable (consumes the precompute item + per-pool realtime broadcast).
- **Effort:** ~1–2 days across calm windows + one live-day of watching CPU graphs.
- **Done when:** running on Medium, leaderboard stays live during a match, `auth_rls_initplan` advisor = 0, and CPU headroom holds on a live match day.

### Tournament IO reduction `Infra`
- **Is:** Punch list of background-IO cuts. **Largely done** — api-perf writer trimmed, policies consolidated, sync fan-out batched, per-match recalc + RLS initplan shipped.
- **Touches:** Remaining open: drop 6 duplicate + 33 unused indexes (mechanical); realtime publication diet (remove tables that don't need live events — overlaps the broadcast migration); slim predictions auto-save round-trips.
- **Effort:** ~1 day for the index + realtime trims.
- **Done when:** duplicate/unused indexes gone, realtime publication carries only tables that need it, no regression on a live day.

### Kickoff write spike `Infra`
- **Is:** At kickoff, a synchronous calc+write burst briefly spikes CPU (~4.3 on 2 cores) and replication lag. Recovered fine, but should be smoothed.
- **Touches:** the scoring sweep in `lib/scoring/recalculate.ts` + `app/api/cron/sync-fixtures/route.ts`; fix direction = precompute / batch / queue the burst.
- **Effort:** folds into the precompute + scale work above; ~1 day incremental.
- **Done when:** kickoff no longer produces a CPU/replication spike on the Supabase graph.

### Shadow scoring engine `Infra` 🔒
- **Is:** A set-based, DB-native replacement for the Node recalc, running in parallel as a validation tool (not customer-facing). Match + bonus + rank parity-verified for group + R32; fully automated via reconciler crons.
- **Touches:** `shadow_*` tables + RPCs, `lib/scoring/shadowBrackets.ts`, `app/api/cron/shadow-materialize/route.ts`, and 3 crons (materialize 15m · reconcile 1m · reconcile-adjustments 2m). Migration plan is read-path-first, reversible, pilot = mobile + one web pool via `shadow_read_enabled_pools`.
- **Effort:** low urgency near-term — it's a parallel tool. Ryan **deferred the durable knockout fix to the next tournament** (only ~5 games left; drift affects nothing users see).
- **Done when:** *(deferred)* predicted brackets resolved once at entry submission (removing re-materialization); until then, per-round manual sweep keeps parity if we want to re-check. 🔒 Full cutover stays blocked while the knockout tie-break bug is live.

### EAS OTA pending `Mobile`
- **Is:** Several finished mobile fixes are committed but haven't shipped to phones yet.
- **Touches:** presence publisher + PoolInfoTab 400-fix + onboarding + Fees tab, bundled for an Expo OTA update.
- **Effort:** ~30 min — it's built; just push the OTA.
- **Done when:** testers' phones pull the update and the four fixes are live. You control the timing.

## ⏭️ Next — scoring correctness & data integrity

### Badge batch — persistence + semantics `Scoring` ⏳
- **Is:** The blatant fraction bug (Dark Horse/Upset Caller firing for everyone) is **already fixed** (commit 4e920b0). What's left: (a) badges vanish on recompute because there's no persistence, and (b) a few badges whose copy ≠ logic.
- **Touches:** persistence = new append-only `badge_unlocks` table (see *Badge unlock history*); semantic fixes in `app/pools/[pool_id]/analytics/xpSystem.ts` — Contrarian Win (copy says "75%+", logic checks "differs from majority"), Lightning Rod (no deadline check), Quick Draw (24h measured from pool creation, not join); award-on-completion-only gating in `recalculate.ts` + `lib/push/badges.ts`; mirror every change into `lib/push/badges.ts` (push parity).
- **Effort:** persistence ~1–2 days; semantic copy/logic fixes ~0.5 day; completion-gating ~0.5 day.
- **Done when:** an earned badge never disappears across recalcs; each badge's copy matches its trigger; push and analytics never disagree.

### Post-deadline prediction lock `Bug`
- **Is:** Predictions on *completed* matches can still be edited (`predictions_locked` isn't enforced post-kickoff). Users edit picks after a match, and it causes shadow/prod scoring divergence (the recurring "...024" edge).
- **Touches:** server-side save path `app/api/pools/[pool_id]/predictions` + the RPC; decide the rule per mode, then enforce it.
- **Effort:** ~0.5 day.
- **Done when:** saves for a match past kickoff are rejected (or explicitly allowed by a stated rule) consistently across all three modes.

### Recalc orphan-row cleanup `Bug`
- **Is:** When an entry is un-submitted after being scored, its `match_scores` rows are left behind (11 seen in June).
- **Touches:** delete-scope logic in `lib/scoring/recalculate.ts` (currently only touches current entryTotals).
- **Effort:** ~0.5 day.
- **Done when:** zero orphan `match_scores` rows for unsubmitted entries after any sweep.

### Perfect-group bonus `Scoring`
- **Is:** New optional scoring rule — bonus for nailing all 4 positions in a group. (Carson's feedback, May 2026.)
- **Touches:** scoring config (`ScoringRulesTab.tsx` + settings), bonus calc (`lib/bonusCalculation.ts` / `lib/scoring`), and the shadow engine mirror.
- **Effort:** ~1 day.
- **Done when:** admins can toggle it, it awards correctly on group completion, and shadow parity holds.

### Penalty-prediction redesign `Scoring`
- **Is:** Rework the "goes to penalties" knockout bonus so it can't be gamed by blanket check/uncheck. (George's feedback, May 2026.)
- **Touches:** knockout bonus logic in `lib/bonusCalculation.ts` + scoring settings; interim workaround is admins setting `bp_penalty_correct=0`.
- **Effort:** ~1–2 days (needs a scoring-design decision first).
- **Done when:** the bonus rewards genuine skill, not a blanket strategy; verified against sample entries.

---

## 🚀 Post-WC near-term — Showdown / EPL launch (target Aug 2026)

### Showdown mode `Feature`
- **Is:** The flagship post-WC product — a head-to-head pick'em league. Every gameweek you're randomly paired with another pool member; beat their accuracy to take the points (3 win / 1 draw / 0 loss, 38-week season). Creates a personal league with named rivals and a "Banter Cup" side-pot. Full spec captured in notes.
- **Touches:** new pairing engine + duel-scoring model + `pool_templates`-style mode; reuses office mini-league, WhatsApp share, QR join, and OG-preview infra. Sub-tracks: **prep** (pairing engine, duel scoring, Banter Cup logic, schema on paper) · **animations** (Remotion server MP4 for the tunnel walk-out reveal, `next/og` previews, Reanimated + Skia in-app, Lottie hand-off) · **notifications** (below).
- **Effort:** multi-week epic — core ~1–2 wks, prep ~1 wk, animations ~1 wk.
- **Done when:** a 10-person pool can run a full season of weekly duels with correct scoring, standings, tiebreakers, and the Monday pairing reveal.

### Showdown notifications `Feature`
- **Is:** The engagement loop for Showdown — pairing-reveal push, duel-result push, Banter Cup standing-change push, plus deep links into the matchup card → reveal animation. Closes the virality loop (push → tap → reveal → screenshot → share).
- **Touches:** `expo-notifications` + existing `/api/notifications/*` endpoints + Resend; 4 new email templates; deep-link routing in the Expo app.
- **Effort:** ~4 days (launch-critical for Showdown).
- **Done when:** a completed gameweek fires the right pushes/emails and each deep-links to the animated matchup card.

### Avatars v1 `Feature`
- **Is:** Real profile avatars with an initials fallback. Gates Showdown matchup-card personalization.
- **Touches:** Supabase Storage bucket + `<Avatar>` component + upload UI (Expo + web) + profile screen.
- **Effort:** ~3–5 days.
- **Done when:** a user can upload an avatar that renders across web + mobile, with initials fallback when none is set.

### Match-day recap emails `Feature`
- **Is:** Replace the weekly recap with a per-match-day recap.
- **Touches:** `lib/push/recaps.ts` + `lib/email/resend.ts` + `AutomatedEmailsTab.tsx`; re-enable the email crons when a competition is live.
- **Effort:** ~1–2 days.
- **Done when:** a match day triggers one accurate recap email; crons re-enabled and verified.

### Post-tournament feedback plan `Feature`
- **Is:** Gather feedback during the WC, send survey emails to admins/members after the final.
- **Touches:** a survey (Tally or similar) + a send via Resend to the admin/member list.
- **Effort:** ~1 day.
- **Done when:** survey built and sent post-final; responses collected.

## 📋 Features — medium priority

### Admin member-management actions `Feature`
- **Is:** Per-entry admin actions — view, unlock, adjust points — that work across all three prediction modes.
- **Touches:** a Members tab in the pool admin UI + point-adjustment path (`point_adjustments`) + unlock via `pool_round_states`/entry submission.
- **Effort:** ~2–3 days.
- **Done when:** an admin can view, unlock, and adjust any entry's points, mode-agnostic, with an audit trail.

### Pool Info tab + non-admin leave `Feature`
- **Is:** A read-only Pool Info tab for all members, with a working "Leave Pool" action (fixes the "Stop Participating" iOS bug).
- **Touches:** new tab in pool detail (web + `mobile/components/pool-detail/`) + a leave-pool mutation on `pool_members`.
- **Effort:** ~1–2 days.
- **Done when:** any member sees pool info and can leave; the iOS leave bug is gone.

### Activity tab — XP gains `Feature`
- **Is:** A feed surfacing XP-gain events ("Submitted predictions +100 XP — Entry A in Pool X") as first-class items.
- **Touches:** an activity feed component + an XP-events source (derive from scoring/`entry_xp_state` writes).
- **Effort:** ~2–3 days.
- **Done when:** XP-gain events appear in the activity feed with correct amounts and context.

### Badge unlock history `Feature`
- **Is:** Append-only record of badge unlocks so we can show "10× Lightning Rod" and per-badge timelines. (Also the persistence half of the Badge batch.)
- **Touches:** new `badge_unlocks` table + write on badge detection + read in the badge UI.
- **Effort:** ~1–2 days.
- **Done when:** unlocks are recorded permanently and cumulative counts render per user/entry.

### Super-admin project dashboard `Feature`
- **Is:** A lightweight visual of this roadmap inside super admin.
- **Touches:** a super-admin page reading `ROADMAP.md` (v1) — later possibly a `roadmap_items` table.
- **Effort:** ~1–2 days (v1 read-only).
- **Done when:** the roadmap renders in super admin without hand-editing HTML.

### Creative pool-name award `Feature`
- **Is:** Admin-curated "hall of names" honouring great pool names. Lowest priority.
- **Touches:** a badge on the pool card (v1 = no voting/algorithm).
- **Effort:** ~1 day.
- **Done when:** an admin can flag a pool name and a badge shows on its card.

## 🎨 Design / UX polish — post-v1

### Banter sheet polish `Design`
- **Is:** Smooth out the banter sheet — reaction long-press, quick-actions anchoring, and verify share-prediction + badge-flex against real data.
- **Touches:** `mobile/components/.../BanterSheet` + reaction/quick-action components.
- **Effort:** ~1–2 days.
- **Done when:** interactions feel smooth and share/flex render correctly with real data.

### Form tab polish `Design`
- **Is:** Make badge cells tappable to open a details sheet showing how each badge is earned.
- **Touches:** `mobile/components/pool-detail/BadgeDetailSheet.tsx` + Form/Leaderboard tab cells.
- **Effort:** ~1–2 days.
- **Done when:** tapping a badge opens a sheet explaining its earning condition.

### Round / match-week label on upcoming matches (mobile) `Feature` `Mobile`
- **Is:** On the Predictions tab, label each upcoming match with the round it belongs to, using competition-appropriate wording — "Match Week 3" for the Premier League, "Round of 16" for a World Cup knockout. For non-admin members; relevant once predictions lock (per match-week/round for progressive pools, or whole-pool for full-tournament).
- **Touches:** `mobile/components/pool-detail/PredictionsTab.tsx` + `MatchPredictionRow.tsx` / `components/home/UpcomingMatchCard.tsx`; reads round/stage off the match plus lock state (`pool_round_states`). Round vocabulary should be competition-aware — hardcode WC/EPL wording for now, centralize when we build *Per-competition branding* (see Multi-sport epic).
- **Effort:** ~0.5–1 day.
- **Done when:** a non-admin member sees the correct round/match-week label on upcoming matches, with wording matching the competition.

### Members' predictions section (mobile) `Feature` `Mobile`
- **Is:** Under your own prediction entry at the top of the Predictions tab, a section (name TBD — "Members' Predictions" / "Other Predictions" / something clever) that any member can tap into to see what every other member predicted.
- **Touches:** a new section/list in `mobile/components/pool-detail/PredictionsTab.tsx` (there's already a `SharePredictionSheet.tsx` for one's own picks to build from) + a read of all pool entries' `predictions`, scoped by pool. Mobile only for now.
- **Effort:** ~1–2 days.
- **Done when:** after lock, a member can browse every other member's predictions for the round/pool on mobile. ⚠️ Design note: reveal **only after predictions lock**, or it becomes a pre-deadline cheat sheet — confirm the gating rule (and the section name).

### Tab-swipe jitter (mobile) `Mobile`
- **Is:** Swiping left/right between pool tabs is janky — not clean or smooth.
- **Touches:** the pool-detail tab pager + `mobile/components/pool-detail/PoolTabBar.tsx`. ⚠️ Note: a **different** tab issue (first-visit size-pop on the app's *bottom* tabs) was already fixed with `enableScreens(false)` in `mobile/app/_layout.tsx` — that's load-bearing, don't touch it, and per-tab Reanimated `entering` wrappers + `detachInactiveScreens={false}` were tried and **don't** help. This swipe-jitter is a separate layer (the pool-detail pager) — profile with a frame tool before assuming a cause.
- **Effort:** ~1–2 days (investigation-heavy; the easy fixes are already ruled out).
- **Done when:** tab swipes hold ~60fps with no dropped frames on a mid-tier device.

### Chat scroll jitter (mobile) `Mobile`
- **Is:** Scrolling the banter/chat is janky; needs to be smoothed out.
- **Touches:** `mobile/components/pool-detail/BanterSheet.tsx` + `mobile/app/pool/[id]/banter.tsx` + `mobile/lib/usePoolBanter.ts`. Prime suspects: list virtualization (FlatList/FlashList config), re-renders on every realtime message (chat runs on DB-broadcast over private `pool:{id}` topics), and scroll behavior inside the gorhom bottom sheet.
- **Effort:** ~1–2 days (investigation-heavy).
- **Done when:** chat scrolls smoothly at ~60fps, including while new messages arrive live.

## 📱 Mobile

### Pool card: level + form dots wrong (mobile) `Bug` `Mobile`
- **Is:** On the "Your Pools" tab, pool cards show correct **rank** and **points**, but the **Level** doesn't match the pool-detail Form tab and the **form dots** are missing or incomplete.
- **Touches:** two distinct root causes, both spanning `mobile/lib/useHomeData.ts` + `mobile/components/pools/PoolListItem.tsx`:
  - **Level** — the card computes `getLevel(pool.totalPoints)` from `mobile/lib/levels.ts` (a *points*-based table), while the rest of the app (Form tab `XPHeroCard`) shows an *XP*-based `current_level` (match + bonus + badge XP, via `lib/api.ts` `XPData`). Different basis/thresholds/names → the card level can't match the Form tab.
  - **Form dots** — built from an unbounded `match_scores` query (`.in('entry_id', allEntryIds)` over every entry in every pool, no `.limit()`). PostgREST caps at 1000 rows, so once the user's scored rows exceed 1000, entries past the cap get zero form rows → empty/partial dots. (Same 1000-row-cap class as the super-admin user-list + analytics-detection bugs.)
- **Effort:** ~0.5–1 day.
- **Done when:** the card's Level matches the pool-detail Form tab and form dots render the correct last-5 for every pool regardless of how many pools/entries the user has. **Durable fix:** source both from precomputed `entry_xp_state` columns — `current_level` and `last_five` — instead of deriving level from points and recomputing form from raw `match_scores`. Folds into *Leaderboard precompute*. Verify `entry_xp_state.current_level`/`last_five` are populated first (historically empty — the June badge-push bug — but backfilled since).

### Mobile error triage `Mobile`
- **Is:** Deferred residuals from the June error review.
- **Touches:** `user_presence` RLS failures (172k failed inserts); push-cron duplicate-key races (need `ON CONFLICT`); bracket-picks mobile submit gating.
- **Effort:** ~1–2 days.
- **Done when:** zero presence RLS errors, zero duplicate-key errors on concurrent writes, and bracket submit gates correctly on mobile.

### Push + banter notification parity `Mobile`
- **Is:** Make Expo sends trigger the same emails/pushes the old Swift app did.
- **Touches:** wire `expo-notifications` to the existing `/api/notifications/{message,mention}` endpoints.
- **Effort:** ~2–3 days.
- **Done when:** an Expo message/mention fires the same downstream notifications as the legacy path.

### Expo migration eval `Mobile`
- **Is:** Evaluate replacing the Swift iOS app with Expo/RN for iOS + Android (post-WC).
- **Touches:** decision/spike, not a fixed build — assess feature parity + store deployment.
- **Effort:** large — a scoping spike first, then a phased build if greenlit (weeks).
- **Done when:** a go/no-go decision with a scoped plan.

---

## 🌍 Later — multi-sport platform (long-horizon epic)

> Generalize the single World Cup product into a reusable multi-competition platform. Each is multi-day to multi-week; the whole epic is a multi-month program. "Done when" for all = the capability exists and the WC product runs *through* it with no regression.

- **Data-model abstraction** `Multi-sport` — competition-instance model (foundational; everything else depends on it).
- **Pool template system** `Multi-sport` — bracket / pick'em / survivor / score-prediction modes per competition.
- **Sports-data ingestion** `Multi-sport` — pluggable fixtures/results/standings layer to replace the single WC feed.
- **Per-competition email cadence** `Multi-sport` — schedules per competition instead of global crons.
- **Competition catalog & lifecycle** `Multi-sport` — catalog, season rollover, clone-from-last-year.
- **Per-competition branding** `Multi-sport` — theme/copy per sport (vocabulary, colors, logos).
- **Monetization model** `Multi-sport` — decide free vs freemium vs paid beyond friends-and-family.

## 💎 Later — cosmetics & monetization

### Character avatars + cosmetics IAP `Feature`
- **Is:** Long-term play — a Bitmoji-style character system plus an IAP cosmetics economy (tunnel themes, walkout animations, victory celebrations). Candidate monetization model.
- **Touches:** character rendering + IAP (App Store / Play billing) + cosmetics catalog.
- **Effort:** large — months; gated on Avatars v1 adoption + a Phase-2 monetization decision.
- **Done when:** *(gated — not scoped until the gate opens)*.

---

## 🧰 Streamlining & tech debt (background)

### Bounded reads & server-side aggregation (app-wide) `Infra`
- **Is:** Background "simplify how the app pulls data" cleanup. Many screens fetch large, unbounded row sets to the client and compute a small summary in JS. That risks silent truncation at PostgREST's 1000-row cap (blank/wrong UI) and wastes egress + CPU. Move the work into the database and return only what the screen needs. **Excludes scoring** — the shadow engine owns that; this is *everything else* (pool cards, member/activity lists, banter/chat, analytics, pickers).
- **Touches:** the anti-pattern is a Supabase read whose row count grows with data and has no `.limit()`/`.range()` — usually an unbounded `.in('col', [manyIds])`. Sweep (2026-07-10): **161** `.in()` reads on web vs only 53 `.limit()/.range()`; **30** vs 7 on mobile — so bounded reads are the exception. Candidates to audit (counts are a heuristic, not confirmed bugs), user-facing first:
  - **Mobile:** `mobile/lib/useHomeData.ts` (the confirmed pool-card level/form bug), `mobile/lib/usePoolBanter.ts` (chat), `mobile/lib/useMatchDetail.ts`, `mobile/lib/useActivity.ts`, the Reaction/Picker/BadgeDetail sheets.
  - **Web:** `app/dashboard/page.tsx`, `app/pools/[pool_id]/page.tsx`, `app/pools/page.tsx`, `app/api/pools/[pool_id]/leaderboard/route.ts`, `app/api/users/[user_id]/activity/route.ts`, `lib/poolData.ts`, `lib/analytics/entryAnalytics.ts`, `app/profile/page.tsx`.
  - **Skip:** `lib/scoring/*`, `lib/scoring/shadowBrackets.ts`, `bonus/calculate` (scoring — shadow engine's job), and admin one-offs / DELETE-scoping `.in()`s (bounded by nature).
  - Fix menu per site: an RPC + window function, a view, precomputed columns (`entry_xp_state`-style), or explicit pagination (`.range()`/keyset) for genuinely long lists. Do **not** raise the `max-rows` setting — that removes the guardrail without fixing the over-fetch.
- **Effort:** ongoing/background — triage the list, fix highest-traffic reads first; ~0.5–1 day per site.
- **Done when:** no user-facing screen depends on an unbounded multi-row fetch; re-running the sweep shows hot read paths are all bounded or DB-aggregated. (The pool-card bug under *Mobile* is the first, confirmed instance to pull from this list.)

---

## 🧹 Housekeeping

### iCloud corrupts the local checkout `Infra`
- **Is:** The repo lives in iCloud-synced `~/Documents`, which corrupts build artifacts, spawns `" 2"`/`" 3"` duplicate files, and can even flip a byte in tracked source.
- **Touches:** local dev environment only. Workaround: diagnose build artifacts via a clean `npm ci` in a throwaway worktree first; scan `git diff` for null bytes before committing.
- **Effort:** ~1 hour — move the repo off iCloud.
- **Done when:** the working copy lives outside iCloud sync and phantom build failures stop.

---

## 📎 Reference docs (architecture deep-dives, not backlog items)

- `drafts/2026-07-02_shadow_engine_audit_report.md`
- `drafts/2026-07-05_match_status_display_plan.md`
- `drafts/2026-07-09_scoring_table_architecture_deepdive.md`
- `drafts/M4_read_path_flip.md` — leaderboard read-path-flip design + backout
