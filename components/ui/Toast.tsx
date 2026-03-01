'use client'

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'

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

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const [isExiting, setIsExiting] = useState(false)
  const [swipeX, setSwipeX] = useState(0)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const itemRef = useRef<HTMLDivElement>(null)

  const variantStyles: Record<ToastVariant, string> = {
    success: 'bg-success-600 dark:bg-success-700 text-white',
    error: 'bg-danger-600 dark:bg-danger-700 text-white',
    warning: 'bg-warning-700 dark:bg-warning-600 text-white',
    info: 'bg-neutral-800 dark:bg-neutral-700 text-white',
  }

  const variantIcons: Record<ToastVariant, string> = {
    success: '\u2713',
    error: '\u2717',
    warning: '\u26A0',
    info: '\u2139',
  }

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
      className={`flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm font-medium w-full max-w-sm ${variantStyles[toast.variant]} ${isExiting ? 'toast-exit' : 'toast-enter'}`}
      style={{
        transform: swipeX !== 0 ? `translateX(${swipeX}px)` : undefined,
        opacity: swipeX !== 0 ? Math.max(0, 1 - Math.abs(swipeX) / 150) : undefined,
        transition: swipeX !== 0 ? 'none' : undefined,
      }}
      role="alert"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <span className="text-base shrink-0">{variantIcons[toast.variant]}</span>
      <span className="flex-1 leading-snug">{toast.message}</span>
      <button
        onClick={handleDismiss}
        className="shrink-0 opacity-70 hover:opacity-100 text-lg leading-none p-1 -mr-1 rounded-md transition-opacity"
        aria-label="Dismiss"
      >
        &times;
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
