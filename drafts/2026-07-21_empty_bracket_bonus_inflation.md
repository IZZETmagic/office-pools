# Bonus inflation for entries that barely predicted (OPEN — deferred 2026-07-21)

**Status: documented, NOT fixed. Deliberately left alone — the tournament is over and a
fix moves ranks retroactively.**

Found while auditing the podium re-score. Unrelated to the podium bug.

---

## The bug in one line

An entry that predicted almost nothing is credited with having "predicted" the FIFA-seeded
group order — which is roughly what actually happens — so it collects most of the group
bonuses while doing none of the work.

## Why it happens

`calculateGroupStandings` (`lib/tournament.ts:227`) builds a table for all 12 groups from
whatever predictions exist. With **no** predictions for a group, every team ends
`played 0, points 0, GD 0, GF 0`, so the sort falls all the way down the FIFA tiebreaker
chain (`lib/tournament.ts:398-414`):

| # | criterion | value when nothing was predicted |
|---|---|---|
| 1–3 | overall points / GD / GF | all 0 → tied |
| 4–6 | head-to-head points / GD / GF | all 0 → tied |
| 7 | fair-play conduct | predicted brackets carry no conduct by design → 0 → tied |
| **8** | **FIFA ranking points** | **the only discriminator left** |

So the "predicted" table for every group is simply *the teams in FIFA-ranking order*.

That is a genuinely good forecast — seeding predicts real group winners most of the time —
and `calculateGroupStandingsBonuses` (`lib/bonusCalculation.ts:120`) has no idea the table
was never actually predicted. It only gates on the group's real matches being complete
(`:132`), never on the member having predicted them.

Criterion 8 is correct *as a bracket-cascade fallback* — something has to advance. It is
wrong as evidence of an opinion. This is the same class of bug as the podium's
FIFA-ranking fallback fabricating a "pick", fixed in `ea8d9da` via `requireExplicitPick`
(`lib/tournament.ts:641`) — the group-standings path never got the equivalent treatment.

## Measured impact (production, 2026-07-21, verified)

Entries with **1–5 predictions in the entire tournament** that are flagged submitted:

| mode | entries | avg bonus pts | avg match pts |
|---|---|---|---|
| full_tournament | 66 | **1,881** | 56 |
| progressive | 89 | **1,340** | 233 |
| *(reference)* full_tournament with 48+ preds | 1,362 | 2,429 | 3,095 |

**A near-zero predictor earns ~77% of a full predictor's bonus points with ~2% of their
match points.** Max single bonus total in the 1–5 bucket: **6,400**.

Where those points come from (1–5 prediction bucket, both modes):

| bonus_type | rows | entries | total pts |
|---|---|---|---|
| `group_winner_and_runnerup` | 994 | 139 | **151,290** |
| `group_winner_only` | 497 | 139 | 52,180 |
| `correct_bracket_pairing` | 220 | 67 | 15,525 |
| `both_qualify_swapped` | 146 | 139 | 11,165 |
| `75pct_qualified_correct` | 140 | **140 of 140** | 7,785 |
| everything else | — | — | ~5,430 |
| | | | **≈ 243,000 pts** |

The two tells:

1. **994 `group_winner_and_runnerup` rows across 139 entries ≈ 7.2 of 12 groups called
   exactly right** — both winner *and* runner-up — by people who made at most five
   predictions. That is not luck.
2. **`75pct_qualified_correct` fired for 140 out of 140** of them. Taking the top two
   seeds in every group gets ~75% of the round-of-32 right, every time.

Entries with 6–20 and 21–47 predictions are inflated by the same mechanism on their
*unpredicted* groups (61 and 17 full_tournament entries, avg bonus 1,639 / 1,622).

## The fix, when it is picked up

Apply the principle already established for the podium: **no prediction ⇒ no derived
opinion ⇒ no bonus.**

1. In `calculateGroupStandingsBonuses` (`lib/bonusCalculation.ts:129-137`), additionally
   require that the entry actually predicted that group's matches before awarding. Cleanest
   rule: **all 6 of the group's matches predicted**, matching the bonus's own semantics
   ("you called this group's table"). A partial predictor still gets FIFA-ordered filler for
   the matches they skipped, so a `>= 1` threshold would not close the hole.
2. Same gate for `calculateQualificationBonus` (`:190`) — `75pct_qualified_correct` is
   derived from the same seeded table. Require the full 48 group matches predicted.
3. Consider threading a `requireExplicitPick`-style flag into `calculateGroupStandings`
   so an unpredicted group returns an explicitly *unresolved* table rather than a
   plausible-looking seeded one. That kills the whole class rather than patching two
   call sites, and stops the phantom table leaking into any future consumer.
4. Regression test in `lib/__tests__/` : an entry with zero group predictions must earn
   **zero** group-standings and qualification bonuses, even though its derived table
   matches reality.

**Blast radius of fixing it:** ~155 entries lose 1,300–1,900 points each (~243,000 total),
which moves ranks in roughly 87 pools. That is why it is deferred — it is a retroactive
demotion for real people after the tournament has ended. Worth doing before the next
competition starts, not during the wind-down of this one.
