# Showdown duel points — implementation plan

**Date:** 2026-08-31 · **Status:** 🟡 **PLAN ONLY.** Nothing applied. Decisions in §4 are open.
**Decision:** Ryan, 2026-08-31 — *"what if the duels produced more points? … if you win a showdown
that's 500 points, that's a big movement and shift."* One leaderboard, one currency; the duel table
becomes a record rather than a rival ranking.
**Ryan's challenge, answered:** *"isn't it just changing the points won?"* — the number **is** one
line (§2), but on its own it changes nothing, because the ranking is a cascade and not a sum (§3).
That, not the number, is the work.

---

## 0. What was verified in the code and the data, 2026-08-31

Not assumed — read and measured:

| | |
|---|---|
| Where 3/1/0 lives | `084:146` — `points_a = CASE WHEN acc.b IS NULL THEN 0 WHEN acc.a > acc.b THEN 3 WHEN acc.a = acc.b THEN 1 ELSE 0 END`. One literal per side. |
| How ranks are ordered | `084:63` — `ORDER BY t.duel_points DESC, t.total_points DESC, t.exact_count DESC, …` A **lexicographic cascade**, not a sum. |
| Is `duel_points` summed into `total_points`? | **No.** Every write of `duel_points` (084, 085, 100) sets that column alone. `total_points` is accuracy only. |
| Is the DB rank correct for Showdown today? | **Yes.** `league_entry_totals.final_rank` is non-null for all 10 entries in the seeded pool and is ordered duel-first. |
| Does the Leaderboard tab read it? | **No.** `LeaderboardTab.tsx:548` sorts by `current_rank`, falling back to `total_points`. See §1 — this is a live bug. |
| `pool_entries.current_rank` for league entries | **NULL for all 10.** `scored_total_points` is NULL too. The fallback is the only path that ever runs. |
| Duels settled anywhere, any pool | **0 of 333 rows**, across both showdown pools. Nothing to restate. See §6. |
| Points per fixture | `066:9` — Results `right 100 / wrong 0`; Scores `exact 100 / winner+margin 75 / winner 50 / 0`. **Both cap at 100.** |
| Fixtures per matchweek | `league_matchweeks.fixture_count`, all five competitions we hold. See §3. |
| Observed weekly score | 27 entry-weeks, Results depth: min 0, p25 100, **median 300**, p75 400, max 700, **mean 259**. Small sample — see §7. |
| Recompute-not-increment | `084:159` — *"Recomputed from the duels, never incremented — a corrected fixture has to be able to take duel points back."* Any new sum must preserve this. |

---

## 1. ⚠ A live bug, found on the way, and it lands tonight

Independent of everything below, and it should be fixed first.

The database ranks Showdown correctly. `league_finalize_ranks` (084) orders on `duel_points` before
`total_points`, which is exactly what `leagueModeInfo.ts` promises the member: *"Duel points decide
the table; the weekly score is the tiebreak."* That rank is written to
`league_entry_totals.final_rank`, and it is populated.

`LeaderboardTab` never reads it. It sorts by `pool_entries.current_rank` — a World-Cup-era column
that is **NULL for every league entry** — and falls through to its `total_points` fallback. So the
Leaderboard tab orders a Showdown pool by accuracy, ignoring the correct answer sitting in the table
next door.

It is invisible today only because every `duel_points` is `0`, so the two orderings agree by
coincidence. **They diverge the first time a duel settles.** At that point the Leaderboard tab and
the Duel tab show different people winning the same pool, and neither says which is right.

This is the same shape as the four deny-all reads found on 2026-08-30 and the one
`denyAllTables.guard.test.ts` was written for: **no error, no empty state, just a confident wrong
answer.** A guard is worth considering — "a league pool's leaderboard order must equal `final_rank`"
— because a fallback that silently produces a plausible ordering will not be noticed again either.

