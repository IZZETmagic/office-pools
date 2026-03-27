'use client'

import { useState, useMemo } from 'react'
import { ResultsView } from './results/ResultsView'
import type { ResultMatch } from './results/MatchCard'
import type { PoolSettings } from './results/points'
import type { MatchData, TeamData, ExistingPrediction, EntryData, MemberData, PredictionData, BonusScoreData, MatchScoreData } from './types'
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
  predictionMode: 'full_tournament' | 'progressive' | 'bracket_picker'
  // Group standings comparison props
  teams: TeamData[]
  conductData: MatchConductData[]
  userPredictions: ExistingPrediction[]
  bonusScores: BonusScoreData[]
  isAdmin: boolean
  members: MemberData[]
  allPredictions: PredictionData[]
  matchScores: MatchScoreData[]
  currentEntryId: string
  userEntries: EntryData[]
}

export function ResultsTab({
  matches,
  predictions: initialPredictions,
  poolSettings,
  predictionMode,
  teams,
  conductData,
  userPredictions: initialUserPredictions,
  bonusScores,
  isAdmin,
  members,
  allPredictions,
  matchScores,
  currentEntryId,
  userEntries,
}: ResultsTabProps) {
  const [selectedEntryId, setSelectedEntryId] = useState(currentEntryId)
  const showEntrySelector = userEntries.length > 1

  // Check if selected entry has been submitted
  const selectedEntry = userEntries.find(e => e.entry_id === selectedEntryId)
  const isEntrySubmitted = selectedEntry?.has_submitted_predictions ?? false

  // Derive predictions for the selected entry (empty if not submitted)
  const predictions = useMemo(() => {
    if (!isEntrySubmitted) return []
    if (selectedEntryId === currentEntryId) return initialPredictions
    // Rebuild from allPredictions for a different entry
    return allPredictions
      .filter(p => p.entry_id === selectedEntryId)
      .map(p => ({
        match_id: p.match_id,
        predicted_home_score: p.predicted_home_score,
        predicted_away_score: p.predicted_away_score,
        predicted_home_pso: p.predicted_home_pso,
        predicted_away_pso: p.predicted_away_pso,
        predicted_winner_team_id: p.predicted_winner_team_id,
      }))
  }, [selectedEntryId, currentEntryId, initialPredictions, allPredictions, isEntrySubmitted])

  // Derive userPredictions (ExistingPrediction[]) for the selected entry (empty if not submitted)
  const userPredictions = useMemo(() => {
    if (!isEntrySubmitted) return []
    if (selectedEntryId === currentEntryId) return initialUserPredictions
    return allPredictions
      .filter(p => p.entry_id === selectedEntryId)
      .map(p => ({
        match_id: p.match_id,
        predicted_home_score: p.predicted_home_score,
        predicted_away_score: p.predicted_away_score,
        predicted_home_pso: p.predicted_home_pso,
        predicted_away_pso: p.predicted_away_pso,
        predicted_winner_team_id: p.predicted_winner_team_id,
        prediction_id: p.prediction_id,
      }))
  }, [selectedEntryId, currentEntryId, initialUserPredictions, allPredictions, isEntrySubmitted])

  const activeEntryId = selectedEntryId || currentEntryId

  // Filter match_scores and bonus_scores for the selected entry
  const entryMatchScores = useMemo(() =>
    matchScores.filter(ms => ms.entry_id === activeEntryId),
    [matchScores, activeEntryId]
  )
  const entryBonusScores = useMemo(() =>
    bonusScores.filter(bs => bs.entry_id === activeEntryId),
    [bonusScores, activeEntryId]
  )
  const currentEntry = userEntries.find(e => e.entry_id === activeEntryId)

  // Build prediction lookup (memoized so downstream useMemos react to entry changes)
  const predictionMap = useMemo(
    () => new Map(predictions.map((p) => [p.match_id, p])),
    [predictions]
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
      home_team: m.home_team ? { country_name: m.home_team.country_name, flag_url: m.home_team.flag_url ?? null } : null,
      away_team: m.away_team ? { country_name: m.away_team.country_name, flag_url: m.away_team.flag_url ?? null } : null,
    }))

    const bracket = resolveFullBracket({
      matches: bracketMatches,
      predictionMap: bracketPredictionMap,
      teams,
      conductData,
    })
    return bracket.knockoutTeamMap
  }, [matches, bracketPredictionMap, teams, conductData])

  // Transform MatchData[] into ResultMatch[] (re-derives when predictions/entry changes)
  const resultMatches: ResultMatch[] = useMemo(() => matches.map((m) => {
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
      home_team: m.home_team ? { country_name: m.home_team.country_name, country_code: m.home_team.country_code, flag_url: m.home_team.flag_url } : null,
      away_team: m.away_team ? { country_name: m.away_team.country_name, country_code: m.away_team.country_code, flag_url: m.away_team.flag_url } : null,
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
      predicted_home_team_id: resolved?.home?.team_id ?? null,
      predicted_away_team_id: resolved?.away?.team_id ?? null,
    }
  }), [matches, predictionMap, knockoutTeamMap])

  if (resultMatches.length === 0) {
    return (
      <div className="bg-surface rounded-xl shadow p-8 text-center">
        <p className="text-neutral-600">No matches available for this tournament yet.</p>
      </div>
    )
  }

  return (
    <ResultsView
      matches={resultMatches}
      poolSettings={poolSettings}
      predictionMode={predictionMode}
      // Group standings comparison props
      rawMatches={matches}
      teams={teams}
      conductData={conductData}
      userPredictions={userPredictions}
      bonusScores={entryBonusScores}
      currentEntryId={activeEntryId}
      // Stored scoring data
      entryMatchScores={entryMatchScores}
      currentEntry={currentEntry}
      // Entry selector
      userEntries={showEntrySelector ? userEntries : undefined}
      selectedEntryId={selectedEntryId}
      onEntryChange={setSelectedEntryId}
    />
  )
}
