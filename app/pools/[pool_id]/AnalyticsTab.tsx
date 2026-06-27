'use client'

import { useState, useMemo } from 'react'
import type { MatchData, PredictionData, TeamData, MemberData, EntryData, MatchScoreData, BPGroupRanking, BPThirdPlaceRanking, BPKnockoutPick } from './types'
import type { PoolSettings } from './results/points'
import type { MatchConductData, GroupStanding, Team, PredictionMap } from '@/lib/tournament'
import { calculateGroupStandings, rankThirdPlaceTeams, GROUP_LETTERS } from '@/lib/tournament'
import {
  matchScoresToPredictionResults,
  computeCrowdPredictions,
  computeStreaks,
  computePoolWideStats,
} from './analytics/analyticsHelpers'
import { computeFullXPBreakdown } from './analytics/xpSystem'
import { computeFullBPXPBreakdown, computeBPPoolComparison } from './analytics/bracketPickerXpSystem'
import { XPProgressSection, PoolWideStatsSection } from './analytics/XPProgressSection'
import { BPXPProgressSection } from './analytics/BPXPProgressSection'
import type { MatchWithResult } from '@/lib/bracketPickerScoring'

// =============================================
// TYPES
// =============================================

type AnalyticsTabProps = {
  matches: MatchData[]
  allPredictions: PredictionData[]
  matchScores: MatchScoreData[]
  members: MemberData[]
  teams: TeamData[]
  conductData: MatchConductData[]
  settings: PoolSettings
  userEntries: EntryData[]
  currentEntryId: string
  predictionMode: 'full_tournament' | 'progressive' | 'bracket_picker'
  // Bracket picker data
  bpGroupRankings?: BPGroupRanking[]
  bpThirdPlaceRankings?: BPThirdPlaceRanking[]
  bpKnockoutPicks?: BPKnockoutPick[]
  allBPGroupRankings?: BPGroupRanking[]
  allBPThirdPlaceRankings?: BPThirdPlaceRanking[]
  allBPKnockoutPicks?: BPKnockoutPick[]
  poolCreatedAt?: string
}

// =============================================
// SECTION HEADER
// =============================================

function SectionHeader({ emoji, title }: { emoji: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-xl">{emoji}</span>
      <h3 className="text-lg font-bold text-neutral-900 dark:text-white">{title}</h3>
      <div className="flex-1 h-px bg-gradient-to-r from-neutral-200 dark:from-neutral-700 to-transparent" />
    </div>
  )
}

// =============================================
// COMPONENT
// =============================================

