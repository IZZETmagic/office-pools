// =============================================================
// Tournament podium — regression lock for the 2026-07-19/20 incident.
// =============================================================
// Every case here maps to a way the product actually failed or was one
// keystroke away from failing. Nothing in this file is hypothetical.
//
//   RC-0  the ACTUAL podium was hand-typed into `tournament_awards`, so for
//         13h41m after the final every podium bonus in the product was
//         withheld — while `matches` already held the answer.
//   RC-1  the PREDICTED podium was read off a cascaded bracket in EVERY mode.
//         In progressive that bracket is fiction: 352 members who picked the
//         real champion in the real final were denied the bonus, while being
//         paid a match-winner bonus for the same pick in the same write.
//   RC-5  runner-up was derived with an inverted comparison instead of
//         getKnockoutLoser, so "no pick" silently named the home team.
//   RC-6  a drawn prediction with no shootout fell through to FIFA ranking,
//         fabricating a pick the member never made and showing it back to
//         them as their own.
// =============================================================

import { describe, it, expect } from 'vitest'
import { resolveActualPodium, resolveEntryPodiumPick } from '@/lib/podium'
import { resolvePredictedBracket } from '@/lib/bracketResolver'
import type { Match, Team, PredictionMap, GroupStanding } from '@/lib/tournament'

// ----- ids mirroring the real 2026 tournament -----
const SPAIN = 'team-spain'
const ARGENTINA = 'team-argentina'
const FRANCE = 'team-france'
const ENGLAND = 'team-england'

const SF1 = 'match-sf1'
const SF2 = 'match-sf2'
const THIRD = 'match-third'
const FINAL = 'match-final'

function mkTeam(id: string, fifa: number, group = 'A'): Team {
  return {
    team_id: id,
    country_name: id,
    country_code: id.slice(0, 3),
    group_letter: group,
    fifa_ranking_points: fifa,
    flag_url: null,
  }
}

function mkKnockout(
  match_id: string,
  match_number: number,
  stage: string,
  home: string | null,
  away: string | null,
  placeholders?: { home: string | null; away: string | null }
): Match {
  return {
    match_id,
    match_number,
    stage,
    group_letter: null,
    match_date: '2026-07-19T19:00:00Z',
    venue: null,
    status: 'completed',
    home_team_id: home,
    away_team_id: away,
    home_team_placeholder: placeholders?.home ?? null,
    away_team_placeholder: placeholders?.away ?? null,
    home_team: null,
    away_team: null,
  } as Match
}

/**
 * The real knockout tail: SF1 France-Spain, SF2 England-Argentina,
 * third-place France-England, final Spain-Argentina.
 */
function tailMatches(opts?: { finalCompleted?: boolean; thirdCompleted?: boolean }) {
  const finalCompleted = opts?.finalCompleted ?? true
  const thirdCompleted = opts?.thirdCompleted ?? true
  return [
    { ...mkKnockout(SF1, 101, 'semi_final', FRANCE, SPAIN), is_completed: true, winner_team_id: SPAIN },
    { ...mkKnockout(SF2, 102, 'semi_final', ENGLAND, ARGENTINA), is_completed: true, winner_team_id: ARGENTINA },
    {
      ...mkKnockout(THIRD, 103, 'third_place', FRANCE, ENGLAND, { home: 'Loser Match 101', away: 'Loser Match 102' }),
      is_completed: thirdCompleted,
      winner_team_id: thirdCompleted ? ENGLAND : null,
    },
    {
      ...mkKnockout(FINAL, 104, 'final', SPAIN, ARGENTINA, { home: 'Winner Match 101', away: 'Winner Match 102' }),
      is_completed: finalCompleted,
      winner_team_id: finalCompleted ? SPAIN : null,
    },
  ] as any[]
}

/** A knockout map keyed by match_number, as BracketResult carries it. */
function knockoutMap(entries: Array<[number, string | null, string | null]>, teams: Team[]) {
  const byId = new Map(teams.map(t => [t.team_id, t]))
  const asStanding = (id: string | null): GroupStanding | null => {
    const t = id ? byId.get(id) : null
    if (!t) return null
    return {
      team_id: t.team_id,
      country_name: t.country_name,
      country_code: t.country_code,
      flag_url: t.flag_url,
      group_letter: t.group_letter,
      fifa_ranking_points: t.fifa_ranking_points,
      played: 0, wins: 0, draws: 0, losses: 0,
      goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0,
    }
  }
  const map = new Map<number, { home: GroupStanding | null; away: GroupStanding | null }>()
  for (const [num, home, away] of entries) map.set(num, { home: asStanding(home), away: asStanding(away) })
  return map
}

const ALL_TEAMS = [
  // Argentina is deliberately ranked ABOVE Spain so the FIFA fallback, if it
  // ever fires on the podium path, produces a visibly wrong answer.
  mkTeam(SPAIN, 1800),
  mkTeam(ARGENTINA, 1900),
  mkTeam(FRANCE, 1850),
  mkTeam(ENGLAND, 1700),
]

