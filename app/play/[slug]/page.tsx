import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getLeaderboardForPool } from './getLeaderboard'
import BrandedLandingClient from './BrandedLandingClient'

export const revalidate = 60

export default async function BrandedLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = createAdminClient()

  const { data: pool } = await supabase
    .from('pools')
    .select('*, pool_members(count)')
    .eq('brand_slug', slug)
    .single()

  if (!pool) notFound()

  const memberCount = pool.pool_members?.[0]?.count ?? 0
  const primaryColor = pool.brand_color || '#1E3A8A'
  const accentColor = pool.brand_accent || '#FFC300'

  // Derive gradient from primary color
  function darken(hex: string, amount: number): string {
    const num = parseInt(hex.replace('#', ''), 16)
    const r = Math.max(0, (num >> 16) - amount)
    const g = Math.max(0, ((num >> 8) & 0x00ff) - amount)
    const b = Math.max(0, (num & 0x0000ff) - amount)
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
  }

  // Lighten a hex color
  function lighten(hex: string, amount: number): string {
    const num = parseInt(hex.replace('#', ''), 16)
    const r = Math.min(255, (num >> 16) + amount)
    const g = Math.min(255, ((num >> 8) & 0x00ff) + amount)
    const b = Math.min(255, (num & 0x0000ff) + amount)
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
  }

  const poolConfig = {
    name: pool.pool_name,
    brandName: pool.brand_name || pool.pool_name,
    poolCode: pool.pool_code,
    poolId: pool.pool_id,
    slug,
    logoUrl: pool.brand_logo_url || '',
    tagline: 'Predict. Compete. Win.',
    primaryColor,
    primaryGradient: `linear-gradient(135deg, ${primaryColor} 0%, ${darken(primaryColor, 20)} 40%, ${darken(primaryColor, 60)} 100%)`,
    accentColor,
    accentColorLight: lighten(accentColor, 80),
    memberCount,
    mode: pool.prediction_mode === 'progressive' ? 'Progressive' : pool.prediction_mode === 'bracket_picker' ? 'Bracket Picker' : 'Full Tournament',
    brandEmoji: pool.brand_emoji || null,
    status: pool.status,
    prizes: [
      { place: '1st Place', prize: 'TBD', icon: '\u{1F3C6}', color: 'from-amber-500 to-amber-600', border: 'border-amber-200' },
      { place: '2nd Place', prize: 'TBD', icon: '\u{1F948}', color: 'from-neutral-400 to-neutral-500', border: 'border-neutral-200' },
      { place: '3rd Place', prize: 'TBD', icon: '\u{1F949}', color: 'from-amber-700 to-amber-800', border: 'border-amber-200/50' },
    ],
  }

  const { players, memberCount: leaderboardCount, isMock } = await getLeaderboardForPool(pool.pool_id)

  return (
    <BrandedLandingClient
      poolConfig={poolConfig}
      players={players}
      memberCount={leaderboardCount}
      isMock={isMock}
    />
  )
}
