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
      <div className="bg-neutral-900 dark:bg-neutral-950 px-4 sm:px-6 py-1.5 sm:py-2">
        <div className="max-w-7xl mx-auto text-center">
          <p className="text-[10px] sm:text-xs text-danger-400 font-medium">Full System Access</p>
        </div>
      </div>

      {/* Quick stats bar */}
      <div className="bg-neutral-800 dark:bg-neutral-900 border-b border-neutral-700 dark:border-neutral-700 px-4 sm:px-6 py-2 sm:py-3">
        <div className="max-w-7xl mx-auto flex gap-4 sm:gap-8 text-xs sm:text-sm overflow-x-auto">
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
      <div className="bg-surface">
        <div className="max-w-7xl mx-auto px-2 sm:px-6">
          <div className="flex items-center gap-0.5 sm:gap-1 overflow-x-auto scrollbar-hide -mx-2 px-2 sm:mx-0 sm:px-0 py-2">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.key
                    ? 'bg-primary-600 text-white shadow-sm'
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
