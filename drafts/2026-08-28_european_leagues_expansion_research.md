# Bringing in the other European leagues — research

**Date:** 2026-08-28 · **Status:** research only, nothing built, nothing decided.

Scope: what it would take to add a *second* league competition (La Liga, Bundesliga, Serie A,
Ligue 1, and the others) beside Premier League 2026/27, one at a time.

Everything below was checked against the code or against the live api-football feed on
2026-08-28. Where something is a claim rather than a check, it says so.

---

## The short version

**The league backend was built for this and most of it is already competition-agnostic.** The
schema, the importer's phase detector, the sync-target loader and the qualification-band matcher
were all written against multiple leagues, and two of them were explicitly validated against eight
live competitions before the Premier League shipped. Adding La Liga is *not* a rebuild.

What stands in the way is not league-shape. It is three specific things:

1. **The competition XOR has never shipped.** `pools` carries both `tournament_id` and
   `league_season_id`, and nothing enforces that they agree. This is a recorded blocker in the
   programme *and* in migration 054b's own column comment: *"Do not add a second league competition
   before the XOR ships."*
2. **Every new league needs a hand-made `tournaments` placeholder row.** The importer does not
   create one, no script creates one, and the pool-create route hard-refuses with a 409 without it.
3. **League #1 is not finished.** The three league crons have never run once, none of the four
   modes is deployed, and the engine has still never scored a real member's pick. Adding league #2
   on top multiplies unverified surface rather than adding a product.

There is also one blocker in the programme that, on inspection, **does not apply to this
expansion** — see *R16* below. Worth confirming rather than paying for.

---

## 1. What is already generic — no per-league work

| Thing | Where | Why it already holds |
|---|---|---|
| Season schema | `lib/migrations/050_l1_league_schema.sql` | `club_count CHECK (4–30)`, `matchweek_count CHECK (1–60)`. Championship's 24/46 and Scotland's 12/33 both fit. `competition_slug`, `country_code`, `external_league_id` are per-season columns, not constants. |
| Regular-season detection | `detectRegularSeasonPhase`, [importLeagueSeason.ts:186](lib/integrations/apiFootball/importLeagueSeason.ts) | Picks the regular season **by size, not by name**, precisely so Scotland's `"1st Phase"` and Belgium's three parallel groups do not need an allowlist. Reports what it skipped. |
| Ingest enrolment | `loadSyncTargets`, [syncTargets.ts](lib/integrations/apiFootball/syncTargets.ts) | A new `league_seasons` row auto-enrols in the fixtures cron and the standings cron. **A new league is a row, not a redeploy.** Dedupes on `(provider, league, season)` and shouts on conflict. |
| Qualification bands | migrations **089 / 090 / 092** | Derived from the feed's own `description` strings, and already checked against eight live competitions — PL, La Liga, Bundesliga, Serie A, Ligue 1, Eredivisie, Scottish Prem, MLS. 090 exists *because* the naive matcher was wrong for Scotland and MLS. |
| Matchweek count | `leagueRoundDefs`, [competitionRounds.ts:100](lib/competitionRounds.ts) | Derived from the fixtures. The comment already names 20→38, 18→34, 24→46. |
| Club short names | [clubName.ts](lib/league/clubName.ts) | Word-level substitutions, deliberately *not* a twenty-row Premier League lookup table. |
| Table ordering | [standingsOrder.ts](lib/league/standingsOrder.ts) | Rank is **ingested**, never recomputed. Only genuinely-level adjacent rows are reordered, so a points deduction can never be inside a tie group. Competition-neutral by construction. |
| Fixture paging | [read.ts:573](lib/league/read.ts) | Already paged, with the comment *"a 24-club division is 552 and the PostgREST cap is silent at 1,000."* |

### Provider coverage and quota — checked live, 2026-08-28

Plan is **Pro, 7,500 requests/day**, 157 used at the time of checking. All nine candidate
competitions have a 2026 season with `standings: true`:

