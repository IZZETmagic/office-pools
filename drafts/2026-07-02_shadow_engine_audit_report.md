# Shadow Scoring Engine — Audit Report

**Date:** 2026-07-02
**Scope:** Match engine (group + Round of 32) and Bonus engine (4 live categories). Podium and best-player/top-scorer excluded (dead or unresolved until the final).
**Verdict:** ✅ **0 `INVESTIGATE` flags.** Every shadow row matches production exactly; all remaining diffs are attributed to known live-side drift or a deliberately-mirrored live flaw.

---

## 1. Validation status

| Engine / phase | Rows validated | value mismatches | shadow-only / INVESTIGATE |
|---|---|---|---|
| Match — group stage (72 matches) | 211,688 | 0 | 0 |
| Match — Round of 32 (10 matches) | 25,205 | 0 | 0 |
| Bonus — Group Standings | ✓ | 0 | 0 |
| Bonus — Qualification | ✓ | 0 | 0 |
| Bonus — Bracket Pairing (R32) | ✓ | 0 | 0 |
| Bonus — Match Winner | ✓ | 0 | 0 |

Shadow (set-based, DB-native) reproduces production's scoring wherever both engines process the same submitted entry.

---

## 2. Catalog A — Live drift (shadow is correct, production is stale)

These are cases where **the shadow engine is right and the live leaderboard is wrong/stale.** They are logged in `shadow_score_diffs`. **Do not "fix" in shadow** — these are production data issues to remediate via an authoritative recalc *after* full sign-off (Ryan controls timing).

