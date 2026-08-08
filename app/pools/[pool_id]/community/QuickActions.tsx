'use client'

import { useEffect, useRef, useState } from 'react'

import { Icon } from '@/components/ui/Icon'

type QuickActionsProps = {
  onSharePrediction: () => void
  onFlexBadges: () => void
  onDropStandings: () => void
}

/**
 * The composer's quick actions, matching QuickActionsMenu in the RN sheet.
 *
 * This was a strip of three pills sitting permanently above the input. RN puts
 * them behind a single + and opens a menu, and each row carries a description
 * under its label — "Share standings / Drop the leaderboard's top 5" — which the
 * pills had no room for, so the web only ever showed half the copy.
 *
 * Order, emoji, labels and descriptions are RN's QUICK_ACTIONS verbatim.
 */
const QUICK_ACTIONS = [
  { key: 'standings', emoji: '📊', label: 'Share standings', description: "Drop the leaderboard's top 5" },
  { key: 'flex', emoji: '🏆', label: 'Flex badges', description: "Show off a badge you've earned" },
  { key: 'prediction', emoji: '🎯', label: 'Share prediction', description: "Drop a score you've locked in" },
] as const

export function QuickActions({
  onSharePrediction,
  onFlexBadges,
  onDropStandings,
}: QuickActionsProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const run = (key: string) => {
    setOpen(false)
    if (key === 'standings') onDropStandings()
    else if (key === 'flex') onFlexBadges()
    else onSharePrediction()
  }

  return (
    /* Inline in the composer row now, so no border or padding of its own —
       it used to be a full-width band above the input and the + sat alone in
       it, costing a whole row of chat for one 32px button. */
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Quick actions"
        className={`inline-flex items-center justify-center w-9 h-9 rounded-control transition-colors ${
          open ? 'bg-primary-600 text-white' : 'bg-mist text-muted hover:text-ink'
        }`}
      >
        <Icon name="plus" size={16} weight="bold" />
      </button>

      {open && (
        <div
          role="menu"
          /* RN anchors this to the + button's own 32px box plus a 4px gap, in
             pixels so it cannot drift when the composer row grows. bottom-full
             plus mb-1 is the same measurement expressed in the layout. */
          className="absolute bottom-full left-0 mb-1 z-30 min-w-[240px] rounded-control bg-surface border border-silver/60 shadow-card overflow-hidden animate-fade-up"
        >
          {QUICK_ACTIONS.map((a, i) => (
            <button
              key={a.key}
              type="button"
              role="menuitem"
              onClick={() => run(a.key)}
              className={`w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-ink/5 transition-colors ${
                i === 0 ? '' : 'border-t border-silver/40'
              }`}
            >
              <span className="text-xl leading-none shrink-0">{a.emoji}</span>
              <span className="min-w-0 flex flex-col gap-0.5">
                <span className="t-body font-bold text-ink truncate">{a.label}</span>
                <span className="text-[11px] text-muted truncate">{a.description}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
