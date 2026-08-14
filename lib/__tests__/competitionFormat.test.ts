// =============================================================
// Competition format predicates — regression lock for the league path.
// =============================================================
// The case that matters here is not hypothetical. Verified against production
// on 2026-07-30 and re-confirmed 2026-08-14:
//
//   The fixtures cron dispatched advancement as
//       trigger: m.stage === 'group' ? 'group_complete' : 'knockout_result'
//   — an inverted default, where anything that is not a group match is assumed
//   to be a knockout result. A league fixture is `regular_season`, so every
//   completed Premier League match would have been announced to the bracket
//   engine as a knockout result.
//
//   `advanceKnockoutWinner` keys purely on `match_number`. The league importer
//   numbers a fresh season's fixtures from 1 (its counter is scoped to its own
//   tournament), while the World Cup's 32 placeholder-carrying matches
//   reference source matches 73–102. League fixture #73 completing would have
//   written a Premier League club into a completed World Cup knockout slot and
//   cascaded it through the finished bracket that 623 pools are scored against.
//
// So the lock is on the DIRECTION of the default: an unrecognised stage must
// return null (no advancement), never 'knockout_result'.
// =============================================================

import { describe, it, expect } from 'vitest'
import {
  MATCH_STAGES,
  BRACKET_KNOCKOUT_STAGES,
  advancementTriggerFor,
  hasScheduledTeams,
  isKnockoutStage,
  isLeagueStage,
} from '@/lib/competitionFormat'

describe('advancementTriggerFor — the cascade gate', () => {
  it('fires group_complete for the group stage', () => {
    expect(advancementTriggerFor('group')).toBe('group_complete')
  })

  it('fires knockout_result for every bracket knockout stage', () => {
    for (const stage of BRACKET_KNOCKOUT_STAGES) {
      expect(advancementTriggerFor(stage)).toBe('knockout_result')
    }
  })

  it('does NOT advance a league fixture — the corruption path', () => {
    // The single most important assertion in this file. A regular_season
    // fixture reaching the bracket cascade is how a Premier League club ends
    // up in a finished World Cup knockout slot.
    expect(advancementTriggerFor('regular_season')).toBeNull()
  })

  it('defaults an unknown stage to no advancement, not to knockout', () => {
    // Fail-closed. A stage added later (league play-offs, a group-then-split
    // phase) must be inert here until someone deliberately opts it in.
    for (const stage of ['play_off', 'championship_group', 'relegation_group', '', 'FINAL']) {
      expect(advancementTriggerFor(stage)).toBeNull()
    }
  })

  it('covers every declared match stage explicitly', () => {
    // Guards against a stage being added to MATCH_STAGES without anyone
    // deciding what it means for advancement.
    const decided = MATCH_STAGES.map((s) => [s, advancementTriggerFor(s)] as const)
    expect(Object.fromEntries(decided)).toEqual({
      group: 'group_complete',
      round_32: 'knockout_result',
      round_16: 'knockout_result',
      quarter_final: 'knockout_result',
      semi_final: 'knockout_result',
      third_place: 'knockout_result',
      final: 'knockout_result',
      regular_season: null,
    })
  })
})

describe('hasScheduledTeams — what the scoring team-matching gate is asking', () => {
  it('is true when the fixture names its own teams', () => {
    // Group: the draw is published before anyone picks.
    expect(hasScheduledTeams('group')).toBe(true)
    // League: Arsenal v Chelsea on matchweek 3 is Arsenal v Chelsea from the
    // day the season is released. There is nothing for a member to predict
    // about WHO is playing, so there is nothing to match against — which is
    // precisely why the gate's `stage <> 'group'` test scores a league fixture
    // as a miss and zeroes the pool.
    expect(hasScheduledTeams('regular_season')).toBe(true)
  })

  it('is false for knockout fixtures, whose teams are themselves a prediction', () => {
    for (const stage of BRACKET_KNOCKOUT_STAGES) {
      expect(hasScheduledTeams(stage)).toBe(false)
    }
  })
})

describe('stage classification', () => {
  it('does not classify the league stage as knockout', () => {
    expect(isKnockoutStage('regular_season')).toBe(false)
    expect(isLeagueStage('regular_season')).toBe(true)
  })

  it('does not classify the group stage as knockout', () => {
    expect(isKnockoutStage('group')).toBe(false)
    expect(isLeagueStage('group')).toBe(false)
  })

  it('keeps knockout and league disjoint across all declared stages', () => {
    for (const stage of MATCH_STAGES) {
      expect(isKnockoutStage(stage) && isLeagueStage(stage)).toBe(false)
    }
  })
})
