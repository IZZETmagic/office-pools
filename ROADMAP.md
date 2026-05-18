# Project Activities Repository

Single source of truth for the office-pools project: **roadmap**, **backlog**, **tech debt**, and **risks & dependencies**. One-stop shop for all project state. Updated May 2026. Owner: Ryan Sousa.

## How to use this doc

- **§1 Roadmap** — phased plan with timeline anchors and the strategic sequencing decision.
- **§2 Backlog** — index of every deferred work item. Detail for each lives in `memory/project_backlog_*.md` — keep that as the long-form home; this doc keeps the index.
- **§3 Tech debt** — known debt today, annotated with the roadmap phase that clears it.
- **§4 Risks & dependencies** — external constraints, deadlines, and blockers, each with a mitigation.
- **§5 Open questions** — unresolved decisions to settle in Phase 2.

When the project state changes (roadmap reshuffle, new backlog item, debt resolved, risk materialised), update this doc. New long-form backlog entries go into a `memory/project_backlog_*.md` file and get indexed here.

---

# 1. Roadmap

Strategic plan for work to be picked up once the FIFA World Cup 2026 product cycle wraps.

## Timeline anchors

- **World Cup final:** Jul 19, 2026
- **Post-tournament window:** Jul 20 – Aug 14, 2026 (~4 weeks)
- **EPL 2026/27 kickoff:** Aug 15, 2026 — only hard external deadline

The ~4-week gap between WC final and EPL kickoff is the entire planning constraint. Either Showdown ships for EPL Aug 2026 or it slips to the following season.

## Phase 1 — Wind down (within 1 week of WC final)

Goal: capture signal from the live tournament before users disengage; freeze the current product cleanly.

- **Post-tournament feedback survey.** Send two surveys via Resend: pool admins (what took most work, would they run another) and members (favourite moment, biggest frustration, would they play again). Use Google Form / Typeform — do not build response infrastructure. See `memory/project_backlog_feedback.md`.
- **Pause active crons.** Job 3 `auto-submit-and-archive` is the only one still firing; disable after the final settles. Jobs 1/2/4 remain disabled.
- **Capture qualitative log.** Bug reports / confusion / asks heard via text/email/in-person during the tournament go into a private timestamped list — this becomes input for prioritization in Phase 2.

## Phase 2 — Decision gates (~1–3 weeks post-final)

Goal: make the strategic calls that gate everything downstream.

- **Survey review.** Aggregate survey + qualitative log + Web Analytics / Speed Insights if enabled. Output: ranked list of pain points and feature asks.
- **Monetization decision.** Choose between fully free, freemium (free pools up to N members, paid above), per-pool pricing, platform subscription, or sponsored. Inputs: survey "would you pay" responses, projected data-feed cost (likely largest variable), realistic scale. See `memory/project_backlog_monetization.md`.
- **Track sequencing call.** Three competing initiatives: Showdown (new mode, EPL Aug 2026), Expo migration (Android coverage), multi-sport foundation (architecture). Decide the order — the recommended sequence is Showdown → Expo → multi-sport, but the survey can flip this. See **Strategic decision** below.

## Strategic decision: sequencing the three tracks

Three post-WC initiatives compete for engineering time. They all depend on the current World Cup-shaped schema and the existing Swift iOS app, and they pull in different directions.

### Track 1 — Showdown (new product mode)

