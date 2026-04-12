'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { useToast } from '@/components/ui/Toast'

// --- Template definitions ---

type TemplateKey = 'pending_predictions' | 'deadline_reminder' | 'round_deadline_reminder' | 'custom'

type TemplateDef = {
  key: TemplateKey
  label: string
  description: string
  category: 'smart' | 'pool' | 'custom'
  icon: string
  recipientNote: string
}

const TEMPLATES: TemplateDef[] = [
  {
    key: 'pending_predictions',
    label: 'Pending Predictions Reminder',
    description: 'Finds all users with unsubmitted predictions across all pools and sends a personalized reminder with their outstanding pools, counts, and deadlines.',
    category: 'smart',
    icon: 'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    recipientNote: 'Auto-detected: users with pending predictions',
  },
  {
    key: 'deadline_reminder',
    label: 'Pool Deadline Reminder',
    description: 'Sends a deadline reminder to all members of a specific pool who have unsubmitted entries.',
    category: 'pool',
    icon: 'M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0',
    recipientNote: 'Auto-detected: pool members with unsubmitted entries',
  },
  {
    key: 'round_deadline_reminder',
    label: 'Round Deadline Reminder',
    description: 'Sends a round-specific deadline reminder to members of a progressive pool who haven\'t submitted for a specific round.',
    category: 'pool',
    icon: 'M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z',
    recipientNote: 'Auto-detected: pool members with unsubmitted round entries',
  },
  {
    key: 'custom',
    label: 'Custom Email',
    description: 'Compose a freeform transactional email with personalized greeting. Each recipient gets their own email with their first name.',
    category: 'custom',
    icon: 'M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75',
    recipientNote: 'You choose: segment or individual users',
  },
]

const SEGMENTS = {
  all: { label: 'All Users', description: 'Every registered user' },
  pool_admins: { label: 'Pool Admins', description: 'Users who have created a pool' },
  active_members: { label: 'Active Members', description: 'Users in at least one pool' },
  inactive_users: { label: 'Inactive Users', description: 'Signed up but never joined a pool' },
  recent_signups: { label: 'Recent Signups', description: 'Joined in the last 14 days' },
  super_admins: { label: 'Super Admins', description: 'Internal / test emails only' },
} as const

type SegmentKey = keyof typeof SEGMENTS

const TOPIC_OPTIONS = [
  { key: '', label: 'None (always delivered)' },
  { key: 'PREDICTIONS', label: 'Predictions' },
  { key: 'POOL_ACTIVITY', label: 'Pool Activity' },
  { key: 'ADMIN', label: 'Admin' },
  { key: 'COMMUNITY', label: 'Community' },
] as const

type PoolInfo = { pool_id: string; pool_name: string; prediction_mode: string; prediction_deadline: string | null }
type RoundInfo = { id: string; pool_id: string; round_key: string; deadline: string | null; state: string }
type UserInfo = { user_id: string; email: string; name: string }

