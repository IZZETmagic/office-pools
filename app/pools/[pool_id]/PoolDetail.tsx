'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Badge, getStatusVariant } from '@/components/ui/Badge'
import { LeaderboardTab } from './LeaderboardTab'
import { ResultsTab } from './ResultsTab'
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
} from './types'

// =====================
// TAB DEFINITIONS
// =====================
type Tab =
  | 'leaderboard'
  | 'predictions'
  | 'results'
  | 'scoring_rules'
  | 'members'
  | 'scoring_config'
  | 'settings'

const USER_TABS: { key: Tab; label: string }[] = [
  { key: 'leaderboard', label: 'Leaderboard' },
  { key: 'predictions', label: 'Predictions' },
  { key: 'results', label: 'Results' },
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
  memberId: string
  currentUserId: string
  isAdmin: boolean
  isPastDeadline: boolean
  psoEnabled: boolean
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
  memberId,
  currentUserId,
  isAdmin,
  isPastDeadline,
  psoEnabled,
}: PoolDetailProps) {
  const [activeTab, setActiveTab] = useState<Tab>('leaderboard')
  const [pool, setPool] = useState(initialPool)
  const [members, setMembers] = useState(initialMembers)
  const [matches] = useState(initialMatches)
  const [settings, setSettings] = useState(initialSettings)
  const [allPredictions, setAllPredictions] = useState(initialAllPredictions)

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
                onClick={() => setActiveTab(tab.key)}
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
                    onClick={() => setActiveTab(tab.key)}
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
          <LeaderboardTab members={members} />
        )}

        {activeTab === 'predictions' && (
          <PredictionsFlow
            matches={predictionsMatches}
            teams={teams}
            memberId={memberId}
            existingPredictions={userPredictions}
            isPastDeadline={isPastDeadline}
            psoEnabled={psoEnabled}
          />
        )}

        {activeTab === 'results' && (
          <ResultsTab
            matches={matches}
            predictions={userPredictionsList}
            poolSettings={poolSettings}
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
    </div>
  )
}
