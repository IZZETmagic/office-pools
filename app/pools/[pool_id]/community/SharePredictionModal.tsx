'use client'

import { useState, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { MatchData, PredictionData, EntryData } from '../types'
import type { PredictionShareMetadata } from './types'
import { formatStageLabel } from './helpers'

type SharePredictionModalProps = {
  poolId: string
  currentUserId: string
  matches: MatchData[]
  allPredictions: PredictionData[]
  userEntries: EntryData[]
  onClose: () => void
  onMessageSent?: (message: any) => void
}

type ShareableMatch = {
  match: MatchData
  prediction: PredictionData
  outcome: 'exact' | 'correct' | 'miss'
}

function computeOutcome(
  predictedHome: number,
  predictedAway: number,
  actualHome: number,
  actualAway: number,
): 'exact' | 'correct' | 'miss' {
  if (predictedHome === actualHome && predictedAway === actualAway) return 'exact'

  const predictedWinner = predictedHome > predictedAway ? 'home' : predictedAway > predictedHome ? 'away' : 'draw'
  const actualWinner = actualHome > actualAway ? 'home' : actualAway > actualHome ? 'away' : 'draw'

  if (predictedWinner === actualWinner) return 'correct'
  return 'miss'
}

const OUTCOME_BADGES: Record<string, { label: string; classes: string }> = {
  exact: { label: '★ EXACT', classes: 'bg-accent-100 dark:bg-accent-900/20 text-accent-700 dark:text-accent-400' },
  correct: { label: '✓ CORRECT', classes: 'bg-success-100 dark:bg-success-900/20 text-success-700 dark:text-success-400' },
  miss: { label: '✗ MISS', classes: 'bg-danger-100 dark:bg-danger-900/20 text-danger-700 dark:text-danger-400' },
}

export function SharePredictionModal({
  poolId,
  currentUserId,
  matches,
  allPredictions,
  userEntries,
  onClose,
  onMessageSent,
}: SharePredictionModalProps) {
  const [selectedMatch, setSelectedMatch] = useState<ShareableMatch | null>(null)
  const [sharing, setSharing] = useState(false)
  const supabaseRef = useRef(createClient())

  // Find completed matches where user has predictions
  const shareableMatches = useMemo(() => {
    const userEntryIds = new Set(userEntries.map(e => e.entry_id))
    const userPreds = allPredictions.filter(p => userEntryIds.has(p.entry_id))

    const results: ShareableMatch[] = []

    for (const match of matches) {
      if (!match.is_completed || match.home_score_ft === null || match.away_score_ft === null) continue

      const prediction = userPreds.find(p => p.match_id === match.match_id)
      if (!prediction) continue

      const outcome = computeOutcome(
        prediction.predicted_home_score,
        prediction.predicted_away_score,
        match.home_score_ft,
        match.away_score_ft,
      )

      results.push({ match, prediction, outcome })
    }

    // Sort: exact first, then correct, then miss, then by match number desc
    return results.sort((a, b) => {
      const order = { exact: 0, correct: 1, miss: 2 }
      if (order[a.outcome] !== order[b.outcome]) return order[a.outcome] - order[b.outcome]
      return b.match.match_number - a.match.match_number
    })
  }, [matches, allPredictions, userEntries])

  const handleShare = async () => {
    if (!selectedMatch) return
    setSharing(true)

    const { match, prediction, outcome } = selectedMatch
    const homeName = match.home_team?.country_name ?? match.home_team_placeholder ?? '???'
    const awayName = match.away_team?.country_name ?? match.away_team_placeholder ?? '???'

    const metadata: PredictionShareMetadata = {
      entry_id: prediction.entry_id,
      match_id: match.match_id,
      match_number: match.match_number,
      stage: match.stage,
      predicted_home: prediction.predicted_home_score,
      predicted_away: prediction.predicted_away_score,
      actual_home: match.home_score_ft!,
      actual_away: match.away_score_ft!,
      outcome,
      home_team_name: homeName,
      away_team_name: awayName,
      home_team_code: match.home_team?.country_code ?? '',
      away_team_code: match.away_team?.country_code ?? '',
      home_flag_url: match.home_team?.flag_url ?? null,
      away_flag_url: match.away_team?.flag_url ?? null,
    }

    const content = outcome === 'exact'
      ? `🎯 Nailed it! ${homeName} ${match.home_score_ft}-${match.away_score_ft} ${awayName} — exact score!`
      : outcome === 'correct'
      ? `✓ Called it! ${homeName} ${match.home_score_ft}-${match.away_score_ft} ${awayName}`
      : `${homeName} ${match.home_score_ft}-${match.away_score_ft} ${awayName} — missed this one`

    const { data, error } = await supabaseRef.current.from('pool_messages').insert({
      pool_id: poolId,
      user_id: currentUserId,
      content,
      mentions: [],
      message_type: 'prediction_share',
      reply_to_message_id: null,
      metadata,
    }).select().single()

    if (!error && data) {
      onMessageSent?.(data)
    }

    setSharing(false)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-modal-backdrop"
      role="dialog"
      aria-modal="true"
    >
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl sm:max-w-md w-full max-h-[85vh] flex flex-col dark:shadow-none dark:border dark:border-border-default animate-modal-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-neutral-100 dark:border-border-default shrink-0">
          <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
            Share a Prediction
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Match list */}
        <div className="overflow-y-auto px-4 sm:px-6 py-4 space-y-2 flex-1">
          {shareableMatches.length === 0 && (
            <div className="text-center py-8">
              <p className="text-sm text-neutral-500">No completed matches with predictions yet.</p>
            </div>
          )}

          {shareableMatches.map(({ match, prediction, outcome }) => {
            const homeName = match.home_team?.country_name ?? match.home_team_placeholder ?? '???'
            const awayName = match.away_team?.country_name ?? match.away_team_placeholder ?? '???'
            const isSelected = selectedMatch?.match.match_id === match.match_id
            const badge = OUTCOME_BADGES[outcome]

            return (
              <button
                key={match.match_id}
                onClick={() => setSelectedMatch({ match, prediction, outcome })}
                className={`w-full text-left rounded-xl border p-3 transition-all ${
                  isSelected
                    ? 'border-primary-400 dark:border-primary-600 bg-primary-50/50 dark:bg-primary-900/10 ring-1 ring-primary-400/30'
                    : 'border-neutral-200 dark:border-border-default hover:border-neutral-300 dark:hover:border-neutral-600'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider">
                    Match {match.match_number} · {formatStageLabel(match.stage)}
                  </span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${badge.classes}`}>
                    {badge.label}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {match.home_team?.flag_url && (
                      <img src={match.home_team.flag_url} alt="" className="w-5 h-3.5 rounded-sm object-cover" />
                    )}
                    <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100">{homeName}</span>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] text-neutral-400">
                      {prediction.predicted_home_score}-{prediction.predicted_away_score}
                    </div>
                    <div className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                      {match.home_score_ft}-{match.away_score_ft}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium text-neutral-900 dark:text-neutral-100">{awayName}</span>
                    {match.away_team?.flag_url && (
                      <img src={match.away_team.flag_url} alt="" className="w-5 h-3.5 rounded-sm object-cover" />
                    )}
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-neutral-100 dark:border-border-default px-4 sm:px-6 pt-4 pb-10 shrink-0">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 text-sm font-medium text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-xl px-4 py-2.5 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleShare}
              disabled={!selectedMatch || sharing}
              className="flex-1 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:pointer-events-none rounded-xl px-4 py-2.5 transition-all active:scale-[0.98]"
            >
              {sharing ? 'Sharing...' : 'Share Prediction'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
