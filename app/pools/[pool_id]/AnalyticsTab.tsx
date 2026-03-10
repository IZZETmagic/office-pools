'use client'

import { useState, useMemo } from 'react'
import type { MatchData, PredictionData, TeamData, MemberData, EntryData } from './types'
import type { PoolSettings } from './results/points'
import type { MatchConductData } from '@/lib/tournament'
import {
  computePredictionResults,
  computeAccuracyByStage,
  computeOverallAccuracy,
  computeCrowdPredictions,
  computeStreaks,
  computePoolWideStats,
} from './analytics/analyticsHelpers'
import { AccuracySection } from './analytics/AccuracySection'
import { StreaksSection } from './analytics/StreaksSection'
import { CrowdSection } from './analytics/CrowdSection'
import { PoolStatsSection } from './analytics/PoolStatsSection'

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

  // Accuracy by stage
  const stageAccuracy = useMemo(
    () => computeAccuracyByStage(predictionResults),
    [predictionResults]
  )

  // Overall accuracy
  const overallAccuracy = useMemo(
    () => computeOverallAccuracy(predictionResults),
    [predictionResults]
  )

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
            Submit your predictions to see your personal accuracy breakdown, streaks, and crowd comparison.
            Pool-wide stats are shown below.
          </p>
        </div>
      )}

      {/* Bracket picker notice */}
      {isBracketPicker && (
        <div className="bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-xl p-4">
          <p className="text-sm text-primary-800 dark:text-primary-300">
            Bracket Picker pools use a different prediction format. Match-level accuracy and streak tracking are available for Full Tournament and Progressive pools. Pool-wide stats are shown below.
          </p>
        </div>
      )}

      {/* Section 1: Accuracy (non-bracket-picker only, submitted entries only) */}
      {!isBracketPicker && isEntrySubmitted && predictionResults.length > 0 && (
        <AccuracySection stageAccuracy={stageAccuracy} overall={overallAccuracy} />
      )}

      {/* Section 2: Streaks (non-bracket-picker only, submitted entries only) */}
      {!isBracketPicker && isEntrySubmitted && predictionResults.length > 0 && (
        <StreaksSection streaks={streaks} />
      )}

      {/* Section 3: Crowd Comparison */}
      {crowdData.length > 0 && (
        <CrowdSection crowdData={crowdData} />
      )}

      {/* Section 4: Pool-Wide Stats (always shown) */}
      <PoolStatsSection poolStats={poolStats} />
    </div>
  )
}
