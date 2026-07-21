/**
 * SINGLE OWNER of "what is the tournament podium".
 *
 * Two halves, one module:
 *   - resolveActualPodium()    — who ACTUALLY finished 1st/2nd/3rd
 *   - resolveEntryPodiumPick() — who an entry PICKED for 1st/2nd/3rd
 *
 * Every consumer (Node scoring engine, shadow materializer, points-breakdown UI,
 * leaderboard) must call these. Do not re-derive a podium anywhere else — the
 * 2026-07-19/20 incident was caused by three mutually-unaware copies of this
 * logic disagreeing with each other:
 *
 *   1. the ACTUAL podium was hand-typed into `tournament_awards` (a table with
 *      eight readers and zero writers), so for the 13h41m between the final
 *      whistle and the manual INSERT every podium bonus was silently withheld —
 *      even though `matches` already carried the answer;
 *   2. the PREDICTED podium was read off a cascaded bracket in EVERY mode, which
 *      is meaningless in progressive (members there predict the real fixtures,
 *      not a bracket of their own), costing 352 members their champion bonus;
 *   3. a hand-copy of (2) in the shadow engine drifted independently.
 *
 * The invariants that keep those from recurring:
 *   - The actual podium is DERIVED from completed matches. `tournament_awards`
 *     is an optional admin override, never a prerequisite for scoring.
 *   - The predicted podium is MODE-DISPATCHED via a required discriminant. There
 *     is no default mode: a new caller must state what it means, and a new
 *     prediction mode is a compile error until it is handled.
 *   - No pick means no podium. We never infer a member's opinion.
 */
import {
  Match,
  PredictionMap,
  GroupStanding,
  getKnockoutWinner,
  getKnockoutLoser,
} from './tournament'
import type { BracketResult } from './bracketResolver'

export type PredictionMode = 'full_tournament' | 'progressive' | 'bracket_picker'

/** The three finishers an entry predicted. `null` means "made no pick". */
export type PredictedPodium = {
  champion: GroupStanding | null
  runnerUp: GroupStanding | null
  thirdPlace: GroupStanding | null
}

/** The three teams that actually finished on the podium, as team ids. */
export type ActualPodium = {
  champion: string | null
  runnerUp: string | null
  thirdPlace: string | null
  /** Where the values came from — surfaced for ops assertions and debugging. */
  source: 'derived' | 'override' | 'mixed' | 'none'
}

/** Optional admin override, shaped like a `tournament_awards` row. */
export type PodiumOverride = {
  champion_team_id?: string | null
  runner_up_team_id?: string | null
  third_place_team_id?: string | null
} | null | undefined

/** The `matches` fields the actual podium is derived from. */
type PodiumMatchFields = {
  stage: string
  is_completed?: boolean | null
  winner_team_id?: string | null
  home_team_id?: string | null
  away_team_id?: string | null
}

/**
 * Who actually finished 1st / 2nd / 3rd.
 *
 * Derived from the COMPLETED final and third-place matches — champion is the
 * final's winner, runner-up is the other team in that fixture, third is the
 * third-place match's winner. This is deliberately read straight off `matches`
 * rather than off a resolved actual bracket: `winner_team_id` is authoritative
 * and already correct for penalty-decided ties, whereas a bracket cascades
 * group standings through Annex C and inherits the group-tiebreak fragility
 * behind the 2026-07-11 knockout incident.
 *
 * `is_completed` gates every position, so nothing is ever awarded mid-tournament.
 *
 * An override (a `tournament_awards` row) wins per-position where present, so an
 * admin can still correct a bad feed. Absence of that row is NOT an error — it
 * is the normal state, and scoring must work without it.
 */
export function resolveActualPodium(
  matches: ReadonlyArray<PodiumMatchFields>,
  override?: PodiumOverride
): ActualPodium {
  const finalMatch = matches.find(m => m.stage === 'final' && m.is_completed)
  const thirdMatch = matches.find(m => m.stage === 'third_place' && m.is_completed)

  const derivedChampion = finalMatch?.winner_team_id ?? null
  const derivedRunnerUp =
    finalMatch && derivedChampion
      ? (derivedChampion === finalMatch.home_team_id
          ? finalMatch.away_team_id ?? null
          : finalMatch.home_team_id ?? null)
      : null
  const derivedThird = thirdMatch?.winner_team_id ?? null

  const champion = override?.champion_team_id ?? derivedChampion
  const runnerUp = override?.runner_up_team_id ?? derivedRunnerUp
  const thirdPlace = override?.third_place_team_id ?? derivedThird

  const anyOverride = Boolean(
    override?.champion_team_id || override?.runner_up_team_id || override?.third_place_team_id
  )
  const anyDerived = Boolean(derivedChampion || derivedRunnerUp || derivedThird)

  let source: ActualPodium['source'] = 'none'
  if (anyOverride && anyDerived) source = 'mixed'
  else if (anyOverride) source = 'override'
  else if (anyDerived) source = 'derived'

  return { champion, runnerUp, thirdPlace, source }
}

