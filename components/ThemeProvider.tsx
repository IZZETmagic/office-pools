'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

/**
 * Light/dark colour mode.
 *
 * This used to also carry an alternate "classic" palette (`html.theme-classic`), which
 * meant every colour token was maintained in four permutations. It was retired with the
 * web redesign: the app has a single palette, so a second web-only one could only drift.
 */
type ColorMode = 'light' | 'dark' | 'system'

type ThemeContextType = {
  colorMode: ColorMode
  setColorMode: (mode: ColorMode) => void
  resolvedColorMode: 'light' | 'dark'
}

const defaultThemeContext: ThemeContextType = {
  colorMode: 'system',
  setColorMode: () => {},
  resolvedColorMode: 'light',
}

const ThemeContext = createContext<ThemeContextType>(defaultThemeContext)

const COLOR_MODE_KEY = 'sport-pool-color-mode'

export function useTheme() {
  return useContext(ThemeContext)
}

function getSystemPreference(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyColorMode(mode: ColorMode): 'light' | 'dark' {
  const resolved = mode === 'system' ? getSystemPreference() : mode
  document.documentElement.classList.toggle('dark', resolved === 'dark')
  return resolved
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [colorMode, setColorModeState] = useState<ColorMode>('system')
  const [resolvedColorMode, setResolvedColorMode] = useState<'light' | 'dark'>('light')

  // Initialize from localStorage on mount
  useEffect(() => {
    const storedMode = localStorage.getItem(COLOR_MODE_KEY) as ColorMode | null
    const mode = storedMode === 'light' || storedMode === 'dark' || storedMode === 'system'
      ? storedMode
      : 'system'
    setColorModeState(mode)
    setResolvedColorMode(applyColorMode(mode))

    // One-time cleanup for anyone still carrying the retired palette preference.
    localStorage.removeItem('sport-pool-theme')
    document.documentElement.classList.remove('theme-classic')
  }, [])

  // Listen for system preference changes when mode is 'system'
  useEffect(() => {
    if (colorMode !== 'system') return

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      setResolvedColorMode(applyColorMode('system'))
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [colorMode])

  const setColorMode = useCallback((mode: ColorMode) => {
    setColorModeState(mode)
    localStorage.setItem(COLOR_MODE_KEY, mode)
    setResolvedColorMode(applyColorMode(mode))
  }, [])

  return (
    <ThemeContext value={{ colorMode, setColorMode, resolvedColorMode }}>
      {children}
    </ThemeContext>
  )
}
