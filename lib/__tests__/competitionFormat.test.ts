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
  hasCompetitionEnded,
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

describe('hasCompetitionEnded — which competitions are still on offer', () => {
  // Both production rows read status='upcoming' on this date, including the
  // World Cup, whose final was 19 July. That is why this is derived from dates
  // and not from the authored column.
  const TODAY = new Date('2026-08-15T12:00:00Z')

  it('hides a finished competition', () => {
    // FIFA World Cup 2026: ended 2026-07-19, 104/104 played.
    expect(hasCompetitionEnded('2026-07-19', TODAY)).toBe(true)
  })

  it('keeps a competition that has not started', () => {
    // Premier League 2026/27: starts 21 Aug, ends 2027-05-30.
    expect(hasCompetitionEnded('2027-05-30', TODAY)).toBe(false)
  })

  it('KEEPS a season already under way', () => {
    // The trap. Filtering on "has it started" instead of "has it ended" would
    // hide the Premier League from September onwards — and Decision 2 settled
    // that a league pool stays joinable after first lock, "week 3 of 38 is
    // viable". A season in progress is the normal case, not an edge case.
    const midSeason = new Date('2026-11-20T12:00:00Z')
    expect(hasCompetitionEnded('2027-05-30', midSeason)).toBe(false)
  })

  it('treats the final day as inclusive', () => {
    // A competition ending today is still live today — end_date is a DATE, so
    // an exclusive comparison would retire it at midnight on its own final.
    expect(hasCompetitionEnded('2026-08-15', TODAY)).toBe(false)
    expect(hasCompetitionEnded('2026-08-14', TODAY)).toBe(true)
  })

  it('keeps anything it cannot date', () => {
    // Better to offer a competition with a missing or broken end date than to
    // silently hide one that is running.
    for (const bad of [null, undefined, '', 'not-a-date']) {
      expect(hasCompetitionEnded(bad, TODAY), String(bad)).toBe(false)
    }
  })
})
