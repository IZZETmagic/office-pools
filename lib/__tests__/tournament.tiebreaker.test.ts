// =============================================================
// Group tiebreaker order — regression lock for the knockout
// tie-break scoring bug (ROADMAP "Now" #1).
// =============================================================
// Two properties this pins down:
//
//   Defect B — FIFA order. Within a group, teams level on points are
//   separated by OVERALL goal difference / goals-for BEFORE head-to-head
//   (FIFA World Cup rules), not head-to-head first (UEFA rules, which the
//   code used to apply). A team that lost the H2H but has the better
//   overall GD must rank higher.
//
//   Defect A — conduct is actual-only. Fair-play/conduct is a tiebreaker
//   ONLY when real card data is supplied. A prediction-derived table (no
//   conduct) must resolve deterministically via FIFA ranking, so display,
//   scoring, and bonuses agree once callers stop passing conduct into a
//   predicted bracket.
// =============================================================

import { describe, it, expect } from 'vitest'
import {
  calculateGroupStandings,
  type Match,
  type Team,
  type PredictionMap,
  type MatchConductData,
} from '@/lib/tournament'

// ----- minimal fixture factories (only the fields the resolver reads) -----

function mkTeam(id: string, fifa: number, group = 'A'): Team {
  return {
    team_id: id,
    country_name: id,
    country_code: id,
    group_letter: group,
    fifa_ranking_points: fifa,
    flag_url: null,
  }
}

function mkMatch(id: string, home: string, away: string, group = 'A'): Match {
  return {
    match_id: id,
    match_number: 0,
    stage: 'group',
    group_letter: group,
    match_date: '2026-06-01T00:00:00Z',
    venue: null,
    status: 'scheduled',
    home_team_id: home,
    away_team_id: away,
    home_team_placeholder: null,
    away_team_placeholder: null,
    home_team: null,
    away_team: null,
  }
}

/** Build a PredictionMap from [matchId, home, away] tuples. */
function preds(rows: Array<[string, number, number]>): PredictionMap {
  const m: PredictionMap = new Map()
  for (const [id, home, away] of rows) m.set(id, { home, away })
  return m
}

describe('group tiebreaker — FIFA order (Defect B)', () => {
  // T1 and T2 both finish on 6 pts. T2 beat T1 head-to-head, but T1 has the
  // far better overall goal difference (+7 vs +1). FIFA ranks T1 first;
  // the old UEFA-order code ranked T2 first.
  const teams = [
    mkTeam('T1', 1000), // lower FIFA rank + lost the H2H — should still win the group
    mkTeam('T2', 2000),
    mkTeam('T3', 500),
    mkTeam('T4', 400),
  ]
  const matches = [
    mkMatch('m1', 'T1', 'T2'),
    mkMatch('m2', 'T1', 'T3'),
    mkMatch('m3', 'T1', 'T4'),
    mkMatch('m4', 'T2', 'T3'),
    mkMatch('m5', 'T2', 'T4'),
    mkMatch('m6', 'T3', 'T4'),
  ]
  const predictions = preds([
    ['m1', 0, 1], // T2 beats T1 (head-to-head edge to T2)
    ['m2', 4, 0], // T1 big win
    ['m3', 4, 0], // T1 big win
    ['m4', 1, 0], // T2 win
    ['m5', 0, 1], // T4 beats T2
    ['m6', 0, 0], // draw
  ])

  it('ranks the better overall goal difference above the head-to-head winner', () => {
    const standings = calculateGroupStandings('A', matches, predictions, teams)

    expect(standings.map(s => s.team_id)).toEqual(['T1', 'T2', 'T4', 'T3'])
    // Sanity: the two are genuinely level on points, split only by GD.
    expect(standings[0].points).toBe(standings[1].points)
    expect(standings[0].goalDifference).toBeGreaterThan(standings[1].goalDifference)
  })
})

describe('group tiebreaker — conduct is actual-only (Defect A)', () => {
  // T1 and T2 are perfectly level through head-to-head (drew 1-1, identical
  // records vs T3/T4). Only conduct (7) then FIFA ranking (8) can separate them.
  const teams = [
    mkTeam('T1', 1800), // higher FIFA rank → wins the tie when no conduct is supplied
    mkTeam('T2', 1700),
    mkTeam('T3', 500),
    mkTeam('T4', 400),
  ]
  const matches = [
    mkMatch('n1', 'T1', 'T2'),
    mkMatch('n2', 'T1', 'T3'),
    mkMatch('n3', 'T2', 'T3'),
    mkMatch('n4', 'T1', 'T4'),
    mkMatch('n5', 'T2', 'T4'),
    mkMatch('n6', 'T3', 'T4'),
  ]
  const predictions = preds([
    ['n1', 1, 1], // draw — H2H dead level
    ['n2', 2, 1], // T1 beats T3
    ['n3', 2, 1], // T2 beats T3 (identical to T1's result)
    ['n4', 0, 0], // T1 draws T4
    ['n5', 0, 0], // T2 draws T4 (identical)
    ['n6', 0, 0],
  ])

  it('resolves a predicted table (no conduct) deterministically by FIFA ranking', () => {
    const standings = calculateGroupStandings('A', matches, predictions, teams)
    const [first, second] = standings
    expect(first.team_id).toBe('T1') // higher FIFA rank wins — cards never consulted
    expect(second.team_id).toBe('T2')
    // The pair is a perfect tie through criteria 1–6.
    expect(first.points).toBe(second.points)
    expect(first.goalDifference).toBe(second.goalDifference)
    expect(first.goalsFor).toBe(second.goalsFor)
  })

  it('lets real card data flip the order when conduct IS supplied', () => {
    // T1 picks up a straight red (4) + a yellow (1) → conductScore -5; T2 clean.
    const conduct: MatchConductData[] = [
      { match_id: 'n1', team_id: 'T1', yellow_cards: 1, indirect_red_cards: 0, direct_red_cards: 1, yellow_direct_red_cards: 0 },
    ]
    const standings = calculateGroupStandings('A', matches, predictions, teams, conduct)
    const [first, second] = standings
    expect(first.team_id).toBe('T2') // better fair-play now outranks T1's FIFA edge
    expect(second.team_id).toBe('T1')
  })
})
