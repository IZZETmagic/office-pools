'use client'

import './sp-admin.css'
import { Icon } from '@/components/ui/Icon'
import { useState } from 'react'
import { AppHeader } from '@/components/ui/AppHeader'
import type {
  SuperMatchData,
  SuperUserData,
  SuperPoolData,
  AuditLogData,
  SubscriptionPeriodData,
} from './page'
import { MatchesTab } from './MatchesTab'
import { UsersTab } from './UsersTab'
import { PoolsTab } from './PoolsTab'
import { AuditLogTab } from './AuditLogTab'
import { StatsTab } from './StatsTab'
import { BroadcastTab } from './BroadcastTab'
import { TemplatesTab } from './TemplatesTab'
import { EmailHistoryTab } from './EmailHistoryTab'
import { AutomatedEmailsTab } from './AutomatedEmailsTab'
import { BrandedPoolsTab } from './BrandedPoolsTab'
import { SubscriptionsTab } from './SubscriptionsTab'
import { SP } from './SpTable'

type Tab = 'matches' | 'users' | 'pools' | 'branded' | 'audit' | 'stats' | 'templates' | 'broadcast' | 'email_history' | 'automated_emails' | 'subscriptions'

type TabItem = { key: Tab; label: string; icon: React.ReactNode }
type TabSection = { heading: string; items: TabItem[] }

const TAB_SECTIONS: TabSection[] = [
  {
    heading: 'Overview',
    items: [
      {
        key: 'stats',
        label: 'Stats',
        icon: (
          <Icon name="chart.bar" className="w-[18px] h-[18px]" />
        ),
      },
      {
        key: 'audit',
        label: 'Audit Log',
        icon: (
          <Icon name="doc.text" className="w-[18px] h-[18px]" />
        ),
      },
    ],
  },
  {
    heading: 'Tournament',
    items: [
      {
        key: 'matches',
        label: 'Matches',
        icon: (
          <Icon name="calendar" className="w-[18px] h-[18px]" />
        ),
      },
      {
        key: 'users',
        label: 'Users',
        icon: (
          <Icon name="person.3.fill" className="w-[18px] h-[18px]" />
        ),
      },
      {
        key: 'pools',
        label: 'Pools',
        icon: (
          <Icon name="square.grid.2x2" className="w-[18px] h-[18px]" />
        ),
      },
      {
        key: 'branded',
        label: 'Branded',
        icon: (
          <Icon name="network" className="w-[18px] h-[18px]" />
        ),
      },
    ],
  },
  {
    heading: 'Communications',
    items: [
      {
        key: 'templates',
        label: 'Templates',
        icon: (
          <Icon name="envelope" className="w-[18px] h-[18px]" />
        ),
      },
      {
        key: 'broadcast',
        label: 'Broadcast',
        icon: (
          <Icon name="link" className="w-[18px] h-[18px]" />
        ),
      },
      {
        key: 'email_history',
        label: 'Email History',
        icon: (
          <Icon name="clock" className="w-[18px] h-[18px]" />
        ),
      },
      {
        key: 'automated_emails',
        label: 'Automated',
        icon: (
          <Icon name="gear" className="w-[18px] h-[18px]" />
        ),
      },
    ],
  },
  {
    heading: 'Operations',
    items: [
      {
        key: 'subscriptions',
        label: 'Subscriptions',
        icon: (
          <Icon name="list.bullet" className="w-[18px] h-[18px]" />
        ),
      },
    ],
  },
]

const ALL_TABS = TAB_SECTIONS.flatMap((s) => s.items)

type SuperAdminDashboardProps = {
  matches: SuperMatchData[]
  users: SuperUserData[]
  pools: SuperPoolData[]
  auditLogs: AuditLogData[]
  subscriptionPeriods: SubscriptionPeriodData[]
  currentUserId: string
}