| id | league | clubs | matchweeks | fixtures | per MW | events |
|---:|---|---:|---:|---:|---:|---|
| 140 | La Liga | 20 | 38 | 380 | 10 | ✅ |
| 135 | Serie A | 20 | 38 | 380 | 10 | ✅ |
| 78 | Bundesliga | 18 | 34 | 306 | 9 | ❌ |
| 61 | Ligue 1 | 18 | 34 | 306 | 9 | ✅ |
| 94 | Primeira Liga | 18 | 34 | 306 | 9 | ✅ |
| 88 | Eredivisie | 18 | 34 | 306 | 9 | ✅ |
| 40 | Championship | 24 | 46 | 552 | 12 | ✅ |
| 179 | Scottish Premiership | 12 | 33 | 198 | 6 | ✅ |
| 144 | Belgian Pro League | 18 | 34 | 306 | 9 | ✅ |

`syncLeagueFixtures`' own measurement: the Premier League's worst day is 481 requests, 6.4% of the
ceiling, *"comfortable to roughly a dozen leagues."* **Quota is not the constraint.**

---

## 2. The three real blockers

### 2.1 The competition XOR — the recorded one

`pools` carries a populated `tournament_id` **and** `league_season_id` for a league pool. The
vertical slice chose that deliberately so ~50 World Cup read sites kept working. What it deferred:
`pools_exactly_one_competition`, the mode CHECK, the deadline CHECK, and both `DROP NOT NULL`s.

> *"With one league the blast radius of the two competition columns disagreeing is one row; with
> two it is a real hazard."* — SPORTPOOL_PROGRAMME.md

**The programme already records a cheaper remedy**, and it looks right: a **consistency trigger**
asserting that the pool's `league_season_id` season and its `tournament_id` row resolve to the same
`(provider, league, season)` triple. That buys the same safety without the 50-site `CompetitionRef`
sweep, and demotes the XOR to cleanup. This is the smallest thing that unblocks league #2.

### 2.2 The `tournaments` placeholder row — the undocumented one

[app/api/pools/create/route.ts:113](app/api/pools/create/route.ts) refuses a league pool with a 409
unless a `tournaments` row matches the season's triple:

> *"That league has no competition record yet — import it before creating pools."*

And [CreatePoolModal.tsx:229](components/pools/CreatePoolModal.tsx) builds the wizard's competition
list from **`tournaments`**, not `league_seasons` — a league with no placeholder is invisible in the
wizard, and one with no `end_date` is filtered by `hasCompetitionEnded`.

`scripts/import-league-season.ts` does **not** create that row. Nothing does, outside the UX-pool
seeder. So today, importing La Liga produces a season nobody can make a pool for, and the failure
is a 409 at the end of the wizard rather than at import time.

