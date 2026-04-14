'use client'

import { type ReactNode, useRef, useState, useEffect, useCallback } from 'react'

/* =============================================
   SP TABLE — Super Admin design-token table

   Swiss-minimalist table built on SP design tokens.
   Rounded card container, soft headers, clean rows.

   Colors (from iOS Color.sp — light mode):
     surface  #FFFFFF   card/row background
     snow     #F7F8FC   hover state
     mist     #EEF1F8   header bg, row dividers
     silver   #D4DAE8   card border
     slate    #7B87A8   secondary text, headers
     ink      #1B2340   primary text
   ============================================= */

// ---- Color constants (SP tokens, light mode) ----

export const SP = {
  surface:  'var(--sp-surface)',
  snow:     'var(--sp-snow)',
  mist:     'var(--sp-mist)',
  silver:   'var(--sp-silver)',
  slate:    'var(--sp-slate)',
  ink:      'var(--sp-ink)',
  midnight: 'var(--sp-midnight)',
  primary:  'var(--sp-primary)',
  accent:   'var(--sp-accent)',
  green:    'var(--sp-green)',
  red:      'var(--sp-red)',
  amber:    'var(--sp-amber)',
} as const

// ---- Column definition ----

export type SpColumn<T> = {
  key: string
  header: string
  align?: 'left' | 'center' | 'right'
  sticky?: boolean
  render: (row: T, index: number) => ReactNode
}

// ---- Props ----

type SpTableProps<T> = {
  columns: SpColumn<T>[]
  data: T[]
  keyFn: (row: T) => string
  emptyMessage?: string
  /** Optional className for highlighting specific rows */
  rowClassName?: (row: T) => string
}

// ---- Component ----

export function SpTable<T>({
  columns,
  data,
  keyFn,
  emptyMessage = 'No results found.',
  rowClassName,
}: SpTableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const hasSticky = columns.some((c) => c.sticky)

  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      setScrolled(containerRef.current.scrollLeft > 0)
    }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el || !hasSticky) return
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [handleScroll, hasSticky])

  const alignClass = (align?: 'left' | 'center' | 'right') => {
    if (align === 'center') return 'text-center'
    if (align === 'right') return 'text-right'
    return 'text-left'
  }

  const stickyStyle = scrolled
    ? { boxShadow: '4px 0 8px -2px rgba(0, 0, 0, 0.08)' }
    : {}

  return (
    <div
      ref={containerRef}
      className="sp-card overflow-x-auto overscroll-x-contain"
      style={{
        borderRadius: 24,
        border: `0.5px solid ${SP.silver}80`,
        backgroundColor: SP.surface,
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
      }}
    >
      <table className="w-full">
        <thead>
          <tr style={{ backgroundColor: SP.snow }}>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`sp-label px-5 py-3.5 whitespace-nowrap ${alignClass(col.align)} ${col.sticky ? 'sticky left-0 z-10' : ''}`}
                style={{ color: SP.slate, ...(col.sticky ? { backgroundColor: SP.snow, ...stickyStyle } : {}) }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-5 py-10 text-center sp-body"
                style={{ color: SP.slate }}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr
                key={keyFn(row)}
                className={`transition-colors ${rowClassName?.(row) ?? ''}`}
                style={{
                  backgroundColor: SP.surface,
                  borderBottom: i < data.length - 1 ? `0.5px solid ${SP.silver}66` : undefined,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = SP.snow
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = SP.surface
                }}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-5 py-4 sp-body whitespace-nowrap ${alignClass(col.align)} ${col.sticky ? 'sticky left-0 z-10' : ''}`}
                    style={{ color: SP.ink, fontSize: 14, ...(col.sticky ? { backgroundColor: 'inherit', ...stickyStyle } : {}) }}
                  >
                    {col.render(row, i)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