export function SuperAdminDashboard({
  matches: initialMatches,
  users: initialUsers,
  pools: initialPools,
  auditLogs: initialAuditLogs,
  subscriptionPeriods: initialSubscriptionPeriods,
  currentUserId,
}: SuperAdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<Tab>('stats')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [matches, setMatches] = useState(initialMatches)
  const [users, setUsers] = useState(initialUsers)
  const [pools, setPools] = useState(initialPools)
  const [auditLogs, setAuditLogs] = useState(initialAuditLogs)
  const [subscriptionPeriods, setSubscriptionPeriods] = useState(initialSubscriptionPeriods)

  // Cross-tab navigation: when PoolsTab wants to open a user profile
  const [navigateToUserId, setNavigateToUserId] = useState<string | null>(null)
  // Cross-tab navigation: when BrandedPoolsTab wants to open a pool detail
  const [navigateToPoolId, setNavigateToPoolId] = useState<string | null>(null)

  function handleNavigateToUser(userId: string) {
    setNavigateToUserId(userId)
    setActiveTab('users')
  }

  function handleNavigateToPool(poolId: string) {
    setNavigateToPoolId(poolId)
    setActiveTab('pools')
  }

  return (
    <div className="min-h-screen bg-surface-secondary">
      <AppHeader breadcrumbs={[{ label: 'Super Admin' }]} isSuperAdmin />

      {/* Mobile horizontal tab bar — visible below lg */}
      <div className="lg:hidden sticky top-[57px] z-[9] w-full">
        <div className="bg-surface border-b border-border-default">
          <div className="px-2">
            <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide py-2">
              {ALL_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab.key
                      ? 'sp-bg-mist sp-text-ink'
                      : 'sp-text-slate sp-hover-snow'
                  }`}
                >
                  <span className={activeTab === tab.key ? 'sp-text-primary' : ''}>{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Vertical sidebar navigation — desktop only */}
        <aside className={`hidden lg:flex flex-col shrink-0 sticky top-[57px] h-[calc(100vh-57px)] bg-surface border-r border-border-default transition-[width] duration-200 ease-out ${sidebarOpen ? 'w-[220px]' : 'w-[60px]'}`}>
          {/* Sidebar header */}
          <div className={`flex items-center ${sidebarOpen ? 'px-5 pt-6 pb-4' : 'px-2.5 pt-6 pb-4 justify-center'}`}>
            {sidebarOpen ? (
              <div className="min-w-0">
                <h2 className="text-lg sp-text-ink truncate sp-heading">Super Admin</h2>
                <p className="text-xs sp-text-slate sp-body">Management</p>
              </div>
            ) : (
              <span className="text-sm font-semibold sp-text-ink sp-heading">SA</span>
            )}
          </div>

          {/* Navigation items — grouped by section */}
          <nav className={`flex-1 py-1 overflow-y-auto ${sidebarOpen ? 'px-3' : 'px-2'}`}>
            {TAB_SECTIONS.map((section, idx) => (
              <div key={section.heading} className={idx > 0 ? 'mt-4' : ''}>
                {sidebarOpen && (
                  <div className="px-3 pb-1.5 sp-text-slate sp-label">
                    {section.heading}
                  </div>
                )}
                {!sidebarOpen && idx > 0 && (
                  <div className="mx-2 mb-2 border-t border-border-default" />
                )}
                <div className="space-y-0.5">
                  {section.items.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      title={sidebarOpen ? undefined : tab.label}
                      className={`sp-nav-item w-full flex items-center rounded-2xl transition-colors ${
                        sidebarOpen ? 'gap-3 px-3 py-2.5' : 'justify-center px-0 py-2.5'
                      } ${
                        activeTab === tab.key
                          ? 'sp-bg-mist sp-text-ink'
                          : 'sp-text-slate sp-hover-snow'
                      }`}
                    >
                      <span className={`shrink-0 ${activeTab === tab.key ? 'sp-text-primary' : ''}`}>{tab.icon}</span>
                      {sidebarOpen && tab.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {/* Collapse toggle */}
          <div className={`border-t border-border-default ${sidebarOpen ? 'px-3' : 'px-2'} py-3`}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`sp-nav-item w-full flex items-center rounded-2xl py-2.5 sp-text-slate sp-hover-snow transition-colors ${
                sidebarOpen ? 'gap-3 px-3' : 'justify-center px-0'
              }`}
              title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            >
              <Icon name="chevron.left.2" className={`w-[18px] h-[18px] shrink-0 transition-transform duration-200 ${sidebarOpen ? '' : 'rotate-180'}`} />
              {sidebarOpen && 'Collapse'}
            </button>
          </div>
        </aside>

        {/* Content pane */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 lg:py-8" style={{ backgroundColor: SP.mist }}>
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
              navigateToUserId={navigateToUserId}
              clearNavigateToUser={() => setNavigateToUserId(null)}
            />
          )}
          {activeTab === 'pools' && (
            <PoolsTab
              pools={pools}
              setPools={setPools}
              onNavigateToUser={handleNavigateToUser}
              navigateToPoolId={navigateToPoolId}
              clearNavigateToPool={() => setNavigateToPoolId(null)}
            />
          )}
          {activeTab === 'branded' && (
            <BrandedPoolsTab
              pools={pools}
              setPools={setPools}
              onNavigateToPool={handleNavigateToPool}
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
          {activeTab === 'templates' && (
            <TemplatesTab />
          )}
          {activeTab === 'broadcast' && (
            <BroadcastTab />
          )}
          {activeTab === 'email_history' && (
            <EmailHistoryTab />
          )}
          {activeTab === 'automated_emails' && (
            <AutomatedEmailsTab />
          )}
          {activeTab === 'subscriptions' && (
            <SubscriptionsTab
              periods={subscriptionPeriods}
              setPeriods={setSubscriptionPeriods}
            />
          )}
        </main>
      </div>
    </div>
  )
}
