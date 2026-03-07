'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

export function useSlideIndicator<T extends string>(activeKey: T) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<{ left: number; width: number }>({ left: 0, width: 0 })
  const [ready, setReady] = useState(false)

  const updateIndicator = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const activeEl = container.querySelector(`[data-tab-key="${activeKey}"]`) as HTMLElement
    if (!activeEl) return
    setStyle({ left: activeEl.offsetLeft, width: activeEl.offsetWidth })
    if (!ready) setReady(true)
  }, [activeKey, ready])

  useEffect(() => {
    updateIndicator()
  }, [updateIndicator])

  // Recalculate on resize
  useEffect(() => {
    const handleResize = () => updateIndicator()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [updateIndicator])

  return { containerRef, indicatorStyle: style, ready }
}
