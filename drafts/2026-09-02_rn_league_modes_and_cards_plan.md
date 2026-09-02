# The RN league build — the four modes, and the pool card

**2026-09-02.** Asked by Ryan: *the web is in a good place for the new pool modes and the API is up
for every league we want — plan the RN build for the modes and the cards.*

This continues **Part B** of `drafts/2026-09-02_table_mode_fix_and_rn_league_plan.md`, which is now
partly built. It does not restate it; it says what changed, what the card half needs (Part B never
scoped it), and what order the six pieces go in. Everything below was read in the tree at
`a3c3e19` (`tester-gate/allowlist-in-the-app`), not recalled.

---

## Where Part B actually got to

| Gate | Part B said | Today |
|---|---|---|
| **M0** deploy | blocks everything | 🔴 **still open.** `origin/master` = `6dc5710`, 24 Aug. The tip is 58 commits past it |
| **M1** read contract | *"needs a design pass first"* | 🟡 **the shell is built.** `lib/league/season.ts` + `GET /api/pools/:pool_id/league` (`ee240bf`, `a3c3e19`) |
| **M2** react-query | ~1 d | ✅ **done** (`8934907`). Client, `AppState`→`focusManager`, 30 s staleTime, one consumer |
| **M3** broadcast | ~2 d + OTA | 🟡 **half.** `usePoolEntries` moved; 4 consumers left; publication drop gated on the OTA |
| **B4** screens | Pick'em → Table → LMS → Showdown | ⬜ **not started.** `mobile/` still has zero league UI |

So the gate that was *"the single largest item"* is no longer the unknown it was. What exists is the
**shell**: pool + mode + depth, the season, and the viewer's entries with stored totals, picks and
derived submissions. What does not exist is **any mode's own state** — and the card.

---

## Three things found this pass that Part B did not know

**1. The pool card is not the small half. It is the first half, and it is a live defect.**

Nothing filters league pools out of the mobile lists. `mobile/lib/useHomeData.ts` reads
`pool_members` → `pools` → `matches` **by `tournament_id`**, and for a league pool that returns zero
rows, legitimately and without an error. So a member of a Premier League pool opens the app today
and sees:

| On the card | Renders as | Because |
|---|---|---|
| Mode pill | **"Pool"** | `MODE_LABEL` in `PoolListItem.tsx:16` holds the three bracket modes; `league_pickem` misses and falls back |
| Points / rank | **0 / —** | `pool_entries.scored_total_points` is NULL for a league entry; totals live in `league_entry_totals` |
| Form dots | **five grey** | form comes from `league_match_scores`, which is deny-all |
| Deadline | **the season end** | every league pool carries `2027-05-30` in `pools.prediction_deadline` |
| Tapping it | an empty World Cup pool | `usePoolDetail` selects `prediction_mode` and neither `league_mode` nor `league_season_id` |

This is the exact failure `lib/league/poolCards.ts` was written to fix on the web, one surface later.
It is not "mobile has no league features" — it is mobile stating four wrong numbers confidently.

**2. Every league push tapped on mobile goes nowhere.** `lib/league/notify.ts` sends five kinds
(matchweek opened, lock reminder, matchweek completed, table deadline, deadline moved) with
`data: { poolId, tab }`. `mobile/lib/usePushNotificationHandlers.ts:47` switches on `data.type` and
handles exactly one case, `community`, keyed on `data.pool_id`. No `type`, snake vs camel ⇒
`routeFor` returns null and the tap does nothing. For a 38-week season the weekly nudge *is* the
product, and on mobile it currently dead-ends.

**3. `kpiTiles` is already portable, and that is the whole card plan.**
`lib/pools/card.ts` decides every sentence on the card and returns **values, not styling** — `stat`,
`dots`, `crest`, `face`, `clock`, each with a label, a tone and an ISO instant. It has tests. Its one
heavy import, `lib/league/poolCards`, is `import type` and erases. So the RN card is a *rendering*
job on a module that already exists, provided we can reach it — which is decision 1 below.

---

## The plan — six phases

### R1 · The shared boundary (and prove it with a real build)

The pure modules both surfaces need already exist: `pools/card.ts`, `league/matchweekTile.ts`,
`league/duelPoints.ts`, `league/duelVerdict.ts`, `league/ownPicks.ts`, `league/earlyKickoff.ts`,
`league/clubName.ts`, `league/standingsOrder.ts`, `design/competitionColor.ts`, `design/rank.ts`,
`design/initials.ts`. Mobile is a **separate npm project** with its own lockfile and `@/* → ./*`; it
cannot import any of them today.

