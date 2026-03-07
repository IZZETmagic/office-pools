'use client'

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type {
  TeamData,
  MatchData,
  SettingsData,
  BPGroupRanking,
  BPThirdPlaceRanking,
  BPKnockoutPick,
} from '@/app/pools/[pool_id]/types'
import type { GroupStanding } from '@/lib/tournament'
import { GROUP_LETTERS } from '@/lib/tournament'
import { resolveR32FromBracketPicker, resolveFullBracketFromPicks } from '@/lib/bracketPickerResolver'
import { BPGroupRankingStep } from './BPGroupRankingStep'
import { BPThirdPlaceStep } from './BPThirdPlaceStep'
import { BPKnockoutPickerStep } from './BPKnockoutPickerStep'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Alert } from '@/components/ui/Alert'
import { useToast } from '@/components/ui/Toast'

// =============================================
// TYPES
// =============================================

type BracketPickerFlowProps = {
  poolId: string
  entryId: string
  teams: TeamData[]
  matches: MatchData[]
  settings: SettingsData
  predictionDeadline: string | null
  isSubmitted: boolean
  isLocked: boolean
  existingGroupRankings: BPGroupRanking[]
  existingThirdPlaceRankings: BPThirdPlaceRanking[]
  existingKnockoutPicks: BPKnockoutPick[]
  onSaveStatusChange?: (status: 'idle' | 'saving' | 'saved' | 'error') => void
  onSubmit?: () => void
}

