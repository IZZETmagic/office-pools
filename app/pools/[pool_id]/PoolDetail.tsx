'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { AppHeader } from '@/components/ui/AppHeader'
import { LeaderboardTab } from './LeaderboardTab'
import { ResultsTab } from './ResultsTab'
import { BracketResultsTab } from './BracketResultsTab'
import { StandingsTab } from './StandingsTab'
import { ScoringRulesTab } from './ScoringRulesTab'
import { HowToPlayTab } from './HowToPlayTab'
import { AnalyticsTab } from './AnalyticsTab'
import PredictionsFlow, { type SaveStatus } from '@/components/predictions/PredictionsFlow'
import ProgressivePredictionsFlow from '@/components/predictions/ProgressivePredictionsFlow'
import BracketPickerFlow from '@/components/predictions/BracketPickerFlow'
import { EntriesListView } from '@/components/predictions/EntriesListView'
import { EntryDetailView } from '@/components/predictions/EntryDetailView'
import { MembersTab } from './admin/MembersTab'
import { ScoringTab } from './admin/ScoringTab'
import { SettingsTab } from './admin/SettingsTab'
import { RoundsTab } from './admin/RoundsTab'
import { DEFAULT_POOL_SETTINGS, calculatePoints, checkKnockoutTeamsMatch, type PoolSettings } from './results/points'
import { calculateAllBonusPoints, type MatchWithResult } from '@/lib/bonusCalculation'
import { useSlideIndicator } from '@/hooks/useSlideIndicator'
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
  PoolRoundState,
  EntryRoundSubmission,
  BPGroupRanking,
  BPThirdPlaceRanking,
  BPKnockoutPick,
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
  | 'my_bracket'
  | 'analytics'
  | 'standings'
  | 'scoring_rules'
  | 'how_to_play'
  | 'members'
  | 'scoring_config'
  | 'settings'
  | 'rounds'

const USER_TABS_DEFAULT: { key: Tab; label: string }[] = [
  { key: 'how_to_play', label: 'How to Play' },
  { key: 'leaderboard', label: 'Leaderboard' },
  { key: 'analytics', label: 'Form' },
  { key: 'predictions', label: 'Predictions' },
  { key: 'results', label: 'Results' },
  // { key: 'standings', label: 'Standings' }, // temporarily hidden — duplicate of info in Form
  { key: 'scoring_rules', label: 'Scoring Rules' },
]

