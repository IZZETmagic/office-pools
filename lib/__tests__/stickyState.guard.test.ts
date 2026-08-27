// =============================================================
// The picking surfaces must not go back to plain useState
// =============================================================
// Every tab panel in PoolDetail is conditionally rendered, so leaving a tab
// unmounts it. A picking surface that seeds its state with
// `useState(<server prop>)` therefore re-seeds from a page-load snapshot every
// time the member comes back — showing the pick they had BEFORE the one they
// just made, while the database holds the new one perfectly.
//
// It was reported twice by Ryan (Table, then Survivor) and found a third time
// by testing (Pick'em). Nothing fails when it regresses: no crash, no type
// error, no failing assertion — just a member's save appearing to vanish.
//
// `npm test` has no DOM, so the hook's behaviour cannot be exercised here; it
// was verified in a browser by picking, switching tabs and coming back, on all
// three surfaces. This file is the cheap always-on half: it proves the three
// surfaces are still wired to the shared hook, and that the one effect allowed
// to overwrite them still knows a remount from a first mount.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')

const SURFACES: Array<[label: string, path: string, stateName: string]> = [
  ['Survivor', 'app/pools/[pool_id]/SurvivorTab.tsx', 'picks'],
  ['Pick’em outcomes', 'components/predictions/ProgressivePredictionsFlow.tsx', 'outcomes'],
  ['Pick’em predictions', 'components/predictions/ProgressivePredictionsFlow.tsx', 'predictions'],
]

describe('picking surfaces keep state across a tab switch', () => {
  for (const [label, path, stateName] of SURFACES) {
    it(`${label} uses useStickyState, not useState`, () => {
      const src = read(path)
      const decl = new RegExp(`const \\[${stateName}, set\\w+\\] = (useStickyState|useState)`)
      const m = src.match(decl)
      expect(m, `could not find the ${stateName} declaration in ${path}`).not.toBeNull()
      expect(m![1]).toBe('useStickyState')
    })
  }

  it('every sticky key carries the pool id, so pools cannot read each other', () => {
    for (const [, path] of SURFACES) {
      for (const m of read(path).matchAll(/useStickyState<[^>]*>\(\s*`([^`]+)`/g)) {
        expect(m[1], `${path}: key "${m[1]}" has no poolId`).toContain('${poolId}')
      }
    }
  })

  it('⚠ the prop-sync effect can still tell a remount from a first mount', () => {
    // It must skip on a remount (or it overwrites the sticky value with the
    // stale prop) but still run on a genuine first mount, because
    // existingPredictions can arrive empty and populate from an async fetch.
    const src = read('components/predictions/ProgressivePredictionsFlow.tsx')
    expect(src).toMatch(/if \(hasStickyState\(`predictions:\$\{poolId\}:\$\{entryId\}`\)\) return/)
  })

  it('Table prediction keeps its own equivalent guard', () => {
    // Fixed earlier by lifting into PoolDetail rather than with this hook. Left
    // as it is because it works and is verified; this pins the mechanism so it
    // is not deleted as "unused" by someone who only knows about the hook.
    const detail = read('app/pools/[pool_id]/PoolDetail.tsx')
    expect(detail).toContain('tableSaved')
    expect(read('app/pools/[pool_id]/TablePredictionTab.tsx')).toContain('onSavedRef.current?.(')
  })
})
