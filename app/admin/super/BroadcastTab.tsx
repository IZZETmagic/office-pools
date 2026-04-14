'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { useToast } from '@/components/ui/Toast'

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

// --- Broadcast presets ---

type BroadcastPreset = {
  key: string
  label: string
  description: string
  category: 'growth' | 're-engagement' | 'hype' | 'legal' | 'custom'
  icon: string
  segment: SegmentKey
  subject: string
  heading: string
  body: string
  ctaText: string
  ctaUrl: string
}

const PRESETS: BroadcastPreset[] = [
  {
    key: 'we_miss_you',
    label: 'We Miss You',
    description: 'Re-engage users who signed up 30+ days ago but never joined a pool. World Cup hype angle.',
    category: 're-engagement',
    icon: 'M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z',
    segment: 'lapsed_users',
    subject: "The World Cup is coming — don't miss out!",
    heading: 'We Saved Your Spot',
    body: "You created a Sport Pool account a while back but haven't joined a pool yet. The FIFA World Cup 2026 is getting closer and you don't want to miss the fun!\n\nHere's how to get started:\n\n• Got a pool code? Join an existing pool in seconds\n• Want to run one? Create your own and invite friends\n\n48 teams, 104 matches, and bragging rights on the line. Don't sit this one out.",
    ctaText: 'Get Started',
    ctaUrl: 'https://sportpool.io/dashboard',
  },
  {
    key: 'ready_to_join',
    label: 'Ready to Join?',
    description: 'Nudge recent signups who haven\'t joined a pool yet. Guide them to join or create one.',
    category: 'growth',
    icon: 'M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z',
    segment: 'engaged_no_pool',
    subject: "Ready to join a pool? Here's how to get started",
    heading: 'Time to Jump In!',
    body: "Welcome to Sport Pool! You've signed up — now it's time to get in on the action.\n\nTwo ways to play:\n\n1. Join a pool — Ask a friend for their pool code and enter it on the dashboard\n2. Create a pool — Set one up in 30 seconds and share the code with your group\n\nThe World Cup is coming — make sure you're part of the competition!",
    ctaText: 'Go to Dashboard',
    ctaUrl: 'https://sportpool.io/dashboard',
  },
  {
    key: 'start_a_pool',
    label: 'Start Your Own Pool',
    description: 'Encourage members who are in a pool but haven\'t created one to start their own for another group.',
    category: 'growth',
    icon: 'M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
    segment: 'non_admin_members',
    subject: 'Love being in a pool? Start your own!',
    heading: 'Start Your Own Pool',
    body: "You're already part of the action — but why stop at one pool?\n\nCreate a pool for:\n\n• Your office or work team\n• Your family group chat\n• Your fantasy league crew\n• Your local pub or sports bar\n\nIt only takes 30 seconds to set up. You'll be the commissioner!",
    ctaText: 'Create a Pool',
    ctaUrl: 'https://sportpool.io/pools/create',
  },
  {
    key: 'past_predictor_hype',
    label: 'Past Predictor Hype',
    description: 'VIP treatment for users who have submitted predictions before. Hype them up for the next tournament.',
    category: 'hype',
    icon: 'M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z',
    segment: 'past_predictors',
    subject: "You've done this before — World Cup 2026 is calling",
    heading: 'The Prediction Pro Returns',
    body: "You've been here before — you know the thrill of nailing a prediction and watching your name climb the leaderboard.\n\nThe FIFA World Cup 2026 is around the corner, and this one is going to be bigger than ever — 48 teams, 104 matches, three host nations.\n\nHere's what you can do right now:\n\n• Invite more people to your pools — bigger pool, bigger glory\n• Create a new pool for a different group\n• Study the groups — predictions open soon\n\nYou've got the experience. Time to put it to work.",
    ctaText: 'Go to Dashboard',
    ctaUrl: 'https://sportpool.io/dashboard',
  },
  {
    key: 'pool_admin_invite_push',
    label: 'Admin Invite Push',
    description: 'Remind all pool admins to share their pool code and keep inviting people before the tournament.',
    category: 'growth',
    icon: 'M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z',
    segment: 'pool_admins',
    subject: 'Your pool needs more people — share the code!',
    heading: 'Grow Your Pool',
    body: "The World Cup is getting closer and the best pools are the ones with the most people competing.\n\nHere are some easy ways to grow your pool:\n\n• Drop the pool code in your group chat\n• Post it in your work Slack or Teams channel\n• Text it to friends and family who love football\n• Mention it at your next get-together\n\nThe more people in your pool, the more fun it'll be when the tournament starts!",
    ctaText: 'Go to Your Pools',
    ctaUrl: 'https://sportpool.io/dashboard',
  },
  {
    key: 'inactive_reminder',
    label: 'Come Back',
    description: 'General re-engagement for users who signed up but never joined a pool. Broader than "We Miss You".',
    category: 're-engagement',
    icon: 'M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3',
    segment: 'inactive_users',
    subject: "You signed up — now let's get you in a pool!",
    heading: "Don't Miss the Action",
    body: "You created your Sport Pool account but haven't joined a pool yet.\n\nIt's easy to get started:\n\n• Ask a friend if they have a pool code — join in seconds\n• Or create your own pool and invite your crew\n\nThe FIFA World Cup 2026 is going to be epic — 48 teams, more matches than ever, and bragging rights on the line.\n\nJoin a pool today and be ready when the tournament kicks off!",
    ctaText: 'Get Started',
    ctaUrl: 'https://sportpool.io/dashboard',
  },
  {
    key: 'privacy_policy_update',
    label: 'Privacy Policy Update',
    description: 'Notify all users about changes to the Privacy Policy. Includes acceptance-by-continued-use notice.',
    category: 'legal',
    icon: 'M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z',
    segment: 'all',
    subject: "We've updated our Privacy Policy",
    heading: 'Privacy Policy Update',
    body: "We're writing to let you know that we've made changes to our Privacy Policy. We encourage you to review the updated policy so you understand how your information is collected, used, and protected.\n\nYou can read the full updated Privacy Policy using the link below.\n\nBy continuing to use Sport Pool or by not deleting your account, you acknowledge and accept the updated Privacy Policy. If you do not agree with the changes, you may delete your account at any time from your profile settings.",
    ctaText: 'Read Privacy Policy',
    ctaUrl: 'https://sportpool.io/privacy',
  },
  {
    key: 'terms_update',
    label: 'Terms & Conditions Update',
    description: 'Notify all users about changes to the Terms & Conditions. Includes acceptance-by-continued-use notice.',
    category: 'legal',
    icon: 'M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z',
    segment: 'all',
    subject: "We've updated our Terms & Conditions",
    heading: 'Terms & Conditions Update',
    body: "We're writing to let you know that we've made changes to our Terms & Conditions. We encourage you to review the updated terms so you understand the rules and guidelines that govern your use of Sport Pool.\n\nYou can read the full updated Terms & Conditions using the link below.\n\nBy continuing to use Sport Pool or by not deleting your account, you acknowledge and accept the updated Terms & Conditions. If you do not agree with the changes, you may delete your account at any time from your profile settings.",
    ctaText: 'Read Terms & Conditions',
    ctaUrl: 'https://sportpool.io/terms',
  },
]

