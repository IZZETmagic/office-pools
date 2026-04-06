import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Demo Pool',
  description: 'Try Sport Pool with a live demo. See how predictions, leaderboards, and scoring work for the FIFA World Cup 2026.',
}

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
