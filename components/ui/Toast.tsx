'use client'

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils/cn'
import { Icon } from './Icon'

type ToastVariant = 'success' | 'error' | 'warning' | 'info'

type Toast = {
  id: string
  message: string
  variant: ToastVariant
  duration: number
}

type ToastContextType = {
  showToast: (message: string, variant?: ToastVariant, options?: { duration?: number }) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}

/**
 * A toast is a floating CARD, not a coloured slab.
 *
 * It used to be a saturated fill with white copy — `bg-success-600` green for a
 * save, red for a failure. That is the pre-redesign shape: it puts a block of
 * colour on screen that belongs to no surface in the app, and at the size a
 * toast occupies it is the loudest thing on the page for four seconds. The
 * green in particular no longer means anything here (2026-08-29, Ryan): green
 * survives in the product as a RESULT colour — a correct pick, a rising rank —
 * so spending it on "Settings saved." makes an admin confirmation shout in the
 * same voice as a scoring event.
 *
 * So the panel is `surface` + `ink`, exactly like Card, and the variant lives
 * entirely in the leading icon. Success is the brand blue: on this product a
 * confirmation is the brand acting, not a positive outcome.
 *
 * ICON COLOUR IS MEASURED, NOT CHOSEN. An icon is non-text content, so the bar
 * is 3:1 against the surface behind it. Composited on `--surface` (#FFFFFF /
 * #1C2030), which is the toast's own background rather than the page:
 *
 *              light     dark
 *   success     4.32     5.02     primary-600
 *   error       3.76     5.85     danger-600
 *   warning     3.19    10.85     warning-600
 *   info        3.58     5.56     muted (slate)
 *
 * Because the ramp inverts, one class covers both modes and no `dark:` override
 * is needed. Do not move warning to the 500 step to make it more yellow: amber
 * is the palest tone in the set and 500 measures 2.15:1 in light mode, a fail.
 * The message itself is `ink` — 15.43:1 light, 13.44:1 dark. Fill does not move
 * these numbers: they are colour against surface, not coverage.
 *
 * The glyphs are the Hugeicons Pro solid-rounded set, opted into with `solid`
 * (SOLID_ICON_MAP in components/ui/Icon.tsx). A stroke outline at 18px reads as
 * decoration; here the icon is the only thing saying which variant this is, so
 * it has to read as a state.
 */
const variantIconClass: Record<ToastVariant, string> = {
  success: 'text-primary-600',
  error: 'text-danger-600',
  warning: 'text-warning-600',
  info: 'text-muted',
}

const variantIcon = {
  success: 'checkmark.circle.fill',
  error: 'exclamationmark.circle.fill',
  warning: 'exclamationmark.triangle.fill',
  info: 'info.circle.fill',
} as const

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [isExiting, setIsExiting] = useState(false)
  const [swipeX, setSwipeX] = useState(0)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const itemRef = useRef<HTMLDivElement>(null)

  function handleDismiss() {
    setIsExiting(true)
    setTimeout(() => onDismiss(toast.id), 300)
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!touchStartRef.current) return
    const deltaX = e.touches[0].clientX - touchStartRef.current.x
    setSwipeX(deltaX)
  }

  function handleTouchEnd() {
    if (Math.abs(swipeX) > 80) {
      handleDismiss()
    } else {
      setSwipeX(0)
    }
    touchStartRef.current = null
  }

  return (
    <div
      ref={itemRef}
      className={cn(
        'flex items-center gap-2.5 w-full max-w-sm px-4 py-3 rounded-card',
        'bg-surface text-ink text-sm font-medium',
        // Card drops its border in light mode and lets the shadow do the work,
        // but a card sits ON the snow page and a toast floats over whatever
        // happens to be under it — including another white card. The hairline
        // is what keeps the edge legible in that case. Dark mode swaps the
        // shadow out, as Card does: shadows read as smears on a dark surface.
        'border border-border-default shadow-card-elevated dark:shadow-none',
        isExiting ? 'toast-exit' : 'toast-enter',
      )}
      style={{
        transform: swipeX !== 0 ? `translateX(${swipeX}px)` : undefined,
        opacity: swipeX !== 0 ? Math.max(0, 1 - Math.abs(swipeX) / 150) : undefined,
        transition: swipeX !== 0 ? 'none' : undefined,
      }}
      // Matches Alert: only the two variants a member has to act on interrupt a
      // screen reader mid-sentence. A save confirmation is announced politely.
      role={toast.variant === 'error' || toast.variant === 'warning' ? 'alert' : 'status'}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <Icon
        name={variantIcon[toast.variant]}
        size={18}
        solid
        className={cn('shrink-0', variantIconClass[toast.variant])}
      />
      <span className="flex-1 leading-snug">{toast.message}</span>
      <button
        onClick={handleDismiss}
        className="shrink-0 text-muted hover:text-ink p-1 -mr-1 rounded-inset transition-colors"
        aria-label="Dismiss"
      >
        {/* Stroke, not solid: the close is an affordance, not a state, and a
            filled x beside a filled status glyph reads as two competing marks. */}
        <Icon name="xmark" size={14} weight="semibold" />
      </button>
    </div>
  )
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
    const timer = timersRef.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timersRef.current.delete(id)
    }
  }, [])

  const showToast = useCallback((message: string, variant: ToastVariant = 'info', options?: { duration?: number }) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const duration = options?.duration ?? 4000

    setToasts(prev => [...prev.slice(-4), { id, message, variant, duration }])

    const timer = setTimeout(() => removeToast(id), duration)
    timersRef.current.set(id, timer)
  }, [removeToast])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      timersRef.current.forEach(timer => clearTimeout(timer))
    }
  }, [])

  return (
    <ToastContext value={{ showToast }}>
      {children}

      {/* Toast container — fixed top center */}
      {toasts.length > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none">
          {toasts.map(toast => (
            <div key={toast.id} className="pointer-events-auto w-full">
              <ToastItem toast={toast} onDismiss={removeToast} />
            </div>
          ))}
        </div>
      )}
    </ToastContext>
  )
}
