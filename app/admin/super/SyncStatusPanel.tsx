'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

type SyncRun = {
  run_id: string
  started_at: string
  finished_at: string | null
  fixtures_seen: number
  fixtures_changed: number
  fixtures_skipped_manual: number
  errors: unknown[]
  triggered_by: string
  quota_remaining: number | null
  notes: string | null
}

type SyncStatus = {
  runs: SyncRun[]
  sync_enabled: boolean
  updated_at: string | null
}

const cardBorder = '0.5px solid var(--sp-silver)80'

export function SyncStatusPanel() {
  const [data, setData] = useState<SyncStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/admin/sync-status', { cache: 'no-store' })
      if (!res.ok) throw new Error(`status ${res.status}`)
      setData(await res.json())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [])

  async function toggleEnabled() {
    if (!data) return
    setToggling(true)
    try {
      const res = await fetch('/api/admin/sync-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sync_enabled: !data.sync_enabled }),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setToggling(false)
    }
  }

  if (loading) return null

  const recentErrors = (data?.runs ?? [])
    .slice(0, 5)
    .reduce((acc, r) => acc + (Array.isArray(r.errors) ? r.errors.length : 0), 0)
  const lastRun = data?.runs[0]
  const lastQuota = lastRun?.quota_remaining ?? null

  return (
    <div className="sp-bg-surface sp-radius-lg p-4 mb-4" style={{ border: cardBorder }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold sp-heading sp-text-ink">API-Football sync</span>
          <Badge variant={data?.sync_enabled ? 'green' : 'gray'}>
            {data?.sync_enabled ? 'Enabled' : 'Paused'}
          </Badge>
          {lastRun && (
            <span className="text-xs sp-text-slate">
              Last run {timeAgo(lastRun.started_at)} · changed {lastRun.fixtures_changed}/{lastRun.fixtures_seen}
              {lastRun.fixtures_skipped_manual > 0 && ` · ${lastRun.fixtures_skipped_manual} locked`}
            </span>
          )}
          {recentErrors > 0 && <Badge variant="yellow">{recentErrors} recent errors</Badge>}
          {lastQuota !== null && (
            <span className="text-xs sp-text-slate">Quota left: {lastQuota}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="xs" variant="outline" onClick={() => setExpanded((v) => !v)}>
            {expanded ? 'Hide log' : 'View log'}
          </Button>
          <Button
            size="xs"
            variant={data?.sync_enabled ? 'gray' : 'warning'}
            onClick={toggleEnabled}
            loading={toggling}
            loadingText="…"
          >
            {data?.sync_enabled ? 'Pause sync' : 'Resume sync'}
          </Button>
        </div>
      </div>

      {error && (
        <p className="mt-2 text-xs text-danger-600">Sync status error: {error}</p>
      )}

      {expanded && data && (
        <div className="mt-4 max-h-72 overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="sp-text-slate">
                <th className="text-left font-medium px-2 py-1">Started</th>
                <th className="text-right font-medium px-2 py-1">Seen</th>
                <th className="text-right font-medium px-2 py-1">Changed</th>
                <th className="text-right font-medium px-2 py-1">Locked</th>
                <th className="text-right font-medium px-2 py-1">Errors</th>
                <th className="text-right font-medium px-2 py-1">Quota</th>
                <th className="text-left font-medium px-2 py-1">Notes</th>
              </tr>
            </thead>
            <tbody>
              {data.runs.map((r) => (
                <tr key={r.run_id} className="sp-text-ink">
                  <td className="px-2 py-1">{new Date(r.started_at).toLocaleString()}</td>
                  <td className="px-2 py-1 text-right">{r.fixtures_seen}</td>
                  <td className="px-2 py-1 text-right">{r.fixtures_changed}</td>
                  <td className="px-2 py-1 text-right">{r.fixtures_skipped_manual}</td>
                  <td className="px-2 py-1 text-right">
                    {Array.isArray(r.errors) ? r.errors.length : 0}
                  </td>
                  <td className="px-2 py-1 text-right">{r.quota_remaining ?? '—'}</td>
                  <td className="px-2 py-1">{r.notes ?? ''}</td>
                </tr>
              ))}
              {data.runs.length === 0 && (
                <tr><td colSpan={7} className="px-2 py-3 text-center sp-text-slate">No runs yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60_000) return `${Math.max(1, Math.floor(ms / 1000))}s ago`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`
  return new Date(iso).toLocaleDateString()
}
