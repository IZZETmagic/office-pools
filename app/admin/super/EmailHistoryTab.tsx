'use client'

import { type ReactNode, useState, useEffect, useCallback } from 'react'
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
  sent: { label: 'Sent', color: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 ' },
  queued: { label: 'Queued', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  bounced: { label: 'Bounced', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  complained: { label: 'Complained', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  canceled: { label: 'Canceled', color: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 ' },
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

type DetailView =
  | { type: 'sent'; email: SentEmail }
  | { type: 'received'; email: ReceivedEmail }
  | { type: 'broadcast'; broadcast: Broadcast }

// --- Detail content component ---

function EmailDetailContent({
  html,
  text,
  from,
  to,
  cc,
  bcc,
  reply_to,
  tags,
  children,
}: {
  html: string | null
  text: string | null
  from: string
  to: string[]
  cc?: string[] | null
  bcc?: string[] | null
  reply_to?: string[] | null
  tags?: { name: string; value: string }[]
  children?: React.ReactNode
}) {
  return (
    <div className="space-y-4">
      {/* Metadata */}
      <div className="bg-surface sp-radius-sm p-4 space-y-2" style={{ border: '0.5px solid var(--sp-silver, #C8CCD4)66' }}>
        <div className="flex gap-3">
          <span className="text-neutral-500 w-20 shrink-0 text-sm sp-body">From</span>
          <span className="sp-text-ink text-sm truncate">{from}</span>
        </div>
        <div className="flex gap-3">
          <span className="text-neutral-500 w-20 shrink-0 text-sm sp-body">To</span>
          <span className="sp-text-ink text-sm truncate">{to.join(', ')}</span>
        </div>
        {cc && cc.length > 0 && (
          <div className="flex gap-3">
            <span className="text-neutral-500 w-20 shrink-0 text-sm sp-body">CC</span>
            <span className="sp-text-slate text-sm truncate">{cc.join(', ')}</span>
          </div>
        )}
        {bcc && bcc.length > 0 && (
          <div className="flex gap-3">
            <span className="text-neutral-500 w-20 shrink-0 text-sm sp-body">BCC</span>
            <span className="sp-text-slate text-sm truncate">{bcc.join(', ')}</span>
          </div>
        )}
        {reply_to && reply_to.length > 0 && (
          <div className="flex gap-3">
            <span className="text-neutral-500 w-20 shrink-0 text-sm sp-body">Reply-To</span>
            <span className="sp-text-slate text-sm truncate">{reply_to.join(', ')}</span>
          </div>
        )}
        {tags && tags.length > 0 && (
          <div className="flex gap-3 items-start">
            <span className="text-neutral-500 w-20 shrink-0 text-sm sp-body">Tags</span>
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => (
                <span
                  key={tag.name}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] sp-bg-mist text-neutral-600 "
                >
                  {tag.name}: {tag.value}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Slot for attachments or other content between metadata and preview */}
      {children}

      {/* Content preview */}
      {html ? (
        <div className="sp-radius-sm overflow-hidden" style={{ border: '0.5px solid var(--sp-silver, #C8CCD4)66' }}>
          <div className="px-3 py-2 text-xs font-medium text-neutral-500 sp-body" style={{ backgroundColor: 'var(--sp-snow, #F7F8FA)', borderBottom: '0.5px solid var(--sp-silver, #C8CCD4)66' }}>
            Email Content
          </div>
          <iframe
            srcDoc={html}
            title="Email content"
            className="w-full bg-white"
            style={{ height: 450 }}
            sandbox=""
          />
        </div>
      ) : text ? (
        <div className="sp-bg-snow sp-radius-sm p-4 max-h-[450px] overflow-y-auto" style={{ border: '0.5px solid var(--sp-silver, #C8CCD4)66' }}>
          <pre className="text-sm sp-text-slate whitespace-pre-wrap font-sans">{text}</pre>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">No content available.</p>
      )}
    </div>
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

  // Detail view
  const [detailView, setDetailView] = useState<DetailView | null>(null)
  const [emailDetail, setEmailDetail] = useState<(SentEmailDetail | ReceivedEmailDetail) | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Attachments
  const [attachments, setAttachments] = useState<{ id: string; filename: string; content_type: string; download_url: string }[]>([])
  const [loadingAttachments, setLoadingAttachments] = useState(false)

  // Reply compose state
  const [replyTo, setReplyTo] = useState<{ email: string; subject: string; messageId: string } | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [replyPreviewHtml, setReplyPreviewHtml] = useState('')
  const [replyRecipientName, setReplyRecipientName] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [sendingReply, setSendingReply] = useState(false)

  function handleStartReply(email: ReceivedEmail, detail: ReceivedEmailDetail) {
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
      loadAll()
    } catch {
      showToast('Failed to send reply', 'error')
    } finally {
      setSendingReply(false)
    }
  }

  function goBack() {
    setDetailView(null)
    setEmailDetail(null)
    setLoadingDetail(false)
    setAttachments([])
    setLoadingAttachments(false)
    handleCancelReply()
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

  const openSentDetail = useCallback(async (email: SentEmail) => {
    setDetailView({ type: 'sent', email })
    setLoadingDetail(true)
    setEmailDetail(null)
    try {
      const res = await fetch(`/api/admin/email-history/${email.id}?type=sent`)
      if (res.ok) {
        const data = await res.json()
        setEmailDetail(data.email)
      }
    } catch {
      // Silent fail
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  const openReceivedDetail = useCallback(async (email: ReceivedEmail) => {
    setDetailView({ type: 'received', email })
    setLoadingDetail(true)
    setEmailDetail(null)
    setAttachments([])

    // Fetch email detail
    try {
      const res = await fetch(`/api/admin/email-history/${email.id}?type=received`)
      if (res.ok) {
        const data = await res.json()
        setEmailDetail(data.email)
      }
    } catch {
      // Silent fail
    } finally {
      setLoadingDetail(false)
    }

    // Fetch attachments if any
    if (email.attachments.length > 0) {
      setLoadingAttachments(true)
      try {
        const res = await fetch(`/api/admin/email-history/${email.id}/attachments`)
        if (res.ok) {
          const data = await res.json()
          setAttachments(data.attachments || [])
        }
      } catch {
        // Silent fail
      } finally {
        setLoadingAttachments(false)
      }
    }
  }, [])

  const statusColor = (status: string): 'green' | 'gray' | 'yellow' | 'blue' => {
    switch (status) {
      case 'sent': return 'green'
      case 'draft': return 'gray'
      case 'sending': return 'yellow'
      default: return 'gray'
    }
  }

  // ===== DETAIL SHEET VIEW =====
  if (detailView) {
    return (
      <div className="sp-body space-y-6">
        {/* Back button */}
        <button
          onClick={goBack}
          className="flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-900  transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          {detailView.type === 'sent' ? 'Sent' : detailView.type === 'received' ? 'Received' : 'Broadcasts'}
        </button>

        {/* ---- Sent Email Detail ---- */}
        {detailView.type === 'sent' && (() => {
          const email = detailView.email
          const eventStyle = EVENT_STYLES[email.last_event] || { label: email.last_event, color: 'bg-neutral-100 text-neutral-600' }
          return (
            <>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 sp-radius-sm flex items-center justify-center shrink-0 sp-bg-primary-light">
                  <svg className="w-5 h-5 sp-text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-2xl font-extrabold sp-heading sp-text-ink truncate">
                      {email.subject}
                    </h2>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${eventStyle.color}`}>
                      {eventStyle.label}
                    </span>
                  </div>
                  <p className="text-sm text-neutral-500 mt-0.5 sp-body">
                    To {email.to.join(', ')} · {new Date(email.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
              </div>

              {loadingDetail ? (
                <div className="text-center py-12">
                  <p className="text-sm text-neutral-500">Loading email details...</p>
                </div>
              ) : emailDetail ? (
                <EmailDetailContent
                  html={(emailDetail as SentEmailDetail).html}
                  text={(emailDetail as SentEmailDetail).text}
                  from={(emailDetail as SentEmailDetail).from}
                  to={(emailDetail as SentEmailDetail).to}
                  cc={(emailDetail as SentEmailDetail).cc}
                  bcc={(emailDetail as SentEmailDetail).bcc}
                  reply_to={(emailDetail as SentEmailDetail).reply_to}
                  tags={(emailDetail as SentEmailDetail).tags}
                />
              ) : (
                <div className="text-center py-12">
                  <p className="text-sm text-neutral-500">Failed to load email details.</p>
                </div>
              )}
            </>
          )
        })()}

        {/* ---- Received Email Detail ---- */}
        {detailView.type === 'received' && (() => {
          const email = detailView.email
          return (
            <>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 sp-radius-sm flex items-center justify-center shrink-0 sp-bg-primary-light">
                  <svg className="w-5 h-5 sp-text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-2xl font-extrabold sp-heading sp-text-ink truncate">
                      {email.subject}
                    </h2>
                    {email.attachments.length > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium sp-bg-mist text-neutral-600  shrink-0">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                        </svg>
                        {email.attachments.length}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-neutral-500 mt-0.5 sp-body">
                    From {email.from} · {new Date(email.created_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </p>
                </div>
              </div>

              {/* Reply button */}
              {!replyTo && emailDetail && (
                <div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleStartReply(email, emailDetail as ReceivedEmailDetail)}
                  >
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                      </svg>
                      Reply
                    </span>
                  </Button>
                </div>
              )}

              {/* Reply compose */}
              {replyTo && (
                <div className="bg-surface sp-radius-lg p-5 space-y-4" style={{ border: '0.5px solid var(--sp-primary, #2563EB)40', boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 sp-text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3" />
                      </svg>
                      <h4 className="font-medium text-sm sp-text-ink sp-heading">
                        Reply to {replyRecipientName ? `${replyRecipientName} (${replyTo.email})` : replyTo.email}
                      </h4>
                    </div>
                    <button
                      onClick={handleCancelReply}
                      className="text-neutral-400 hover:text-neutral-600"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="text-sm sp-text-slate">
                    <span className="font-medium sp-text-slate">Subject:</span>{' '}
                    {replyTo.subject}
                  </div>

                  <textarea
                    value={replyBody}
                    onChange={(e) => { setReplyBody(e.target.value); setReplyPreviewHtml(''); setReplyRecipientName(null) }}
                    placeholder="Type your reply..."
                    rows={6}
                    className="w-full sp-radius-sm border sp-border-silver bg-surface px-3 py-2 text-sm sp-text-ink placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-y"
                    autoFocus
                  />

                  {replyPreviewHtml && (
                    <div className="sp-radius-sm overflow-hidden" style={{ border: '0.5px solid var(--sp-silver, #C8CCD4)66' }}>
                      <div className="px-3 py-2 text-xs font-medium text-neutral-500 sp-body" style={{ backgroundColor: 'var(--sp-snow, #F7F8FA)', borderBottom: '0.5px solid var(--sp-silver, #C8CCD4)66' }}>
                        Reply Preview
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
                    <span className="text-[11px] text-neutral-400 ">
                      Sent from support@sportpool.io with threading headers
                    </span>
                  </div>
                </div>
              )}

              {loadingDetail ? (
                <div className="text-center py-12">
                  <p className="text-sm text-neutral-500">Loading email details...</p>
                </div>
              ) : emailDetail ? (
                <EmailDetailContent
                  html={(emailDetail as ReceivedEmailDetail).html}
                  text={(emailDetail as ReceivedEmailDetail).text}
                  from={(emailDetail as ReceivedEmailDetail).from}
                  to={(emailDetail as ReceivedEmailDetail).to}
                  cc={(emailDetail as ReceivedEmailDetail).cc}
                  bcc={(emailDetail as ReceivedEmailDetail).bcc}
                  reply_to={(emailDetail as ReceivedEmailDetail).reply_to}
                >
                  {email.attachments.length > 0 && (
                    <div className="sp-radius-sm overflow-hidden sp-bg-surface" style={{ boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)', border: '0.5px solid var(--sp-silver, #C8CCD4)80' }}>
                      <div className="overflow-x-auto overscroll-x-contain">
                        <table className="w-full text-sm">
                          <thead>
                            <tr style={{ backgroundColor: 'var(--sp-snow, #F7F8FA)', borderBottom: '0.5px solid var(--sp-silver, #C8CCD4)66' }}>
                              <th className="text-left px-4 py-3 font-medium sp-text-slate whitespace-nowrap sp-body" colSpan={3}>
                                Attachments ({email.attachments.length})
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {loadingAttachments ? (
                              <tr>
                                <td colSpan={3} className="px-4 py-3 text-sm text-neutral-500">Loading attachments...</td>
                              </tr>
                            ) : attachments.length > 0 ? (
                              attachments.map((att) => (
                                <tr
                                  key={att.id}
                                  className="cursor-pointer sp-hover-snow transition-colors group"
                                  style={{ borderBottom: '0.5px solid var(--sp-silver, #C8CCD4)66' }}
                                  onClick={() => window.open(att.download_url, '_blank')}
                                >
                                  <td className="px-4 py-3 whitespace-nowrap">
                                    <div className="flex items-center gap-2.5">
                                      <svg className="w-4 h-4 text-neutral-400 group-hover:text-primary-500 shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                                      </svg>
                                      <span className="sp-text-ink group-hover:text-primary-600 transition-colors">
                                        {att.filename || 'Untitled attachment'}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-neutral-500 whitespace-nowrap">
                                    {att.content_type}
                                  </td>
                                  <td className="px-4 py-3 text-right whitespace-nowrap">
                                    <svg className="w-4 h-4 text-neutral-400 group-hover:text-primary-500 inline-block transition-colors" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                                    </svg>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              email.attachments.map((att) => (
                                <tr key={att.id} style={{ borderBottom: '0.5px solid var(--sp-silver, #C8CCD4)66' }}>
                                  <td className="px-4 py-3 whitespace-nowrap">
                                    <div className="flex items-center gap-2.5">
                                      <svg className="w-4 h-4 text-neutral-400 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                                      </svg>
                                      <span className="sp-text-slate">
                                        {att.filename || 'Untitled attachment'}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-neutral-400 whitespace-nowrap" colSpan={2}>
                                    Download unavailable
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </EmailDetailContent>
              ) : (
                <div className="text-center py-12">
                  <p className="text-sm text-neutral-500">Failed to load email details.</p>
                </div>
              )}
            </>
          )
        })()}

        {/* ---- Broadcast Detail ---- */}
        {detailView.type === 'broadcast' && (() => {
          const broadcast = detailView.broadcast
          return (
            <>
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 sp-radius-sm flex items-center justify-center shrink-0 sp-bg-primary-light">
                  <svg className="w-5 h-5 sp-text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 15.84c-.688-.06-1.386-.09-2.09-.09H7.5a4.5 4.5 0 1 1 0-9h.75c.704 0 1.402-.03 2.09-.09m0 9.18c.253.962.584 1.892.985 2.783.247.55.06 1.21-.463 1.511l-.657.38a.75.75 0 0 1-1.021-.274 18.634 18.634 0 0 1-2.414-7.22m3.57-7.36V4.52c0-.131.021-.26.06-.386a.75.75 0 0 1 1.147-.36l4.897 3.27a1.5 1.5 0 0 1 0 2.453l-4.897 3.27a.75.75 0 0 1-1.147-.36 1.714 1.714 0 0 1-.06-.386v-1.67" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold sp-heading sp-text-ink">
                    {broadcast.name || 'Untitled Broadcast'}
                  </h2>
                  <p className="text-sm text-neutral-500 mt-0.5 sp-body">
                    {broadcast.sent_at
                      ? new Date(broadcast.sent_at).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
                      : 'Not sent yet'}
                  </p>
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-surface sp-radius-sm p-4" style={{ border: '0.5px solid var(--sp-silver, #C8CCD4)66' }}>
                  <div className="text-neutral-500 text-xs mb-1.5 sp-body">Status</div>
                  <Badge variant={statusColor(broadcast.status)}>{broadcast.status}</Badge>
                </div>
                <div className="bg-surface sp-radius-sm p-4" style={{ border: '0.5px solid var(--sp-silver, #C8CCD4)66' }}>
                  <div className="text-neutral-500 text-xs mb-1.5 sp-body">Sent</div>
                  <div className="sp-text-ink text-sm font-medium">
                    {broadcast.sent_at ? new Date(broadcast.sent_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '-'}
                  </div>
                </div>
                {broadcast.log && (
                  <>
                    <div className="bg-surface sp-radius-sm p-4" style={{ border: '0.5px solid var(--sp-silver, #C8CCD4)66' }}>
                      <div className="text-neutral-500 text-xs mb-1.5 sp-body">Segment</div>
                      <Badge variant="blue">
                        {SEGMENTS[broadcast.log.segment]?.label || broadcast.log.segment}
                      </Badge>
                    </div>
                    <div className="bg-surface sp-radius-sm p-4" style={{ border: '0.5px solid var(--sp-silver, #C8CCD4)66' }}>
                      <div className="text-neutral-500 text-xs mb-1.5 sp-body">Recipients</div>
                      <div className="sp-text-ink text-lg font-bold sp-heading">
                        {broadcast.log.recipient_count}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Subject */}
              {broadcast.log?.subject && (
                <div className="bg-surface sp-radius-sm p-4" style={{ border: '0.5px solid var(--sp-silver, #C8CCD4)66' }}>
                  <div className="text-neutral-500 text-xs mb-1.5 sp-body">Subject</div>
                  <div className="sp-text-ink text-sm">{broadcast.log.subject}</div>
                </div>
              )}

              {/* Recipient list */}
              {broadcast.log?.recipients && broadcast.log.recipients.length > 0 && (
                <div>
                  <div className="text-neutral-500 text-xs mb-2 sp-body font-medium">Recipient List</div>
                  <div className="sp-bg-snow sp-radius-sm p-3 max-h-48 overflow-y-auto" style={{ border: '0.5px solid var(--sp-silver, #C8CCD4)66' }}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1">
                      {broadcast.log.recipients.map((email) => (
                        <div key={email} className="text-xs sp-text-slate truncate">
                          {email}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!broadcast.log && (
                <div className="sp-bg-snow/50 sp-radius-sm p-4" style={{ border: '0.5px solid var(--sp-silver, #C8CCD4)66' }}>
                  <p className="text-sm text-neutral-500">
                    No audit log available for this broadcast (sent before logging was enabled).
                  </p>
                </div>
              )}
            </>
          )
        })()}
      </div>
    )
  }

  // ===== LIST VIEW =====
  return (
    <div className="sp-body space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between gap-3 mb-3 sm:mb-0">
          <h2 className="text-2xl font-extrabold sp-heading shrink-0">
            <span className="sp-text-ink">Email</span>
            <span className="sp-text-primary">History</span>
          </h2>
          {/* Desktop: filters + refresh inline with title */}
          <div className="hidden sm:flex items-center gap-3">
            <div className="flex gap-1 sp-radius-md p-1" style={{ backgroundColor: 'var(--sp-snow, #F7F8FA)', border: '0.5px solid var(--sp-silver, #C8CCD4)66' }}>
              {([
                { key: 'sent' as const, label: 'Sent', count: sentEmails.length },
                { key: 'received' as const, label: 'Received', count: receivedEmails.length },
                { key: 'broadcasts' as const, label: 'Broadcasts', count: broadcasts.length },
              ]).map((section) => (
                <button
                  key={section.key}
                  onClick={() => setActiveSection(section.key)}
                  className={`px-3 py-1.5 sp-radius-sm text-xs font-medium sp-body transition-colors ${
                    activeSection === section.key
                      ? 'sp-bg-surface sp-text-ink shadow-sm'
                      : 'sp-text-slate hover:text-neutral-700'
                  }`}
                >
                  {section.label} ({section.count})
                </button>
              ))}
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
        </div>
        {/* Mobile: filters + refresh below title */}
        <div className="sm:hidden flex items-center gap-2">
          <div className="flex gap-1 sp-radius-md p-1 flex-1" style={{ backgroundColor: 'var(--sp-snow, #F7F8FA)', border: '0.5px solid var(--sp-silver, #C8CCD4)66' }}>
            {([
              { key: 'sent' as const, label: 'Sent', count: sentEmails.length },
              { key: 'received' as const, label: 'Received', count: receivedEmails.length },
              { key: 'broadcasts' as const, label: 'Broadcasts', count: broadcasts.length },
            ]).map((section) => (
              <button
                key={section.key}
                onClick={() => setActiveSection(section.key)}
                className={`flex-1 px-2 py-1.5 sp-radius-sm text-xs font-medium sp-body transition-colors ${
                  activeSection === section.key
                    ? 'sp-bg-surface sp-text-ink shadow-sm'
                    : 'sp-text-slate hover:text-neutral-700'
                }`}
              >
                {section.label} ({section.count})
              </button>
            ))}
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
              <div className="sp-bg-surface sp-radius-lg p-6 text-center" style={{ border: '0.5px solid var(--sp-silver, #C8CCD4)80' }}>
                <p className="text-sm sp-text-slate sp-body">No emails sent yet.</p>
              </div>
            ) : (
              <>
                {/* Mobile cards */}
                <div className="sm:hidden space-y-3">
                  {sentEmails.map((email) => {
                    const eventStyle = EVENT_STYLES[email.last_event] || { label: email.last_event, color: 'bg-neutral-100 text-neutral-600' }
                    return (
                      <button
                        key={email.id}
                        onClick={() => openSentDetail(email)}
                        className="w-full text-left sp-bg-surface sp-radius-lg overflow-hidden transition-shadow hover:shadow-md"
                        style={{ border: '0.5px solid var(--sp-silver, #C8CCD4)80' }}
                      >
                        <div className="flex items-center gap-2 px-3.5 py-2" style={{ backgroundColor: 'var(--sp-snow, #F7F8FA)', borderBottom: '0.5px solid var(--sp-silver, #C8CCD4)66' }}>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${eventStyle.color}`}>
                            {eventStyle.label}
                          </span>
                          <span className="text-[11px] sp-text-slate ml-auto sp-body">
                            {new Date(email.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className="px-3.5 py-3">
                          <div className="text-sm font-medium sp-text-ink sp-body truncate">{email.to.join(', ')}</div>
                          <p className="text-xs sp-text-slate mt-1 line-clamp-1 sp-body">{email.subject}</p>
                          <div className="flex items-center justify-end mt-2">
                            <svg className="w-4 h-4 sp-text-slate" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                            </svg>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
                {/* Desktop table */}
                <div className="hidden sm:block sp-radius-lg overflow-hidden sp-bg-surface" style={{ boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)', border: '0.5px solid var(--sp-silver, #C8CCD4)80' }}>
                  <div className="overflow-x-auto overscroll-x-contain">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ backgroundColor: 'var(--sp-snow, #F7F8FA)', borderBottom: '0.5px solid var(--sp-silver, #C8CCD4)66' }}>
                          <th className="text-left px-4 py-3.5 font-medium sp-text-slate whitespace-nowrap sp-body">To</th>
                          <th className="text-left px-4 py-3.5 font-medium sp-text-slate whitespace-nowrap sp-body">Subject</th>
                          <th className="text-left px-4 py-3.5 font-medium sp-text-slate whitespace-nowrap sp-body">Status</th>
                          <th className="text-left px-4 py-3.5 font-medium sp-text-slate whitespace-nowrap sp-body">Sent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sentEmails.map((email) => {
                          const eventStyle = EVENT_STYLES[email.last_event] || { label: email.last_event, color: 'bg-neutral-100 text-neutral-600' }
                          return (
                            <tr
                              key={email.id}
                              onClick={() => openSentDetail(email)}
                              className="cursor-pointer transition-colors sp-hover-snow"
                              style={{ borderBottom: '0.5px solid var(--sp-silver, #C8CCD4)66' }}
                            >
                              <td className="px-4 py-4 sp-text-ink whitespace-nowrap">
                                <div className="max-w-[200px] truncate">{email.to.join(', ')}</div>
                              </td>
                              <td className="px-4 py-4 sp-text-slate whitespace-nowrap">
                                <div className="max-w-[300px] truncate">{email.subject}</div>
                              </td>
                              <td className="px-4 py-4 whitespace-nowrap">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${eventStyle.color}`}>
                                  {eventStyle.label}
                                </span>
                              </td>
                              <td className="px-4 py-4 sp-text-slate whitespace-nowrap">
                                {new Date(email.created_at).toLocaleDateString(undefined, {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                                })}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )
          )}

          {/* ========== Received Emails ========== */}
          {activeSection === 'received' && (
            receivedEmails.length === 0 ? (
              <div className="sp-bg-surface sp-radius-lg p-6 text-center" style={{ border: '0.5px solid var(--sp-silver, #C8CCD4)80' }}>
                <p className="text-sm sp-text-slate sp-body">No received emails yet.</p>
              </div>
            ) : (
              <>
                {/* Mobile cards */}
                <div className="sm:hidden space-y-3">
                  {receivedEmails.map((email) => (
                    <button
                      key={email.id}
                      onClick={() => openReceivedDetail(email)}
                      className="w-full text-left sp-bg-surface sp-radius-lg overflow-hidden transition-shadow hover:shadow-md"
                      style={{ border: '0.5px solid var(--sp-silver, #C8CCD4)80' }}
                    >
                      <div className="flex items-center gap-2 px-3.5 py-2" style={{ backgroundColor: 'var(--sp-snow, #F7F8FA)', borderBottom: '0.5px solid var(--sp-silver, #C8CCD4)66' }}>
                        <span className="text-xs font-medium sp-text-ink sp-body truncate">{email.from}</span>
                        {email.attachments.length > 0 && (
                          <span className="inline-flex items-center gap-0.5 shrink-0 sp-text-slate">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                            </svg>
                            <span className="text-[11px]">{email.attachments.length}</span>
                          </span>
                        )}
                        <span className="text-[11px] sp-text-slate ml-auto sp-body shrink-0">
                          {new Date(email.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="px-3.5 py-3">
                        <p className="text-sm sp-text-ink sp-body line-clamp-1">{email.subject}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[11px] sp-text-slate sp-body">To: {email.to.join(', ')}</span>
                          <svg className="w-4 h-4 sp-text-slate shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                          </svg>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                {/* Desktop table */}
                <div className="hidden sm:block sp-radius-lg overflow-hidden sp-bg-surface" style={{ boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)', border: '0.5px solid var(--sp-silver, #C8CCD4)80' }}>
                  <div className="overflow-x-auto overscroll-x-contain">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ backgroundColor: 'var(--sp-snow, #F7F8FA)', borderBottom: '0.5px solid var(--sp-silver, #C8CCD4)66' }}>
                          <th className="text-left px-4 py-3.5 font-medium sp-text-slate whitespace-nowrap sp-body">From</th>
                          <th className="text-left px-4 py-3.5 font-medium sp-text-slate whitespace-nowrap sp-body">Subject</th>
                          <th className="text-left px-4 py-3.5 font-medium sp-text-slate whitespace-nowrap sp-body">To</th>
                          <th className="text-left px-4 py-3.5 font-medium sp-text-slate whitespace-nowrap sp-body">Received</th>
                        </tr>
                      </thead>
                      <tbody>
                        {receivedEmails.map((email) => (
                          <tr
                            key={email.id}
                            onClick={() => openReceivedDetail(email)}
                            className="cursor-pointer transition-colors sp-hover-snow"
                            style={{ borderBottom: '0.5px solid var(--sp-silver, #C8CCD4)66' }}
                          >
                            <td className="px-4 py-4 sp-text-ink whitespace-nowrap">
                              <div className="max-w-[200px] truncate">{email.from}</div>
                            </td>
                            <td className="px-4 py-4 sp-text-slate whitespace-nowrap">
                              <div className="flex items-center gap-2 max-w-[300px]">
                                <span className="truncate">{email.subject}</span>
                                {email.attachments.length > 0 && (
                                  <span className="inline-flex items-center gap-0.5 shrink-0 sp-text-slate">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="m18.375 12.739-7.693 7.693a4.5 4.5 0 0 1-6.364-6.364l10.94-10.94A3 3 0 1 1 19.5 7.372L8.552 18.32m.009-.01-.01.01m5.699-9.941-7.81 7.81a1.5 1.5 0 0 0 2.112 2.13" />
                                    </svg>
                                    <span className="text-[11px]">{email.attachments.length}</span>
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-4 sp-text-slate whitespace-nowrap">
                              <div className="max-w-[200px] truncate">{email.to.join(', ')}</div>
                            </td>
                            <td className="px-4 py-4 sp-text-slate whitespace-nowrap">
                              {new Date(email.created_at).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )
          )}

          {/* ========== Broadcasts ========== */}
          {activeSection === 'broadcasts' && (
            broadcasts.length === 0 ? (
              <div className="sp-bg-surface sp-radius-lg p-6 text-center" style={{ border: '0.5px solid var(--sp-silver, #C8CCD4)80' }}>
                <p className="text-sm sp-text-slate sp-body">No broadcasts sent yet.</p>
              </div>
            ) : (
              <>
                {/* Mobile cards */}
                <div className="sm:hidden space-y-3">
                  {broadcasts.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setDetailView({ type: 'broadcast', broadcast: b })}
                      className="w-full text-left sp-bg-surface sp-radius-lg overflow-hidden transition-shadow hover:shadow-md"
                      style={{ border: '0.5px solid var(--sp-silver, #C8CCD4)80' }}
                    >
                      <div className="flex items-center gap-2 px-3.5 py-2" style={{ backgroundColor: 'var(--sp-snow, #F7F8FA)', borderBottom: '0.5px solid var(--sp-silver, #C8CCD4)66' }}>
                        <Badge variant={statusColor(b.status)}>{b.status}</Badge>
                        <span className="text-[11px] sp-text-slate ml-auto sp-body">
                          {b.sent_at
                            ? new Date(b.sent_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                            : 'Not sent'}
                        </span>
                      </div>
                      <div className="px-3.5 py-3">
                        <div className="text-sm font-medium sp-text-ink sp-body truncate">{b.name || 'Untitled'}</div>
                        <div className="flex items-center gap-2 mt-1.5">
                          {b.log ? (
                            <>
                              <Badge variant="blue">
                                {SEGMENTS[b.log.segment]?.label || b.log.segment}
                              </Badge>
                              <span className="text-xs sp-text-slate sp-body">{b.log.recipient_count} recipients</span>
                            </>
                          ) : (
                            <span className="text-xs sp-text-slate sp-body">No log data</span>
                          )}
                        </div>
                        <div className="flex items-center justify-end mt-2">
                          <svg className="w-4 h-4 sp-text-slate" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                          </svg>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                {/* Desktop table */}
                <div className="hidden sm:block sp-radius-lg overflow-hidden sp-bg-surface" style={{ boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)', border: '0.5px solid var(--sp-silver, #C8CCD4)80' }}>
                  <div className="overflow-x-auto overscroll-x-contain">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ backgroundColor: 'var(--sp-snow, #F7F8FA)', borderBottom: '0.5px solid var(--sp-silver, #C8CCD4)66' }}>
                          <th className="text-left px-4 py-3.5 font-medium sp-text-slate whitespace-nowrap sp-body">Name</th>
                          <th className="text-left px-4 py-3.5 font-medium sp-text-slate whitespace-nowrap sp-body">Segment</th>
                          <th className="text-left px-4 py-3.5 font-medium sp-text-slate whitespace-nowrap sp-body">Status</th>
                          <th className="text-left px-4 py-3.5 font-medium sp-text-slate whitespace-nowrap sp-body">Sent</th>
                          <th className="text-left px-4 py-3.5 font-medium sp-text-slate whitespace-nowrap sp-body">Recipients</th>
                        </tr>
                      </thead>
                      <tbody>
                        {broadcasts.map((b) => (
                          <tr
                            key={b.id}
                            onClick={() => setDetailView({ type: 'broadcast', broadcast: b })}
                            className="cursor-pointer transition-colors sp-hover-snow"
                            style={{ borderBottom: '0.5px solid var(--sp-silver, #C8CCD4)66' }}
                          >
                            <td className="px-4 py-4 sp-text-ink font-medium whitespace-nowrap">
                              {b.name || 'Untitled'}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              {b.log ? (
                                <Badge variant="blue">
                                  {SEGMENTS[b.log.segment]?.label || b.log.segment}
                                </Badge>
                              ) : (
                                <span className="sp-text-slate text-xs">-</span>
                              )}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap">
                              <Badge variant={statusColor(b.status)}>{b.status}</Badge>
                            </td>
                            <td className="px-4 py-4 sp-text-slate whitespace-nowrap">
                              {b.sent_at
                                ? new Date(b.sent_at).toLocaleDateString(undefined, {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: '2-digit',
                                  })
                                : '-'}
                            </td>
                            <td className="px-4 py-4 sp-text-slate whitespace-nowrap">
                              {b.log ? b.log.recipient_count : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )
          )}
        </>
      )}
    </div>
  )
}
