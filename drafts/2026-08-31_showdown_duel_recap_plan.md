# Showdown duel recap — implementation plan

**Date:** 2026-08-31 · **Status:** 🟠 **REWRITTEN AFTER A DESIGN CHANGE.** v1 (one fat sheet) is
built, applied and committed; this splits it. Migration **122 is applied** and stays as-is.
**Decision:** Ryan, 2026-08-31 — a **thin popup** with two buttons, and the detail on **its own page**
styled like the *06 Decision* card from the Fight Night mockups. Pool-wide. Walk-out stays **v2**.

```
duel settles ──▶ popup: "You beat Sarah C"  ┬── Review summary ──▶ /pools/[id]/duel/[matchweek]
                                            └── Skip ───────────▶ the sealed card + countdown
```

---

## 0. What is already built and applied

| | |
|---|---|
| Migration **122** | ✅ applied. `pool_entries.last_recap_seen_at timestamptz` + backfill. **No change needed** — the marker works the same for a two-step flow. |
| The seen/dismiss plumbing | ✅ `PoolDetail` computes the owed recap server-side, mounts the sheet, writes on dismiss with the error logged. Survives this rewrite. |
| `DuelRecapSheet` | 🟠 built as the FAT version — scoreline, corners, verdict, points. **Gets narrowed** to §2. |
| RLS for the write | ✅ verified end to end. `relacl` is `authenticated=arwdDxtm` (table-wide) and *"Users can update own entries"* permits it. A real dismissal wrote through and was then cleared. |
| Skip's destination | ✅ already exists — the sealed card with the 24h-floor countdown (migrations 119/120). Skip is *just* dismiss. |
| Nested routes under a pool | `app/pools/[pool_id]/upgrade/page.tsx` is the only one, so the pattern exists but is barely used. |
| `next/og` | ❌ not used anywhere yet. First use would be here (§6). |
| `headToHead` | ✅ fixed 2026-08-31 (`e0e96b8`) — it compared against `3`/`1` and would have called every meeting a loss. It is the mockup's *Record v* line. |

---

## 1. What changed, and why the split is better

v1 put the whole story in the modal. That fails two ways: a modal is the wrong place to read
anything, and there was nowhere to *send* somebody afterwards.

Splitting it gives each half one job:

- **The popup is the news.** Who won. Two buttons. Nothing to read.
- **The page is the story.** The decisive fixture, what it moved, the record, the share.

It also makes the share affordance possible at all — you cannot share a modal, and a real route gets
an `/opengraph-image` for free (§6).

---

## 2. The popup

Thin. `Modal` is already `items-end sm:items-center`, so it is a bottom sheet on a phone.

> **Matchweek 2**
> *(both faces, small)*
> **You beat Sarah C** · **+500**
>
> `[ Review summary ]`  `[ Skip ]`

⚠ **Skip must be as easy as Review.** Not a greyed-out link under a bright button. A member who never
wants the ceremony should be able to say so in one tap forever, and the fastest way to teach people
to resent a feature is to make the exit harder than the entrance.

⚠ **Both buttons dismiss.** Review navigates *and* stamps `last_recap_seen_at`; it must not come back
because you read it. Skip stamps and closes.

Everything else from v1's sheet — the big scoreline, the dimmed loser corner — moves to the page.

---

## 3. The page — `/pools/[pool_id]/duel/[matchweek]`

A route, not an overlay, for three reasons: the back button works, the URL is shareable, and
`next/og` can render a preview image from it later.

Reachable any time, not just from the popup. The recap is a *record*, and a page you can only see
once is a page nobody links to.

### The card, top to bottom (Fight Night *06 Decision*)

| | |
|---|---|
| Eyebrow | `YOU BEAT PRIYA RAMAN` |
| **Verdict** | **`SPLIT DECISION`** — see §4 |
| Scoreline | `7 – 6`, each side in their own colour — see §5 |
| The story | *"It came down to **Liverpool v Man Utd**. You had the home win, Priya had the draw."* |
| History | *"First time you have ever beaten Priya."* — from `headToHead` |
| Banter | a pulled quote — ⚠ see §6 |
| **What it moved** | position `2nd → 1st`, duel points, `Record v Priya`, next matchweek `SEALED` |
| Share | `Share the decision` — §6 |

### ⚠ The card must be worth opening when you LOST

The mockup is the winner's view. If only wins get a good card, half the pool learns that Skip is the
right button — and that is the symmetry gate failing quietly rather than loudly.

A loss gets the same structure and the same care: *"Narrow decision — one fixture in it"*, the same
decisive-fixture line, the same record. What it does **not** get is consolation. Stating a defeat
plainly is respect; dressing it up is the thing that produces bad feeling.

### ⚠ "What it moved" must be willing to say nothing moved

If you won and stayed 4th, it says so. A block that only ever reports good news is not a record, it
is a slot machine. This is the *"no bad feelings"* line in the vision doc.

---

## 4. The verdict term

Boxing's own vocabulary, derived from the margin. Nothing invented, nothing random:

