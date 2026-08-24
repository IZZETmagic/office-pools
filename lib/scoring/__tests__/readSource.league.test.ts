// =============================================================
// readSource — league pools are shadow-only, by mode not by flag.
// =============================================================
// `shadow_read_enabled_pools` is an ALLOWLIST. Every World Cup pool had to be
// added to it explicitly. If a league pool were gated the same way, one omitted
// at creation would read the prod tables, find nothing there (the Node engine
// deliberately does not score league pools — see recalculatePool), and render a
// leaderboard of zeros. No error, because "no rows" is a valid result.
//
// That is the silent-wrongness class the whole league migration series exists to
// remove, so the rule is keyed off the mode and must short-circuit BEFORE the
// flag is ever read. These tests assert both halves: the right answer, and that
// it did not need the database to produce it.
// =============================================================

import { describe, it, expect, vi } from 'vitest'
import { getScoringSource } from '@/lib/scoring/readSource'

/** An admin client that fails the test if the flag is read at all. */
function adminThatMustNotBeQueried() {
  return {
    from: vi.fn(() => {
      throw new Error('readSource queried sync_settings for a league pool — it must short-circuit on the mode')
    }),
  } as never
}

/** An admin client whose allowlist is empty — the "forgot to add the pool" case. */
function adminWithEmptyAllowlist() {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { setting_value: [] } }) }),
      }),
    }),
  } as never
}

describe('getScoringSource — league pools', () => {
  // ⚠ CHANGED 2026-08-23. These two asserted 'shadow'. That was right about the
  // hazard and wrong about the destination: `shadow_entry_totals` is as empty
  // for a league as `pool_entries` is, so routing there produced exactly the
  // leaderboard of zeros the rule was written to prevent — silently, because
  // empty is a valid result. A league is scored into `league_entry_totals` by
  // `league_score_fixture` (migration 055), so that is where it now reads.
  it('returns league for a league pool without consulting the allowlist', async () => {
    const src = await getScoringSource(adminThatMustNotBeQueried(), 'pool-not-in-any-list', 'league_pickem')
    expect(src).toBe('league')
  })

  it('returns league for a league pool even when the allowlist is empty', async () => {
    // The regression this exists for: a league pool created after the flag was
    // last edited. The allowlist is the wrong gate for a league in either
    // direction — keying off the mode means a new league pool is correct the
    // moment it exists, with no operational step to forget.
    const src = await getScoringSource(adminWithEmptyAllowlist(), 'brand-new-league-pool', 'league_pickem')
    expect(src).toBe('league')
  })

  it('never routes a league pool at a World Cup table', async () => {
    // The whole point. 'prod' reads pool_entries, 'shadow' reads
    // shadow_entry_totals; both are empty for a league and neither errors.
    const src = await getScoringSource(adminWithEmptyAllowlist(), 'any-league-pool', 'league_pickem')
    expect(src).not.toBe('prod')
    expect(src).not.toBe('shadow')
  })
})

describe('getScoringSource — non-league pools are unchanged', () => {
  it('still honours the allowlist for the World Cup modes', async () => {
    for (const mode of ['full_tournament', 'progressive', 'bracket_picker']) {
      const src = await getScoringSource(adminWithEmptyAllowlist(), 'wc-pool', mode)
      expect(src, `mode ${mode} must still read the flag`).toBe('prod')
    }
  })
})