Ship **Showdown** (H2H pick'em league, random weekly pairings, Banter Cup) on the existing schema for EPL kickoff Aug 15, 2026. Bolt EPL fixtures onto the current data layer as a special case. See `memory/project_backlog_showdown.md`.

- **Pros:** Hits the only hard external deadline. Leverages WC user base while engagement is fresh. Tunnel walk-out reveal animation is a WhatsApp virality wedge. Differentiated — no real H2H competitor in EPL pick'em.
- **Cons:** Adds tech debt — Showdown on WC-shaped schema becomes a second hard-coded competition. By sport #3 the special cases compound.

### Track 2 — Multi-sport foundation (architecture)

Build the abstractions (data model, ingestion, templates, catalog, cadence, branding) before adding more competitions. See the six `project_backlog_*` memory files for each layer.

- **Pros:** Clean architecture. New sports add cheaply once foundation is in. Each new competition becomes config rather than code.
- **Cons:** No product pressure → refactors slip. No new engagement signal during the build. If done before Showdown, misses EPL Aug 2026 entirely.

### Track 3 — App creation (Expo migration, Android coverage)

Replace the Swift iOS app with an Expo/React Native codebase that ships iOS **and** Android from one TypeScript source. See `memory/project_backlog_expo_migration.md`.

- **Pros:** Android coverage doubles the addressable audience overnight (especially relevant for the office/bar context where mixed-device groups are the norm). Single codebase shared with Next.js web → faster iteration. Showdown's WhatsApp / share / QR-join economy is mobile-native, so a strong mobile presence directly amplifies the virality wedge.
- **Cons:** Substantial rewrite — not 4 weeks of work. Splits attention if attempted during the Showdown sprint. Swift app already works for iOS, so this is "expansion" not "fix."
- **Decision input:** the feedback survey's device-mix question. If Android demand is high among pool admins, this jumps in priority.

### Recommended sequencing

```
Phase 3b.0 (May–Jul 2026): Expo foundation work, parallel to WC live ops
Phase 3a   (Jul–Aug 2026): Showdown sprint on existing stack (web + Swift iOS, possibly Expo iOS)
Phase 3b.1 (Aug–Nov 2026): Showdown mobile surfaces → iOS GA, then Android launch
Phase 3c   (Q4 2026+):     Multi-sport foundation, paced to NFL 2027/Euros 2028
```

**Rationale.**

1. **Expo foundation work runs parallel to the WC** (Phase 3b.0). Scaffold, auth, navigation skeleton, parity screens, store accounts — all interruptible work that doesn't touch web, APIs, or the Swift app. Buys 8–10 weeks of mobile runway before the Showdown sprint. Strict rule: WC live ops wins every priority fight (see R-11).
2. **Showdown first** for the build sprint because Aug 15, 2026 is the only hard external deadline. Miss it and the WC user base disperses over a year before the next EPL kickoff — a year of compounding engagement gone.
3. **Showdown mobile surfaces second** (Phase 3b.1), immediately after Showdown ships on web. Foundation already in place from 3b.0; this phase adds the Showdown-specific screens (reveal, matchup card, duel result, Banter Cup) plus Android GA. Aim for Android availability by EPL mid-season engagement spike (~Nov 2026, holiday fixture run).
4. **Multi-sport foundation third**, paced to whichever competition wins the next-sport decision (NFL 2027 starts Sep 2027 → foundation must be ready by ~Jun 2027; Euros 2028 → more headroom).

Contingencies that flip this:

- **WC ops gets busy** → pause 3b.0 immediately. No deadline pressure on the parallel track; pick up post-WC.
- **3b.0 foundation runs ahead of plan** → Showdown can target iOS day-one launch on Aug 15 (instead of web-only), shifting Android-only work into 3b.1.
- **Survey says multi-sport is the unlock** → delay Showdown to EPL 2027/28 and ship multi-sport foundation + NFL 2026 instead.

## Phase 3b.0 — Expo foundation (May–Jul 2026, parallel to WC)

Goal: stand up the mobile codebase during the WC window so Showdown-on-mobile drops into a working app shell instead of greenfield. **Strictly interruptible — WC live ops wins every priority fight (R-11).** Touches no web code, no APIs, and no Swift app. Reads from existing Supabase as-is.

Scope:
1. **Expo project scaffold** — Expo + EAS Build set up, repo structure, CI.
2. **Supabase auth on mobile** — sign-in, sign-up, deep links, token refresh, secure token storage.
3. **Navigation skeleton** — Swift app's 4-tab layout (Home/Dashboard, Pools, Results, Profile/Activity) ported to React Native. Empty screens.
4. **Read-only WC parity screens** — dashboard, pools list, results list, profile. Mirror what the Swift app shows today. No write paths.
5. **App Store + Play Store account setup** — certificates, provisioning profiles, bundle IDs. Submit early because of external review latency (R-05).
6. **Test harness** — Detox or Maestro skeleton.
7. **Shared TypeScript types** — *optional, defer if it forces meaningful web refactor.* Extract types into a shared package only if the work is contained.

Hard rules (per R-11):
- WC ops always wins. Drop the Expo work immediately if support / bugs / live issues need attention.
- No schema changes during WC. The Expo app reads what the web app reads.
- No new APIs. If a screen needs data the web app doesn't already fetch, defer the screen.
- Stop shared-types extraction if it introduces regression risk on the web app.

Out of scope for 3b.0 (deferred to 3b.1): Showdown-specific screens, push notifications, WhatsApp share intent, QR scanning, reveal animation. These need Showdown's UX to be designed first.

## Phase 3a — Showdown build (Jul–Aug 14, 2026)

Tight ~4-week window from WC final to EPL kickoff — scope is non-negotiable, polish moves to v1.1.

Critical path:
1. **EPL fixtures ingestion** — minimal, bolted onto existing data layer. Reuse api-football seed pattern from World Cup.
2. **Pairing engine** — random pairing per gameweek, anti-repeat weighting, three-way duels for odd pools, double-gameweek refresh.
3. **Duel scoring** — 3-1-0 football scoring on top of existing pick accuracy.
4. **H2H ledger** — persistent record across seasons; last-5 form guide on matchup cards.
5. **Tunnel walk-out reveal** — 4-second MP4 export, WhatsApp share.
6. **Banter Cup payout logic** — best H2H record vs eventual champion.

Deferred to v1.1: Double Down boost, pre-duel trash talk, mid-season-joiner median-points logic.

Reused infrastructure (no rebuild): office mini-leagues, bar partnerships, WhatsApp share, QR join, OG previews.

**Launch surface stretch goal:** if 3b.0 lands solid foundation by end of WC, target iOS day-one launch via the Expo app for Aug 15 (in addition to web). Otherwise Aug 15 ships web + Swift iOS, and Expo iOS follows in 3b.1.

## Phase 3b.1 — Showdown mobile + Android (Aug–Nov 2026)

Goal: Android coverage by EPL mid-season engagement spike (~Nov 2026 holiday fixture run). Build on the 3b.0 foundation; layer Showdown surfaces on top; ship Android.

Scope:
1. **Showdown surfaces on mobile** — pool feed, matchup card with H2H form guide, duel result card, tunnel walk-out reveal playback, WhatsApp share intent. Mobile-native flows for QR pool join.
2. **iOS GA** — TestFlight rollout, public iOS launch via Expo. Swift app deprecated once Expo iOS is stable; no flag-day cutover.
3. **Android beta + GA** — Play Store submission after Expo iOS is stable. Android beta → Android GA aimed at Nov 2026.
4. **Push notifications** — APNs + FCM wired up for deadline reminders, duel pairings, result cards.

Deferred / out of scope: native widgets, watch support.

Sequencing notes:
- Swift iOS app stays in production until Expo iOS hits parity AND Showdown surfaces ship. No flag-day cutover.
- Web (Next.js) is untouched — it stays the desktop/SEO/marketing surface.

## Phase 3c — Multi-sport foundation (Q4 2026 onward)

Ordered by dependency. Each item has a dedicated memory file under `memory/project_backlog_*.md`.

1. **Data model abstraction.** Introduce `competition` entity (sport, format, scoring, cadence, window). Pools become children of a competition instance. Foundational — blocks everything else. `project_backlog_data_model.md`.
2. **Sports data ingestion layer.** `SportsDataProvider` interface; one sync job per competition; aggressive caching. Evaluate Sportradar / Sportmonks / API-Football / OpticOdds. `project_backlog_sports_data.md`.
3. **Pool template system.** Bracket, weekly pick'em, survivor, group+knockout, score-prediction. UI rendering conditional per template — likely largest frontend lift. `project_backlog_pool_templates.md`.
4. **Per-competition email cadence.** Replace global Supabase crons with per-competition dispatcher. Email templates become competition-aware. `project_backlog_email_cadence.md`.
5. **Competition catalog & lifecycle.** Discovery surface; clone-from-last-year; lifecycle states (announced → registration → live → finished → archived). `project_backlog_competition_catalog.md`.
6. **Per-competition branding.** Theme config + i18n-style copy lookup. Cosmetic layer — last in. `project_backlog_branding.md`.

## Parallel / independent tracks

- **Match day recap email rewrite.** Originally scoped pre-WC; revisit as the v0 of per-competition cadence work in Phase 3c step 4. `project_backlog_emails.md`.

## Dependency graph (at a glance)

```
Now (May 2026) ──────────────────────────────────────────────────────┐
  │                                                                  │
  ├── WC live ops (Jun 11 – Jul 19, 2026)                            │
  │       └── Phase 1 (Jul 20–26): feedback survey + cron pause      │
  │             └── Phase 2 (Jul 27–Aug 10): monetization +          │
  │                 track-sequencing decision                        │
  │                   └── Phase 3a (Jul–Aug 14): Showdown sprint     │
  │                         → EPL kickoff Aug 15                     │
  │                         └── Phase 3b.1 (Aug–Nov): Showdown       │
  │                             mobile surfaces → iOS GA → Android   │
  │                                                                  │
  └── Phase 3b.0 (May–Jul, parallel to WC): Expo foundation ─────────┘
        (scaffold, auth, navigation, parity screens, store accounts)
        Interruptible — WC ops wins every priority fight (R-11)

(Post-3b.1)
  └── Phase 3c (Q4 2026+): multi-sport foundation
        └── data model → ingestion → templates → cadence → catalog → branding
```

3b.0 is the only parallel track in the plan — and it's parallel by virtue of being strictly interruptible. Everything else is linear because there's effectively one builder. If a second contributor joins post-WC, 3c can start while 3b.1 is still in flight.

---

# 2. Backlog

Index of all deferred work items. Detail lives in `memory/project_backlog_*.md` — that's the long-form home. Each item is annotated with the roadmap phase that picks it up.

## Active — scheduled in current roadmap

| Item | Memory file | Roadmap phase |
| --- | --- | --- |
| Post-tournament feedback plan | `memory/project_backlog_feedback.md` | Phase 1 |
| Monetization model decision | `memory/project_backlog_monetization.md` | Phase 2 |
| Showdown mode (H2H EPL league) | `memory/project_backlog_showdown.md` | Phase 3a |
| Expo migration — foundation work | `memory/project_backlog_expo_migration.md` | Phase 3b.0 (parallel to WC) |
| Expo migration — Showdown surfaces + Android GA | `memory/project_backlog_expo_migration.md` | Phase 3b.1 |
| Mobile push + banter notification parity (mentions wired ✅; pool-wide push + APNs token registration ❌) | `memory/project_backlog_mobile_push.md` | Phase 3b.1 (pre-launch blocker for Swift→Expo cutover) |
| Banter sheet polish punch list (reaction long-press feel, quick-actions anchoring, share-prediction + badge-flex real-data verification) | `memory/project_backlog_banter_polish.md` | Phase 3b.1 (batch with other mobile polish) |
| Form tab polish punch list (tappable badge cells → details bottom sheet) | `memory/project_backlog_form_tab_polish.md` | Phase 3b.1 (batch with other mobile polish) |
| Activity tab — surface XP gains in the feed (e.g. "Submitted predictions +100 XP — Entry A in Pool X") | `memory/project_backlog_activity_tab_xp.md` | ✅ Phase 3b.0 — v1 shipped with Activity tab port (match XP, bonus XP, badge XP); deep-link to Form → Level Runway still TODO |
| Members tab admin actions — view entry, unlock, adjust points (all 3 prediction modes) | `memory/project_backlog_admin_member_actions.md` | Phase 3b.1 (batch with other mobile admin polish) |
| Pool Info tab + non-admin Leave Pool surface + Stop-Participating iOS bug fix (open question: merge Scoring into Pool Info?) | `memory/project_backlog_pool_info_tab.md` | Phase 3b.1 (batch with other mobile polish) |
| Multi-sport: data model abstraction | `memory/project_backlog_data_model.md` | Phase 3c.1 |
| Multi-sport: sports data ingestion | `memory/project_backlog_sports_data.md` | Phase 3c.2 |
| Multi-sport: pool template system | `memory/project_backlog_pool_templates.md` | Phase 3c.3 |
| Multi-sport: per-competition email cadence | `memory/project_backlog_email_cadence.md` | Phase 3c.4 |
| Multi-sport: competition catalog & lifecycle | `memory/project_backlog_competition_catalog.md` | Phase 3c.5 |
| Multi-sport: per-competition branding | `memory/project_backlog_branding.md` | Phase 3c.6 |

## Hygiene — opportunistic

| Item | Memory file | Notes |
| --- | --- | --- |
| Match day recap email rewrite | `memory/project_backlog_emails.md` | v0 for per-competition cadence; revisit as part of Phase 3c.4 or earlier if needed |

## Adding a new backlog item

1. Create `memory/project_backlog_<topic>.md` with `name`, `description`, `type: project` frontmatter, and a body with **Why** and **How to apply** lines.
2. Add a one-line entry to `memory/MEMORY.md` for cross-session recall.
3. Add a row to the appropriate table above with the roadmap phase that will pick it up.

---

# 3. Tech debt

Known debt today. Each item is annotated with the roadmap phase that clears it. New debt should be added here as it's discovered.

| # | Debt | Impact | Cleared by |
| --- | --- | --- | --- |
| TD-01 | Schema is hard-coded for a single World Cup tournament (group stage + knockout, soccer scoring, fixed cadence). No `competition` entity. | Blocks multi-sport. By sport #3 the special cases compound. | Phase 3c.1 (data model abstraction) |
| TD-02 | Sports data is a single bolted-on feed (api-football for World Cup). No `SportsDataProvider` interface. | Every new sport is a one-off integration; caching is ad hoc. | Phase 3c.2 (sports data ingestion) |
| TD-03 | Email crons are global Supabase schedules (jobs 1–4). Can't run per-competition cadences in parallel. | Blocks supporting NFL weekly + UCL match-day + March Madness rounds simultaneously. | Phase 3c.4 (per-competition email cadence) |
| TD-04 | iOS app is Swift, separate from the Next.js codebase. No Android coverage. | Two codebases to maintain; iOS-only audience. | Phase 3b.0 (foundation, in progress) → 3b.1 (Android GA) |
| TD-05 | Pool format is World Cup-specific (group + knockout). No template abstraction for bracket / pick'em / survivor / score-prediction. | Blocks Showdown unless bolted on; blocks multi-sport entirely. | Phase 3c.3 (pool templates). Showdown ships as a special case in Phase 3a — acceptable short-term. |
| TD-06 | UI copy and branding are World-Cup-themed throughout ("match day", "fixtures", "group stage"). No per-competition theming or i18n-style copy lookup. | Reads wrong for non-soccer sports. | Phase 3c.6 (per-competition branding) |
| TD-07 | `PLAN.md` at the repo root is feature-specific (FIFA Annex C third-place distribution). Doesn't belong as a top-level project doc once that feature ships. | Top-level clutter; misleading filename for new contributors. | Archive to `docs/` or delete after Annex C ships and is verified in production. |
| TD-08 | **Anticipated:** Showdown built on WC-shaped schema (Phase 3a) adds a second hard-coded competition. | Compounds TD-01. | Phase 3c.1 cleans both up. Mitigation: scope Showdown's schema additions to be portable to the abstracted model. |
| TD-09 | Expo mobile app stores Supabase session in `expo-secure-store` (iOS Keychain), which warns at >2KB. Sessions are currently ~2.5KB and persist OK, but Expo says future SDK versions may throw. | Risk of silent session-storage failure on a future SDK bump. | Swap to `@react-native-async-storage/async-storage` (Supabase's recommended RN adapter). Bundle with next native rebuild (likely push notifications in Phase 3b.1). |
| TD-10 | Activity feed: XP-gain events (match XP / bonus / badge) still fan out client-side via the per-entry analytics endpoint. N+1 round-trips on every feed refresh. | Slow feed load for users in many pools; blocks unified push fan-out (push needs the server to know about every event). | Extract a slim `computeXPEventsForEntry` helper from `computeFullXPBreakdown` that skips crowd/poolStats and only returns match_xp/bonus/badges. Wire into `/api/users/[user_id]/activity` so the endpoint returns the full feed in one call. Bundle with Phase 3b.1 push notification rollout. |
| TD-13 | ✅ **Resolved 2026-05-16.** Android push parity is live via Expo's hosted relay → FCM V1. Pipeline: mobile registers an `ExponentPushToken[...]` via `getExpoPushTokenAsync({ projectId })` on Android, stores `platform='android'` in `push_tokens`. Server-side `dispatchPush` (in `lib/push/apns.ts`) routes Android tokens to `lib/push/expo-push.ts` which POSTs to `exp.host/--/api/v2/push/send`. Firebase project `sportpool-e34a3` registered, FCM V1 service account uploaded to EAS credentials. Verified end-to-end on Pixel 10 emulator: 33/33 sample pushes across all 7 categories delivered, Android's native stacking grouped them into one bundle with the SportPool brand icon. If we ever outgrow Expo's 600 notifs/sec free tier or want to drop the dependency, swap to a parallel `lib/push/fcm.ts` (~1 day) reusing the same FCM service account JSON. |
| TD-12 | ✅ **Resolved 2026-05-16.** Push notifications for badges earned + level-ups now fire via `entry_xp_state` snapshot diff inside `recalculatePool`. Covers 10 of 12 BADGE_DEFINITIONS (skips dark_horse — needs crowdData). See `lib/push/badges.ts` + migration 017. |
| TD-11 | Activity feed is fully synthesized on every read — 6+ table joins per refresh, no read-state, no permanent history (rank-change snapshots mutate retroactively if pool is recalculated), and no write hook for push fan-out. | Wasteful queries; blocks push notifications, read/unread badges, real-time feed subscriptions, and admin-pushed messages. | **Hybrid persistence**: new `user_activity` table (activity_id, user_id, pool_id, activity_type, payload jsonb, is_read, read_at, created_at, dedupe_key UNIQUE, push_sent_at). Producers write on event (mention notifier, scoring cron, admin point adjust, badge unlock, rank recalc, pool join, prediction submit, XP grant). State-derived events (deadline warnings, matchday recap) stay synthesized — feed endpoint reads persisted slice + computes synthesized slice + merges. Migrate event types one at a time with double-write before dropping synthesis. Bundle with TD-10 + push notifications in Phase 3b.1. Do NOT start during WC (R-11). |

---

# 4. Risks & dependencies

External constraints, deadlines, and blockers — each with a mitigation. Update as risks materialise or new ones surface.

| # | Risk / dependency | Surface | Mitigation |
| --- | --- | --- | --- |
| R-01 | **EPL Aug 15, 2026 kickoff is the only hard external deadline.** Missing it means Showdown slips to EPL 2027/28 and WC user momentum disperses. | Phase 3a | Treat Showdown scope as non-negotiable; polish moves to v1.1. Lock scope by end of Phase 2. |
| R-02 | **Single builder = linear sequencing.** No parallelism unless a second contributor joins. | Whole roadmap | Plan assumes serial execution. Re-plan with parallel tracks if capacity increases. |
| R-03 | **Survey response rate** drives Phase 2 decisions. Low response = decisions made on weak signal. | Phase 1 → 2 | Send admin + member surveys within 1 week of final (peak engagement). Use Google Form / Typeform — low friction. Keep the qualitative log running through the tournament as a backup signal source. |
| R-04 | **Sports data feed cost** is the largest variable expense for multi-sport. Provider choice locks in pricing model. | Phase 3c.2 | Evaluate Sportradar / Sportmonks / API-Football / OpticOdds during Phase 2. Prefer a single multi-sport feed if cost works. Cache aggressively — most feeds bill per request. |
| R-05 | **App Store / Play Store review latency** adds 1–3 weeks to Android launch. | Phase 3b | Start Play Store account setup during Phase 3a downtime. TestFlight → iOS GA → Android beta → Android GA is the planned sequence; don't compress it. |
| R-06 | **Supabase cron throughput / edge function limits** may not scale to per-competition cadences with multiple live competitions. | Phase 3c.4 | Evaluate during Phase 3c.4 design. Fallback: Vercel Cron Jobs as the dispatcher, calling per-competition function endpoints. |
| R-07 | **WC final timing slippage.** Final on Jul 19; any disputes/replays could compress the wind-down window. | Phase 1 | Phase 1 is only ~1 week of work; can compress to days if needed. Auto-submit cron handles in-flight picks. |
| R-08 | **Showdown engagement assumption is unvalidated.** Banter Cup, Double Down, and tunnel walk-out reveal are concepts, not tested behaviours. | Phase 3a | Plan for v1.1 iteration in Sep based on first 4–6 gameweeks of telemetry. Don't commit to v2 features until data is in. |
| R-09 | **Pool size assumption (8–20 players).** Real pools may sprawl above 20 — pairing fairness and round-robin completion break down. | Phase 3a | Soft-cap pool size for Showdown at 20 for v1; surface as an explicit constraint when admins create a Showdown pool. Decide larger-pool semantics in v1.1 with real data. |
| R-10 | **Monetization model not yet chosen.** Pricing changes who the audience is and how the product is positioned. | Phase 2 | Decision is gated on survey signal and feed-cost projection. Avoid optimising for monetization before multi-sport demand is validated. |
| R-11 | **Expo foundation work (3b.0) distracts from WC live ops.** Parallel side-project during a live tournament tends to either get dropped half-built or cause WC operations to suffer. | Phase 3b.0 | WC ops always wins every priority fight. No deadline pressure on 3b.0. No schema changes during WC. No new APIs. Stop shared-types extraction if it threatens web-app regression. If WC ops gets busy, pause 3b.0 immediately and resume post-final. |

---

# 5. Open questions

To resolve in Phase 2 unless noted otherwise.

- Does the survey surface a multi-sport unlock that should flip the recommended sequence (Showdown-first → multi-sport-first)?
- Monetization tier — is per-pool pricing viable, or does freemium with member-count limit have better adoption?
- For Showdown: is the 8–20 player pool size constraint tight enough? Office sweet spot is 10 but real pools may sprawl.
- Banter Cup payout (5%) — does it disincentivise the leader from competing fully? Worth play-testing.
- Showdown launch surface: do we ship iOS-only (current Swift app) for Aug 15, or push for web + Swift iOS day-one? (Currently planned: both.)
- Expo migration sequencing within Phase 3b: iOS parity port first then Android, or build for both from day 1? (Currently planned: iOS first.)

---

**Status:** v1.1, May 2026. Owner: Ryan Sousa. Update this doc as project state changes — roadmap reshuffles, new backlog items, debt resolved, risks materialised.

**Recent changes:**
- v1.1 (May 2026) — Split Phase 3b into 3b.0 (Expo foundation, parallel to WC) and 3b.1 (Showdown surfaces + Android GA, post-Showdown). Added R-11 (Expo work distracting from WC ops). Updated TD-04 status.
- v1.0 (May 2026) — Initial draft.
