# Pool detail: the 30s refresh and the 3.8 MB payload

_2026-07-28. **Built and measured** — see §7 for the result._

The backlog item reads "kill the 30s poll / ship derived consensus (~100 rows instead of
~13,000)". Both halves of that turn out to be wrong, in ways that matter. This is what I
found and what I propose instead.

---

## 1. Two corrections to the premise

### The poll is not the problem, and killing it would break a product guarantee

There is already realtime. `PoolDetail.tsx:620–658` subscribes to a channel and calls
`router.refresh()` on a score change, debounced 2s with 0–8s jitter to avoid a
thundering herd. The 30s `setInterval` at line 666 is a **fallback for when realtime
misses an event**, and it is already scoped to four tabs.

`SPORTPOOL_VISION.md` §3 makes live standings a product guarantee — *"the swing is the
banter"*. Removing the refresh would trade a cost problem for a broken promise. The
fallback should stay.

**The problem is not how often we refresh. It is what a refresh costs.**

### "Derived consensus" doesn't fit — `allPredictions` backs a shipped feature

`allPredictions` has ~14 consumers across the results, analytics, bracket and standings
tabs, including *"see everyone's picks after lock"* (shipped 2026-07-14). Collapsing it
to ~100 consensus rows would delete that feature. Consensus percentages are a *derived
view* of the same data, not a replacement for it.

---

## 2. What a refresh actually costs

Largest pool (`b7ddbf9d`, 192 entries, 104 matches):

| Payload part | Rows | On disk | **As JSON on the wire** |
|---|---|---|---|
| `matchScores` | 13,385 | 2,452 kB | **8,477 kB** |
| `allPredictions` | 13,385 | 1,364 kB | **3,815 kB** |
| `members` | 192 | — | 218 kB |
| `matches` | 104 | — | 121 kB |
| **total** | | 3.8 MB | **12,683 kB** |

Two things to correct from the earlier estimate. The 3.8 MB figure everyone (me included)
has been quoting is the **on-disk** size; serialised to JSON the same data is **12.7 MB**,
3.3× larger, because `match_scores` is 22 columns wide.

And the audit named predictions as the offender. **`matchScores` is 8.5 MB of the 12.7 —
more than twice the predictions — and was never flagged at all.**

`PoolDetail` is a client component, so all of this is serialised into the RSC flight
response as props. `router.refresh()` re-sends **the entire payload**, every time —
whether triggered by realtime or by the 30s fallback.

### How much of it can actually change?

- **Predictions: none.** `trg_enforce_prediction_before_kickoff` is enabled on the table
  (verified). Once a match kicks off its predictions are immutable at the database level.
- **Match scores: one match's worth.** During a live match that is 192 rows out of
  13,385.

> **~98.6% of a 3.8 MB payload cannot change, and we re-send 100% of it every 30 seconds.**

### Why caching cannot fix this

Worth stating plainly, because it answers the open question from earlier: *"can we ship
realtime for the leaderboard? But wait we are going to use caching."*

`getPoolData` is already cached (`unstable_cache`, per-pool tag, `pool_cache_enabled` is
on). The cache saves the **database** read. It does nothing for the **client** leg — the
3.8 MB is still serialised and shipped to every open tab on every refresh. And at 3.8 MB
the object is over Vercel's Runtime Cache 2 MB per-item limit anyway.

Caching fixes cost on the read side. This is a *payload shape* problem, and only
splitting the payload fixes it.

---

## 3. Proposal: split the payload by mutability

Not a new idea here — it is the version-keyed immutable precompute from the architecture
plan, applied to the one screen where it pays best.

**Immutable core** — predictions, plus scores for completed matches. Fetched once per
page load, keyed by a version that only changes when a match completes. Never re-sent by
a refresh.

**Live delta** — leaderboard totals and ranks, plus scores for in-play matches. Small,
and the only thing a refresh moves.

New endpoint `GET /api/pools/[pool_id]/live` returning roughly:

```
entries:   entry_id, match_points, bonus_points, scored_total_points, current_rank, previous_rank
scores:    match_scores rows for non-completed matches only
matches:   match_id, status, home_score, away_score for in-play matches
```

For a 192-entry pool that measured **33 kB** against 12,683 kB — **388×** (see §7). It reads through
`readSource`, so it follows the shadow cutover like everything else now does.

Client change: realtime events and the 30s fallback stop calling `router.refresh()` and
instead fetch `/live` and merge into existing state. `router.refresh()` is kept for
*structural* changes only — a member joining, settings changing — where the immutable
core genuinely has to be rebuilt.

### What this does not change

