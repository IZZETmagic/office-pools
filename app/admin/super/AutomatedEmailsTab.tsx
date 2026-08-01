'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Badge } from '@/components/ui/Badge'

// --- Automated email definitions ---

type AutomatedEmail = {
  key: string
  label: string
  description: string
  trigger: string
  category: 'transactional' | 'notification' | 'confirmation' | 'admin'
  recipient: string
  endpoint: string
  topic?: string
}

const AUTOMATED_EMAILS: AutomatedEmail[] = [
  // Confirmations
  {
    key: 'prediction_submitted',
    label: 'Prediction Confirmation',
    description: 'Sent when a user submits their full tournament predictions for a pool.',
    trigger: 'User submits predictions',
    category: 'confirmation',
    recipient: 'Submitting user',
    endpoint: '/api/pools/[pool_id]/predictions',
    topic: 'PREDICTIONS',
  },
  {
    key: 'round_prediction_submitted',
    label: 'Round Prediction Confirmation',
    description: 'Sent when a user submits predictions for a specific progressive round.',
    trigger: 'User submits round predictions',
    category: 'confirmation',
    recipient: 'Submitting user',
    endpoint: '/api/pools/[pool_id]/predictions/round',
    topic: 'PREDICTIONS',
  },
  {
    key: 'bracket_picks_submitted',
    label: 'Bracket Picks Confirmation',
    description: 'Sent when a user submits their bracket picks for a pool.',
    trigger: 'User submits bracket picks',
    category: 'confirmation',
    recipient: 'Submitting user',
    endpoint: '/api/pools/[pool_id]/bracket-picks',
    topic: 'PREDICTIONS',
  },
  {
    key: 'predictions_unlocked',
    label: 'Predictions Unlocked',
    description: 'Sent when a pool admin unlocks a user\'s predictions for editing.',
    trigger: 'Admin unlocks predictions',
    category: 'confirmation',
    recipient: 'User whose predictions were unlocked',
    endpoint: '/api/pools/[pool_id]/predictions/unlock',
    topic: 'POOL_ACTIVITY',
  },

  // Notifications
  {
    key: 'pool_joined',
    label: 'Pool Joined',
    description: 'Notifies the pool admin when a new member joins their pool.',
    trigger: 'User joins a pool',
    category: 'notification',
    recipient: 'Pool admin',
    endpoint: '/api/notifications/pool-joined',
    topic: 'POOL_ACTIVITY',
  },
  {
    key: 'member_removed',
    label: 'Member Removed',
    description: 'Notifies a user when they have been removed from a pool by the admin.',
    trigger: 'Admin removes a member',
    category: 'notification',
    recipient: 'Removed user',
    endpoint: '/api/notifications/member-removed',
    topic: 'POOL_ACTIVITY',
  },
  {
    key: 'deadline_changed',
    label: 'Deadline Changed',
    description: 'Notifies pool members when the prediction deadline has been updated.',
    trigger: 'Admin changes deadline',
    category: 'notification',
    recipient: 'All pool members',
    endpoint: '/api/notifications/deadline-changed',
    topic: 'POOL_ACTIVITY',
  },
  {
    key: 'points_adjusted',
    label: 'Points Adjusted',
    description: 'Notifies a user when their points have been manually adjusted by the pool admin.',
    trigger: 'Admin adjusts points',
    category: 'notification',
    recipient: 'Affected user',
    endpoint: '/api/notifications/points-adjusted',
    topic: 'POOL_ACTIVITY',
  },
  {
    key: 'mention',
    label: 'User Mentioned',
    description: 'Notifies a user when they are mentioned in a pool comment or discussion.',
    trigger: 'User is @mentioned',
    category: 'notification',
    recipient: 'Mentioned user',
    endpoint: '/api/notifications/mention',
    topic: 'COMMUNITY',
  },
  {
    key: 'round_state_changed',
    label: 'Round State Changed',
    description: 'Batch email sent to pool members when a progressive round state changes (opened, closed, scored).',
    trigger: 'Round state transition',
    category: 'notification',
    recipient: 'All pool members',
    endpoint: '/api/pools/[pool_id]/rounds/[round_key]/state',
    topic: 'POOL_ACTIVITY',
  },

  // Admin-triggered
  {
    key: 'advance_teams',
    label: 'Teams Advanced',
    description: 'Batch email sent when a super admin advances teams to the next tournament stage.',
    trigger: 'Super admin advances teams',
    category: 'admin',
    recipient: 'Affected pool members',
    endpoint: '/api/admin/advance-teams',
    topic: 'POOL_ACTIVITY',
  },

  // Transactional
  {
    key: 'contact_form',
    label: 'Contact Form Submission',
    description: 'Forwards contact form submissions to the support inbox.',
    trigger: 'User submits contact form',
    category: 'transactional',
    recipient: 'Support inbox',
    endpoint: '/api/contact',
  },
]

