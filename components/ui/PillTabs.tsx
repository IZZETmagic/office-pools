'use client'

import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils/cn'
import { Icon } from './Icon'

/**
 * The app's tab strip (mobile/components/pool-detail/PoolTabBar.tsx): a horizontally
 * scrolling row of pills, not underlined tabs. Inactive pills are `mist` with muted
 * text; the active pill is its accent at 12% with the accent as the label colour.
 *
 * The active pill scrolls itself into view, as it does in RN — with many tabs the
 * selected one is otherwise frequently off-screen after a change.
 */
export type PillTab = {
  id: string
  label: string
  /** SF-Symbol-style name, as understood by components/ui/Icon.tsx. */
  icon?: string
  /** Shows a small dot on the pill, for unread/attention state. */
  dot?: boolean
}

type PillTabsProps = {
  tabs: PillTab[]
  activeId: string
  onChange: (id: string) => void
  /**
   * CSS colour for the active pill. Branded pools pass their brand accent; the
   * default is the brand blue.
   */
  accentColor?: string
  className?: string
  'aria-label'?: string
}

export function PillTabs({
  tabs,
  activeId,
  onChange,
  accentColor,
  className,
  'aria-label': ariaLabel = 'Sections',
}: PillTabsProps) {
  const stripRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const strip = stripRef.current
    const pill = activeRef.current
    if (!strip || !pill) return

    // Centre the active pill without scrolling the page — scrollIntoView would.
    const target = pill.offsetLeft - strip.clientWidth / 2 + pill.clientWidth / 2
    strip.scrollTo({ left: Math.max(0, target), behavior: 'smooth' })
  }, [activeId])

  return (
    <div
      ref={stripRef}
      role="tablist"
      aria-label={ariaLabel}
      className={cn('flex gap-2 overflow-x-auto scrollbar-hide px-6 py-2', className)}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId
        return (
          <button
            key={tab.id}
            ref={isActive ? activeRef : undefined}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              'relative shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-pill',
              'text-[13px] font-bold whitespace-nowrap transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40',
              !isActive && 'bg-mist text-muted hover:text-ink',
            )}
            // The active pill is the accent composited at 12% over the page. Inline
            // because the colour can come from a pool's brand at runtime.
            style={
              isActive
                ? {
                    color: accentColor ?? 'var(--primary-600)',
                    backgroundColor: `color-mix(in srgb, ${accentColor ?? 'var(--primary-600)'} 12%, transparent)`,
                  }
                : undefined
            }
          >
            {tab.icon ? <Icon name={tab.icon} size={13} weight="bold" /> : null}
            {tab.label}
            {tab.dot ? (
              <span className="absolute -top-0.5 -right-1 h-2 w-2 rounded-pill bg-danger-600 ring-2 ring-surface" />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
