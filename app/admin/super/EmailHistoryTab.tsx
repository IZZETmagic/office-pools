'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'

// --- Sent email types ---

type SentEmail = {
  id: string
  from: string
  to: string[]
  subject: string
  created_at: string
  last_event: string
}

type SentEmailDetail = SentEmail & {
  html: string | null
  text: string | null
  bcc: string[] | null
  cc: string[] | null
  reply_to: string[] | null
  tags?: { name: string; value: string }[]
  scheduled_at: string | null
}

const EVENT_STYLES: Record<string, { label: string; color: string }> = {
  delivered: { label: 'Delivered', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  opened: { label: 'Opened', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  clicked: { label: 'Clicked', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' },
  sent: { label: 'Sent', color: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400' },
  queued: { label: 'Queued', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  bounced: { label: 'Bounced', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  complained: { label: 'Complained', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  canceled: { label: 'Canceled', color: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-500' },
  delivery_delayed: { label: 'Delayed', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  scheduled: { label: 'Scheduled', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
}

// --- Received email types ---

type ReceivedEmail = {
  id: string
  from: string
  to: string[]
  subject: string
  created_at: string
  cc: string[] | null
  bcc: string[] | null
  reply_to: string[] | null
  message_id: string
  attachments: { id: string; filename: string | null }[]
}

type ReceivedEmailDetail = ReceivedEmail & {
  html: string | null
  text: string | null
  headers: Record<string, string>
}

// --- Broadcast types ---

const SEGMENTS: Record<string, { label: string }> = {
  all: { label: 'All Users' },
  pool_admins: { label: 'Pool Admins' },
  empty_pool_admins: { label: 'Empty Pool Admins' },
  solo_pool_admins: { label: 'Solo Pool Admins' },
  small_pool_admins: { label: 'Small Pool Admins' },
  non_admin_members: { label: 'Non-Admin Members' },
  active_members: { label: 'Active Members' },
  inactive_users: { label: 'Inactive Users' },
  lapsed_users: { label: 'Lapsed Users' },
  engaged_no_pool: { label: 'Engaged, No Pool' },
  past_predictors: { label: 'Past Predictors' },
  recent_signups: { label: 'Recent Signups' },
  super_admins: { label: 'Super Admins' },
}

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

type HistorySection = 'sent' | 'received' | 'broadcasts'

// --- Inline detail content (used inside expanded table rows) ---

function InlineDetailContent({
  html,
  text,
  from,
  to,
  cc,
  bcc,
  reply_to,
  tags,
}: {
  html: string | null
  text: string | null
  from: string
  to: string[]
  cc?: string[] | null
  bcc?: string[] | null
  reply_to?: string[] | null
  tags?: { name: string; value: string }[]
}) {
  return (
    <div className="space-y-3">
      {/* Metadata */}
      <div className="space-y-1.5 text-sm">
        <div className="flex gap-2">
          <span className="text-neutral-500 w-16 shrink-0">From</span>
          <span className="text-neutral-900 dark:text-neutral-100 truncate">{from}</span>
        </div>
        <div className="flex gap-2">
          <span className="text-neutral-500 w-16 shrink-0">To</span>
          <span className="text-neutral-900 dark:text-neutral-100 truncate">{to.join(', ')}</span>
        </div>
        {cc && cc.length > 0 && (
          <div className="flex gap-2">
            <span className="text-neutral-500 w-16 shrink-0">CC</span>
            <span className="text-neutral-700 dark:text-neutral-300 truncate">{cc.join(', ')}</span>
          </div>
        )}
        {bcc && bcc.length > 0 && (
          <div className="flex gap-2">
            <span className="text-neutral-500 w-16 shrink-0">BCC</span>
            <span className="text-neutral-700 dark:text-neutral-300 truncate">{bcc.join(', ')}</span>
          </div>
        )}
        {reply_to && reply_to.length > 0 && (
          <div className="flex gap-2">
            <span className="text-neutral-500 w-16 shrink-0">Reply-To</span>
            <span className="text-neutral-700 dark:text-neutral-300 truncate">{reply_to.join(', ')}</span>
          </div>
        )}
        {tags && tags.length > 0 && (
          <div className="flex gap-2 items-start">
            <span className="text-neutral-500 w-16 shrink-0">Tags</span>
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span
                  key={tag.name}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400"
                >
                  {tag.name}: {tag.value}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Content preview */}
      {html ? (
        <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
          <iframe
            srcDoc={html}
            title="Email content"
            className="w-full bg-white"
            style={{ height: 350 }}
            sandbox=""
          />
        </div>
      ) : text ? (
        <div className="bg-neutral-50 dark:bg-neutral-800 rounded-lg p-3 max-h-[350px] overflow-y-auto">
          <pre className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap font-sans">{text}</pre>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">No content available.</p>
      )}
    </div>
  )
}

// --- Sent email row with inline expansion ---

function SentEmailRow({
  email,
  eventStyle,
  isExpanded,
  loadingDetail,
  emailDetail,
  onToggle,
  onClose,
}: {
  email: SentEmail
  eventStyle: { label: string; color: string }
  isExpanded: boolean
  loadingDetail: boolean
  emailDetail: SentEmailDetail | null
  onToggle: () => void
  onClose: () => void
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-b border-neutral-100 dark:border-neutral-800 cursor-pointer transition-colors ${
          isExpanded
            ? 'bg-primary-50 dark:bg-primary-950'
            : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
        }`}
      >
        <td className="px-4 py-2.5 text-neutral-900 dark:text-neutral-100">
          <div className="max-w-[200px] truncate">{email.to.join(', ')}</div>
        </td>
        <td className="px-4 py-2.5 text-neutral-700 dark:text-neutral-300">
          <div className="flex items-center gap-2 max-w-[300px]">
            <span className="truncate">{email.subject}</span>
            <svg className={`w-3.5 h-3.5 shrink-0 text-neutral-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
        </td>
        <td className="px-4 py-2.5">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${eventStyle.color}`}>
            {eventStyle.label}
          </span>
        </td>
        <td className="px-4 py-2.5 text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
          {new Date(email.created_at).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={4} className="px-4 py-4 bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-700">
            {loadingDetail ? (
              <p className="text-sm text-neutral-500 text-center py-4">Loading email details...</p>
            ) : emailDetail ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-neutral-500">Email Detail</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onClose() }}
                    className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <InlineDetailContent
                  html={emailDetail.html}
                  text={emailDetail.text}
                  from={emailDetail.from}
                  to={emailDetail.to}
                  cc={emailDetail.cc}
                  bcc={emailDetail.bcc}
                  reply_to={emailDetail.reply_to}
                  tags={emailDetail.tags}
                />
              </div>
            ) : (
              <p className="text-sm text-neutral-500 text-center py-4">Failed to load email details.</p>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// --- Received email row with inline expansion ---

function ReceivedEmailRow({
  email,
  isExpanded,
  loadingDetail,
  emailDetail,
  onToggle,
  onClose,
  onReply,
}: {
  email: ReceivedEmail
  isExpanded: boolean
  loadingDetail: boolean
  emailDetail: ReceivedEmailDetail | null
  onToggle: () => void
  onClose: () => void
  onReply: (email: ReceivedEmail, detail: ReceivedEmailDetail) => void
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className={`border-b border-neutral-100 dark:border-neutral-800 cursor-pointer transition-colors ${
          isExpanded
            ? 'bg-primary-50 dark:bg-primary-950'
            : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
        }`}
      >
        <td className="px-4 py-2.5 text-neutral-900 dark:text-neutral-100">
          <div className="max-w-[200px] truncate">{email.from}</div>
        </td>
        <td className="px-4 py-2.5 text-neutral-700 dark:text-neutral-300">
          <div className="flex items-center gap-2 max-w-[300px]">
            <span className="truncate">{email.subject}</span>
            {email.attachments.length > 0 && (
              <span className="inline-flex items-center gap-0.5 shrink-0 text-neutral-400">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                </svg>
                <span className="text-[11px]">{email.attachments.length}</span>
              </span>
            )}
            <svg className={`w-3.5 h-3.5 shrink-0 text-neutral-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </div>
        </td>
        <td className="px-4 py-2.5 text-neutral-500 dark:text-neutral-400">
          <div className="max-w-[200px] truncate">{email.to.join(', ')}</div>
        </td>
        <td className="px-4 py-2.5 text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
          {new Date(email.created_at).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={4} className="px-4 py-4 bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-700">
            {loadingDetail ? (
              <p className="text-sm text-neutral-500 text-center py-4">Loading email details...</p>
            ) : emailDetail ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-neutral-500">Email Detail</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); onReply(email, emailDetail as ReceivedEmailDetail) }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-primary-50 dark:bg-primary-950 text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                      </svg>
                      Reply
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onClose() }}
                      className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
                <InlineDetailContent
                  html={emailDetail.html}
                  text={emailDetail.text}
                  from={emailDetail.from}
                  to={emailDetail.to}
                  cc={emailDetail.cc}
                  bcc={emailDetail.bcc}
                  reply_to={emailDetail.reply_to}
                />
              </div>
            ) : (
              <p className="text-sm text-neutral-500 text-center py-4">Failed to load email details.</p>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

// --- Main component ---

export function EmailHistoryTab() {
  const [activeSection, setActiveSection] = useState<HistorySection>('sent')
  const [loading, setLoading] = useState(true)
  const { showToast } = useToast()

  // Data
  const [sentEmails, setSentEmails] = useState<SentEmail[]>([])
  const [receivedEmails, setReceivedEmails] = useState<ReceivedEmail[]>([])
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [selectedBroadcast, setSelectedBroadcast] = useState<Broadcast | null>(null)

  // Email detail expansion
  const [expandedEmailId, setExpandedEmailId] = useState<string | null>(null)
  const [emailDetail, setEmailDetail] = useState<(SentEmailDetail | ReceivedEmailDetail) | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Reply compose state
  const [replyTo, setReplyTo] = useState<{ email: string; subject: string; messageId: string } | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [replyPreviewHtml, setReplyPreviewHtml] = useState('')
  const [replyRecipientName, setReplyRecipientName] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [sendingReply, setSendingReply] = useState(false)

  function handleStartReply(email: ReceivedEmail, detail: ReceivedEmailDetail) {
    // For contact form emails, extract the user's email from the body
    // The contact form embeds: <strong>Email:</strong></td><td ...>user@example.com</td>
    let replyAddress = (email.reply_to && email.reply_to.length > 0) ? email.reply_to[0] : email.from
    const content = detail.html || detail.text || ''
    const contactEmailMatch = content.match(/Email:<\/strong><\/td>\s*<td[^>]*>([^<]+@[^<]+)<\/td>/i)
      || content.match(/Email:\s*([^\s<]+@[^\s<]+)/i)
    if (contactEmailMatch) {
      replyAddress = contactEmailMatch[1].trim()
    }

    setReplyTo({
      email: replyAddress,
      subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
      messageId: email.message_id,
    })
    setReplyBody('')
    setReplyRecipientName(null)
    setReplyPreviewHtml('')
  }

  function handleCancelReply() {
    setReplyTo(null)
    setReplyBody('')
    setReplyPreviewHtml('')
    setReplyRecipientName(null)
  }

  async function handlePreviewReply() {
    if (!replyTo || !replyBody.trim()) return

    setLoadingPreview(true)
    try {
      const res = await fetch('/api/admin/reply-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: replyTo.email,
          subject: replyTo.subject,
          body_text: replyBody,
          preview: true,
        }),
      })

      const data = await res.json()
      if (res.ok && data.html) {
        setReplyPreviewHtml(data.html)
        if (data.firstName) setReplyRecipientName(data.firstName)
      } else {
        showToast('Failed to generate preview', 'error')
      }
    } catch {
      showToast('Failed to generate preview', 'error')
    } finally {
      setLoadingPreview(false)
    }
  }

  async function handleSendReply() {
    if (!replyTo || !replyBody.trim()) return

    setSendingReply(true)
    try {
      const res = await fetch('/api/admin/reply-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: replyTo.email,
          subject: replyTo.subject,
          body_text: replyBody,
          in_reply_to: replyTo.messageId,
          references: replyTo.messageId,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        showToast(data.error || 'Failed to send reply', 'error')
        return
      }

      showToast('Reply sent', 'success')
      handleCancelReply()
      // Refresh to show the sent reply in the sent tab
      loadAll()
    } catch {
      showToast('Failed to send reply', 'error')
    } finally {
      setSendingReply(false)
    }
  }

  async function loadAll() {
    setLoading(true)
    try {
      const [emailRes, broadcastRes] = await Promise.all([
        fetch('/api/admin/email-history'),
        fetch('/api/admin/broadcast'),
      ])

      if (emailRes.ok) {
        const data = await emailRes.json()
        setSentEmails(data.emails || [])
        setReceivedEmails(data.received || [])
      }
      if (broadcastRes.ok) {
        const data = await broadcastRes.json()
        setBroadcasts(data.broadcasts || [])
      }
    } catch {
      // Silent fail
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  const fetchEmailDetail = useCallback(async (id: string, type: 'sent' | 'received') => {
    if (expandedEmailId === id) {
      setExpandedEmailId(null)
      setEmailDetail(null)
      return
    }

    setExpandedEmailId(id)
    setLoadingDetail(true)
    setEmailDetail(null)

    try {
      const res = await fetch(`/api/admin/email-history/${id}?type=${type}`)
      if (res.ok) {
        const data = await res.json()
        setEmailDetail(data.email)
      }
    } catch {
      // Silent fail
    } finally {
      setLoadingDetail(false)
    }
  }, [expandedEmailId])

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
            Email History
          </h3>
          <p className="text-sm text-neutral-500 mt-0.5">
            All sent, received, and broadcast emails
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={loadAll}
          disabled={loading}
          loading={loading}
        >
          Refresh
        </Button>
      </div>

      {/* Section toggle */}
      <div className="flex gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg p-1 w-fit">
        {([
          { key: 'sent' as const, label: 'Sent', count: sentEmails.length },
          { key: 'received' as const, label: 'Received', count: receivedEmails.length },
          { key: 'broadcasts' as const, label: 'Broadcasts', count: broadcasts.length },
        ]).map((section) => (
          <button
            key={section.key}
            onClick={() => {
              setActiveSection(section.key)
              setSelectedBroadcast(null)
              setExpandedEmailId(null)
              setEmailDetail(null)
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              activeSection === section.key
                ? 'bg-surface text-neutral-900 dark:text-neutral-100 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300'
            }`}
          >
            {section.label} ({section.count})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12">
          <p className="text-sm text-neutral-500">Loading email history...</p>
        </div>
      ) : (
        <>
          {/* ========== Sent Emails ========== */}
          {activeSection === 'sent' && (
            sentEmails.length === 0 ? (
              <div className="bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-xl p-6 text-center">
                <p className="text-sm text-neutral-500">No emails sent yet.</p>
              </div>
            ) : (
              <div className="border border-neutral-200 dark:border-neutral-700 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
                        <th className="text-left px-4 py-2.5 font-medium text-neutral-500 dark:text-neutral-400">To</th>
                        <th className="text-left px-4 py-2.5 font-medium text-neutral-500 dark:text-neutral-400">Subject</th>
                        <th className="text-left px-4 py-2.5 font-medium text-neutral-500 dark:text-neutral-400">Status</th>
                        <th className="text-left px-4 py-2.5 font-medium text-neutral-500 dark:text-neutral-400">Sent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sentEmails.map((email) => {
                        const eventStyle = EVENT_STYLES[email.last_event] || { label: email.last_event, color: 'bg-neutral-100 text-neutral-600' }
                        const isExpanded = expandedEmailId === email.id
                        return (
                          <SentEmailRow
                            key={email.id}
                            email={email}
                            eventStyle={eventStyle}
                            isExpanded={isExpanded}
                            loadingDetail={loadingDetail}
                            emailDetail={isExpanded ? emailDetail as SentEmailDetail | null : null}
                            onToggle={() => fetchEmailDetail(email.id, 'sent')}
                            onClose={() => { setExpandedEmailId(null); setEmailDetail(null) }}
                          />
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}

          {/* ========== Reply Compose ========== */}
          {activeSection === 'received' && replyTo && (
            <div className="bg-surface border border-primary-200 dark:border-primary-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                  </svg>
                  <h4 className="font-medium text-sm text-neutral-900 dark:text-neutral-100">
                    Reply to {replyRecipientName ? `${replyRecipientName} (${replyTo.email})` : replyTo.email}
                  </h4>
                </div>
                <button
                  onClick={handleCancelReply}
                  className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="text-sm text-neutral-500 dark:text-neutral-400">
                <span className="font-medium text-neutral-700 dark:text-neutral-300">Subject:</span>{' '}
                {replyTo.subject}
              </div>

              <textarea
                value={replyBody}
                onChange={(e) => { setReplyBody(e.target.value); setReplyPreviewHtml(''); setReplyRecipientName(null) }}
                placeholder="Type your reply..."
                rows={6}
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-surface px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-y"
                autoFocus
              />

              {/* Preview iframe */}
              {replyPreviewHtml && (
                <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
                  <div className="bg-neutral-50 dark:bg-neutral-800 px-3 py-2 text-xs font-medium text-neutral-500 border-b border-neutral-200 dark:border-neutral-700">
                    Email Preview
                  </div>
                  <iframe
                    srcDoc={replyPreviewHtml}
                    title="Reply preview"
                    className="w-full bg-white"
                    style={{ height: 350 }}
                    sandbox=""
                  />
                </div>
              )}

              <div className="flex items-center gap-3">
                {!replyPreviewHtml ? (
                  <Button
                    size="sm"
                    onClick={handlePreviewReply}
                    loading={loadingPreview}
                    disabled={!replyBody.trim()}
                  >
                    Preview
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={handleSendReply}
                    loading={sendingReply}
                  >
                    Confirm &amp; Send
                  </Button>
                )}
                {replyPreviewHtml && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setReplyPreviewHtml('')}
                  >
                    Edit
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancelReply}
                >
                  Cancel
                </Button>
                <span className="text-[11px] text-neutral-400 dark:text-neutral-500">
                  Sent from support@sportpool.io with threading headers
                </span>
              </div>
            </div>
          )}

          {/* ========== Received Emails ========== */}
          {activeSection === 'received' && (
            receivedEmails.length === 0 ? (
              <div className="bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-xl p-6 text-center">
                <p className="text-sm text-neutral-500">No received emails yet.</p>
              </div>
            ) : (
              <div className="border border-neutral-200 dark:border-neutral-700 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
                        <th className="text-left px-4 py-2.5 font-medium text-neutral-500 dark:text-neutral-400">From</th>
                        <th className="text-left px-4 py-2.5 font-medium text-neutral-500 dark:text-neutral-400">Subject</th>
                        <th className="text-left px-4 py-2.5 font-medium text-neutral-500 dark:text-neutral-400">To</th>
                        <th className="text-left px-4 py-2.5 font-medium text-neutral-500 dark:text-neutral-400">Received</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receivedEmails.map((email) => {
                        const isExpanded = expandedEmailId === email.id
                        return (
                          <ReceivedEmailRow
                            key={email.id}
                            email={email}
                            isExpanded={isExpanded}
                            loadingDetail={loadingDetail}
                            emailDetail={isExpanded ? emailDetail as ReceivedEmailDetail | null : null}
                            onToggle={() => fetchEmailDetail(email.id, 'received')}
                            onClose={() => { setExpandedEmailId(null); setEmailDetail(null) }}
                            onReply={handleStartReply}
                          />
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}

          {/* ========== Broadcasts ========== */}
          {activeSection === 'broadcasts' && (
            <>
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
                            {SEGMENTS[selectedBroadcast.log.segment]?.label || selectedBroadcast.log.segment}
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

              {broadcasts.length === 0 ? (
                <div className="bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-xl p-6 text-center">
                  <p className="text-sm text-neutral-500">No broadcasts sent yet.</p>
                </div>
              ) : (
                <div className="border border-neutral-200 dark:border-neutral-700 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-neutral-50 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
                          <th className="text-left px-4 py-2.5 font-medium text-neutral-500 dark:text-neutral-400">Name</th>
                          <th className="text-left px-4 py-2.5 font-medium text-neutral-500 dark:text-neutral-400">Segment</th>
                          <th className="text-left px-4 py-2.5 font-medium text-neutral-500 dark:text-neutral-400">Status</th>
                          <th className="text-left px-4 py-2.5 font-medium text-neutral-500 dark:text-neutral-400">Sent</th>
                          <th className="text-left px-4 py-2.5 font-medium text-neutral-500 dark:text-neutral-400">Recipients</th>
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
                                  {SEGMENTS[b.log.segment]?.label || b.log.segment}
                                </Badge>
                              ) : (
                                <span className="text-neutral-400 text-xs">-</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5">
                              <Badge variant={statusColor(b.status)}>{b.status}</Badge>
                            </td>
                            <td className="px-4 py-2.5 text-neutral-500 whitespace-nowrap">
                              {b.sent_at
                                ? new Date(b.sent_at).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                  })
                                : '-'}
                            </td>
                            <td className="px-4 py-2.5 text-neutral-500">
                              {b.log ? b.log.recipient_count : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
