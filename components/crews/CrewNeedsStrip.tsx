'use client'

// The dashboard's "Needs you" — the crew decisions waiting on this person, on the web.
//
// Same cards the app shows in Activity → Needs you, from the same builder (lib/crews/needs.ts):
//   · Your spot's saved          → I'm in / Not this one
//   · Dave added you to …        → Join / No thanks
//   · Keep this group together?  → Save as crew / Not now   (the pool's admin only)
// The World Cup groups are on the web — 2 of the 253 admins have the app — so this is where most of
// them will meet "Keep this group together?" (decision 8).
//
// Disclosure gate: "This lists the crew decisions waiting on you, and each goes away when you
// answer it." Nothing here names anyone who hasn't taken a spot.
//
// Empty → renders nothing. The pick reminders the app also lists under Needs you are already on the
// dashboard's pool cards, so this strip is crews only.

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useSyncExternalStore } from 'react'

import { Icon } from '@/components/ui/Icon'
import { useToast } from '@/components/ui/Toast'
import type { NeedAction, NeedItem } from '@/lib/activity/needsYou'
import { crewActionPlan } from '@/lib/crews/needActions'
import { deadlineLabel } from '@/lib/crews/words'

import { SaveCrewModal } from './SaveCrewModal'

export function CrewNeedsStrip({ items }: { items: NeedItem[] }) {
  const router = useRouter()
  const { showToast } = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  // Cards answered on this visit leave at once — before the request, let alone the page refresh.
  const [gone, setGone] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<{ poolId: string; suggestedName: string; people: number } | null>(null)

  const shown = items.filter((i) => !gone.has(i.id))
  if (shown.length === 0 && !saving) return null

  async function run(item: NeedItem, action: NeedAction) {
    if (busy) return
    const plan = crewActionPlan(item, action.id)
    if (plan.kind === 'none') return
    if (plan.kind === 'open-save') {
      // The one that waits: the card leaves when the crew is saved (onSaved), not when the dialog
      // opens — it can still be cancelled.
      setSaving({ poolId: item.pool_id, suggestedName: item.crew?.name ?? item.pool_name, people: item.crew?.people ?? 0 })
      return
    }
    // The card leaves the moment the button is pressed (Ryan, 2026-10-02); a refusal brings it back
    // with the server's reason ("This pool is full.").
    setBusy(`${item.id}:${action.id}`)
    setGone((g) => new Set(g).add(item.id))
    const putBack = (message: string) => {
      setGone((g) => {
        const next = new Set(g)
        next.delete(item.id)
        return next
      })
      showToast(message, 'error')
    }
    try {
      const res = await fetch(plan.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan.body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        putBack(typeof data.error === 'string' ? data.error : 'That didn’t work. Please try again.')
        return
      }
      if (plan.then === 'refresh') router.refresh()
      else router.push(plan.then.goTo)
    } catch {
      putBack('That didn’t work. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="mb-8" aria-labelledby="needs-you-title">
      <h3 id="needs-you-title" className="text-xl font-bold text-ink mb-4">
        Needs you
      </h3>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {shown.map((item) => (
          <CrewNeedCard key={item.id} item={item} busy={busy} onAction={run} />
        ))}
      </div>

      <SaveCrewModal
        key={saving?.poolId ?? 'closed'}
        target={saving}
        onClose={() => setSaving(null)}
        onSaved={(crewId) => {
          const poolId = saving?.poolId
          setSaving(null)
          if (poolId) setGone((g) => new Set(g).add(`need-crew-save-${poolId}`))
          showToast('Crew saved.', 'success')
          router.push(`/crews/${encodeURIComponent(crewId)}`)
        }}
      />
    </section>
  )
}

function CrewNeedCard({
  item,
  busy,
  onAction,
}: {
  item: NeedItem
  busy: string | null
  onAction: (item: NeedItem, action: NeedAction) => void
}) {
  // The eyebrow names the GROUP — except on Keep this group together?, where there is no crew yet
  // and the pool is the thing being asked about.
  const eyebrow = item.kind === 'crew_save' ? item.pool_name || 'Your pool' : item.crew?.name ?? 'Crew'
  const eyebrowHref =
    item.kind === 'crew_save'
      ? `/pools/${encodeURIComponent(item.pool_id)}`
      : item.kind === 'crew_seat' && item.crew?.crew_id
        ? `/crews/${encodeURIComponent(item.crew.crew_id)}`
        : null
  const footnote =
    item.kind === 'crew_seat' ? `${item.made} of ${item.total} in` : item.kind === 'crew_save' ? 'Only you see this' : 'Join once'

  return (
    <div className="bg-surface rounded-card border-[1.5px] border-primary-600 p-4 flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-primary-600">
            <Icon name="person.3.fill" size={12} />
            {eyebrowHref ? (
              <Link href={eyebrowHref} className="truncate text-[10px] font-black tracking-[0.6px] uppercase hover:underline">
                {eyebrow}
              </Link>
            ) : (
              <span className="truncate text-[10px] font-black tracking-[0.6px] uppercase">{eyebrow}</span>
            )}
          </div>
          <p className="mt-0.5 text-[15px] font-bold text-ink">{item.title}</p>
          <p className="text-xs font-medium text-muted truncate">{item.subtitle}</p>
        </div>
        {item.deadline_at !== null ? <DeadlinePill iso={item.deadline_at} /> : null}
      </div>

      <div className="flex items-center gap-2">
        <span className="flex-1 text-xs font-medium text-muted">{footnote}</span>
        {(item.actions ?? []).map((a) => {
          const key = `${item.id}:${a.id}`
          const primary = a.style === 'primary'
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onAction(item, a)}
              disabled={busy !== null}
              className={`min-w-16 h-8 px-3 rounded-pill text-xs font-bold transition-opacity disabled:cursor-default ${
                primary ? 'bg-primary-600 text-white hover:bg-primary-700' : 'bg-mist text-ink hover:bg-silver'
              } ${busy !== null && busy !== key ? 'opacity-50' : ''}`}
            >
              {busy === key ? '…' : a.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * "5h left" / "Sat 7:30 pm", red inside the last day.
 *
 * ⚠ The clock is SUBSCRIBED, not read during render: the label depends on the viewer's timezone and
 * on now, neither of which the server has. The server snapshot is null, so the server (and the first
 * client pass) draw a neutral "Before picks lock"; after hydration the pill tells the truth, and it
 * keeps telling it — the minute ticks, so "40m left" counts down while the dashboard is open.
 */
function DeadlinePill({ iso }: { iso: string }) {
  const now = useSyncExternalStore(subscribeMinute, currentMinute, () => null)
  const urgent = now !== null && Date.parse(iso) - now < 86_400_000
  return (
    <span
      className={`shrink-0 px-2 py-0.5 rounded-pill text-[11px] font-bold ${
        urgent ? 'bg-danger-100 text-danger-700' : 'bg-warning-100 text-warning-700'
      }`}
    >
      {now === null ? 'Before picks lock' : deadlineLabel(iso, now)}
    </span>
  )
}

const MINUTE = 60_000
/** Stable within a minute — useSyncExternalStore needs the same snapshot until something changes. */
const currentMinute = () => Math.floor(Date.now() / MINUTE) * MINUTE
function subscribeMinute(notify: () => void) {
  const id = window.setInterval(notify, MINUTE / 4)
  return () => window.clearInterval(id)
}