const ACTUAL_KO = knockoutMap(
  [[101, FRANCE, SPAIN], [102, ENGLAND, ARGENTINA], [103, FRANCE, ENGLAND], [104, SPAIN, ARGENTINA]],
  ALL_TEAMS
)

function preds(rows: Array<[string, number | null, number | null, (string | null)?]>): PredictionMap {
  const map: PredictionMap = new Map()
  for (const [matchId, home, away, winnerTeamId] of rows) {
    map.set(matchId, { home, away, homePso: null, awayPso: null, winnerTeamId: winnerTeamId ?? null })
  }
  return map
}

/** A bracket stub carrying only what the podium resolver reads. */
function bracketStub(
  podium: { champion: string | null; runnerUp: string | null; thirdPlace: string | null },
  ko = ACTUAL_KO
) {
  const byId = new Map(ALL_TEAMS.map(t => [t.team_id, t]))
  const asStanding = (id: string | null) => {
    const t = id ? byId.get(id) : null
    return t ? ({ ...t, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, points: 0 } as GroupStanding) : null
  }
  return {
    allGroupStandings: new Map(),
    knockoutTeamMap: ko,
    champion: asStanding(podium.champion),
    runnerUp: asStanding(podium.runnerUp),
    thirdPlace: asStanding(podium.thirdPlace),
    qualifiedTeamIds: new Set<string>(),
  }
}

// =============================================================
// resolveActualPodium — RC-0
// =============================================================

describe('resolveActualPodium', () => {
  it('derives the podium from completed matches with NO tournament_awards row', () => {
    // THE test that would have caught RC-0. An empty awards table is the normal
    // state at the final whistle; scoring must never depend on a human INSERT.
    const podium = resolveActualPodium(tailMatches(), null)
    expect(podium).toEqual({
      champion: SPAIN,
      runnerUp: ARGENTINA,
      thirdPlace: ENGLAND,
      source: 'derived',
    })
  })

  it('derives the runner-up as the other side of the final regardless of home/away', () => {
    // Same fixture with the final's sides swapped — runner-up must follow the
    // winner, not the home slot.
    const matches = tailMatches().map(m =>
      m.stage === 'final' ? { ...m, home_team_id: ARGENTINA, away_team_id: SPAIN } : m
    )
    const podium = resolveActualPodium(matches, null)
    expect(podium.champion).toBe(SPAIN)
    expect(podium.runnerUp).toBe(ARGENTINA)
  })

  it('lets an admin override win per-position, and reports the source', () => {
    const podium = resolveActualPodium(tailMatches(), {
      champion_team_id: FRANCE,
      runner_up_team_id: null,
      third_place_team_id: null,
    })
    expect(podium.champion).toBe(FRANCE)   // override
    expect(podium.runnerUp).toBe(ARGENTINA) // still derived
    expect(podium.thirdPlace).toBe(ENGLAND)
    expect(podium.source).toBe('mixed')
  })

  it('awards nothing while the final is still in progress', () => {
    const podium = resolveActualPodium(tailMatches({ finalCompleted: false }), null)
    expect(podium.champion).toBeNull()
    expect(podium.runnerUp).toBeNull()
    expect(podium.thirdPlace).toBe(ENGLAND) // third-place match already done
  })

  it('returns an all-null "none" podium for a tournament with no completed final', () => {
    expect(resolveActualPodium([], null)).toEqual({
      champion: null, runnerUp: null, thirdPlace: null, source: 'none',
    })
  })
})

// =============================================================
// resolveEntryPodiumPick — progressive (RC-1, RC-5, RC-6)
// =============================================================

