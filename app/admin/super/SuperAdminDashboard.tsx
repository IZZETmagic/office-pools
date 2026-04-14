'use client'

import './sp-admin.css'
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
import { BroadcastTab } from './BroadcastTab'
import { TemplatesTab } from './TemplatesTab'
import { EmailHistoryTab } from './EmailHistoryTab'
import { AutomatedEmailsTab } from './AutomatedEmailsTab'
import { SP } from './SpTable'

type Tab = 'matches' | 'users' | 'pools' | 'audit' | 'stats' | 'templates' | 'broadcast' | 'email_history' | 'automated_emails'

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
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
          </svg>
        ),
      },
      {
        key: 'audit',
        label: 'Audit Log',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15a2.25 2.25 0 0 1 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z" />
          </svg>
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
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
          </svg>
        ),
      },
      {
        key: 'users',
        label: 'Users',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
          </svg>
        ),
      },
      {
        key: 'pools',
        label: 'Pools',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
          </svg>
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
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
          </svg>
        ),
      },
      {
        key: 'broadcast',
        label: 'Broadcast',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38a.75.75 0 0 1-1.021-.274 18.634 18.634 0 0 1-2.414-7.22m3.57-7.36V4.52c0-.131.021-.26.06-.386a.75.75 0 0 1 1.147-.36l4.897 3.27a1.5 1.5 0 0 1 0 2.453l-4.897 3.27a.75.75 0 0 1-1.147-.36 1.714 1.714 0 0 1-.06-.386v-1.67" />
          </svg>
        ),
      },
      {
        key: 'email_history',
        label: 'Email History',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        ),
      },
      {
        key: 'automated_emails',
        label: 'Automated',
        icon: (
          <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
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
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [matches, setMatches] = useState(initialMatches)
  const [users, setUsers] = useState(initialUsers)
  const [pools, setPools] = useState(initialPools)
  const [auditLogs, setAuditLogs] = useState(initialAuditLogs)

  return (
    <div className="min-h-screen bg-surface-secondary">
      <AppHeader breadcrumbs={[{ label: 'Super Admin' }]} isSuperAdmin />

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
              <svg className={`w-[18px] h-[18px] shrink-0 transition-transform duration-200 ${sidebarOpen ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
              </svg>
              {sidebarOpen && 'Collapse'}
            </button>
          </div>
        </aside>

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
        </main>
      </div>
    </div>
  )
}
