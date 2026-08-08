import { Icon } from '@/components/ui/Icon'
import type { SystemEvent } from './types'
import { formatMessageTime } from './helpers'

type SystemEventCardProps = {
  event: SystemEvent
}

/**
 * Hugeicons per event type, replacing the emoji each helper used to pass.
 *
 * Emoji were the odd surface out: every other glyph in the app comes from
 * ICON_MAP, and emoji render at the OS's whim — Apple's stadium is a different
 * object from Android's, and neither takes a tint, so they could not follow the
 * card's colour the way the rest of the UI does.
 *
 * All four names are verified present in ICON_MAP. An unmapped name renders the
 * fallback circle silently rather than failing, so this is worth checking
 * rather than assuming.
 */
const EVENT_ICON: Record<SystemEvent['event_type'], { name: string; tint: string }> = {
  // 🏟️ — a pitch, for "Match 104 results are in"
  match_result: { name: 'sportscourt.fill', tint: 'text-primary-600' },
  // Only ever emitted for a climb (helpers.tsx pushes when delta > 0), so an
  // up-arrow in success green is always the truth. Was a bar chart beside an
  // inline red triangle: two glyphs, one of them saying the opposite.
  rank_movement: { name: 'arrow.up', tint: 'text-success-600' },
  // 🔥 — a streak is running
  streak_alert: { name: 'flame.fill', tint: 'text-danger-500' },
  // 🏆 — a badge was unlocked
  badge_unlock: { name: 'trophy.fill', tint: 'text-accent-400' },
}

export function SystemEventCard({ event }: SystemEventCardProps) {
  // Render content with highlighted name
  const renderContent = () => {
    if (!event.highlighted_name) return event.content

    const parts = event.content.split(event.highlighted_name)
    if (parts.length < 2) return event.content

    return (
      <>
        {parts[0]}
        <span className="font-semibold text-warning-800">{event.highlighted_name}</span>
        {parts.slice(1).join(event.highlighted_name)}
      </>
    )
  }

  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-control bg-warning-50/60 dark:bg-warning-900/[0.06] border border-warning-200/60 dark:border-warning-800/15 my-2">
      <span className={`shrink-0 mt-0.5 ${EVENT_ICON[event.event_type].tint}`}>
        <Icon name={EVENT_ICON[event.event_type].name} size={18} weight="semibold" />
      </span>
      <p className="text-sm text-ink flex-1 leading-relaxed">
        {renderContent()}
      </p>
      <span className="text-[10px] text-muted shrink-0 mt-0.5" suppressHydrationWarning>
        {formatMessageTime(event.timestamp)}
      </span>
    </div>
  )
}
