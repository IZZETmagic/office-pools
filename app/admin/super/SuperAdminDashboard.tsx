'use client'

import { useState } from 'react'
import Link from 'next/link'
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

type Tab = 'matches' | 'users' | 'pools' | 'audit'

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'matches', label: 'Matches', icon: '⚽' },
  { key: 'users', label: 'Users', icon: '👥' },
  { key: 'pools', label: 'Pools', icon: '🏆' },
  { key: 'audit', label: 'Audit Log', icon: '📋' },
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
    <div className="min-h-screen bg-gray-50">
      {/* Navigation bar */}
      <nav className="bg-gray-900 shadow-lg px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          <Link href="/dashboard" className="text-sm text-gray-300 hover:text-white font-medium shrink-0">
            &larr; <span className="hidden sm:inline">Dashboard</span><span className="sm:hidden">Back</span>
          </Link>
          <div className="text-center min-w-0 mx-2">
            <h1 className="text-sm sm:text-lg font-bold text-white truncate">
              Super Admin
            </h1>
            <p className="text-[10px] sm:text-xs text-red-400 font-medium">Full System Access</p>
          </div>
          <div className="w-12 sm:w-20 shrink-0" />
        </div>
      </nav>

      {/* Quick stats bar */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 sm:px-6 py-2 sm:py-3">
        <div className="max-w-7xl mx-auto flex gap-4 sm:gap-8 text-xs sm:text-sm overflow-x-auto">
          <div className="text-gray-300 whitespace-nowrap">
            Matches:{' '}
            <span className="text-white font-bold">
              {completedMatches}/{totalMatches}
            </span>
          </div>
          <div className="text-gray-300 whitespace-nowrap">
            Users:{' '}
            <span className="text-white font-bold">{activeUsers}</span>
          </div>
          <div className="text-gray-300 whitespace-nowrap">
            Pools:{' '}
            <span className="text-white font-bold">{activePools}</span>
          </div>
          <div className="text-gray-300 whitespace-nowrap">
            Audit:{' '}
            <span className="text-white font-bold">{auditLogs.length}</span>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-0.5 sm:gap-1 overflow-x-auto">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-3 sm:px-5 py-3 text-xs sm:text-sm font-medium whitespace-nowrap transition border-b-2 ${
                  activeTab === tab.key
                    ? 'border-red-600 text-red-600'
                    : 'border-transparent text-gray-600 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
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
