'use client'

import { useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import type { SuperMatchData, SuperUserData, SuperPoolData } from './page'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatNumber, formatTimeAgo } from '@/lib/format'
import { useToast } from '@/components/ui/Toast'

// Dynamic import recharts to avoid SSR issues
const BarChart = dynamic(() => import('recharts').then((m) => m.BarChart), { ssr: false })
const Bar = dynamic(() => import('recharts').then((m) => m.Bar), { ssr: false })
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then((m) => m.ResponsiveContainer), {
  ssr: false,
})
const PieChart = dynamic(() => import('recharts').then((m) => m.PieChart), { ssr: false })
const Pie = dynamic(() => import('recharts').then((m) => m.Pie), { ssr: false })
const AreaChart = dynamic(() => import('recharts').then((m) => m.AreaChart), { ssr: false })
const Area = dynamic(() => import('recharts').then((m) => m.Area), { ssr: false })
const CartesianGrid = dynamic(() => import('recharts').then((m) => m.CartesianGrid), {
  ssr: false,
})

// =============================================
// TYPES
// =============================================
type StatsApiResponse = {
  totalEntries: number
  submittedEntries: number
  totalPredictions: number
  weeklyRegistrations: { week: string; week_start: string; count: number }[]
  predictionsByStage: { stage: string; count: number }[]
  apiPerf: {
    endpoint: string
    method: string
    avg_response_ms: number
    max_response_ms: number
    request_count: number
    error_count: number
    error_rate: number
  }[]
  apiPerfTimeSeries: { hour: string; avg_response_ms: number; request_count: number }[]
  tableSizes: { table_name: string; row_count: number }[]
  recentAuditCount: number
  totalPoolMembers: number
}

type StatsTabProps = {
  matches: SuperMatchData[]
  users: SuperUserData[]
  pools: SuperPoolData[]
}

// =============================================
// CONSTANTS
// =============================================
const STAGE_LABELS: Record<string, string> = {
  group: 'Group',
  round_32: 'R32',
  round_16: 'R16',
  quarter_final: 'QF',
  semi_final: 'SF',
  third_place: '3rd',
  final: 'Final',
}

const STAGE_ORDER = ['group', 'round_32', 'round_16', 'quarter_final', 'semi_final', 'third_place', 'final']

const MODE_LABELS: Record<string, string> = {
  full_tournament: 'Full Tournament',
  progressive: 'Progressive',
  bracket_picker: 'Bracket Picker',
}

const STATUS_COLORS: Record<string, string> = {
  Open: '#10b981',
  Closed: '#f59e0b',
  Completed: '#6b7280',
}

const MODE_COLORS: Record<string, string> = {
  'Full Tournament': '#3b82f6',
  Progressive: '#8b5cf6',
  'Bracket Picker': '#f97316',
}

// =============================================
// HELPER COMPONENTS
// =============================================
function StatCard({
  icon,
  value,
  label,
  sub,
  delay,
}: {
  icon: React.ReactNode
  value: string | number
  label: string
  sub?: string
  delay: number
}) {
  return (
    <div
      className="bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default p-4 animate-fade-up"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="flex items-center gap-2 mb-2 text-neutral-500 dark:text-neutral-400">
        {icon}
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white">
        {typeof value === 'number' ? formatNumber(value) : value}
      </p>
      {sub && <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function SectionCard({
  title,
  children,
  className,
  headerRight,
}: {
  title: string
  children: React.ReactNode
  className?: string
  headerRight?: React.ReactNode
}) {
  return (
    <div
      className={`bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default overflow-hidden ${className ?? ''}`}
    >
      <div className="flex items-center justify-between px-4 sm:px-5 py-3 bg-neutral-100 dark:bg-neutral-200 border-b border-neutral-200 dark:border-neutral-700">
        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">{title}</h3>
        {headerRight}
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  )
}

function ChartSkeleton({ height = 200 }: { height?: number }) {
  return (
    <div
      className="w-full rounded-lg bg-neutral-100 dark:bg-neutral-800 animate-pulse"
      style={{ height }}
    />
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">{message}</div>
  )
}

// =============================================
// ICONS (inline SVGs)
// =============================================
const UsersIcon = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
    />
  </svg>
)
const PoolsIcon = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"
    />
  </svg>
)
const MatchesIcon = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16.5 18.75h-9m9 0a3 3 0 0 1 3 3h-15a3 3 0 0 1 3-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 0 1-.982-3.172M9.497 14.25a7.454 7.454 0 0 0 .981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 0 0 7.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M18.75 4.236c.982.143 1.954.317 2.916.52A6.003 6.003 0 0 1 16.27 9.728M18.75 4.236V4.5c0 2.108-.966 3.99-2.48 5.228m4.645-.12a6.023 6.023 0 0 1-1.385.912M12 12.75a74.36 74.36 0 0 0-4.117-.382M12 12.75a74.36 74.36 0 0 1 4.117-.382M12 12.75V14.25"
    />
  </svg>
)
const EntriesIcon = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75"
    />
  </svg>
)
const PredictionsIcon = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605"
    />
  </svg>
)