type KnockoutPick = {
  winner_team_id: string
  predicted_penalty: boolean
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// =============================================
// STEP DEFINITIONS (8 steps, round-by-round)
// =============================================

const STEPS = [
  { key: 'groups', label: 'Rank Groups' },
  { key: 'third_place', label: 'Third Place' },
  { key: 'round_32', label: 'Round of 32' },
  { key: 'round_16', label: 'Round of 16' },
  { key: 'quarter_final', label: 'Quarter Finals' },
  { key: 'semi_final', label: 'Semi Finals' },
  { key: 'third_final', label: '3rd Place & Final' },
  { key: 'review', label: 'Review & Submit' },
] as const

const REVIEW_STEP = STEPS.length - 1 // 7

// =============================================
// CONVERSION HELPERS
// =============================================

function groupRankingsToMap(rankings: BPGroupRanking[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const letter of GROUP_LETTERS) {
    const groupRanks = rankings
      .filter(r => r.group_letter === letter)
      .sort((a, b) => a.predicted_position - b.predicted_position)
    if (groupRanks.length > 0) {
      map.set(letter, groupRanks.map(r => r.team_id))
    }
  }
  return map
}

function groupRankingsMapToArray(
  map: Map<string, string[]>,
  entryId: string
): Omit<BPGroupRanking, 'id'>[] {
  const result: Omit<BPGroupRanking, 'id'>[] = []
  for (const [letter, teamIds] of map) {
    teamIds.forEach((teamId, idx) => {
      result.push({
        entry_id: entryId,
        team_id: teamId,
        group_letter: letter,
        predicted_position: idx + 1,
      })
    })
  }
  return result
}

function thirdPlaceRankingsToArray(
  ranked: string[],
  entryId: string,
  teams: TeamData[]
): Omit<BPThirdPlaceRanking, 'id'>[] {
  const teamMap = new Map(teams.map(t => [t.team_id, t]))
  return ranked.map((teamId, idx) => {
    const team = teamMap.get(teamId)
    return {
      entry_id: entryId,
      team_id: teamId,
      group_letter: team?.group_letter ?? '',
      rank: idx + 1,
    }
  })
}

function knockoutPicksToMap(picks: BPKnockoutPick[]): Map<string, KnockoutPick> {
  const map = new Map<string, KnockoutPick>()
  for (const pick of picks) {
    map.set(pick.match_id, {
      winner_team_id: pick.winner_team_id,
      predicted_penalty: pick.predicted_penalty,
    })
  }
  return map
}

function knockoutPicksMapToArray(
  map: Map<string, KnockoutPick>,
  entryId: string,
  matches: MatchData[]
): BPKnockoutPick[] {
  const matchByMatchId = new Map(matches.map(m => [m.match_id, m]))
  const result: BPKnockoutPick[] = []
  for (const [matchId, pick] of map) {
    const match = matchByMatchId.get(matchId)
    result.push({
      id: '',
      entry_id: entryId,
      match_id: matchId,
      match_number: match?.match_number ?? 0,
      winner_team_id: pick.winner_team_id,
      predicted_penalty: pick.predicted_penalty,
    })
  }
  return result
}

// =============================================
// HELPER: Check if all matches for given stages are picked
// =============================================

function isRoundComplete(
  matches: MatchData[],
  knockoutPicks: Map<string, KnockoutPick>,
  stages: string[]
): boolean {
  const roundMatches = matches.filter(m => stages.includes(m.stage))
  return roundMatches.length > 0 && roundMatches.every(m => knockoutPicks.has(m.match_id))
}

// =============================================
// MAIN COMPONENT
// =============================================

export default function BracketPickerFlow({
  poolId,
  entryId,
  teams,
  matches,
  settings,
  predictionDeadline,
  isSubmitted: initialIsSubmitted,
  isLocked,
  existingGroupRankings,
  existingThirdPlaceRankings,
  existingKnockoutPicks,
  onSaveStatusChange,
  onSubmit,
}: BracketPickerFlowProps) {
  const { showToast } = useToast()

  // =============================================
  // STATE
  // =============================================

  const [currentStep, setCurrentStep] = useState(() => {
    if (initialIsSubmitted) return REVIEW_STEP
    // Resume at the furthest step the user has reached based on existing data
    const hasKnockoutStage = (stages: string[]) =>
      existingKnockoutPicks.some(p => {
        const m = matches.find(match => match.match_id === p.match_id)
        return m && stages.includes(m.stage)
      })
    if (hasKnockoutStage(['third_place', 'final'])) return 6
    if (hasKnockoutStage(['semi_final'])) return 5
    if (hasKnockoutStage(['quarter_final'])) return 4
    if (hasKnockoutStage(['round_16'])) return 3
    if (hasKnockoutStage(['round_32'])) return 2
    if (existingThirdPlaceRankings.length > 0) return 1
    return 0
  })
  const [isSubmitted, setIsSubmitted] = useState(initialIsSubmitted)
  const [submitting, setSubmitting] = useState(false)
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  // Core data state
  const [groupRankings, setGroupRankings] = useState<Map<string, string[]>>(() =>
    groupRankingsToMap(existingGroupRankings)
  )
  const [thirdPlaceRanking, setThirdPlaceRanking] = useState<string[]>(() =>
    [...existingThirdPlaceRankings]
      .sort((a, b) => a.rank - b.rank)
      .map(r => r.team_id)
  )
  const [knockoutPicks, setKnockoutPicks] = useState<Map<string, KnockoutPick>>(() =>
    knockoutPicksToMap(existingKnockoutPicks)
  )

  // Refs for auto-save debouncing
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingChanges = useRef(false)
  const savingRef = useRef(false)

  // =============================================
  // READ-ONLY MODE
  // =============================================

  const isPastDeadline = useMemo(() => {
    if (!predictionDeadline) return false
    return new Date(predictionDeadline) < new Date()
  }, [predictionDeadline])

  const isReadOnly = isSubmitted || isLocked || isPastDeadline

  // =============================================
  // DEADLINE COUNTDOWN
  // =============================================

  const deadlineInfo = useMemo(() => {
    if (!predictionDeadline) return null
    const deadline = new Date(predictionDeadline)
    const now = new Date()
    const diffMs = deadline.getTime() - now.getTime()

    if (diffMs <= 0) {
      return { isPast: true, text: 'Deadline has passed' }
    }

    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

    const parts: string[] = []
    if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`)
    if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`)
    if (days === 0 && minutes > 0) parts.push(`${minutes} min${minutes !== 1 ? 's' : ''}`)

    return { isPast: false, text: `Predictions due in ${parts.join(', ')}` }
  }, [predictionDeadline])

  // =============================================
  // THIRD-PLACE TEAM EXTRACTION (for Step 2)
  // =============================================

  /** Get the 3rd-place team_id from each group ranking */
  const thirdPlaceTeamIdsFromGroups = useMemo<string[]>(() => {
    const ids: string[] = []
    for (const letter of GROUP_LETTERS) {
      const ranking = groupRankings.get(letter)
      if (ranking && ranking.length >= 3) {
        ids.push(ranking[2]) // 0-indexed: position 3
      }
    }
    return ids
  }, [groupRankings])

  // =============================================
  // THIRD-PLACE INITIALIZATION
  // =============================================

  const initializeThirdPlaceIfNeeded = useCallback(() => {
    const expectedTeamIds = new Set(thirdPlaceTeamIdsFromGroups)

    if (
      thirdPlaceRanking.length === 0 ||
      thirdPlaceRanking.length !== expectedTeamIds.size ||
      !thirdPlaceRanking.every(id => expectedTeamIds.has(id))
    ) {
      const teamMap = new Map(teams.map(t => [t.team_id, t]))
      const sorted = thirdPlaceTeamIdsFromGroups
        .filter(id => teamMap.has(id))
        .sort((a, b) => {
          const teamA = teamMap.get(a)!
          const teamB = teamMap.get(b)!
          return teamB.fifa_ranking_points - teamA.fifa_ranking_points
        })
      setThirdPlaceRanking(sorted)
      return sorted
    }
    return thirdPlaceRanking
  }, [thirdPlaceTeamIdsFromGroups, thirdPlaceRanking, teams])

  // =============================================
  // BRACKET RESOLUTION (computed / memoized)
  // =============================================

  const groupRankingsForResolver = useMemo<BPGroupRanking[]>(() => {
    const result: BPGroupRanking[] = []
    for (const [letter, teamIds] of groupRankings) {
      teamIds.forEach((teamId, idx) => {
        result.push({
          id: '',
          entry_id: entryId,
          team_id: teamId,
          group_letter: letter,
          predicted_position: idx + 1,
        })
      })
    }
    return result
  }, [groupRankings, entryId])

  const thirdPlaceRankingsForResolver = useMemo<BPThirdPlaceRanking[]>(() => {
    const teamMap = new Map(teams.map(t => [t.team_id, t]))
    return thirdPlaceRanking.map((teamId, idx) => {
      const team = teamMap.get(teamId)
      return {
        id: '',
        entry_id: entryId,
        team_id: teamId,
        group_letter: team?.group_letter ?? '',
        rank: idx + 1,
      }
    })
  }, [thirdPlaceRanking, entryId, teams])

  const knockoutPicksForResolver = useMemo<BPKnockoutPick[]>(() => {
    return knockoutPicksMapToArray(knockoutPicks, entryId, matches)
  }, [knockoutPicks, entryId, matches])

  const bracket = useMemo(() => {
    const hasGroupData = groupRankings.size === GROUP_LETTERS.length &&
      Array.from(groupRankings.values()).every(r => r.length >= 3)
    const hasThirdPlaceData = thirdPlaceRanking.length >= 8

    if (!hasGroupData || !hasThirdPlaceData) {
      return {
        allGroupStandings: new Map<string, GroupStanding[]>(),
        knockoutTeamMap: new Map<number, { home: GroupStanding | null; away: GroupStanding | null }>(),
        champion: null as GroupStanding | null,
        runnerUp: null as GroupStanding | null,
        thirdPlace: null as GroupStanding | null,
      }
    }

    return resolveFullBracketFromPicks({
      groupRankings: groupRankingsForResolver,
      thirdPlaceRankings: thirdPlaceRankingsForResolver,
      knockoutPicks: knockoutPicksForResolver,
      teams: teams as any,
      matches: matches as any,
    })
  }, [
    groupRankings,
    thirdPlaceRanking,
    groupRankingsForResolver,
    thirdPlaceRankingsForResolver,
    knockoutPicksForResolver,
    teams,
    matches,
  ])

  const r32TeamMap = useMemo(() => {
    const hasGroupData = groupRankings.size === GROUP_LETTERS.length &&
      Array.from(groupRankings.values()).every(r => r.length >= 3)
    const hasThirdPlaceData = thirdPlaceRanking.length >= 8

    if (!hasGroupData || !hasThirdPlaceData) {
      return new Map<number, { home: GroupStanding | null; away: GroupStanding | null }>()
    }

    return resolveR32FromBracketPicker({
      groupRankings: groupRankingsForResolver,
      thirdPlaceRankings: thirdPlaceRankingsForResolver,
      teams: teams as any,
    })
  }, [groupRankings, thirdPlaceRanking, groupRankingsForResolver, thirdPlaceRankingsForResolver, teams])

  /** The team map to pass to knockout picker - uses full bracket if available, otherwise R32-only */
  const knockoutTeamMap = bracket.knockoutTeamMap.size > 0 ? bracket.knockoutTeamMap : r32TeamMap

  // =============================================
  // AUTO-SAVE
  // =============================================

  const saveBracketPicks = useCallback(async () => {
    if (savingRef.current || isSubmitted) return
    savingRef.current = true
    pendingChanges.current = false
    setSaveStatus('saving')
    onSaveStatusChange?.('saving')
    setError(null)

    try {
      const payload = {
        entry_id: entryId,
        group_rankings: groupRankingsMapToArray(groupRankings, entryId),
        third_place_rankings: thirdPlaceRankingsToArray(thirdPlaceRanking, entryId, teams),
        knockout_picks: knockoutPicksMapToArray(knockoutPicks, entryId, matches),
      }

      const res = await fetch(`/api/pools/${poolId}/bracket-picks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.status === 401) {
        setSaveStatus('error')
        setError('Session expired. Please log in again.')
        onSaveStatusChange?.('error')
        showToast('Session expired. Redirecting to login...', 'error', { duration: 3000 })
        setTimeout(() => { window.location.href = '/login' }, 2000)
        savingRef.current = false
        return
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save')
      }

      setSaveStatus('saved')
      onSaveStatusChange?.('saved')

      setTimeout(() => {
        setSaveStatus(prev => prev === 'saved' ? 'idle' : prev)
        onSaveStatusChange?.('idle')
      }, 3000)
    } catch (err: any) {
      setSaveStatus('error')
      setError(err.message || 'Failed to save predictions')
      onSaveStatusChange?.('error')
      showToast('Failed to save. Please try again.', 'error')
    } finally {
      savingRef.current = false
    }
  }, [
    isSubmitted,
    entryId,
    groupRankings,
    thirdPlaceRanking,
    knockoutPicks,
    teams,
    matches,
    poolId,
    onSaveStatusChange,
    showToast,
  ])

  const saveBracketPicksRef = useRef(saveBracketPicks)
  saveBracketPicksRef.current = saveBracketPicks

  const stableTriggerAutoSave = useCallback(() => {
    pendingChanges.current = true
    setSaveStatus('idle')

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      if (pendingChanges.current && !savingRef.current) {
        saveBracketPicksRef.current()
      }
    }, 500)
  }, [])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    }
  }, [])

  // Beforeunload warning for unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingChanges.current) {
        e.preventDefault()
        saveBracketPicksRef.current()
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  // =============================================
  // STATE CHANGE HANDLERS
  // =============================================

  const handleGroupRankingsChange = useCallback((rankings: Map<string, string[]>) => {
    setGroupRankings(rankings)
    if (!isReadOnly) stableTriggerAutoSave()
  }, [isReadOnly, stableTriggerAutoSave])

  const handleThirdPlaceChange = useCallback((ranked: string[]) => {
    setThirdPlaceRanking(ranked)
    if (!isReadOnly) stableTriggerAutoSave()
  }, [isReadOnly, stableTriggerAutoSave])

  const handleKnockoutPicksChange = useCallback((picks: Map<string, KnockoutPick>) => {
    setKnockoutPicks(picks)
    if (!isReadOnly) stableTriggerAutoSave()
  }, [isReadOnly, stableTriggerAutoSave])

  const handleCascadeReset = useCallback((resetMatchIds: string[]) => {
    setKnockoutPicks(prev => {
      const next = new Map(prev)
      for (const id of resetMatchIds) {
        next.delete(id)
      }
      return next
    })
    if (!isReadOnly) stableTriggerAutoSave()
  }, [isReadOnly, stableTriggerAutoSave])

  // =============================================
  // STEP COMPLETION CHECKS
  // =============================================

  const isGroupsComplete = useMemo(() => {
    if (groupRankings.size !== GROUP_LETTERS.length) return false
    return GROUP_LETTERS.every(letter => {
      const ranking = groupRankings.get(letter)
      return ranking && ranking.length >= 4
    })
  }, [groupRankings])

  const isThirdPlaceComplete = useMemo(() => {
    return thirdPlaceRanking.length === 12
  }, [thirdPlaceRanking])

  const isR32Complete = useMemo(() =>
    isRoundComplete(matches, knockoutPicks, ['round_32']),
  [matches, knockoutPicks])

  const isR16Complete = useMemo(() =>
    isRoundComplete(matches, knockoutPicks, ['round_16']),
  [matches, knockoutPicks])

  const isQFComplete = useMemo(() =>
    isRoundComplete(matches, knockoutPicks, ['quarter_final']),
  [matches, knockoutPicks])

  const isSFComplete = useMemo(() =>
    isRoundComplete(matches, knockoutPicks, ['semi_final']),
  [matches, knockoutPicks])

  const isThirdFinalComplete = useMemo(() =>
    isRoundComplete(matches, knockoutPicks, ['third_place', 'final']),
  [matches, knockoutPicks])

  const isKnockoutComplete = isR32Complete && isR16Complete && isQFComplete && isSFComplete && isThirdFinalComplete

  const totalKnockoutMatches = useMemo(() => {
    return matches.filter(m => m.stage !== 'group').length
  }, [matches])

  const knockoutPickedCount = useMemo(() => {
    return knockoutPicks.size
  }, [knockoutPicks])

  const canProceedFromStep = useCallback((step: number): boolean => {
    switch (step) {
      case 0: return isGroupsComplete
      case 1: return isThirdPlaceComplete
      case 2: return isR32Complete
      case 3: return isR16Complete
      case 4: return isQFComplete
      case 5: return isSFComplete
      case 6: return isThirdFinalComplete
      case 7: return true // Review step
      default: return false
    }
  }, [isGroupsComplete, isThirdPlaceComplete, isR32Complete, isR16Complete, isQFComplete, isSFComplete, isThirdFinalComplete])

  /** Check if a step can be navigated to (all prior steps must be complete) */
  const canNavigateToStep = useCallback((targetStep: number): boolean => {
    if (targetStep <= currentStep) return true
    for (let i = 0; i < targetStep; i++) {
      if (!canProceedFromStep(i)) return false
    }
    return true
  }, [currentStep, canProceedFromStep])

  // =============================================
  // NAVIGATION
  // =============================================

  const goNext = useCallback(() => {
    if (currentStep < STEPS.length - 1) {
      // When moving from Step 0 to Step 1, initialize third-place rankings
      if (currentStep === 0) {
        initializeThirdPlaceIfNeeded()
      }

      // Save before advancing
      if (!isReadOnly && pendingChanges.current) {
        saveBracketPicksRef.current()
      }

      setCurrentStep(prev => prev + 1)
      window.scrollTo(0, 0)
    }
  }, [currentStep, isReadOnly, initializeThirdPlaceIfNeeded])

  const goBack = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
      window.scrollTo(0, 0)
    }
  }, [currentStep])

  const goToStep = useCallback((idx: number) => {
    if (idx === currentStep) return
    if (idx === 1 && currentStep < 1) {
      initializeThirdPlaceIfNeeded()
    }
    setCurrentStep(idx)
    window.scrollTo(0, 0)
  }, [currentStep, initializeThirdPlaceIfNeeded])

  // =============================================
  // SUBMISSION
  // =============================================

  const handleSubmit = useCallback(async () => {
    setSubmitting(true)
    setError(null)

    try {
      await saveBracketPicksRef.current()

      const res = await fetch(`/api/pools/${poolId}/bracket-picks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry_id: entryId }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit predictions')
      }

      setIsSubmitted(true)
      setShowSubmitModal(false)
      showToast('Bracket predictions submitted! Good luck!', 'success')
      onSubmit?.()
    } catch (err: any) {
      setError(err.message || 'Failed to submit predictions')
      showToast('Failed to submit. Please try again.', 'error')
    } finally {
      setSubmitting(false)
    }
  }, [poolId, entryId, showToast, onSubmit])

  // =============================================
  // TEAM LOOKUP HELPER
  // =============================================

  const teamMap = useMemo(() => new Map(teams.map(t => [t.team_id, t])), [teams])

  // =============================================
  // RENDER
  // =============================================

  return (
    <div>
      {/* Submitted banner */}
      {isSubmitted && (
        <div className="flex items-center gap-3 p-4 rounded-xl border bg-success-50 border-success-200 text-success-800 mb-4">
          <svg className="w-5 h-5 text-success-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-medium">Your bracket predictions have been submitted. Good luck!</p>
        </div>
      )}

      {/* Locked banner */}
      {isLocked && !isSubmitted && (
        <div className="flex items-center gap-3 p-4 rounded-xl border bg-neutral-50 border-neutral-200 text-neutral-800 mb-4">
          <svg className="w-5 h-5 text-neutral-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <p className="text-sm font-medium">Your predictions have been locked by the pool admin.</p>
        </div>
      )}

      {/* Deadline info */}
      {deadlineInfo && !isSubmitted && (
        <div className={`flex items-center gap-3 p-4 rounded-xl border mb-4 ${
          deadlineInfo.isPast
            ? 'bg-danger-50 border-danger-200 text-danger-800'
            : 'bg-primary-50 border-primary-200 text-primary-800'
        }`}>
          <svg className={`w-5 h-5 shrink-0 ${deadlineInfo.isPast ? 'text-danger-600' : 'text-primary-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-medium">{deadlineInfo.text}</p>
        </div>
      )}

      {/* Error alert */}
      {error && (
        <Alert variant="error" className="mb-4">
          {error}
          {saveStatus === 'error' && (
            <button
              onClick={() => { setError(null); saveBracketPicksRef.current() }}
              className="ml-2 underline font-medium"
            >
              Retry
            </button>
          )}
        </Alert>
      )}

      {/* =============================================
          STEP INDICATOR (compact for 8 steps)
          ============================================= */}
      <div className="mb-6">
        {/* Current step label + progress */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-neutral-900">
            {STEPS[currentStep].label}
          </p>
          <p className="text-xs text-neutral-500">
            Step {currentStep + 1} of {STEPS.length}
          </p>
        </div>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5">
          {STEPS.map((step, idx) => {
            const isActive = idx === currentStep
            const isCompleted = idx < currentStep
            const canGo = canNavigateToStep(idx)

            return (
              <button
                key={step.key}
                type="button"
                onClick={() => canGo && goToStep(idx)}
                disabled={!canGo}
                title={step.label}
                className={`
                  h-2 rounded-full transition-all duration-200 flex-1
                  ${isActive
                    ? 'bg-success-500'
                    : isCompleted
                      ? 'bg-success-300 hover:bg-success-400'
                      : canGo
                        ? 'bg-neutral-200 hover:bg-neutral-300'
                        : 'bg-neutral-100'
                  }
                  ${canGo ? 'cursor-pointer' : 'cursor-default'}
                `}
              />
            )
          })}
        </div>
      </div>

      {/* Save status indicator */}
      <div className="flex items-center justify-end mb-4 min-h-[20px]">
        {saveStatus === 'saving' && (
          <span className="text-xs text-neutral-400 flex items-center gap-1.5">
            <span className="w-3 h-3 border-2 border-neutral-300 border-t-transparent rounded-full animate-spin" />
            Saving...
          </span>
        )}
        {saveStatus === 'saved' && (
          <span className="text-xs text-success-600 flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Saved
          </span>
        )}
        {saveStatus === 'error' && (
          <span className="text-xs text-danger-600">Save failed</span>
        )}
      </div>

      {/* =============================================
          STEP CONTENT
          ============================================= */}

      {/* Step 0: Group Rankings */}
      {currentStep === 0 && (
        <div>
          <h3 className="text-2xl font-bold text-neutral-900 mb-2">Rank Each Group</h3>
          <p className="text-sm text-neutral-600 mb-6">
            Drag teams to predict the finishing order for each group. The top 2 teams from each group advance to the knockout stage.
          </p>
          <BPGroupRankingStep
            teams={teams}
            groupRankings={groupRankings}
            onRankingsChange={isReadOnly ? () => {} : handleGroupRankingsChange}
          />
        </div>
      )}

      {/* Step 1: Third Place Rankings */}
      {currentStep === 1 && (
        <div>
          <h3 className="text-2xl font-bold text-neutral-900 mb-2">Rank Third-Place Teams</h3>
          <p className="text-sm text-neutral-600 mb-6">
            Drag to rank all 12 third-place teams. The top 8 will qualify for the Round of 32.
          </p>

          {thirdPlaceRanking.length > 0 && thirdPlaceRanking.some(id => !thirdPlaceTeamIdsFromGroups.includes(id)) && (
            <Alert variant="error" className="mb-4">
              Some third-place teams have changed because you modified group rankings.
              The ranking has been updated to reflect the current third-place teams.
            </Alert>
          )}

          <BPThirdPlaceStep
            teams={teams}
            thirdPlaceTeamIds={thirdPlaceRanking}
            onRankingsChange={isReadOnly ? () => {} : handleThirdPlaceChange}
          />
        </div>
      )}

      {/* Step 2: Round of 32 */}
      {currentStep === 2 && (
        <div>
          <h3 className="text-2xl font-bold text-neutral-900 mb-2">Round of 32</h3>
          <p className="text-sm text-neutral-600 mb-6">
            Pick the winner of each Round of 32 match. These picks determine the Round of 16 matchups.
          </p>
          <BPKnockoutPickerStep
            matches={matches}
            knockoutTeamMap={knockoutTeamMap}
            knockoutPicks={knockoutPicks}
            onPicksChange={isReadOnly ? () => {} : handleKnockoutPicksChange}
            onCascadeReset={isReadOnly ? () => {} : handleCascadeReset}
            visibleRounds={['round_32']}
          />
        </div>
      )}

      {/* Step 3: Round of 16 */}
      {currentStep === 3 && (
        <div>
          <h3 className="text-2xl font-bold text-neutral-900 mb-2">Round of 16</h3>
          <p className="text-sm text-neutral-600 mb-6">
            Pick the winner of each Round of 16 match to advance to the Quarter Finals.
          </p>
          <BPKnockoutPickerStep
            matches={matches}
            knockoutTeamMap={knockoutTeamMap}
            knockoutPicks={knockoutPicks}
            onPicksChange={isReadOnly ? () => {} : handleKnockoutPicksChange}
            onCascadeReset={isReadOnly ? () => {} : handleCascadeReset}
            visibleRounds={['round_16']}
          />
        </div>
      )}

      {/* Step 4: Quarter Finals */}
      {currentStep === 4 && (
        <div>
          <h3 className="text-2xl font-bold text-neutral-900 mb-2">Quarter Finals</h3>
          <p className="text-sm text-neutral-600 mb-6">
            Pick the 4 quarter final winners to advance to the Semi Finals.
          </p>
          <BPKnockoutPickerStep
            matches={matches}
            knockoutTeamMap={knockoutTeamMap}
            knockoutPicks={knockoutPicks}
            onPicksChange={isReadOnly ? () => {} : handleKnockoutPicksChange}
            onCascadeReset={isReadOnly ? () => {} : handleCascadeReset}
            visibleRounds={['quarter_final']}
          />
        </div>
      )}

      {/* Step 5: Semi Finals */}
      {currentStep === 5 && (
        <div>
          <h3 className="text-2xl font-bold text-neutral-900 mb-2">Semi Finals</h3>
          <p className="text-sm text-neutral-600 mb-6">
            Pick the 2 semi final winners. The losers will play for third place.
          </p>
          <BPKnockoutPickerStep
            matches={matches}
            knockoutTeamMap={knockoutTeamMap}
            knockoutPicks={knockoutPicks}
            onPicksChange={isReadOnly ? () => {} : handleKnockoutPicksChange}
            onCascadeReset={isReadOnly ? () => {} : handleCascadeReset}
            visibleRounds={['semi_final']}
          />
        </div>
      )}

      {/* Step 6: 3rd Place & Final */}
      {currentStep === 6 && (
        <div>
          <h3 className="text-2xl font-bold text-neutral-900 mb-2">3rd Place & Final</h3>
          <p className="text-sm text-neutral-600 mb-6">
            Pick the Third Place match winner and the World Cup Champion.
          </p>
          <BPKnockoutPickerStep
            matches={matches}
            knockoutTeamMap={knockoutTeamMap}
            knockoutPicks={knockoutPicks}
            onPicksChange={isReadOnly ? () => {} : handleKnockoutPicksChange}
            onCascadeReset={isReadOnly ? () => {} : handleCascadeReset}
            visibleRounds={['third_place', 'final']}
          />
        </div>
      )}

      {/* Step 7: Review & Submit */}
      {currentStep === REVIEW_STEP && (
        <div className="space-y-4">
          <h3 className="text-2xl font-bold text-neutral-900">Review Your Bracket</h3>

          {/* Champion Highlight */}
          {bracket.champion ? (
            <div className="bg-gradient-to-r from-warning-50 to-warning-100 border-2 border-warning-300 rounded-2xl p-5 text-center">
              <div className="text-3xl mb-1">&#127942;</div>
              <p className="text-[10px] font-semibold text-warning-600 uppercase tracking-wider mb-1">
                Your Predicted Champion
              </p>
              <div className="flex items-center justify-center gap-2.5 mb-3">
                {bracket.champion.flag_url && (
                  <img src={bracket.champion.flag_url} alt={bracket.champion.country_name} className="w-10 h-7 rounded-md object-cover" />
                )}
                <span className="text-xl font-bold text-neutral-900">{bracket.champion.country_name}</span>
              </div>
              <div className="flex items-center justify-center gap-6 text-sm">
                {bracket.runnerUp && (
                  <div className="flex items-center gap-1.5 text-neutral-600">
                    <span className="text-neutral-400 text-xs font-medium">2nd</span>
                    {bracket.runnerUp.flag_url && (
                      <img src={bracket.runnerUp.flag_url} alt={bracket.runnerUp.country_name} className="w-5 h-3.5 rounded-[2px] object-cover" />
                    )}
                    <span className="font-medium">{bracket.runnerUp.country_name}</span>
                  </div>
                )}
                {bracket.thirdPlace && (
                  <div className="flex items-center gap-1.5 text-neutral-600">
                    <span className="text-neutral-400 text-xs font-medium">3rd</span>
                    {bracket.thirdPlace.flag_url && (
                      <img src={bracket.thirdPlace.flag_url} alt={bracket.thirdPlace.country_name} className="w-5 h-3.5 rounded-[2px] object-cover" />
                    )}
                    <span className="font-medium">{bracket.thirdPlace.country_name}</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-5 text-center">
              <div className="text-2xl mb-1 opacity-30">&#127942;</div>
              <p className="text-sm text-neutral-400">No champion predicted yet</p>
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={() => goToStep(2)}
                  className="mt-2 text-xs text-primary-600 hover:text-primary-800 font-medium"
                >
                  Complete knockout picks
                </button>
              )}
            </div>
          )}

          {/* Group Rankings Summary */}
          <div className="bg-surface rounded-2xl border border-neutral-200 overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-neutral-900">Group Rankings</span>
                <Badge variant={isGroupsComplete ? 'green' : 'yellow'}>{groupRankings.size}/12</Badge>
              </div>
              {!isReadOnly && (
                <button onClick={() => goToStep(0)} className="text-xs text-primary-600 hover:text-primary-700 font-medium">
                  Edit
                </button>
              )}
            </div>
            <div className="px-4 pb-4 border-t border-neutral-100 pt-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {GROUP_LETTERS.map(letter => {
                  const ranking = groupRankings.get(letter) ?? []
                  if (ranking.length === 0) {
                    return (
                      <div key={letter} className="rounded-xl border border-dashed border-neutral-200 p-2.5">
                        <p className="text-xs font-bold text-neutral-400 mb-1">Group {letter}</p>
                        <p className="text-[10px] text-neutral-300">Not ranked</p>
                      </div>
                    )
                  }
                  return (
                    <div key={letter} className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-2.5">
                      <p className="text-xs font-bold text-neutral-700 mb-1.5">Group {letter}</p>
                      <div className="space-y-1">
                        {ranking.map((teamId, idx) => {
                          const team = teamMap.get(teamId)
                          if (!team) return null
                          return (
                            <div key={teamId} className="flex items-center gap-1.5">
                              <span className={`text-[10px] font-bold w-3 text-right ${
                                idx < 2 ? 'text-success-600' : idx === 2 ? 'text-warning-600' : 'text-neutral-400'
                              }`}>
                                {idx + 1}
                              </span>
                              {team.flag_url ? (
                                <img src={team.flag_url} alt={team.country_name} className="w-5 h-3.5 rounded-[2px] object-cover shrink-0" />
                              ) : (
                                <div className="w-5 h-3.5 rounded-[2px] bg-neutral-200 shrink-0" />
                              )}
                              <span className={`text-[11px] truncate ${idx <= 1 ? 'text-neutral-800 font-medium' : 'text-neutral-500'}`}>
                                {team.country_name}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Third Place Summary */}
          <div className="bg-surface rounded-2xl border border-neutral-200 overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-neutral-900">Third-Place Rankings</span>
                <Badge variant={isThirdPlaceComplete ? 'green' : 'yellow'}>{thirdPlaceRanking.length}/12</Badge>
              </div>
              {!isReadOnly && (
                <button onClick={() => goToStep(1)} className="text-xs text-primary-600 hover:text-primary-700 font-medium">
                  Edit
                </button>
              )}
            </div>
            <div className="px-4 pb-4 border-t border-neutral-100 pt-3">
              {thirdPlaceRanking.length === 0 ? (
                <p className="text-sm text-neutral-400 text-center py-3">No third-place rankings set</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
                  {thirdPlaceRanking.map((teamId, idx) => {
                    const team = teamMap.get(teamId)
                    if (!team) return null
                    const qualifies = idx < 8
                    return (
                      <div
                        key={teamId}
                        className={`flex items-center gap-2 py-1.5 px-2 rounded ${qualifies ? '' : 'opacity-45'}`}
                      >
                        <span className={`text-[10px] font-bold w-4 text-right ${qualifies ? 'text-success-600' : 'text-red-400'}`}>
                          {idx + 1}
                        </span>
                        {qualifies ? (
                          <svg className="w-3.5 h-3.5 text-success-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5 text-red-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                        {team.flag_url ? (
                          <img src={team.flag_url} alt={team.country_name} className="w-5 h-3.5 rounded-[2px] object-cover shrink-0" />
                        ) : (
                          <div className="w-5 h-3.5 rounded-[2px] bg-neutral-200 shrink-0" />
                        )}
                        <span className={`text-xs truncate ${qualifies ? 'text-neutral-800 font-medium' : 'text-neutral-400'}`}>
                          {team.country_name}
                        </span>
                        <span className="text-[10px] text-neutral-400 ml-auto shrink-0">
                          Grp {team.group_letter}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Knockout Bracket - Round by Round */}
          <div className="bg-surface rounded-2xl border border-neutral-200 overflow-hidden">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-neutral-900">Knockout Bracket</span>
                <Badge variant={isKnockoutComplete ? 'green' : 'yellow'}>{knockoutPickedCount}/{totalKnockoutMatches}</Badge>
              </div>
              {!isReadOnly && (
                <button onClick={() => goToStep(2)} className="text-xs text-primary-600 hover:text-primary-700 font-medium">
                  Edit
                </button>
              )}
            </div>
            <div className="px-4 pb-4 border-t border-neutral-100 pt-3 space-y-4">
              {[
                { stage: 'round_32', label: 'Round of 32', editStep: 2 },
                { stage: 'round_16', label: 'Round of 16', editStep: 3 },
                { stage: 'quarter_final', label: 'Quarter Finals', editStep: 4 },
                { stage: 'semi_final', label: 'Semi Finals', editStep: 5 },
                { stage: 'third_place', label: '3rd Place Match', editStep: 6 },
                { stage: 'final', label: 'Final', editStep: 6 },
              ].map(round => {
                const roundMatches = matches
                  .filter(m => m.stage === round.stage)
                  .sort((a, b) => a.match_number - b.match_number)
                if (roundMatches.length === 0) return null

                const pickedCount = roundMatches.filter(m => knockoutPicks.has(m.match_id)).length
                const isComplete = pickedCount === roundMatches.length

                return (
                  <div key={round.stage}>
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="text-xs font-semibold text-neutral-700">{round.label}</h4>
                      <span className={`text-[10px] font-medium ${isComplete ? 'text-success-600' : 'text-neutral-400'}`}>
                        {pickedCount}/{roundMatches.length}
                      </span>
                    </div>
                    <div className={`grid gap-1.5 ${
                      roundMatches.length > 4
                        ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
                        : roundMatches.length > 2
                        ? 'grid-cols-2 sm:grid-cols-3'
                        : roundMatches.length === 2
                        ? 'grid-cols-2'
                        : 'grid-cols-1 max-w-xs'
                    }`}>
                      {roundMatches.map(match => {
                        const pick = knockoutPicks.get(match.match_id)
                        const winnerTeam = pick ? teamMap.get(pick.winner_team_id) : null
                        const resolved = knockoutTeamMap.get(match.match_number)
                        const homeTeam = resolved?.home
                        const awayTeam = resolved?.away
                        const isChampionPath = bracket.champion && winnerTeam &&
                          winnerTeam.team_id === bracket.champion.team_id

                        return (
                          <div
                            key={match.match_id}
                            className={`rounded-xl border px-2.5 py-2 ${
                              isChampionPath
                                ? 'border-success-300 bg-success-50/60'
                                : winnerTeam
                                ? 'border-neutral-200 bg-neutral-50/50'
                                : 'border-dashed border-neutral-200 bg-white'
                            }`}
                          >
                            <div className="text-[10px] text-neutral-400 mb-1">M{match.match_number}</div>
                            {winnerTeam ? (
                              <div className="flex items-center gap-1.5">
                                {winnerTeam.flag_url ? (
                                  <img src={winnerTeam.flag_url} alt={winnerTeam.country_name} className="w-5 h-3.5 rounded-[2px] object-cover shrink-0" />
                                ) : (
                                  <div className="w-5 h-3.5 rounded-[2px] bg-neutral-200 shrink-0" />
                                )}
                                <span className={`text-xs font-medium truncate ${isChampionPath ? 'text-success-800' : 'text-neutral-800'}`}>
                                  {winnerTeam.country_name}
                                </span>
                                {pick?.predicted_penalty && (
                                  <span className="text-[9px] text-primary-500 font-medium shrink-0">(P)</span>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 text-[11px] text-neutral-400">
                                <span className="truncate">{homeTeam?.country_name ?? match.home_team_placeholder ?? 'TBD'}</span>
                                <span className="text-neutral-300">v</span>
                                <span className="truncate">{awayTeam?.country_name ?? match.away_team_placeholder ?? 'TBD'}</span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Submit Button */}
          {!isReadOnly && (
            <div className="mt-4">
              <Button
                variant="green"
                size="lg"
                fullWidth
                onClick={() => setShowSubmitModal(true)}
                disabled={!isGroupsComplete || !isThirdPlaceComplete || !isKnockoutComplete}
              >
                Submit Predictions
              </Button>
              {(!isGroupsComplete || !isThirdPlaceComplete || !isKnockoutComplete) && (
                <p className="text-xs text-neutral-500 text-center mt-2">
                  Complete all steps before submitting.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* =============================================
          NAVIGATION FOOTER
          ============================================= */}
      {currentStep < REVIEW_STEP && (
        <div className="mt-6 sm:mt-8 flex items-center justify-between">
          <div>
            {currentStep > 0 && (
              <Button variant="outline" size="sm" onClick={goBack}>
                Back
              </Button>
            )}
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={goNext}
            disabled={!canProceedFromStep(currentStep)}
          >
            {canProceedFromStep(currentStep)
              ? `Proceed to ${STEPS[currentStep + 1]?.label ?? 'Review'}`
              : `Complete ${STEPS[currentStep].label}`
            }
          </Button>
        </div>
      )}

      {/* =============================================
          SUBMIT CONFIRMATION MODAL
          ============================================= */}
      {showSubmitModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 modal-overlay sm:p-4" onClick={() => setShowSubmitModal(false)}>
          <div className="relative bg-surface sm:rounded-2xl rounded-t-2xl shadow-xl sm:max-w-md w-full p-6 max-h-[90vh] overflow-y-auto dark:shadow-none dark:border dark:border-border-default modal-panel" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-neutral-900 mb-2">
              Submit Bracket Predictions?
            </h3>
            <div className="bg-warning-50 border border-warning-200 rounded-xl p-3 mb-4">
              <p className="text-sm text-warning-800">
                Once submitted, you <strong>cannot</strong> make changes to your bracket predictions.
              </p>
            </div>

            {bracket.champion && (
              <div className="bg-neutral-50 rounded-xl p-3 mb-4 flex items-center gap-2">
                <span className="text-sm text-neutral-700">Your champion:</span>
                {bracket.champion.flag_url && (
                  <img src={bracket.champion.flag_url} alt={bracket.champion.country_name} className="w-6 h-4 rounded-[2px] object-cover" />
                )}
                <span className="text-sm font-bold text-neutral-900">{bracket.champion.country_name}</span>
              </div>
            )}

            <div className="bg-neutral-50 rounded-xl p-3 mb-4 space-y-1">
              <p className="text-sm text-neutral-700">
                Groups ranked: <strong>{groupRankings.size} / {GROUP_LETTERS.length}</strong>
              </p>
              <p className="text-sm text-neutral-700">
                Third-place teams ranked: <strong>{thirdPlaceRanking.length} / 12</strong>
              </p>
              <p className="text-sm text-neutral-700">
                Knockout matches picked: <strong>{knockoutPickedCount} / {totalKnockoutMatches}</strong>
              </p>
            </div>

            {(!isGroupsComplete || !isThirdPlaceComplete || !isKnockoutComplete) && (
              <Alert variant="error" className="mb-4">
                You must complete all predictions before submitting.
              </Alert>
            )}

            <div className="flex gap-3">
              <Button
                variant="gray"
                onClick={() => setShowSubmitModal(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                variant="green"
                onClick={handleSubmit}
                disabled={submitting || !isGroupsComplete || !isThirdPlaceComplete || !isKnockoutComplete}
                loading={submitting}
                loadingText="Submitting..."
                className="flex-1"
              >
                Submit Predictions
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Bottom spacer for mobile */}
      <div className="h-4" />
    </div>
  )
}
