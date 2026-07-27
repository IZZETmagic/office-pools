# bracket_picker shadow arm — plan (Option B)

_Scoped 2026-07-27. Not built. Ryan chose **Option B**: build the shadow arm AND flip the
client components to read stored rows, so bracket_picker scoring stops having three
implementations._

**Why this is the last big blocker:** bracket_picker is 99 pools / 999 entries / **20% of all
entries**, and `readSource.ts` hard-forces those pools to `'prod'`. Shadow cannot become the sole
engine — and `prod_scoring_enabled` cannot go false — until this exists.

---

## 1. It is much smaller than "a second engine"

The hard part is already built and shadow already owns it.

| Shadow already has | Rows | Written by |
|---|---:|---|
| `shadow_actual_standings(tournament_id, group_letter, position, team_id)` | 48 | `writeActualSnapshot` (shadowBrackets.ts:346) via `resolveActualBracket` |
| `shadow_actual_qualified(tournament_id, team_id)` | 32 | same |

That is the FIFA-tiebreaker / fair-play logic — the genuinely hard bit — and it comes from the
same TypeScript the client uses, so there is one definition of "what actually happened".

And bracket_picker's inputs are **flat, explicit pick tables**, not a derived bracket:

| Input | Rows | Entries |
|---|---:|---:|
| `bracket_picker_group_rankings(entry_id, team_id, group_letter, predicted_position)` | 44,928 | 936 |
| `bracket_picker_third_place_rankings(entry_id, team_id, group_letter, rank)` | 10,920 | |
| `bracket_picker_knockout_picks(entry_id, match_id, match_number, winner_team_id, predicted_penalty)` | 28,335 | |

**There is no bracket cascade and no podium derivation** — which is exactly why
`resolveEntryPodiumPick` returns empty for this mode. The arm is four joins, structurally a
sibling of `shadow_calculate_bonuses` and simpler than it.

---

## 2. The four rules

Ported from `lib/bracketPickerScoring.ts::calculateBracketPickerPoints`. Point values come from
`pool_settings`, defaulting to the `DEFAULTS` block in that file.

| # | Rule | Join | Points |
|---|---|---|---|
| 1 | **Group order** | `bp_group_rankings` ⋈ `shadow_actual_standings` on `(group_letter, team_id)` where `predicted_position = position` | `bp_group_correct_1st..4th` = 4/3/2/1 |
| 2 | **Third place** | `bp_third_place_rankings` ⋈ `shadow_actual_qualified` | `bp_third_correct_qualifier` 2 / `bp_third_correct_eliminated` 1, plus `bp_third_all_correct_bonus` 10 when every one is right |
| 3 | **Knockout** | `bp_knockout_picks` ⋈ `matches` on `match_id` where `winner_team_id = m.winner_team_id AND m.is_completed` | by stage: 1/2/4/8/10/20 (`bp_r32`…`bp_final_correct`) |
| 4 | **Champion + penalty** | final's winner; `predicted_penalty` vs actual pso | `bp_champion_bonus` 50, `bp_penalty_correct` |

Output shape: the existing 13 `bp_*` `bonus_type` values, written to `shadow_bonus_scores` in the
same shape `shadow_calculate_bonuses` uses, so `readSource` and the totals path need no changes.

---

## 3. ⚠ The dependency that changes the order

**Rule 1 reads `shadow_actual_standings`, which is only refreshed when the materializer runs for
a pool — and the materializer is still triggered by prediction changes.** That is the very defect
P2 exists to fix, and P2's answer is `tournament_inputs_version`.

**But nothing bumps that version yet.** It was decision 2 in the P2 plan and is still open:
a statement-level trigger on `matches` / `match_conduct`, or a bump from the sync-fixtures cron.

Consequences if the arm is built before that bump exists:

- **Today it is fine** — the tournament is over, standings are final and correct.
- **In a live competition it is NOT** — group results would move while
  `shadow_actual_standings` stayed frozen, so bracket_picker group points would silently lag the
  real table. Silent staleness in scoring is precisely the class of bug this whole programme has
  been unpicking.

