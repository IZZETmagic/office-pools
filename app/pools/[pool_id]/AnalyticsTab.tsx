'use client'

import { useState, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { MatchData, PredictionData, TeamData, MemberData, EntryData, MatchScoreNarrow, BPGroupRanking, BPThirdPlaceRanking, BPKnockoutPick, EntryStatsData } from './types'
import type { MatchConductData, GroupStanding, Team, PredictionMap } from '@/lib/tournament'
import { calculateGroupStandings, rankThirdPlaceTeams, GROUP_LETTERS } from '@/lib/tournament'
import {
  matchScoresToPredictionResults,
  applyCrowdOverlay,
  crowdConsensusFromAggregate,
  poolWideStatsFromAggregate,
  computeStreaks,
} from './analytics/analyticsHelpers'
import type { MatchPredictionAggregate } from './analytics/analyticsHelpers'
import { computeFullXPBreakdown } from './analytics/xpSystem'
import { computeFullBPXPBreakdown, computeBPPoolComparison } from './analytics/bracketPickerXpSystem'
import { XPProgressSection, PoolWideStatsSection } from './analytics/XPProgressSection'
import { BPXPProgressSection } from './analytics/BPXPProgressSection'
import type { MatchWithResult } from '@/lib/bracketPickerScoring'

// =============================================
// TYPES
// =============================================

type AnalyticsTabProps = {
  poolId: string
  matches: MatchData[]
  members: MemberData[]
  teams: TeamData[]
  conductData: MatchConductData[]
  userEntries: EntryData[]
  currentEntryId: string
  /** Precomputed per-entry rows. Only `highest_level_reached` is read here — the
   *  rest of this tab still computes live, because it shows the XP BREAKDOWN
   *  (which events earned what), not just the total. */
  entryStats: EntryStatsData[]
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
      <h3 className="t-section-header text-ink">{title}</h3>
      <div className="flex-1 h-px bg-gradient-to-r from-neutral-200 dark:from-neutral-700 to-transparent" />
    </div>
  )
}

// =============================================
// COMPONENT
// =============================================

