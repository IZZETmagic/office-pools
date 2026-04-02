'use client'

import { useEffect, useCallback, type ReactNode } from 'react'

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
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div
        className={`relative bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl ${SIZE_CLASSES[size]} w-full max-h-[85vh] flex flex-col dark:shadow-none dark:border dark:border-border-default animate-modal-slide-up ${className ?? ''}`}
      >
        {/* Header — rendered when a title string is provided */}
        {title && (
          <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-neutral-100 dark:border-border-default shrink-0">
            <h2
              id={ariaId}
              className="text-lg font-bold text-neutral-900 dark:text-neutral-100"
            >
              {title}
            </h2>
            <button
              onClick={onClose}
              className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-xl transition-colors"
              aria-label="Close"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        )}

        {children}
      </div>
    </div>
  )
}
