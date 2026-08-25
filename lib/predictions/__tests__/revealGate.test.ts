// =============================================================
// Prediction reveal gate — unit tests
// =============================================================
// Feature: "members see all predictions after lock"
//   (drafts/2026-07-13_member_predictions_visibility.md).
//
// The anti-cheat property under test: a scope is never revealable while it is
// still editable pool-wide. No DB, no network — pure functions only.

import { describe, it, expect } from 'vitest'
import {
  gatePoolPredictions,
  computeReveal,
  filterRevealedPredictions,
  type RevealRoundState,
} from '../revealGate'

const NOW = new Date('2026-06-01T00:00:00Z')
const PAST = '2026-05-01T00:00:00Z'
const FUTURE = '2026-07-01T00:00:00Z'

describe('computeReveal — full_tournament', () => {
  it('hides the entry before the deadline', () => {
    expect(
      computeReveal({ prediction_mode: 'full_tournament', prediction_deadline: FUTURE }, [], NOW),
    ).toEqual({ revealed: false })
  })

  it('reveals the whole entry after the deadline', () => {
    expect(
      computeReveal({ prediction_mode: 'full_tournament', prediction_deadline: PAST }, [], NOW),
    ).toEqual({ revealed: true, scope: 'all' })
  })

  it('reveals exactly at the deadline (>=)', () => {
    expect(
      computeReveal(
        { prediction_mode: 'full_tournament', prediction_deadline: NOW.toISOString() },
        [],
        NOW,
      ),
    ).toEqual({ revealed: true, scope: 'all' })
  })

  it('hides when the deadline is unset (fail-safe)', () => {
    expect(
      computeReveal({ prediction_mode: 'full_tournament', prediction_deadline: null }, [], NOW),
    ).toEqual({ revealed: false })
  })

  it('hides when the deadline is unparseable (fail-safe)', () => {
    expect(
      computeReveal({ prediction_mode: 'full_tournament', prediction_deadline: 'not-a-date' }, [], NOW),
    ).toEqual({ revealed: false })
  })
})

describe('computeReveal — bracket_picker', () => {
  it('reveals the whole entry only after the single deadline', () => {
    expect(
      computeReveal({ prediction_mode: 'bracket_picker', prediction_deadline: PAST }, [], NOW),
    ).toEqual({ revealed: true, scope: 'all' })
    expect(
      computeReveal({ prediction_mode: 'bracket_picker', prediction_deadline: FUTURE }, [], NOW),
    ).toEqual({ revealed: false })
  })
})

describe('computeReveal — progressive', () => {
  const pool = { prediction_mode: 'progressive' as const, prediction_deadline: null }

  it('reveals only locked rounds (by state)', () => {
    const rounds: RevealRoundState[] = [
      { round_key: 'group', state: 'completed', deadline: null },
      { round_key: 'round_32', state: 'locked', deadline: null },
      { round_key: 'round_16', state: 'open', deadline: null },
    ]
    expect(computeReveal(pool, rounds, NOW)).toEqual({
      revealed: true,
      scope: 'rounds',
      roundKeys: ['group', 'round_32'],
    })
  })

  it('treats a passed round deadline as locked even when state is open', () => {
    const rounds: RevealRoundState[] = [
      { round_key: 'group', state: 'open', deadline: PAST },
      { round_key: 'round_32', state: 'open', deadline: FUTURE },
    ]
    expect(computeReveal(pool, rounds, NOW)).toEqual({
      revealed: true,
      scope: 'rounds',
      roundKeys: ['group'],
    })
  })

  it('reveals nothing while every round is open and unexpired', () => {
    const rounds: RevealRoundState[] = [{ round_key: 'group', state: 'open', deadline: FUTURE }]
    expect(computeReveal(pool, rounds, NOW)).toEqual({ revealed: false })
  })

  it('reveals nothing when there are no round states', () => {
    expect(computeReveal(pool, [], NOW)).toEqual({ revealed: false })
  })
})

