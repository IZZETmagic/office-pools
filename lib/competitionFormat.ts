// =============================================================
// COMPETITION FORMAT — what shape of competition is this fixture in?
// =============================================================
// The World Cup code is a bracket engine: its vocabulary is groups,
// placeholders, advancement cascades and knockout multipliers. A league has
// none of those — 18/20/24 clubs, a flat round-robin, a table. Nothing
// advances, nothing is a placeholder.
//
// This module is the single place that answers format questions about a
// fixture, so that "is this a bracket thing?" is asked by name instead of
// re-derived as `stage === 'group'` at each call site. It deliberately does
// NOT live in lib/tournament.ts, which is World-Cup-shaped by both name and
// content and which the league path does not enter.
//
// Design rule these predicates encode: **bracket behaviour is opt-in.** A
// stage this module has never heard of gets the safe answer (no advancement,
// no bracket assumptions), not the knockout one. That direction matters — see
// `advancementTriggerFor` for the corruption path that the old, inverted
// default actually opened.
// =============================================================

/** `matches.stage` values. Mirrors the `matches_stage_check` CHECK constraint. */
export const MATCH_STAGES = [
  'group',
  'round_32',
  'round_16',
  'quarter_final',
  'semi_final',
  'third_place',
  'final',
  'regular_season', // league round-robin — added by migration 024
] as const

export type MatchStage = typeof MATCH_STAGES[number]

/** `tournaments.format` values. Added by migration 024. */
export type CompetitionFormat = 'groups_knockout' | 'league'

/**
 * Knockout stages — the ones whose teams are produced by a previous result and
 * whose fixtures therefore carry "Winner Match N" placeholders.
 */
export const BRACKET_KNOCKOUT_STAGES: readonly string[] = [
  'round_32',
  'round_16',
  'quarter_final',
  'semi_final',
  'third_place',
  'final',
]

/** The league round-robin stage. */
export const LEAGUE_STAGE = 'regular_season'

export function isKnockoutStage(stage: string): boolean {
  return BRACKET_KNOCKOUT_STAGES.includes(stage)
}

export function isLeagueStage(stage: string): boolean {
  return stage === LEAGUE_STAGE
}

/**
 * Are this fixture's teams given by the schedule, rather than predicted?
 *
 * True for the group stage (the draw is published before anyone picks) and for
 * a league fixture (Arsenal v Chelsea on matchweek 3 is Arsenal v Chelsea from
 * the day the season is released). False for knockout fixtures, where the two
 * teams are themselves a prediction and have to be scored as one.
 *
 * This is the question the scoring team-matching gate is really asking. Naming
 * it matters: the gate is written as `stage <> 'group'`, which silently means
 * "a league fixture's teams were predicted" — they weren't, there is nothing to
 * match them against, and the fixture scores zero as a result.
 */
export function hasScheduledTeams(stage: string): boolean {
  return stage === 'group' || isLeagueStage(stage)
}

/**
 * Which advancement trigger a newly-completed fixture should fire — or `null`
 * when it must not enter the advancement cascade at all.
 *
 * ⚠ This function exists because of a real corruption path, verified against
 * production on 2026-07-30. The dispatch used to read:
 *
 *     trigger: m.stage === 'group' ? 'group_complete' : 'knockout_result'
 *
 * — an inverted default: *everything that isn't a group match is a knockout
 * result*. A league fixture is `regular_season`, so every completed Premier
 * League match would have been announced to the bracket engine as a knockout
 * result. `advanceKnockoutWinner` then keys purely on `match_number`, and the
 * league importer numbers a fresh season's fixtures from 1
 * (`importLeagueSeason.ts` scopes its counter to its own tournament) — while
 * the World Cup's 32 placeholder-carrying matches reference source matches
 * 73–102. League fixture #73 completing would have written a Premier League
 * club into a completed World Cup knockout slot and cascaded it through the
 * finished bracket that 623 pools are scored against.
 *
 * So the default is inverted here: only stages known to be part of a bracket
 * advance. Anything else — a league fixture, or any stage added later — returns
 * `null` and is skipped.
 */
export function advancementTriggerFor(stage: string): 'group_complete' | 'knockout_result' | null {
  if (stage === 'group') return 'group_complete'
  if (isKnockoutStage(stage)) return 'knockout_result'
  return null
}
