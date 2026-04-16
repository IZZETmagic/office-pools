import { createAdminClient } from '@/lib/supabase/server'

export type LeaderboardPlayer = {
  rank: number
  name: string
  points: number
  move: number
  exact: number
  correct: number
  bonus: number
  form: ('exact' | 'winner_gd' | 'winner' | 'miss')[]
}

// Mock leaderboard data for pre-tournament display
const MOCK_PLAYERS: LeaderboardPlayer[] = [
  { rank: 1,  name: 'Player_1',     exact: 14, correct: 19, bonus: 200, points: 348, move: 0,  form: ['exact', 'winner_gd', 'miss', 'exact', 'winner'] },
  { rank: 2,  name: 'Player_2',     exact: 12, correct: 18, bonus: 150, points: 312, move: 2,  form: ['winner', 'exact', 'winner_gd', 'exact', 'winner'] },
  { rank: 3,  name: 'Player_3',     exact: 11, correct: 17, bonus: 125, points: 289, move: -1, form: ['miss', 'exact', 'winner', 'winner_gd', 'exact'] },
  { rank: 4,  name: 'Player_4',     exact: 10, correct: 16, bonus: 100, points: 261, move: 3,  form: ['exact', 'winner_gd', 'winner', 'exact', 'miss'] },
  { rank: 5,  name: 'Player_5',     exact: 9,  correct: 18, bonus: 75,  points: 247, move: 0,  form: ['winner', 'miss', 'exact', 'winner', 'winner_gd'] },
  { rank: 6,  name: 'Player_6',     exact: 8,  correct: 17, bonus: 75,  points: 231, move: -2, form: ['miss', 'winner', 'winner_gd', 'miss', 'winner'] },
  { rank: 7,  name: 'Player_7',     exact: 9,  correct: 14, bonus: 50,  points: 218, move: 1,  form: ['exact', 'miss', 'winner', 'exact', 'winner'] },
  { rank: 8,  name: 'Player_8',     exact: 7,  correct: 16, bonus: 75,  points: 205, move: 4,  form: ['exact', 'exact', 'winner_gd', 'winner', 'exact'] },
  { rank: 9,  name: 'Player_9',     exact: 7,  correct: 15, bonus: 50,  points: 193, move: 0,  form: ['winner_gd', 'winner', 'miss', 'exact', 'miss'] },
  { rank: 10, name: 'Player_10',    exact: 6,  correct: 16, bonus: 50,  points: 184, move: -1, form: ['miss', 'winner', 'miss', 'winner_gd', 'winner'] },
]

export async function getLeaderboardForPool(poolId: string): Promise<{ players: LeaderboardPlayer[]; memberCount: number; isMock: boolean }> {
  const supabase = createAdminClient()

  const { data: members } = await supabase
    .from('pool_members')
    .select(`
      user_id,
      users!inner(username, full_name),
      pool_entries(
        entry_name,
        total_points,
        current_rank,
        previous_rank
      )
    `)
    .eq('pool_id', poolId)

  const entriesWithPoints = (members || []).flatMap((m: any) => m.pool_entries || []).filter((e: any) => (e.total_points ?? 0) > 0)

  if (entriesWithPoints.length < 3) {
    return { players: MOCK_PLAYERS, memberCount: Math.max(MOCK_PLAYERS.length, members?.length || 0), isMock: true }
  }

  const entries: LeaderboardPlayer[] = []

  for (const member of members!) {
    const memberEntries = (member as any).pool_entries || []
    for (const entry of memberEntries) {
      const currentRank = entry.current_rank ?? 999
      const previousRank = entry.previous_rank ?? currentRank
      entries.push({
        rank: currentRank,
        name: entry.entry_name || (member as any).users?.username || 'Unknown',
        points: entry.total_points ?? 0,
        move: previousRank - currentRank,
        exact: 0,
        correct: 0,
        bonus: 0,
        form: [],
      })
    }
  }

  entries.sort((a, b) => a.rank - b.rank)

  return { players: entries, memberCount: members!.length, isMock: false }
}
