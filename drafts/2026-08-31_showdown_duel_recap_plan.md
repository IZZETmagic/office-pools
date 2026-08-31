# Showdown duel recap — implementation plan

**Date:** 2026-08-31 · **Status:** 🟡 **PLAN ONLY.** Nothing built.
**Decision:** Ryan, 2026-08-31 — *"this could be a slide up modal maybe???"*, then **pool-wide**, and
**the walk-out is v2**.
**What it is:** when your duel is decided, the next time you open the pool you get a one-time recap of
how it went. Once per matchweek, dismissible, and never the only way to learn the result.

---

## 0. What already exists, verified in the code

Not assumed — read:

| | |
|---|---|
| A slide-up modal | `components/ui/Modal.tsx:57` — `flex items-end sm:items-center` + `animate-modal-slide-up`. **Already a bottom sheet on a phone and a centred dialog on desktop.** Props: `isOpen`, `onClose`, `title?`, `titleId?`, `size?`, `children`. Escape closes. |
| A seen-once precedent | `has_seen_how_to_play` on `pool_members`, written non-blocking from a `useEffect` in `PoolDetail.tsx:473`. ⚠ Does not transfer — see §2. |
| Where a pool-wide modal mounts | `PoolDetail.tsx` — it already owns tab state, the how-to-play effect and `memberId`, and it renders on every tab. |
| The duel rows | `league_duels`: `duel_id, matchweek_number, entry_a, entry_b, accuracy_a, accuracy_b, points_a, points_b, settled_at`. `settled_at` is the only ordering-safe "when". |
| `pool_entries` today | 26 columns, none of them a recap marker. Nearest neighbours are `predictions_last_saved_at` and `last_rank_update`, both plain `timestamptz`. |
| The card's summary state | Already asked for separately (in-play / summary / countdown / picking). This plan does **not** replace it — see §3. |
| Duel values | 500 / 250 / 0, bye 250 (migration 121, applied). The recap states points, so it must read them rather than restate a rate. |

---

## 1. ⚠ The gate, first, because this is the shape it exists for

An auto-opening modal is the classic dark-pattern silhouette. This one passes, but only under a rule
that has to be written down rather than remembered:

> **The recap may never be the only way to learn the result.**

The standings, the duel card and the leaderboard must already be correct and visible *behind* the
sheet. The moment a result is withheld until the ceremony is seen, this becomes *"we hold your score
back so you come back"* — the exact example the disclosure gate names as a failure.

Concretely, three things follow:

1. Dismissing costs nothing. The card's summary state carries the same information until the next
   matchweek locks.
2. Nothing is gated behind it — not picking, not the leaderboard, not banter.
3. It fires at most once per settled duel. A modal that reappears is nagging, not ceremony.

Full gate pass in §8.

---

## 2. The seen marker ⭐ the only real decision

`has_seen_how_to_play` is a boolean for the life of the membership. A recap fires **every matchweek,
once each**, so a boolean cannot express it.

### Recommend: `pool_entries.last_recap_seen_at timestamptz`

There is an unseen recap when the viewer's most recently settled duel has
`settled_at > last_recap_seen_at` (or the column is NULL).

Why this shape:

- **One column, one write.** It sits beside `predictions_last_saved_at` and `last_rank_update`, which
  are the same idea.
- **⚠ IT MUST NOT BE A MATCHWEEK NUMBER.** `last_recap_seen_matchweek int` with a `>= n` test is the
  obvious design and it is wrong: rounds are played out of numerical order — migration 101 measured a
  minimum gap of **minus 121 days** across three real seasons — so a member who saw the recap for a
  late-numbered round played early would never see another. A timestamp cannot have that bug.
- **It self-limits.** Miss three weeks and you get the latest duel, not three stacked sheets. Falls
  out of the comparison rather than needing a rule.
- **Per entry, not per member**, so a multi-entry pool recaps each entry independently.

### Rejected

| | |
|---|---|
| `localStorage` | Per-device. See it on the phone, see it again on the laptop. For a once-per-week ceremony that reads as a bug. |
| `recap_seen_a` / `recap_seen_b` on `league_duels` | Mirrors `points_a/points_b` and is exactly scoped, but adds two columns to the hottest table in the mode and needs the caller to know which side it is. The entry-level timestamp answers the same question with one column. |
| A `duel_recaps` table | Correct and over-built. Nothing needs the history of which recaps were seen. |

---

## 3. Why this does not duplicate the card's summary state

They are different jobs and both should exist:

- **The sheet is the moment.** Fires once, then never for that duel.
- **The card is the record.** Still there after dismissal, until the next matchweek locks.

That split is what makes dismissal safe, and it is what §1 requires. If the sheet were the only place
the result lived, dismissing it would destroy information — and then the gate would fail.

---

## 4. What the sheet says

One beat in v1. The second beat — *"and here's who's next"*, with the walk-out — is **v2** (Ryan's
call, 2026-08-31), and the sheet should be built so that beat can be appended rather than bolted on.

**Won**
> Matchweek 2 · you beat Sarah C · **400 – 200** · +500

**Lost**
> Matchweek 2 · Sarah C beat you · **200 – 400** · +0

**Tied**
> Matchweek 2 · level with Sarah C · **300 – 300** · +250 each

