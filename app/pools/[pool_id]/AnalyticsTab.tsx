'use client'

import { useState, useMemo } from 'react'
import type { MatchData, PredictionData, TeamData, MemberData, EntryData, BPGroupRanking, BPThirdPlaceRanking, BPKnockoutPick } from './types'
import type { PoolSettings } from './results/points'
import type { MatchConductData, GroupStanding, Team, PredictionMap } from '@/lib/tournament'
import { calculateGroupStandings, rankThirdPlaceTeams, GROUP_LETTERS } from '@/lib/tournament'
import {
  computePredictionResults,
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

  // =============================================
  // COMPUTED ANALYTICS (memoized)
  // =============================================

  // Per-entry prediction results (only for non-bracket-picker modes)
  const predictionResults = useMemo(() => {
    if (isBracketPicker || !isEntrySubmitted || entryPredictions.length === 0) return []
    return computePredictionResults(matches, entryPredictions, settings, teams, conductData)
  }, [matches, entryPredictions, settings, teams, conductData, isBracketPicker, isEntrySubmitted])

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
    if (isBracketPicker || !isEntrySubmitted || predictionResults.length === 0) return null

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
  }, [predictionResults, matches, crowdData, streaks, entryPredictions, isBracketPicker, isEntrySubmitted, selectedEntry])

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
    if (!isBracketPicker || !isEntrySubmitted) return null
    if (selectedBPGroupRankings.length === 0 && selectedBPKnockoutPicks.length === 0) return null
    if (completedMatches.length === 0) return null

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
    matches, teams, completedMatches, selectedEntry, poolCreatedAt,
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
  // EMPTY STATE
  // =============================================

  if (completedMatches.length === 0) {
    return (
      <div className="bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default p-8 text-center">
        <div className="text-4xl mb-3">
          <svg className="w-12 h-12 mx-auto text-neutral-300 dark:text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-white mb-1">
          Analytics Coming Soon
        </h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Analytics will appear once matches start being played and results come in.
        </p>
      </div>
    )
  }

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

      {/* Entry not submitted warning */}
      {!isEntrySubmitted && !isBracketPicker && (
        <div className="bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-xl p-4">
          <p className="text-sm text-warning-800 dark:text-warning-300">
            Submit your predictions to see your XP progression, accuracy breakdown, streaks, and crowd comparison.
            Pool-wide stats are shown below.
          </p>
        </div>
      )}

      {/* Bracket picker: not submitted warning */}
      {isBracketPicker && !isEntrySubmitted && (
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
          <XPProgressSection xpBreakdown={xpBreakdown} streaks={streaks} crowdData={crowdData} poolStats={poolStats} entryPredictions={entryPredictions} predictionResults={predictionResults} />
        </div>
      )}

      {/* Section 0: XP Progress — Bracket Picker */}
      {bpXpBreakdown && (
        <div>
          <SectionHeader emoji="⚡" title="XP Progression" />
          <BPXPProgressSection bpXpBreakdown={bpXpBreakdown} teams={teams} bpPoolComparison={bpPoolComparison} />
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
