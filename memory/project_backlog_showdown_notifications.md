---
name: project-backlog-showdown-notifications
description: Showdown notification ecosystem — push + email + dots to drive users back into the app to see their matchup, results, and Banter Cup standing. Phase 3a (launch-critical), 3b.1 (engagement loops), v1.1 (polish).
metadata:
  type: project
---

The Showdown reveal animation is the virality wedge, but it's worthless if users don't open the app. The notification ecosystem is what closes the loop: gameweek pairings drop → push notification → user taps → reveal animation plays → user screenshots the lock card → shares to mates. Without push, the entire flow degrades to "remember to check the app" which kills engagement and share-virality.

This work is **launch-critical** for Showdown v1. The pairing-reveal push specifically is load-bearing — it's what triggers the share moment.

**Why now (not later):** the launch hypothesis is that Showdown's H2H structure + reveal animation drive engagement above current pick'em norms. Notifications are the engagement multiplier. Shipping Showdown without them = shipping a product that depends on user habit alone (i.e., none, since EPL is new). Phase 3a must include the pairing-reveal + duel-result triggers at minimum.

**Why this is contained:** all the heavy infrastructure already exists. APNs + FCM (TD-13 resolved), email via Resend, notification dots system (TD-14 resolved). Showdown adds new *triggers and copy*, not new plumbing.

**How to apply:**

### What already exists (reuse, don't rebuild)

- **Push infrastructure** — APNs (iOS) + FCM via Expo's hosted relay (Android), live with 7 categories. See `lib/push/apns.ts`, `lib/push/expo-push.ts`. (TD-13)
- **Email infrastructure** — Resend + templates in `web/emails/`. Crons currently disabled pre-WC; per-trigger enablement is straightforward. See [[project-backlog-emails]].
- **Notification dots** — hierarchical (bottom tab → pool card → pool detail tab bar → per-cell), OS badge sync, two-state tracking via `acknowledged_at` + `completed_at`. Mark-complete via `mark_action_complete` RPC. (TD-14)
- **Activity feed persistence (planned)** — TD-11 `user_activity` table, bundled with Phase 3b.1. Showdown push triggers should write here from day one to avoid TD-10/TD-11 worsening.

### New triggers for Showdown

| # | Trigger | Push copy (working draft) | Email subject | Deep link | Phase |
| - | --- | --- | --- | --- | --- |
| 1 | **Pairing reveal** (gameweek opens, pairing engine runs) | `Gameweek 3 is here.\nYour matchup is locked in. Tap to reveal.` | `Your Gameweek 3 matchup is locked` | `pool/{poolId}/showdown/matchup/{matchupId}` → reveal animation | **3a (launch-critical)** |
| 2 | **Pre-deadline reminder** | (reuse existing `deadline_warning` category — no new copy) | (reuse) | Predictions tab | **3a (free, already exists)** |
| 3 | **Duel result** (gameweek closes, scoring runs) | `You beat George 6–2 this week.` / `George got you 5–4. Rematch next week.` | `Gameweek 3 result: You vs George` | `pool/{poolId}/showdown/matchup/{matchupId}/result` | **3a (launch-critical)** |
| 4 | **Banter Cup standing change** (rank moves) | `You moved up to 2nd in the Banter Cup.` | (no email — push only, low noise) | `pool/{poolId}/showdown/banter-cup` | **3a (launch, lightweight)** |
| 5 | **H2H milestone** (streaks, first-time-beats, rivalries) | `3-game win streak vs George.` / `George just took the lead in your rivalry.` | (no email) | Matchup history view | **3b.1 (engagement loop)** |
| 6 | **Banter sheet trigger** (taunt sent / reaction / mention) | `George sent you trash talk.` | (no email — high noise risk) | Banter sheet on matchup | **3b.1 (with banter polish)** |
| 7 | **Season milestone** (Banter Cup final week / payout / season recap) | `Banter Cup final week is here.` / `You finished 3rd. Here's your payout.` | `Your SportPool season recap` | Banter Cup recap | **v1.1 (post-launch)** |

### Architecture — new push categories + dispatcher integration