| Margin | Term |
|---|---|
| opponent scored nothing | `SHUTOUT` |
| very wide | `UNANIMOUS DECISION` |
| clear | `DECISION` |
| one fixture in it | `SPLIT DECISION` |
| level | `DRAW` |
| no opponent | `BYE` |

⚠ **The thresholds must be expressed in FIXTURES, not points.** "One fixture in it" is a sentence a
member can check; "within 100 points" is one they cannot, and it means something different at
Results depth and at Scores depth. The bands come out of the same place §5's scoreline does.

⚠ **Gate 5 holds trivially** — every band is a function of two real scores. But it is worth writing
down that no term may ever be chosen for drama over accuracy. A `SPLIT DECISION` label on a 5-fixture
gap would be the first lie the product tells.

---

## 5. ⚠ The scoreline is not on the mockup's scale

The mockup shows `7 – 6`, which reads as correct picks out of ten. **The duel is judged on weekly
points**, so at Results depth that same duel is `700 – 600`. `SPLIT DECISION` over `7 – 6` lands;
over `700 – 600` it is mush.

**Recommend: correct picks as the big number, points as the sub-line.** Fixtures are what a member
actually experienced; the points are the audit trail.

⚠ **But Exact Scores depth does not divide into a pick count.** There, a fixture pays 100 / 75 / 50 /
0, so "6 correct" is not a thing. Options, needing a call:

1. Big number = fixtures the member *beat their opponent on* (works at both depths, is a real
   head-to-head count, and is what the verdict bands in §4 want anyway). **Recommended.**
2. Big number = points at Scores depth and fixtures at Results depth. Honest, but the card means two
   different things in two pools.
3. Points everywhere. Consistent and dull.

⚠ **Also: `Duel points 9 → 12` in the mockup is the pre-121 world.** Under 500/250/0 that row reads
`9,000 → 9,500`. Not wrong, much less punchy. Suggest the card shows the **delta** (`+500`) and the
running total goes in the smaller "what it moved" block.

---

## 6. Sharing, and the thing it drags in ⚠

`Share the decision` is the one item here with a decision that is not ours to make lightly.

**The banter pull-quote sends another member's words out of the pool.** Quoting Priya's trash talk
back at her *inside* the pool she posted it in is the joke working. Putting it on a card that leaves
the pool is republishing her, somewhere she did not post. She cannot consent to that at the moment it
happens and she is not the one pressing the button.

**Recommend: the quote renders in-app and is omitted from anything shared.** One rule, no per-message
consent flow, and the shared card is still good without it.

Mechanism, when it is built: a real route means `app/pools/[pool_id]/duel/[matchweek]/opengraph-image.tsx`
via `next/og`, which is not used anywhere in the app yet — this would be the first. That fits the
Showdown animations backlog, which already names `next/og` for share previews. **Out of scope for
v1**; the button can be deferred without changing anything above it.

---

## 7. The work, in order

1. **Narrow `DuelRecapSheet` to §2** — verdict, points, two buttons. Delete the rest; the page takes it.
2. **The route** `app/pools/[pool_id]/duel/[matchweek]/page.tsx`, server-rendered, reachable directly.
   ⚠ It must check membership and the reveal gate itself — a URL is guessable, and
   `/duel/38` must not leak a sealed pairing.
3. **The verdict + scoreline** (§4, §5) in `lib/league/duelVerdict.ts`, pure and unit-tested. This is
   the piece worth testing hardest: it is a function of two numbers and it is the card's headline.
4. **The decisive fixture** — the fixture where the picks diverged that, flipped, changes the result.
   ⚠ Reveal-gated: it needs the opponent's picks, which come only from `/api/pools/[id]/bulk`.
5. **What it moved** — reuse the `movement` reduction from `DuelsTab`; it already rebuilds the table
   one settled matchweek short. Extract rather than copy.
6. **The loss and bye variants** (§3), with the same care as the win.
7. Share button — deferred, §6.

## 8. Gates (Decision 8)

| Gate | |
|---|---|
| **1. Disclosure** | ✅ *"When your duel is decided we tell you once, and you can read the detail or skip it."* Says what it does; sounds better said aloud than hidden. |
| **2. Affect** | ✅ **Only while the result is already visible behind the popup.** Unchanged from v1 and still the load-bearing rule: the card, the table and the leaderboard are correct before the popup opens. |
| **3. Symmetry** | ⚠ **The gate this design can fail.** A winner's card that is better made than a loser's teaches half the pool to Skip. §3 is the mitigation and it is not optional. |
| **4. Substitution** | ✅ Skip is as prominent as Review. No streak, no reward for opening promptly, no penalty for never opening. |
| **5. Variance provenance** | ✅ Verdict, scoreline and decisive fixture are all functions of real results. §4 records that a term may never be picked for drama. |

## 9. v2

- **The walk-out.** Skip already lands on the sealed card + countdown, which is where the reveal
  belongs. The ceremony hangs off that, not off this.
- **Push.** A settled duel is a natural notification; `firePendingMatchdayRecaps` is the pattern.
- **The share image** (§6).