**Fix:** teach the importer to upsert the placeholder — same triple, `format: 'league'`,
`tournament_type: 'league'` (already allowed by migration 024's CHECK), `end_date` from the feed's
season end. ~half a day, and it removes a manual SQL step from every future league.

### 2.3 League #1 is not finished

- The three league crons (`league-outbox`, `league-notices`, `league-standings`) have **never run**.
  `drafts/2026-08-28_league_cron_schedule.sql` is written and unapplied.
- Per the programme, all four modes are built and migrated but **none is deployed**.
- The engine has scored **zero real member picks** — the first contact is matchweek 2.
- **Mobile has no league support whatsoever.** Grepped: not one `league_*` reference anywhere under
  `mobile/`. Every league is web-only until that lands, which is a product fact, not a per-league one.

### 2.4 R16 (`advance-teams`) — probably *not* a blocker for this expansion

The programme says R16 must land before a second competition, and
[advance-teams/route.ts:49](app/api/admin/advance-teams/route.ts) does carry the comment *"MUST be
done before a second competition is ingested."*

But that route reads exactly three tables — `matches`, `teams`, `match_conduct` — and **a league
writes to none of them.** L1 moved league fixtures to `league_fixtures`, clubs to `league_clubs`,
and migration 052 dropped the last league orphans out of `matches`. There is no league conduct
table at all.

So R16 blocks a second **bracket** competition (a Euros, a Champions League). It does not appear to
block a second **league**. Worth confirming before paying for it — the comment predates the L1 split.

---

## 3. What differs per league, and what it costs

Ordered easiest-first. The first two are genuinely near-free; the last two are not.

### Tier 1 — structurally identical to the Premier League
**La Liga (140), Serie A (135)** — 20 clubs, 38 matchweeks, 10 fixtures a week, one clean
`"Regular Season"` phase, bands derive 4/3 exactly like England (verified in migration 090).

Cost per league after the blockers clear: **a catalogue row + one import run.** Plus copy (below).

### Tier 2 — 18 clubs, 34 matchweeks
**Bundesliga (78), Ligue 1 (61), Primeira Liga (94), Eredivisie (88), Belgian Pro (144)**

- A **winter break** — several weeks with no fixtures. Nothing in the matchweek machinery cares
  (it is date-derived, not calendar-derived), but the "one open matchweek" rhythm and the reminder
  cadence have never been exercised across a six-week gap. Worth a deliberate look, not a rewrite.
- **Ligue 1 bands derive 3, not 4** — rank 4 reads `" Qualifying"` with no competition named, and
  090 deliberately refuses to guess. A pool overrides with `league_pool_settings.table_top_n`.
- **Eredivisie derives 2 CL places**, correctly.
- **Bundesliga has `events: false` on this plan.** Irrelevant today (there is no league conduct
  table and `syncLeagueFixtures` fetches no events), but it would kill the planned match-header
  goals/cards feature for that league specifically.
- The relegation play-off / European play-off phases **are not in the feed yet** — see §4.

### Tier 3 — bigger
**Championship (40)** — 24 clubs, 46 matchweeks, **552 fixtures**. The read paths are already paged
for it. The real questions are product ones: 46 matchweeks of Pick'em, and a Table mode asking
somebody to order 24 clubs. Plus a play-off semi-final/final phase the importer will correctly skip.

### Tier 4 — needs a design decision first
**Scottish Premiership (179)** — 🔴 two problems, both real:

1. **12 clubs, 6 fixtures per matchweek, against `MIN_ROUND_FIXTURES = 5`**
   ([rehome.ts:84](lib/league/rehome.ts)). The floor was tuned on 10-fixture Premier League rounds.
   At 6, a round losing two fixtures to a reschedule drops to 4 and **the whole matchweek gets
   emptied into its neighbour** — which is the exact failure that froze Showdown and LMS until
   migration 106. The floor needs to become a fraction of the round, not a constant.
2. **The split.** After 33 rounds the league divides into two six-team groups playing rounds 34–38.
   The importer's phase detector handles it (that is why it picks by size), but the season would
   simply *end at matchweek 33*.

**Belgian Pro League (144)** — 🔴 three parallel groups that all reuse ordinals 31–40 as each
other's. Same class of problem, documented in `importLeagueSeason.ts`'s own comments.

---

## 4. The one thing nobody has hit yet: the feed grows a phase mid-season

Checked live today: **all nine competitions currently show exactly one `"Regular Season"` phase** —
including Scotland (33 rounds) and Belgium (34). The split rounds and play-off phases described in
`importLeagueSeason.ts` (researched 2026-08-14 against *last* season) are **not published yet**.
They get added to the feed as the season progresses.

That matters because `syncLeagueFixtures` **never inserts a fixture the provider invents later** —
by design, since `league_fixtures` has NOT NULL FKs and no safe partial insert exists. So:

> An August import of Scotland looks perfectly clean, and then five matchweeks quietly never arrive
> in March.

This is safe (nothing corrupts) but wrong (the season ends early, and Showdown/LMS settle against a
season that stopped). It affects **Scotland, Belgium, Netherlands, Portugal, Germany, France and
the Championship** — every league with a play-off or split phase. It does *not* affect La Liga,
Serie A or the Premier League.

### ⚠ CORRECTION, 2026-08-28 — this list conflates two different consequences

Checked against a **finished** season rather than reasoning from the phase list. `league=78&season=2024`
returns **308** fixtures:

```
phase "Regular Season"    306 fixtures, rounds 1–34   <- the league, COMPLETE
phase "Relegation Round"    2 fixtures                <- vs a 2. Bundesliga club
```

That season reports **19 clubs**, not 18, because the play-off opponent is not in the league.

So the grown phase is real for Germany, and **losing it costs nothing**: rounds 1–34 are the whole
Bundesliga season, and the extra tie is against a club outside the competition. Contrast Scotland,
where the grown phase **is** rounds 34–38 of the league itself — miss it and the season genuinely
ends at 33.

**The distinction that matters is not "does a phase appear later" but "is the missing phase part of
the league season".** Split leagues (Scotland, Belgium) fail that test; play-off leagues (Germany,
and by the same argument France and the Championship, though those are unverified) pass it. Germany
was therefore safe to import as league #4, and was — see the catalogue comment in
`scripts/import-league-season.ts`.

