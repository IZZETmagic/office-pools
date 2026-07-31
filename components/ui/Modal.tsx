'use client'

import { useEffect, useCallback, type ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'
import { Icon } from './Icon'

type ModalSize = 'sm' | 'md' | 'lg' | 'full'

type ModalProps = {
  isOpen: boolean
  onClose: () => void
  title?: string
  /** Override the default title id for aria-labelledby */
  titleId?: string
  size?: ModalSize
  /** Additional classes on the content panel */
  className?: string
  children: ReactNode
}

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  full: 'sm:max-w-4xl',
}

export function Modal({
  isOpen,
  onClose,
  title,
  titleId,
  size = 'md',
  className,
  children,
}: ModalProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  useEffect(() => {
    if (!isOpen) return
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, handleKeyDown])

  if (!isOpen) return null

  const ariaId = titleId ?? (title ? 'modal-title' : undefined)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center animate-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby={ariaId}
    >
      {/* RN uses rgba(0,0,0,0.4–0.45) behind both sheets and dialogs. */}
      <div className="fixed inset-0 bg-black/45" onClick={onClose} />
      <div
        className={cn(
          // Bottom sheet on mobile with the app's 32px top corners; centred dialog
          // with a 24px card radius from sm up.
          // `overflow-hidden` is load-bearing, not tidiness: any child that paints
          // its own background — a filled header, a first section card — squares
          // off these corners otherwise, and the consumer has no reason to suspect
          // the modal. Clipping here makes the radius hold for every caller.
          'relative bg-surface rounded-t-sheet sm:rounded-card shadow-card-elevated overflow-hidden',
          SIZE_CLASSES[size],
          'w-full max-h-[85vh] flex flex-col dark:shadow-none dark:border dark:border-border-default animate-modal-slide-up',
          className,
        )}
      >
        {/* Grabber — sheet affordance on mobile only, as in the app's sheets. */}
        <div className="sm:hidden shrink-0 flex justify-center pt-2.5 pb-1">
          <div className="h-1 w-9 rounded-full bg-silver/60" />
        </div>

        {/* Header — rendered when a title string is provided */}
        {title && (
          <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-border-subtle shrink-0">
            <h2 id={ariaId} className="t-card-title text-ink">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 -mr-1.5 text-muted hover:text-ink hover:bg-mist rounded-pill transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40"
              aria-label="Close"
            >
              <Icon name="xmark" size={18} weight="semibold" />
            </button>
          </div>
        )}

        {children}
      </div>
    </div>
  )
}
