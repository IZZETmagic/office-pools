'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AuditLogData } from './page'
import { Badge } from '@/components/ui/Badge'
import { SpTable, type SpColumn } from './SpTable'

type AuditLogTabProps = {
  auditLogs: AuditLogData[]
}

type CategoryFilter = 'all' | 'match' | 'user' | 'pool'

const MATCH_ACTIONS = ['enter_result', 'reset_match', 'update_live_score', 'set_status', 'advance_teams']
const USER_ACTIONS = ['promote_admin', 'demote_admin', 'toggle_active']
const POOL_ACTIONS = ['delete_pool']

function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
    enter_result: 'Enter Result',
    reset_match: 'Reset Match',
    update_live_score: 'Live Score',
    set_status: 'Set Status',
    advance_teams: 'Advance Teams',
    promote_admin: 'Promote Admin',
    demote_admin: 'Demote Admin',
    toggle_active: 'Toggle Active',
    delete_pool: 'Delete Pool',
  }
  return labels[action] || action
}

function getActionBadgeVariant(action: string): 'green' | 'yellow' | 'blue' | 'gray' {
  switch (action) {
    case 'enter_result':
      return 'green'
    case 'reset_match':
    case 'promote_admin':
    case 'demote_admin':
    case 'delete_pool':
      return 'yellow'
    case 'update_live_score':
    case 'set_status':
      return 'blue'
    case 'toggle_active':
    case 'advance_teams':
      return 'gray'
    default:
      return 'gray'
  }
}

function getActionCategory(action: string): 'match' | 'user' | 'pool' {
  if (USER_ACTIONS.includes(action)) return 'user'
  if (POOL_ACTIONS.includes(action)) return 'pool'
  return 'match'
}

function renderTarget(log: AuditLogData): React.ReactNode {
  const category = getActionCategory(log.action)

  if (category === 'match') {
    if (log.action === 'advance_teams') {
      return <span className="text-neutral-600 dark:text-neutral-400">Manual advancement</span>
    }
    if (log.matches) {
      const home = log.matches.home_team?.country_name || 'TBD'
      const away = log.matches.away_team?.country_name || 'TBD'
      return (
        <span>
          <span className="font-medium text-neutral-900 dark:text-white">#{log.matches.match_number}</span>
          <span className="text-neutral-600 dark:text-neutral-400 ml-1.5">{home} vs {away}</span>
        </span>
      )
    }
    // Fallback: try match_number from details
    if (log.details?.match_number) {
      return <span className="font-medium text-neutral-900 dark:text-white">#{log.details.match_number}</span>
    }
    return <span className="text-neutral-500">—</span>
  }

  if (category === 'user') {
    if (log.target_user) {
      return <span className="text-neutral-900 dark:text-white font-medium">{log.target_user.username}</span>
    }
    if (log.details?.username) {
      return <span className="text-neutral-900 dark:text-white font-medium">{log.details.username}</span>
    }
    return <span className="text-neutral-500">Unknown user</span>
  }

  if (category === 'pool') {
    // Pool name from details JSONB (FK may be null after delete)
    if (log.details?.pool_name) {
      return <span className="text-neutral-900 dark:text-white font-medium">{log.details.pool_name}</span>
    }
    return <span className="text-neutral-500">Unknown pool</span>
  }

  return <span className="text-neutral-500">—</span>
}