**This is the strongest argument for going La Liga or Serie A first:** it is the only candidate
problem with no known solution yet, and neither of those two has it.

---

## 5. Copy — much smaller than it first looked

**Corrected after checking each site.** Grepping for `"twenty clubs"` / `"38 matchweeks"` returns a
dozen hits across `table.ts`, `TablePredictionTab.tsx`, `SettingsTab.tsx`, the table-prediction route
and `LeagueScoringRulesTab.tsx` — **every one of them is a source comment, not rendered copy.**

The actual rendered hardcodes are:

- **[CreatePoolModal.tsx:44](components/pools/CreatePoolModal.tsx)** — Table mode's wizard blurb:
  *"put all twenty clubs in finishing order"*. This is the one real one.
- **`tournaments.description`** on the placeholder row — the Premier League's reads *"20 clubs, 38
  matchweeks, 380 fixtures. Flat round-robin: no groups, no knockout."* That is **data**, so a
  correct La Liga row is correct by construction; it only needs the importer to generate it (§2.2).

`lib/leagueModeInfo.ts` — the module all league mode copy comes from — contains **no counts at all**,
and `lib/__tests__/leagueModeCopy.guard.test.ts` already stops any new surface describing a league
pool out of the bracket copy table.

So this is **one string**, not a sweep. Good.

"Matchweek" appears across ~32 files and is fine: it is the English term for all of these
competitions. No i18n needed.

---

## 6. Recommended order

**Do these once, before any second league (~2–3 days):**

1. The consistency trigger (§2.1) — the cheap remedy, not the full XOR.
2. Importer upserts the `tournaments` placeholder (§2.2).
3. The one hardcoded club count in the wizard (§5) — one string, not a sweep.
4. Confirm R16 does not apply (§2.4) — likely a 30-minute check, not work.

**Then the first league: La Liga.** 20/38/10, one clean phase, bands already verified, no split, no
play-off phase to grow into. It is the only candidate that exercises *nothing new* — which makes it
the honest test of whether "a new league is a row" is true.

**Then Serie A** — free if La Liga was.

**Then Bundesliga or Ligue 1** — the first 18-club season, which is what proves the winter break and
the derived matchweek count.

**Scotland, Belgium and the Championship are separate pieces of work**, not later entries in the
same list. Scotland needs the floor rule redesigned; all three need an answer to §4.

---

## 7. Open questions for Ryan

1. **Which league first?** Recommendation above is La Liga, on the grounds that it tests the
   generalisation and nothing else.
2. **Is the R16 blocker still real?** It reads to me like it predates the L1 split and now applies
   only to a second bracket competition.
3. **Does a second league wait for league #1 to be deployed and to have scored a real matchweek?**
   My view is yes — but that is a product call, not a technical one.
4. **What is the answer to §4** (the phase the feed adds mid-season)? Not needed for La Liga or
   Serie A. Needed before anything with a split or a play-off.
5. **`MIN_ROUND_FIXTURES` as a fraction rather than a constant** — worth doing anyway, or only when
   a small league arrives?
