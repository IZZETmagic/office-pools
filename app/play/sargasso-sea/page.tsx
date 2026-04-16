import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getLeaderboardForPool } from '@/app/play/[slug]/getLeaderboard'
import BrandedLandingClient from '@/app/play/[slug]/BrandedLandingClient'
import { POOL_CONFIG } from './poolConfig'

// Revalidate every 60 seconds for live leaderboard data
export const revalidate = 60

// This static route takes precedence over /play/[slug] for the sargasso-sea slug.
// It uses the shared dynamic landing page components but with the known pool config
// as fallback until the pool has brand_slug set in the database.
export default async function SargassoSeaPage() {
  const supabase = createAdminClient()

  // Try DB-driven approach first (if brand_slug is set)
  const { data: pool } = await supabase
    .from('pools')
    .select('*, pool_members(count)')
    .eq('pool_id', POOL_CONFIG.poolId)
    .single()

  const memberCount = pool?.pool_members?.[0]?.count ?? POOL_CONFIG.memberCount
  const primaryColor = pool?.brand_color || POOL_CONFIG.primaryColor
  const accentColor = pool?.brand_accent || POOL_CONFIG.accentColor

  function darken(hex: string, amount: number): string {
    const num = parseInt(hex.replace('#', ''), 16)
    const r = Math.max(0, (num >> 16) - amount)
    const g = Math.max(0, ((num >> 8) & 0x00ff) - amount)
    const b = Math.max(0, (num & 0x0000ff) - amount)
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
  }

  function lighten(hex: string, amount: number): string {
    const num = parseInt(hex.replace('#', ''), 16)
    const r = Math.min(255, (num >> 16) + amount)
    const g = Math.min(255, ((num >> 8) & 0x00ff) + amount)
    const b = Math.min(255, (num & 0x0000ff) + amount)
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
  }

  const poolConfig = {
    name: pool?.pool_name || POOL_CONFIG.name,
    brandName: pool?.brand_name || POOL_CONFIG.brandName,
    poolCode: pool?.pool_code || POOL_CONFIG.poolCode,
    poolId: POOL_CONFIG.poolId,
    slug: 'sargasso-sea',
    logoUrl: pool?.brand_logo_url || POOL_CONFIG.logoUrl,
    tagline: POOL_CONFIG.tagline,
    primaryColor,
    primaryGradient: `linear-gradient(135deg, ${primaryColor} 0%, ${darken(primaryColor, 20)} 40%, ${darken(primaryColor, 60)} 100%)`,
    accentColor,
    accentColorLight: lighten(accentColor, 80),
    memberCount,
    mode: POOL_CONFIG.mode,
    brandEmoji: pool?.brand_emoji || null,
    status: pool?.status || POOL_CONFIG.status,
    prizes: POOL_CONFIG.prizes,
  }

  const { players, memberCount: leaderboardCount, isMock } = await getLeaderboardForPool(POOL_CONFIG.poolId)

  return (
    <BrandedLandingClient
      poolConfig={poolConfig}
      players={players}
      memberCount={leaderboardCount}
      isMock={isMock}
    />
  )
}
