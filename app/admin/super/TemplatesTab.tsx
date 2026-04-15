'use client'

import { useState, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { useToast } from '@/components/ui/Toast'

// --- Template definitions ---

type TemplateKey =
  | 'pending_predictions'
  | 'deadline_reminder'
  | 'round_deadline_reminder'
  | 'empty_pool_nudge'
  | 'solo_pool_nudge'
  | 'small_pool_boost'
  | 'start_a_pool'
  | 'we_miss_you'
  | 'ready_to_join'
  | 'past_predictor_hype'
  | 'support_reply'
  | 'custom'

type TemplateDef = {
  key: TemplateKey
  label: string
  description: string
  category: 'smart' | 'pool' | 'growth' | 'support' | 'custom'
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
    key: 'empty_pool_nudge',
    label: 'Empty Pool Nudge',
    description: 'Encourages pool admins with zero members to share their pool code and start inviting people.',
    category: 'growth',
    icon: 'M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z',
    recipientNote: 'Auto-detected: pool admins with 0 members',
  },
  {
    key: 'solo_pool_nudge',
    label: 'Solo Pool Nudge',
    description: 'Reaches out to pool admins who are the only member in their pool — encourages them to share.',
    category: 'growth',
    icon: 'M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z',
    recipientNote: 'Auto-detected: admins who are the only pool member',
  },
  {
    key: 'small_pool_boost',
    label: 'Small Pool Boost',
    description: 'Encourages admins with 2-4 members to keep growing their pool toward the sweet spot.',
    category: 'growth',
    icon: 'M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941',
    recipientNote: 'Auto-detected: pool admins with 2-4 members',
  },
  {
    key: 'start_a_pool',
    label: 'Start Your Own Pool',
    description: 'Nudges members who are in a pool but haven\'t created one to start their own for another group.',
    category: 'growth',
    icon: 'M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    recipientNote: 'Auto-detected: pool members who aren\'t admins',
  },
  {
    key: 'we_miss_you',
    label: 'We Miss You',
    description: 'Re-engages users who signed up 30+ days ago but never joined a pool. World Cup hype angle.',
    category: 'growth',
    icon: 'M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z',
    recipientNote: 'Auto-detected: signed up 30+ days ago, no pool',
  },
  {
    key: 'ready_to_join',
    label: 'Ready to Join?',
    description: 'Reaches out to recent signups who haven\'t joined a pool yet. Guides them to join or create one.',
    category: 'growth',
    icon: 'M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z',
    recipientNote: 'Auto-detected: recent signups not in any pool',
  },
  {
    key: 'past_predictor_hype',
    label: 'Past Predictor Hype',
    description: 'VIP treatment for users who have submitted predictions before. Hype them up for the next tournament.',
    category: 'growth',
    icon: 'M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z',
    recipientNote: 'Auto-detected: users who submitted predictions before',
  },
  {
    key: 'support_reply',
    label: 'Support Reply',
    description: 'Reply to a user\'s support request with Sport Pool branding. Uses a neutral support design — not a marketing email.',
    category: 'support',
    icon: 'M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 0 1-.825-.242m9.345-8.334a2.126 2.126 0 0 0-.476-.095 48.64 48.64 0 0 0-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0 0 11.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155',
    recipientNote: 'You choose: individual user(s)',
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
  empty_pool_admins: { label: 'Empty Pool Admins', description: 'Pool admins with no members yet' },
  solo_pool_admins: { label: 'Solo Pool Admins', description: 'Only member of their pool' },
  small_pool_admins: { label: 'Small Pool Admins', description: '2-4 members in their pool' },
  non_admin_members: { label: 'Non-Admin Members', description: 'In a pool but haven\'t created one' },
  active_members: { label: 'Active Members', description: 'Users in at least one pool' },
  inactive_users: { label: 'Inactive Users', description: 'Signed up but never joined a pool' },
  lapsed_users: { label: 'Lapsed Users', description: 'Signed up 30+ days ago, no pool' },
  engaged_no_pool: { label: 'Engaged, No Pool', description: 'Recent signup, not in any pool' },
  past_predictors: { label: 'Past Predictors', description: 'Have submitted predictions before' },
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
    setRecipientMode(key === 'support_reply' ? 'users' : 'segment')
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
      case 'empty_pool_nudge':
      case 'solo_pool_nudge':
      case 'small_pool_boost':
      case 'start_a_pool':
      case 'we_miss_you':
      case 'ready_to_join':
      case 'past_predictor_hype':
        return base
      case 'deadline_reminder':
        return { ...base, pool_id: poolId }
      case 'round_deadline_reminder':
        return { ...base, pool_id: poolId, round_key: roundKey }
      case 'support_reply':
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
      case 'empty_pool_nudge':
      case 'solo_pool_nudge':
      case 'small_pool_boost':
      case 'start_a_pool':
      case 'we_miss_you':
      case 'ready_to_join':
      case 'past_predictor_hype':
        return true
      case 'deadline_reminder':
        return !!poolId
      case 'round_deadline_reminder':
        return !!poolId && !!roundKey
      case 'support_reply':
        return !!subject && !!bodyText && selectedUserIds.length > 0
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
    <div className="space-y-6 sp-body">
      {/* ===== LIST VIEW (no template selected) ===== */}
      {!selectedTemplateDef ? (
        <>
          {/* Header */}
          <div>
            <h2 className="text-2xl font-extrabold sp-heading">
              <span className="sp-text-ink">Email</span>
              <span className="sp-text-primary">Templates</span>
            </h2>
            <p className="text-sm text-neutral-500 mt-0.5 sp-body">
              Select a template to send personalized transactional emails — each recipient gets their own email with their name.
            </p>
          </div>

          {/* Template gallery */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.key}
                onClick={() => selectTemplate(tmpl.key)}
                className="text-left p-4 sp-radius-lg border transition-all sp-border-silver hover:border-neutral-300 bg-surface hover:shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 sp-radius-sm flex items-center justify-center shrink-0 sp-bg-mist">
                    <svg className="w-5 h-5 sp-text-slate" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d={tmpl.icon} />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-sm sp-text-ink sp-heading">
                      {tmpl.label}
                    </div>
                    <div className="text-xs sp-text-slate mt-0.5 line-clamp-2">
                      {tmpl.description}
                    </div>
                    <div className="text-[11px] sp-text-primary mt-1.5 font-medium">
                      {tmpl.recipientNote}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      ) : (
        /* ===== DETAIL SHEET VIEW (template selected) ===== */
        <>
          {/* Back button + title */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setSelectedTemplate(null); setDryRunResult(null); setPreviewHtml(null); setPreviewSubject(null) }}
              className="flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-900  transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
              Templates
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sp-radius-sm flex items-center justify-center shrink-0 sp-bg-primary-light">
              <svg className="w-5 h-5 sp-text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d={selectedTemplateDef.icon} />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-extrabold sp-heading sp-text-ink">
                {selectedTemplateDef.label}
              </h2>
              <p className="text-sm text-neutral-500 mt-0.5 sp-body">{selectedTemplateDef.description}</p>
            </div>
          </div>

          {/* Configuration */}
          <div className="bg-surface border sp-border-silver sp-radius-lg p-6 space-y-5">

          {/* Smart template: pending predictions — no config needed */}
          {selectedTemplate === 'pending_predictions' && (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 sp-radius-sm p-4">
              <p className="text-sm text-blue-800 dark:text-blue-300">
                This template automatically finds all users with outstanding predictions across all pools.
                Each user gets a single email listing all their pending pools with deadlines and prediction counts.
              </p>
            </div>
          )}

          {/* Growth templates — no config needed */}
          {selectedTemplate === 'empty_pool_nudge' && (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 sp-radius-sm p-4">
              <p className="text-sm text-green-800 dark:text-green-300">
                Targets pool admins whose pools have zero members. Each admin gets a personalized email with their pool name and code, encouraging them to share it.
              </p>
            </div>
          )}
          {selectedTemplate === 'solo_pool_nudge' && (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 sp-radius-sm p-4">
              <p className="text-sm text-green-800 dark:text-green-300">
                Targets pool admins who are the only member of their pool. Encourages them to share the pool code and get others involved.
              </p>
            </div>
          )}
          {selectedTemplate === 'small_pool_boost' && (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 sp-radius-sm p-4">
              <p className="text-sm text-green-800 dark:text-green-300">
                Targets pool admins with 2-4 members. Each email includes the pool name, current member count, and pool code — encouraging them to keep growing.
              </p>
            </div>
          )}
          {selectedTemplate === 'start_a_pool' && (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 sp-radius-sm p-4">
              <p className="text-sm text-green-800 dark:text-green-300">
                Targets users who are in a pool but haven't created their own. Encourages them to start a pool for another group (office, family, friends).
              </p>
            </div>
          )}
          {selectedTemplate === 'we_miss_you' && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 sp-radius-sm p-4">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Re-engagement email for users who signed up 30+ days ago but never joined a pool. World Cup hype angle to draw them back.
              </p>
            </div>
          )}
          {selectedTemplate === 'ready_to_join' && (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 sp-radius-sm p-4">
              <p className="text-sm text-green-800 dark:text-green-300">
                Targets recent signups (last 30 days) who haven't joined a pool yet. Guides them to join or create one before the tournament starts.
              </p>
            </div>
          )}
          {selectedTemplate === 'past_predictor_hype' && (
            <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 sp-radius-sm p-4">
              <p className="text-sm text-purple-800 dark:text-purple-300">
                VIP treatment for proven users who have submitted predictions before. Hypes them up for the next tournament and encourages them to grow their pools.
              </p>
            </div>
          )}

          {/* Support reply fields */}
          {selectedTemplate === 'support_reply' && (
            <>
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 sp-radius-sm p-4">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  Reply to a user's support request with Sport Pool branding. Uses a neutral support design with a help-desk tone instead of the marketing template.
                </p>
              </div>

              {/* User picker */}
              <FormField label="Reply To">
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
                            className="inline-flex items-center gap-1 px-2 py-1 sp-radius-sm sp-bg-primary-light text-primary-700  text-xs"
                          >
                            {user?.name || user?.email || id}
                            <button
                              onClick={() => toggleUser(id)}
                              className="text-primary-500 hover:text-primary-700 "
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
                  <div className="border sp-border-silver sp-radius-sm max-h-48 overflow-y-auto">
                    {filteredUsers.length === 0 ? (
                      <p className="text-sm text-neutral-500 p-3 text-center">No users found</p>
                    ) : (
                      filteredUsers.map((u) => (
                        <button
                          key={u.user_id}
                          onClick={() => toggleUser(u.user_id)}
                          className={`w-full text-left px-3 py-2 text-sm border-b sp-border-mist last:border-0 transition-colors flex items-center gap-2 ${
                            selectedUserIds.includes(u.user_id)
                              ? 'sp-bg-primary-light'
                              : 'sp-hover-snow'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            selectedUserIds.includes(u.user_id)
                              ? 'bg-primary-600 border-primary-600'
                              : 'sp-border-silver'
                          }`}>
                            {selectedUserIds.includes(u.user_id) && (
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                              </svg>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="sp-text-ink truncate">{u.name}</div>
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
              </FormField>

              {/* Email content fields */}
              <FormField label="Subject">
                <Input
                  value={subject}
                  onChange={(e) => { setSubject(e.target.value); setConfirmSend(false) }}
                  placeholder="e.g. Re: Help with my predictions"
                />
              </FormField>

              <FormField label="Reply" helperText="Plain text — line breaks are preserved. Each user gets a personalized 'Hi [first name]' greeting.">
                <textarea
                  value={bodyText}
                  onChange={(e) => { setBodyText(e.target.value); setConfirmSend(false) }}
                  placeholder="Write your support reply here..."
                  rows={6}
                  className="w-full sp-radius-sm border sp-border-silver bg-surface px-3 py-2 text-sm sp-text-ink placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-y"
                />
              </FormField>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Button Text" helperText="Optional">
                  <Input
                    value={ctaText}
                    onChange={(e) => setCtaText(e.target.value)}
                    placeholder="e.g. Go to Dashboard"
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
            </>
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
                    className="w-full sp-radius-sm border sp-border-silver bg-surface px-3 py-2 text-sm sp-text-ink focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
                    className="w-full sp-radius-sm border sp-border-silver bg-surface px-3 py-2 text-sm sp-text-ink focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 sp-radius-sm p-4">
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
                    className={`px-3 py-1.5 sp-radius-sm text-xs font-medium transition-colors ${
                      recipientMode === 'segment'
                        ? 'bg-primary-600 text-white'
                        : 'sp-bg-mist sp-text-slate sp-hover-mist'
                    }`}
                  >
                    By Segment
                  </button>
                  <button
                    onClick={() => { setRecipientMode('users'); setConfirmSend(false); setDryRunResult(null) }}
                    className={`px-3 py-1.5 sp-radius-sm text-xs font-medium transition-colors ${
                      recipientMode === 'users'
                        ? 'bg-primary-600 text-white'
                        : 'sp-bg-mist sp-text-slate sp-hover-mist'
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
                        className={`text-left px-3 py-2.5 sp-radius-sm border text-sm transition-colors ${
                          segment === key
                            ? 'border-primary-500 sp-bg-primary-light text-primary-700  ring-1 ring-primary-500'
                            : 'sp-border-silver hover:border-neutral-300 sp-text-slate'
                        }`}
                      >
                        <div className="font-bold text-xs sp-heading">{seg.label}</div>
                        <div className="text-[11px] sp-text-slate mt-0.5">{seg.description}</div>
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
                              className="inline-flex items-center gap-1 px-2 py-1 sp-radius-sm sp-bg-primary-light text-primary-700  text-xs"
                            >
                              {user?.name || user?.email || id}
                              <button
                                onClick={() => toggleUser(id)}
                                className="text-primary-500 hover:text-primary-700 "
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
                    <div className="border sp-border-silver sp-radius-sm max-h-48 overflow-y-auto">
                      {filteredUsers.length === 0 ? (
                        <p className="text-sm text-neutral-500 p-3 text-center">No users found</p>
                      ) : (
                        filteredUsers.map((u) => (
                          <button
                            key={u.user_id}
                            onClick={() => toggleUser(u.user_id)}
                            className={`w-full text-left px-3 py-2 text-sm border-b sp-border-mist last:border-0 transition-colors flex items-center gap-2 ${
                              selectedUserIds.includes(u.user_id)
                                ? 'sp-bg-primary-light'
                                : 'sp-hover-snow'
                            }`}
                          >
                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                              selectedUserIds.includes(u.user_id)
                                ? 'bg-primary-600 border-primary-600'
                                : 'sp-border-silver'
                            }`}>
                              {selectedUserIds.includes(u.user_id) && (
                                <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                                </svg>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="sp-text-ink truncate">{u.name}</div>
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
                  className="w-full sp-radius-sm border sp-border-silver bg-surface px-3 py-2 text-sm sp-text-ink placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-y"
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
                  className="w-full sp-radius-sm border sp-border-silver bg-surface px-3 py-2 text-sm sp-text-ink focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
            <div className="sp-bg-surface border sp-border-silver sp-radius-sm p-4 space-y-3">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 sp-text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                </svg>
                <span className="text-sm font-bold sp-text-ink sp-heading">
                  Dry Run: {dryRunResult.totalEmails} email{dryRunResult.totalEmails !== 1 ? 's' : ''} would be sent
                </span>
              </div>
              {dryRunResult.preview.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs sp-text-slate font-medium sp-body">Recipients (first {dryRunResult.preview.length}):</p>
                  {dryRunResult.preview.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="sp-text-ink truncate max-w-[200px] sp-body">{p.to}</span>
                      <span className="sp-text-slate">—</span>
                      <span className="sp-text-slate truncate sp-body">{p.subject}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Email content preview */}
          {previewHtml && (
            <div className="border sp-border-silver sp-radius-sm overflow-hidden">
              <div className="bg-neutral-50 dark:bg-neutral-800 px-3 py-2 flex items-center justify-between border-b sp-border-silver">
                <div>
                  <span className="text-xs font-bold text-neutral-500 sp-heading">Email Preview</span>
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
          <div className="flex items-center gap-3 pt-2 border-t sp-border-silver">
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
        </>
      )}

    </div>
  )
}
