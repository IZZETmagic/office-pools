# Defects found during the read-path / payload work

_2026-07-28. Everything wrong that surfaced during this session, including my own mistakes.
Fixed items say what fixed them; open items are open. Nothing here is speculative — each
was verified against production data or the running code._

---

## A. Shipped fixes

| # | Defect | Impact | Fixed by |
|---|---|---|---|
| A1 | **6 web surfaces bypassed `readSource`** — My Pools, Dashboard, Profile, activity API, admin pool route, admin user route — reading prod's `pool_entries` / `match_scores` directly | A member in a cut-over pool saw shadow's score on the leaderboard and prod's everywhere else. They agreed only by luck; nothing would have flagged a divergence | `b80395e` |
| A2 | **Profile's `match_scores` read was unpaginated** (`.in()` with no `.range()`) | Latent silent truncation at PostgREST's 1,000-row cap. **Not live** — worst real user has 520 rows — but crosses the cap as soon as a second competition lands (a PL season is 380 matches) | `b80395e` |
| A3 | **Profile picked its "best" entry by `total_points`** — dead-legacy, always 0 | The reduce always returned `entries[0]`, and disagreed with the `scored_total_points` pick used two hundred lines later for `playerScoresMap`. Multi-entry members saw one entry's identity with another's numbers | `b80395e` |
| A4 | **RN home screen selected 4 columns that exist on NEITHER `match_scores` nor `shadow_match_scores`** — `is_exact_score`, `is_correct_difference`, `is_correct_result`, `points_earned` | Both queries 400'd on **every call** since the screen shipped. Both sites destructured only `{ data }`, so the error was discarded and the empty default rendered. **Form dots blank, accuracy 0, best streak 0 — for everyone, always.** The boolean triple was only ever a re-derivation of `score_type`, which does exist | `6dec866` |
| A5 | **Both RN home-screen reads were unbounded `.in()`** — and the accuracy aggregate claims to cover *every* scored match | Same latent truncation as A2, on a stat that advertises completeness | `6dec866` |
| A6 | **Pool refresh re-sent the entire payload every 30s** | 12,683 kB per refresh per open tab, of which ~98.6% provably cannot change (predictions locked at kickoff by trigger; completed-match scores final) | `05a7bab` |
| A7 | **`applyLive` read `matches` from the render closure** | Put it in the dependency array, so the 30s interval was torn down and re-armed on *every score change* | `10a9c68` |
| A8 | **Merge helpers always returned a new array** | An idle 30s tick with nothing changed still re-rendered every tab | `10a9c68` |
| A9 | **`vitest.config.ts` scanned only `lib/**`** | A test placed next to its component silently never ran — reported "No test files found" rather than failing | `10a9c68` |

## B. Caught before shipping

| # | Defect | Would have caused |
|---|---|---|
| B1 | **`requireSuperAdmin()` returns the USER-scoped client, not the service role.** My first draft used it to read shadow | Shadow tables are RLS deny-all → read returns nothing → `readEntryScoring` zero-fills → **every score in the super-admin view blanked**, i.e. the one place a discrepancy gets diagnosed |
| B2 | **Routing surfaces through `readMatchScores` "for correctness"** would have shipped 22 columns where Profile needs 4 and the activity feed needs 9 | Fixed the source while making egress *worse* — the opposite of the goal |

## C. Open — documented, not fixed

| # | Defect | Detail |
|---|---|---|
| **C1** | **Shadow drops manual `point_adjustment` on UNSCORED entries** | Entry `53a55116` (`CEM`, *PES PREDICTS 2026 WORLD CUP WINNER*): 223 pts of `point_adjustment`, reason *"Based on submissions"*, with zero predictions and zero match/bonus rows. Shadow writes `shadow_entry_totals` only for entries it **scores**, so no row exists and the read path zero-fills — the award vanishes. **Scope: 164 adjusted entries platform-wide, 32 in shadow pools, 31 have rows and all 31 are correct. CEM is the only casualty; 0 more at risk on a wider cutover.** Durable fix = materialise a row for any entry with a non-zero adjustment, scored or not. Ryan's call 2026-07-28: leave it |
| C2 | **`advance-teams` still reads `match_conduct` unfiltered** | Pre-existing, untouched here. 13 of 14 sites were scoped via `lib/matchConduct.ts`; this one remains and becomes a silent 1,000-row truncation once a second competition lands |
| C3 | **`getPoolData`'s `safeRead` returns partial data on a transient fetch failure** | Observed twice while measuring: one run lost `matchScores` entirely, another truncated predictions at 11,000 of 13,385. It *is* logged, and the **cached** path passes `throwOnFetchError=true` so a partial result is never cached — but the uncached path silently degrades. By design, worth knowing |
| C4 | **The initial pool-detail load still pulls everything** | The 12.7 MB is now sent **once per page load** instead of every 30 seconds. The load itself is unchanged. See §E |

## D. My own errors

Recorded because they cost time and could recur.

| # | Error | Correction |
|---|---|---|
| D1 | **Misdiagnosed C1 as the empty-bracket bonus inflation** and stated shadow was "RIGHT to show 0" | Wrong on both counts. It is a manual admin award and shadow is **wrong** to drop it. I inferred from the shape (points + no predictions) without reading `adjustment_reason`, which says so plainly. The wrong claim is baked into pushed commit `2aa7971`'s message and cannot be rewritten — corrected in this doc, the audit doc, memory, and `scripts/verify-read-paths.ts` |
| D2 | **Said Profile's unpaginated read "was silently truncating"** | Overstated. Worst real user has 520 rows; **no user currently exceeds 1,000**. My 1,042-row figure came from a test set that deliberately unioned 60 sampled entries, not from anyone's account. Latent, not live |
| D3 | **Quoted 3,854 kB as the pool payload** (as did the prior audit and the caching memory) | That is the **on-disk** size. The wire size is **12,683 kB** — 3.3× larger, because `match_scores` is 22 columns wide. `pg_column_size` understates JSON badly. Always measure `JSON.stringify` |
| D4 | **`git add -A` bundled 32 unrelated pre-existing files** into my commits | Flagged before pushing; Ryan chose to push all 51. Should have been caught on the first commit, not the fifth |
| D5 | **Accepted the backlog item's framing at first** — "kill the 30s poll / ship derived consensus" | Killing the poll would have broken the live-standings guarantee, and "derived consensus" would have deleted *see everyone's picks after lock*. Both premises were wrong; the real defect was payload shape |

## E. What the audit itself got wrong

The 2026-07-26 audit named `predictions` as the egress offender. Measured on the wire:

| | Rows | JSON |
|---|---|---|
| `matchScores` | 13,385 | **8,477 kB** |
| `allPredictions` | 13,385 | 3,815 kB |

**`matchScores` is more than twice the predictions and was never flagged at all.**
