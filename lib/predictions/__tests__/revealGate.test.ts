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
