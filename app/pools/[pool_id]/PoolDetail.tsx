'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Badge, getStatusVariant } from '@/components/ui/Badge'
import { AppHeader } from '@/components/ui/AppHeader'
import { LeaderboardTab } from './LeaderboardTab'
import { ResultsTab } from './ResultsTab'
import { StandingsTab } from './StandingsTab'
import { ScoringRulesTab } from './ScoringRulesTab'
import { HowToPlayTab } from './HowToPlayTab'
import PredictionsFlow, { type SaveStatus } from '@/components/predictions/PredictionsFlow'
import { EntriesListView } from '@/components/predictions/EntriesListView'
import { EntryDetailView } from '@/components/predictions/EntryDetailView'
import { MembersTab } from './admin/MembersTab'
import { ScoringTab } from './admin/ScoringTab'
import { SettingsTab } from './admin/SettingsTab'
import { DEFAULT_POOL_SETTINGS, calculatePoints, checkKnockoutTeamsMatch, type PoolSettings } from './results/points'
import { calculateAllBonusPoints, type MatchWithResult } from '@/lib/bonusCalculation'
import { resolveFullBracket } from '@/lib/bracketResolver'
import type { PredictionMap, Team } from '@/lib/tournament'
import type {
  PoolData,
  MemberData,
  EntryData,
  MatchData,
  SettingsData,
  PredictionData,
  TeamData,
  ExistingPrediction,
  PlayerScoreData,
  BonusScoreData,
} from './types'
import type { MatchConductData } from '@/lib/tournament'
import { formatTimeAgo } from '@/lib/format'

// =====================
// TAB DEFINITIONS
// =====================
type Tab =
  | 'leaderboard'
  | 'predictions'
  | 'results'
  | 'standings'
  | 'scoring_rules'
  | 'how_to_play'
  | 'members'
  | 'scoring_config'
  | 'settings'

const USER_TABS: { key: Tab; label: string }[] = [
  { key: 'how_to_play', label: 'How to Play' },
  { key: 'leaderboard', label: 'Leaderboard' },
  { key: 'predictions', label: 'Predictions' },
  { key: 'results', label: 'Results' },
  { key: 'standings', label: 'Standings' },
  { key: 'scoring_rules', label: 'Scoring Rules' },
]

const ADMIN_TABS: { key: Tab; label: string }[] = [
  { key: 'members', label: 'Members' },
  { key: 'scoring_config', label: 'Scoring Config' },
  { key: 'settings', label: 'Settings' },
]

// =====================
// PROPS
// =====================
type PoolDetailProps = {
  pool: PoolData
  members: MemberData[]
  matches: MatchData[]
  settings: SettingsData | null
  userPredictions: ExistingPrediction[]
  allPredictions: PredictionData[]
  teams: TeamData[]
  conductData: MatchConductData[]
  playerScores: PlayerScoreData[]
  bonusScores: BonusScoreData[]
  memberId: string
  currentUserId: string
  isAdmin: boolean
  isPastDeadline: boolean
  psoEnabled: boolean
  userEntries: EntryData[]
  isSuperAdmin?: boolean
  hasSeenHowToPlay: boolean
}

