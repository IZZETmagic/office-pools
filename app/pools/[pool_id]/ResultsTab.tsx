'use client'

import { useMemo } from 'react'
import { ResultsView } from './results/ResultsView'
import type { ResultMatch } from './results/MatchCard'
import type { PoolSettings } from './results/points'
import type { MatchData, TeamData, ExistingPrediction, MemberData, PredictionData, BonusScoreData } from './types'
import type { MatchConductData, ScoreEntry } from '@/lib/tournament'
import { resolveFullBracket } from '@/lib/bracketResolver'

type ResultsTabProps = {
  matches: MatchData[]
  predictions: {
    match_id: string
    predicted_home_score: number
    predicted_away_score: number
    predicted_home_pso: number | null
    predicted_away_pso: number | null
    predicted_winner_team_id: string | null
  }[]
  poolSettings: PoolSettings
  // Group standings comparison props
  teams: TeamData[]
  conductData: MatchConductData[]
  userPredictions: ExistingPrediction[]
  bonusScores: BonusScoreData[]
  isAdmin: boolean
  members: MemberData[]
  allPredictions: PredictionData[]
  currentMemberId: string
}

export function ResultsTab({
  matches,
  predictions,
  poolSettings,
  teams,
  conductData,
  userPredictions,
  bonusScores,
  isAdmin,
  members,
  allPredictions,
  currentMemberId,
}: ResultsTabProps) {
  // Build prediction lookup
  const predictionMap = new Map(
    predictions.map((p) => [p.match_id, p])
  )

  // Build PredictionMap (ScoreEntry format) for bracket resolver
  const bracketPredictionMap = useMemo(() => {
    const map = new Map<string, ScoreEntry>()
    for (const p of predictions) {
      map.set(p.match_id, {
        home: p.predicted_home_score,
        away: p.predicted_away_score,
        homePso: p.predicted_home_pso ?? null,
        awayPso: p.predicted_away_pso ?? null,
        winnerTeamId: p.predicted_winner_team_id ?? null,
      })
    }
    return map
  }, [predictions])

  // Resolve bracket to get predicted teams for knockout matches
  const knockoutTeamMap = useMemo(() => {
    // Adapt MatchData[] to Match[] for bracket resolver
    const bracketMatches = matches.map((m) => ({
      match_id: m.match_id,
      match_number: m.match_number,
      stage: m.stage,
      group_letter: m.group_letter,
      match_date: m.match_date,
      venue: m.venue,
      status: m.status,
      home_team_id: m.home_team_id,
      away_team_id: m.away_team_id,
      home_team_placeholder: m.home_team_placeholder,
      away_team_placeholder: m.away_team_placeholder,
      home_team: m.home_team ? { country_name: m.home_team.country_name, flag_url: null } : null,
      away_team: m.away_team ? { country_name: m.away_team.country_name, flag_url: null } : null,
    }))

    const bracket = resolveFullBracket({
      matches: bracketMatches,
      predictionMap: bracketPredictionMap,
      teams,
      conductData,
    })
    return bracket.knockoutTeamMap
  }, [matches, bracketPredictionMap, teams, conductData])

  // Transform MatchData[] into ResultMatch[]
  const resultMatches: ResultMatch[] = matches.map((m) => {
    const resolved = knockoutTeamMap.get(m.match_number)
    return {
      match_id: m.match_id,
      match_number: m.match_number,
      stage: m.stage,
      group_letter: m.group_letter,
      match_date: m.match_date,
      venue: m.venue,
      status: m.status,
      home_score_ft: m.home_score_ft,
      away_score_ft: m.away_score_ft,
      home_score_pso: m.home_score_pso,
      away_score_pso: m.away_score_pso,
      home_team_placeholder: m.home_team_placeholder,
      away_team_placeholder: m.away_team_placeholder,
      home_team_id: m.home_team_id,
      away_team_id: m.away_team_id,
      home_team: m.home_team ? { country_name: m.home_team.country_name, country_code: '' } : null,
      away_team: m.away_team ? { country_name: m.away_team.country_name, country_code: '' } : null,
      prediction: predictionMap.has(m.match_id)
        ? {
            predicted_home_score: predictionMap.get(m.match_id)!.predicted_home_score,
            predicted_away_score: predictionMap.get(m.match_id)!.predicted_away_score,
            predicted_home_pso: predictionMap.get(m.match_id)!.predicted_home_pso ?? null,
            predicted_away_pso: predictionMap.get(m.match_id)!.predicted_away_pso ?? null,
            predicted_winner_team_id: predictionMap.get(m.match_id)!.predicted_winner_team_id ?? null,
          }
        : null,
      predicted_home_team_name: resolved?.home?.country_name ?? null,
      predicted_away_team_name: resolved?.away?.country_name ?? null,
    }
  })

  if (resultMatches.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <p className="text-neutral-600">No matches available for this tournament yet.</p>
      </div>
    )
  }

  return (
    <ResultsView
      matches={resultMatches}
      poolSettings={poolSettings}
      // Group standings comparison props
      rawMatches={matches}
      teams={teams}
      conductData={conductData}
      userPredictions={userPredictions}
      bonusScores={bonusScores}
      isAdmin={isAdmin}
      members={members}
      allPredictions={allPredictions}
      currentMemberId={currentMemberId}
    />
  )
}
