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
  it('returns shadow for a league pool without consulting the allowlist', async () => {
    const src = await getScoringSource(adminThatMustNotBeQueried(), 'pool-not-in-any-list', 'league_pickem')
    expect(src).toBe('shadow')
  })

  it('returns shadow for a league pool even when the allowlist is empty', async () => {
    // The regression this exists for: a league pool created after the flag was
    // last edited. Under the old allowlist-only rule this returned 'prod'.
    const src = await getScoringSource(adminWithEmptyAllowlist(), 'brand-new-league-pool', 'league_pickem')
    expect(src).toBe('shadow')
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
