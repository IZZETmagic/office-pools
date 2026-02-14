'use client'

import { useState } from 'react'
import Link from 'next/link'
import type {
  PoolData,
  MemberData,
  MatchData,
  SettingsData,
  PredictionData,
} from './page'
import { OverviewTab } from './OverviewTab'
import { MembersTab } from './MembersTab'
import { MatchesTab } from './MatchesTab'
import { ScoringTab } from './ScoringTab'
import { SettingsTab } from './SettingsTab'

type Tab = 'overview' | 'members' | 'matches' | 'scoring' | 'settings'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: '📊' },
  { key: 'members', label: 'Members', icon: '👥' },
  { key: 'matches', label: 'Matches', icon: '⚽' },
  { key: 'scoring', label: 'Scoring', icon: '🎯' },
  { key: 'settings', label: 'Settings', icon: '⚙️' },
]

type AdminPanelProps = {
  pool: PoolData
  members: MemberData[]
  matches: MatchData[]
  settings: SettingsData | null
  predictions: PredictionData[]
  currentUserId: string
}

export function AdminPanel({
  pool: initialPool,
  members: initialMembers,
  matches: initialMatches,
  settings: initialSettings,
  predictions: initialPredictions,
  currentUserId,
}: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [pool, setPool] = useState(initialPool)
  const [members, setMembers] = useState(initialMembers)
  const [matches, setMatches] = useState(initialMatches)
  const [settings, setSettings] = useState(initialSettings)
  const [predictions, setPredictions] = useState(initialPredictions)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation bar */}
      <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
        <Link href="/dashboard" className="text-xl font-bold text-gray-900">
          ⚽ World Cup Pool
        </Link>
        <div className="text-center">
          <h1 className="text-lg font-bold text-gray-900">
            {pool.pool_name} - Admin Panel
          </h1>
        </div>
        <Link
          href={`/pools`}
          className="text-sm text-gray-600 hover:text-gray-900 font-medium"
        >
          &larr; Back to Pools
        </Link>
      </nav>

      {/* Tab navigation */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex gap-1 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition border-b-2 ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {activeTab === 'overview' && (
          <OverviewTab
            pool={pool}
            members={members}
            matches={matches}
            setActiveTab={setActiveTab}
          />
        )}
        {activeTab === 'members' && (
          <MembersTab
            pool={pool}
            members={members}
            setMembers={setMembers}
            predictions={predictions}
            matches={matches}
            currentUserId={currentUserId}
          />
        )}
        {activeTab === 'matches' && (
          <MatchesTab
            pool={pool}
            matches={matches}
            setMatches={setMatches}
            members={members}
            predictions={predictions}
            setPredictions={setPredictions}
            setMembers={setMembers}
          />
        )}
        {activeTab === 'scoring' && (
          <ScoringTab
            pool={pool}
            settings={settings}
            setSettings={setSettings}
            matches={matches}
            members={members}
            setMembers={setMembers}
          />
        )}
        {activeTab === 'settings' && (
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
