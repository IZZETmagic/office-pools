'use client'

import { useState, useEffect } from 'react'

/**
 * Detects if the app is running in PWA standalone mode
 * (i.e. added to home screen). Returns false in regular browser.
 */
export function useStandaloneMode() {
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true

    setIsStandalone(standalone)
  }, [])

  return isStandalone
}