export function AnalyticsTab({
  poolId,
  matches,
  members,
  teams,
  conductData,
  userEntries,
  currentEntryId,
  entryStats,
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

  // ---------------------------------------------------------------------------
  // This tab used to receive every prediction and every score row in the pool
  // (26,770 rows on the largest) and filter them down to ONE entry, plus compute
  // the crowd split itself. It needs exactly three things, all small:
  //   1. the pool-wide crowd aggregate — 104 counted rows, from /crowd
  //   2. the selected entry's own picks
  //   3. the selected entry's own score rows
  // 2 and 3 are always the viewer's OWN entries (the selector only lists those),
  // so no reveal gate applies.
  // ---------------------------------------------------------------------------
  const [crowdAggregate, setCrowdAggregate] = useState<MatchPredictionAggregate[]>([])
  const [entryPredictions, setEntryPredictions] = useState<PredictionData[]>([])
  const [entryMatchScores, setEntryMatchScores] = useState<MatchScoreNarrow[]>([])
  // Which entry the fetched rows belong to. Derived rather than a separate
  // `loading` flag, so switching entries can never show the PREVIOUS entry's
  // numbers under the new entry's name while the fetch is in flight.
  const [loadedForEntry, setLoadedForEntry] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/pools/${poolId}/crowd`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { aggregate: [] }))
      .then(d => { if (!cancelled) setCrowdAggregate(d.aggregate ?? []) })
      .catch(() => { if (!cancelled) setCrowdAggregate([]) })
    return () => { cancelled = true }
  }, [poolId])

  useEffect(() => {
    if (!selectedEntryId) return
    let cancelled = false
    Promise.all([
      fetch(`/api/pools/${poolId}/entries/${selectedEntryId}/predictions`, { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : { predictions: [] })).catch(() => ({ predictions: [] })),
      fetch(`/api/pools/${poolId}/entries/${selectedEntryId}/match-scores`, { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : { scores: [] })).catch(() => ({ scores: [] })),
    ]).then(([preds, scores]) => {
      if (cancelled) return
      setEntryPredictions(preds.predictions ?? [])
      setEntryMatchScores(scores.scores ?? [])
      setLoadedForEntry(selectedEntryId)
    })
    return () => { cancelled = true }
  }, [poolId, selectedEntryId])

  // Check if selected entry has been submitted
  const selectedEntry = userEntries.find(e => e.entry_id === selectedEntryId)
  const isEntrySubmitted = selectedEntry?.has_submitted_predictions ?? false

  // Check for completed matches
  const completedMatches = useMemo(
    () => matches.filter(m => m.is_completed && m.home_score_ft !== null && m.away_score_ft !== null),
    [matches]
  )

  const isBracketPicker = predictionMode === 'bracket_picker'
  const entryDataLoading = Boolean(selectedEntryId) && loadedForEntry !== selectedEntryId

  // =============================================
  // COMPUTED ANALYTICS (memoized)
  // =============================================

  const predictionResults = useMemo(() => {
    if (isBracketPicker || !isEntrySubmitted || entryMatchScores.length === 0) return []
    return matchScoresToPredictionResults(entryMatchScores)
  }, [entryMatchScores, isBracketPicker, isEntrySubmitted])

  // Streaks
  const streaks = useMemo(
    () => computeStreaks(predictionResults),
    [predictionResults]
  )

  // Crowd comparison — the consensus half is counted in the database; only the
  // overlay (was I contrarian? was I right?) is per-entry.
  const crowdData = useMemo(
    () => applyCrowdOverlay(crowdConsensusFromAggregate(matches, crowdAggregate), entryPredictions),
    [matches, crowdAggregate, entryPredictions]
  )

  // Pool-wide stats — every field is a per-match count or a ratio of them.
  const poolStats = useMemo(
    () => poolWideStatsFromAggregate(
      matches,
      crowdAggregate,
      members.reduce((n, m) => n + (m.entries?.length || 0), 0),
    ),
    [matches, crowdAggregate, members]
  )

  // Permanently-earned badges (append-only badge_unlocks) for the selected
  // entry, so an earned badge never vanishes from the trophy grid when a later
  // recompute no longer re-derives it. Lazy client fetch (analytics isn't the
  // default tab); RLS lets pool members read their pools' unlocks.
  const [everEarnedBadgeIds, setEverEarnedBadgeIds] = useState<string[]>([])
  useEffect(() => {
    if (!selectedEntryId) { setEverEarnedBadgeIds([]); return }
    let cancelled = false
    ;(async () => {
      const { data } = await createClient()
        .from('badge_unlocks')
        .select('badge_id')
        .eq('entry_id', selectedEntryId)
      if (!cancelled) setEverEarnedBadgeIds((data ?? []).map(r => r.badge_id as string))
    })()
    return () => { cancelled = true }
  }, [selectedEntryId])

  // =============================================
  // XP SYSTEM (memoized) — Full Tournament & Progressive
  // =============================================

  // Level ratchet (migration 026). Without this the tab computes an UNFLOORED
  // level, so the same person could read Level 7 here and Level 8 on the
  // leaderboard — which reads the stored, floored value — and on mobile, whose
  // API route has always passed this. Same max(highest, current) the route uses.
  const everReachedLevel = useMemo(() => {
    const row = entryStats.find(e => e.entry_id === selectedEntryId)
    if (!row) return undefined
    return Math.max(row.highest_level_reached ?? 1, row.current_level ?? 1)
  }, [entryStats, selectedEntryId])

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
      everEarnedBadgeIds,
      everReachedLevel,
    })
  }, [predictionResults, matches, crowdData, streaks, entryPredictions, isBracketPicker, isEntrySubmitted, selectedEntry, everEarnedBadgeIds, everReachedLevel])

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
      everEarnedBadgeIds,
    })
  }, [
    isBracketPicker, isEntrySubmitted, selectedBPGroupRankings, selectedBPThirdPlaceRankings,
    selectedBPKnockoutPicks, actualGroupStandings, actualRankedThirds, bpCompletedMatches,
    matches, teams, completedMatches, selectedEntry, poolCreatedAt, everEarnedBadgeIds,
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

  // The entry's own picks and score rows are fetched rather than filtered out of
  // a pool-wide array now, so wait for them. Without this the tab would render a
  // full set of zeroed sections for a moment — which reads as "you have no data"
  // to someone who knows they played.
  if (entryDataLoading && !isBracketPicker) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (completedMatches.length === 0) {
    return (
      <div className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default p-8 text-center">
        <div className="text-4xl mb-3">
          <svg className="w-12 h-12 mx-auto text-neutral-300 dark:text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-ink mb-1">
          Analytics Coming Soon
        </h3>
        <p className="text-sm text-muted">
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
          <label className="text-sm text-muted">Viewing:</label>
          <select
            value={selectedEntryId}
            onChange={e => setSelectedEntryId(e.target.value)}
            className="text-sm bg-surface border border-neutral-300 dark:border-neutral-600 rounded-chip px-3 py-1.5 text-ink focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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
        <div className="bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-control p-4">
          <p className="text-sm text-warning-800 dark:text-warning-300">
            Submit your predictions to see your XP progression, accuracy breakdown, streaks, and crowd comparison.
            Pool-wide stats are shown below.
          </p>
        </div>
      )}

      {/* Bracket picker: not submitted warning */}
      {isBracketPicker && !isEntrySubmitted && (
        <div className="bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800 rounded-control p-4">
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
