'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { useToast } from '@/components/ui/Toast'

const SEGMENTS = {
  all: { label: 'All Users', description: 'Every registered user' },
  pool_admins: { label: 'Pool Admins', description: 'Users who have created a pool' },
  active_members: { label: 'Active Members', description: 'Users in at least one pool' },
  inactive_users: { label: 'Inactive Users', description: 'Signed up but never joined a pool' },
  recent_signups: { label: 'Recent Signups', description: 'Joined in the last 14 days' },
  super_admins: { label: 'Super Admins', description: 'Internal / test emails only' },
} as const

type SegmentKey = keyof typeof SEGMENTS

type BroadcastLog = {
  broadcast_id: string
  subject: string
  segment: string
  recipient_count: number
  recipients: string[]
  sent_at: string
}

type Broadcast = {
  id: string
  name: string | null
  status: string
  created_at: string
  sent_at: string | null
  log: BroadcastLog | null
}

export function BroadcastTab() {
  const [sending, setSending] = useState(false)
  const [showCompose, setShowCompose] = useState(false)
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [selectedBroadcast, setSelectedBroadcast] = useState<Broadcast | null>(null)
  const { showToast } = useToast()

  // Compose form state
  const [subject, setSubject] = useState('')
  const [heading, setHeading] = useState('')
  const [body, setBody] = useState('')
  const [ctaText, setCtaText] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [segment, setSegment] = useState<SegmentKey>('all')
  const [previewHtml, setPreviewHtml] = useState('')
  const [confirmSend, setConfirmSend] = useState(false)

  useEffect(() => {
    fetchBroadcasts()
  }, [])

  async function fetchBroadcasts() {
    try {
      const res = await fetch('/api/admin/broadcast')
      if (res.ok) {
        const data = await res.json()
        setBroadcasts(data.broadcasts || [])
      }
    } catch {
      // Silent fail
    } finally {
      setLoadingHistory(false)
    }
  }

  function buildHtml() {
    const APP_URL = window.location.origin
    return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <span style="display:none;max-height:0;overflow:hidden;">${subject}</span>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#16a34a,#15803d);padding:24px 32px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.025em;">Sport Pool</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#171717;font-size:18px;font-weight:600;">${heading || subject}</h2>
          <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Hi {{{FIRST_NAME|there}}},</p>
          <div style="color:#525252;line-height:1.6;">${body.replace(/\n/g, '<br>')}</div>
          ${ctaText && ctaUrl ? `
          <div style="text-align:center;margin:24px 0;">
            <a href="${ctaUrl}" style="display:inline-block;padding:12px 32px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">${ctaText}</a>
          </div>` : ''}
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #e5e5e5;text-align:center;">
          <p style="margin:0;color:#a3a3a3;font-size:12px;line-height:1.5;">
            <a href="${APP_URL}" style="color:#a3a3a3;text-decoration:none;">Sport Pool</a> &middot;
            <a href="${APP_URL}/profile?tab=settings" style="color:#a3a3a3;text-decoration:none;">Notification Settings</a> &middot;
            <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#a3a3a3;text-decoration:none;">Unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
  }

  async function handleSend() {
    if (!subject || !body) {
      showToast('Subject and body are required', 'error')
      return
    }

    setSending(true)
    try {
      const html = buildHtml()
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, html, segment }),
      })

      const data = await res.json()
      if (!res.ok) {
        showToast(data.error || 'Failed to send broadcast', 'error')
        return
      }

      showToast(data.message, 'success')
      resetForm()
      fetchBroadcasts()
    } catch {
      showToast('Failed to send broadcast', 'error')
    } finally {
      setSending(false)
    }
  }

  function resetForm() {
    setShowCompose(false)
    setSubject('')
    setHeading('')
    setBody('')
    setCtaText('')
    setCtaUrl('')
    setSegment('all')
    setPreviewHtml('')
    setConfirmSend(false)
  }

  const statusColor = (status: string): 'green' | 'gray' | 'yellow' | 'blue' => {
    switch (status) {
      case 'sent': return 'green'
      case 'draft': return 'gray'
      case 'sending': return 'yellow'
      default: return 'gray'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Broadcast Emails
          </h3>
          <p className="text-sm text-neutral-500 mt-0.5">
            Send marketing emails to user segments
          </p>
        </div>
        <Button
          onClick={() => { setShowCompose(!showCompose); setConfirmSend(false); setPreviewHtml(''); setSelectedBroadcast(null) }}
          size="sm"
        >
          {showCompose ? 'Cancel' : 'New Broadcast'}
        </Button>
      </div>

      {/* Compose form */}
      {showCompose && (
        <div className="bg-surface border border-neutral-200 dark:border-neutral-700 rounded-xl p-6 space-y-4">
          <h4 className="font-medium text-neutral-900 dark:text-neutral-100">Compose Broadcast</h4>

          {/* Segment selector */}
          <FormField label="Send To">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.entries(SEGMENTS) as [SegmentKey, typeof SEGMENTS[SegmentKey]][]).map(([key, seg]) => (
                <button
                  key={key}
                  onClick={() => { setSegment(key); setConfirmSend(false) }}
                  className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                    segment === key
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300 ring-1 ring-primary-500'
                      : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 text-neutral-700 dark:text-neutral-300'
                  }`}
                >
                  <div className="font-medium text-xs">{seg.label}</div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">{seg.description}</div>
                </button>
              ))}
            </div>
          </FormField>

          <FormField label="Email Subject">
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Predictions are open!"
            />
          </FormField>

          <FormField label="Heading" helperText="Optional - defaults to subject if empty">
            <Input
              value={heading}
              onChange={(e) => setHeading(e.target.value)}
              placeholder="e.g. It's time to predict!"
            />
          </FormField>

          <FormField label="Body" helperText="Plain text - line breaks are preserved">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your email content here..."
              rows={6}
              className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-surface px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-y"
            />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Button Text" helperText="Optional">
              <Input
                value={ctaText}
                onChange={(e) => setCtaText(e.target.value)}
                placeholder="e.g. Make Predictions"
              />
            </FormField>
            <FormField label="Button URL" helperText="Optional">
              <Input
                value={ctaUrl}
                onChange={(e) => setCtaUrl(e.target.value)}
                placeholder="e.g. https://sportpool.io/dashboard"
              />
            </FormField>
          </div>

          {/* Preview */}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPreviewHtml(buildHtml())}
              disabled={!subject || !body}
            >
              Preview
            </Button>
          </div>

          {previewHtml && (
            <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
              <div className="bg-neutral-50 dark:bg-neutral-800 px-3 py-2 text-xs font-medium text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">
                Email Preview
              </div>
              <iframe
                srcDoc={previewHtml}
                title="Email preview"
                className="w-full bg-white"
                style={{ height: 400 }}
                sandbox=""
              />
            </div>
          )}

          {/* Send controls */}
          <div className="flex items-center gap-3 pt-2 border-t border-neutral-200 dark:border-neutral-700">
            {!confirmSend ? (
              <Button
                size="sm"
                onClick={() => setConfirmSend(true)}
                disabled={!subject || !body}
              >
                Send to {SEGMENTS[segment].label}
              </Button>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-xs text-warning-600 dark:text-warning-400 font-medium">
                  Send to all {SEGMENTS[segment].label.toLowerCase()}?
                </span>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={handleSend}
                  loading={sending}
                >
                  Confirm Send
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmSend(false)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Broadcast detail panel */}
      {selectedBroadcast && (
        <div className="bg-surface border border-neutral-200 dark:border-neutral-700 rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-neutral-900 dark:text-neutral-100">
              {selectedBroadcast.name || 'Untitled'}
            </h4>
            <Button size="sm" variant="outline" onClick={() => setSelectedBroadcast(null)}>
              Close
            </Button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-neutral-500 text-xs mb-1">Status</div>
              <Badge variant={statusColor(selectedBroadcast.status)}>{selectedBroadcast.status}</Badge>
            </div>
            <div>
              <div className="text-neutral-500 text-xs mb-1">Sent</div>
              <div className="text-neutral-900 dark:text-neutral-100">
                {selectedBroadcast.sent_at ? new Date(selectedBroadcast.sent_at).toLocaleString() : '-'}
              </div>
            </div>
            {selectedBroadcast.log && (
              <>
                <div>
                  <div className="text-neutral-500 text-xs mb-1">Segment</div>
                  <Badge variant="blue">
                    {SEGMENTS[selectedBroadcast.log.segment as SegmentKey]?.label || selectedBroadcast.log.segment}
                  </Badge>
                </div>
                <div>
                  <div className="text-neutral-500 text-xs mb-1">Recipients</div>
                  <div className="text-neutral-900 dark:text-neutral-100 font-medium">
                    {selectedBroadcast.log.recipient_count}
                  </div>
                </div>
              </>
            )}
          </div>

          {selectedBroadcast.log?.recipients && selectedBroadcast.log.recipients.length > 0 && (
            <div>
              <div className="text-neutral-500 text-xs mb-2">Recipient List</div>
              <div className="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-3 max-h-48 overflow-y-auto">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1">
                  {selectedBroadcast.log.recipients.map((email) => (
                    <div key={email} className="text-xs text-neutral-700 dark:text-neutral-300 truncate">
                      {email}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {!selectedBroadcast.log && (
            <p className="text-sm text-neutral-500">
              No audit log available for this broadcast (sent before logging was enabled).
            </p>
          )}
        </div>
      )}

      {/* Broadcast history from Resend */}
      {loadingHistory ? (
        <div className="text-neutral-500 text-sm py-8 text-center">Loading broadcast history...</div>
      ) : broadcasts.length > 0 ? (
        <div className="bg-surface border border-neutral-200 dark:border-neutral-700 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
            <h4 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Broadcast History</h4>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-700">
                <th className="text-left px-4 py-2.5 font-medium text-neutral-600 dark:text-neutral-400">Name</th>
                <th className="text-left px-4 py-2.5 font-medium text-neutral-600 dark:text-neutral-400">Segment</th>
                <th className="text-left px-4 py-2.5 font-medium text-neutral-600 dark:text-neutral-400">Status</th>
                <th className="text-left px-4 py-2.5 font-medium text-neutral-600 dark:text-neutral-400">Sent</th>
                <th className="text-left px-4 py-2.5 font-medium text-neutral-600 dark:text-neutral-400">Recipients</th>
              </tr>
            </thead>
            <tbody>
              {broadcasts.map((b) => (
                <tr
                  key={b.id}
                  onClick={() => setSelectedBroadcast(selectedBroadcast?.id === b.id ? null : b)}
                  className={`border-b border-neutral-100 dark:border-neutral-800 last:border-0 cursor-pointer transition-colors ${
                    selectedBroadcast?.id === b.id
                      ? 'bg-primary-50 dark:bg-primary-950'
                      : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                  }`}
                >
                  <td className="px-4 py-2.5 text-neutral-900 dark:text-neutral-100 font-medium">
                    {b.name || 'Untitled'}
                  </td>
                  <td className="px-4 py-2.5">
                    {b.log ? (
                      <Badge variant="blue">
                        {SEGMENTS[b.log.segment as SegmentKey]?.label || b.log.segment}
                      </Badge>
                    ) : (
                      <span className="text-neutral-400 text-xs">-</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={statusColor(b.status)}>{b.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-neutral-500">
                    {b.sent_at ? new Date(b.sent_at).toLocaleString() : '-'}
                  </td>
                  <td className="px-4 py-2.5 text-neutral-500">
                    {b.log ? b.log.recipient_count : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !showCompose ? (
        <div className="text-center py-12 text-neutral-500 text-sm">
          No broadcasts sent yet. Create your first one!
        </div>
      ) : null}
    </div>
  )
}
