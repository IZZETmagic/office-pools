'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Badge, getStatusVariant } from '@/components/ui/Badge'
import { AppHeader } from '@/components/ui/AppHeader'
import { LeaderboardTab } from './LeaderboardTab'
import { ResultsTab } from './ResultsTab'
import { StandingsTab } from './StandingsTab'
import { ScoringRulesTab } from './ScoringRulesTab'
import PredictionsFlow from '@/components/predictions/PredictionsFlow'
import { MembersTab } from './admin/MembersTab'
import { ScoringTab } from './admin/ScoringTab'
import { SettingsTab } from './admin/SettingsTab'
import { DEFAULT_POOL_SETTINGS, type PoolSettings } from './results/points'
import type {
  PoolData,
  MemberData,
  MatchData,
  SettingsData,
  PredictionData,
  TeamData,
  ExistingPrediction,
  PlayerScoreData,
  BonusScoreData,
} from './types'
import type { MatchConductData } from '@/lib/tournament'

// =====================
// TAB DEFINITIONS
// =====================
type Tab =
  | 'leaderboard'
  | 'predictions'
  | 'results'
  | 'standings'
  | 'scoring_rules'
  | 'members'
  | 'scoring_config'
  | 'settings'

const USER_TABS: { key: Tab; label: string }[] = [
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
  hasSubmitted: boolean
  submittedAt: string | null
  lastSavedAt: string | null
  predictionsLocked: boolean
  isSuperAdmin?: boolean
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
  hasSubmitted,
  submittedAt,
  lastSavedAt,
  predictionsLocked,
  isSuperAdmin,
}: PoolDetailProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const initialTab = (searchParams.get('tab') as Tab) || 'leaderboard'
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)

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

  // Sync server-refreshed props into local state
  useEffect(() => { setPool(initialPool) }, [initialPool])
  useEffect(() => { setMembers(initialMembers) }, [initialMembers])
  useEffect(() => { setMatches(initialMatches) }, [initialMatches])
  useEffect(() => { setSettings(initialSettings) }, [initialSettings])
  useEffect(() => { setAllPredictions(initialAllPredictions) }, [initialAllPredictions])

  // Ref to check PredictionsFlow unsaved state
  const predictionsRef = useRef<{ hasUnsaved: () => boolean; save: () => Promise<void> } | null>(null)

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
    switchTab(tab)
  }, [activeTab, switchTab])

  const handleSaveAndLeave = async () => {
    if (predictionsRef.current) {
      await predictionsRef.current.save()
    }
    if (pendingTab) switchTab(pendingTab)
    setShowNavWarning(false)
    setPendingTab(null)
  }

  const handleLeaveWithoutSaving = () => {
    if (pendingTab) switchTab(pendingTab)
    setShowNavWarning(false)
    setPendingTab(null)
  }

  const handleCancelNav = () => {
    setShowNavWarning(false)
    setPendingTab(null)
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

  // Build user prediction list for results tab
  const userPredictionsList = userPredictions.map((p) => ({
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
    <div className="min-h-screen bg-neutral-50">
      {/* Shared app header with breadcrumbs + pool badges */}
      <AppHeader
        breadcrumbs={[
          { label: pool.pool_name },
        ]}
        badges={
          <>
            <Badge variant={getStatusVariant(pool.status)}>{pool.status}</Badge>
            {isAdmin && <Badge variant="blue">Admin</Badge>}
          </>
        }
        isSuperAdmin={isSuperAdmin}
      />

      {/* Tab navigation */}
      <div className="sticky top-[57px] z-[9] bg-white">
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
            </div>
          </div>
          {/* Scroll fade indicator for mobile */}
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none sm:hidden" />
        </div>
      </div>

      {/* Tab content */}
      <main
        className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
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
              />
            )}

            {activeTab === 'predictions' && (
              <PredictionsFlow
                matches={predictionsMatches}
                teams={teams}
                memberId={memberId}
                poolId={pool.pool_id}
                existingPredictions={userPredictions}
                isPastDeadline={isPastDeadline}
                psoEnabled={psoEnabled}
                hasSubmitted={hasSubmitted}
                submittedAt={submittedAt}
                lastSavedAt={lastSavedAt}
                predictionsLocked={predictionsLocked}
                onUnsavedChangesRef={predictionsRef}
              />
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
                currentMemberId={memberId}
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
              />
            )}
      </main>

      {/* Navigation Warning Modal */}
      {showNavWarning && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="fixed inset-0 bg-black/50" onClick={handleCancelNav} />
          <div className="relative bg-white sm:rounded-xl rounded-t-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-bold text-neutral-900 mb-2">Unsaved Changes</h3>
            <p className="text-sm text-neutral-600 mb-5">
              You have unsaved predictions. What would you like to do?
            </p>
            <div className="flex flex-col gap-2">
              <Button variant="primary" onClick={handleSaveAndLeave} fullWidth>
                Save &amp; Leave
              </Button>
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
    </div>
  )
}