const CATEGORY_CONFIG: Record<string, { label: string; variant: 'green' | 'blue' | 'yellow' | 'gray' }> = {
  confirmation: { label: 'Confirmation', variant: 'green' },
  notification: { label: 'Notification', variant: 'blue' },
  admin: { label: 'Admin', variant: 'yellow' },
  transactional: { label: 'Transactional', variant: 'gray' },
}

type CategoryFilter = 'all' | 'confirmation' | 'notification' | 'admin' | 'transactional'

export function AutomatedEmailsTab() {
  const [selectedEmail, setSelectedEmail] = useState<AutomatedEmail | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')

  const filtered = categoryFilter === 'all'
    ? AUTOMATED_EMAILS
    : AUTOMATED_EMAILS.filter((e) => e.category === categoryFilter)

  const confirmationCount = AUTOMATED_EMAILS.filter((e) => e.category === 'confirmation').length
  const notificationCount = AUTOMATED_EMAILS.filter((e) => e.category === 'notification').length
  const adminCount = AUTOMATED_EMAILS.filter((e) => e.category === 'admin').length
  const transactionalCount = AUTOMATED_EMAILS.filter((e) => e.category === 'transactional').length

  const categoryOptions: { value: CategoryFilter; label: string; count: number | null }[] = [
    { value: 'all', label: 'All', count: null },
    { value: 'confirmation', label: 'Confirmation', count: confirmationCount },
    { value: 'notification', label: 'Notification', count: notificationCount },
    { value: 'admin', label: 'Admin', count: adminCount },
    { value: 'transactional', label: 'Transactional', count: transactionalCount },
  ]

  // ===== DETAIL SHEET VIEW =====
  if (selectedEmail) {
    const cat = CATEGORY_CONFIG[selectedEmail.category]
    return (
      <div className="sp-body space-y-6">
        {/* Back button */}
        <button
          onClick={() => setSelectedEmail(null)}
          className="flex items-center gap-1.5 text-sm font-medium sp-text-slate hover:sp-text-ink transition-colors"
        >
          <Icon name="chevron.left" size={16} />
          Automated Emails
        </button>

        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 sp-radius-sm flex items-center justify-center shrink-0 sp-bg-primary-light">
            <Icon name="gear" size={20} className="sp-text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-extrabold sp-heading sp-text-ink">
                {selectedEmail.label}
              </h2>
              <Badge variant={cat.variant}>{cat.label}</Badge>
            </div>
            <p className="text-sm sp-text-slate mt-0.5 sp-body">{selectedEmail.description}</p>
          </div>
        </div>

        {/* Detail cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sp-bg-surface sp-radius-sm p-4" style={{ border: '0.5px solid var(--sp-silver, #C8CCD4)66' }}>
            <div className="sp-text-slate text-xs mb-1.5 sp-body">Trigger</div>
            <div className="text-sm sp-text-ink font-medium">{selectedEmail.trigger}</div>
          </div>
          <div className="sp-bg-surface sp-radius-sm p-4" style={{ border: '0.5px solid var(--sp-silver, #C8CCD4)66' }}>
            <div className="sp-text-slate text-xs mb-1.5 sp-body">Recipient</div>
            <div className="text-sm sp-text-ink font-medium">{selectedEmail.recipient}</div>
          </div>
          <div className="sp-bg-surface sp-radius-sm p-4" style={{ border: '0.5px solid var(--sp-silver, #C8CCD4)66' }}>
            <div className="sp-text-slate text-xs mb-1.5 sp-body">API Endpoint</div>
            <div className="text-sm sp-text-slate font-mono text-xs">{selectedEmail.endpoint}</div>
          </div>
          {selectedEmail.topic && (
            <div className="sp-bg-surface sp-radius-sm p-4" style={{ border: '0.5px solid var(--sp-silver, #C8CCD4)66' }}>
              <div className="sp-text-slate text-xs mb-1.5 sp-body">Notification Topic</div>
              <Badge variant="blue">{selectedEmail.topic}</Badge>
              <p className="text-xs sp-text-slate mt-1.5">Users can unsubscribe from this topic</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ===== LIST VIEW =====
  return (
    <div className="sp-body space-y-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-extrabold sp-heading mb-4">
          <span className="sp-text-ink">Automated</span>
          <span className="sp-text-primary">Emails</span>
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {categoryOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setCategoryFilter(opt.value)}
              className={`px-3 py-1.5 sp-radius-sm text-xs font-medium sp-body transition-colors ${
                categoryFilter === opt.value
                  ? 'sp-bg-primary-light sp-text-primary'
                  : 'sp-bg-mist sp-text-slate sp-hover-snow'
              }`}
            >
              {opt.label}{opt.count != null && <span className="ml-1 opacity-70">{opt.count}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile cards */}
      <div className="sm:hidden space-y-3">
        {filtered.map((email) => {
          const cat = CATEGORY_CONFIG[email.category]
          return (
            <button
              key={email.key}
              onClick={() => setSelectedEmail(email)}
              className="w-full text-left sp-bg-surface sp-radius-lg overflow-hidden transition-shadow hover:shadow-md"
              style={{ border: '0.5px solid var(--sp-silver, #C8CCD4)80' }}
            >
              <div className="flex items-center gap-2 px-3.5 py-2" style={{ backgroundColor: 'var(--sp-snow, #F7F8FA)', borderBottom: '0.5px solid var(--sp-silver, #C8CCD4)66' }}>
                <Badge variant={cat.variant}>{cat.label}</Badge>
                {email.topic && (
                  <span className="text-[11px] font-medium sp-text-primary sp-body">{email.topic}</span>
                )}
                <Icon name="chevron.right" size={16} className="sp-text-slate ml-auto" />
              </div>
              <div className="px-3.5 py-3">
                <div className="text-sm font-medium sp-text-ink sp-body">{email.label}</div>
                <p className="text-xs sp-text-slate mt-1 line-clamp-2 sp-body">{email.description}</p>
                <div className="flex items-center gap-3 mt-2 text-[11px] sp-text-slate sp-body">
                  <span>{email.trigger}</span>
                  <span className="opacity-40">·</span>
                  <span>{email.recipient}</span>
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
                <th className="text-left px-4 py-3.5 font-medium sp-text-slate whitespace-nowrap sp-body">Email</th>
                <th className="text-left px-4 py-3.5 font-medium sp-text-slate whitespace-nowrap sp-body">Type</th>
                <th className="text-left px-4 py-3.5 font-medium sp-text-slate whitespace-nowrap sp-body">Trigger</th>
                <th className="text-left px-4 py-3.5 font-medium sp-text-slate whitespace-nowrap sp-body">Recipient</th>
                <th className="text-left px-4 py-3.5 font-medium sp-text-slate whitespace-nowrap sp-body">Topic</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((email) => {
                const cat = CATEGORY_CONFIG[email.category]
                return (
                  <tr
                    key={email.key}
                    onClick={() => setSelectedEmail(email)}
                    className="cursor-pointer transition-colors sp-hover-snow"
                    style={{ borderBottom: '0.5px solid var(--sp-silver, #C8CCD4)66' }}
                  >
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="font-medium sp-text-ink">{email.label}</div>
                      <div className="text-xs sp-text-slate mt-0.5 max-w-[280px] truncate">{email.description}</div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <Badge variant={cat.variant}>{cat.label}</Badge>
                    </td>
                    <td className="px-4 py-4 sp-text-slate whitespace-nowrap">
                      {email.trigger}
                    </td>
                    <td className="px-4 py-4 sp-text-slate whitespace-nowrap">
                      {email.recipient}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      {email.topic ? (
                        <span className="text-xs font-medium sp-text-primary">{email.topic}</span>
                      ) : (
                        <span className="text-xs sp-text-slate">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