describe('filterRevealedPredictions', () => {
  const preds = [
    { match_id: 'm1', v: 1 },
    { match_id: 'm2', v: 2 },
    { match_id: 'm3', v: 3 },
  ]
  const stageById = new Map<string, string>([
    ['m1', 'group'],
    ['m2', 'round_32'],
    ['m3', 'round_16'],
  ])

  it('returns nothing when not revealed', () => {
    expect(filterRevealedPredictions(preds, { revealed: false }, stageById)).toEqual([])
  })

  it('returns everything for scope "all"', () => {
    expect(filterRevealedPredictions(preds, { revealed: true, scope: 'all' }, stageById)).toEqual(preds)
  })

  it('returns only predictions whose stage is a revealed round', () => {
    const out = filterRevealedPredictions(
      preds,
      { revealed: true, scope: 'rounds', roundKeys: ['group', 'round_32'] },
      stageById,
    )
    expect(out.map((p) => p.match_id)).toEqual(['m1', 'm2'])
  })

  it('excludes a prediction whose match has no known stage', () => {
    const out = filterRevealedPredictions(
      [{ match_id: 'mX' }],
      { revealed: true, scope: 'rounds', roundKeys: ['group'] },
      new Map(),
    )
    expect(out).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// gatePoolPredictions — the rule that decides whether another member's picks
// cross to a browser. Step 3 moved the pool-wide array off pool open and behind
// GET /api/pools/:id/bulk; this is the gate that route applies.
// ---------------------------------------------------------------------------
describe('gatePoolPredictions', () => {
  const pick = (entryId: string, matchId: string) => ({ entry_id: entryId, match_id: matchId })
  const stages = new Map([
    ['m-group', 'group'],
    ['m-final', 'final'],
  ])

  it('never leaks another member when nothing is revealed', () => {
    const out = gatePoolPredictions({
      predictions: [pick('mine', 'm-group'), pick('theirs', 'm-group')],
      ownEntryIds: ['mine'],
      isAdmin: false,
      reveal: { revealed: false },
      matchStageById: stages,
    })
    expect(out).toEqual([pick('mine', 'm-group')])
    expect(out.some(p => p.entry_id === 'theirs')).toBe(false)
  })

  it('always returns your OWN picks, even unrevealed', () => {
    const out = gatePoolPredictions({
      predictions: [pick('mine', 'm-group'), pick('mine', 'm-final')],
      ownEntryIds: ['mine'],
      isAdmin: false,
      reveal: { revealed: false },
      matchStageById: stages,
    })
    expect(out).toHaveLength(2)
  })

  it('reveals others only for locked rounds under progressive scope', () => {
    const out = gatePoolPredictions({
      predictions: [
        pick('theirs', 'm-group'), // group is locked → revealed
        pick('theirs', 'm-final'), // final still open → withheld
      ],
      ownEntryIds: ['mine'],
      isAdmin: false,
      reveal: { revealed: true, scope: 'rounds', roundKeys: ['group'] },
      matchStageById: stages,
    })
    expect(out).toEqual([pick('theirs', 'm-group')])
  })

  it('passes everything through for an admin', () => {
    const all = [pick('mine', 'm-group'), pick('theirs', 'm-final')]
    expect(gatePoolPredictions({
      predictions: all,
      ownEntryIds: ['mine'],
      isAdmin: true,
      reveal: { revealed: false },
      matchStageById: stages,
    })).toBe(all)
  })

  it('withholds a match with no known stage under round scope', () => {
    // A prediction whose match is missing from the stage map must not fall
    // through as revealed — unknown scope is not permission.
    const out = gatePoolPredictions({
      predictions: [pick('theirs', 'm-unknown')],
      ownEntryIds: ['mine'],
      isAdmin: false,
      reveal: { revealed: true, scope: 'rounds', roundKeys: ['group'] },
      matchStageById: stages,
    })
    expect(out).toEqual([])
  })
})

// =============================================================
// league_pickem — the reveal that fires thirty-eight times
// =============================================================
// Plan §0.9. The World Cup reveals once, before match one; a league reveals
// every matchweek, which is what makes it a rhythm rather than an event.
//
// The trap these tests exist for is the SECOND one. A league matchweek that has
// not opened yet is derived as state 'locked' — that is what the word means in
// the World Cup round vocabulary ("not yet open"), and `pool_round_states` seeds
// unopened bracket rounds exactly that way. Reusing the progressive branch would
// therefore have called a matchweek in April revealable in August. Nothing would
// leak *today*, because migration 058 refuses a pick for any matchweek but the
// open one — but that is a coincidence of a different rule, and the day "pick
// ahead" ships it stops being true.
// =============================================================

const LEAGUE_POOL = {
  prediction_mode: 'league_pickem' as const,
  // A league pool's deadline is the season's LAST kickoff, set that way at
  // creation so the whole-entry reveal can never fire. Held here as a real
  // future date so the tests prove the branch does not fall through to it.
  prediction_deadline: FUTURE,
}

describe('computeReveal — league_pickem', () => {
  it('reveals nothing while every matchweek is still to come', () => {
    expect(
      computeReveal(LEAGUE_POOL, [
        { round_key: 'mw_1', state: null, deadline: FUTURE },
        { round_key: 'mw_2', state: null, deadline: FUTURE },
      ], NOW),
    ).toEqual({ revealed: false })
  })

  it('reveals only the matchweeks that have actually locked', () => {
    const r = computeReveal(LEAGUE_POOL, [
      { round_key: 'mw_1', state: null, deadline: PAST },
      { round_key: 'mw_2', state: null, deadline: PAST },
      { round_key: 'mw_3', state: null, deadline: FUTURE },
    ], NOW)
    expect(r).toEqual({ revealed: true, scope: 'rounds', roundKeys: ['mw_1', 'mw_2'] })
  })

  it('does NOT reveal a future matchweek that is merely in the "locked" state', () => {
    // The whole reason this is its own branch rather than the progressive one.
    const r = computeReveal(LEAGUE_POOL, [
      { round_key: 'mw_1', state: 'completed', deadline: PAST },
      { round_key: 'mw_2', state: 'open', deadline: FUTURE },
      { round_key: 'mw_3', state: 'locked', deadline: FUTURE }, // not yet OPEN
      { round_key: 'mw_38', state: 'locked', deadline: FUTURE },
    ], NOW)
    expect(r).toEqual({ revealed: true, scope: 'rounds', roundKeys: ['mw_1'] })
  })

  it('never reveals the whole entry, whatever the pool deadline says', () => {
    // If the branch fell through, a league pool whose deadline had passed would
    // reveal all thirty-eight matchweeks at once — including ones nobody has
    // reached.
    const r = computeReveal(
      { prediction_mode: 'league_pickem', prediction_deadline: PAST },
      [{ round_key: 'mw_38', state: null, deadline: FUTURE }],
      NOW,
    )
    expect(r).toEqual({ revealed: false })
  })

  it('gates a Results-depth outcome by exactly the same rule as a scoreline', () => {
    // Outcomes are picks. They go through gatePoolPredictions unchanged, so a
    // second implementation of the rule cannot drift away from the first.
    const reveal = computeReveal(LEAGUE_POOL, [
      { round_key: 'mw_1', state: null, deadline: PAST },
      { round_key: 'mw_2', state: null, deadline: FUTURE },
    ], NOW)
    const stageById = new Map([['fx1', 'mw_1'], ['fx2', 'mw_2']])
    const outcomes = [
      { entry_id: 'mine', match_id: 'fx1', outcome: 'home' },
      { entry_id: 'mine', match_id: 'fx2', outcome: 'away' },
      { entry_id: 'theirs', match_id: 'fx1', outcome: 'draw' },
      { entry_id: 'theirs', match_id: 'fx2', outcome: 'home' },
    ]
    const shown = gatePoolPredictions({
      predictions: outcomes,
      ownEntryIds: ['mine'],
      isAdmin: false,
      reveal,
      matchStageById: stageById,
    })
    // Both of mine, plus only the locked matchweek of theirs.
    expect(shown).toHaveLength(3)
    expect(shown.filter((o) => o.entry_id === 'theirs')).toEqual([
      { entry_id: 'theirs', match_id: 'fx1', outcome: 'draw' },
    ])
  })
})
