import { createAdminClient } from '@/lib/supabase/server'
import { POOL_CONFIG } from './poolConfig'

export type LeaderboardPlayer = {
  rank: number
  name: string
  points: number
  move: number // rank change (positive = moved up)
  exact: number
  correct: number
  bonus: number
  form: ('exact' | 'winner_gd' | 'winner' | 'miss')[]
}

// Mock leaderboard data for pre-tournament display
const MOCK_PLAYERS: LeaderboardPlayer[] = [
  { rank: 1,  name: 'OceanKing',       exact: 14, correct: 19, bonus: 200, points: 348, move: 0,  form: ['exact', 'winner_gd', 'miss', 'exact', 'winner'] },
  { rank: 2,  name: 'SargassoStorm',   exact: 12, correct: 18, bonus: 150, points: 312, move: 2,  form: ['winner', 'exact', 'winner_gd', 'exact', 'winner'] },
  { rank: 3,  name: 'DeepCurrents',    exact: 11, correct: 17, bonus: 125, points: 289, move: -1, form: ['miss', 'exact', 'winner', 'winner_gd', 'exact'] },
  { rank: 4,  name: 'TidalWave42',     exact: 10, correct: 16, bonus: 100, points: 261, move: 3,  form: ['exact', 'winner_gd', 'winner', 'exact', 'miss'] },
  { rank: 5,  name: 'CoralReefRay',    exact: 9,  correct: 18, bonus: 75,  points: 247, move: 0,  form: ['winner', 'miss', 'exact', 'winner', 'winner_gd'] },
  { rank: 6,  name: 'AnchorDrop',      exact: 8,  correct: 17, bonus: 75,  points: 231, move: -2, form: ['miss', 'winner', 'winner_gd', 'miss', 'winner'] },
  { rank: 7,  name: 'NauticalNick',    exact: 9,  correct: 14, bonus: 50,  points: 218, move: 1,  form: ['exact', 'miss', 'winner', 'exact', 'winner'] },
  { rank: 8,  name: 'WaveCatcher',     exact: 7,  correct: 16, bonus: 75,  points: 205, move: 4,  form: ['exact', 'exact', 'winner_gd', 'winner', 'exact'] },
  { rank: 9,  name: 'SeaBreeze99',     exact: 7,  correct: 15, bonus: 50,  points: 193, move: 0,  form: ['winner_gd', 'winner', 'miss', 'exact', 'miss'] },
  { rank: 10, name: 'BlueLagoon',      exact: 6,  correct: 16, bonus: 50,  points: 184, move: -1, form: ['miss', 'winner', 'miss', 'winner_gd', 'winner'] },
  { rank: 11, name: 'DriftWood',       exact: 6,  correct: 14, bonus: 50,  points: 171, move: 0,  form: ['winner', 'miss', 'exact', 'miss', 'winner_gd'] },
  { rank: 12, name: 'MarinerMike',     exact: 5,  correct: 15, bonus: 50,  points: 162, move: 2,  form: ['exact', 'winner', 'winner', 'winner_gd', 'exact'] },
  { rank: 13, name: 'KelpForest',      exact: 5,  correct: 13, bonus: 25,  points: 149, move: 0,  form: ['miss', 'miss', 'winner', 'exact', 'winner_gd'] },
  { rank: 14, name: 'HighTideHank',    exact: 4,  correct: 15, bonus: 25,  points: 141, move: -3, form: ['winner', 'winner_gd', 'miss', 'winner', 'miss'] },
  { rank: 15, name: 'StarboardSam',    exact: 5,  correct: 12, bonus: 25,  points: 134, move: 0,  form: ['winner_gd', 'miss', 'winner', 'miss', 'exact'] },
  { rank: 16, name: 'Whirlpool',       exact: 4,  correct: 14, bonus: 25,  points: 127, move: 3,  form: ['winner', 'exact', 'winner_gd', 'winner', 'winner'] },
  { rank: 17, name: 'DeepDiver',       exact: 4,  correct: 13, bonus: 0,   points: 118, move: 0,  form: ['miss', 'winner', 'miss', 'winner_gd', 'miss'] },
  { rank: 18, name: 'SaltSpray',       exact: 3,  correct: 14, bonus: 25,  points: 109, move: -2, form: ['miss', 'miss', 'miss', 'winner', 'winner_gd'] },
  { rank: 19, name: 'GulfStream',      exact: 3,  correct: 13, bonus: 25,  points: 101, move: 0,  form: ['winner_gd', 'miss', 'winner', 'miss', 'exact'] },
  { rank: 20, name: 'PortSide',        exact: 3,  correct: 12, bonus: 25,  points: 94,  move: 0,  form: ['winner', 'miss', 'winner_gd', 'miss', 'winner'] },
  { rank: 21, name: 'AbysSea',         exact: 2,  correct: 14, bonus: 25,  points: 85,  move: 1,  form: ['miss', 'winner', 'miss', 'winner', 'winner_gd'] },
  { rank: 22, name: 'TrenchRunner',    exact: 3,  correct: 11, bonus: 0,   points: 78,  move: -1, form: ['miss', 'winner_gd', 'miss', 'miss', 'winner'] },
  { rank: 23, name: 'PlanktonPete',    exact: 2,  correct: 13, bonus: 0,   points: 69,  move: 0,  form: ['winner', 'miss', 'miss', 'winner_gd', 'miss'] },
  { rank: 24, name: 'RipCurrent',      exact: 2,  correct: 11, bonus: 0,   points: 57,  move: 0,  form: ['miss', 'miss', 'winner', 'miss', 'winner_gd'] },
]

export async function getLeaderboard(): Promise<{ players: LeaderboardPlayer[]; memberCount: number; isMock: boolean }> {
  const supabase = createAdminClient()

  // Fetch all entries with user info for this pool
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
    .eq('pool_id', POOL_CONFIG.poolId)

  // Count entries with actual points
  const entriesWithPoints = (members || []).flatMap((m: any) => m.pool_entries || []).filter((e: any) => (e.total_points ?? 0) > 0)

  // Use mock data if no real scored entries exist yet
  if (entriesWithPoints.length < 3) {
    return { players: MOCK_PLAYERS, memberCount: MOCK_PLAYERS.length, isMock: true }
  }

  // Build real leaderboard
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
