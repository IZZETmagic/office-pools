# Shadow P2 — per-entry input-version watermark (one reconciler, no blind spots)

_Scoped 2026-07-27. Not built. This is the plan for Ryan to approve before any code._

**Provenance:** P2 is not a new idea. It was named in commit `724b4ee` (2026-07-13) when the
`shadow_dirty_pools` patch was reverted:

> The dirty-pool marker forwarded "live re-scored" into shadow (**symptom-automation, not a
> fix**) … Next: **P1** persist the predicted bracket as a first-class input; **P2** per-entry
> **input-version watermark (one reconciler, no blind spots)**.

P1 shipped. P2 did not. On 2026-07-27 a live instance of exactly the blind spot P2 was meant to
close was measured — see §1.

---

## 1. The bug that proves this is needed

The July podium fix landed in TypeScript (`resolveEntryPodiumPick`, mode-dispatched) and
**never reached shadow's data.** In progressive pool `881b3112`, `shadow_resolved_podium` still
recorded **19 of 32 entries as having picked France** as champion — what a *cascaded bracket*
produces — where the members had actually picked Spain in the real final.

Why it never healed: the materialize cron selects pools via
`shadow_pools_needing_materialize(watermark)`, whose only test is
`predictions.updated_at > p_since`. **The last prediction change in the entire database was
2026-07-19.** So the selector has returned **zero pools** for over a week, and would have
continued to forever.

**A correction to derivation logic cannot reach existing data.** That is the defect class, and
it is silent — no error, no alarm, no freshness column to inspect.

Scale of the live instance: shadow's podium rows sit at 520 / 541 / 89 against prod's
842 / 744 / 167 (after one pool was hand-remediated). Roughly 300 pools still stale.

---

## 2. What already exists — P1 is the right pattern, already proven

`shadow_entries_needing_bracket_resolve(p_cap)` selects work by:

```sql
LEFT JOIN shadow_entry_bracket_state st ON st.entry_id = wm.entry_id
CROSS JOIN cur_ver
WHERE st.entry_id IS NULL                                    -- never resolved
   OR st.engine_version < cur_ver.v                          -- ← LOGIC CHANGED
   OR st.predictions_watermark IS DISTINCT FROM wm.pred_wm   -- input changed
```

`shadow_entry_bracket_state` carries `predictions_watermark`, `engine_version`, `resolved_at`.

**That middle clause is the whole idea.** Bump `sync_settings.scoring_engine_version` and every
entry re-derives. It exists, it works, and it is exactly what §1 needed.

**P2 is not a new mechanism. P2 is removing the two limits on this one.**

---

## 3. The two blind spots, measured

| Blind spot | Evidence |
|---|---|
| **Mode.** The selector hard-filters `po.prediction_mode = 'full_tournament'` | `shadow_entry_bracket_state` = **1,514 rows** vs **1,508** submitted full_tournament entries. **1,883 submitted progressive entries have no state row at all.** Progressive is 44.5% of entries — and is where §1's bug landed. |
| **Table.** `shadow_entry_bracket_state` is the only shadow table with freshness columns | `shadow_resolved_podium`, `_standings`, `_qualified`, `_pairs` have **none**. `shadow_entry_bracket` itself has none (its state lives in the sibling table). |

---

## 4. The design

### 4.1 One state row per entry covers everything — the key simplification

Every per-entry derived table shares the **same grain** and is regenerated **together** by
`backfillBonusInputs`:

| Table | Rows | Entries | Rows/entry |
|---|---:|---:|---:|
| `shadow_resolved_standings` | 163,248 | 3,401 | 48 |
| `shadow_resolved_qualified` | 108,832 | 3,401 | 32 |
| `shadow_resolved_pairs` | 108,832 | 3,401 | 32 |
| `shadow_resolved_brackets` | 108,832 | 3,401 | 32 |
| `shadow_entry_bracket` | 48,224 | 1,507 | 32 (ft only) |
| `shadow_resolved_podium` | 3,401 | 3,401 | 1 |

≈ **145 derived rows per entry**, ~493k rows total.

Because they are always written as a set, **one state row per entry is sufficient**. No
per-table state, no fan-out. This is what makes "one reconciler, no blind spots" achievable
rather than aspirational.

**Recommendation: generalise `shadow_entry_bracket_state` rather than add a second table** —
rename it (or add a superseding `shadow_entry_input_state`) and let it govern all per-entry
derived output. Two state tables would recreate the blind-spot problem in a new place.

### 4.2 What the watermark must contain — P1 tracks two of four inputs

A per-entry derived artifact depends on:

| # | Input | Scope | Tracked by P1? |
|---|---|---|---|
| 1 | That entry's predictions (`max(predictions.updated_at)`) | per entry | ✅ |
| 2 | Derivation logic (`scoring_engine_version`) | global | ✅ |
| 3 | **Actual match results** — progressive podium reads picks in the *real* final/3rd-place; bracket resolution uses the actual knockout map | per tournament | ❌ **missing** |
| 4 | **`match_conduct`** — feeds group tiebreaks, so it changes resolved standings ("WITH conduct") | per tournament | ❌ **missing** |

3 and 4 are **tournament-scoped, not entry-scoped**. Storing per-entry copies of them would be
3,401 duplicate values that all move together.

**Recommendation: a single `tournament_inputs_version` integer**, bumped when matches or conduct
change, compared against a per-entry `inputs_version` column. Cheap, and it collapses two
watermarks into one comparison.

So the selector becomes:

```sql
WHERE st.entry_id IS NULL
   OR st.engine_version   < cur.engine_version          -- logic changed
   OR st.inputs_version   < cur.tournament_inputs_version -- results/conduct changed
   OR st.predictions_watermark IS DISTINCT FROM wm.pred_wm -- member edited
```