const CATEGORY_LABELS: Record<string, string> = {
  growth: 'Growth',
  're-engagement': 'Re-engagement',
  hype: 'Hype',
  legal: 'Legal',
  custom: 'Custom',
}

// --- Types ---

export function BroadcastTab() {
  const [sending, setSending] = useState(false)
  const [composeStep, setComposeStep] = useState<'hidden' | 'presets' | 'compose'>('hidden')
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
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

  function selectPreset(preset: BroadcastPreset) {
    setSelectedPreset(preset.key)
    setSubject(preset.subject)
    setHeading(preset.heading)
    setBody(preset.body)
    setCtaText(preset.ctaText)
    setCtaUrl(preset.ctaUrl)
    setSegment(preset.segment)
    setPreviewHtml('')
    setConfirmSend(false)
    setComposeStep('compose')
  }

  function startCustom() {
    setSelectedPreset(null)
    setSubject('')
    setHeading('')
    setBody('')
    setCtaText('')
    setCtaUrl('')
    setSegment('all')
    setPreviewHtml('')
    setConfirmSend(false)
    setComposeStep('compose')
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
    } catch {
      showToast('Failed to send broadcast', 'error')
    } finally {
      setSending(false)
    }
  }

  function resetForm() {
    setComposeStep('hidden')
    setSelectedPreset(null)
    setSubject('')
    setHeading('')
    setBody('')
    setCtaText('')
    setCtaUrl('')
    setSegment('all')
    setPreviewHtml('')
    setConfirmSend(false)
  }

  // Group presets by category for display
  const presetsByCategory = PRESETS.reduce<Record<string, BroadcastPreset[]>>((acc, p) => {
    if (!acc[p.category]) acc[p.category] = []
    acc[p.category].push(p)
    return acc
  }, {})

  const selectedPresetDef = selectedPreset ? PRESETS.find((p) => p.key === selectedPreset) : null

  return (
    <div className="space-y-6 sp-body">
      {/* ===== LIST VIEW (nothing selected) ===== */}
      {composeStep === 'hidden' ? (
        <>
          {/* Header */}
          <div>
            <h2 className="text-2xl font-extrabold sp-heading">
              <span className="sp-text-ink">Broadcast</span>
              <span className="sp-text-primary">Emails</span>
            </h2>
            <p className="text-sm text-neutral-500 mt-0.5 sp-body">
              Select a broadcast template or compose from scratch. Each recipient gets a personalized greeting.
            </p>
          </div>

          {/* Preset gallery */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(presetsByCategory).map(([category, presets]) => (
              presets.map((preset) => (
                <button
                  key={preset.key}
                  onClick={() => selectPreset(preset)}
                  className="text-left p-4 sp-radius-lg border transition-all sp-border-silver hover:border-neutral-300 bg-surface hover:shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 sp-radius-sm flex items-center justify-center shrink-0 sp-bg-mist">
                      <svg className="w-5 h-5 sp-text-slate" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d={preset.icon} />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-sm sp-text-ink sp-heading">
                        {preset.label}
                      </div>
                      <div className="text-xs sp-text-slate mt-0.5 line-clamp-2 sp-body">
                        {preset.description}
                      </div>
                      <div className="text-[11px] sp-text-primary mt-1.5 font-medium sp-body">
                        Segment: {SEGMENTS[preset.segment].label}
                      </div>
                    </div>
                  </div>
                </button>
              ))
            ))}

            {/* Custom option */}
            <button
              onClick={startCustom}
              className="text-left p-4 sp-radius-lg border border-dashed transition-all sp-border-silver hover:border-neutral-400 bg-surface hover:shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 sp-radius-sm flex items-center justify-center shrink-0 sp-bg-mist">
                  <svg className="w-5 h-5 sp-text-slate" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm sp-text-ink sp-heading">
                    Compose from Scratch
                  </div>
                  <div className="text-xs sp-text-slate mt-0.5 sp-body">
                    Write a custom broadcast email. Choose your segment and compose the content.
                  </div>
                </div>
              </div>
            </button>
          </div>
        </>
      ) : (
        /* ===== DETAIL SHEET VIEW (composing) ===== */
        <>
          {/* Back button */}
          <div className="flex items-center gap-3">
            <button
              onClick={resetForm}
              className="flex items-center gap-1.5 text-sm font-medium text-neutral-500 hover:text-neutral-900  transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
              Broadcasts
            </button>
          </div>

          {/* Template header */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sp-radius-sm flex items-center justify-center shrink-0 sp-bg-primary-light">
              <svg className="w-5 h-5 sp-text-primary" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d={selectedPresetDef?.icon || 'm16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10'} />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-extrabold sp-heading sp-text-ink">
                {selectedPresetDef?.label || 'Compose Broadcast'}
              </h2>
              <p className="text-sm text-neutral-500 mt-0.5 sp-body">
                {selectedPresetDef
                  ? selectedPresetDef.description
                  : 'Write a custom broadcast email. Choose your segment and compose the content.'}
              </p>
            </div>
          </div>

          {/* Compose form */}
          <div className="bg-surface border sp-border-silver sp-radius-lg p-6 space-y-4">
            {selectedPreset && (
              <p className="text-xs text-neutral-500 sp-body">
                Pre-filled from template — edit anything before sending
              </p>
            )}

          {/* Segment selector */}
          <FormField label="Send To">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(Object.entries(SEGMENTS) as [SegmentKey, typeof SEGMENTS[SegmentKey]][]).map(([key, seg]) => (
                <button
                  key={key}
                  onClick={() => { setSegment(key); setConfirmSend(false) }}
                  className={`text-left px-3 py-2.5 sp-radius-sm border text-sm transition-colors ${
                    segment === key
                      ? 'border-primary-500 bg-primary-50  text-primary-700  ring-1 ring-primary-500'
                      : 'sp-border-silver hover:border-neutral-300 sp-text-slate'
                  }`}
                >
                  <div className="font-bold text-xs sp-heading">{seg.label}</div>
                  <div className="text-[11px] sp-text-slate mt-0.5 sp-body">{seg.description}</div>
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

          <FormField label="Body" helperText="Plain text - line breaks are preserved. Each recipient gets 'Hi [first name]' automatically.">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your email content here..."
              rows={8}
              className="w-full sp-radius-sm border sp-border-silver bg-surface px-3 py-2 text-sm sp-text-ink placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-y sp-body"
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
            <div className="border sp-border-silver sp-radius-sm overflow-hidden">
              <div className="sp-bg-snow px-3 py-2 text-xs font-bold text-neutral-500 border-b sp-border-silver sp-heading">
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
          <div className="flex items-center gap-3 pt-2 border-t sp-border-silver">
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
                <span className="text-xs text-warning-600  font-medium sp-body">
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
        </>
      )}

    </div>
  )
}