export function TemplatesTab() {
  const { showToast } = useToast()

  // Template selection
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateKey | null>(null)
  const [sending, setSending] = useState(false)
  const [confirmSend, setConfirmSend] = useState(false)

  // Data from API
  const [pools, setPools] = useState<PoolInfo[]>([])
  const [rounds, setRounds] = useState<RoundInfo[]>([])
  const [allUsers, setAllUsers] = useState<UserInfo[]>([])
  const [loadingData, setLoadingData] = useState(true)

  // Pool-specific fields
  const [poolId, setPoolId] = useState('')
  const [roundKey, setRoundKey] = useState('')

  // Custom template fields
  const [subject, setSubject] = useState('')
  const [heading, setHeading] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [ctaText, setCtaText] = useState('')
  const [ctaUrl, setCtaUrl] = useState('')
  const [topic, setTopic] = useState('')

  // Recipient targeting (custom template)
  const [recipientMode, setRecipientMode] = useState<'segment' | 'users'>('segment')
  const [segment, setSegment] = useState<SegmentKey>('all')
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [userSearch, setUserSearch] = useState('')

  // Dry run result & email content preview
  const [dryRunResult, setDryRunResult] = useState<{ totalEmails: number; preview: { to: string; subject: string }[] } | null>(null)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [previewSubject, setPreviewSubject] = useState<string | null>(null)

  // Load pools, rounds, users on mount
  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch('/api/admin/send-template')
        if (res.ok) {
          const data = await res.json()
          setPools(data.pools || [])
          setRounds(data.rounds || [])
          setAllUsers(data.users || [])
        }
      } catch {
        // Silent fail
      } finally {
        setLoadingData(false)
      }
    }
    loadData()
  }, [])

  // Filtered rounds for selected pool
  const poolRounds = useMemo(
    () => rounds.filter((r) => r.pool_id === poolId),
    [rounds, poolId]
  )

  // Filtered users for search
  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return allUsers.slice(0, 20)
    const q = userSearch.toLowerCase()
    return allUsers.filter(
      (u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    ).slice(0, 20)
  }, [allUsers, userSearch])

  function selectTemplate(key: TemplateKey) {
    setSelectedTemplate(key)
    setConfirmSend(false)
    setDryRunResult(null)
    setPreviewHtml(null)
    setPreviewSubject(null)
    setPoolId('')
    setRoundKey('')
    setSubject('')
    setHeading('')
    setBodyText('')
    setCtaText('')
    setCtaUrl('')
    setTopic('')
    setRecipientMode('segment')
    setSegment('all')
    setSelectedUserIds([])
    setUserSearch('')
  }

  function buildRequestBody(dryRun: boolean) {
    const base = {
      template: selectedTemplate,
      idempotency_key: `template-${selectedTemplate}-${Date.now()}`,
      dry_run: dryRun,
    }

    switch (selectedTemplate) {
      case 'pending_predictions':
        return base
      case 'deadline_reminder':
        return { ...base, pool_id: poolId }
      case 'round_deadline_reminder':
        return { ...base, pool_id: poolId, round_key: roundKey }
      case 'custom':
        return {
          ...base,
          subject,
          heading,
          body_text: bodyText,
          cta_text: ctaText,
          cta_url: ctaUrl,
          topic,
          recipient_mode: recipientMode,
          ...(recipientMode === 'segment' ? { segment } : { user_ids: selectedUserIds }),
        }
      default:
        return base
    }
  }

  function isFormValid(): boolean {
    switch (selectedTemplate) {
      case 'pending_predictions':
        return true
      case 'deadline_reminder':
        return !!poolId
      case 'round_deadline_reminder':
        return !!poolId && !!roundKey
      case 'custom':
        return !!subject && !!bodyText && (recipientMode === 'segment' || selectedUserIds.length > 0)
      default:
        return false
    }
  }

  async function handleDryRun() {
    setSending(true)
    setDryRunResult(null)
    setPreviewHtml(null)
    setPreviewSubject(null)
    try {
      const res = await fetch('/api/admin/send-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRequestBody(true)),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error || 'Dry run failed', 'error')
        return
      }
      setDryRunResult({ totalEmails: data.totalEmails, preview: data.preview || [] })
      setPreviewHtml(data.previewHtml ?? null)
      setPreviewSubject(data.previewSubject ?? null)
      if (data.totalEmails === 0) {
        showToast('No recipients matched — no emails would be sent', 'info')
      }
    } catch {
      showToast('Dry run failed', 'error')
    } finally {
      setSending(false)
    }
  }

  async function handleSend() {
    setSending(true)
    try {
      const res = await fetch('/api/admin/send-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRequestBody(false)),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error || 'Failed to send', 'error')
        return
      }
      showToast(data.message, 'success')
      setSelectedTemplate(null)
      setConfirmSend(false)
      setDryRunResult(null)
    } catch {
      showToast('Failed to send', 'error')
    } finally {
      setSending(false)
    }
  }

  function toggleUser(userId: string) {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    )
    setConfirmSend(false)
    setDryRunResult(null)
  }

  const selectedTemplateDef = TEMPLATES.find((t) => t.key === selectedTemplate)

  const ROUND_LABELS: Record<string, string> = {
    group: 'Group Stage',
    round_32: 'Round of 32',
    round_16: 'Round of 16',
    quarter_final: 'Quarter Finals',
    semi_final: 'Semi Finals',
    third_place: 'Third Place',
    final: 'Final',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Email Templates
        </h3>
        <p className="text-sm text-neutral-500 mt-0.5">
          Send personalized transactional emails to specific users or groups
        </p>
      </div>

      {/* Template gallery */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {TEMPLATES.map((tmpl) => (
          <button
            key={tmpl.key}
            onClick={() => selectTemplate(tmpl.key)}
            className={`text-left p-4 rounded-xl border transition-all ${
              selectedTemplate === tmpl.key
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-950 ring-1 ring-primary-500'
                : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600 bg-surface'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                selectedTemplate === tmpl.key
                  ? 'bg-primary-100 dark:bg-primary-900'
                  : 'bg-neutral-100 dark:bg-neutral-800'
              }`}>
                <svg className={`w-5 h-5 ${
                  selectedTemplate === tmpl.key
                    ? 'text-primary-600 dark:text-primary-400'
                    : 'text-neutral-500 dark:text-neutral-400'
                }`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d={tmpl.icon} />
                </svg>
              </div>
              <div className="min-w-0">
                <div className="font-medium text-sm text-neutral-900 dark:text-neutral-100">
                  {tmpl.label}
                </div>
                <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5 line-clamp-2">
                  {tmpl.description}
                </div>
                <div className="text-[11px] text-primary-600 dark:text-primary-400 mt-1.5 font-medium">
                  {tmpl.recipientNote}
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Configuration panel */}
      {selectedTemplateDef && (
        <div className="bg-surface border border-neutral-200 dark:border-neutral-700 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-neutral-900 dark:text-neutral-100">
              {selectedTemplateDef.label}
            </h4>
            <Button size="sm" variant="outline" onClick={() => { setSelectedTemplate(null); setDryRunResult(null) }}>
              Cancel
            </Button>
          </div>

          {/* Smart template: pending predictions — no config needed */}
          {selectedTemplate === 'pending_predictions' && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                This template automatically finds all users with outstanding predictions across all pools.
                Each user gets a single email listing all their pending pools with deadlines and prediction counts.
              </p>
            </div>
          )}

          {/* Pool selector (deadline_reminder, round_deadline_reminder) */}
          {(selectedTemplate === 'deadline_reminder' || selectedTemplate === 'round_deadline_reminder') && (
            <>
              <FormField label="Pool">
                {loadingData ? (
                  <p className="text-sm text-neutral-500">Loading pools...</p>
                ) : (
                  <select
                    value={poolId}
                    onChange={(e) => { setPoolId(e.target.value); setRoundKey(''); setConfirmSend(false); setDryRunResult(null) }}
                    className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-surface px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">Select a pool...</option>
                    {pools
                      .filter((p) =>
                        selectedTemplate === 'round_deadline_reminder'
                          ? p.prediction_mode === 'progressive'
                          : p.prediction_mode === 'full_tournament'
                      )
                      .map((p) => (
                        <option key={p.pool_id} value={p.pool_id}>
                          {p.pool_name}
                          {p.prediction_deadline
                            ? ` (deadline: ${new Date(p.prediction_deadline).toLocaleDateString()})`
                            : ''}
                        </option>
                      ))}
                  </select>
                )}
              </FormField>

              {/* Round selector (round_deadline_reminder only) */}
              {selectedTemplate === 'round_deadline_reminder' && poolId && (
                <FormField label="Round">
                  <select
                    value={roundKey}
                    onChange={(e) => { setRoundKey(e.target.value); setConfirmSend(false); setDryRunResult(null) }}
                    className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-surface px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">Select a round...</option>
                    {poolRounds.map((r) => (
                      <option key={r.id} value={r.round_key}>
                        {ROUND_LABELS[r.round_key] || r.round_key} ({r.state})
                        {r.deadline ? ` — deadline: ${new Date(r.deadline).toLocaleDateString()}` : ''}
                      </option>
                    ))}
                  </select>
                </FormField>
              )}

              {poolId && (
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    Recipients are automatically determined — only pool members with unsubmitted entries will receive the email.
                  </p>
                </div>
              )}
            </>
          )}

          {/* Custom template fields */}
          {selectedTemplate === 'custom' && (
            <>
              {/* Recipient mode toggle */}
              <FormField label="Send To">
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => { setRecipientMode('segment'); setConfirmSend(false); setDryRunResult(null) }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      recipientMode === 'segment'
                        ? 'bg-primary-600 text-white'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                    }`}
                  >
                    By Segment
                  </button>
                  <button
                    onClick={() => { setRecipientMode('users'); setConfirmSend(false); setDryRunResult(null) }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      recipientMode === 'users'
                        ? 'bg-primary-600 text-white'
                        : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700'
                    }`}
                  >
                    Individual Users
                  </button>
                </div>

                {/* Segment buttons */}
                {recipientMode === 'segment' && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {(Object.entries(SEGMENTS) as [SegmentKey, typeof SEGMENTS[SegmentKey]][]).map(([key, seg]) => (
                      <button
                        key={key}
                        onClick={() => { setSegment(key); setConfirmSend(false); setDryRunResult(null) }}
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
                )}

                {/* User search and picker */}
                {recipientMode === 'users' && (
                  <div className="space-y-3">
                    <Input
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Search by name or email..."
                    />

                    {/* Selected users badges */}
                    {selectedUserIds.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedUserIds.map((id) => {
                          const user = allUsers.find((u) => u.user_id === id)
                          return (
                            <span
                              key={id}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-300 text-xs"
                            >
                              {user?.name || user?.email || id}
                              <button
                                onClick={() => toggleUser(id)}
                                className="text-primary-500 hover:text-primary-700 dark:hover:text-primary-200"
                              >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </span>
                          )
                        })}
                      </div>
                    )}

                    {/* User list */}
                    <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg max-h-48 overflow-y-auto">
                      {filteredUsers.length === 0 ? (
                        <p className="text-sm text-neutral-500 p-3 text-center">No users found</p>
                      ) : (
                        filteredUsers.map((u) => (
                          <button
                            key={u.user_id}
                            onClick={() => toggleUser(u.user_id)}
                            className={`w-full text-left px-3 py-2 text-sm border-b border-neutral-100 dark:border-neutral-800 last:border-0 transition-colors flex items-center gap-2 ${
                              selectedUserIds.includes(u.user_id)
                                ? 'bg-primary-50 dark:bg-primary-950'
                                : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                              selectedUserIds.includes(u.user_id)
                                ? 'bg-primary-600 border-primary-600'
                                : 'border-neutral-300 dark:border-neutral-600'
                            }`}>
                              {selectedUserIds.includes(u.user_id) && (
                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                                </svg>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="text-neutral-900 dark:text-neutral-100 truncate">{u.name}</div>
                              <div className="text-xs text-neutral-500 truncate">{u.email}</div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>

                    <p className="text-xs text-neutral-500">
                      {selectedUserIds.length} user{selectedUserIds.length !== 1 ? 's' : ''} selected
                    </p>
                  </div>
                )}
              </FormField>

              {/* Email content fields */}
              <FormField label="Email Subject">
                <Input
                  value={subject}
                  onChange={(e) => { setSubject(e.target.value); setConfirmSend(false) }}
                  placeholder="e.g. Don't forget to submit your predictions!"
                />
              </FormField>

              <FormField label="Heading" helperText="Optional — defaults to subject if empty">
                <Input
                  value={heading}
                  onChange={(e) => setHeading(e.target.value)}
                  placeholder="e.g. Predictions Closing Soon"
                />
              </FormField>

              <FormField label="Body" helperText="Plain text — line breaks are preserved. Each user gets a personalized 'Hi [first name]' greeting.">
                <textarea
                  value={bodyText}
                  onChange={(e) => { setBodyText(e.target.value); setConfirmSend(false) }}
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

              <FormField label="Notification Topic" helperText="Users can unsubscribe from specific topics. Leave empty to always deliver.">
                <select
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-surface px-3 py-2 text-sm text-neutral-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  {TOPIC_OPTIONS.map((t) => (
                    <option key={t.key} value={t.key}>{t.label}</option>
                  ))}
                </select>
              </FormField>
            </>
          )}

          {/* Dry run result */}
          {dryRunResult && (
            <div className="bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                </svg>
                <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  Dry Run: {dryRunResult.totalEmails} email{dryRunResult.totalEmails !== 1 ? 's' : ''} would be sent
                </span>
              </div>
              {dryRunResult.preview.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs text-neutral-500 font-medium">Recipients (first {dryRunResult.preview.length}):</p>
                  {dryRunResult.preview.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-neutral-500 truncate max-w-[200px]">{p.to}</span>
                      <span className="text-neutral-300 dark:text-neutral-600">—</span>
                      <span className="text-neutral-700 dark:text-neutral-300 truncate">{p.subject}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Email content preview */}
          {previewHtml && (
            <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg overflow-hidden">
              <div className="bg-neutral-50 dark:bg-neutral-800 px-3 py-2 flex items-center justify-between border-b border-neutral-200 dark:border-neutral-700">
                <div>
                  <span className="text-xs font-medium text-neutral-500">Email Preview</span>
                  {previewSubject && (
                    <span className="text-xs text-neutral-400 ml-2">— {previewSubject}</span>
                  )}
                </div>
                <button
                  onClick={() => { setPreviewHtml(null); setPreviewSubject(null) }}
                  className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <iframe
                srcDoc={previewHtml}
                title="Email content preview"
                className="w-full bg-white"
                style={{ height: 500 }}
                sandbox=""
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-3 pt-2 border-t border-neutral-200 dark:border-neutral-700">
            <Button
              size="sm"
              variant="outline"
              onClick={handleDryRun}
              disabled={!isFormValid() || sending}
              loading={sending && !confirmSend}
            >
              Preview
            </Button>

            {!confirmSend ? (
              <Button
                size="sm"
                onClick={() => setConfirmSend(true)}
                disabled={!isFormValid() || !dryRunResult || dryRunResult.totalEmails === 0}
              >
                Send {dryRunResult ? `(${dryRunResult.totalEmails})` : ''}
              </Button>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-xs text-warning-600 dark:text-warning-400 font-medium">
                  Send {dryRunResult?.totalEmails ?? 0} transactional email{(dryRunResult?.totalEmails ?? 0) !== 1 ? 's' : ''}?
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

      {/* Info box when nothing is selected */}
      {!selectedTemplate && (
        <div className="bg-neutral-50 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 rounded-xl p-6 text-center">
          <svg className="w-10 h-10 text-neutral-300 dark:text-neutral-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
          </svg>
          <p className="text-sm text-neutral-500">
            Select a template above to get started. Unlike broadcasts, these are <strong>transactional emails</strong> — each recipient gets a personalized email with their name.
          </p>
        </div>
      )}
    </div>
  )
}
