// =============================================================
// League import — phase detection.
// =============================================================
// Every shape below is a REAL round vocabulary, read from api-football's
// /fixtures/rounds on 2026-08-14. The point of the test is that none of these
// needed a per-league branch: the importer picks the regular season by size,
// because the name is not stable (Scotland says "1st Phase") and the presence
// of a play-off tail is not predictable from the league's tier (Germany and
// France have one; England, Spain and Italy do not).
// =============================================================

import { describe, it, expect } from 'vitest'
import { detectRegularSeasonPhase } from '@/lib/integrations/apiFootball/importLeagueSeason'

/** Build fixtures for `rounds` labelled `${phase} - n`, one per round. */
function numbered(phase: string, count: number, startDay = 1) {
  return Array.from({ length: count }, (_, i) => ({
    round: `${phase} - ${i + 1}`,
    date: `2026-${String(Math.floor((startDay + i) / 28) + 8).padStart(2, '0')}-${String(((startDay + i) % 28) + 1).padStart(2, '0')}T12:00:00Z`,
  }))
}

function unnumbered(round: string, date: string) {
  return [{ round, date }]
}

/** Rounds `${phase} - from..to`, dated after the regular season. */
function offset(phase: string, from: number, to: number) {
  return Array.from({ length: to - from + 1 }, (_, i) => ({
    round: `${phase} - ${from + i}`,
    date: `2027-04-${String((i % 28) + 1).padStart(2, '0')}T12:00:00Z`,
  }))
}

describe('detectRegularSeasonPhase — the clean leagues', () => {
  it.each([
    ['Premier League (ENG)', 38],
    ['La Liga (ESP)', 38],
    ['Serie A (ITA)', 38],
  ])('%s: single phase, %i rounds', (_name, count) => {
    const { phase, phases } = detectRegularSeasonPhase(numbered('Regular Season', count))
    expect(phase).toBe('Regular Season')
    expect(phases).toHaveLength(1)
    expect(phases[0].rounds).toBe(count)
  })
})

describe('detectRegularSeasonPhase — leagues with a play-off tail', () => {
  it('Bundesliga / Ligue 1 / Primeira Liga: 34 rounds + an unnumbered "Final"', () => {
    const fixtures = [...numbered('Regular Season', 34), ...unnumbered('Final', '2027-05-30T12:00:00Z')]
    const { phase, phases } = detectRegularSeasonPhase(fixtures)
    expect(phase).toBe('Regular Season')
    // The relegation play-off is visible in the summary, not silently dropped.
    expect(phases.map((p) => p.phase)).toContain('Final')
    expect(phases.find((p) => p.phase === 'Final')?.unnumbered).toBe(1)
  })

  it('Eredivisie: regular season plus a two-round European play-off', () => {
    const fixtures = [
      ...numbered('Regular Season', 34),
      ...unnumbered('Semi-finals', '2027-05-20T12:00:00Z'),
      ...unnumbered('Final', '2027-05-30T12:00:00Z'),
    ]
    expect(detectRegularSeasonPhase(fixtures).phase).toBe('Regular Season')
  })

  it('Championship: 46 rounds and a promotion play-off', () => {
    const fixtures = [
      ...numbered('Regular Season', 46),
      ...unnumbered('Semi-finals', '2027-05-12T12:00:00Z'),
      ...unnumbered('Final', '2027-05-26T12:00:00Z'),
    ]
    const { phase, phases } = detectRegularSeasonPhase(fixtures)
    expect(phase).toBe('Regular Season')
    expect(phases[0].rounds).toBe(46)
  })
})

describe('detectRegularSeasonPhase — the awkward ones', () => {
  it('Scotland: the phase is called "1st Phase", not "Regular Season"', () => {
    // An allowlist of known names would have imported NOTHING here.
    const fixtures = [
      ...numbered('1st Phase', 33),
      ...offset('Championship Group', 34, 38),
      ...offset('Relegation Group', 34, 38),
      ...unnumbered('Final', '2027-05-30T12:00:00Z'),
    ]
    expect(detectRegularSeasonPhase(fixtures).phase).toBe('1st Phase')
  })

  it('Belgium: picks the league phase when three parallel groups share ordinals', () => {
    // Verified against the live feed 2026-08-14: Regular Season is 1..30, then
    // Championship / Relegation / Conference League groups ALL reuse 31..40 —
    // they run concurrently after the split. Choosing the phase first is what
    // keeps three different "matchweek 34"s from merging into one.
    const fixtures = [
      ...numbered('Regular Season', 30),
      ...offset('Championship Group', 31, 40),
      ...offset('Relegation Group', 31, 36),
      ...offset('Conference League Group', 31, 40),
    ]
    const { phase } = detectRegularSeasonPhase(fixtures)
    expect(phase).toBe('Regular Season')
  })

  it('Scotland: the two post-split groups share ordinals 34..38', () => {
    const fixtures = [
      ...numbered('1st Phase', 33),
      ...offset('Championship Group', 34, 38),
      ...offset('Relegation Group', 34, 38),
    ]
    expect(detectRegularSeasonPhase(fixtures).phase).toBe('1st Phase')
  })

  it('breaks a tie on the earliest fixture, so the phase a season STARTS with wins', () => {
    const fixtures = [
      ...numbered('Second Stage', 10, 200),
      ...numbered('First Stage', 10, 1),
    ]
    expect(detectRegularSeasonPhase(fixtures).phase).toBe('First Stage')
  })
})

describe('detectRegularSeasonPhase — refuses rather than guesses', () => {
  it('returns null when no phase has numbered rounds', () => {
    const fixtures = [
      ...unnumbered('Semi-finals', '2027-05-20T12:00:00Z'),
      ...unnumbered('Final', '2027-05-30T12:00:00Z'),
    ]
    // A knockout-only competition is not a league season. The importer turns
    // this into a thrown error rather than importing zero fixtures and
    // reporting success.
    expect(detectRegularSeasonPhase(fixtures).phase).toBeNull()
  })

  it('returns null for an empty feed', () => {
    expect(detectRegularSeasonPhase([]).phase).toBeNull()
  })
})
