# La Liga 2026/27 — implementation plan

**Date:** 2026-08-28 · **Status:** proposed, awaiting Ryan's approval. Nothing built.
**Research:** `drafts/2026-08-28_european_leagues_expansion_research.md`

La Liga is the **second league competition**, chosen because it exercises the generalisation and
nothing else: 20 clubs, 38 matchweeks, 10 fixtures a week, one clean `"Regular Season"` phase, no
split, no play-off phase for the feed to grow into later.

**The point of this phase is not La Liga.** It is to find out whether *"a new league is a row, not a
release"* is true. Every hour spent on something La-Liga-specific is evidence that it is not, and
should be written down as such.

---

## 0. What was verified against the live feed, 2026-08-28

Not assumed — fetched:

| | |
|---|---|
| api-football league id | **140**, season **2026**, `standings: true`, `events: true` |
| Season window | 2026-08-15 → 2027-05-30 |
| Shape | **20 clubs · 38 rounds · 380 fixtures · 10 per round** |
| Phases | exactly one — `"Regular Season"`. No `"Final"`, no play-off, no split. |
| Club codes | all 20 present, **zero collisions** (ALA BIL ATM BAR CEL COR ELC ESP GET LEV MAL OSA SAN RAY BET REA RSO SEV VAL VIL) |
| Bands, from the feed's own `description` | **4 Champions League · 1 Europa · 3 relegation** — the same 4/3 as England, so `league_default_bands` needs no change |
| Plan headroom | Pro, 7,500 req/day, 157 used at check time. PL's worst measured day is 481. |

Two names will want a short form for a 375px table: **Deportivo La Coruna** (19 chars) and
**Racing Santander** (16). `shortClubName` is word-level, so this is two rules, not a lookup table.
The feed also ships **unaccented** names (`Alaves`, `Atletico Madrid`) — a display-quality question,
not a blocker, and not one to fix with a per-club map.

---

## 1. Prerequisites — do these once, before La Liga

These three are what make La Liga a row instead of a project. They are not La Liga work, and each
pays for itself again at league #3.

### P1 — The competition consistency trigger (~0.5d)

