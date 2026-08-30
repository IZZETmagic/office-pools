// =============================================================
// "The predictions are not being saved"
// =============================================================
// Reported by Ryan on 30 Aug 2026 against a Scores-depth league pool: make
// picks, switch tab, come back, the board is empty. They were being saved
// perfectly — production held both of his 16:04 picks in `league_predictions`
// while the screen showed none, and the table the screen was reading held zero
// rows for the entire pool.
//
// Two faults, one behind the other:
//
//  1. `fetchEntryPredictions` read `.from('predictions')`. A league pick is in
//     `league_predictions`, so a league entry has no rows there — and the read
//     wrote its empty result into `liveEntryPredictions`, which
//     `activeEntryPredictions` PREFERS over the server data. The effect that
//     fires it keys on `activeTab`, so it ran on every return to the tab.
//
//  2. The flow's prop-sync effect then applied that empty snapshot over the
//     sticky value. Its guard was first-run-only, which holds exactly as long
//     as the prop identity never changes again — and the refetch changes it a
//     moment after every remount, by which time the flag is spent and
//     `pendingChanges` reads false because the autosave has finished.
//
// Either one alone is survivable. Together they clear the board.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

/**
 * Source with its comments removed.
 *
 * Needed for the one "must not contain" assertion below, because this codebase
 * explains a change by QUOTING what it replaced — the comment on the effect
 * names `didInitialSync` precisely to say why the effect no longer uses it.
 */
const codeOnly = (text: string) =>
  text
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')

const detail = read('app/pools/[pool_id]/PoolDetail.tsx')
const flow = read('components/predictions/ProgressivePredictionsFlow.tsx')

/** The body of `fetchEntryPredictions`, so these assertions cannot pass on some other read. */
const fetchBody: string = (() => {
  const m = detail.match(
    /const fetchEntryPredictions = useCallback\(async \(entryId: string\) => \{[\s\S]*?\n {2}\}, \[[^\]]*\]\)/,
  )
  if (!m) throw new Error('fetchEntryPredictions was not found in PoolDetail.tsx')
  return m[0]
})()

describe('the tab-return refetch reads the table the picks are actually in', () => {
  it('branches on the pool being a league before it touches `predictions`', () => {
    const leagueAt = fetchBody.indexOf('pool.league_season_id')
    const wcAt = fetchBody.indexOf(".from('predictions')")
    expect(leagueAt, 'no league branch in fetchEntryPredictions').toBeGreaterThan(-1)
    expect(wcAt, "the World Cup read is gone entirely — that is not the fix").toBeGreaterThan(-1)
    expect(leagueAt).toBeLessThan(wcAt)
  })

  it('reads league picks through the adapter that already pages and reports errors', () => {
    expect(fetchBody).toContain('readLeaguePredictions')
  })

  it('leaves the entry alone when the read fails instead of writing an empty list', () => {
    // Writing `[]` on a failed read is what made a fetch failure look like data
    // loss. The league branch must return before any state write.
    const errorAt = fetchBody.indexOf('if (error)')
    const writeAt = fetchBody.indexOf('setLiveEntryPredictions')
    expect(errorAt).toBeGreaterThan(-1)
    expect(errorAt).toBeLessThan(writeAt)
    expect(fetchBody.slice(errorAt, writeAt)).toContain('return')
  })

  it('rebuilds when the pool changes', () => {
    // An empty dep array would freeze the World Cup branch into the closure.
    const deps = fetchBody.match(/\n {2}\}, \[([^\]]*)\]\)$/)
    expect(deps![1]).toContain('pool.league_season_id')
  })
})

describe('the sticky value wins for the whole life of the mount', () => {
  /** The prop-sync effect, isolated. */
  const syncEffect: string = (() => {
    const m = flow.match(/useEffect\(\(\) => \{\s*if \(hasStickyState[\s\S]*?\}, \[existingPredictions\]\)/)
    if (!m) throw new Error('the predictions prop-sync effect was not found')
    return m[0]
  })()

  it('checks the sticky cache on every run, not only the first', () => {
    // `useStickyState`'s own contract: "the sticky value wins until the page is
    // reloaded". A first-run-only flag does not deliver that.
    expect(syncEffect.indexOf('hasStickyState')).toBeLessThan(syncEffect.indexOf('setPredictions'))
    expect(codeOnly(flow)).not.toContain('didInitialSync')
  })

  it('still lets a first mount seed from props', () => {
    // Props can arrive empty and populate async; skipping that leaves the
    // screen blank. Nothing writes the cache until a member touches a pick, so
    // the guard is inert until there is something worth protecting.
    expect(syncEffect).toContain('setPredictions(map)')
  })

  it('still refuses to overwrite edits that have not been saved yet', () => {
    expect(syncEffect).toContain('if (pendingChanges.current) return')
  })
})