const USER_TABS_BRACKET_PICKER: { key: Tab; label: string }[] = [
  { key: 'how_to_play', label: 'How to Play' },
  { key: 'leaderboard', label: 'Leaderboard' },
  { key: 'analytics', label: 'Form' },
  { key: 'predictions', label: 'Predictions' },
  { key: 'my_bracket', label: 'My Bracket' },
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
  memberId: string | null
  currentUserId: string
  isAdmin: boolean
  isPastDeadline: boolean
  psoEnabled: boolean
  userEntries: EntryData[]
  isSuperAdmin?: boolean
  isSuperAdminViewing?: boolean
  hasSeenHowToPlay: boolean
  roundStates?: PoolRoundState[]
  roundSubmissions?: EntryRoundSubmission[]
  bpGroupRankings?: BPGroupRanking[]
  bpThirdPlaceRankings?: BPThirdPlaceRanking[]
  bpKnockoutPicks?: BPKnockoutPick[]
  bpEntryProgressMap?: Record<string, number>
  // All entries' BP data for leaderboard scoring
  allBPGroupRankings?: BPGroupRanking[]
  allBPThirdPlaceRankings?: BPThirdPlaceRanking[]
  allBPKnockoutPicks?: BPKnockoutPick[]
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
  isSuperAdminViewing,
  hasSeenHowToPlay,
  roundStates = [],
  roundSubmissions = [],
  bpGroupRankings = [],
  bpThirdPlaceRankings = [],
  bpKnockoutPicks = [],
  bpEntryProgressMap: initialBPEntryProgressMap = {},
  allBPGroupRankings = [],
  allBPThirdPlaceRankings = [],
  allBPKnockoutPicks = [],
}: PoolDetailProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const urlTab = searchParams.get('tab') as Tab
    if (urlTab) return urlTab
    return hasSeenHowToPlay ? 'leaderboard' : 'how_to_play'
  })
  const { containerRef: poolDetailTabRef, indicatorStyle: poolDetailIndicator, ready: poolDetailTabReady } = useSlideIndicator(activeTab)
  const { containerRef: mobileTabRef, indicatorStyle: mobileIndicator, ready: mobileTabReady } = useSlideIndicator(activeTab)

  // Determine indicator color based on active tab
  const isAdminTab = ADMIN_TABS.some(t => t.key === activeTab) || activeTab === 'rounds'

  // Mark how-to-play as seen on first visit (non-blocking, skip for super admin non-member)
  useEffect(() => {
    if (!hasSeenHowToPlay && memberId) {
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

  // Prediction mode flags (defined early so hooks can reference them)
  const isProgressive = pool.prediction_mode === 'progressive'
  const isBracketPicker = pool.prediction_mode === 'bracket_picker'
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

  const canAddEntry = !isSuperAdminViewing && pool.max_entries_per_user > entries.length && !isPastDeadline
  const canDeleteEntry = !isSuperAdminViewing && entries.length > 1 && activeEntry && !activeEntry.has_submitted_predictions && !isPastDeadline

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
        // Clear cached data for deleted entry
        setLiveEntryPredictions(prev => {
          const next = { ...prev }
          delete next[activeEntry.entry_id]
          return next
        })
        setLiveBPData(prev => {
          const next = { ...prev }
          delete next[activeEntry.entry_id]
          return next
        })
        setBPEntryProgressMap(prev => {
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
  const [liveRoundSubmissions, setLiveRoundSubmissions] = useState<Record<string, EntryRoundSubmission[]>>({})
  const [loadingPredictions, setLoadingPredictions] = useState(false)

  // Live bracket picker data fetched client-side (overrides server data when available)
  const [liveBPData, setLiveBPData] = useState<Record<string, {
    groupRankings: BPGroupRanking[]
    thirdPlaceRankings: BPThirdPlaceRanking[]
    knockoutPicks: BPKnockoutPick[]
  }>>({})
  const [bpEntryProgressMap, setBPEntryProgressMap] = useState<Record<string, number>>(initialBPEntryProgressMap)

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

  // Fetch round submissions for an entry (progressive pools)
  const fetchEntryRoundSubmissions = useCallback(async (entryId: string) => {
    if (pool.prediction_mode !== 'progressive') return
    const supabase = createClient()
    const { data } = await supabase
      .from('entry_round_submissions')
      .select('*')
      .eq('entry_id', entryId)
    if (data) {
      setLiveRoundSubmissions(prev => ({ ...prev, [entryId]: data as EntryRoundSubmission[] }))
    }
  }, [pool.prediction_mode])

  // Fetch bracket picker data for an entry
  const fetchEntryBPData = useCallback(async (entryId: string) => {
    setLoadingPredictions(true)
    try {
      const supabase = createClient()
      const [grRes, tpRes, kpRes] = await Promise.all([
        supabase.from('bracket_picker_group_rankings').select('*').eq('entry_id', entryId),
        supabase.from('bracket_picker_third_place_rankings').select('*').eq('entry_id', entryId),
        supabase.from('bracket_picker_knockout_picks').select('*').eq('entry_id', entryId),
      ])
      const groupRankings = (grRes.data ?? []) as BPGroupRanking[]
      const thirdPlaceRankings = (tpRes.data ?? []) as BPThirdPlaceRanking[]
      const knockoutPicks = (kpRes.data ?? []) as BPKnockoutPick[]
      setLiveBPData(prev => ({
        ...prev,
        [entryId]: { groupRankings, thirdPlaceRankings, knockoutPicks },
      }))
      // Update progress map
      setBPEntryProgressMap(prev => ({
        ...prev,
        [entryId]: groupRankings.length + thirdPlaceRankings.length + knockoutPicks.length,
      }))
    } finally {
      setLoadingPredictions(false)
    }
  }, [])

  // Navigate into an entry's detail view (multi-entry)
  const handleOpenEntryDetail = useCallback((entry: EntryData) => {
    setActiveEntryId(entry.entry_id)
    // Clear stale cached data so detail view doesn't mount with old data
    setLiveEntryPredictions(prev => {
      const next = { ...prev }
      delete next[entry.entry_id]
      return next
    })
    setLiveBPData(prev => {
      const next = { ...prev }
      delete next[entry.entry_id]
      return next
    })
    setPredictionsView({ mode: 'detail', entryId: entry.entry_id })
    // Fetch fresh data — detail view is gated on loadingPredictions
    if (isBracketPicker) {
      fetchEntryBPData(entry.entry_id)
    } else {
      fetchEntryPredictions(entry.entry_id)
      fetchEntryRoundSubmissions(entry.entry_id)
    }
  }, [fetchEntryPredictions, fetchEntryRoundSubmissions, fetchEntryBPData, isBracketPicker])

  // Navigate back to entries list (silently save any pending changes, refresh list data)
  const handleBackToList = useCallback(async () => {
    if (predictionsRef.current?.hasUnsaved()) {
      await predictionsRef.current.save()
    }

    // Refresh predictions + entry metadata so list view shows up-to-date progress/timestamps
    const entryId = activeEntryId
    if (entryId) {
      const supabase = createClient()

      if (isBracketPicker) {
        // Refresh BP progress counts + entry metadata
        const [grRes, tpRes, kpRes, entryResult] = await Promise.all([
          supabase.from('bracket_picker_group_rankings').select('entry_id').eq('entry_id', entryId),
          supabase.from('bracket_picker_third_place_rankings').select('entry_id').eq('entry_id', entryId),
          supabase.from('bracket_picker_knockout_picks').select('entry_id').eq('entry_id', entryId),
          supabase
            .from('pool_entries')
            .select('has_submitted_predictions, predictions_submitted_at, predictions_last_saved_at')
            .eq('entry_id', entryId)
            .single(),
        ])
        const count = (grRes.data?.length ?? 0) + (tpRes.data?.length ?? 0) + (kpRes.data?.length ?? 0)
        setBPEntryProgressMap(prev => ({ ...prev, [entryId]: count }))
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
      } else {
        // Refresh predictions + entry metadata for non-BP modes
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
    }

    setPredictionsView({ mode: 'list' })
  }, [activeEntryId, isBracketPicker])

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
    const autoRefreshTabs: Tab[] = ['leaderboard', 'results', 'my_bracket', 'standings']
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
      home_team: m.home_team ? { country_name: m.home_team.country_name, country_code: m.home_team.country_code, flag_url: m.home_team.flag_url ?? null } : null,
      away_team: m.away_team ? { country_name: m.away_team.country_name, country_code: m.away_team.country_code, flag_url: m.away_team.flag_url ?? null } : null,
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
        predictionMode: pool.prediction_mode as 'full_tournament' | 'progressive' | 'bracket_picker',
      })
      const bonusPts = bonusEntries.reduce((sum, e) => sum + e.points_earned, 0)
      const adjustment = adjustmentMap.get(entryId) ?? 0

      map.set(entryId, matchPts + bonusPts + adjustment)
    }

    return map
  }, [allPredictions, matches, teams, conductData, poolSettings, members])

  // Fetch predictions/BP data when switching to predictions/my_bracket tab or changing active entry
  useEffect(() => {
    if ((activeTab === 'predictions' || activeTab === 'my_bracket') && activeEntry) {
      if (isBracketPicker) {
        fetchEntryBPData(activeEntry.entry_id)
      } else {
        fetchEntryPredictions(activeEntry.entry_id)
      }
    }
  }, [activeTab, activeEntry?.entry_id, fetchEntryPredictions, fetchEntryBPData, isBracketPicker])

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

  // Derive active entry's round submissions: prefer live data, fall back to server props
  const activeRoundSubmissions: EntryRoundSubmission[] = useMemo(() => {
    if (!activeEntry) return []
    if (liveRoundSubmissions[activeEntry.entry_id]) {
      return liveRoundSubmissions[activeEntry.entry_id]
    }
    // Server props now contain all user entries' submissions
    return roundSubmissions.filter(s => s.entry_id === activeEntry.entry_id)
  }, [activeEntry, roundSubmissions, liveRoundSubmissions])

  // Derive active entry's bracket picker data: prefer live data, fall back to server props
  const activeBPGroupRankings: BPGroupRanking[] = useMemo(() => {
    if (!activeEntry) return []
    if (liveBPData[activeEntry.entry_id]) return liveBPData[activeEntry.entry_id].groupRankings
    if (activeEntry.entry_id === userEntries[0]?.entry_id) return bpGroupRankings
    return []
  }, [activeEntry, liveBPData, userEntries, bpGroupRankings])

  const activeBPThirdPlaceRankings: BPThirdPlaceRanking[] = useMemo(() => {
    if (!activeEntry) return []
    if (liveBPData[activeEntry.entry_id]) return liveBPData[activeEntry.entry_id].thirdPlaceRankings
    if (activeEntry.entry_id === userEntries[0]?.entry_id) return bpThirdPlaceRankings
    return []
  }, [activeEntry, liveBPData, userEntries, bpThirdPlaceRankings])

  const activeBPKnockoutPicks: BPKnockoutPick[] = useMemo(() => {
    if (!activeEntry) return []
    if (liveBPData[activeEntry.entry_id]) return liveBPData[activeEntry.entry_id].knockoutPicks
    if (activeEntry.entry_id === userEntries[0]?.entry_id) return bpKnockoutPicks
    return []
  }, [activeEntry, liveBPData, userEntries, bpKnockoutPicks])

  // Total expected bracket picker picks for progress display (12 groups × 4 + 12 third place + 32 knockout)
  const bpTotalExpectedPicks = 92

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
    home_team: m.home_team ? { country_name: m.home_team.country_name, country_code: m.home_team.country_code, flag_url: null } : null,
    away_team: m.away_team ? { country_name: m.away_team.country_name, country_code: m.away_team.country_code, flag_url: null } : null,
  }))

  const adminTabs = isProgressive
    ? [{ key: 'rounds' as Tab, label: 'Rounds' }, ...ADMIN_TABS]
    : ADMIN_TABS
  const USER_TABS = isBracketPicker ? USER_TABS_BRACKET_PICKER : USER_TABS_DEFAULT
  const tabs = isAdmin ? [...USER_TABS, ...adminTabs] : USER_TABS

  // Mobile: split tabs into primary (always visible) and overflow ("More" menu)
  const mobilePrimaryKeys = useMemo<Tab[]>(
    () => isBracketPicker
      ? ['leaderboard', 'analytics', 'predictions', 'my_bracket']
      : ['leaderboard', 'analytics', 'predictions', 'results'],
    [isBracketPicker]
  )

  const mobilePrimaryTabs = useMemo(
    () => tabs.filter(t => mobilePrimaryKeys.includes(t.key)),
    [tabs, mobilePrimaryKeys]
  )
  const mobileOverflowTabs = useMemo(
    () => tabs.filter(t => !mobilePrimaryKeys.includes(t.key)),
    [tabs, mobilePrimaryKeys]
  )
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)
  const moreMenuRef = useRef<HTMLDivElement>(null)

  // Close "More" menu on outside click
  useEffect(() => {
    if (!moreMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [moreMenuOpen])

  // Is the active tab in the overflow menu?
  const isOverflowTabActive = mobileOverflowTabs.some(t => t.key === activeTab)

  // Swipe navigation for mobile — only swipe between primary tabs
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

    // Swipe only cycles through mobile primary tabs
    const swipeKeys = mobilePrimaryKeys
    const currentIndex = swipeKeys.indexOf(activeTab)
    if (currentIndex === -1) return

    const nextIndex = deltaX < 0
      ? Math.min(currentIndex + 1, swipeKeys.length - 1)  // swipe left = next tab
      : Math.max(currentIndex - 1, 0)                       // swipe right = prev tab

    if (nextIndex !== currentIndex) {
      handleTabSwitch(swipeKeys[nextIndex])
    }
  }, [activeTab, mobilePrimaryKeys, handleTabSwitch])

  return (
    <div className="min-h-screen bg-surface-secondary">
      {/* Sticky header + tab bar wrapper */}
      <div className="sticky top-0 z-40 bg-surface shadow-sm dark:shadow-none border-b border-neutral-200 dark:border-border-default [transform:translateZ(0)]">
        <AppHeader
          sticky={false}
          breadcrumbs={[
            { label: pool.pool_name },
          ]}
          badges={
            <>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold capitalize ${
                pool.status === 'open' || pool.status === 'active' ? 'bg-success-100 dark:bg-success-900/30 text-success-700 dark:text-success-400'
                  : pool.status === 'upcoming' ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                  : pool.status === 'closed' ? 'bg-warning-100 dark:bg-warning-900/30 text-warning-700 dark:text-warning-400'
                  : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400'
              }`}>
                {pool.status === 'open' || pool.status === 'active' ? 'Open' : pool.status}
              </span>
              {isAdmin && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold border border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-400">Admin</span>}
            </>
          }
          isSuperAdmin={isSuperAdmin}
        />

        {/* Super Admin viewing banner */}
        {isSuperAdminViewing && (
          <div className="bg-warning-100 dark:bg-warning-900/30 border-b border-warning-300 dark:border-warning-700">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-2">
              <svg className="w-4 h-4 text-warning-700 dark:text-warning-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span className="text-xs sm:text-sm font-medium text-warning-800 dark:text-warning-300">
                Viewing as Super Admin — You are not a member of this pool
              </span>
            </div>
          </div>
        )}

        {/* Tab navigation */}
        <div>
        <div className="relative">
          <div className="max-w-6xl mx-auto px-2 sm:px-6">

            {/* ===== MOBILE tab bar ===== */}
            <div ref={mobileTabRef} className="sm:hidden relative flex items-center gap-0.5 py-2">
              <div
                className={`absolute top-2 bottom-2 ${isAdminTab ? 'bg-warning-600' : 'bg-primary-600'} rounded-xl shadow-sm pointer-events-none ${mobileTabReady ? 'transition-all duration-300 ease-out' : ''}`}
                style={{ left: mobileIndicator.left, width: mobileIndicator.width }}
              />
              {mobilePrimaryTabs.map((tab) => (
                <button
                  key={tab.key}
                  data-tab-key={tab.key}
                  onClick={() => handleTabSwitch(tab.key)}
                  className={`relative z-10 flex-1 px-2 py-2 rounded-xl text-xs font-medium whitespace-nowrap text-center transition-colors ${
                    activeTab === tab.key
                      ? 'text-white'
                      : 'text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  {tab.key === 'leaderboard' ? 'Board' : tab.label}
                </button>
              ))}

              {/* More button + dropdown */}
              {mobileOverflowTabs.length > 0 && (
                <div ref={moreMenuRef} className="relative flex-1 min-w-0" data-tab-key={isOverflowTabActive ? activeTab : '__more__'}>
                  <button
                    onClick={() => setMoreMenuOpen(prev => !prev)}
                    className={`w-full relative z-10 flex items-center justify-center gap-0.5 px-2 py-2 rounded-xl text-xs font-medium text-center transition-colors ${
                      isOverflowTabActive
                        ? 'text-white'
                        : 'text-neutral-700 hover:bg-neutral-100'
                    }`}
                  >
                    {isOverflowTabActive ? (mobileOverflowTabs.find(t => t.key === activeTab)?.label ?? 'More') : 'More'}
                    <svg className={`w-3 h-3 shrink-0 transition-transform ${moreMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {moreMenuOpen && (
                    <div className="absolute right-0 top-full mt-1 w-48 bg-surface rounded-xl shadow-lg border border-border-default py-1 z-50">
                      {mobileOverflowTabs.map((tab, i) => {
                        const isAdminOverflow = ADMIN_TABS.some(a => a.key === tab.key) || tab.key === 'rounds'
                        const showDivider = i > 0 && isAdminOverflow && !ADMIN_TABS.some(a => a.key === mobileOverflowTabs[i - 1].key) && mobileOverflowTabs[i - 1].key !== 'rounds'
                        return (
                          <div key={tab.key}>
                            {showDivider && <div className="my-1 border-t border-border-default" />}
                            <button
                              onClick={() => { handleTabSwitch(tab.key); setMoreMenuOpen(false) }}
                              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                                activeTab === tab.key
                                  ? isAdminOverflow ? 'bg-warning-50 text-warning-700 font-medium dark:bg-warning-900/20 dark:text-warning-400' : 'bg-primary-50 text-primary-700 font-medium dark:bg-primary-900/20 dark:text-primary-400'
                                  : isAdminOverflow ? 'text-warning-700 hover:bg-warning-50 dark:text-warning-400 dark:hover:bg-warning-900/20' : 'text-neutral-700 hover:bg-neutral-50 dark:text-neutral-600 dark:hover:bg-neutral-200'
                              }`}
                            >
                              {tab.label}
                            </button>
                          </div>
                        )
                      })}
                      {!isSoleAdmin && !isSuperAdminViewing && (
                        <>
                          <div className="my-1 border-t border-border-default" />
                          <button
                            onClick={() => { setShowLeaveModal(true); setMoreMenuOpen(false) }}
                            className="w-full text-left px-4 py-2.5 text-sm text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-900/20 transition-colors"
                          >
                            Leave Pool
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ===== DESKTOP tab bar ===== */}
            <div ref={poolDetailTabRef} className="hidden sm:flex relative items-center gap-1 overflow-x-auto scrollbar-hide py-2">
              <div
                className={`absolute top-2 bottom-2 ${isAdminTab ? 'bg-warning-600' : 'bg-primary-600'} rounded-xl shadow-sm pointer-events-none ${poolDetailTabReady ? 'transition-all duration-300 ease-out' : ''}`}
                style={{ left: poolDetailIndicator.left, width: poolDetailIndicator.width }}
              />
              {USER_TABS.map((tab) => (
                <button
                  key={tab.key}
                  data-tab-key={tab.key}
                  onClick={() => handleTabSwitch(tab.key)}
                  className={`relative z-10 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab.key
                      ? 'text-white'
                      : 'text-neutral-700 hover:bg-neutral-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}

              {isAdmin && (
                <>
                  <div className="flex items-center px-2">
                    <div className="h-5 w-px bg-neutral-300" />
                  </div>

                  {adminTabs.map((tab) => (
                    <button
                      key={tab.key}
                      data-tab-key={tab.key}
                      onClick={() => handleTabSwitch(tab.key)}
                      className={`relative z-10 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                        activeTab === tab.key
                          ? 'text-white'
                          : 'text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </>
              )}

              {/* Leave Pool button (hidden for super admin non-members) */}
              {!isSoleAdmin && !isSuperAdminViewing && (
                <>
                  <div className="flex items-center px-2">
                    <div className="h-5 w-px bg-neutral-300" />
                  </div>
                  <button
                    onClick={() => setShowLeaveModal(true)}
                    className="px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors text-danger-600 hover:bg-danger-50"
                  >
                    Leave Pool
                  </button>
                </>
              )}
            </div>

          </div>
        </div>
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
                predictionMode={pool.prediction_mode as 'full_tournament' | 'progressive' | 'bracket_picker'}
                allBPGroupRankings={allBPGroupRankings}
                allBPThirdPlaceRankings={allBPThirdPlaceRankings}
                allBPKnockoutPicks={allBPKnockoutPicks}
              />
            )}

            {activeTab === 'analytics' && (
              <AnalyticsTab
                matches={matches}
                allPredictions={allPredictions}
                members={members}
                teams={teams}
                conductData={conductData}
                settings={poolSettings}
                userEntries={entries}
                currentEntryId={activeEntry?.entry_id || ''}
                predictionMode={pool.prediction_mode as 'full_tournament' | 'progressive' | 'bracket_picker'}
              />
            )}

            {activeTab === 'predictions' && activeEntry && isProgressive && (
              pool.max_entries_per_user > 1 ? (
                // Multi-entry progressive: list view or detail view
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
                    roundStates={roundStates}
                    allRoundSubmissions={roundSubmissions}
                    liveRoundSubmissions={liveRoundSubmissions}
                  />
                ) : loadingPredictions ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
                  </div>
                ) : (
                  <div>
                    {/* Back navigation */}
                    <button
                      onClick={handleBackToList}
                      className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium mb-4 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                      Back to Entries
                    </button>
                    <div className="flex items-center gap-2 mb-4">
                      <h3 className="text-lg font-semibold text-neutral-900">{activeEntry.entry_name}</h3>
                    </div>
                    <ProgressivePredictionsFlow
                      key={activeEntryId}
                      matches={predictionsMatches}
                      teams={teams}
                      entryId={activeEntry.entry_id}
                      poolId={pool.pool_id}
                      existingPredictions={activeEntryPredictions}
                      psoEnabled={psoEnabled}
                      predictionsLocked={predictionsLocked}
                      onUnsavedChangesRef={predictionsRef}
                      onStatusChange={setPredictionStatus}
                      roundStates={roundStates}
                      roundSubmissions={activeRoundSubmissions}
                    />
                  </div>
                )
              ) : (
                // Single-entry progressive: render directly
                <ProgressivePredictionsFlow
                  key={activeEntryId}
                  matches={predictionsMatches}
                  teams={teams}
                  entryId={activeEntry.entry_id}
                  poolId={pool.pool_id}
                  existingPredictions={activeEntryPredictions}
                  psoEnabled={psoEnabled}
                  predictionsLocked={predictionsLocked}
                  onUnsavedChangesRef={predictionsRef}
                  onStatusChange={setPredictionStatus}
                  roundStates={roundStates}
                  roundSubmissions={activeRoundSubmissions}
                />
              )
            )}

            {activeTab === 'predictions' && activeEntry && isBracketPicker && (
              pool.max_entries_per_user > 1 ? (
                // Multi-entry bracket picker: list view or detail view
                predictionsView.mode === 'list' ? (
                  <EntriesListView
                    entries={entries}
                    poolId={pool.pool_id}
                    totalMatches={bpTotalExpectedPicks}
                    isPastDeadline={isPastDeadline}
                    allPredictions={allPredictions}
                    canAddEntry={canAddEntry}
                    addingEntry={addingEntry}
                    onAddEntry={handleAddEntry}
                    onDeleteEntry={handleDeleteEntryFromList}
                    onRenameEntry={handleRenameEntryFromList}
                    onEditEntry={handleOpenEntryDetail}
                    entryProgressOverride={bpEntryProgressMap}
                  />
                ) : loadingPredictions ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
                  </div>
                ) : (
                  <div>
                    {/* Back navigation */}
                    <button
                      onClick={handleBackToList}
                      className="flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium mb-4 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                      </svg>
                      Back to Entries
                    </button>
                    <div className="flex items-center gap-2 mb-4">
                      <h3 className="text-lg font-semibold text-neutral-900">{activeEntry.entry_name}</h3>
                    </div>
                    <BracketPickerFlow
                      key={activeEntryId}
                      poolId={pool.pool_id}
                      entryId={activeEntry.entry_id}
                      teams={teams}
                      matches={predictionsMatches}
                      settings={settings!}
                      predictionDeadline={pool.prediction_deadline}
                      isSubmitted={activeEntry.has_submitted_predictions}
                      isLocked={activeEntry.predictions_locked}
                      existingGroupRankings={activeBPGroupRankings}
                      existingThirdPlaceRankings={activeBPThirdPlaceRankings}
                      existingKnockoutPicks={activeBPKnockoutPicks}
                      onSaveStatusChange={(status) => setPredictionStatus(prev => ({ ...prev, saveStatus: status }))}
                      onSubmit={() => { router.refresh() }}
                    />
                  </div>
                )
              ) : (
                // Single-entry bracket picker: render directly
                <BracketPickerFlow
                  key={activeEntryId}
                  poolId={pool.pool_id}
                  entryId={activeEntry.entry_id}
                  teams={teams}
                  matches={predictionsMatches}
                  settings={settings!}
                  predictionDeadline={pool.prediction_deadline}
                  isSubmitted={activeEntry.has_submitted_predictions}
                  isLocked={activeEntry.predictions_locked}
                  existingGroupRankings={activeBPGroupRankings}
                  existingThirdPlaceRankings={activeBPThirdPlaceRankings}
                  existingKnockoutPicks={activeBPKnockoutPicks}
                  onSaveStatusChange={(status) => setPredictionStatus(prev => ({ ...prev, saveStatus: status }))}
                  onSubmit={() => { router.refresh() }}
                />
              )
            )}

            {activeTab === 'predictions' && activeEntry && !isProgressive && !isBracketPicker && (
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
                          className="px-3 py-1.5 border border-primary-300 rounded-xl text-sm font-medium text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary-500 w-48"
                          maxLength={40}
                          placeholder="Entry name..."
                        />
                        <button
                          onClick={handleRenameEntry}
                          disabled={savingEntryName}
                          className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded-xl hover:bg-primary-700 disabled:opacity-50"
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

            {activeTab === 'results' && !isBracketPicker && (
              <ResultsTab
                matches={matches}
                predictions={userPredictionsList}
                poolSettings={poolSettings}
                predictionMode={pool.prediction_mode as 'full_tournament' | 'progressive' | 'bracket_picker'}
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

            {activeTab === 'my_bracket' && isBracketPicker && settings && (
              <BracketResultsTab
                matches={matches}
                teams={teams}
                conductData={conductData}
                settings={settings}
                bpGroupRankings={activeBPGroupRankings}
                bpThirdPlaceRankings={activeBPThirdPlaceRankings}
                bpKnockoutPicks={activeBPKnockoutPicks}
                userEntries={entries}
                currentEntryId={activeEntry?.entry_id || ''}
                allBPGroupRankings={allBPGroupRankings}
                allBPThirdPlaceRankings={allBPThirdPlaceRankings}
                allBPKnockoutPicks={allBPKnockoutPicks}
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
              <ScoringRulesTab settings={settings} predictionMode={pool.prediction_mode as 'full_tournament' | 'progressive' | 'bracket_picker'} />
            )}

            {activeTab === 'how_to_play' && (
              <HowToPlayTab
                poolName={pool.pool_name}
                maxEntries={pool.max_entries_per_user}
                isPastDeadline={isPastDeadline}
                predictionMode={pool.prediction_mode as 'full_tournament' | 'progressive' | 'bracket_picker'}
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

            {activeTab === 'rounds' && isAdmin && isProgressive && (
              <RoundsTab
                poolId={pool.pool_id}
                roundStates={roundStates}
              />
            )}
        </div>
      </main>

      {/* Navigation Warning Modal */}
      {showNavWarning && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="fixed inset-0 bg-black/50" onClick={handleCancelNav} />
          <div className="relative bg-surface sm:rounded-2xl rounded-t-2xl shadow-xl sm:max-w-sm w-full p-6 dark:shadow-none dark:border dark:border-border-default">
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
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 animate-modal-backdrop"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => { if (!deletingEntry) setShowDeleteEntryModal(false) }}
          />
          <div className="relative bg-surface sm:rounded-2xl rounded-t-2xl shadow-xl sm:max-w-sm w-full p-6 dark:shadow-none dark:border dark:border-border-default animate-modal-slide-up">
            <h3 className="text-lg font-bold text-neutral-900 mb-2">Delete Entry</h3>
            <p className="text-sm text-neutral-600 mb-4">
              Are you sure you want to delete <span className="font-semibold text-neutral-900">{activeEntry.entry_name}</span>?
            </p>
            <div className="bg-danger-50 border border-danger-200 rounded-xl p-3 mb-5">
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
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 animate-modal-backdrop"
          role="dialog"
          aria-modal="true"
        >
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => { if (!leaving) setShowLeaveModal(false) }}
          />
          <div className="relative bg-surface sm:rounded-2xl rounded-t-2xl shadow-xl sm:max-w-sm w-full p-6 dark:shadow-none dark:border dark:border-border-default animate-modal-slide-up">
            <h3 className="text-lg font-bold text-neutral-900 mb-2">Leave Pool</h3>
            <p className="text-sm text-neutral-600 mb-4">
              Are you sure you want to leave <span className="font-semibold text-neutral-900">{pool.pool_name}</span>?
            </p>
            <div className="bg-danger-50 border border-danger-200 rounded-xl p-3 mb-5">
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
