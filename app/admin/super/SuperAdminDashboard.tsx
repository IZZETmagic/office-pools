'use client'

import { useState } from 'react'
import { AppHeader } from '@/components/ui/AppHeader'
import type {
  SuperMatchData,
  SuperUserData,
  SuperPoolData,
  AuditLogData,
} from './page'
import { MatchesTab } from './MatchesTab'
import { UsersTab } from './UsersTab'
import { PoolsTab } from './PoolsTab'
import { AuditLogTab } from './AuditLogTab'
import { StatsTab } from './StatsTab'
import { useSlideIndicator } from '@/hooks/useSlideIndicator'

type Tab = 'matches' | 'users' | 'pools' | 'audit' | 'stats'

const TABS: { key: Tab; label: string }[] = [
  { key: 'stats', label: 'Stats' },
  { key: 'matches', label: 'Matches' },
  { key: 'users', label: 'Users' },
  { key: 'pools', label: 'Pools' },
  { key: 'audit', label: 'Audit Log' },
]

type SuperAdminDashboardProps = {
  matches: SuperMatchData[]
  users: SuperUserData[]
  pools: SuperPoolData[]
  auditLogs: AuditLogData[]
  currentUserId: string
}

export function SuperAdminDashboard({
  matches: initialMatches,
  users: initialUsers,
  pools: initialPools,
  auditLogs: initialAuditLogs,
  currentUserId,
}: SuperAdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>('stats')
  const [matches, setMatches] = useState(initialMatches)
  const [users, setUsers] = useState(initialUsers)
  const [pools, setPools] = useState(initialPools)
  const [auditLogs, setAuditLogs] = useState(initialAuditLogs)
  const { containerRef: adminTabRef, indicatorStyle: adminIndicator, ready: adminTabReady } = useSlideIndicator(activeTab)

  return (
    <div className="min-h-screen bg-surface-secondary">
      <AppHeader breadcrumbs={[{ label: 'Super Admin' }]} isSuperAdmin />

      {/* Hero gradient */}
      <div className="bg-gradient-to-br from-violet-600 via-purple-700 to-indigo-600 dark:from-[oklch(0.22_0.08_300)] dark:via-[oklch(0.18_0.06_290)] dark:to-[oklch(0.20_0.06_270)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-10">
          <div className="flex items-center gap-3 sm:gap-5">
            <div className="w-12 h-12 sm:w-24 sm:h-24 rounded-full bg-white/20 dark:bg-white/10 backdrop-blur-sm flex items-center justify-center text-white border-2 border-white/30 dark:border-white/15 shadow-lg shrink-0">
              <svg className="w-6 h-6 sm:w-12 sm:h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h2 className="text-lg sm:text-3xl font-bold text-white truncate">Super Admin</h2>
              <p className="text-purple-100 dark:text-white/60 text-xs sm:text-base">Tournament management & system controls</p>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky tab navigation */}
      <div className="sticky top-[57px] z-[9]">
      <div className="bg-surface border-b border-neutral-200 dark:border-neutral-700 sm:border-b-0">
        <div className="max-w-7xl mx-auto px-2 sm:px-6">
          <div ref={adminTabRef} className="relative flex items-center gap-0.5 sm:gap-1 overflow-x-auto scrollbar-hide -mx-2 px-2 sm:mx-0 sm:px-0 py-2">
            <div
              className={`absolute top-2 bottom-2 bg-primary-600 rounded-xl shadow-sm pointer-events-none ${adminTabReady ? 'transition-all duration-300 ease-out' : ''}`}
              style={{ left: adminIndicator.left, width: adminIndicator.width }}
            />
            {TABS.map((tab) => (
              <button
                key={tab.key}
                data-tab-key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`relative z-10 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.key
                    ? 'text-white'
                    : 'text-neutral-700 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      </div>

      {/* Tab content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {activeTab === 'matches' && (
          <MatchesTab
            matches={matches}
            setMatches={setMatches}
            auditLogs={auditLogs}
            setAuditLogs={setAuditLogs}
          />
        )}
        {activeTab === 'users' && (
          <UsersTab
            users={users}
            setUsers={setUsers}
            currentUserId={currentUserId}
          />
        )}
        {activeTab === 'pools' && (
          <PoolsTab
            pools={pools}
            setPools={setPools}
          />
        )}
        {activeTab === 'audit' && (
          <AuditLogTab auditLogs={auditLogs} />
        )}
        {activeTab === 'stats' && (
          <StatsTab
            matches={matches}
            users={users}
            pools={pools}
          />
        )}
      </main>
    </div>
  )
}
