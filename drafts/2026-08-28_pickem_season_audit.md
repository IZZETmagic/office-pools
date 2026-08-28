# Pick'em, end to end — audit against production, 2026-08-28

Ryan: *"I would like to look at and work on finishing up the Pick'em logic and flow for the season.
I think we are in a great spot but just want to make sure."*

He then asked for the audit only — findings recorded, order his call. Nothing in this session
changed code, data or production. The two edits made are to `SPORTPOOL_PROGRAMME.md` and this file.

---

## Method

Everything below was read from **production**, not inferred from the repo:

- `scripts/verify-league-pool-member-view.ts` — the existing read-only member-view check
- four throwaway probe scripts in the session scratchpad, driving `createAdminClient()`
- PostgREST's OpenAPI document (`Accept: application/openapi+json`) for the applied schema and the
  exposed RPC list — this is how "migration 096 is applied" is known rather than assumed
- `git fetch` + `git rev-list --left-right --count origin/master...master`
- `npx vitest run` on the local branch

⚠ Two traps were hit while doing it and are worth repeating, because both produce *plausible wrong
answers* rather than errors:

1. **Discarded PostgREST errors.** The first probe reported `completed=0` fixtures and `picks=0` for
   every matchweek. Both were false — the selects named columns that do not exist
   (`league_fixtures.home_score`, which is really `home_goals`), and `const { data } = await …`
   swallowed the 42703. The corrected run showed 10 completed fixtures and 240 picks. Surface
   `error` on every probe. See `memory/supabase_discarded_postgrest_errors.md`.
2. **`count: 'exact'` returning `null`** looks exactly like "the table is empty".

---

## 1. The finding everything else follows from — nothing is deployed

```
origin/master  6dc5710  2026-08-24  fix(refund-policy): name Paddle as merchant of record
master         c62063b  2026-08-28  fix(programme): correct Decision 10 …
                                     32 commits ahead, 0 behind
```

The **database** has been migrated all the way through (096's `league_score_missed_fixtures` is in
the live RPC list). The **web app** has not moved since 24 Aug. So production is old code against a
new schema — the safe direction of that mismatch, but it means every ✅ recorded since 24 Aug
describes Ryan's laptop.

Undeployed and member-facing: the mode wizard, the matchweek stepper, Results-depth picking and
results screens, the league table tab, league scoring rules, the leaderboard column fix, the weekly
reveal, Showdown, Last Man Standing, Table mode, **and both cron routes**
(`/api/cron/league-outbox`, `/api/cron/league-notices`).

`npx vitest run` on the branch: **625 passed, 6 skipped, 45 files.**

---

## 2. Where the season actually is

| | |
|---|---|
| `league_predictions` | **240 rows** — 74 scorelines, 166 outcomes, created 25–26 Aug |
| Which matchweek | **All 240 are matchweek 2.** Zero for matchweek 1 |
| `league_match_scores` | **0 rows.** Not one Pick'em point has ever been scored |
| Matchweek 1 | 10/10 played, `ranks_snapshot_at` 2026-08-25. Finished before the first pick existed |
| Matchweek 2 | locks **2026-08-28 19:00 UTC**, 10 fixtures Fri–Mon |
| `league_fixture_state` | 11 rows — 10 for MW1 plus **one for a scheduled MW12 fixture**, presumably left by a live-scoring test. Harmless as far as this audit goes; worth a look before it confuses someone |
| Fixture sync | alive — `knockout_link_last_attempt` 2026-08-28T13:50, `sync_enabled = true` |

**Matchweek 2 is the first contact between the scoring engine and a real member's pick.**

### The pools

| Code | Name | mode / depth | Members | Picks |
|---|---|---|---|---|
| `PTQPZ797` | Premier League 2026/2027 Pool | pickem / scores | 3 | 0 |
| `9XJ8Q5KT` | Office Premier League Pool | pickem / scores | 1 | 0 |
| `X9ES7XNS` | Matchweek Pick'em | pickem / **results** | seeded | 76 |
| `PB47LSCE` | Pick'em: Exact Scores | pickem / scores | seeded | 16 |
| `7WZ7RZGW` | galacticoco | **null / null** | 1 | **10** |
| `ZQMCEP2W` | uffff | **null / null** | 1 (2 entries) | **2** |