**Bye**
> Matchweek 2 · no opponent this week · **+250** — there was no opponent, so there was no defeat.

⚠ The bye copy is the existing sentence from migration 100 and `leagueModeInfo.ts`, verbatim. A fourth
way of saying the same rule is how the surfaces start disagreeing.

⚠ **A bye is detected structurally** (`entry_b IS NULL`), never by the points: `DUEL_BYE` **is**
`DUEL_TIE`, so reading 250 would call it a tie. `lib/league/duelPoints.ts` says this and
`duelPoints.guard.test.ts` holds it.

⚠ **The points figure comes from the duel row**, not from a rate. It is `points_a`/`points_b` as the
engine wrote them, so a future revaluation does not need this file edited.

Not in v1: the fixture-by-fixture breakdown (the team sheet already does it, one tap away), the
leaderboard movement (the arrows already do it), and any share affordance.

---

## 5. When it fires

**Pool-wide** — Ryan's call, 2026-08-31. It mounts in `PoolDetail`, not in `DuelsTab`, so it fires
whichever tab you land on.

The cost is real and accepted: somebody who opened the pool to read Banter gets interrupted. It is
once a week, it is their own result, and one dismissal ends it. The alternative — Duel-tab-only —
means the member most likely to miss it is the one who never opens that tab, which is precisely the
member the recap is for.

Conditions, all required:

1. `pool.league_mode === 'showdown'`
2. The viewer has an entry in the pool
3. That entry's most recent duel by `settled_at` is not null
4. `settled_at > last_recap_seen_at`, or `last_recap_seen_at IS NULL`

⚠ **Condition 4 has a cold-start problem.** A pool created today has `last_recap_seen_at = NULL` for
everybody, so the first settled duel recaps correctly. But a pool with a season of settled duels
behind it would fire a recap for a months-old result the first time anyone opens it. Two ways out —
backfill `last_recap_seen_at = now()` for existing entries in the migration, or add a staleness floor
(`settled_at > now() - interval '14 days'`). **Recommend the backfill**: it is exact, it runs once,
and a floor is a second rule to remember forever. Cheap right now — 0 duels have settled anywhere.

---

## 6. Marking it seen ⚠ the write is where this gets fragile

The how-to-play precedent writes on mount and never checks the result:

```ts
supabase.from('pool_members').update({ has_seen_how_to_play: true }).eq('member_id', memberId).then()
```

⚠ **Do not copy that shape here.** Two differences matter:

- **It writes on OPEN, not on dismiss.** For how-to-play that is right — the modal is the page. For a
  recap, writing on open means a member who closes the tab mid-animation has "seen" a result they
  never read. **Write on dismiss.**
- **It discards the error.** `const { data } = await …` hiding a 400 is a documented failure mode in
  this codebase. If the write fails the sheet reappears next visit — annoying but harmless, and far
  better than silently marking a result seen. **Log the error.**

There is also an RLS question to answer before writing: `pool_entries` is member-readable, but can a
member UPDATE their own entry row? If not, this needs either a policy or a small server route. **This
is the first thing to check when the work starts** — it is exactly the shape of a silent failure.

---

## 7. The work, in order

1. **Check the `pool_entries` UPDATE policy** (§6). It decides whether step 3 is a client write or a
   route.
2. Migration: `ALTER TABLE pool_entries ADD COLUMN last_recap_seen_at timestamptz`, plus the backfill
   in §5. ⚠ Deploy the code that reads it **after** the column exists — migration 026's lesson was 7
   hours of silent 400s from doing it the other way round.
3. Server: the viewer's latest settled duel, on `PoolDetail`'s props. `league_duels` is RLS'd and the
   reveal gate already withholds unopened matchweeks, so a settled duel is by definition readable.
4. `DuelRecapSheet` — presentational, takes the duel and the two names, no data access.
5. Mount in `PoolDetail`, gated on §5's four conditions.
6. Write on dismiss (§6), with the error logged.
7. Guard test: the four outcome strings, and that a bye is branched on `entry_b` rather than on 250.

## 8. Gates (Decision 8)

| Gate | |
|---|---|
| **1. Disclosure** | ✅ *"When your duel is decided we show you the result once, the next time you open the pool."* True, and it makes the feature sound better rather than worse. |
| **2. Affect** | ✅ **Only under §1's rule.** Nothing is withheld to create the moment — the result is already on the card, the table and the leaderboard before the sheet opens. Withholding it would fail this gate outright. |
| **3. Symmetry** | ✅ Everyone gets the same sheet. A loss is stated as plainly as a win, and neither is dressed up. |
| **4. Substitution** | ✅ No obligation created. Dismissing costs nothing and there is no streak, no reward for opening promptly, and no penalty for never seeing it. |
| **5. Variance provenance** | ✅ Nothing random. The sheet reports a result the sport produced; it introduces no uncertainty of our own. |

## 9. Open, for v2

- **The walk-out.** The second beat — *"and here's who's next"*. The sheet's shape should leave room
  for it, because the reveal currently has no moment at all: the next opponent simply appears on the
  card.
- **Push.** A settled duel is a natural notification, and `firePendingMatchdayRecaps` already exists
  as a pattern. Out of scope here, and it would need its own disclosure line.