> **Therefore: build the `tournament_inputs_version` bump FIRST.** It is small, it is already
> designed, and building the arm on top of a stale-standings foundation would ship a known
> defect with a known fix.

---

## 4. Provisional group scoring — mirror it exactly

`sync_settings.bp_provisional_scoring = true`. Per `calculateBracketPickerPoints`:

- Group **order** points score against **current** standings for any group with ≥1 completed
  match, and can move up or down until the group completes.
- Third-place qualifier points and the perfect-group bonus stay **gated on true completion**,
  regardless of the flag.

`shadow_actual_standings` is computed from completed matches, so it already represents *current*
standings — the right input. The gate difference between rules 1 and 2 must be reproduced, not
flattened. Backout is the same as prod's: flip the flag off, run one sweep.

**`bp_penalty_correct` is 0 today** as an interim pending the penalty redesign
(`project_backlog_scoring_penalty_redesign`). Build the branch faithfully; expect it to score
nothing, so a zero is not read as a bug.

---

## 5. Option B — removing the third implementation

Today bracket_picker scoring exists in **two** places, and a shadow arm would make three:

| Consumer | What it does |
|---|---|
| `app/api/pools/[pool_id]/bracket-picks/calculate/route.ts` | server-side, WRITES the `bp_*` rows to `bonus_scores` |
| **`LeaderboardTab.tsx:256`** | **browser**, RECOMPUTES the whole breakdown on read |
| `BracketResultsTab.tsx` | browser, same |

The flip is feasible and the code says so itself — `LeaderboardTab.tsx:267` converts its
computed breakdown "to BonusScoreData[] (**same format the API stores**)". The client is
recomputing data that already exists in the same shape.

**Plan:** have those components consume the stored `bp_*` rows (which already arrive in
`bonusScores`) instead of calling `calculateBracketPickerPoints`.

Two things to check before flipping — both are the reason this is a separate step, not a
drive-by:

1. **Does the stored ledger cover everything the client renders?** The breakdown carries
   `groupDetails` / `thirdPlaceDetails` / `knockoutDetails` — per-pick rows used for display.
   If the stored `bp_*` rows are summary-only, the UI would lose detail. **Verify before
   flipping.**
2. **Does the client currently show points the ledger does not have?** If provisional group
   points appear live in the browser but the stored rows lag a sweep, flipping makes the
   leaderboard *less* live. That would trade a correctness win for a guarantee regression —
   unacceptable per `SPORTPOOL_VISION.md` §3. Measure before/after on a real bracket_picker pool.

---

## 6. Order of work

| # | Step | Why here |
|---|---|---|
| 1 | **`tournament_inputs_version` bump** (statement-level trigger on `matches` / `match_conduct`) | §3 — the arm is built on stale standings without it |
| 2 | **`shadow_calculate_bp_bonuses(p_pool_ids)`** — the four rules, shadow-only, inert | Nothing reads it; verifiable alone |
| 3 | **Parity check vs prod's 48,604 `bp_*` rows** — entry-for-entry, not totals | The lesson from the podium: matching totals hide wrong members |
| 4 | Wire into `shadow_apply_changes` + drop the `bracket_picker` exclusions from `shadow_eligible_entries` / `shadow_pools_needing_materialize` | Only after 3 is clean |
| 5 | **Client flip** (§5), after its two checks | Removes the third implementation |
| 6 | Then, and only then, `readSource` can stop forcing bracket_picker to `'prod'` | The actual unblock |

Steps 1–3 are safe in isolation. Step 4 is the first that changes what shadow claims to cover.

---

## 7. Acceptance

- `shadow_bonus_scores` holds all 13 `bp_*` types, matching prod **entry-for-entry with zero
  point differences** across 999 entries / 48,604 rows.
- `shadow_eligible_entries` count rises from 3,411 to ~4,400 and the P2 selector drains to 0
  again.
- A bracket_picker pool's leaderboard renders identically before and after the client flip.
- `readSource.ts` no longer needs its bracket_picker special case.
