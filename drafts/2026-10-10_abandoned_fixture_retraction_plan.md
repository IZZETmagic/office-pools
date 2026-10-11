# Plan — a called-off match gives back the points it gave while it was being played

**Status:** BUILT and APPLIED to production 2026-10-11 01:28 UTC as
`lib/migrations/187_a_called_off_match_gives_its_points_back.sql`. The backfill self-check passed
(both fixtures cleared, 0 left, no member's points moved). The trigger change needs no deploy.
⬜ `scripts/verify-abandoned-fixture-retraction.ts` is written and type-checks, but has **not been run**:
it writes a scratch season to the production database, so it waits for Ryan's go-ahead.
⬜ Live `prosrc` hashes (`league_score_fixture` 1b880834… / 16694; trigger 8cc3e4a9… / 1507) are
still to be compared against the file.
**Found:** 2026-10-10, Rayo Vallecano v Athletic Club (La Liga MW8, api-football 1570410),
abandoned at 0–0 around the half-hour mark after objects were thrown onto the pitch.
**Migration:** 187 (185 and 186 are untracked files from other sessions; re-check the number at build time).

---

## What it is for

The leaderboard counts football that counted. Migration 063 already says so in the engine itself:
*"an abandoned match's score is not a result and must not enter a standing."* The engine enforces
that rule when it is asked to score a called-off match, but by then it may already have scored that
match. While a match is live, every goal re-scores it provisionally. When the match is then
abandoned, the engine refuses to score it again but **leaves the provisional points where they
are**. They stay in the total permanently.

Rayo–Athletic happened to cost nothing: the only pick on it (Test La Liga, one member) was a miss.
Had anyone picked 0–0, they would now hold 100 points from a match that never finished.

**Disclosure gate.** *"If a match is abandoned or postponed after kickoff, any points it gave you while
it was being played are taken back."* That passes, and it is worth saying in the rules (open question 2).

## The three holes

| # | Where | What's wrong |
|---|---|---|
| 1 | `league_score_fixture` (066), the refusal branch | It returns early. It never removes the rows a live fixture already wrote, never recomputes totals and never re-ranks. |
| 2 | `score_league_fixture_on_change` (126) | It only calls the engine when the NEW goals are non-null. If the feed blanks the goals when a match is called off, the engine is never asked. |
| 3 | `league_fixture_state` (the witness) | It is never cleared, so it says "scored as live 0–0" for a match that is now cancelled. There's a second stale one too (below). |

Both live function bodies were hashed against the repo on 2026-10-10 and match exactly
(`league_score_fixture` = 066, `3214ea5b…`; the trigger = 126, `b9dca27a…`). The migration builds on those files.

## The rule

**A fixture's score rows always reflect its current state.**

| Fixture state | Engine does |
|---|---|
| `live` or `completed`, goals present | scores it (unchanged) |
| `live` or `completed`, goals NULL | **nothing**: treated as a feed glitch, so a one-tick blip does not make the leaderboard flicker |
| `scheduled`, `postponed`, `cancelled` | **retracts** |

## Retraction: inside `league_score_fixture`, under the same advisory lock

1. `DELETE FROM league_match_scores WHERE fixture_id = p RETURNING entry_id, pool_id`.
   ⚠ **Capture the affected entries from the DELETE.** The existing totals step finds affected
   entries *from the score rows for this fixture*, and after the delete there are none, so a copy
   of that step would recompute nothing.
2. Recompute those entries' `league_entry_totals` from their remaining rows, using the same
   formula as the scoring branch (`LEFT JOIN`, so an entry with nothing left goes to 0).
   `bonus_points` and `point_adjustment` are untouched, as they are today.
3. Delete the witness row.
4. For each affected pool: `league_finalize_ranks`, then queue `fixture_scored`. That event is cache
   invalidation, not a notice; the programme marks it "never" muted. Without it the cached
   leaderboard keeps showing the old points.
5. `PERFORM league_snapshot_matchweek_ranks(mw)`. It's idempotent, and it covers the final matchweek, where
   cancelling the last unplayed fixture is what closes the window (094's `v_playable` excludes
   cancelled). Today nothing on this path calls it.
6. Return `ok: false, reason: 'fixture not scoreable', retracted: n`. Keeping `ok: false` means the
   TypeScript caller's existing "not an error" handling stays correct.

Fast path: no rows and no witness means return exactly as today.

## Trigger: the engine owns both directions

Drop the `n.home_goals IS NOT NULL AND n.away_goals IS NOT NULL` filter. Any change to
`(home_goals, away_goals, is_completed, status)` calls the engine, which decides whether to score,
retract or do nothing. The cost is negligible: those four columns change a handful of times per
fixture per season (the clock is not in the tuple).

The TypeScript caller in `syncLeagueFixtures.ts` (~line 884) has the same filter. **Leave it.** The
trigger catches every write, including manual ones like tonight's, which is why 126 exists. Only
its comment ("a postponed or cancelled fixture that still carries a score — the engine refuses")
needs updating. **No deploy is needed for the fix.**

## What deliberately does NOT change

- **A settled Showdown duel is not reopened.** This mirrors 094: a late-played fixture scores into
  the total but does not reopen the duel. An unsettled duel simply sums fewer rows when it settles.
- **Last Man Standing** reads `is_completed` only, so it's unaffected.
- **Table mode** is a full-time table. Confirm while building that `league_score_table` does not
  read `league_match_scores`.
- `previous_final_rank` and the rank history are not rewritten.
- **No message to members.** `fixture_scored` is cache-only.
- The **World Cup** engine (`matches`/`match_scores`) is out of scope, since that competition is over.

## Backfill (in the migration)

Run the retraction for every fixture that is not live or completed and still has score rows or a
witness. As of 2026-10-10 that is:

| Fixture | Rows | Points | Witness |
|---|---|---|---|
| Rayo Vallecano v Athletic Club (1570410), `cancelled/abandoned` | 1 (Test La Liga) | 0 | "live 0–0" |
| Arsenal v Man City (1557477), PL, `scheduled` for 29 Nov | 0 | 0 | **"completed 2–1", scored 24 Aug** |

Expected effect: **no member's points move.** The Arsenal–City witness is residue of unknown
origin. It isn't from `verify-postponed-fixtures.ts`, which uses a scratch season. The engine only uses it to
report `changed`, so it is harmless, but it is false.

## Verification

New script `scripts/verify-abandoned-fixture-retraction.ts`, scratch season torn down in a `finally`
(the `verify-postponed-fixtures.ts` pattern). Each property is checked on its own:

1. a live 0–0 scores an exact pick provisionally (100)
2. live → `cancelled` **with goals kept**: the row is gone, the total is back to 0, the rank is recomputed, the witness is gone, and one outbox row is queued
3. live → `cancelled` **with goals nulled**: same result (the trigger path, hole 2)
4. `bonus_points` and `point_adjustment` survive a retraction
5. live with goals momentarily NULL: rows are **not** removed
6. abandoned → resumed → completed: scores again normally
7. a settled duel is not reopened
8. every other fixture's rows are untouched

Then re-run `verify-postponed-fixtures.ts` and `verify-league-leaderboard.ts` for regressions. After
applying: hash the live `prosrc` against the file, and query prod for zero non-scoreable fixtures with
score rows or a witness.

## Open questions, Ryan's

1. **Awarded results.** La Liga may award Rayo–Athletic (a home side whose fans caused the
   abandonment can lose the match) instead of replaying it. Do picks score against an awarded scoreline?
   Today they can't: the shared mapper files `AWD` as `scheduled`, so it never scores. That's not
   part of this migration, but it decides what eventually happens to this match.
2. **Say it in the rules?** Use the disclosure sentence above, on the scoring rules page and in the FAQ.

## Loose end from tonight

`league_fixtures` 1570410 was hand-set to `cancelled/abandoned` with **`manual_override = true`** on
2026-10-10, because api-football still reports it as `INT` and the hourly sync would have reverted it.
While the override is on, **the sync ignores this match entirely.** Clear it as soon as La Liga
rules, whether it's a replay date or an awarded result:

```sql
UPDATE league_fixtures SET manual_override = false
 WHERE fixture_id = '141bef65-1af8-4b01-9f36-c5cb5a07fc5b';
```
