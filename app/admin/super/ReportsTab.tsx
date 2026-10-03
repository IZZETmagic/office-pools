'use client'

import { useEffect, useState } from 'react'

import { createClient } from '@/lib/supabase/client'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { useToast } from '@/components/ui/Toast'

/**
 * Banter reports (158). Every report a member files lands here and in the support inbox.
 *
 * Apple's guideline 1.2 asks for a TIMELY response, so this is built to be cleared, not
 * browsed: open reports first, each with what was said (a snapshot taken when it was
 * reported — the message itself may already be gone), who said it, who reported it and why.
 *
 *  - Remove message: delete_pool_message (148), which super admins may call; the chat shows
 *    "Removed by a pool admin". Marks the report actioned.
 *  - Dismiss: nothing wrong. Marks it dismissed. A fresh report re-opens it.
 *
 * Read and written with the browser client: RLS on pool_message_reports lets super admins
 * (and only them) select and update.
 */

type ReportRow = {
  report_id: string
  message_id: string | null
  reason: string
  details: string | null
  content_snapshot: string
  type_snapshot: string
  metadata_snapshot: Record<string, unknown>
  status: 'open' | 'actioned' | 'dismissed'
  created_at: string
  resolved_at: string | null
  pools: { pool_name: string } | null
  reporter: { full_name: string | null; username: string | null } | null
  reported: { full_name: string | null; username: string | null } | null
  message: { deleted_at: string | null } | null
}

const REASON_LABEL: Record<string, string> = {
  spam: 'Spam',
  offensive: 'Offensive',
  harassment: 'Harassment',
  inappropriate_image: 'Inappropriate image',
  other: 'Other',
}

function person(p: ReportRow['reporter']) {
  if (!p) return 'Deleted account'
  return p.username ? `${p.full_name || p.username} (@${p.username})` : p.full_name || 'Member'
}

/** Null on failure (logged); the tab shows an empty list and a toast. */
async function fetchReports(view: 'open' | 'resolved'): Promise<ReportRow[] | null> {
  const supabase = createClient()
  let query = supabase
    .from('pool_message_reports')
    .select(`
      report_id, message_id, reason, details, content_snapshot, type_snapshot, metadata_snapshot,
      status, created_at, resolved_at,
      pools(pool_name),
      reporter:users!pool_message_reports_reporter_id_fkey(full_name, username),
      reported:users!pool_message_reports_reported_user_id_fkey(full_name, username),
      message:pool_messages(deleted_at)
    `)
    .order('created_at', { ascending: false })
    .limit(200)
  query = view === 'open' ? query.eq('status', 'open') : query.neq('status', 'open')
  const { data, error } = await query
  if (error) {
    console.error('[ReportsTab] load failed:', error)
    return null
  }
  return (data ?? []) as unknown as ReportRow[]
}

export function ReportsTab({ currentUserId }: { currentUserId: string }) {
  const { showToast } = useToast()
  const [view, setView] = useState<'open' | 'resolved'>('open')
  const [rows, setRows] = useState<ReportRow[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    fetchReports(view).then(result => {
      if (!active) return
      if (result === null) showToast('Could not load reports.', 'error')
      setRows(result ?? [])
    })
    return () => { active = false }
  }, [view, showToast])

  async function resolve(row: ReportRow, action: 'remove' | 'dismiss') {
    setBusyId(row.report_id)
    const supabase = createClient()
    if (action === 'remove' && row.message_id && !row.message?.deleted_at) {
      const { error } = await supabase.rpc('delete_pool_message', { p_message_id: row.message_id })
      if (error) {
        setBusyId(null)
        console.error('[ReportsTab] delete failed:', error)
        showToast('Could not remove the message.', 'error')
        return
      }
      // A removed photo's file goes now, not at the next cron run (160).
      if (row.type_snapshot === 'photo') {
        fetch('/api/banter/media/sweep', { method: 'POST' })
          .catch(err => console.warn('[ReportsTab] media sweep failed:', err))
      }
    }
    const { error } = await supabase
      .from('pool_message_reports')
      .update({
        status: action === 'remove' ? 'actioned' : 'dismissed',
        resolved_by: currentUserId,
        resolved_at: new Date().toISOString(),
      })
      .eq('report_id', row.report_id)
    setBusyId(null)
    if (error) {
      console.error('[ReportsTab] resolve failed:', error)
      showToast('Could not update the report.', 'error')
      return
    }
    showToast(action === 'remove' ? 'Message removed.' : 'Report dismissed.', 'success')
    setRows(prev => (prev ?? []).filter(r => r.report_id !== row.report_id))
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        {(['open', 'resolved'] as const).map(v => (
          <button
            key={v}
            type="button"
            onClick={() => { if (v !== view) { setRows(null); setView(v) } }}
            className={`px-3 py-1.5 text-xs rounded-control font-semibold transition-colors ${
              view === v ? 'bg-primary-600 text-white' : 'bg-silver text-ink hover:bg-muted/40'
            }`}
          >
            {v === 'open' ? 'Open' : 'Resolved'}
          </button>
        ))}
      </div>

      {rows === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <Card><p className="text-sm text-muted">{view === 'open' ? 'No open reports.' : 'Nothing resolved yet.'}</p></Card>
      ) : (
        rows.map(row => {
          const gone = !row.message_id || !!row.message?.deleted_at
          return (
            <Card key={row.report_id}>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Badge variant="yellow">{REASON_LABEL[row.reason] ?? row.reason}</Badge>
                {row.type_snapshot !== 'text' && <Badge variant="gray">{row.type_snapshot}</Badge>}
                {row.status !== 'open' && <Badge variant={row.status === 'actioned' ? 'green' : 'gray'}>{row.status}</Badge>}
                {gone && <Badge variant="gray">message deleted</Badge>}
                <span className="text-xs text-muted ml-auto">{new Date(row.created_at).toLocaleString()}</span>
              </div>

              <blockquote className="border-l-2 border-primary-500 bg-snow rounded-r-control px-4 py-3 text-sm text-ink whitespace-pre-wrap break-words mb-3">
                {row.content_snapshot}
              </blockquote>

              <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-xs mb-3">
                <dt className="text-muted">Pool</dt><dd className="text-ink">{row.pools?.pool_name ?? '—'}</dd>
                <dt className="text-muted">Sent by</dt><dd className="text-ink">{person(row.reported)}</dd>
                <dt className="text-muted">Reported by</dt><dd className="text-ink">{person(row.reporter)}</dd>
                {row.details && (<><dt className="text-muted">Their note</dt><dd className="text-ink">{row.details}</dd></>)}
              </dl>

              {row.status === 'open' && (
                <div className="flex gap-2 justify-end">
                  <Button variant="gray" size="sm" onClick={() => void resolve(row, 'dismiss')} disabled={busyId === row.report_id}>
                    Dismiss
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => void resolve(row, 'remove')} loading={busyId === row.report_id} loadingText="Working...">
                    {gone ? 'Mark handled' : 'Remove message'}
                  </Button>
                </div>
              )}
            </Card>
          )
        })
      )}
    </div>
  )
}