`7WZ7RZGW` and `ZQMCEP2W` were created **2026-08-26 by real users who found the product on their
own** — they are the only pools with picks that were not seeded. Both carry NULL mode and depth,
because the deployed create route predates migration 077. Their World Cup doors are clean:
`has_submitted_predictions = 0`, `point_adjustment = 0` on every entry.

---

## 3. Findings, ranked

### 🔴 A. Nothing reminds anyone to pick

The four deployed push crons — `push-deadline-warnings`, `push-predict-reminders`,
`push-match-starting`, `push-matchday-recap` — contain **zero** occurrences of "league". They gate on
`pools.prediction_deadline`, which for a league pool is the season's last kickoff (2027-05-30), so
they will not fire for a league until the season is over.

`league-notices` is the league's answer and its own header already says it:
*"⚠ NOT SCHEDULED YET, and it cannot be until production has this route. Confirmed 2026-08-28: it is
not on `master`, so a job would POST to a 404 every hour."*

For a 38-week season the weekly nudge is not a nicety — it is the mechanism by which anybody is still
playing in November. Nobody was told matchweek 2 was closing.

### 🔴 B. The outbox is never drained

`league_score_events` holds **9 unclaimed rows**, all `matchweek_completed`, all queued
2026-08-25T00:37 when matchweek 1 snapshotted. The producer works. The consumer
(`/api/cron/league-outbox`) does not exist in production and has no `pg_cron` entry.

Consequences: no "results are in" email or push, and **no pool-cache invalidation after scoring** —
`invalidatePoolCache` is called from the consumer.

Neither `league-outbox` nor `league-notices` nor `league-standings` is scheduled. Only two crons are
scheduled by migration at all (008, 014); the rest live in the Supabase dashboard, so scheduling
these is a manual step *after* a deploy, not something the deploy does.

### 🔴 C. NULL depth is described as Results and scored as Scores — deploy blocker

The engine is explicit. Migration 066, in its own words: *"A pool with `league_depth IS NULL` …
falls through to the Scores ladder byte for byte."* In `judged`:

```sql
WHEN depth = 'results' THEN CASE WHEN pout = v_outcome THEN 'winner' ELSE 'miss' END
-- SCORES depth, and NULL, which is every pool predating migration 064.
WHEN ph = v_home AND pa = v_away THEN 'exact'
```

Three surfaces derive the **opposite half of the pair**:

| Site | Line | Reads |
|---|---|---|
| `lib/leagueModeInfo.ts` | 57 | `const scores = depth === 'scores'` |
| `app/pools/[pool_id]/LeagueHowToPlayTab.tsx` | 50 | `const scores = depth === 'scores'` |
| `app/pools/[pool_id]/LeagueScoringRulesTab.tsx` | 381 | `if (depth === 'scores')` |

…while every site that agrees with the engine derives `results` instead — the picker
(`ProgressivePredictionsFlow.tsx:118`), the leaderboard (`LeaderboardTab.tsx:137`), and the save
route (`predictions/route.ts:270`).

So on the day the branch ships, a member of `7WZ7RZGW` or `ZQMCEP2W` is told:

> *"Every matchweek, members call all ten fixtures Home, Draw or Away … Every fixture is worth the
> same, so there is nothing to gain from a bolder call than the one you believe."*

…while the screen asks them for a scoreline and the engine pays 100 / 75 / 50. The tie-breaker card
misdescribes the cascade the same way, and `LeagueScoringRulesTab`'s `showFixtures` gate
(`depth !== null`) **hides the fixture scoring card entirely**, so there is no correction anywhere on
the screen.

⚠ This is the same class as `lib/__tests__/leagueModeCopy.guard.test.ts`, one level down. That guard
asserts no surface describes a league pool out of the bracket copy. Nothing asserts the copy layer's
**depth polarity** matches the engine's.

**Two fixes, and both are wanted:**

1. **Code** — flip the three sites to `depth !== 'results'`, render the Scores fixture card when
   depth is NULL, and extend the guard test to assert the polarity. Closes the class.
2. **Data** — stamp the two live pools `league_mode = 'pickem'`, `league_depth = 'scores'`. That is
   what they *are*: their picks are scorelines and the engine is already paying them as such.
   ⚠ It must be `'scores'`, never `'results'` — at Results depth the engine judges `pout`, which is
   NULL on all twelve of their picks, so every one would score `'miss'` and **both members would end
   the season on zero.**
   Both columns are still settable: `trg_league_depth_immutable` fires only when the old value is
   non-NULL.

