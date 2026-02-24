'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

type Theme = 'new' | 'classic'
type ColorMode = 'light' | 'dark' | 'system'

type ThemeContextType = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  colorMode: ColorMode
  setColorMode: (mode: ColorMode) => void
  resolvedColorMode: 'light' | 'dark'
}

const ThemeContext = createContext<ThemeContextType | null>(null)

const PALETTE_KEY = 'sport-pool-theme'
const COLOR_MODE_KEY = 'sport-pool-color-mode'

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
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
  const [theme, setThemeState] = useState<Theme>('new')
  const [colorMode, setColorModeState] = useState<ColorMode>('system')
  const [resolvedColorMode, setResolvedColorMode] = useState<'light' | 'dark'>('light')

  // Initialize from localStorage on mount
  useEffect(() => {
    const storedPalette = localStorage.getItem(PALETTE_KEY) as Theme | null
    if (storedPalette === 'classic' || storedPalette === 'new') {
      setThemeState(storedPalette)
      document.documentElement.classList.toggle('theme-classic', storedPalette === 'classic')
    }

    const storedMode = localStorage.getItem(COLOR_MODE_KEY) as ColorMode | null
    const mode = storedMode === 'light' || storedMode === 'dark' || storedMode === 'system'
      ? storedMode
      : 'system'
    setColorModeState(mode)
    setResolvedColorMode(applyColorMode(mode))
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

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    localStorage.setItem(PALETTE_KEY, newTheme)
    document.documentElement.classList.toggle('theme-classic', newTheme === 'classic')
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'new' ? 'classic' : 'new')
  }, [theme, setTheme])

  const setColorMode = useCallback((mode: ColorMode) => {
    setColorModeState(mode)
    localStorage.setItem(COLOR_MODE_KEY, mode)
    setResolvedColorMode(applyColorMode(mode))
  }, [])

  return (
    <ThemeContext value={{ theme, setTheme, toggleTheme, colorMode, setColorMode, resolvedColorMode }}>
      {children}
    </ThemeContext>
  )
}