export function AnalyticsTab({
  matches,
  allPredictions,
  matchScores,
  members,
  teams,
  conductData,
  settings,
  userEntries,
  currentEntryId,
  predictionMode,
  bpGroupRankings = [],
  bpThirdPlaceRankings = [],
  bpKnockoutPicks = [],
  allBPGroupRankings = [],
  allBPThirdPlaceRankings = [],
  allBPKnockoutPicks = [],
  poolCreatedAt = '',
}: AnalyticsTabProps) {
  const [selectedEntryId, setSelectedEntryId] = useState(currentEntryId)
  const showEntrySelector = userEntries.length > 1

  // Check if selected entry has been submitted
  const selectedEntry = userEntries.find(e => e.entry_id === selectedEntryId)
  const isEntrySubmitted = selectedEntry?.has_submitted_predictions ?? false

  // Get the selected entry's predictions
  const entryPredictions = useMemo(() => {
    if (!isEntrySubmitted) return []
    return allPredictions.filter(p => p.entry_id === selectedEntryId)
  }, [allPredictions, selectedEntryId, isEntrySubmitted])

  // Check for completed matches
  const completedMatches = useMemo(
    () => matches.filter(m => m.is_completed && m.home_score_ft !== null && m.away_score_ft !== null),
    [matches]
  )

  const isBracketPicker = predictionMode === 'bracket_picker'

  // Pre-tournament: no matches have been scored yet. Instead of bailing to a
  // single "coming soon" card (web's old behaviour), we mirror the mobile app
  // and render the full Form skeleton with zeroed "holding" values + copy that
  // explains what will populate once results land.
  const preTournament = completedMatches.length === 0

  // =============================================
  // COMPUTED ANALYTICS (memoized)
  // =============================================

  // Per-entry prediction results from stored match_scores (single source of truth)
  const entryMatchScores = useMemo(() =>
    matchScores.filter(ms => ms.entry_id === selectedEntryId),
    [matchScores, selectedEntryId]
  )

  const predictionResults = useMemo(() => {
    if (isBracketPicker || !isEntrySubmitted || entryMatchScores.length === 0) return []
    return matchScoresToPredictionResults(entryMatchScores)
  }, [entryMatchScores, isBracketPicker, isEntrySubmitted])

  // Streaks
  const streaks = useMemo(
    () => computeStreaks(predictionResults),
    [predictionResults]
  )

  // Crowd comparison
  const crowdData = useMemo(
    () => computeCrowdPredictions(matches, allPredictions, entryPredictions, members),
    [matches, allPredictions, entryPredictions, members]
  )

  // Pool-wide stats
  const poolStats = useMemo(
    () => computePoolWideStats(matches, allPredictions, members, settings),
    [matches, allPredictions, members, settings]
  )

  // =============================================
  // XP SYSTEM (memoized) — Full Tournament & Progressive
  // =============================================

  const xpBreakdown = useMemo(() => {
    if (isBracketPicker) return null
    // Pre-tournament we always build the breakdown so the holding skeleton can
    // render (computeFullXPBreakdown returns Rookie / 0 XP for empty results).
    // Otherwise keep the original gating: only for submitted entries with scores.
    if (!preTournament && (!isEntrySubmitted || predictionResults.length === 0)) return null

    const entryRank = selectedEntry?.current_rank ?? null

    return computeFullXPBreakdown({
      predictionResults,
      matches,
      crowdData,
      streaks,
      entryPredictions,
      entryRank,
      totalMatches: matches.length,
    })
  }, [predictionResults, matches, crowdData, streaks, entryPredictions, isBracketPicker, isEntrySubmitted, selectedEntry, preTournament])

  // =============================================
  // BRACKET PICKER XP SYSTEM (memoized)
  // =============================================

  // Filter BP data for selected entry (supports multi-entry)
  const selectedBPGroupRankings = useMemo(() => {
    if (!isBracketPicker) return []
    // If the active entry matches the server-loaded data, use that
    if (selectedEntryId === currentEntryId) return bpGroupRankings
    return allBPGroupRankings.filter(r => r.entry_id === selectedEntryId)
  }, [isBracketPicker, selectedEntryId, currentEntryId, bpGroupRankings, allBPGroupRankings])

  const selectedBPThirdPlaceRankings = useMemo(() => {
    if (!isBracketPicker) return []
    if (selectedEntryId === currentEntryId) return bpThirdPlaceRankings
    return allBPThirdPlaceRankings.filter(r => r.entry_id === selectedEntryId)
  }, [isBracketPicker, selectedEntryId, currentEntryId, bpThirdPlaceRankings, allBPThirdPlaceRankings])

  const selectedBPKnockoutPicks = useMemo(() => {
    if (!isBracketPicker) return []
    if (selectedEntryId === currentEntryId) return bpKnockoutPicks
    return allBPKnockoutPicks.filter(r => r.entry_id === selectedEntryId)
  }, [isBracketPicker, selectedEntryId, currentEntryId, bpKnockoutPicks, allBPKnockoutPicks])

  // Compute actual group standings from match results
  const { actualGroupStandings, actualRankedThirds } = useMemo(() => {
    if (!isBracketPicker) {
      return { actualGroupStandings: new Map<string, GroupStanding[]>(), actualRankedThirds: [] as ReturnType<typeof rankThirdPlaceTeams> }
    }

    const actualScores: PredictionMap = new Map()
    for (const m of matches) {
      if (m.stage === 'group' && (m.is_completed || m.status === 'live') && m.home_score_ft !== null && m.away_score_ft !== null) {
        actualScores.set(m.match_id, { home: m.home_score_ft, away: m.away_score_ft })
      }
    }

    // Convert teams/matches to tournament lib format
    const tournamentTeams: Team[] = teams.map(t => ({
      team_id: t.team_id,
      country_name: t.country_name,
      country_code: t.country_code,
      group_letter: t.group_letter,
      fifa_ranking_points: t.fifa_ranking_points,
      flag_url: t.flag_url,
    }))

    const tournamentMatches = matches.map(m => ({
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

    const groupMatches = tournamentMatches.filter(m => m.stage === 'group')

    const standings = new Map<string, GroupStanding[]>()
    for (const letter of GROUP_LETTERS) {
      const gMatches = groupMatches.filter(m => m.group_letter === letter)
      standings.set(letter, calculateGroupStandings(letter, gMatches, actualScores, tournamentTeams, conductData))
    }

    const rankedThirds = rankThirdPlaceTeams(standings)
    return { actualGroupStandings: standings, actualRankedThirds: rankedThirds }
  }, [isBracketPicker, matches, teams, conductData])

  // Build completed matches for knockout scoring
  const bpCompletedMatches: MatchWithResult[] = useMemo(() => {
    if (!isBracketPicker) return []
    return matches
      .filter(m => m.stage !== 'group' && m.is_completed)
      .map(m => ({
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
        is_completed: m.is_completed,
        home_score_ft: m.home_score_ft,
        away_score_ft: m.away_score_ft,
        home_score_pso: m.home_score_pso,
        away_score_pso: m.away_score_pso,
        winner_team_id: m.winner_team_id,
      }))
  }, [isBracketPicker, matches])

  // Compute bracket picker XP breakdown
  const bpXpBreakdown = useMemo(() => {
    if (!isBracketPicker) return null
    // Pre-tournament we always build the breakdown so the holding skeleton can
    // render (computeFullBPXPBreakdown returns Rookie / 0 XP for empty inputs).
    // Otherwise keep the original gating: submitted + has picks + scored matches.
    if (!preTournament) {
      if (!isEntrySubmitted) return null
      if (selectedBPGroupRankings.length === 0 && selectedBPKnockoutPicks.length === 0) return null
      if (completedMatches.length === 0) return null
    }

    // Actual third-place qualifier team IDs (top 8 from ranked thirds)
    const actualThirdPlaceQualifierTeamIds = new Set(
      actualRankedThirds.slice(0, 8).map(t => t.team_id)
    )

    return computeFullBPXPBreakdown({
      groupRankings: selectedBPGroupRankings,
      thirdPlaceRankings: selectedBPThirdPlaceRankings,
      knockoutPicks: selectedBPKnockoutPicks,
      actualGroupStandings,
      actualThirdPlaceQualifierTeamIds,
      completedMatches: bpCompletedMatches,
      matches,
      teams,
      submittedAt: selectedEntry?.predictions_submitted_at ?? null,
      poolCreatedAt,
    })
  }, [
    isBracketPicker, isEntrySubmitted, selectedBPGroupRankings, selectedBPThirdPlaceRankings,
    selectedBPKnockoutPicks, actualGroupStandings, actualRankedThirds, bpCompletedMatches,
    matches, teams, completedMatches, selectedEntry, poolCreatedAt, preTournament,
  ])

  // =============================================
  // BRACKET PICKER POOL COMPARISON (memoized)
  // =============================================

  const bpPoolComparison = useMemo(() => {
    if (!isBracketPicker || !isEntrySubmitted || !bpXpBreakdown) return null

    const submittedEntryIds = new Set<string>()
    for (const member of members) {
      if (member.entries) {
        for (const entry of member.entries) {
          if (entry.has_submitted_predictions) submittedEntryIds.add(entry.entry_id)
        }
      }
    }

    if (submittedEntryIds.size < 2) return null

    return computeBPPoolComparison({
      userGroupRankings: selectedBPGroupRankings,
      userThirdPlaceRankings: selectedBPThirdPlaceRankings,
      userKnockoutPicks: selectedBPKnockoutPicks,
      allGroupRankings: allBPGroupRankings,
      allThirdPlaceRankings: allBPThirdPlaceRankings,
      allKnockoutPicks: allBPKnockoutPicks,
      actualGroupStandings,
      actualThirdPlaceQualifierTeamIds: new Set(actualRankedThirds.slice(0, 8).map(t => t.team_id)),
      completedKnockoutMatches: bpCompletedMatches,
      matches,
      submittedEntryIds,
    })
  }, [
    isBracketPicker, isEntrySubmitted, bpXpBreakdown, members,
    selectedBPGroupRankings, selectedBPThirdPlaceRankings, selectedBPKnockoutPicks,
    allBPGroupRankings, allBPThirdPlaceRankings, allBPKnockoutPicks,
    actualGroupStandings, actualRankedThirds, bpCompletedMatches, matches,
  ])

  // =============================================
  // RENDER
  // Pre-tournament renders the same skeleton with zeroed "holding" values
  // (see `preTournament` above) instead of bailing to an empty state.
  // =============================================

  return (
    <div className="space-y-8">
      {/* Entry Selector (for multi-entry pools) */}
      {showEntrySelector && (
        <div className="flex items-center justify-end gap-2">
          <label className="text-sm text-neutral-600 dark:text-neutral-400">Viewing:</label>
          <select
            value={selectedEntryId}
            onChange={e => setSelectedEntryId(e.target.value)}
            className="text-sm bg-surface border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-1.5 text-neutral-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            {userEntries.map(entry => (
              <option key={entry.entry_id} value={entry.entry_id}>
                {entry.entry_name || `Entry ${entry.entry_number}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Pre-tournament preview banner */}
      {preTournament && (
        <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-xl p-4">
          <p className="text-sm text-primary-800 dark:text-primary-300">
            The tournament hasn&apos;t kicked off yet — here&apos;s a preview of your Form. Levels, badges, streaks and stats fill in as matches are played.
          </p>
        </div>
      )}

      {/* Entry not submitted warning (only mid-tournament; pre-tournament we show
          the holding skeleton regardless of submission) */}
      {!preTournament && !isEntrySubmitted && !isBracketPicker && (
        <div className="bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-xl p-4">
          <p className="text-sm text-warning-800 dark:text-warning-300">
            Submit your predictions to see your XP progression, accuracy breakdown, streaks, and crowd comparison.
            Pool-wide stats are shown below.
          </p>
        </div>
      )}

      {/* Bracket picker: not submitted warning */}
      {!preTournament && isBracketPicker && !isEntrySubmitted && (
        <div className="bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-xl p-4">
          <p className="text-sm text-warning-800 dark:text-warning-300">
            Submit your bracket to see your XP progression, group accuracy, knockout picks, and badge progress.
            Pool-wide stats are shown below.
          </p>
        </div>
      )}

      {/* Section 0: XP Progress — Full Tournament & Progressive */}
      {xpBreakdown && (
        <div>
          <SectionHeader emoji="⚡" title="XP Progression" />
          <XPProgressSection xpBreakdown={xpBreakdown} streaks={streaks} crowdData={crowdData} poolStats={poolStats} entryPredictions={entryPredictions} predictionResults={predictionResults} preTournament={preTournament} />
        </div>
      )}

      {/* Section 0: XP Progress — Bracket Picker */}
      {bpXpBreakdown && (
        <div>
          <SectionHeader emoji="⚡" title="XP Progression" />
          <BPXPProgressSection bpXpBreakdown={bpXpBreakdown} teams={teams} bpPoolComparison={bpPoolComparison} preTournament={preTournament} />
        </div>
      )}

      {/* Pool-Wide Stats fallback (when no XP section renders) */}
      {!xpBreakdown && !bpXpBreakdown && (
        <div>
          <SectionHeader emoji="📊" title="Pool Stats" />
          <PoolWideStatsSection poolStats={poolStats} />
        </div>
      )}
    </div>
  )
}