- Register 4 new push categories alongside the existing 7: `showdown_pairing`, `showdown_duel_result`, `showdown_banter_cup`, `showdown_h2h_milestone`. (Banter trigger reuses the existing `banter_*` category.)
- Server-side `dispatchPush` in `lib/push/apns.ts` already routes to APNs (iOS) and Expo→FCM (Android) — extend the category-to-payload map.
- Each push trigger also **writes to `user_activity`** (TD-11 table) with the same payload, so the Activity feed surfaces them without re-synthesizing. This is the first concrete use of `user_activity` and validates the schema before TD-11's broader migration.
- Notification dots: each trigger sets a row in `user_pending_actions` with `reference_id = matchup_id` so the matchup card gets a per-cell dot. Cleared by `mark_action_complete` when the user opens the matchup.

### Deep linking

URI scheme (consistent across mobile + web):
- `office-pools://pool/{poolId}/showdown/matchup/{matchupId}` — opens matchup card → plays reveal animation if not yet viewed
- `office-pools://pool/{poolId}/showdown/matchup/{matchupId}/result` — opens duel result card
- `office-pools://pool/{poolId}/showdown/banter-cup` — opens Banter Cup leaderboard

Universal links wired the same way on web (`https://office-pools.app/pool/{poolId}/showdown/...`).

The pairing-reveal deep link does NOT auto-play the animation on subsequent opens (matches the spec in `assets/showdown-storyboard/MOTION_SPEC.md` — first view plays full 4s; subsequent opens render the lock-card statically with a replay button).

### Effort estimate

| Piece | Effort | Phase |
| --- | --- | --- |
| Pairing-reveal push trigger + dispatcher hook | 0.5 day | 3a |
| Duel-result push trigger | 0.5 day | 3a |
| Banter Cup standing-change trigger (lightweight) | 0.5 day | 3a |
| 4 new Resend email templates | 1 day | 3a |
| Deep link → matchup card routing (mobile + web) | 0.5 day | 3a |
| Notification dot wiring on matchup card | 0.5 day | 3a |
| New push categories registered (4) | 0.5 day | 3a |
| **Phase 3a total** | **~4 days** | |
| H2H milestone triggers + computation | 1.5 days | 3b.1 |
| Banter sheet push triggers | 0.5 day | 3b.1 |
| **Phase 3b.1 total** | **~2 days** | |
| Season milestone + payout copy | 1 day | v1.1 |

### Phase 3a.pre work (WC-safe, parallel to WC)

The following are pure design / copy work that can be done now without touching infra:

- Write the final copy for all 7 triggers (working draft above).
- Decide quiet hours / per-user notification preferences. **Default recommendation:** honour per-category opt-outs, no quiet hours (gameweek timing is what it is).
- Design the deep-link URI scheme + the routing handler. Document in `mobile/lib/deepLinks.ts` and `web/lib/deepLinks.ts` (both pending).
- Mock the 4 new email templates in `web/emails/showdown/` as drafts. No cron wiring during WC (R-11).

### Open questions

- **Push permission for Showdown specifically vs. pool-level.** Today's notifications are pool-scoped. Should Showdown have its own opt-in? Recommendation: no — Showdown is just another pool mode, lives under pool notification preferences.
- **Quiet hours.** Should Banter Cup standing-change pushes respect quiet hours when matches finish late? Probably yes — defer this push until 8am local if it fires after 11pm.
- **Spam ceiling.** Worst case: a player in 4 Showdown pools gets 4 pairing pushes, 4 duel-result pushes, 4 deadline reminders per gameweek = 12 pushes/week. Per-pool collapsing? Or single aggregated push if more than 2 pools have activity in the same window?
- **Failure handling.** What if the pairing engine runs but a push fails to deliver? Today's dispatcher logs but doesn't retry. Acceptable for v1; revisit if telemetry shows meaningful delivery failures.
- **Pre-deadline reminder for Showdown specifically.** Should there be a "your duel is in 2 hours" extra-urgency push for Showdown only (vs. the standard pick'em deadline)? Probably yes for v1.1.

Related: [[project-backlog-showdown]] (the parent feature), [[project-backlog-showdown-prep]] (Phase 3a.pre scope this contributes to), [[project-backlog-showdown-animations]] (the reveal animation that pairing-push deep-links into), [[project-backlog-mobile-push]] (existing push parity work — shares dispatcher with this).
