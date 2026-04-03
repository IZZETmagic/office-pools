import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'TV Leaderboard | Sport Pool',
}

export default function TVLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