/**
 * The podium an entry PICKED, dispatched on prediction mode.
 *
 * `mode` is required and has no default. The previous code defaulted to
 * full_tournament semantics, which is how `/api/pools/[id]/bonus/calculate`
 * silently scored every progressive pool as if it were a bracket pool.
 *
 *  - full_tournament — the member fills in a whole bracket, so their bracket IS
 *    their stated podium. The cascade is authoritative. (Product decision, pinned
 *    by test: a scoreline typed against the real final does NOT override it.)
 *
 *  - progressive — rounds open one at a time and the member predicts each REAL
 *    fixture, so their podium is whoever they picked in the ACTUAL final and
 *    third-place matches. Their group-stage picks cascaded through a bracket they
 *    never filled in are not an opinion about the podium and must never be read
 *    as one.
 *
 *  - bracket_picker — that mode stores explicit knockout picks in
 *    `bracket_picker_knockout_picks` and scores them in lib/bracketPickerScoring.
 *    It never derives a podium from `predictions`, so this returns empty.
 */
export function resolveEntryPodiumPick(params: {
  mode: PredictionMode
  matches: Match[]
  predictionMap: PredictionMap
  /** The entry's own bracket, resolved from their predictions. */
  predictedBracket: BracketResult
  /**
   * Progressive only: the knockout map built from the REAL fixtures, so a pick is
   * read against the teams the member actually saw on screen.
   */
  actualKnockoutTeamMap?: BracketResult['knockoutTeamMap']
}): PredictedPodium {
  const { mode, matches, predictionMap, predictedBracket, actualKnockoutTeamMap } = params

  switch (mode) {
    case 'bracket_picker':
      return { champion: null, runnerUp: null, thirdPlace: null }

    case 'full_tournament':
      // The cascade already resolved the final and third-place matches over the
      // member's own bracket (see resolveBracketCore step 5). Reading their
      // scoreline again here would compute the identical value, so there is
      // nothing to fall back to — a null here means their bracket genuinely
      // never reached a podium, and no bonus is owed.
      return {
        champion: predictedBracket.champion,
        runnerUp: predictedBracket.runnerUp,
        thirdPlace: predictedBracket.thirdPlace,
      }

    case 'progressive':
      return podiumFromMatchPicks(
        matches,
        predictionMap,
        actualKnockoutTeamMap ?? predictedBracket.knockoutTeamMap
      )
  }
}

/**
 * Read the podium straight off the member's picks in the real final and
 * third-place fixtures.
 *
 * `requireExplicitPick` is load-bearing. getKnockoutWinner's FIFA-ranking
 * fallback exists so a hypothetical bracket can always cascade past a drawn
 * scoreline — but on this path it would fabricate an opinion the member never
 * expressed, then show it back to them as "your pick". A drawn prediction with
 * no shootout and no explicit winner is not a podium pick.
 *
 * Runner-up goes through getKnockoutLoser rather than an inverted comparison so
 * that no pick yields null instead of silently naming the home team.
 */
function podiumFromMatchPicks(
  matches: Match[],
  predictionMap: PredictionMap,
  knockoutTeamMap: BracketResult['knockoutTeamMap']
): PredictedPodium {
  const pickWinner = (stage: 'final' | 'third_place') => {
    const match = matches.find(m => m.stage === stage)
    if (!match) return { winner: null, loser: null }
    const slot = knockoutTeamMap.get(match.match_number)
    if (!slot?.home || !slot?.away) return { winner: null, loser: null }
    const opts = { requireExplicitPick: true }
    return {
      winner: getKnockoutWinner(match.match_id, predictionMap, slot.home, slot.away, opts),
      loser: getKnockoutLoser(match.match_id, predictionMap, slot.home, slot.away, opts),
    }
  }

  const final = pickWinner('final')
  const third = pickWinner('third_place')

  return {
    champion: final.winner,
    runnerUp: final.loser,
    thirdPlace: third.winner,
  }
}