…with the `prediction_mode = 'full_tournament'` filter **removed**, and `bracket_picker`
excluded explicitly (it has no shadow arm at all — see §7).

### 4.3 Selection grain vs write grain — a real mismatch to decide

- **Selection** is naturally **per entry** (that's where the watermarks live).
- **Writing** is currently **per pool**: `backfillBonusInputs(admin, tournamentId, { poolIds })`
  takes pool ids only.

Two options:

| | Approach | Trade |
|---|---|---|
| **(a) Recommended** | Select dirty entries → derive their distinct pools → re-materialize those whole pools → write state for every entry in them | Reuses proven code unchanged. Slightly wasteful (clean entries in a dirty pool get redone) but they all end up clean, so it converges. |
| (b) | Add entry-scoping to `backfillBonusInputs` | More surgical, but changes a function on the materialize path. Defer. |

**Take (a) for v1.** It touches no existing derivation code, which is the whole point.

### 4.4 Where it runs, and why it does not need to be fast

The derivation is TypeScript (`bracketResolver`, `resolveEntryPodiumPick`), so the reconciler
stays in Node, in the existing `shadow-materialize` route. It is **a background reconciler, not
the live scoring path** — completeness and safety matter, latency does not. Worth stating
explicitly so nobody optimises the wrong axis.

### 4.5 The timeout that killed the last attempt

`statement_timeout` = **2 min** (verified). The reverted dirty-pool drain "shipped a
statement-timeout bug".

Mitigations, all already proven in the existing code:
- **Cap per run** — P1 uses `p_cap = 500` entries; the route uses `CAP = 40` pools.
- **Never advance a watermark on partial success** — the route already does exactly this
  (`if (deferred === 0) await advanceWatermark()`), and the pattern is why a failed run retries
  safely.
- **Chunk the writes** — Phase A hit this before and fixed it with batches of ~26.

Rough sizing: ~493k derived rows total across 3,401 entries. At 500 entries/run that is ~7 runs
of ~72k rows to sweep everything. The cron runs every 15 min, so a full sweep completes in
under two hours unattended. **No big-bang migration needed** — the version bump drains
gradually, which is a feature.

---

## 5. Rollout — inert first, same as 027

1. **Migration A (inert):** add `inputs_version` to the state table; add
   `tournament_inputs_version` to `sync_settings`. Nothing reads them. Verify shape.
2. **Migration B:** new/updated selector function with the mode filter removed and the two new
   clauses added. Still nothing calls it — verify by running it read-only and eyeballing what it
   *would* select (should be ~1,883 progressive entries + anything genuinely stale).
3. **Code:** reconciler wired into the existing `shadow-materialize` route, behind a kill-switch
   setting (mirroring `shadow_materialize_enabled`).
4. **Backfill state rows** for already-correct entries so the first run doesn't select all 3,401
   at once — or deliberately let it, since §4.5 says a full sweep is ~2h unattended. **Decide.**
5. **Prove it:** bump `scoring_engine_version`, confirm the whole estate re-derives, and confirm
   podium counts reach prod's 842 / 744 / 167 **without** running
   `scripts/force-shadow-materialize.ts`. That script becoming unnecessary *is* the acceptance
   test.

---

## 6. Verification

- **Before/after podium counts** — the §1 numbers are the ground truth: 520/541/89 → 842/744/167.
- **Entry-level, not just totals.** The one-pool remediation compared 56 rows entry-for-entry
  with zero point differences. Anything less is not proof — matching totals can hide the right
  count on the wrong members.
- **The parity alarm** (`shadow_detect_diffs`, jobid21) should go and stay clean. It is
  currently green and running every 15 min (re-verified 2026-07-27).
- **A deliberate no-op run** — bump nothing, run the reconciler, confirm it selects zero entries.

---

## 7. Explicitly out of scope

- **`bracket_picker`** — 99 pools / 999 entries / 20% of entries, and it has **no shadow arm at
  all** (`readSource.ts` hard-forces those pools to `'prod'`; `shadow_pools_needing_materialize`
  filters them out). P2 must exclude it explicitly rather than silently. Porting it is a
  separate, larger project and is the remaining blocker on retiring the Node engine.
- **Porting the derivation to SQL.** Migration 027 moved the *actual podium* to SQL. Moving
  `resolveEntryPodiumPick` and the bracket resolver would be much larger, and P2 is valuable
  independently of whether that ever happens.
- **`scripts/force-shadow-materialize.ts` as a mechanism.** It is symptom-automation — the same
  category commit `724b4ee` rejected. Keep it as a scoped one-off remediation tool only.

---

## 8. Decisions needed

1. **One state table or two?** Recommend generalising `shadow_entry_bracket_state` (rename to
   reflect that it now governs all per-entry derived output) rather than adding a sibling. Two
   tables is how blind spots come back.
2. **Who bumps `tournament_inputs_version`?** Cleanest is a trigger on `matches` / `match_conduct`
   — but it must be **statement-level**, or a scoring sweep touching thousands of rows bumps it
   thousands of times. Alternative: the sync-fixtures cron bumps it when it detects changes.
   I lean trigger, for the same "can't be forgotten" reason as the version clause itself.
3. **Initial backfill or cold sweep?** Seeding state rows for known-good entries avoids a
   3,401-entry first run; letting it sweep cold is simpler and takes ~2h unattended. Given
   nothing reads shadow today, I lean **cold sweep** — it also exercises the mechanism honestly.
4. **Does P2 block the read cutover?** My view: **yes.** Cutting over reads while derived data
   can silently miss a logic fix is how the July podium bug reached members. P2 is the
   precondition that makes the cutover safe, not a follow-up to it.
