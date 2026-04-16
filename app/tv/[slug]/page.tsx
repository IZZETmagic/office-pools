import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/server'
import { getLeaderboardForPool } from '@/app/play/[slug]/getLeaderboard'
import { TVLeaderboardClient } from './TVLeaderboardClient'

export const revalidate = 30

export default async function BrandedTVPage({
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

  const poolConfig = {
    name: pool.pool_name,
    brandName: pool.brand_name || pool.pool_name,
    logoUrl: pool.brand_logo_url || '',
    primaryColor: pool.brand_color || '#1E3A8A',
    accentColor: pool.brand_accent || '#FFC300',
    memberCount,
    mode: pool.prediction_mode === 'progressive' ? 'Progressive' : pool.prediction_mode === 'bracket_picker' ? 'Bracket Picker' : 'Full Tournament',
    slug,
  }

  const { players, memberCount: leaderboardCount, isMock } = await getLeaderboardForPool(pool.pool_id)

  return (
    <TVLeaderboardClient
      players={players}
      memberCount={leaderboardCount}
      poolConfig={poolConfig}
      isMock={isMock}
    />
  )
}