Refresh cadence, the realtime channel, the debounce and jitter, and every consumer of
`allPredictions`. The live-leaderboard guarantee is preserved — arguably improved, since
a 15 kB update can be applied faster than a 3.8 MB one.

---

## 4. Risk

The real risk is **state merging**. Today a refresh replaces everything atomically, so
the screen is always internally consistent. Merging a delta into held state can produce
a leaderboard that disagrees with the results tab if the merge is wrong.

Mitigations: version-stamp the delta and discard out-of-order responses; keep the merge
in one place rather than per-tab; and keep `router.refresh()` as the recovery path if a
version gap is detected.

Second risk: the consumers. Step 1 below was the gate on this plan, and it has now been
done — see §4a.

---

## 4a. Step 1 result — the split is clean

**`matchScores` (2.45 MB) has exactly four consumers**: the leaderboard, analytics,
results and community tabs. All four need the full set, not a subset — but rows for
*completed* matches never change, so the full set can be assembled client-side from one
immutable fetch plus a small live delta. Rows are keyed by `(entry_id, match_id)` and a
match completes exactly once, so the merge is an upsert with no ordering hazard.

**`allPredictions` (1.36 MB) is already gated server-side** and this is the part that
makes the whole plan work. `page.tsx:178–195` runs `computeReveal` per request and ships
only *own* predictions plus *revealed* ones — admins excepted. Revealed means locked,
and locked means immutable by database trigger.

> So what actually reaches a member's browser is immutable **except for their own
> entry's picks** — 1 entry out of 192 in the largest pool. And those are already held
> in separate client state (`userPredictions` / `liveEntryPredictions`), not read back
> out of `allPredictions`.

I had expected to find unlocked picks being shipped and filtered in the browser. They
are not; the gate is server-side and airtight. That removes the mutability I was most
worried about.

**Conclusion: the split is clean and step 1 does not block.**

---

## 5. Proposed order

1. ~~Audit the consumers~~ — **done, see §4a. The split is clean.**
2. Build `/api/pools/[pool_id]/live` and verify its numbers equal the full payload's.
3. Switch the realtime handler to fetch `/live` and merge; keep the 30s fallback pointing
   at the same fetch.
4. Reserve `router.refresh()` for structural changes.
5. Measure: refresh payload before/after on the largest pool.

Step 1 is done and came back clean, so 2–5 are unblocked.

---

## 7. Result — measured on the largest pool

| | Payload a refresh sends |
|---|---|
| Before | **12,683 kB** |
| After | **33 kB** |
| | **388×** |

During an actual live match the delta grows by one match's score rows — 192 for this
pool, ≈121 kB — so a matchday refresh lands around **154 kB**, still ~80× better. Between
matchdays there are no live matches, so the endpoint runs no score query at all and the
response is just leaderboard totals.

Built:

- `GET /api/pools/[pool_id]/live` — membership-gated, reads through `readSource`, and
  filters scores to **live** matches only. That last choice matters for scale: score rows
  exist only for completed or live matches (`lib/scoring/core.ts:222`), so "live" is both
  the exact set that can have changed and one bounded by how many matches kick off at
  once — not by fixture-list size. A "not completed" filter would have passed 380 match
  ids into a PostgREST `.in()` for a Premier League season and built a URL long enough to
  be refused.
- `readMatchScores` gained a `matchIds` filter so the endpoint reuses the same reader as
  the full payload, rather than duplicating the shadow/prod column handling.
- `PoolDetail` merges the delta: `matchScores` became state, and `applyLive()` upserts
  scores by `(entry_id, match_id)`, updates entry totals and ranks, and applies match
  status transitions. Realtime and the 30s fallback both call it.

Safety rails, since the risk here was always merge correctness:

- **Sequence guard** — a slow response that lands after a newer one is discarded.
- **Completed-match count** — if it disagrees with what the client holds, a match
  finished and its scores moved into the immutable half, which a delta cannot
  reconstruct. The client falls back to `router.refresh()`.
- **Fetch failure falls back to `router.refresh()`** rather than leaving stale numbers.
  Live standings are a product guarantee, so degrading to the expensive path beats
  degrading to a wrong one.
- `router.refresh()` is retained for structural changes (member joins, settings edits).

---

## 8. Decisions I need from Ryan

1. **Scope.** Do the full split (steps 1–5), or the cheap 80% first — leave the refresh
   mechanism alone and only stop sending `matchScores` for completed matches, which is
   the 2.4 MB half and needs no client state merging?
2. **Is any of this pre-Premier-League critical?** The tournament is complete (104/104
   matches), so right now nothing changes and no refresh does any harm. This is entirely
   about the August competition.