// =============================================
// MAIN COMPONENT
// =============================================
export function StatsTab({ matches, users, pools }: StatsTabProps) {
  const { showToast } = useToast()
  const [apiData, setApiData] = useState<StatsApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [purging, setPurging] = useState(false)

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/admin/stats')
        if (!res.ok) throw new Error('Failed to fetch stats')
        const data = await res.json()
        setApiData(data)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  // =============================================
  // CLIENT-SIDE COMPUTED STATS (from props)
  // =============================================
  const totalUsers = users.length
  const activeUsers = users.filter((u) => u.is_active).length
  const totalPools = pools.length
  const activePools = pools.filter((p) => p.status === 'open').length
  const totalMatches = matches.length
  const completedMatches = matches.filter((m) => m.is_completed).length
  const completionPercent = totalMatches > 0 ? Math.round((completedMatches / totalMatches) * 100) : 0

  // Pool breakdown by status (include fill color in data so Cell is not needed)
  const poolsByStatus = ['open', 'closed', 'completed']
    .map((s) => {
      const name = s.charAt(0).toUpperCase() + s.slice(1)
      return {
        name,
        value: pools.filter((p) => p.status === s).length,
        fill: STATUS_COLORS[name] || '#6b7280',
      }
    })
    .filter((d) => d.value > 0)

  // Pool breakdown by prediction mode (include fill color in data)
  const poolsByMode = Object.entries(MODE_LABELS)
    .map(([key, label]) => ({
      name: label,
      value: pools.filter((p) => p.prediction_mode === key).length,
      fill: MODE_COLORS[label] || '#6b7280',
    }))
    .filter((d) => d.value > 0)

  // Matches by stage
  const matchesByStage = STAGE_ORDER.map((stage) => {
    const stageMatches = matches.filter((m) => m.stage === stage)
    return {
      stage: STAGE_LABELS[stage] || stage,
      completed: stageMatches.filter((m) => m.is_completed).length,
      remaining: stageMatches.filter((m) => !m.is_completed).length,
      total: stageMatches.length,
    }
  }).filter((s) => s.total > 0)

  // Top pools by member count
  const topPools = [...pools]
    .map((p) => ({
      pool_name: p.pool_name,
      member_count: p.pool_members?.[0]?.count ?? 0,
      status: p.status,
    }))
    .sort((a, b) => b.member_count - a.member_count)
    .slice(0, 5)

  // Recent signups
  const recentSignups = users.slice(0, 5)

  // =============================================
  // HANDLERS
  // =============================================
  async function handlePurgeLogs() {
    setPurging(true)
    try {
      const res = await fetch('/api/admin/stats', { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        showToast(`Purged ${data.deleted} old performance log entries.`, 'success')
        // Re-fetch stats
        const statsRes = await fetch('/api/admin/stats')
        if (statsRes.ok) {
          setApiData(await statsRes.json())
        }
      } else {
        showToast('Failed to purge logs.', 'error')
      }
    } catch {
      showToast('Failed to purge logs.', 'error')
    } finally {
      setPurging(false)
    }
  }

  // =============================================
  // RENDER
  // =============================================
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">Platform Statistics</h2>

      {error && (
        <div className="bg-danger-50 dark:bg-danger-950 border border-danger-200 dark:border-danger-800 rounded-xl p-4 text-sm text-danger-700 dark:text-danger-300">
          Failed to load some stats: {error}
        </div>
      )}

      {/* ============ OVERVIEW CARDS ============ */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard icon={UsersIcon} value={totalUsers} label="Users" sub={`${activeUsers} active`} delay={0} />
        <StatCard icon={PoolsIcon} value={totalPools} label="Pools" sub={`${activePools} open`} delay={0.05} />
        <StatCard
          icon={MatchesIcon}
          value={totalMatches}
          label="Matches"
          sub={`${completedMatches} completed`}
          delay={0.1}
        />
        <StatCard
          icon={EntriesIcon}
          value={apiData ? apiData.totalEntries : '—'}
          label="Entries"
          sub={apiData ? `${apiData.submittedEntries} submitted` : undefined}
          delay={0.15}
        />
        <StatCard
          icon={PredictionsIcon}
          value={apiData ? apiData.totalPredictions : '—'}
          label="Predictions"
          sub={apiData ? `${apiData.totalPoolMembers} members` : undefined}
          delay={0.2}
        />
      </div>

      {/* ============ TOURNAMENT PROGRESS ============ */}
      <SectionCard title="Tournament Progress">
        {/* Primary bar — Overall */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-semibold text-neutral-900 dark:text-white">
              Overall
            </span>
            <span className="text-sm font-bold text-neutral-900 dark:text-white">
              {completedMatches} / {totalMatches} ({completionPercent}%)
            </span>
          </div>
          <div className="w-full h-5 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-success-500 to-success-600 rounded-full transition-all duration-500"
              style={{ width: `${completionPercent}%` }}
            />
          </div>
        </div>

      </SectionCard>

      {/* ============ TWO-COLUMN: USER GROWTH + POOL BREAKDOWN ============ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        {/* User Registrations */}
        <SectionCard title="User Registrations (12 Weeks)">
          {loading ? (
            <ChartSkeleton height={200} />
          ) : apiData && apiData.weeklyRegistrations.length > 0 ? (
            <div className="h-[200px] sm:h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={apiData.weeklyRegistrations} barSize={20}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                  <Tooltip
                    contentStyle={{
                      background: '#1f2937',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '12px',
                      color: '#fff',
                    }}
                  />
                  <Bar dataKey="count" fill="#3b82f6" name="Signups" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState message="No registration data available." />
          )}

          {/* Recent signups */}
          <div className="mt-4 border-t border-neutral-200 dark:border-neutral-700 pt-3">
            <h4 className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase mb-2">
              Recent Signups
            </h4>
            <div className="space-y-1.5">
              {recentSignups.map((u) => (
                <div key={u.user_id} className="flex items-center justify-between text-sm">
                  <span className="font-medium text-neutral-900 dark:text-white truncate mr-2">
                    {u.username}
                  </span>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                    {formatTimeAgo(u.created_at)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>

        {/* Pool Breakdown */}
        <SectionCard title="Pool Breakdown">
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* By status */}
            <div>
              <h4 className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase mb-2 text-center">
                By Status
              </h4>
              {poolsByStatus.length > 0 ? (
                <div className="h-[140px] sm:h-[160px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={poolsByStatus}
                        cx="50%"
                        cy="50%"
                        innerRadius="45%"
                        outerRadius="75%"
                        paddingAngle={3}
                        dataKey="value"
                      />
                      <Tooltip
                        contentStyle={{
                          background: '#1f2937',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '12px',
                          color: '#fff',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState message="No pools." />
              )}
              <div className="flex flex-wrap justify-center gap-2 mt-1">
                {poolsByStatus.map((d) => (
                  <div key={d.name} className="flex items-center gap-1 text-[11px] text-neutral-600 dark:text-neutral-400">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: STATUS_COLORS[d.name] || '#6b7280' }}
                    />
                    {d.name} ({d.value})
                  </div>
                ))}
              </div>
            </div>

            {/* By mode */}
            <div>
              <h4 className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase mb-2 text-center">
                By Mode
              </h4>
              {poolsByMode.length > 0 ? (
                <div className="h-[140px] sm:h-[160px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={poolsByMode}
                        cx="50%"
                        cy="50%"
                        innerRadius="45%"
                        outerRadius="75%"
                        paddingAngle={3}
                        dataKey="value"
                      />
                      <Tooltip
                        contentStyle={{
                          background: '#1f2937',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '12px',
                          color: '#fff',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState message="No pools." />
              )}
              <div className="flex flex-wrap justify-center gap-2 mt-1">
                {poolsByMode.map((d) => (
                  <div key={d.name} className="flex items-center gap-1 text-[11px] text-neutral-600 dark:text-neutral-400">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: MODE_COLORS[d.name] || '#6b7280' }}
                    />
                    {d.name} ({d.value})
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Top pools */}
          <div className="border-t border-neutral-200 dark:border-neutral-700 pt-3">
            <h4 className="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase mb-2">
              Top Pools by Members
            </h4>
            {topPools.length > 0 ? (
              <div className="space-y-1.5">
                {topPools.map((p, i) => (
                  <div key={`${p.pool_name}-${i}`} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-neutral-400 w-4">{i + 1}.</span>
                      <span className="font-medium text-neutral-900 dark:text-white truncate">
                        {p.pool_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant={p.status === 'open' ? 'green' : p.status === 'closed' ? 'yellow' : 'gray'}>
                        {p.status}
                      </Badge>
                      <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300">
                        {p.member_count}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState message="No pools." />
            )}
          </div>
        </SectionCard>
      </div>

      {/* ============ PREDICTION ENGAGEMENT ============ */}
      <SectionCard title="Prediction Engagement">
        {loading ? (
          <ChartSkeleton height={200} />
        ) : apiData ? (
          <>
            {/* Submission rate */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Submission Rate
                </span>
                <span className="text-sm font-bold text-neutral-900 dark:text-white">
                  {apiData.submittedEntries} / {apiData.totalEntries} (
                  {apiData.totalEntries > 0
                    ? Math.round((apiData.submittedEntries / apiData.totalEntries) * 100)
                    : 0}
                  %)
                </span>
              </div>
              <div className="w-full h-3 bg-neutral-200 dark:bg-neutral-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full transition-all duration-500"
                  style={{
                    width: `${
                      apiData.totalEntries > 0
                        ? Math.round((apiData.submittedEntries / apiData.totalEntries) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            {/* Predictions by stage */}
            {apiData.predictionsByStage.length > 0 ? (
              <div className="h-[200px] sm:h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={apiData.predictionsByStage.map((d) => ({
                      ...d,
                      stage: STAGE_LABELS[d.stage] || d.stage,
                    }))}
                    barSize={28}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
                    <XAxis dataKey="stage" tick={{ fontSize: 12, fill: '#9ca3af' }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#9ca3af' }} />
                    <Tooltip
                      contentStyle={{
                        background: '#1f2937',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: '#fff',
                      }}
                    />
                    <Bar dataKey="count" fill="#8b5cf6" name="Predictions" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState message="No prediction data yet." />
            )}
          </>
        ) : (
          <EmptyState message="Failed to load prediction data." />
        )}
      </SectionCard>

      {/* ============ API PERFORMANCE ============ */}
      <SectionCard
        title="API Performance (24h)"
        headerRight={
          <Button
            size="xs"
            variant="outline"
            onClick={handlePurgeLogs}
            loading={purging}
            loadingText="Purging..."
          >
            Purge Old Logs
          </Button>
        }
      >
        {loading ? (
          <ChartSkeleton height={200} />
        ) : apiData && apiData.apiPerfTimeSeries.length > 0 ? (
          <>
            {/* Response time area chart */}
            <div className="mb-5">
              <h4 className="text-xs font-medium text-neutral-500 dark:text-neutral-600 uppercase mb-2">
                Avg Response Time (ms)
              </h4>
              <div className="h-[200px] sm:h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={apiData.apiPerfTimeSeries}>
                    <defs>
                      <linearGradient id="perfGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" opacity={0.5} />
                    <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#9ca3af' }} />
                    <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} unit="ms" />
                    <Tooltip
                      contentStyle={{
                        background: '#1f2937',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: '#fff',
                      }}
                      formatter={(value) => [`${value}ms`, 'Avg Response']}
                    />
                    <Area
                      type="monotone"
                      dataKey="avg_response_ms"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="url(#perfGradient)"
                      name="Avg Response"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Endpoint breakdown table */}
            {apiData.apiPerf.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-neutral-500 dark:text-neutral-600 uppercase mb-2">
                  Endpoint Breakdown
                </h4>
                {/* Mobile cards */}
                <div className="sm:hidden space-y-2">
                  {apiData.apiPerf.map((ep, i) => (
                    <div
                      key={`${ep.endpoint}-${ep.method}-${i}`}
                      className="bg-neutral-50 dark:bg-neutral-200 rounded-lg p-3 text-sm"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <code className="text-xs font-mono text-neutral-700 dark:text-neutral-700 truncate mr-2">
                          {ep.method} {ep.endpoint}
                        </code>
                        <Badge
                          variant={
                            ep.error_rate > 10 ? 'yellow' : ep.error_rate > 0 ? 'blue' : 'green'
                          }
                        >
                          {ep.error_rate}% err
                        </Badge>
                      </div>
                      <div className="flex gap-4 text-xs text-neutral-500 dark:text-neutral-500">
                        <span>Avg: {ep.avg_response_ms}ms</span>
                        <span>Max: {ep.max_response_ms}ms</span>
                        <span>{ep.request_count} reqs</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-neutral-500 dark:text-neutral-600 uppercase">
                        <th className="text-left py-2 pr-4">Endpoint</th>
                        <th className="text-left py-2 px-3">Method</th>
                        <th className="text-right py-2 px-3">Avg (ms)</th>
                        <th className="text-right py-2 px-3">Max (ms)</th>
                        <th className="text-right py-2 px-3">Requests</th>
                        <th className="text-right py-2 pl-3">Error Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                      {apiData.apiPerf.map((ep, i) => (
                        <tr key={`${ep.endpoint}-${ep.method}-${i}`}>
                          <td className="py-2 pr-4">
                            <code className="text-xs font-mono text-neutral-700 dark:text-neutral-500">
                              {ep.endpoint}
                            </code>
                          </td>
                          <td className="py-2 px-3">
                            <Badge variant="blue">{ep.method}</Badge>
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-neutral-700 dark:text-neutral-500">
                            {ep.avg_response_ms}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-neutral-700 dark:text-neutral-500">
                            {ep.max_response_ms}
                          </td>
                          <td className="py-2 px-3 text-right font-medium text-neutral-900 dark:text-white">
                            {formatNumber(ep.request_count)}
                          </td>
                          <td className="py-2 pl-3 text-right">
                            <Badge
                              variant={
                                ep.error_rate > 10
                                  ? 'yellow'
                                  : ep.error_rate > 0
                                    ? 'blue'
                                    : 'green'
                              }
                            >
                              {ep.error_rate}%
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : (
          <EmptyState message="No API performance data yet. Instrument API routes with withPerfLogging to start tracking." />
        )}
      </SectionCard>

      {/* ============ SYSTEM HEALTH ============ */}
      <SectionCard title="System Health">
        {loading ? (
          <ChartSkeleton height={150} />
        ) : apiData ? (
          <div className="space-y-4">
            {/* Audit activity */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-neutral-700 dark:text-neutral-500">
                Admin audit activity (24h):
              </span>
              <Badge variant={apiData.recentAuditCount > 0 ? 'green' : 'gray'}>
                {apiData.recentAuditCount} actions
              </Badge>
            </div>

            {/* Table sizes */}
            {apiData.tableSizes.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-neutral-500 dark:text-neutral-600 uppercase mb-2">
                  Database Table Sizes
                </h4>
                {/* Mobile: compact list */}
                <div className="sm:hidden space-y-1">
                  {apiData.tableSizes.map((t) => (
                    <div key={t.table_name} className="flex items-center justify-between text-sm py-1">
                      <code className="text-xs font-mono text-neutral-600 dark:text-neutral-500">
                        {t.table_name}
                      </code>
                      <span className="font-mono font-medium text-neutral-900 dark:text-white text-xs">
                        {formatNumber(t.row_count)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Desktop: table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-neutral-500 dark:text-neutral-600 uppercase">
                        <th className="text-left py-2 pr-4">Table</th>
                        <th className="text-right py-2">Row Count</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
                      {apiData.tableSizes.map((t) => (
                        <tr key={t.table_name}>
                          <td className="py-1.5 pr-4">
                            <code className="text-xs font-mono text-neutral-700 dark:text-neutral-500">
                              {t.table_name}
                            </code>
                          </td>
                          <td className="py-1.5 text-right font-mono font-medium text-neutral-900 dark:text-white">
                            {formatNumber(t.row_count)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <EmptyState message="Failed to load system health data." />
        )}
      </SectionCard>
    </div>
  )
}
