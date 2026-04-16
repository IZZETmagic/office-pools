import { getLeaderboard } from '@/app/play/sargasso-sea/getLeaderboard'
import { POOL_CONFIG } from '@/app/play/sargasso-sea/poolConfig'
import { TVLeaderboardClient } from './TVLeaderboardClient'

// Refresh every 30 seconds for live updates
export const revalidate = 30

export default async function SargassoSeaTVPage() {
  const { players, memberCount, isMock } = await getLeaderboard()

  return (
    <TVLeaderboardClient
      players={players}
      memberCount={memberCount}
      poolConfig={POOL_CONFIG}
      isMock={isMock}
    />
  )
}