**Recommended: Metro `watchFolders` at the repo root + a `@shared/*` tsconfig path**, with an
explicit allowlist of entry points and a guard test that walks each one's import graph and fails on
`next/*`, `server-only`, a value import of `@supabase/*`, or a returned CSS class.

⚠ **Do not assume EAS agrees.** This repo is not a workspace, and EAS builds from `mobile/`.
**R1's first task is a spike: wire it, run one real EAS build, and only then let anything depend on
it.** If EAS cannot see outside `mobile/`, fall back to a **generated copy** — a script that mirrors
the allowlist into `mobile/lib/shared/` plus a CI check that fails when the copy is stale. That keeps
the drift guard, which is the only property that matters here: `DUEL_WIN` drifted three times
*inside one codebase*; across a hand-kept copy it is certain.

⚠ **The boundary is values, never presentation.** `design/formDots.ts` returns a Tailwind class and
`design/poolMode.ts` returns `CSSProperties` — those stay web-side. Share the decision; let each
surface paint it.

Also in R1, because they cost minutes now and a silent zero later:

- **Extend `denyAllTables.guard.test.ts` to walk `mobile/`.** It walks `app/` and `lib/` only
  (line 70). Do this *before* the first league screen exists, not after.
- **Add a test runner to `mobile/`.** There is none — no jest, no vitest, zero tests. Cheapest path
  is adding `mobile/**/__tests__/**/*.test.ts` to the root `vitest.config.ts` include, which already
  has the `server-only` alias. Pure modules only; nothing that imports `react-native`.
- **A depth-polarity guard for mobile.** NULL `league_depth` is **Scores** (066). Three web copy
  sites once read it the other way and told members they were playing one game while being scored at
  another. `useLeaguePool.ts` already carries the warning in a comment; make it a test.

**~1–1.5 d**, most of it the EAS spike.

### R2 · The card contract, and RN pool cards

**Server.** One route, `GET /api/me/pools`, returning card-ready rows for **every** pool type —
built from the functions the web server components already call (`readLeagueCardFacts`, batched one
query per table across the page). Web keeps calling the functions directly; the route is mobile's
door to the same code, which is Decision 12 applied rather than re-litigated.

⚠ Page it. `readLeagueCardFacts` is batched, but an unbounded `.select()` truncates at 1,000 rows
with no error.

**Mobile.** `usePoolCards` on react-query; `PoolListItem` and `home/PoolCard` re-rendered from
`kpiTiles()` output. The World Cup tiles come out of the same function, so this is not a league
branch bolted onto the card — it is the card, for both.

Then the two things the stripe carries:

