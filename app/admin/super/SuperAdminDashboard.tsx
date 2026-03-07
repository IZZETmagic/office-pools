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
import { formatNumber } from '@/lib/format'
import { useSlideIndicator } from '@/hooks/useSlideIndicator'

type Tab = 'matches' | 'users' | 'pools' | 'audit'

const TABS: { key: Tab; label: string }[] = [
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
  const [activeTab, setActiveTab] = useState<Tab>('matches')
  const [matches, setMatches] = useState(initialMatches)
  const [users, setUsers] = useState(initialUsers)
  const [pools, setPools] = useState(initialPools)
  const [auditLogs, setAuditLogs] = useState(initialAuditLogs)
  const { containerRef: adminTabRef, indicatorStyle: adminIndicator, ready: adminTabReady } = useSlideIndicator(activeTab)

  // Summary stats
  const completedMatches = matches.filter((m) => m.is_completed).length
  const totalMatches = matches.length
  const activeUsers = users.filter((u) => u.is_active).length
  const activePools = pools.filter((p) => p.status === 'open' || p.status === 'active').length

  return (
    <div className="min-h-screen bg-surface-secondary">
      <AppHeader breadcrumbs={[{ label: 'Super Admin' }]} isSuperAdmin />

      {/* Sticky admin status bar + stats + tab navigation */}
      <div className="sticky top-[57px] z-[9]">
      {/* Mobile: compact single-row status + stats */}
      <div className="sm:hidden bg-neutral-900 dark:bg-neutral-950 px-4 py-1.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <p className="text-[10px] text-danger-400 font-medium">Full System Access</p>
          <div className="flex gap-3 text-[10px] text-neutral-400">
            <span><span className="text-white font-bold">{formatNumber(completedMatches)}/{formatNumber(totalMatches)}</span> Matches</span>
            <span><span className="text-white font-bold">{formatNumber(activeUsers)}</span> Users</span>
            <span><span className="text-white font-bold">{formatNumber(activePools)}</span> Pools</span>
          </div>
        </div>
      </div>

      {/* Desktop: separate status + stats bars */}
      <div className="hidden sm:block bg-neutral-900 dark:bg-neutral-950 px-6 py-2">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-xs text-danger-400 font-medium">Full System Access</p>
        </div>
      </div>
      <div className="hidden sm:block bg-neutral-800 dark:bg-neutral-900 border-b border-neutral-700 dark:border-neutral-700 px-6 py-3">
        <div className="max-w-7xl mx-auto flex gap-8 text-sm overflow-x-auto">
          <div className="text-neutral-300 dark:text-neutral-400 whitespace-nowrap">
            Matches:{' '}
            <span className="text-white font-bold">
              {formatNumber(completedMatches)}/{formatNumber(totalMatches)}
            </span>
          </div>
          <div className="text-neutral-300 dark:text-neutral-400 whitespace-nowrap">
            Users:{' '}
            <span className="text-white font-bold">{formatNumber(activeUsers)}</span>
          </div>
          <div className="text-neutral-300 dark:text-neutral-400 whitespace-nowrap">
            Pools:{' '}
            <span className="text-white font-bold">{formatNumber(activePools)}</span>
          </div>
          <div className="text-neutral-300 dark:text-neutral-400 whitespace-nowrap">
            Audit:{' '}
            <span className="text-white font-bold">{formatNumber(auditLogs.length)}</span>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
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
                    : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800'
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
      </main>
    </div>
  )
}