export function AuditLogTab({ auditLogs: initialAuditLogs }: AuditLogTabProps) {
  const supabase = createClient()
  const [auditLogs, setAuditLogs] = useState(initialAuditLogs)
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [refreshing, setRefreshing] = useState(false)

  // Auto-refresh on mount
  useEffect(() => {
    async function fetchLatest() {
      setRefreshing(true)
      const { data } = await supabase
        .from('admin_audit_log')
        .select(
          `*, performer:users!admin_audit_log_performed_by_fkey(username, email), matches(match_number, home_team:teams!matches_home_team_id_fkey(country_name), away_team:teams!matches_away_team_id_fkey(country_name)), target_user:users!admin_audit_log_target_user_id_fkey(username, email)`
        )
        .order('performed_at', { ascending: false })
        .limit(100)

      if (data) {
        setAuditLogs(
          data.map((a: any) => {
            const matchData = Array.isArray(a.matches) ? a.matches[0] ?? null : a.matches
            return {
              ...a,
              performer: Array.isArray(a.performer) ? a.performer[0] ?? null : a.performer,
              matches: matchData
                ? {
                    ...matchData,
                    home_team: Array.isArray(matchData.home_team)
                      ? matchData.home_team[0] ?? null
                      : matchData.home_team,
                    away_team: Array.isArray(matchData.away_team)
                      ? matchData.away_team[0] ?? null
                      : matchData.away_team,
                  }
                : null,
              target_user: Array.isArray(a.target_user) ? a.target_user[0] ?? null : a.target_user,
            }
          })
        )
      }
      setRefreshing(false)
    }
    fetchLatest()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredLogs = auditLogs.filter((log) => {
    if (categoryFilter === 'all') return true
    return getActionCategory(log.action) === categoryFilter
  })

  const matchCount = auditLogs.filter((l) => MATCH_ACTIONS.includes(l.action)).length
  const userCount = auditLogs.filter((l) => USER_ACTIONS.includes(l.action)).length
  const poolCount = auditLogs.filter((l) => POOL_ACTIONS.includes(l.action)).length

  const categoryOptions: { value: CategoryFilter; label: string; count: number | null }[] = [
    { value: 'all', label: 'All', count: null },
    { value: 'match', label: 'Match', count: matchCount },
    { value: 'user', label: 'User', count: userCount },
    { value: 'pool', label: 'Pool', count: poolCount },
  ]

  const auditColumns: SpColumn<AuditLogData>[] = [
    {
      key: 'time',
      header: 'Time',
      render: (log) => {
        const d = new Date(log.performed_at)
        return (
          <div>
            <span style={{ fontSize: 13, color: 'var(--sp-slate)' }}>
              {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
            <p style={{ fontSize: 11, color: 'var(--sp-slate)', opacity: 0.7, marginTop: 1 }}>
              {d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </p>
          </div>
        )
      },
    },
    {
      key: 'action',
      header: 'Action',
      render: (log) => (
        <Badge variant={getActionBadgeVariant(log.action)}>
          {getActionLabel(log.action)}
        </Badge>
      ),
    },
    {
      key: 'target',
      header: 'Target',
      render: (log) => renderTarget(log),
    },
    {
      key: 'details',
      header: 'Details',
      render: (log) => (
        <span style={{ fontSize: 13, color: 'var(--sp-slate)' }} className="truncate max-w-xs block">
          {log.summary || '—'}
        </span>
      ),
    },
    {
      key: 'performed_by',
      header: 'Performed By',
      render: (log) => (
        <span style={{ fontSize: 13, color: 'var(--sp-slate)' }}>
          {log.performer?.username || 'Unknown'}
        </span>
      ),
    },
  ]

  if (auditLogs.length === 0 && !refreshing) {
    return (
      <div>
        <h2 className="text-2xl font-extrabold sp-heading mb-6">
          <span className="text-neutral-900 dark:text-white">Audit</span>
          <span className="text-primary-600 dark:text-primary-500">Log</span>
        </h2>
        <div className="bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default p-8 text-center text-neutral-600 dark:text-neutral-400">
          No audit entries yet. Super admin actions will be logged here.
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-2xl font-extrabold sp-heading shrink-0">
            <span className="text-neutral-900 dark:text-white">Audit</span>
            <span className="text-primary-600 dark:text-primary-500">Log</span>
          </h2>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}
            className="px-4 py-2 border border-neutral-300 dark:border-neutral-500 sp-radius-md text-sm text-neutral-700 dark:text-neutral-800 bg-white dark:bg-neutral-300 appearance-none shrink-0"
            style={{ WebkitAppearance: 'none', MozAppearance: 'none', paddingRight: 36, minWidth: 180, backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%237B87A8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
          >
            <option value="all">All Categories</option>
            <option value="match">Match ({matchCount})</option>
            <option value="user">User ({userCount})</option>
            <option value="pool">Pool ({poolCount})</option>
          </select>
        </div>
      </div>

      {/* Audit — mobile cards */}
      <div className="sm:hidden space-y-3">
        {filteredLogs.length === 0 ? (
          <div className="bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default p-8 text-center text-neutral-600 dark:text-neutral-400">
            No entries for this category.
          </div>
        ) : (
          filteredLogs.map((log, i) => {
            const logDate = new Date(log.performed_at)
            return (
              <div
                key={log.id ?? `log-${i}`}
                className="bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default overflow-hidden animate-fade-up"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                {/* Header bar: action badge + time */}
                <div className="flex items-center gap-2 px-3.5 py-2 bg-neutral-100 dark:bg-neutral-200 border-b border-neutral-200 dark:border-neutral-700">
                  <Badge variant={getActionBadgeVariant(log.action)}>
                    {getActionLabel(log.action)}
                  </Badge>
                  <span className="text-[11px] text-neutral-500 dark:text-neutral-400 ml-auto">
                    {logDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{' '}
                    {logDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
                {/* Body */}
                <div className="px-3.5 py-3">
                  {/* Target */}
                  <div className="text-sm mb-1.5">
                    {renderTarget(log)}
                  </div>
                  {/* Summary */}
                  {log.summary && (
                    <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mb-1.5 line-clamp-2">
                      {log.summary}
                    </p>
                  )}
                  {/* Performed by */}
                  <div className="text-[11px] text-neutral-400 dark:text-neutral-500">
                    By: {log.performer?.username || 'Unknown'}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Audit — desktop table */}
      <div className="hidden sm:block">
        <SpTable<AuditLogData>
          columns={auditColumns}
          data={filteredLogs}
          keyFn={(log) => log.id ?? log.performed_at}
          emptyMessage="No entries for this category."
        />
      </div>
    </div>
  )
}
