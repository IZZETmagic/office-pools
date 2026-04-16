import { getLeaderboard } from './getLeaderboard'
import SargassoSeaLandingPage from './LandingClient'

// Revalidate every 60 seconds for live leaderboard data
export const revalidate = 60

export default async function SargassoSeaPage() {
  const { players, memberCount, isMock } = await getLeaderboard()

  return <SargassoSeaLandingPage players={players} memberCount={memberCount} isMock={isMock} />
}
