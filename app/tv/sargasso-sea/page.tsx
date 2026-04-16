import { getLeaderboardForPool } from '@/app/play/[slug]/getLeaderboard'
import { TVLeaderboardClient } from '@/app/tv/[slug]/TVLeaderboardClient'
import { POOL_CONFIG } from '@/app/play/sargasso-sea/poolConfig'

// Refresh every 30 seconds for live updates
export const revalidate = 30

export default async function SargassoSeaTVPage() {
  const { players, memberCount, isMock } = await getLeaderboardForPool(POOL_CONFIG.poolId)

  const poolConfig = {
    name: POOL_CONFIG.name,
    brandName: POOL_CONFIG.brandName,
    logoUrl: POOL_CONFIG.logoUrl,
    primaryColor: POOL_CONFIG.primaryColor,
    accentColor: POOL_CONFIG.accentColor,
    memberCount,
    mode: POOL_CONFIG.mode,
    slug: 'sargasso-sea',
  }

  return (
    <TVLeaderboardClient
      players={players}
      memberCount={memberCount}
      poolConfig={poolConfig}
      isMock={isMock}
    />
  )
}
