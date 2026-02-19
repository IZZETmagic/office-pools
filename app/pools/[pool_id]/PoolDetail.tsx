'use client'

import { useState, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Badge, getStatusVariant } from '@/components/ui/Badge'
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
  memberId: string
  currentUserId: string
  isAdmin: boolean
  isPastDeadline: boolean
  psoEnabled: boolean
  hasSubmitted: boolean
  submittedAt: string | null
  lastSavedAt: string | null
  predictionsLocked: boolean
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
  memberId,
  currentUserId,
  isAdmin,
  isPastDeadline,
  psoEnabled,
  hasSubmitted,
  submittedAt,
  lastSavedAt,
  predictionsLocked,
}: PoolDetailProps) {
  const searchParams = useSearchParams()
  const initialTab = (searchParams.get('tab') as Tab) || 'leaderboard'
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)
  const [pool, setPool] = useState(initialPool)
  const [members, setMembers] = useState(initialMembers)
  const [matches] = useState(initialMatches)
  const [settings, setSettings] = useState(initialSettings)
  const [allPredictions, setAllPredictions] = useState(initialAllPredictions)
  const [showNavWarning, setShowNavWarning] = useState(false)
  const [pendingTab, setPendingTab] = useState<Tab | null>(null)

  // Ref to check PredictionsFlow unsaved state
  const predictionsRef = useRef<{ hasUnsaved: () => boolean; save: () => Promise<void> } | null>(null)

  const handleTabSwitch = useCallback((tab: Tab) => {
    // If leaving predictions tab with unsaved changes, show warning
    if (activeTab === 'predictions' && tab !== 'predictions' && predictionsRef.current?.hasUnsaved()) {
      setPendingTab(tab)
      setShowNavWarning(true)
      return
    }
    setActiveTab(tab)
  }, [activeTab])

  const handleSaveAndLeave = async () => {
    if (predictionsRef.current) {
      await predictionsRef.current.save()
    }
    if (pendingTab) setActiveTab(pendingTab)
    setShowNavWarning(false)
    setPendingTab(null)
  }

  const handleLeaveWithoutSaving = () => {
    if (pendingTab) setActiveTab(pendingTab)
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
  }))

  // Transform matches for predictions flow (needs home_team/away_team with flag_url)
  const predictionsMatches = matches.map((m) => ({
    ...m,
    home_team: m.home_team ? { country_name: m.home_team.country_name, flag_url: null } : null,
    away_team: m.away_team ? { country_name: m.away_team.country_name, flag_url: null } : null,
  }))

  const tabs = isAdmin ? [...USER_TABS, ...ADMIN_TABS] : USER_TABS

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation bar */}
      <nav className="bg-white shadow-sm px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="text-sm sm:text-base text-gray-600 hover:text-gray-900 font-medium shrink-0">
            &larr; <span className="hidden sm:inline">Dashboard</span><span className="sm:hidden">Back</span>
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-2 justify-center min-w-0 mx-2">
            <h1 className="text-base sm:text-lg font-bold text-gray-900 truncate">{pool.pool_name}</h1>
            <Badge variant={getStatusVariant(pool.status)}>{pool.status}</Badge>
            {isAdmin && <Badge variant="blue">Admin</Badge>}
          </div>
          <div className="w-12 sm:w-20 shrink-0" />
        </div>
      </nav>

      {/* Tab navigation */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-2 sm:px-6">
          <div className="flex gap-0.5 sm:gap-1 overflow-x-auto scrollbar-hide -mx-2 px-2 sm:mx-0 sm:px-0">
            {USER_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => handleTabSwitch(tab.key)}
                className={`px-3 sm:px-4 py-3 text-xs sm:text-sm font-medium whitespace-nowrap transition border-b-2 ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}

            {isAdmin && (
              <>
                {/* Divider */}
                <div className="flex items-center px-1 sm:px-2">
                  <div className="h-5 w-px bg-gray-300" />
                </div>

                {ADMIN_TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => handleTabSwitch(tab.key)}
                    className={`px-3 sm:px-4 py-3 text-xs sm:text-sm font-medium whitespace-nowrap transition border-b-2 ${
                      activeTab === tab.key
                        ? 'border-amber-600 text-amber-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {activeTab === 'leaderboard' && (
          <LeaderboardTab members={members} playerScores={playerScores} />
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
            <h3 className="text-lg font-bold text-gray-900 mb-2">Unsaved Changes</h3>
            <p className="text-sm text-gray-600 mb-5">
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