- The competition is shown **only** by a 5 px stripe, and `COMPETITION_COLOR` now holds seven
  entries — World Cup, Champions League, Premier League, La Liga, Serie A, Bundesliga, Ligue 1 —
  which its own header calls full ("*the red band and the blue/navy band each hold about two and
  both are full*"). If "all the leagues we want" is more than these, **the card needs the crest, not
  a colour**, and the URL comes from the same `external_league_id` key. Worth deciding on mobile
  first, where a card is 220 px wide and the stripe is least legible.
- Mobile has no `Countdown` component; the `clock` tile needs one. It is a tick and two captions —
  `countdownText` already owns the hour/minute handover.

**~3–4 d.** Ships on an **OTA**.

### R3 · The league pool shell + Matchweek Pick'em

- `usePoolDetail` selects `league_mode`, `league_depth`, `league_season_id`.
- Mode dispatch in `mobile/app/pool/[id].tsx`: a league pool gets a league tab set, not
  `getVisiblePoolTabs`'s World Cup one.
- Matchweek stepper + picks. `TapScoreField` already exists for Scores depth; Results depth is three
  buttons.
- **Save through `POST /api/pools/:pool_id/predictions`**, which already routes league picks to
  `saveLeaguePredictions`. ⚠ Never write `league_predictions` from the client: the lock is a
  **silent-skip trigger**, and the route exists to read back what was actually accepted.
- Leaderboard: needs a slice on the contract. `/api/pools/[id]/leaderboard` has **zero** league
  references today.
- The `earlyKickoff` warning belongs here — La Liga had 3 of 38 rounds locking a median 6 days before
  the football, against 0 of 38 in England.

**~4–5 d.** The first mode proves the contract end to end.

### R4 · Predict the Table

One screen, one drag-order input, one deadline. `react-native-draggable-flatlist` and
`react-native-reorderable-list` are both already installed. Read and write through the existing
`/table-prediction`; the lock is enforced in the database (078), so mobile inherits the rule instead
of restating it. Depends on Part A (migration 131) being deployed.

⚠ Verify the drag on a device, not in a simulator screenshot — the web equivalent needed a throwaway
harness because dragging in a real pool autosaves.

**~2–3 d.**

### R5 · Last Man Standing

One pick per round. `/lms-pick` exists for the write; the read needs an LMS slice (`readLmsState`,
`readLmsPickFixtures`, `usedClubIds`). The club-once rule and the matchweek lock are both in SQL.
Decision 13 — only a win keeps you in — is the copy this screen must state plainly, because it is
the rule members will get wrong.

**~2 d.**

### R6 · Showdown

Largest by an order of magnitude, and last on purpose: the band, the sealed draw, the walkout
reveal, the recap. `/duel-live`, `/duel-recap` and `/duel-reveal` already exist.

⚠ **The reveal is the one thing here that might not be OTA-able.** Reanimated 4.1.6 is installed;
**Skia is not**. A Reanimated-only walkout ships over the air; matching the web ceremony with Skia
is a store build and a runtime bump. Decide the fidelity before building it, not after.

**~5–8 d.**

### Cross-cutting, not a phase

- **Realtime.** Every league screen subscribes to `pool:{id}:leaderboard` and applies the payload.
  ⚠ Never refetch on an event: the contract payload is the *season*, 165.7 kB measured, and a
  `refetchInterval` on it would be the most expensive line in the app.
- **Finish M3** — the four remaining `postgres_changes` consumers, then drop the publication
  **after** the OTA lands, never before.
- **Push routing.** Give `lib/league/notify.ts` a `type` and teach `routeFor` the five league kinds.
  Small, and it is the difference between a weekly nudge and a dead tap.

---

## What not to port

Carried from Part B §B5, still true, plus one:

- **`DuelsTab.tsx` is 2,646 lines with 23 client-side `useMemo` derivations.** RN receives those
  computed. A number missing server-side is a gap in the contract, not a licence to compute it twice.
- **The `/duel-live` fetch per goal per viewer.** Put per-fixture points in the broadcast payload
  before RN ships; the engine has just computed them.
- **`useHomeData`'s shape.** 825 lines of hand-rolled PostgREST across ~17 `.from()` calls. R2 does
  not rewrite it — but nothing new should be added to it either.

---

## Sequence and size

| | Phase | Size | Ships |
|---|---|---|---|
| 🔴 | **M0 — deploy** (Ryan's call) | — | prod |
| 1 | **R1** shared boundary + three guards | 1–1.5 d | — |
| 2 | **R2** card contract + RN cards | 3–4 d | OTA |
| 3 | **R3** shell + Pick'em | 4–5 d | OTA |
| 4 | **R4** Table | 2–3 d | OTA |
| 5 | **R5** LMS | 2 d | OTA |
| 6 | **R6** Showdown | 5–8 d | OTA, unless Skia |

**~17–24 working days**, order-of-magnitude, excluding QA and the deploy. R2 is the one that pays
back immediately: it ends a live wrong-data defect and proves the contract on the cheapest surface.

⚠ **Mobile talks to production.** `EXPO_PUBLIC_API_BASE_URL` points at the deployed API, and
`GET /api/pools/:id/league` does not exist there — nor on `Development`, which is 21 commits behind
the tip and does not carry `ee240bf`. Until M0, RN work has to build against a branch deploy. The
dev branch shares the **production Supabase**, so that is real data, not a fixture.

---

## What I need from you

1. **Shared code: Metro `watchFolders`, or a generated copy?** Recommendation: try `watchFolders`,
   decide it with one real EAS build in R1, fall back to the generated copy if EAS objects.
2. **Cards before Pick'em?** Recommendation: yes. It is a live defect, it is the cheapest proof of
   the contract, and `kpiTiles` means it is mostly rendering.
3. **Is the stripe still enough to name a competition?** Seven colours, palette declared full. If
   more leagues are live, the card wants the crest.
4. **Showdown's reveal on RN — Reanimated (OTA) or Skia (store build)?**
5. **When does M0 happen?** Everything after R1 assumes members can reach the contract.