**Fix regardless of §4:** plumb `league_entry_totals.final_rank` into the entries the Leaderboard
tab sorts. ⚠ `league_entry_totals` is **deny-all** (migration 050), so it must come from the server
on the admin client, as `lib/league/duels.ts:177` already does.

---

## 2. The part that really is one line

```sql
-- 084:146, and the mirror for points_b
points_a = CASE WHEN acc.b IS NULL THEN <BYE>
                WHEN acc.a > acc.b  THEN <WIN>
                WHEN acc.a = acc.b  THEN <TIE>
                ELSE 0 END
```

`3 → 500`, `1 → 250`. Ryan is right that this is trivial. The migration is `CREATE OR REPLACE
FUNCTION` over `league_settle_duels`, plus a recompute so existing rows pick up the new values.

Everything else in this document exists because of §3.

---

## 3. Why the number alone does nothing

`ORDER BY duel_points DESC, total_points DESC` means duel points are **absolute**. Accuracy separates
only members who are level on duels. Under that cascade:

- at 3/1/0, one duel win already beats any accuracy total in the pool
- at 500/250/0, one duel win still beats any accuracy total in the pool
- **the order is identical either way**

So "duels produce more points" is not a change to the points. It is a change from a cascade to a
**sum** — one number that both things feed:

```
leaderboard points  =  accuracy points  +  duel points
```

That is what makes 500 mean something, and it is what makes the duel table stop being a rival
ranking: with one currency, the duel table shows a *record* (W/T/L and what those duels contributed)
rather than a competing order. Same relationship a club's form guide has to the league table.

### Where 500 comes from

A perfect matchweek is fixtures × 100, because both depths cap at 100 a fixture (`066:9`). Measured
across every competition we hold:

| Competition | MWs | Fixtures | Per MW | Perfect week | 50% |
|---|---|---|---|---|---|
| Premier League | 38 | 380 | 10.00 | 1,000 | **500** |
| La Liga | 38 | 380 | 10.00 | 1,000 | **500** |
| Serie A | 38 | 380 | 10.00 | 1,000 | **500** |
| Bundesliga | 34 | 306 | 9.00 | 900 | 450 |
| Ligue 1 | 34 | 306 | 9.00 | 900 | 450 |

Premier League and Serie A are uniform at exactly 10 every matchweek. La Liga averages 10.00 with one
9-fixture and one 11-fixture week from re-homing, netting out.

> **Win 500 · Tie 250 · Loss 0 · Bye 250**

The bye matches the tie, preserving the rule already in the copy: *"there was no opponent, so there
was no defeat."*

⚠ **We do not have 3–5 years of history, and do not need it.** `league_seasons` holds five rows, but
they are five *competitions* in 2026/27, not five years. A perfect week is structural — N teams play
N/2 fixtures every matchweek, every season — so history cannot move it.

⚠ **500 is 50% in a 20-team league and 55.6% in an 18-team one.** Neither Bundesliga nor Ligue 1 has
launched. Symmetry holds *within* any pool, which is the gate that matters, so a flat 500 is
defensible — but it is a real drift and §4d decides whether to absorb it.

---

## 4. The decisions — these are what the doc is for

### a. Sum, or keep the cascade? ⭐ the one that matters

**Recommend: sum.** It is what Ryan described, it is the only way the number does anything, and it
makes accuracy meaningful again — under the cascade a member's picking is invisible unless two people
are level on duels.

Cost: `league_finalize_ranks` (084) is **one function ranking every mode**, and its own comment says
why — *"a second rank writer is how two leaderboards start disagreeing about who won."* So the sum
must be expressed inside that single ordering, mode-aware, not by forking the function.

### b. Does the sum move live, or only at settlement?

Accuracy is live — the table moves on the goal (059–063). Duel points exist only at settlement.

- **Settle-only:** the leaderboard is stable through the week, then everyone jumps ±500 at once.
- **Provisional:** the duel's *current* state contributes, so the table swings 500 the moment a duel
  lead changes hands.

