'use client'

import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { usePathname } from 'next/navigation'
import { useStandaloneMode } from '@/hooks/useStandaloneMode'

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Home' },
  { href: '/pools', label: 'Pools' },
  { href: '/profile', label: 'Profile' },
] as const

const HIDDEN_PATHS = ['/login', '/signup', '/forgot-password', '/reset-password']

export function BottomNav() {
  const pathname = usePathname()
  const isStandalone = useStandaloneMode()

  // Only render in PWA standalone mode
  if (!isStandalone) return null

  // Hide on auth and onboarding pages
  if (HIDDEN_PATHS.some(p => pathname.startsWith(p))) return null

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    if (href === '/pools') return pathname.startsWith('/pools')
    if (href === '/profile') return pathname.startsWith('/profile')
    return pathname.startsWith(href)
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-surface border-t border-neutral-200 dark:border-border-default pb-[env(safe-area-inset-bottom)] sm:hidden [transform:translateZ(0)]">
      <div className="flex items-center justify-around h-14">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 w-full h-full transition-colors ${
                active
                  ? 'text-primary-800'
                  : 'text-neutral-400 dark:text-neutral-500'
              }`}
            >
              <NavIcon href={item.href} active={active} />
              <span className={`text-[10px] ${active ? 'font-semibold' : 'font-medium'}`}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

function NavIcon({ href, active }: { href: string; active: boolean }) {
  const cls = "w-6 h-6"

  if (href === '/dashboard') {
    return active ? (
      // Filled home
      <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 11-1.06 1.06l-.97-.97V19.5a1.5 1.5 0 01-1.5 1.5h-3a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-1.5a.75.75 0 00-.75.75v4.5a.75.75 0 01-.75.75h-3a1.5 1.5 0 01-1.5-1.5v-6.88l-.97.97a.75.75 0 01-1.06-1.06l8.69-8.69z" />
      </svg>
    ) : (
      // Outline home
      <Icon name="house.fill" />
    )
  }

  if (href === '/pools') {
    return active ? (
      // Filled grid
      <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M3 6a3 3 0 013-3h2.25a3 3 0 013 3v2.25a3 3 0 01-3 3H6a3 3 0 01-3-3V6zm9.75 0a3 3 0 013-3H18a3 3 0 013 3v2.25a3 3 0 01-3 3h-2.25a3 3 0 01-3-3V6zM3 15.75a3 3 0 013-3h2.25a3 3 0 013 3V18a3 3 0 01-3 3H6a3 3 0 01-3-3v-2.25zm9.75 0a3 3 0 013-3H18a3 3 0 013 3V18a3 3 0 01-3 3h-2.25a3 3 0 01-3-3v-2.25z" clipRule="evenodd" />
      </svg>
    ) : (
      // Outline grid
      <Icon name="square.grid.2x2" />
    )
  }

  if (href === '/profile') {
    return active ? (
      // Filled user
      <svg className={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
      </svg>
    ) : (
      // Outline user
      <Icon name="person.crop.circle" />
    )
  }

  return null
}
