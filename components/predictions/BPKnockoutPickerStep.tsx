'use client'

import { useState, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { MatchData, BPKnockoutPick } from '@/app/pools/[pool_id]/types'
import type { GroupStanding } from '@/lib/tournament'

// =============================================
// TYPES
// =============================================

type KnockoutPick = {
  winner_team_id: string
  predicted_penalty: boolean
}

type BPKnockoutPickerStepProps = {
  matches: MatchData[]
  knockoutTeamMap: Map<number, { home: GroupStanding | null; away: GroupStanding | null }>
  knockoutPicks: Map<string, KnockoutPick>  // match_id -> pick
  onPicksChange: (picks: Map<string, KnockoutPick>) => void
  onCascadeReset: (resetMatchIds: string[]) => void  // Called when changing a pick invalidates downstream
  visibleRounds?: string[]  // Filter to only show these rounds (e.g. ['round_32'] or ['third_place', 'final'])
}

// =============================================
// CONSTANTS
// =============================================

const KNOCKOUT_ROUNDS = [
  { key: 'round_32', label: 'Round of 32', matchCount: 16 },
  { key: 'round_16', label: 'Round of 16', matchCount: 8 },
  { key: 'quarter_final', label: 'Quarter Finals', matchCount: 4 },
  { key: 'semi_final', label: 'Semi Finals', matchCount: 2 },
  { key: 'third_place', label: '3rd Place', matchCount: 1 },
  { key: 'final', label: 'Final', matchCount: 1 },
] as const

/** Ordered round keys from earliest to latest, used for cascade logic */
const ROUND_KEY_ORDER = KNOCKOUT_ROUNDS.map(r => r.key)

// =============================================
// HELPER FUNCTIONS
// =============================================

/**
 * Parse a placeholder string like "Winner Match 73" or "Loser Match 82"
 * to extract the match number it references.
 */
function parseMatchReference(placeholder: string | null): { type: 'winner' | 'loser'; matchNumber: number } | null {
  if (!placeholder) return null
  const winnerMatch = placeholder.match(/^Winner Match (\d+)$/i)
  if (winnerMatch) {
    return { type: 'winner', matchNumber: parseInt(winnerMatch[1], 10) }
  }
  const loserMatch = placeholder.match(/^Loser Match (\d+)$/i)
  if (loserMatch) {
    return { type: 'loser', matchNumber: parseInt(loserMatch[1], 10) }
  }
  return null
}

/**
 * Find all downstream match_ids that would be invalidated if the result
 * of `changedMatchNumber` changes.  Cascades through subsequent rounds.
 */
function findDownstreamMatches(
  changedMatchNumber: number,
  allMatches: MatchData[],
  knockoutPicks: Map<string, KnockoutPick>
): string[] {
  const affected: string[] = []
  const invalidatedMatchNumbers = new Set<number>([changedMatchNumber])

  // We iterate round-by-round from earlier rounds to later ones
  // to propagate the cascade.
  const roundOrder = ROUND_KEY_ORDER
  const changedMatch = allMatches.find(m => m.match_number === changedMatchNumber)
  if (!changedMatch) return affected

  const changedRoundIdx = roundOrder.indexOf(changedMatch.stage as typeof roundOrder[number])
  if (changedRoundIdx === -1) return affected

  // Check rounds after the changed match's round
  for (let r = changedRoundIdx + 1; r < roundOrder.length; r++) {
    const roundKey = roundOrder[r]
    const roundMatches = allMatches.filter(m => m.stage === roundKey)

    for (const match of roundMatches) {
      const homeRef = parseMatchReference(match.home_team_placeholder)
      const awayRef = parseMatchReference(match.away_team_placeholder)

      const homeDepends = homeRef && invalidatedMatchNumbers.has(homeRef.matchNumber)
      const awayDepends = awayRef && invalidatedMatchNumbers.has(awayRef.matchNumber)

      if (homeDepends || awayDepends) {
        // This match depends on a changed result
        if (knockoutPicks.has(match.match_id)) {
          affected.push(match.match_id)
        }
        // Even if there is no pick yet, mark this match number as invalidated
        // so further downstream matches also cascade
        invalidatedMatchNumbers.add(match.match_number)
      }
    }
  }

  return affected
}

// =============================================
// TEAM DISPLAY COMPONENT
// =============================================

function TeamButton({
  team,
  placeholder,
  isSelected,
  isDisabled,
  onClick,
}: {
  team: GroupStanding | null
  placeholder: string | null
  isSelected: boolean
  isDisabled: boolean
  onClick: () => void
}) {
  const name = team?.country_name ?? placeholder ?? 'TBD'
  const flagUrl = team?.flag_url
  const isTBD = !team

  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={onClick}
      className={`
        flex-1 min-w-0 flex items-center gap-2 px-3 py-3 rounded-lg border-2 transition-all duration-150
        ${isSelected
          ? 'border-success-500 bg-success-50 ring-1 ring-success-200'
          : 'border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50'
        }
        ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${isTBD ? 'opacity-60' : ''}
      `}
    >
      {/* Flag */}
      {flagUrl ? (
        <img
          src={flagUrl}
          alt={name}
          className="w-7 h-5 rounded-sm object-cover shrink-0"
        />
      ) : (
        <div className="w-7 h-5 rounded-sm bg-neutral-200 shrink-0 flex items-center justify-center">
          <span className="text-[8px] text-neutral-400">?</span>
        </div>
      )}

      {/* Name */}
      <span className={`text-sm font-medium truncate ${isTBD ? 'text-neutral-400 italic' : 'text-neutral-900'}`}>
        {name}
      </span>

      {/* Checkmark for selected */}
      {isSelected && (
        <svg className="w-5 h-5 text-success-600 shrink-0 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      )}
    </button>
  )
}

// =============================================
// MATCH CARD COMPONENT
// =============================================

function MatchCard({
  match,
  homeTeam,
  awayTeam,
  pick,
  onSelectWinner,
  onTogglePenalty,
}: {
  match: MatchData
  homeTeam: GroupStanding | null
  awayTeam: GroupStanding | null
  pick: KnockoutPick | undefined
  onSelectWinner: (matchId: string, teamId: string) => void
  onTogglePenalty: (matchId: string) => void
}) {
  const bothResolved = homeTeam !== null && awayTeam !== null
  const isDisabled = !bothResolved
  const homeSelected = pick?.winner_team_id === homeTeam?.team_id
  const awaySelected = pick?.winner_team_id === awayTeam?.team_id

  return (
    <div className={`bg-surface rounded-xl border border-neutral-200 p-4 ${isDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* Match header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-neutral-500">
          Match {match.match_number}
        </span>
        {pick && (
          <span className="text-[10px] font-medium text-success-600 bg-success-50 px-2 py-0.5 rounded-full">
            Picked
          </span>
        )}
      </div>

      {/* Team buttons */}
      <div className="flex gap-2">
        <TeamButton
          team={homeTeam}
          placeholder={match.home_team_placeholder}
          isSelected={homeSelected}
          isDisabled={isDisabled}
          onClick={() => homeTeam && onSelectWinner(match.match_id, homeTeam.team_id)}
        />

        <div className="flex items-center shrink-0">
          <span className="text-xs font-bold text-neutral-400 uppercase">vs</span>
        </div>

        <TeamButton
          team={awayTeam}
          placeholder={match.away_team_placeholder}
          isSelected={awaySelected}
          isDisabled={isDisabled}
          onClick={() => awayTeam && onSelectWinner(match.match_id, awayTeam.team_id)}
        />
      </div>

      {/* Penalties toggle */}
      {bothResolved && pick && (
        <div className="mt-3 pt-3 border-t border-neutral-100">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={pick.predicted_penalty}
              onChange={() => onTogglePenalty(match.match_id)}
              className="w-4 h-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500 cursor-pointer"
            />
            <span className="text-xs text-neutral-500">
              Goes to penalties?
            </span>
          </label>
        </div>
      )}
    </div>
  )
}

// =============================================
// CASCADE CONFIRMATION MODAL
// =============================================

function CascadeConfirmModal({
  affectedCount,
  onConfirm,
  onCancel,
}: {
  affectedCount: number
  onConfirm: () => void
  onCancel: () => void
}) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 modal-overlay sm:p-4" onClick={onCancel}>
      <div className="relative bg-surface sm:rounded-xl rounded-t-xl shadow-xl max-w-md w-full p-6 dark:shadow-none dark:border dark:border-border-default modal-panel" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-neutral-900 mb-2">
          Change this pick?
        </h3>
        <div className="bg-warning-50 border border-warning-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-warning-800">
            Changing this pick will <strong>reset {affectedCount} downstream {affectedCount === 1 ? 'pick' : 'picks'}</strong> in
            later rounds because those matches depend on this result.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-4 py-2.5 rounded-lg border border-neutral-200 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 px-4 py-2.5 rounded-lg bg-warning-600 text-white text-sm font-medium hover:bg-warning-700 transition"
          >
            Change &amp; Reset
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// =============================================
// MAIN COMPONENT
// =============================================

export function BPKnockoutPickerStep({
  matches,
  knockoutTeamMap,
  knockoutPicks,
  onPicksChange,
  onCascadeReset,
  visibleRounds,
}: BPKnockoutPickerStepProps) {
  // Filter rounds to only visible ones (or show all if not specified)
  const displayRounds = useMemo(() => {
    if (!visibleRounds) return KNOCKOUT_ROUNDS
    return KNOCKOUT_ROUNDS.filter(r => visibleRounds.includes(r.key))
  }, [visibleRounds])

  const [pendingCascade, setPendingCascade] = useState<{
    matchId: string
    newTeamId: string
    affectedMatchIds: string[]
  } | null>(null)

  // =============================================
  // COMPUTED: Round match groupings
  // =============================================

  const roundMatches = useMemo(() => {
    const map = new Map<string, MatchData[]>()
    for (const round of displayRounds) {
      const roundMs = matches
        .filter(m => m.stage === round.key)
        .sort((a, b) => a.match_number - b.match_number)
      map.set(round.key, roundMs)
    }
    return map
  }, [matches, displayRounds])

  // =============================================
  // COMPUTED: Pick counts per round
  // =============================================

  const roundPickCounts = useMemo(() => {
    const counts = new Map<string, { picked: number; total: number }>()
    for (const round of displayRounds) {
      const roundMs = roundMatches.get(round.key) ?? []
      const total = roundMs.length
      const picked = roundMs.filter(m => knockoutPicks.has(m.match_id)).length
      counts.set(round.key, { picked, total })
    }
    return counts
  }, [roundMatches, knockoutPicks, displayRounds])

  // =============================================
  // COMPUTED: Overall progress (for visible rounds only)
  // =============================================

  const { totalPicked, totalMatches: totalVisibleMatches } = useMemo(() => {
    let picked = 0
    let total = 0
    for (const [, { picked: p, total: t }] of roundPickCounts) {
      picked += p
      total += t
    }
    return { totalPicked: picked, totalMatches: total }
  }, [roundPickCounts])

  const progressPercent = totalVisibleMatches > 0
    ? Math.round((totalPicked / totalVisibleMatches) * 100)
    : 0

  // =============================================
  // HANDLERS
  // =============================================

  const handleSelectWinner = useCallback((matchId: string, teamId: string) => {
    const match = matches.find(m => m.match_id === matchId)
    if (!match) return

    const existingPick = knockoutPicks.get(matchId)

    // If same team already selected, deselect
    if (existingPick?.winner_team_id === teamId) {
      const next = new Map(knockoutPicks)
      next.delete(matchId)

      // Also find and reset downstream matches
      const downstream = findDownstreamMatches(match.match_number, matches, knockoutPicks)
      for (const dId of downstream) {
        next.delete(dId)
      }
      if (downstream.length > 0) {
        onCascadeReset(downstream)
      }
      onPicksChange(next)
      return
    }

    // If changing an existing pick, check for downstream cascade
    if (existingPick && existingPick.winner_team_id !== teamId) {
      const downstream = findDownstreamMatches(match.match_number, matches, knockoutPicks)
      if (downstream.length > 0) {
        setPendingCascade({
          matchId,
          newTeamId: teamId,
          affectedMatchIds: downstream,
        })
        return
      }
    }

    // No cascade needed -- just set the pick
    const next = new Map(knockoutPicks)
    next.set(matchId, {
      winner_team_id: teamId,
      predicted_penalty: existingPick?.predicted_penalty ?? false,
    })
    onPicksChange(next)
  }, [matches, knockoutPicks, onPicksChange, onCascadeReset])

  const handleConfirmCascade = useCallback(() => {
    if (!pendingCascade) return

    const { matchId, newTeamId, affectedMatchIds } = pendingCascade
    const existingPick = knockoutPicks.get(matchId)

    const next = new Map(knockoutPicks)

    // Remove downstream picks
    for (const dId of affectedMatchIds) {
      next.delete(dId)
    }

    // Set the new pick
    next.set(matchId, {
      winner_team_id: newTeamId,
      predicted_penalty: existingPick?.predicted_penalty ?? false,
    })

    onCascadeReset(affectedMatchIds)
    onPicksChange(next)
    setPendingCascade(null)
  }, [pendingCascade, knockoutPicks, onPicksChange, onCascadeReset])

  const handleCancelCascade = useCallback(() => {
    setPendingCascade(null)
  }, [])

  const handleTogglePenalty = useCallback((matchId: string) => {
    const existing = knockoutPicks.get(matchId)
    if (!existing) return

    const next = new Map(knockoutPicks)
    next.set(matchId, {
      ...existing,
      predicted_penalty: !existing.predicted_penalty,
    })
    onPicksChange(next)
  }, [knockoutPicks, onPicksChange])

  // =============================================
  // ACTIVE ROUND DATA
  // =============================================

  // =============================================
  // RENDER
  // =============================================

  return (
    <div>
      {/* Progress bar */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm text-neutral-600">
            <span className="font-bold text-neutral-900">{totalPicked}</span>{' '}
            / <span className="font-bold text-neutral-900">{totalVisibleMatches}</span>{' '}
            matches picked
          </p>
          {totalPicked === totalVisibleMatches && totalVisibleMatches > 0 && (
            <span className="text-xs font-medium text-success-600 bg-success-50 px-2 py-0.5 rounded-full">
              All picked
            </span>
          )}
        </div>
        <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              progressPercent === 100 ? 'bg-success-500' : 'bg-primary-600'
            }`}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* All visible rounds displayed as sections on the same page */}
      {displayRounds.map((round) => {
        const matches_for_round = roundMatches.get(round.key) ?? []

        return (
          <div key={round.key} className={displayRounds.length > 1 ? 'mb-8 last:mb-0' : ''}>
            {/* Section header - only shown when multiple rounds on the page */}
            {displayRounds.length > 1 && (
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-neutral-900">{round.label}</h3>
                {(() => {
                  const counts = roundPickCounts.get(round.key)
                  const picked = counts?.picked ?? 0
                  const total = counts?.total ?? 0
                  const isComplete = total > 0 && picked === total
                  return isComplete ? (
                    <span className="text-xs font-medium text-success-600 bg-success-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      Picked
                    </span>
                  ) : null
                })()}
              </div>
            )}

            {/* Match cards */}
            {matches_for_round.length === 0 ? (
              <div className="text-center py-12 text-neutral-400 text-sm">
                No matches found for this round.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {matches_for_round.map(match => {
                  const resolved = knockoutTeamMap.get(match.match_number)
                  const homeTeam = resolved?.home ?? null
                  const awayTeam = resolved?.away ?? null
                  const pick = knockoutPicks.get(match.match_id)

                  return (
                    <MatchCard
                      key={match.match_id}
                      match={match}
                      homeTeam={homeTeam}
                      awayTeam={awayTeam}
                      pick={pick}
                      onSelectWinner={handleSelectWinner}
                      onTogglePenalty={handleTogglePenalty}
                    />
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {/* Cascade confirmation modal */}
      {pendingCascade && (
        <CascadeConfirmModal
          affectedCount={pendingCascade.affectedMatchIds.length}
          onConfirm={handleConfirmCascade}
          onCancel={handleCancelCascade}
        />
      )}
    </div>
  )
}