Today a pool carries a populated `tournament_id` **and** `league_season_id` with nothing enforcing
they agree. Recorded blocker: *"Do not add a second league competition before the XOR ships"*
(migration 054b's own column comment, and SPORTPOOL_PROGRAMME.md).

**Do the cheap remedy the programme already names, not the XOR.** A `BEFORE INSERT OR UPDATE`
trigger on `pools` asserting that, when `league_season_id IS NOT NULL`, the season's
`(external_provider, external_league_id, external_season)` triple equals the `tournaments` row's.

- Buys the same safety as the XOR without the 50-site `CompetitionRef` sweep.
- Demotes the full XOR + both `DROP NOT NULL`s to cleanup.
- **RAISE, do not silent-skip.** This is a wrong-competition guard, not a lock; the silent-skip
  pattern used for prediction locks would hide exactly the corruption it exists to catch.
- Backfill check first: assert zero existing `pools` rows violate it before adding the trigger.

### P2 — The importer creates its own `tournaments` placeholder (~0.5d)

[app/api/pools/create/route.ts:113](app/api/pools/create/route.ts) refuses with a 409 unless a
`tournaments` row matches the season's triple, and
[CreatePoolModal.tsx:229](components/pools/CreatePoolModal.tsx) builds the wizard's list from
`tournaments`, not `league_seasons`. **Nothing creates that row.** The Premier League's was made by
hand.

Every field is derivable from what the importer already has. The live PL row, as the template:

| column | La Liga value | source |
|---|---|---|
| `name` | `La Liga 2026/27` | `competition_name` + `season_label` |
| `short_name` | `La Liga` | `competition_name` |
| `tournament_type` | `league` | constant (allowed by 024's CHECK) |
| `format` | `league` | constant |
| `year` | `2026` | `season_start_year` |
| `host_countries` | `Spain` | feed `country.name` |
| `num_teams` / `num_groups` / `teams_per_group` | `20` / `0` / `0` | `club_count`, then zeros |
| `start_date` / `end_date` | `2026-08-15` / `2027-05-30` | feed season start/end |
| `prediction_deadline` | MW1 first kickoff | `league_matchweeks` |
| `status` | `upcoming` | constant — it is authored and already known-stale; nothing reads it on this path |
| `logo_url` | `.../leagues/140.png` | feed |
| `description` | `20 clubs, 38 matchweeks, 380 fixtures. Flat round-robin: no groups, no knockout.` | **generated from the counts**, which is what makes it right for an 18-club league later |
| `external_*` | `api_football` / `140` / `2026` | the triple |

Upsert on the triple, so re-running the importer is still idempotent. **Do this before the import
run**, not after — otherwise the failure surfaces as a 409 at the end of somebody's wizard.

### P3 — The one hardcoded club count (~15 min)

[CreatePoolModal.tsx:44](components/pools/CreatePoolModal.tsx): *"put all twenty clubs in finishing
order"*. Take the count from the selected competition.

⚠ **This is the only rendered one.** Every other `"twenty clubs"` / `"38 matchweeks"` hit in the
codebase is a source comment. `lib/leagueModeInfo.ts` carries no counts at all. Do not turn this
into a sweep.

### P4 — Confirm R16 does not apply (~30 min, probably not work)

The programme says `advance-teams`' unscoped reads must land before a second competition, and the
route's own comment agrees. But it reads exactly `matches`, `teams` and `match_conduct` — **and a
league writes to none of them** since L1 moved fixtures to `league_fixtures` and clubs to
`league_clubs`, and migration 052 dropped the last league orphans out of `matches`. There is no
league conduct table at all.

Verify that claim, then either strike the blocker for leagues or discover I am wrong — either
outcome is worth 30 minutes.

**Prerequisite total: ~1.5 days.**

---

## 2. The La Liga run itself

### Step 1 — Catalogue row (5 min)

One line in `scripts/import-league-season.ts`:

```ts
'la-liga': { name: 'La Liga', country: 'ESP', apiLeagueId: 140 },
```

The file's own comment says an entry that has never been run is *a claim, not a capability*. It
becomes a capability at step 3, not here.

### Step 2 — Dry run (10 min)

```bash
npx tsx scripts/import-league-season.ts la-liga 2026
```

**Read the output, do not skim it.** The four things it must say:

1. `phase imported: "Regular Season"` and **zero** phases skipped. Any skipped phase here means the
   feed grew something between today's check and the run, and that changes the plan.
2. **20 clubs**, 20 to insert, and every abbreviation distinct. The generator falls back to
   `prefix + digit` on collision and then to a unique-violation; a surprise here is worth stopping for.
3. **38 matchweeks**, range 1–38, **10 fixtures each**. A matchweek with fewer than 10 means a
   fixture was dropped, and a silent drop is the failure mode to catch before writing.
4. **380 fixtures**, window 2026-08-15 → 2027-05-30, zero skipped.

### Step 3 — Apply (10 min)

```bash
npx tsx scripts/import-league-season.ts la-liga 2026 --apply
```

Then the placeholder from P2 is created by the same run.

### Step 4 — Verify (~0.5d)

The scripts already exist and are the reason this step is cheap. Run each against the **La Liga
season id**, not the Premier League's:

| script | invocation | what it must show |
|---|---|---|
| `verify-league-standings.ts` | no args — **iterates every season**, so it picks up La Liga on its own | 20 rows, ranks 1–20, and the **cross-check clean**. Migration 076 caught a fabricated fixture on its first-ever run against the PL, so this is not ceremony |
| `verify-league-aggregates.ts` | `--season <la-liga-season-id>` | matchweek windows and lock times derived on all 38 |
| `verify-league-pool-member-view.ts` | `--pool <code>` | a real pool renders |
| `verify-select-columns.ts` | no args | standing guard, per the 2026-08-22 outage |

⚠ **`verify-league-bands.ts` does NOT check the live season** — corrected after reading it. It tests
`league_default_bands` against **scratch seasons** built from verbatim feed text captured on
2026-08-24, and it **already carries a La Liga case** that derives 4/3. That is good news twice
over: it independently corroborates today's live probe, and it means the band function is
pre-verified for this league. But it proves nothing about *our* La Liga row.

For that, call the function directly against the real season and assert the result:

```sql
select league_default_bands('<la-liga-season-id>');
-- must be top_n 4, relegation_n 3, europa_from/to 5/5,
-- and source 'feed' — NOT 'proportional', which would mean the
-- descriptions did not parse and the bands were extrapolated.
```

**Then the thing no script covers:** create a La Liga pool in each of the four modes through the
**browser**, and make a pick. The Premier League's own record is that `league_predictions` sat at
zero rows for weeks while everything else read green — *a green build is not a verified product.*

### Step 5 — Sync enrolment (0 min, but confirm it)

Nothing to do: `loadSyncTargets` reads `league_seasons` and enrols the new row automatically. **But
confirm it happened** — check the next `sync-fixtures` run reports two league targets, not one, and
that the Premier League's own numbers did not move. World Cup targets are ordered first by design;
assert that still holds.

**La Liga itself: ~1 day**, almost all of it verification.

---

## 3. What this phase must produce besides a working league

Three written outputs. Without them the next league costs the same as this one.

1. **A per-league checklist** — the distilled version of §2, so Serie A is a checklist run rather
   than a re-derivation.
2. **An honest count of what was NOT a row.** If P1–P3 were the only non-La-Liga work, *"a new
   league is a row"* is true and Serie A is a day. If La Liga needed anything of its own, name it —
   that is the finding, and it is more valuable than the league.
3. **A note in SPORTPOOL_PROGRAMME.md**, per the operating model. Gill records what changed.

---

## 4. Explicitly out of scope

- **Serie A.** It is free if this works, and the point of going one at a time is to find out.
- **The full XOR** and the `CompetitionRef` sweep — P1 demotes them to cleanup.
- **Mobile.** There is no league support under `mobile/` at all; that is a product decision, not a
  La Liga one.
- **Accented club names.** Real fix is a provider or normalisation question, not a per-club map.
- **Anything with a split or play-off phase** — Scotland, Belgium, the Championship. Those need the
  §4 answer from the research doc first (the feed grows a phase mid-season and the sync will never
  insert it), and Scotland additionally needs `MIN_ROUND_FIXTURES` to become a fraction.

---

## 5. Cost

| | |
|---|---|
| Prerequisites (P1–P4) | **~1.5 days** — paid once, for every future league |
| La Liga | **~1 day**, mostly verification |
| **Total** | **~2.5 days** |
| Serie A afterwards, if the thesis holds | **~0.5 day** |

---

## 6. The one thing I would flag before starting

**League #1 is not finished.** The three league crons have never run, none of the four modes is
deployed, and the engine has still never scored a real member's pick — first contact is matchweek 2,
locking today.

Everything above is technically independent of that. But adding a second league to an undeployed
first one means that when something breaks, there are two candidate causes instead of one. My
recommendation is to schedule the crons and get one real Premier League matchweek scored first.

**That is a sequencing opinion, not a blocker** — if you want La Liga started in parallel, P1–P4
touch nothing the Premier League depends on, and I would start there.
