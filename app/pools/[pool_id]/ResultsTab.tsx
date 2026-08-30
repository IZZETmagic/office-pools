'use client'

import { useState, useMemo, useEffect } from 'react'
import { ResultsView } from './results/ResultsView'
import type { ResultMatch } from './results/MatchCard'
import type { PoolSettings } from './results/points'
import type { MatchData, TeamData, ExistingPrediction, EntryData, MemberData, PredictionData, BonusScoreData, MatchScoreData } from './types'
import type { MatchConductData, ScoreEntry } from '@/lib/tournament'
import { resolvePredictedBracket } from '@/lib/bracketResolver'

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
  /** Needed to fetch another entry's match scores when the selector changes. */
  poolId: string
  /**
   * League pools never set `pool_entries.has_submitted_predictions` — that
   * column is one of only two doors from a league entry into the World Cup
   * scoring selectors, so the league write path is forbidden from touching it.
   * Submission has to be derived from the picks themselves instead.
   */
  isLeaguePool?: boolean
  /**
   * A Results-depth league pick is a TAP, and taps travel beside scorelines
   * rather than inside them — `PredictionData` requires non-null scores, and
   * encoding home/draw/away as 1-0/0-0/0-1 would show a member a prediction
   * they never made.
   *
   * `ownLeagueOutcomes` is the viewer's own entry, loaded with the page.
   * `allLeagueOutcomes` is everyone else's, and arrives from the bulk route
   * ALREADY REVEAL-GATED — a matchweek still open is not in it.
   */
  ownLeagueOutcomes?: Map<string, 'home' | 'draw' | 'away'>
  allLeagueOutcomes?: Array<{ entry_id: string; match_id: string; outcome: 'home' | 'draw' | 'away' }>
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
  poolId,
  isLeaguePool = false,
  ownLeagueOutcomes,
  allLeagueOutcomes,
}: ResultsTabProps) {
  const [selectedEntryId, setSelectedEntryId] = useState(currentEntryId)
  const showEntrySelector = userEntries.length > 1

  // Check if selected entry has been submitted
  const selectedEntry = userEntries.find(e => e.entry_id === selectedEntryId)
  // ⚠ For a LEAGUE pool the flag is permanently false — by design, not by
  // omission — so reading it alone returned an empty results screen for every
  // league entry, the member's own included. Derived from the picks instead,
  // which is what `deriveRoundSubmissions` already does for the matchweek
  // headers.
  // Which side of the pick this entry made, for a Results-depth pool. Own
  // entry reads the map the page already loaded; any other entry reads the
  // reveal-gated array from the bulk route.
  const outcomeByMatch = useMemo(() => {
    if (selectedEntryId === currentEntryId) {
      return ownLeagueOutcomes ?? new Map<string, 'home' | 'draw' | 'away'>()
    }
    const m = new Map<string, 'home' | 'draw' | 'away'>()
    for (const o of allLeagueOutcomes ?? []) {
      if (o.entry_id === selectedEntryId) m.set(o.match_id, o.outcome)
    }
    return m
  }, [selectedEntryId, currentEntryId, ownLeagueOutcomes, allLeagueOutcomes])

  const hasAnyPick = useMemo(
    () =>
      allPredictions.some((p) => p.entry_id === selectedEntryId) ||
      // A Results pool has NO scoreline rows at all, so counting only those
      // would call every one of its entries unsubmitted.
      outcomeByMatch.size > 0 ||
      (allLeagueOutcomes ?? []).some((o) => o.entry_id === selectedEntryId),
    [allPredictions, allLeagueOutcomes, outcomeByMatch, selectedEntryId],
  )
  const isEntrySubmitted =
    (selectedEntry?.has_submitted_predictions ?? false) || (isLeaguePool && hasAnyPick)

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

  /**
   * Match scores for an entry other than the one PoolDetail loaded.
   *
   * `matchScores` holds the wide 22-column rows for PoolDetail's active entry
   * ONLY — it is fetched per entry precisely because shipping every entry's
   * rows doubled the pool payload. Predictions and bonus scores arrive
   * pool-wide, so those just filter; match scores cannot. Without this, picking
   * a second entry filtered the first entry's rows by an id they do not carry
   * and came back empty: no points, and an empty Result column, on an entry
   * that has 104 scored rows in the database.
   */
  const [otherEntryScores, setOtherEntryScores] = useState<MatchScoreData[]>([])
  useEffect(() => {
    // No eager clear on the early return: the memo below filters by
    // activeEntryId, so rows left over from a previously viewed entry match
    // nothing and the view is empty until the fetch lands. Clearing here would
    // be a synchronous setState in an effect for no gain.
    if (!selectedEntryId || selectedEntryId === currentEntryId) return
    let cancelled = false
    fetch(`/api/pools/${poolId}/entries/${selectedEntryId}/match-scores`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { scores: [] }))
      .then(d => { if (!cancelled) setOtherEntryScores(d.scores ?? []) })
      .catch(() => { if (!cancelled) setOtherEntryScores([]) })
    return () => { cancelled = true }
  }, [poolId, selectedEntryId, currentEntryId])

  // Filter match_scores and bonus_scores for the selected entry
  const entryMatchScores = useMemo(() => {
    const source = selectedEntryId === currentEntryId ? matchScores : otherEntryScores
    return source.filter(ms => ms.entry_id === activeEntryId)
  }, [matchScores, otherEntryScores, selectedEntryId, currentEntryId, activeEntryId])
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

    const bracket = resolvePredictedBracket({
      matches: bracketMatches,
      predictionMap: bracketPredictionMap,
      teams,
    })
    return bracket.knockoutTeamMap
  }, [matches, bracketPredictionMap, teams])

  // Transform MatchData[] into ResultMatch[] (re-derives when predictions/entry changes)
  const resultMatches: ResultMatch[] = useMemo(() => matches.map((m) => {
    const resolved = knockoutTeamMap.get(m.match_number)
    return {
      match_id: m.match_id,
      match_number: m.match_number,
      stage: m.stage,
      group_letter: m.group_letter,
      // The MATCHWEEK. Without it the Results list has nothing to name a league
      // fixture by and falls back to the raw `regular_season` enum.
      round_number: m.round_number ?? null,
      match_date: m.match_date,
      venue: m.venue,
      status: m.status,
      status_detail: m.status_detail,
      original_match_date: m.original_match_date,
      live_minute: m.live_minute,
      live_period: m.live_period,
      live_added: m.live_added,
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
      predicted_outcome: outcomeByMatch.get(m.match_id) ?? null,
      predicted_home_team_name: resolved?.home?.country_name ?? null,
      predicted_away_team_name: resolved?.away?.country_name ?? null,
      predicted_home_team_id: resolved?.home?.team_id ?? null,
      predicted_away_team_id: resolved?.away?.team_id ?? null,
    }
  }), [outcomeByMatch, matches, predictionMap, knockoutTeamMap])

  if (resultMatches.length === 0) {
    return (
      <div className="bg-surface rounded-card shadow-card p-8 text-center">
        <p className="t-body text-muted">No matches available for this tournament yet.</p>
      </div>
    )
  }

  return (
    <ResultsView
      matches={resultMatches}
      poolSettings={poolSettings}
      predictionMode={predictionMode}
      isLeague={isLeaguePool}
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