describe('resolveEntryPodiumPick — progressive', () => {
  it('reads the podium from the REAL final pick, not the cascaded bracket', () => {
    // The exact production failure (entry "MQuintero", pool a2cd55c7…):
    // their earlier picks cascade to a France-vs-Argentina final, but they
    // picked Spain 2-1 in the ACTUAL final. They were paid a match-winner
    // bonus for Spain and denied the champion bonus for Spain, same write.
    const podium = resolveEntryPodiumPick({
      mode: 'progressive',
      matches: tailMatches(),
      predictionMap: preds([[FINAL, 2, 1], [THIRD, 2, 1]]),
      predictedBracket: bracketStub({ champion: FRANCE, runnerUp: ARGENTINA, thirdPlace: FRANCE }),
      actualKnockoutTeamMap: ACTUAL_KO,
    })
    expect(podium.champion?.team_id).toBe(SPAIN)
    expect(podium.runnerUp?.team_id).toBe(ARGENTINA)
    expect(podium.thirdPlace?.team_id).toBe(FRANCE)
  })

  it('returns nothing for all three positions when no final was predicted', () => {
    // RC-5: the old inverted comparison assigned the HOME team as runner-up
    // here, which would have told 953 progressive members they "picked" Spain.
    const podium = resolveEntryPodiumPick({
      mode: 'progressive',
      matches: tailMatches(),
      predictionMap: preds([]),
      predictedBracket: bracketStub({ champion: FRANCE, runnerUp: ARGENTINA, thirdPlace: FRANCE }),
      actualKnockoutTeamMap: ACTUAL_KO,
    })
    expect(podium.champion).toBeNull()
    expect(podium.runnerUp).toBeNull()
    expect(podium.thirdPlace).toBeNull()
  })

  it('does not invent a pick from FIFA ranking on a drawn prediction', () => {
    // RC-6: a 1-1 final with no shootout and no explicit winner is not a pick.
    // Argentina outranks Spain in this fixture, so the old fallback would have
    // claimed the member picked Argentina.
    const podium = resolveEntryPodiumPick({
      mode: 'progressive',
      matches: tailMatches(),
      predictionMap: preds([[FINAL, 1, 1]]),
      predictedBracket: bracketStub({ champion: null, runnerUp: null, thirdPlace: null }),
      actualKnockoutTeamMap: ACTUAL_KO,
    })
    expect(podium.champion).toBeNull()
    expect(podium.runnerUp).toBeNull()
  })

  it('honours an explicit winner pick on a drawn scoreline', () => {
    const podium = resolveEntryPodiumPick({
      mode: 'progressive',
      matches: tailMatches(),
      predictionMap: preds([[FINAL, 1, 1, SPAIN]]),
      predictedBracket: bracketStub({ champion: null, runnerUp: null, thirdPlace: null }),
      actualKnockoutTeamMap: ACTUAL_KO,
    })
    expect(podium.champion?.team_id).toBe(SPAIN)
    expect(podium.runnerUp?.team_id).toBe(ARGENTINA)
  })
})

// =============================================================
// resolveEntryPodiumPick — full_tournament + bracket_picker
// =============================================================

describe('resolveEntryPodiumPick — full_tournament', () => {
  it('treats the member\'s own bracket as their stated podium', () => {
    // PRODUCT CONTRACT (deliberate, decided 2026-07-20): in full_tournament the
    // member fills in a whole bracket, so the cascade IS their podium. A
    // scoreline typed against the real final must NOT be reinterpreted as a
    // pick between the real finalists — that is what progressive means, not this.
    const podium = resolveEntryPodiumPick({
      mode: 'full_tournament',
      matches: tailMatches(),
      // Member's bracket has France beating Argentina; they typed 2-1 on the
      // final, which in their bracket means France.
      predictionMap: preds([[FINAL, 2, 1]]),
      predictedBracket: bracketStub(
        { champion: FRANCE, runnerUp: ARGENTINA, thirdPlace: ENGLAND },
        knockoutMap([[104, FRANCE, ARGENTINA], [103, SPAIN, ENGLAND]], ALL_TEAMS)
      ),
    })
    expect(podium.champion?.team_id).toBe(FRANCE)
    expect(podium.runnerUp?.team_id).toBe(ARGENTINA)
    expect(podium.thirdPlace?.team_id).toBe(ENGLAND)
  })

  it('awards nothing when the member never built a podium', () => {
    const podium = resolveEntryPodiumPick({
      mode: 'full_tournament',
      matches: tailMatches(),
      predictionMap: preds([]),
      predictedBracket: bracketStub({ champion: null, runnerUp: null, thirdPlace: null }),
    })
    expect(podium).toEqual({ champion: null, runnerUp: null, thirdPlace: null })
  })

  it('yields no podium from the real resolver when the bracket never resolved', () => {
    // Run against resolvePredictedBracket rather than a stub. With no group
    // predictions the knockout tree cannot cascade, so full_tournament must
    // return an empty podium and earn nothing — even though the member typed a
    // scoreline into the final. Under the old code the fallback would have read
    // that scoreline over the REAL Spain-Argentina pairing and credited them
    // with Spain, which is progressive semantics leaking into the wrong mode.
    const matches = tailMatches()
    const predictionMap = preds([[FINAL, 3, 0], [THIRD, 0, 2]])
    const bracket = resolvePredictedBracket({ matches: matches as any, predictionMap, teams: ALL_TEAMS })
    const podium = resolveEntryPodiumPick({
      mode: 'full_tournament',
      matches: matches as any,
      predictionMap,
      predictedBracket: bracket,
    })
    expect(podium.champion).toBeNull()
    expect(podium.runnerUp).toBeNull()
    expect(podium.thirdPlace).toBeNull()
  })
})

describe('resolveEntryPodiumPick — bracket_picker', () => {
  it('never derives a podium from match predictions', () => {
    // bracket_picker picks live in bracket_picker_knockout_picks and are scored
    // by lib/bracketPickerScoring. Deriving here would double-count.
    const podium = resolveEntryPodiumPick({
      mode: 'bracket_picker',
      matches: tailMatches(),
      predictionMap: preds([[FINAL, 2, 1]]),
      predictedBracket: bracketStub({ champion: SPAIN, runnerUp: ARGENTINA, thirdPlace: ENGLAND }),
      actualKnockoutTeamMap: ACTUAL_KO,
    })
    expect(podium).toEqual({ champion: null, runnerUp: null, thirdPlace: null })
  })
})
