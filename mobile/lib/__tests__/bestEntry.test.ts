import { describe, expect, it } from 'vitest'

import {
  pickBestEntry,
  storedPointsOf,
  storedRankOf,
  UNRANKED,
  type StoredEntry,
} from '../bestEntry'

const entry = (over: Partial<StoredEntry> & { entry_id: string }): StoredEntry => ({
  current_rank: null,
  scored_total_points: 0,
  ...over,
})

const pickStored = (entries: StoredEntry[]) =>
  pickBestEntry(entries, storedRankOf, storedPointsOf)

describe('pickBestEntry', () => {
  it('has no answer when the member holds no entries', () => {
    // Real case: an admin who deleted all of theirs. The card must show
    // nothing rather than an arbitrary row.
    expect(pickStored([])).toBeNull()
  })

  it('takes the lowest rank', () => {
    const best = pickStored([
      entry({ entry_id: 'a', current_rank: 7 }),
      entry({ entry_id: 'b', current_rank: 2 }),
      entry({ entry_id: 'c', current_rank: 9 }),
    ])
    expect(best?.entry_id).toBe('b')
  })

  it('sorts an unranked entry LAST, not first', () => {
    // `null` rank is "no rank yet", and the naive comparison treats it as zero
    // — which would make a brand-new entry outrank a leader.
    const best = pickStored([
      entry({ entry_id: 'unranked' }),
      entry({ entry_id: 'ranked', current_rank: 40 }),
    ])
    expect(best?.entry_id).toBe('ranked')
    expect(storedRankOf(entry({ entry_id: 'x' }))).toBe(UNRANKED)
  })

  it('breaks a rank tie on scored points', () => {
    const best = pickStored([
      entry({ entry_id: 'low', current_rank: 3, scored_total_points: 10 }),
      entry({ entry_id: 'high', current_rank: 3, scored_total_points: 40 }),
    ])
    expect(best?.entry_id).toBe('high')
  })

  it('reads scored_total_points, never the dead total_points column', () => {
    // v2 scoring never writes `total_points`, so a tie-break on it never fires
    // and "best entry" degenerates to "first entry returned". The entry that
    // wins here is the one with scored points, though a `total_points` reader
    // would have picked the other.
    const withLegacy = [
      { ...entry({ entry_id: 'legacy-leader', current_rank: 1 }), total_points: 999 },
      { ...entry({ entry_id: 'legacy-leader-2', current_rank: 1, scored_total_points: 5 }), total_points: 0 },
    ]
    const best = pickBestEntry(withLegacy, storedRankOf, storedPointsOf)
    expect(best?.entry_id).toBe('legacy-leader-2')
  })

  it('keeps the first entry when everything ties, rather than the last', () => {
    const best = pickStored([
      entry({ entry_id: 'first', current_rank: 4, scored_total_points: 20 }),
      entry({ entry_id: 'second', current_rank: 4, scored_total_points: 20 }),
    ])
    expect(best?.entry_id).toBe('first')
  })

  describe('⚠ the known divergence between the two callers', () => {
    // PINNED, NOT ENDORSED. The card selects with the home-scoring summary
    // taking precedence; the progressive "still owes a prediction" branch runs
    // a wave earlier and can only see the stored columns. Where the two
    // disagree they select DIFFERENT entries, and the card answers the same
    // question twice.
    //
    // This test exists so that collapsing the waves — which makes the summary
    // available to both — shows up as a deliberate behaviour change here,
    // rather than as a card in the wild giving two answers.
    const entries = [
      entry({ entry_id: 'stored-leader', current_rank: 1, scored_total_points: 10 }),
      entry({ entry_id: 'summary-leader', current_rank: 8, scored_total_points: 90 }),
    ]
    // What the home-scoring summary says, where it disagrees with the columns.
    const summary: Record<string, { current_rank: number; scored_total_points: number }> = {
      'stored-leader': { current_rank: 8, scored_total_points: 10 },
      'summary-leader': { current_rank: 1, scored_total_points: 90 },
    }

    it('the progressive branch picks by the stored columns', () => {
      expect(pickStored(entries)?.entry_id).toBe('stored-leader')
    })

    it('the card picks by the summary, and lands somewhere else', () => {
      const best = pickBestEntry(
        entries,
        (e) => summary[e.entry_id]?.current_rank ?? storedRankOf(e),
        (e) => summary[e.entry_id]?.scored_total_points ?? storedPointsOf(e),
      )
      expect(best?.entry_id).toBe('summary-leader')
    })
  })

  it('falls back to the stored columns when the summary has nothing to say', () => {
    // Most entries are not in the summary at all; the fallback is the norm.
    const summary: Record<string, { current_rank: number }> = {}
    const best = pickBestEntry(
      [entry({ entry_id: 'a', current_rank: 5 }), entry({ entry_id: 'b', current_rank: 2 })],
      (e) => summary[e.entry_id]?.current_rank ?? storedRankOf(e),
      storedPointsOf,
    )
    expect(best?.entry_id).toBe('b')
  })
})