### 🔴 D. A Pick'em season has no end

`openMatchweekId` "returns null once the season is over" and that is the entire treatment. After
matchweek 38 there is no completion, no winner, no final standing, no wrap-up, no notification;
`pools.status` stays `'open'` for ever. Nothing writes a final anything.

The season-end **snapshot** that exists (`league_snapshot_final_standings`, migration 080) belongs to
Table mode and exists to stop a June feed correction restating a paid award. It is not a Pick'em
season end.

Nor is one planned: `drafts/2026-08-24_league_pools_full_plan.md` §0.12 ends at *"Showdown · LMS ·
Form tab · mobile · second league"*. **This is a genuine gap in the spec, not just the build** — and
it is the one item in this audit that needs a product decision before it can be built. It also has to
pass the disclosure gate, and the plan already carries a warning that bears on it: *"a season-end
reveal is the kind of surprise that makes bad feelings."*

### 🟠 E. Carried forward, unchanged

- **Form tab / XP / badges are blocked for league.** Three `readSource` arms return empty by design
  (`readMatchScores`, `readMatchScoreClassification`, `readRecentMatchScoreEvents`). The outbox
  consumer deliberately skips XP for exactly this reason — running it would write zeros and show a
  member 0% accuracy rather than nothing.
- **Mobile has no league code at all.** A ten-month weekly-pick season is a phone product.
- **No reconciler.** The World Cup has `shadow_reconcile_matches()` every minute; the league has
  nothing equivalent and no phase asked for one.

---

## 4. What is genuinely fine

Worth stating plainly, because the list above is all problems:

- The **write path** is careful in the way this codebase has learned to be — it reads back what
  actually landed rather than trusting the upsert, because the lock is a silent-skip trigger
  (`lib/league/write.ts`).
- The **engine** recomputes rather than increments, so a corrected result can take points away.
- **Matchweek rhythm** holds: all four live league pools report `1 completed · 36 locked · 1 open`,
  and it is enforced in the database (058), not the UI.
- The **containment constraint** holds in production data: zero league entries touch
  `has_submitted_predictions` or `point_adjustment`.
- **Missed-deadline copy exists** (`RoundStatusCard.tsx:274`) — *"You missed the deadline for this
  matchweek. You scored 0 points for it…"*.
- Matchweek 2 **will** sync and score correctly this weekend, on the Scores ladder. Silently, with no
  notification and no cache invalidation, but correctly.

---

## 5. Suggested order — Ryan's call, not taken

1. **Fix C's code half** and add the guard test. Self-contained, no deploy needed to be worth doing,
   and it is a blocker on shipping anything else.
2. **Stamp the two pools** (`pickem` / `scores`). One `UPDATE`, reversible, removes the NULL from
   production entirely.
3. **Preview-build the branch** on `Development` — Vercel enforces lint and types there, and 32
   commits have never been through a real build. (`npx tsc --noEmit` locally reports 537 errors, all
   in the three known environmental buckets: the `routes.d 3.ts` iCloud duplicate, `FormData`, and
   `mobile/`. That is not a green light — it is only "no new signal".)
4. **Deploy**, then **schedule** `league-outbox` (every minute) and `league-notices` (hourly) in
   `pg_cron`. B and A close together, and the 9 stuck events drain on the first tick.
5. **Design the season end.** The only item here that needs a decision before it needs code.

---

## 6. Also noticed, not chased

- One `league_fixture_state` row points at a **scheduled matchweek-12 fixture**. Everything else in
  that table is matchweek 1. Almost certainly a live-scoring test that was not torn down.
- Migrations **098–102** could not be confirmed applied. `league_queue_table_deadline_notices` (099)
  is absent from the exposed RPC list, but that is not proof — the check was inconclusive, not
  negative. Confirm before relying on the table-deadline reminder or on 101's window rule.
- The Supabase MCP is **not authenticated in this session**, so none of the above used it. It needs
  `claude /mcp` in an interactive session; everything here went through the service-role key in
  `.env.local` instead.
- The **APNs key rotation** flagged in the 24 Aug handoff — two lines of the private key PEM were
  printed into a transcript — still has no confirmation either way. Worth closing.
