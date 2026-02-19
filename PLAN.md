# FIFA Annex C Third-Place Team Distribution - Implementation Plan

## Problem Summary

The current system uses a **backtracking algorithm with eligible-group constraints** (lines 424-494 of `lib/tournament.ts`) to assign 8 third-place teams to R32 matches. This is an approximation — it picks the highest-ranked third-place team from a list of eligible groups per slot. However, FIFA's official Annex C defines **exactly 495 deterministic mappings** based on which 8 groups (out of 12) supply the qualifying third-place teams. The current approach can produce incorrect matchups.

## What Changes

### Current Flow
1. Rank all 12 third-place teams → take top 8
2. For each R32 third-place slot, use `eligible_groups` constraints + backtracking to assign teams

### New Flow (Annex C)
1. Rank all 12 third-place teams → take top 8
2. Identify which 8 groups those teams came from (e.g., `['A','C','D','E','F','G','H','J']`)
3. Sort the 8 groups alphabetically → look up the exact Annex C option (1 of 495)
4. Apply the deterministic mapping: each column (1A, 1B, 1D, 1E, 1G, 1I, 1K, 1L) tells you which third-place team plays which group winner

---

## Implementation Steps

### Step 1: Create the Annex C Lookup Data (`lib/annexC.ts`)

Create a new file `lib/annexC.ts` containing:

1. **Type definitions:**
   ```ts
   type AnnexCAssignment = {
     '1A': string  // group letter of the third-place team
     '1B': string
     '1D': string
     '1E': string
     '1G': string
     '1I': string
     '1K': string
     '1L': string
   }
   ```

2. **All 495 options** parsed from the user-provided table, stored as a `Map<string, AnnexCAssignment>` keyed by the sorted qualifying groups (e.g., `"A,B,C,D,E,F,G,H"` → assignment).

3. **Lookup function:**
   ```ts
   export function lookupAnnexC(qualifyingGroups: string[]): AnnexCAssignment | null
   ```
   - Input: array of 8 group letters
   - Sorts alphabetically, joins as key → O(1) Map lookup
   - Returns the assignment or null

4. **Column-to-match mapping** (maps Annex C columns to actual match numbers in the DB):
   ```ts
   export const ANNEX_C_COLUMN_TO_MATCH: Record<string, number> = {
     '1A': 79,   // M79: Winner Group A vs 3?
     '1B': 85,   // M85: Winner Group B vs 3?
     '1D': 82,   // M82: Winner Group D vs 3?
     '1E': 75,   // M75: Winner Group E vs 3?
     '1G': 81,   // M81: Winner Group G vs 3?
     '1I': 78,   // M78: Winner Group I vs 3?
     '1K': 88,   // M88: Winner Group K vs 3?
     '1L': 80,   // M80: Winner Group L vs 3?
   }
   ```

   **How these were derived** — cross-referencing the Annex C columns with the existing R32_MATCHUPS:
   | Annex C Column | Group Winner | Current Match # | Current Code |
   |---|---|---|---|
   | 1A | Winner Group A | 79 | `R32_MATCHUPS[79].home = group_winner A` ✓ |
   | 1B | Winner Group B | 85 | `R32_MATCHUPS[85].home = group_winner B` ✓ |
   | 1D | Winner Group D | 82 | `R32_MATCHUPS[82].home = group_winner D` ✓ |
   | 1E | Winner Group E | 75 | `R32_MATCHUPS[75].home = group_winner E` ✓ |
   | 1G | Winner Group G | 81 | `R32_MATCHUPS[81].home = group_winner G` ✓ |
   | 1I | Winner Group I | 78 | `R32_MATCHUPS[78].home = group_winner I` ✓ |
   | 1K | Winner Group K | 88 | `R32_MATCHUPS[88].home = group_winner K` ✓ |
   | 1L | Winner Group L | 80 | `R32_MATCHUPS[80].home = group_winner L` ✓ |

### Step 2: Modify `resolveAllR32Matches()` in `lib/tournament.ts`

Replace the backtracking algorithm with Annex C lookup:

1. Resolve all non-third-place slots first (group winners & runners-up — deterministic, unchanged)
2. Get the best 8 third-place teams
3. Extract their group letters → look up Annex C
4. If found: apply the deterministic assignment from Annex C
5. If not found (incomplete data during prediction entry): fall back to existing backtracking

Also add a new export `getAnnexCInfo()` that returns which option was used (for display).

### Step 3: Keep `R32_MATCHUPS` and `eligible_groups` as Fallback

The `eligible_groups` on `best_third` slots serve as fallback when Annex C can't be applied (e.g., user hasn't predicted all groups yet, so we don't have 8 third-place teams). No changes to the data structure.

### Step 4: Optional UI Enhancement in ThirdPlaceTable

Show a small informational badge/note indicating which Annex C option applies based on the current qualifying groups.

---

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `lib/annexC.ts` | **NEW** | 495-option Annex C lookup table, lookup function, column-to-match mapping |
| `lib/tournament.ts` | **MODIFY** | Update `resolveAllR32Matches()` to use Annex C, add `getAnnexCInfo()` export |
| `components/predictions/ThirdPlaceTable.tsx` | **MODIFY** (optional) | Show which Annex C option is active |

## Files NOT Changed

- `KnockoutStageForm.tsx` — receives resolved matches, doesn't care how resolved
- `PredictionsFlow.tsx` — calls `resolveAllR32Matches()` which handles it internally
- `SummaryView.tsx` — no changes needed
- Database — no schema changes needed (Annex C is static reference data, stored as a TS constant)

---

## Why No Database Table

The Annex C data is:
- **Immutable** — FIFA rules don't change mid-tournament
- **Needed client-side** — the prediction flow resolves brackets in the browser
- **Static** — no CRUD operations needed
- **Small** — 495 entries with 8 fields each, well under typical bundle size concerns

A TypeScript constant with a Map gives O(1) lookup and zero network overhead.

---

## Validation Plan

1. **Correctness**: Spot-check several Annex C options against the FIFA document
2. **No same-group matchups**: Verify for all 495 options that no group winner plays a 3rd-place team from their own group
3. **Completeness**: Confirm all 495 combinations of C(12,8) = 495 are present
4. **Integration**: Full prediction flow still works — group predictions → R32 resolution → bracket cascade → champion
5. **Fallback**: Verify backtracking still works when < 8 groups have complete data

---

## Risk Assessment

- **Low risk**: Change is isolated to one function + one new file
- **Backward compatible**: Existing predictions recalculated from group stage data each time
- **No DB migration**: No schema changes
- **Fallback preserved**: Backtracking algorithm kept for incomplete-data edge case
