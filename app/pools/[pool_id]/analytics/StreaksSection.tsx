'use client'

import { Icon } from '@/components/ui/Icon'
import { FORM_LEGEND, getFormDotClass } from '@/lib/design/formDots'

import type { StreakData } from './analyticsHelpers'

// =============================================
// COMPONENT
// =============================================

type StreaksSectionProps = {
  streaks: StreakData
}

/**
 * StreakBar from the app: five segments, filled up to the streak length. The cold
 * bar ramps its opacity across the segments (0.32 → 1.0) so a long cold run reads
 * as deepening rather than just longer.
 */
function StreakBar({ kind, value, color }: { kind: 'hot' | 'cold'; value: number; color: string }) {
  const filled = Math.min(value, 5)
  return (
    <div className="flex gap-[3px] my-0.5">
      {Array.from({ length: 5 }, (_, i) => {
        const isFilled = i < filled
        const background = !isFilled
          ? 'var(--sp-mist)'
          : kind === 'cold'
            ? `color-mix(in srgb, ${color} ${Math.round((0.15 + 0.17 * (i + 1)) * 100)}%, transparent)`
            : color
        return <span key={i} className="w-5 h-[5px] rounded-pill" style={{ background }} />
      })}
    </div>
  )
}

/**
 * StreakCard from the app: icon, uppercase caption, a big black numeral in the
 * streak's colour, the segment bar, then a footer line. The hot card carries a
 * hairline border in its own colour at 20%; the cold one does not.
 */
function StreakCard({
  icon,
  caption,
  value,
  color,
  kind,
  bordered,
  footer,
}: {
  icon: string
  caption: string
  value: number
  color: string
  kind: 'hot' | 'cold'
  bordered?: boolean
  footer: React.ReactNode
}) {
  return (
    <div
      className="flex-1 flex flex-col items-center gap-1.5 bg-surface rounded-card py-3 px-2 shadow-card dark:shadow-none"
      style={bordered ? { border: `1px solid color-mix(in srgb, ${color} 20%, transparent)` } : undefined}
    >
      <Icon name={icon} size={22} weight="semibold" tint={color} />
      <span className="text-[10px] font-semibold uppercase tracking-[0.4px] text-muted text-center">
        {caption}
      </span>
      <span className="t-num font-black text-[36px] leading-10" style={{ color }}>
        {value}
      </span>
      <StreakBar kind={kind} value={value} color={color} />
      {footer}
    </div>
  )
}

export function StreaksSection({ streaks }: StreaksSectionProps) {
  const { currentStreak, longestHotStreak, longestColdStreak, timeline } = streaks

  if (timeline.length === 0) {
    return null
  }

  const currentHot = currentStreak.type === 'hot' ? currentStreak.length : 0

  return (
    <div className="space-y-4">
      <h3 className="t-section-header text-ink">Hot &amp; Cold Streaks</h3>

      {/* HotColdStreakCards in the app: two cards, not three. "Best hot streak"
          is the hot card's footer rather than a card of its own, which keeps the
          pair reading as current-state vs personal-worst. */}
      <div className="flex gap-2">
        <StreakCard
          kind="hot"
          icon="flame.fill"
          caption="Current Hot Streak"
          value={currentHot}
          color="var(--sp-hot-streak)"
          bordered
          footer={
            <span className="text-[11px] font-medium text-muted text-center">
              Personal best: <span className="font-bold text-ink">{longestHotStreak}</span>
            </span>
          }
        />
        <StreakCard
          kind="cold"
          icon="snowflake"
          caption="Worst Cold Streak"
          value={longestColdStreak}
          color="var(--sp-cold-streak)"
          footer={
            <span className="text-[11px] font-medium text-muted text-center">Keep this one low!</span>
          }
        />
      </div>

      {/* Match timeline — web-only, and worth keeping: the extra width is what a
          per-match history needs, and the app has nowhere to put it. */}
      <div className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default overflow-hidden">
        <div className="flex items-baseline justify-between px-4 sm:px-5 pt-3 pb-2">
          <h4 className="t-card-title text-ink">Match Timeline</h4>
          <span className="t-num text-xs text-muted">{timeline.length} matches</span>
        </div>
        <div className="px-4 sm:px-5 pb-4">
          <div className="overflow-x-auto pb-2">
            <div className="flex items-center gap-1 min-w-max">
              {timeline.map((entry, idx) => (
                <span
                  key={idx}
                  className={`w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-pill transition-transform hover:scale-125 ${getFormDotClass(entry.type)}`}
                  title={`Match #${entry.matchNumber}: ${entry.type}`}
                />
              ))}
            </div>
          </div>

          {/* Driven by the shared legend so the key cannot disagree with the dots.
              The copy that was here had its own mapping — exact on green, winner on
              amber — which matched neither the app nor the leaderboard. */}
          <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-border-subtle">
            {FORM_LEGEND.filter(([type]) => type !== 'no_pick').map(([type, label]) => (
              <div key={type} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-pill ${getFormDotClass(type)}`} />
                <span className="text-xs text-muted">{label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