// =====================
// COMPONENT
// =====================
export function PoolDetail({
  pool: initialPool,
  members: initialMembers,
  matches: initialMatches,
  settings: initialSettings,
  userPredictions,
  allPredictions: initialAllPredictions,
  teams,
  conductData,
  playerScores,
  bonusScores,
  memberId,
  currentUserId,
  isAdmin,
  isPastDeadline,
  psoEnabled,
  userEntries,
  isSuperAdmin,
  hasSeenHowToPlay,
}: PoolDetailProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const urlTab = searchParams.get('tab') as Tab
    if (urlTab) return urlTab
    return hasSeenHowToPlay ? 'leaderboard' : 'how_to_play'
  })

  // Mark how-to-play as seen on first visit (non-blocking)
  useEffect(() => {
    if (!hasSeenHowToPlay) {
      const supabase = createClient()
      supabase
        .from('pool_members')
        .update({ has_seen_how_to_play: true })
        .eq('member_id', memberId)
        .then()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync tab state on browser back/forward (popstate)
  useEffect(() => {
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search)
      const tab = (params.get('tab') as Tab) || 'leaderboard'
      setActiveTab(tab)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const [pool, setPool] = useState(initialPool)
  const [members, setMembers] = useState(initialMembers)
  const [matches, setMatches] = useState(initialMatches)
  const [settings, setSettings] = useState(initialSettings)
  const [allPredictions, setAllPredictions] = useState(initialAllPredictions)
  const [showNavWarning, setShowNavWarning] = useState(false)
  const [pendingTab, setPendingTab] = useState<Tab | null>(null)
  const settingsDirtyRef = useRef(false)

  // Entry management
  const [entries, setEntries] = useState<EntryData[]>(userEntries)
  const [activeEntryId, setActiveEntryId] = useState<string>(
    userEntries[0]?.entry_id || ''
  )
  const activeEntry = entries.find(e => e.entry_id === activeEntryId) || entries[0] || null

  // Entry rename state
  const [editingEntryName, setEditingEntryName] = useState(false)
  const [entryNameDraft, setEntryNameDraft] = useState('')
  const [savingEntryName, setSavingEntryName] = useState(false)
  const [addingEntry, setAddingEntry] = useState(false)
  const [showDeleteEntryModal, setShowDeleteEntryModal] = useState(false)
  const [deletingEntry, setDeletingEntry] = useState(false)
  const entryNameInputRef = useRef<HTMLInputElement>(null)
  const [predictionStatus, setPredictionStatus] = useState<{ saveStatus: SaveStatus; lastSavedAt: string | null; predictedCount: number }>({ saveStatus: 'idle', lastSavedAt: null, predictedCount: 0 })

  // Multi-entry view state (list vs detail)
  const [predictionsView, setPredictionsView] = useState<{ mode: 'list' } | { mode: 'detail'; entryId: string }>({ mode: 'list' })
  const [pendingBackToList, setPendingBackToList] = useState(false)

  // Derive submission state from active entry
  const hasSubmitted = activeEntry?.has_submitted_predictions ?? false
  const submittedAt = activeEntry?.predictions_submitted_at ?? null
  const lastSavedAt = activeEntry?.predictions_last_saved_at ?? null
  const predictionsLocked = activeEntry?.predictions_locked ?? false

  const canAddEntry = pool.max_entries_per_user > entries.length && !isPastDeadline
  const canDeleteEntry = entries.length > 1 && activeEntry && !activeEntry.has_submitted_predictions && !isPastDeadline

  // Rename active entry
  const handleRenameEntry = async () => {
    if (!activeEntry || !entryNameDraft.trim() || savingEntryName) return
    const trimmed = entryNameDraft.trim()
    if (trimmed === activeEntry.entry_name) {
      setEditingEntryName(false)
      return
    }
    setSavingEntryName(true)
    try {
      const res = await fetch(`/api/pools/${pool.pool_id}/entries`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId: activeEntry.entry_id, entryName: trimmed }),
      })
      if (res.ok) {
        setEntries(prev => prev.map(e =>
          e.entry_id === activeEntry.entry_id ? { ...e, entry_name: trimmed } : e
        ))
        setEditingEntryName(false)
      }
    } finally {
      setSavingEntryName(false)
    }
  }

  // Add new entry
  const handleAddEntry = async () => {
    if (addingEntry || !canAddEntry) return
    setAddingEntry(true)
    try {
      const res = await fetch(`/api/pools/${pool.pool_id}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (res.ok) {
        const data = await res.json()
        setEntries(prev => [...prev, data.entry as EntryData])
        setActiveEntryId(data.entry.entry_id)
        // Start editing the new entry name
        setEntryNameDraft(data.entry.entry_name)
        setEditingEntryName(true)
      }
    } finally {
      setAddingEntry(false)
    }
  }

  // Delete active entry
  const handleDeleteEntry = async () => {
    if (!activeEntry || deletingEntry || !canDeleteEntry) return
    setDeletingEntry(true)
    try {
      const res = await fetch(`/api/pools/${pool.pool_id}/entries?entryId=${activeEntry.entry_id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        const remaining = entries.filter(e => e.entry_id !== activeEntry.entry_id)
        setEntries(remaining)
        setActiveEntryId(remaining[0]?.entry_id || '')
        setShowDeleteEntryModal(false)
        setPredictionsView({ mode: 'list' })
        // Clear cached predictions for deleted entry
        setLiveEntryPredictions(prev => {
          const next = { ...prev }
          delete next[activeEntry.entry_id]
          return next
        })
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to delete entry')
      }
    } finally {
      setDeletingEntry(false)
    }
  }

  // Live predictions fetched client-side (overrides server data when available)
  const [liveEntryPredictions, setLiveEntryPredictions] = useState<Record<string, ExistingPrediction[]>>({})
  const [loadingPredictions, setLoadingPredictions] = useState(false)

  // Fetch predictions for the active entry from the database
  const fetchEntryPredictions = useCallback(async (entryId: string) => {
    setLoadingPredictions(true)
    try {
      const supabase = createClient()
      const { data } = await supabase
        .from('predictions')
        .select('match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id, prediction_id')
        .eq('entry_id', entryId)
      if (data) {
        setLiveEntryPredictions(prev => ({
          ...prev,
          [entryId]: data as ExistingPrediction[],
        }))
      }
    } finally {
      setLoadingPredictions(false)
    }
  }, [])

  // Navigate into an entry's detail view (multi-entry)
  const handleOpenEntryDetail = useCallback((entry: EntryData) => {
    setActiveEntryId(entry.entry_id)
    // Clear stale cached predictions so EntryDetailView doesn't mount with old data
    setLiveEntryPredictions(prev => {
      const next = { ...prev }
      delete next[entry.entry_id]
      return next
    })
    setPredictionsView({ mode: 'detail', entryId: entry.entry_id })
    // Fetch fresh predictions — EntryDetailView is gated on loadingPredictions
    fetchEntryPredictions(entry.entry_id)
  }, [fetchEntryPredictions])

  // Navigate back to entries list (silently save any pending changes, refresh list data)
  const handleBackToList = useCallback(async () => {
    if (predictionsRef.current?.hasUnsaved()) {
      await predictionsRef.current.save()
    }

    // Refresh predictions + entry metadata so list view shows up-to-date progress/timestamps
    const entryId = activeEntryId
    if (entryId) {
      const supabase = createClient()
      const [predsResult, entryResult] = await Promise.all([
        supabase
          .from('predictions')
          .select('prediction_id, entry_id, match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id')
          .eq('entry_id', entryId),
        supabase
          .from('pool_entries')
          .select('has_submitted_predictions, predictions_submitted_at, predictions_last_saved_at')
          .eq('entry_id', entryId)
          .single(),
      ])
      if (predsResult.data) {
        setAllPredictions(prev => [
          ...prev.filter(p => p.entry_id !== entryId),
          ...(predsResult.data as PredictionData[]),
        ])
      }
      if (entryResult.data) {
        setEntries(prev => prev.map(e =>
          e.entry_id === entryId
            ? {
                ...e,
                predictions_last_saved_at: entryResult.data.predictions_last_saved_at,
                has_submitted_predictions: entryResult.data.has_submitted_predictions,
                predictions_submitted_at: entryResult.data.predictions_submitted_at,
              }
            : e
        ))
      }
    }

    setPredictionsView({ mode: 'list' })
  }, [activeEntryId])

  // Delete entry from list view (needs to set active first for handleDeleteEntry)
  const handleDeleteEntryFromList = useCallback((entry: EntryData) => {
    setActiveEntryId(entry.entry_id)
    setShowDeleteEntryModal(true)
  }, [])

  // Rename entry from list view
  const handleRenameEntryFromList = useCallback(async (entry: EntryData, newName: string) => {
    const res = await fetch(`/api/pools/${pool.pool_id}/entries`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryId: entry.entry_id, entryName: newName }),
    })
    if (res.ok) {
      setEntries(prev => prev.map(e =>
        e.entry_id === entry.entry_id ? { ...e, entry_name: newName } : e
      ))
    }
  }, [pool.pool_id])

  // Focus input when editing starts
  useEffect(() => {
    if (editingEntryName && entryNameInputRef.current) {
      entryNameInputRef.current.focus()
      entryNameInputRef.current.select()
    }
  }, [editingEntryName])

  // Sync server-refreshed props into local state
  useEffect(() => { setPool(initialPool) }, [initialPool])
  useEffect(() => { setMembers(initialMembers) }, [initialMembers])
  useEffect(() => { setMatches(initialMatches) }, [initialMatches])
  useEffect(() => { setSettings(initialSettings) }, [initialSettings])
  useEffect(() => { setAllPredictions(initialAllPredictions) }, [initialAllPredictions])

  // Ref to check PredictionsFlow unsaved state
  const predictionsRef = useRef<{ hasUnsaved: () => boolean; save: () => Promise<void> } | null>(null)

  // Leave pool state
  const [showLeaveModal, setShowLeaveModal] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const adminCount = members.filter((m) => m.role === 'admin').length
  const isSoleAdmin = isAdmin && adminCount <= 1

  async function handleLeavePool() {
    setLeaving(true)
    const supabase = createClient()

    const { error } = await supabase
      .from('pool_members')
      .delete()
      .eq('member_id', memberId)

    if (error) {
      setLeaving(false)
      setShowLeaveModal(false)
      return
    }

    await supabase.rpc('recalculate_pool_leaderboard', {
      p_pool_id: pool.pool_id,
    })

    router.push('/pools')
  }

  // Auto-refresh data on leaderboard, results, and standings tabs
  useEffect(() => {
    const autoRefreshTabs: Tab[] = ['leaderboard', 'results', 'standings']
    if (!autoRefreshTabs.includes(activeTab)) return

    const interval = setInterval(() => router.refresh(), 30000)
    return () => clearInterval(interval)
  }, [activeTab, router])

  const switchTab = useCallback((tab: Tab) => {
    setActiveTab(tab)
    // Update URL without full navigation so back/forward works
    const url = new URL(window.location.href)
    if (tab === 'leaderboard') {
      url.searchParams.delete('tab')
    } else {
      url.searchParams.set('tab', tab)
    }
    window.history.pushState({}, '', url.toString())
  }, [])

  const handleTabSwitch = useCallback((tab: Tab) => {
    // If leaving predictions tab with unsaved changes, show warning
    if (activeTab === 'predictions' && tab !== 'predictions' && predictionsRef.current?.hasUnsaved()) {
      setPendingTab(tab)
      setShowNavWarning(true)
      return
    }
    // If leaving settings tab with unsaved changes, show warning
    if (activeTab === 'settings' && tab !== 'settings' && settingsDirtyRef.current) {
      setPendingTab(tab)
      setShowNavWarning(true)
      return
    }
    switchTab(tab)
  }, [activeTab, switchTab])

  const handleSaveAndLeave = async () => {
    if (predictionsRef.current) {
      await predictionsRef.current.save()
    }
    if (pendingBackToList) {
      setPredictionsView({ mode: 'list' })
      setPendingBackToList(false)
    } else if (pendingTab) {
      switchTab(pendingTab)
    }
    setShowNavWarning(false)
    setPendingTab(null)
  }

  const handleLeaveWithoutSaving = () => {
    if (pendingBackToList) {
      setPredictionsView({ mode: 'list' })
      setPendingBackToList(false)
    } else if (pendingTab) {
      switchTab(pendingTab)
    }
    setShowNavWarning(false)
    setPendingTab(null)
  }

  const handleCancelNav = () => {
    setShowNavWarning(false)
    setPendingTab(null)
    setPendingBackToList(false)
  }

  // Build pool settings for points calculation
  const poolSettings: PoolSettings = settings
    ? {
        ...DEFAULT_POOL_SETTINGS,
        ...settings,
        pso_exact_score: settings.pso_exact_score ?? 0,
        pso_correct_difference: settings.pso_correct_difference ?? 0,
        pso_correct_result: settings.pso_correct_result ?? 0,
      }
    : DEFAULT_POOL_SETTINGS

  // =============================================
  // Compute true total points (match + bonus) for each entry — same logic as LeaderboardTab
  // =============================================
  const computedEntryTotals = useMemo(() => {
    const map = new Map<string, number>()

    // Convert data to types needed by scoring functions
    const matchesWithResult: MatchWithResult[] = matches.map((m) => ({
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
      tournament_id: m.tournament_id,
    }))

    const tournamentTeams: Team[] = teams.map((t) => ({
      team_id: t.team_id,
      country_name: t.country_name,
      country_code: t.country_code,
      group_letter: t.group_letter,
      fifa_ranking_points: t.fifa_ranking_points,
      flag_url: t.flag_url,
    }))

    // Build lookup for point adjustments from member entries
    const adjustmentMap = new Map<string, number>()
    for (const member of members) {
      for (const entry of member.entries || []) {
        adjustmentMap.set(entry.entry_id, entry.point_adjustment ?? 0)
      }
    }

    // Group predictions by entry_id
    const predsByEntry = new Map<string, PredictionData[]>()
    for (const p of allPredictions) {
      const existing = predsByEntry.get(p.entry_id) || []
      existing.push(p)
      predsByEntry.set(p.entry_id, existing)
    }

    for (const [entryId, preds] of predsByEntry) {
      // Build prediction map for this entry
      const predictionMap: PredictionMap = new Map()
      const predMap = new Map(preds.map(p => [p.match_id, p]))
      for (const p of preds) {
        predictionMap.set(p.match_id, {
          home: p.predicted_home_score,
          away: p.predicted_away_score,
          homePso: p.predicted_home_pso ?? null,
          awayPso: p.predicted_away_pso ?? null,
          winnerTeamId: p.predicted_winner_team_id ?? null,
        })
      }

      // Resolve bracket for knockout team matching
      const bracket = resolveFullBracket({
        matches: matchesWithResult,
        predictionMap,
        teams: tournamentTeams,
        conductData,
      })

      // Compute match points
      let matchPts = 0
      for (const m of matches) {
        if ((m.is_completed || m.status === 'live') && m.home_score_ft !== null && m.away_score_ft !== null) {
          const pred = predMap.get(m.match_id)
          if (!pred) continue

          const resolved = bracket.knockoutTeamMap.get(m.match_number)
          const teamsMatch = checkKnockoutTeamsMatch(
            m.stage,
            m.home_team_id,
            m.away_team_id,
            resolved?.home?.team_id ?? null,
            resolved?.away?.team_id ?? null,
          )

          const hasPso = m.home_score_pso !== null && m.away_score_pso !== null
          const result = calculatePoints(
            pred.predicted_home_score,
            pred.predicted_away_score,
            m.home_score_ft,
            m.away_score_ft,
            m.stage,
            poolSettings,
            hasPso
              ? {
                  actualHomePso: m.home_score_pso!,
                  actualAwayPso: m.away_score_pso!,
                  predictedHomePso: pred.predicted_home_pso,
                  predictedAwayPso: pred.predicted_away_pso,
                }
              : undefined,
            teamsMatch,
          )
          matchPts += result.points
        }
      }

      // Compute bonus points
      const bonusEntries = calculateAllBonusPoints({
        memberId: entryId,
        memberPredictions: predictionMap,
        matches: matchesWithResult,
        teams: tournamentTeams,
        conductData,
        settings: poolSettings,
        tournamentAwards: null,
      })
      const bonusPts = bonusEntries.reduce((sum, e) => sum + e.points_earned, 0)
      const adjustment = adjustmentMap.get(entryId) ?? 0

      map.set(entryId, matchPts + bonusPts + adjustment)
    }

    return map
  }, [allPredictions, matches, teams, conductData, poolSettings, members])

  // Fetch predictions when switching to predictions tab or changing active entry
  useEffect(() => {
    if (activeTab === 'predictions' && activeEntry) {
      fetchEntryPredictions(activeEntry.entry_id)
    }
  }, [activeTab, activeEntry?.entry_id, fetchEntryPredictions])

  // Derive active entry's predictions: prefer live data, fall back to server data
  const activeEntryPredictions: ExistingPrediction[] = useMemo(() => {
    if (!activeEntry) return []
    // Use live-fetched predictions if available
    if (liveEntryPredictions[activeEntry.entry_id]) {
      return liveEntryPredictions[activeEntry.entry_id]
    }
    // Fall back to server-fetched predictions for default entry
    if (activeEntry.entry_id === userEntries[0]?.entry_id) {
      return userPredictions
    }
    // Fall back to allPredictions for other entries
    return allPredictions
      .filter(p => p.entry_id === activeEntry.entry_id)
      .map(p => ({
        match_id: p.match_id,
        predicted_home_score: p.predicted_home_score,
        predicted_away_score: p.predicted_away_score,
        predicted_home_pso: p.predicted_home_pso,
        predicted_away_pso: p.predicted_away_pso,
        predicted_winner_team_id: p.predicted_winner_team_id,
        prediction_id: p.prediction_id,
      }))
  }, [activeEntry, userPredictions, allPredictions, userEntries, liveEntryPredictions])

  // Build user prediction list for results tab
  const userPredictionsList = activeEntryPredictions.map((p) => ({
    match_id: p.match_id,
    predicted_home_score: p.predicted_home_score,
    predicted_away_score: p.predicted_away_score,
    predicted_home_pso: p.predicted_home_pso,
    predicted_away_pso: p.predicted_away_pso,
    predicted_winner_team_id: p.predicted_winner_team_id,
  }))

  // Transform matches for predictions flow (needs home_team/away_team with flag_url)
  const predictionsMatches = matches.map((m) => ({
    ...m,
    home_team: m.home_team ? { country_name: m.home_team.country_name, flag_url: null } : null,
    away_team: m.away_team ? { country_name: m.away_team.country_name, flag_url: null } : null,
  }))

  const tabs = isAdmin ? [...USER_TABS, ...ADMIN_TABS] : USER_TABS

  // Swipe navigation for mobile
  const allTabKeys = useMemo(() => tabs.map(t => t.key), [tabs])
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null)

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() }
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartRef.current) return
    const touch = e.changedTouches[0]
    const deltaX = touch.clientX - touchStartRef.current.x
    const deltaY = touch.clientY - touchStartRef.current.y
    const elapsed = Date.now() - touchStartRef.current.time
    touchStartRef.current = null

    // Only trigger on fast, deliberate horizontal swipes
    // Must travel >60px horizontally, be more horizontal than vertical, and complete within 300ms
    if (Math.abs(deltaX) < 60 || Math.abs(deltaY) > Math.abs(deltaX) || elapsed > 300) return

    // Ignore swipes that started on interactive elements (inputs, textareas, selects, scrollable tables)
    const target = e.target as HTMLElement
    if (target.closest('input, textarea, select, [contenteditable], .overflow-x-auto, .overflow-x-scroll')) return

    const currentIndex = allTabKeys.indexOf(activeTab)
    if (currentIndex === -1) return

    const nextIndex = deltaX < 0
      ? Math.min(currentIndex + 1, allTabKeys.length - 1)  // swipe left = next tab
      : Math.max(currentIndex - 1, 0)                       // swipe right = prev tab

    if (nextIndex !== currentIndex) {
      handleTabSwitch(allTabKeys[nextIndex])
    }
  }, [activeTab, allTabKeys, handleTabSwitch])

  return (
    <div className="min-h-screen bg-surface-secondary">
      {/* Shared app header with breadcrumbs + pool badges */}
      <AppHeader
        breadcrumbs={[
          { label: pool.pool_name },
        ]}
        badges={
          <>
            <Badge variant={getStatusVariant(pool.status)}>{pool.status}</Badge>
            {isAdmin && <Badge variant="outline">Admin</Badge>}
          </>
        }
        isSuperAdmin={isSuperAdmin}
      />

      {/* Tab navigation */}
      <div className="sticky top-[57px] z-[9] bg-surface">
        <div className="relative">
          <div className="max-w-6xl mx-auto px-2 sm:px-6">
            <div className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto scrollbar-hide -mx-2 px-2 sm:mx-0 sm:px-0 py-2">
              {USER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => handleTabSwitch(tab.key)}
                  className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab.key
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}

              {isAdmin && (
                <>
                  <div className="flex items-center px-1 sm:px-2">
                    <div className="h-5 w-px bg-neutral-300" />
                  </div>

                  {ADMIN_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => handleTabSwitch(tab.key)}
                      className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
                        activeTab === tab.key
                          ? 'bg-warning-600 text-white shadow-sm'
                          : 'text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </>
              )}

              {/* Leave Pool button */}
              {!isSoleAdmin && (
                <>
                  <div className="flex items-center px-1 sm:px-2">
                    <div className="h-5 w-px bg-neutral-300" />
                  </div>
                  <button
                    onClick={() => setShowLeaveModal(true)}
                    className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors text-danger-600 hover:bg-danger-50"
                  >
                    Leave Pool
                  </button>
                </>
              )}
            </div>
          </div>
          {/* Scroll fade indicator for mobile */}
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-surface to-transparent pointer-events-none sm:hidden" />
        </div>
      </div>

      {/* Tab content */}
      <main
        className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div key={activeTab} className="tab-transition">
            {activeTab === 'leaderboard' && (
              <LeaderboardTab
                members={members}
                playerScores={playerScores}
                bonusScores={bonusScores}
                matches={matches}
                teams={teams}
                conductData={conductData}
                allPredictions={allPredictions}
                poolSettings={poolSettings}
                maxEntriesPerUser={pool.max_entries_per_user}
                currentUserId={currentUserId}
              />
            )}

            {activeTab === 'predictions' && activeEntry && (
              pool.max_entries_per_user > 1 ? (
                // Multi-entry: list view or detail view
                predictionsView.mode === 'list' ? (
                  <EntriesListView
                    entries={entries}
                    poolId={pool.pool_id}
                    totalMatches={matches.length}
                    isPastDeadline={isPastDeadline}
                    allPredictions={allPredictions}
                    canAddEntry={canAddEntry}
                    addingEntry={addingEntry}
                    onAddEntry={handleAddEntry}
                    onDeleteEntry={handleDeleteEntryFromList}
                    onRenameEntry={handleRenameEntryFromList}
                    onEditEntry={handleOpenEntryDetail}
                  />
                ) : loadingPredictions ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
                  </div>
                ) : (
                  <EntryDetailView
                    entry={entries.find(e => e.entry_id === predictionsView.entryId) || activeEntry}
                    onBack={handleBackToList}
                    matches={predictionsMatches}
                    teams={teams}
                    poolId={pool.pool_id}
                    existingPredictions={activeEntryPredictions}
                    isPastDeadline={isPastDeadline}
                    psoEnabled={psoEnabled}
                    predictionsLocked={predictionsLocked}
                    onUnsavedChangesRef={predictionsRef}
                    onStatusChange={setPredictionStatus}
                  />
                )
              ) : (
                // Single-entry: render PredictionsFlow directly
                <div>
                  <div className="mb-6">
                    {editingEntryName ? (
                      <div className="flex items-center gap-2">
                        <input
                          ref={entryNameInputRef}
                          type="text"
                          value={entryNameDraft}
                          onChange={e => setEntryNameDraft(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleRenameEntry()
                            if (e.key === 'Escape') setEditingEntryName(false)
                          }}
                          className="px-3 py-1.5 border border-primary-300 rounded-lg text-sm font-medium text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500 w-48"
                          maxLength={40}
                          placeholder="Entry name..."
                        />
                        <button
                          onClick={handleRenameEntry}
                          disabled={savingEntryName}
                          className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
                        >
                          {savingEntryName ? '...' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditingEntryName(false)}
                          className="px-2 py-1.5 text-sm text-neutral-500 hover:text-neutral-700"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 overflow-x-auto pb-1">
                        <span className="text-sm font-semibold text-neutral-900">{activeEntry.entry_name}</span>

                        {!isPastDeadline && !predictionsLocked && (
                          <button
                            onClick={() => {
                              setEntryNameDraft(activeEntry.entry_name)
                              setEditingEntryName(true)
                            }}
                            className="p-1 text-neutral-400 hover:text-neutral-600 transition-colors shrink-0"
                            title="Rename entry"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                          </button>
                        )}

                        {/* Status badge + save status (right-aligned) */}
                        <div className="ml-auto flex items-center gap-1.5 shrink-0 text-xs">
                          {hasSubmitted ? (
                            <span className="px-1.5 py-0.5 rounded-full font-semibold bg-success-100 text-success-700">Submitted</span>
                          ) : predictionStatus.predictedCount > 0 ? (
                            <span className="px-1.5 py-0.5 rounded-full font-semibold bg-warning-100 text-warning-700">Draft</span>
                          ) : null}
                          <span className="text-neutral-400 whitespace-nowrap" suppressHydrationWarning>
                            {predictionStatus.saveStatus === 'saving' && 'Saving...'}
                            {predictionStatus.saveStatus === 'saved' && '\u2713 Saved'}
                            {predictionStatus.saveStatus === 'error' && <span className="text-danger-600">Failed</span>}
                            {(predictionStatus.saveStatus === 'idle') && predictionStatus.lastSavedAt && !hasSubmitted && `Saved ${formatTimeAgo(predictionStatus.lastSavedAt)}`}
                            {hasSubmitted && submittedAt && formatTimeAgo(submittedAt)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <PredictionsFlow
                    key={activeEntryId}
                    matches={predictionsMatches}
                    teams={teams}
                    entryId={activeEntry.entry_id}
                    poolId={pool.pool_id}
                    existingPredictions={activeEntryPredictions}
                    isPastDeadline={isPastDeadline}
                    psoEnabled={psoEnabled}
                    hasSubmitted={hasSubmitted}
                    submittedAt={submittedAt}
                    lastSavedAt={lastSavedAt}
                    predictionsLocked={predictionsLocked}
                    onUnsavedChangesRef={predictionsRef}
                    onStatusChange={setPredictionStatus}
                  />
                </div>
              )
            )}

            {activeTab === 'results' && (
              <ResultsTab
                matches={matches}
                predictions={userPredictionsList}
                poolSettings={poolSettings}
                teams={teams}
                conductData={conductData}
                userPredictions={userPredictions}
                bonusScores={bonusScores}
                isAdmin={isAdmin}
                members={members}
                allPredictions={allPredictions}
                currentEntryId={activeEntry?.entry_id || ''}
                userEntries={entries}
              />
            )}

            {activeTab === 'standings' && (
              <StandingsTab
                matches={matches}
                teams={teams}
                conductData={conductData}
              />
            )}

            {activeTab === 'scoring_rules' && (
              <ScoringRulesTab settings={settings} />
            )}

            {activeTab === 'how_to_play' && (
              <HowToPlayTab
                poolName={pool.pool_name}
                maxEntries={pool.max_entries_per_user}
                isPastDeadline={isPastDeadline}
              />
            )}

            {/* Admin tabs */}
            {activeTab === 'members' && isAdmin && (
              <MembersTab
                pool={pool}
                members={members}
                setMembers={setMembers}
                predictions={allPredictions}
                matches={matches}
                teams={teams}
                currentUserId={currentUserId}
                computedEntryTotals={computedEntryTotals}
              />
            )}

            {activeTab === 'scoring_config' && isAdmin && (
              <ScoringTab
                pool={pool}
                settings={settings}
                setSettings={setSettings}
                matches={matches}
                members={members}
                setMembers={setMembers}
              />
            )}

            {activeTab === 'settings' && isAdmin && (
              <SettingsTab
                pool={pool}
                setPool={setPool}
                members={members}
                onDirtyChange={(dirty) => { settingsDirtyRef.current = dirty }}
              />
            )}
        </div>
      </main>

      {/* Navigation Warning Modal */}
      {showNavWarning && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="fixed inset-0 bg-black/50" onClick={handleCancelNav} />
          <div className="relative bg-surface sm:rounded-xl rounded-t-xl shadow-xl max-w-sm w-full p-6 dark:shadow-none dark:border dark:border-border-default">
            <h3 className="text-lg font-bold text-neutral-900 mb-2">Unsaved Changes</h3>
            <p className="text-sm text-neutral-600 mb-5">
              You have unsaved changes. What would you like to do?
            </p>
            <div className="flex flex-col gap-2">
              {activeTab === 'predictions' && (
                <Button variant="primary" onClick={handleSaveAndLeave} fullWidth>
                  Save &amp; Leave
                </Button>
              )}
              <Button variant="outline" onClick={handleLeaveWithoutSaving} fullWidth>
                Leave Without Saving
              </Button>
              <Button variant="gray" onClick={handleCancelNav} fullWidth>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Entry Confirmation Modal */}
      {showDeleteEntryModal && activeEntry && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => { if (!deletingEntry) setShowDeleteEntryModal(false) }}
          />
          <div className="relative bg-surface sm:rounded-xl rounded-t-xl shadow-xl max-w-sm w-full p-6 dark:shadow-none dark:border dark:border-border-default">
            <h3 className="text-lg font-bold text-neutral-900 mb-2">Delete Entry</h3>
            <p className="text-sm text-neutral-600 mb-4">
              Are you sure you want to delete <span className="font-semibold text-neutral-900">{activeEntry.entry_name}</span>?
            </p>
            <div className="bg-danger-50 border border-danger-200 rounded-lg p-3 mb-5">
              <p className="text-sm text-danger-800">
                All predictions for this entry will be permanently deleted. This cannot be undone.
              </p>
            </div>
            <div className="flex gap-3 justify-end">
              <Button
                variant="gray"
                onClick={() => setShowDeleteEntryModal(false)}
                disabled={deletingEntry}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleDeleteEntry}
                loading={deletingEntry}
                loadingText="Deleting..."
              >
                Delete Entry
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Pool Confirmation Modal */}
      {showLeaveModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => { if (!leaving) setShowLeaveModal(false) }}
          />
          <div className="relative bg-surface sm:rounded-xl rounded-t-xl shadow-xl max-w-sm w-full p-6 dark:shadow-none dark:border dark:border-border-default">
            <h3 className="text-lg font-bold text-neutral-900 mb-2">Leave Pool</h3>
            <p className="text-sm text-neutral-600 mb-4">
              Are you sure you want to leave <span className="font-semibold text-neutral-900">{pool.pool_name}</span>?
            </p>
            <div className="bg-danger-50 border border-danger-200 rounded-lg p-3 mb-5">
              <ul className="text-sm text-danger-800 space-y-1">
                <li>&#8226; Your predictions will be permanently deleted</li>
                <li>&#8226; Your scores and ranking will be removed</li>
                <li>&#8226; You will need a pool code to rejoin</li>
              </ul>
            </div>
            <div className="flex gap-3 justify-end">
              <Button
                variant="gray"
                onClick={() => setShowLeaveModal(false)}
                disabled={leaving}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleLeavePool}
                loading={leaving}
                loadingText="Leaving..."
              >
                Leave Pool
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
