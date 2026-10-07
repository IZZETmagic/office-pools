'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { useToast } from '@/components/ui/Toast'
import { brandedTemplate } from '@/lib/email/templates'
import { greeting, paragraph } from '@/lib/email/components'

// Everyone only (Ryan, 2026-10-07): a broadcast goes to the fixed General list, as News from
// SportPool. A smaller group goes through Templates → Custom. See app/api/admin/broadcast.
const SEGMENTS = {
  all: { label: 'Everyone', description: 'Every member, except anyone who switched off News from SportPool' },
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
    key: 'privacy_policy_update',
    label: 'Privacy Policy Update',
    description: 'Notify all users about changes to the Privacy Policy. Includes acceptance-by-continued-use notice.',
    category: 'legal',
    icon: 'M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z',
    segment: 'all',
    subject: "We've updated our Privacy Policy",
    heading: 'Privacy Policy Update',
    body: "We're writing to let you know that we've made changes to our Privacy Policy. We encourage you to review the updated policy so you understand how your information is collected, used, and protected.\n\nYou can read the full updated Privacy Policy using the link below.\n\nBy continuing to use SportPool or by not deleting your account, you acknowledge and accept the updated Privacy Policy. If you do not agree with the changes, you may delete your account at any time from your profile settings.",
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
    body: "We're writing to let you know that we've made changes to our Terms & Conditions. We encourage you to review the updated terms so you understand the rules and guidelines that govern your use of SportPool.\n\nYou can read the full updated Terms & Conditions using the link below.\n\nBy continuing to use SportPool or by not deleting your account, you acknowledge and accept the updated Terms & Conditions. If you do not agree with the changes, you may delete your account at any time from your profile settings.",
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
  // A Terms or Privacy update is always delivered (migration 180) — it goes without the News topic.
  const [isPolicyUpdate, setIsPolicyUpdate] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [confirmSend, setConfirmSend] = useState(false)
  // One key per broadcast, made when Send opens the confirm step. Confirming
  // twice, or retrying after an error, reuses it — so the server refuses the
  // repeat instead of broadcasting again. Cancel and Send again → a new key.
  const [sendKey, setSendKey] = useState<string | null>(null)

  // This builds the HTML that is both previewed and POSTed to /api/admin/broadcast —
  // the route sends what it is given. It used to hold its own hand-copied shell, which
  // is how broadcasts drifted a whole re-brand behind the transactional emails; it now
  // calls the shared one so that cannot happen again.
  function buildHtml() {
    return brandedTemplate({
      preheader: subject,
      heading: heading || subject,
      body: `
        ${greeting('{{{FIRST_NAME|there}}}')}
        ${paragraph(body.replace(/\n/g, '<br>'), { marginBottom: 0 })}
      `,
      ctaText: ctaText || undefined,
      ctaUrl: ctaUrl || undefined,
      unsubscribeUrl: '{{{RESEND_UNSUBSCRIBE_URL}}}',
    })
  }

  function selectPreset(preset: BroadcastPreset) {
    setSelectedPreset(preset.key)
    setSubject(preset.subject)
    setHeading(preset.heading)
    setBody(preset.body)
    setCtaText(preset.ctaText)
    setCtaUrl(preset.ctaUrl)
    setSegment(preset.segment)
    setIsPolicyUpdate(preset.category === 'legal')
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
    setIsPolicyUpdate(false)
    setPreviewHtml('')
    setConfirmSend(false)
    setComposeStep('compose')
  }

  async function handleSend() {
    if (!subject || !body) {
      showToast('Subject and body are required', 'error')
      return
    }
    if (!sendKey) {
      showToast('Press Send again to confirm this broadcast', 'error')
      setConfirmSend(false)
      return
    }

    setSending(true)
    try {
      const html = buildHtml()
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // ⚠ `dry_run: false` must be explicit — the route previews without it.
        body: JSON.stringify({
          subject, html, segment, dry_run: false, idempotency_key: sendKey,
          kind: isPolicyUpdate ? 'policy_update' : 'sportpool_news',
        }),
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
    setIsPolicyUpdate(false)
    setPreviewHtml('')
    setConfirmSend(false)
    setSendKey(null)
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
                  <Icon name="pencil" size={20} className="sp-text-slate" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm sp-text-ink sp-heading">
                    Compose from Scratch
                  </div>
                  <div className="text-xs sp-text-slate mt-0.5 sp-body">
                    Write a broadcast to everyone, sent as News from SportPool.
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
              <Icon name="chevron.left" size={16} />
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
                  : 'Write a broadcast to everyone, sent as News from SportPool.'}
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

          {/* Where it goes — there is one choice now (N4, 2026-10-07). */}
          <FormField label="Send To">
            <p className="text-sm sp-text-slate sp-body">
              {isPolicyUpdate
                ? 'Everyone, as a Terms or Privacy update — always delivered, whatever their switches. Only people who unsubscribed from all our email are left out.'
                : 'Everyone, as News from SportPool — anyone who switched that off is left out. For a smaller group, use Templates → Custom.'}
            </p>
            <label className="mt-2 flex items-center gap-2 text-xs sp-text-slate sp-body">
              <input
                type="checkbox"
                checked={isPolicyUpdate}
                onChange={(e) => { setIsPolicyUpdate(e.target.checked); setConfirmSend(false) }}
              />
              This is a Terms or Privacy Policy update
            </label>
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
                onClick={() => { setSendKey(`broadcast-${crypto.randomUUID()}`); setConfirmSend(true) }}
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