Provisional is more dramatic and fits *"the swing is the banter"*. It is also more work and needs a
rule for what a provisional point is worth mid-week. **Recommend settle-only for v1**, revisit after
a few matchweeks of real behaviour.

### c. The late joiner ⚠ blocking

At 3 points, playing fewer duels is noise. At 500 it is a gap that cannot be closed by picking.
Decision 10 has a member joining in October entering the draw from the next matchweek — so they play
fewer duels than the August members, by design.

This is the *"no bad feelings"* line in the vision doc, so it needs an answer before any engine work.
Options: average points per duel rather than a raw sum; credit unplayed duels at the tie value; or
accept it and say so plainly in the copy. **No recommendation yet — needs Ryan.**

### d. Where does 500 live?

A SQL constant, a per-competition value on `league_seasons`, or a per-pool column a commissioner can
set. A pool-level column is the most flexible and the most rope; a constant is the most honest about
what we actually know. **Recommend a constant for v1**, with §3's Bundesliga note recorded against it.

### e. What happens to the 3/1/0 column?

The duel table's `PTS` column currently shows 3/1/0. Under a sum it should show **points earned from
duels** (e.g. 4,500), not a second currency. W/T/L stay as counts. Two numbers both called "points"
is how the confusion comes back.

---

## 5. The work, in order

1. **§1's bug** — plumb `final_rank` into `LeaderboardTab`. Independent, and overdue tonight.
2. **§4c** — settle the late-joiner rule on paper. Blocks everything below.
3. Migration: the 500/250/0/250 values in `league_settle_duels` (§2).
4. Migration: the sum inside `league_finalize_ranks`, mode-aware, one function (§4a).
5. Recompute for existing pools — free right now, see §6.
6. Copy: `leagueModeInfo.ts`, `LeagueScoringRulesTab`, `LeagueHowToPlayTab`, `DuelsTab`. All four move
   together and `leagueModeCopy.guard.test.ts` enforces it.
7. `DuelsTab` — the `PTS` column becomes duel-earned points (§4e).
8. The Duel tab's full table shrinks to your position and neighbours; the season lives on the
   Leaderboard.

---

## 6. ⚠ The free window closes tonight

**0 of 333 duel rows have settled, in either showdown pool.** No member has ever seen a duel points
total, so changing what a duel is worth restates nothing and needs no backfill of anything anyone has
already read.

MW2 settles when Villa–Arsenal finishes (19:00 UTC, 31 Aug). After that, changing the values means
restating a number people have seen — recoverable, since `084:159` recomputes rather than increments,
but no longer invisible.

This is not an argument for rushing §4c. It is an argument for deciding §4c today.

---

## 7. What is soft in the numbers

The duel side is exact — 500 is half a perfect week by construction. The comparison to accuracy is
not: **mean 259 comes from 27 entry-weeks in one seeded pool, early season, Results depth.** The
"duels ≈ 48% of a season" figure rests on it and should be re-measured after ten real matchweeks
before anyone treats it as settled.

---

## 8. Gates (Decision 8)

| Gate | |
|---|---|
| **1. Disclosure** | ✅ *"Winning your duel is worth 500 — half a perfect matchweek — on top of what you scored."* One sentence, and it makes the mode **more** appealing to explain, which is the sign of a real mechanic. |
| **2. Affect** | ✅ Nothing is withheld or timed. The points land when the duel is decided. |
| **3. Symmetry** | ✅ Same bonus available to everyone in a pool. ⚠ Except §4c — the late joiner is precisely a symmetry break, which is why it blocks. |
| **4. Substitution** | ✅ No new obligation. A member who does nothing differently is not punished; they simply score what they score. |
| **5. Variance provenance** | ✅ The outcome comes entirely from two members' picks against real results. The draw is a fixed rotation settled once (116–120), not fresh randomness each week. Raising the stakes does not add variance we invented — it raises the weight on variance the sport already produced. |