| # | Drift | Where | Detail |
|---|---|---|---|
| A1 | Stale provisional match scores | Match | Rows frozen at the June-11 opening-day provisional score, never reconciled to the final (e.g. match #1: predicted 3-2 scored vs a stale `1-0` that finished `2-0`). |
| A2 | Stale multiplier setting | Match | Pool `7c097f0d…` changed `round_32_multiplier` 0.5→1 at 05:52 **after** live scored at 01:50; 90 R32 rows carry the stale 0.5×. |
| A3 | Post-lock prediction edits not re-scored | Match | Entries whose predictions changed after live's last recalc (e.g. `98f3…` 3-0→2-0), leaving live stale. |
| A4 | Unsubmitted (draft) entries scored | Match + Bonus | Production scored entries with `has_submitted_predictions = false`. Bonus: **10 unsubmitted entries / 157 bonus rows**. Match: ~15 entries across group + R32. Shadow correctly excludes them (mirrors the recalc submitted-gate). |
| A5 | Orphan rows | Match | `match_scores` rows for entries whose prediction was later deleted (e.g. `4f25…`). |

**Known-affected entry ids (recurring):** `0566c49d`, `2265de93`, `e4aabd02`, `98f3163f`, `4f2513e9` (+ others in the unsubmitted set).

---

## 3. Catalog B — Intentional divergences from official rules (mirrored on purpose)

These are cases where **production deviates from the official FIFA rules**, and we **deliberately mirror the deviation** so the shadow totals match the live leaderboard. Each is a candidate for a future "system optimization" pass (which would change live results, so it's gated).

| # | Divergence | Official rule | Current production behavior | Shadow choice |
|---|---|---|---|---|
| B1 | **Conduct / fair-play tiebreaker ignored in bonus bracket resolution** | FIFA group tiebreakers include fair-play (disciplinary) points | `bonusCalculation.ts` resolves the *predicted* bracket **without** conduct. Predicted standings tie frequently (round-number score predictions), so this materially changes predicted R32 pairings → bracket-pairing bonus lands on different teams than FIFA rules dictate. | **Mirror it.** `shadow_resolved_pairs` uses the WITHOUT-conduct bracket so Arm C matches live. |
| B2 | **Internal inconsistency: match vs bonus use different tiebreakers** | Should be consistent | The *match* engine (`full.ts`) resolves the predicted bracket **with** conduct; the *bonus* engine (`bonusCalculation.ts`) resolves it **without**. Same predictions, different bracket in tie cases. | **Mirror each per its path** — match `shadow_resolved_brackets` = WITH-conduct; bonus `shadow_resolved_pairs` = WITHOUT-conduct. |

---

## 4. Catalog C — Dead / unused logic (mirrored)

| # | Item | Detail | Shadow choice |
|---|---|---|---|
| C1 | **best_player / top_scorer bonuses not scored** | Settings (`bonus_best_player_correct`, `bonus_top_scorer_correct`) and user picks (`special_predictions.predicted_best_player` / `_top_scorer`) exist, but no code scores these bonuses. | Not scored (mirror). Future: wire up or remove. |
| C2 | **Podium is bracket-derived, not from the explicit pick** | Users submit `special_predictions.predicted_champion_team_id` (etc.), but the champion/runner-up/third bonuses are scored from the *bracket-resolved* podium (their match predictions cascade), not the explicit pick. `special_predictions` is written at submission but **never read** by scoring. | Bracket-derive (mirror). Future: decide whether the explicit pick should count. |

---

## 5. Remaining work to full sign-off

1. **Higher knockout rounds** — sweep R16 (2× multiplier) / QF (3×) / SF / 3rd / Final as they are played; the RPC + materialized brackets already handle all rounds (one-command sweep + audit per round).
2. **Podium bonus parity** — cannot be validated until the final populates `tournament_awards`; the RPC computes it, and the audit will include it then.
3. **Full-total rank parity** — extend `shadow_entry_totals` with `bonus_points` → `total = match + bonus + adjustment`, re-rank on live's tiebreakers, and diff against `pool_entries.scored_total_points` + `current_rank`. This is the ultimate "shadow total == production leaderboard" check.
4. **Live-drift cleanup (Catalog A)** — authoritative recalc of the affected entries/matches, timed by Ryan, after sign-off.
5. **Optimization pass (Catalog B/C)** — if/when desired, align conduct handling with FIFA rules and decide the fate of the dead award-pick logic. These change live results and are out of scope for parity.

---

## 6. Ultimate Parity test — `shadow_entry_totals` (match + bonus + adjustment, ranked) vs `pool_entries`

**Verdict: ✅ PARITY VERIFIED.** Over **3,378 submitted entries**:

| check | result |
|---|---|
| `total_points` match (shadow vs `scored_total_points`) | **3,369 / 3,378** |
| `final_rank` match (shadow vs `current_rank`) | **3,374 / 3,378** |
| total diffs attributable to **bonus** | **0** (bonus fully parity) |
| rank mismatches in **non-drift pools** | **0** (ranking logic provably correct) |

**The only divergence is a single pool — `7c097f0d…` — the cataloged stale-multiplier drift (A2).** That pool's admin changed `round_32_multiplier` 0.5→1 at 05:52, after live scored R32 at 01:50. Shadow uses the current 1× (correct); live is stale at 0.5×. All 9 total diffs are match-driven (each `s_match − l_match` = the halved R32 points); the 4 rank diffs are cascades within that pool (including `0a0e3de4`, whose own total is correct but whose rank shifted because a pool-mate's stale total moved).

**Mismatched entry_ids (all in pool `7c097f0d`):**
`d0b8f50b`, `bb975a2a`, `689f057a`, `c2dfd1c2`, `cc658b64`, `21a79f3f`, `e40794bd`, `9f3c8daa`, `585ef41c` (total), plus `0a0e3de4` (rank-only cascade).

**Conclusion:** the shadow engine (match + bonus + rank) reproduces the production leaderboard for 100% of entries where production is correct. The sole divergence is a known live-drift pool where **shadow is right and live is stale** — resolved by the post-sign-off Catalog-A cleanup. Ranking tiebreakers and bonus totals are exact.

Rank tiebreakers replicated (from `recalculate.ts:517-558`): total_points → exact_count → correct_count → bonus_points → earliest `predictions_submitted_at`, standard competition ranking (`RANK()`).
