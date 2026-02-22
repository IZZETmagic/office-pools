'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'

type Theme = 'new' | 'classic'

type ThemeContextType = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | null>(null)

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('new')

  // Initialize from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('sport-pool-theme') as Theme | null
    if (stored === 'classic' || stored === 'new') {
      setThemeState(stored)
      document.documentElement.classList.toggle('theme-classic', stored === 'classic')
    }
  }, [])

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    localStorage.setItem('sport-pool-theme', newTheme)
    document.documentElement.classList.toggle('theme-classic', newTheme === 'classic')
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'new' ? 'classic' : 'new')
  }, [theme, setTheme])

  return (
    <ThemeContext value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext>
  )
}
