import { createClient, createAdminClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PoolDetail } from './PoolDetail'
import type {
  PoolData,
  MemberData,
  EntryData,
  MatchData,
  SettingsData,
  PredictionData,
  TeamData,
  ExistingPrediction,
  PlayerScoreData,
  BonusScoreData,
  PoolRoundState,
  EntryRoundSubmission,
  BPGroupRanking,
  BPThirdPlaceRanking,
  BPKnockoutPick,
} from './types'

export default async function PoolPage({
  params,
}: {
  params: Promise<{ pool_id: string }>
}) {
  const { pool_id } = await params
  const supabase = await createClient()

  // STEP 1: Get authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // STEP 2: Look up user_id from users table
  const { data: userData } = await supabase
    .from('users')
    .select('user_id, is_super_admin')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData) redirect('/dashboard')

  // STEP 3: Check membership
  const { data: membership } = await supabase
    .from('pool_members')
    .select('member_id, role, has_seen_how_to_play')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()

  if (!membership) redirect('/dashboard')

  const isAdmin = membership.role === 'admin'

  // STEP 4: Fetch all data in parallel
  const [poolRes, membersRes, settingsRes, teamsRes] = await Promise.all([
    // Pool details
    supabase.from('pools').select('*').eq('pool_id', pool_id).single(),

    // Members with user info and their entries
    supabase
      .from('pool_members')
      .select('*, users!inner(user_id, username, full_name, email), pool_entries(*)')
      .eq('pool_id', pool_id),

    // Pool settings
    supabase.from('pool_settings').select('*').eq('pool_id', pool_id).single(),

    // All teams (for predictions)
    supabase
      .from('teams')
      .select('team_id, country_name, country_code, group_letter, fifa_ranking_points, flag_url')
      .order('group_letter', { ascending: true })
      .order('fifa_ranking_points', { ascending: false }),
  ])

  const pool = poolRes.data as PoolData | null
  if (!pool) redirect('/dashboard')

  // Fetch matches using the pool's tournament_id
  const matchesRes = await supabase
    .from('matches')
    .select(
      `
      *,
      home_team:teams!matches_home_team_id_fkey(country_name),
      away_team:teams!matches_away_team_id_fkey(country_name)
    `
    )
    .eq('tournament_id', pool.tournament_id)
    .order('match_number', { ascending: true })

  // Normalize team data (Supabase sometimes returns arrays for joins)
  const matches: MatchData[] = (matchesRes.data || []).map((m: any) => ({
    ...m,
    home_team: Array.isArray(m.home_team) ? m.home_team[0] ?? null : m.home_team,
    away_team: Array.isArray(m.away_team) ? m.away_team[0] ?? null : m.away_team,
  }))

  // Process members: attach entries array and sort entries by entry_number
  const members = (membersRes.data || []).map((m: any) => {
    const entries = (m.pool_entries || []) as EntryData[]
    entries.sort((a: EntryData, b: EntryData) => a.entry_number - b.entry_number)
    return {
      ...m,
      pool_entries: undefined,
      entries,
    } as MemberData
  })

  const settings = settingsRes.data as SettingsData | null
  const teams = (teamsRes.data || []) as TeamData[]

  // Collect all entry IDs across all members
  const allEntries = members.flatMap((m) => m.entries || [])
  const allEntryIds = allEntries.map((e) => e.entry_id)

  // Get the current user's entries
  const currentMember = members.find(m => m.member_id === membership.member_id)
  const userEntries = currentMember?.entries || []
  const userEntryIds = userEntries.map((e) => e.entry_id)

  // Fetch conduct data, player scores, bonus scores (by entry_id now)
  const [{ data: conductRes }, { data: playerScoresRes }, { data: bonusScoresRes }] = await Promise.all([
    supabase
      .from('match_conduct')
      .select('match_id, team_id, yellow_cards, indirect_red_cards, direct_red_cards, yellow_direct_red_cards'),
    allEntryIds.length > 0
      ? supabase
          .from('player_scores')
          .select('entry_id, match_points, bonus_points, total_points')
          .in('entry_id', allEntryIds)
      : Promise.resolve({ data: [] }),
    allEntryIds.length > 0
      ? supabase
          .from('bonus_scores')
          .select('bonus_score_id, entry_id, bonus_type, bonus_category, related_group_letter, related_match_id, points_earned, description')
          .in('entry_id', allEntryIds)
      : Promise.resolve({ data: [] }),
  ])

  const conductData = (conductRes || []) as {
    match_id: string
    team_id: string
    yellow_cards: number
    indirect_red_cards: number
    direct_red_cards: number
    yellow_direct_red_cards: number
  }[]

  const playerScores = (playerScoresRes || []) as PlayerScoreData[]
  const bonusScores = (bonusScoresRes || []) as BonusScoreData[]

  // Fetch user's predictions for the first entry (default active entry)
  const defaultEntry = userEntries[0]
  const { data: userPredictions } = defaultEntry
    ? await supabase
        .from('predictions')
        .select('match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id, prediction_id')
        .eq('entry_id', defaultEntry.entry_id)
    : { data: [] }

  // For progressive pools: fetch round states and submissions
  let roundStates: PoolRoundState[] = []
  let roundSubmissions: EntryRoundSubmission[] = []
  if (pool.prediction_mode === 'progressive') {
    const [roundStatesRes, roundSubsRes] = await Promise.all([
      supabase
        .from('pool_round_states')
        .select('*')
        .eq('pool_id', pool_id)
        .order('created_at', { ascending: true }),
      userEntryIds.length > 0
        ? supabase
            .from('entry_round_submissions')
            .select('*')
            .in('entry_id', userEntryIds)
        : Promise.resolve({ data: [] }),
    ])
    roundStates = (roundStatesRes.data || []) as PoolRoundState[]
    roundSubmissions = (roundSubsRes.data || []) as EntryRoundSubmission[]

    // Auto-seed missing round states (handles pools created before feature deploy or RLS insert failures)
    if (roundStates.length === 0) {
      const adminClient = createAdminClient()
      const roundKeys = ['group', 'round_32', 'round_16', 'quarter_final', 'semi_final', 'third_place', 'final']
      const now = new Date().toISOString()
      const seedRows = roundKeys.map(key => ({
        pool_id: pool_id,
        round_key: key,
        state: key === 'group' ? 'open' : 'locked',
        deadline: key === 'group' && pool.prediction_deadline ? pool.prediction_deadline : null,
        opened_at: key === 'group' ? now : null,
      }))
      const { data: seeded } = await adminClient
        .from('pool_round_states')
        .insert(seedRows)
        .select('*')
      if (seeded) {
        roundStates = seeded as PoolRoundState[]
      }
    }
  }

  // For bracket_picker pools: fetch bracket picker data for the default entry
  let bpGroupRankings: BPGroupRanking[] = []
  let bpThirdPlaceRankings: BPThirdPlaceRanking[] = []
  let bpKnockoutPicks: BPKnockoutPick[] = []
  let bpEntryProgressMap: Record<string, number> = {}
  // All entries' BP data (for leaderboard client-side scoring)
  let allBPGroupRankings: BPGroupRanking[] = []
  let allBPThirdPlaceRankings: BPThirdPlaceRanking[] = []
  let allBPKnockoutPicks: BPKnockoutPick[] = []

  if (pool.prediction_mode === 'bracket_picker' && defaultEntry) {
    const [grRes, tpRes, kpRes] = await Promise.all([
      supabase.from('bracket_picker_group_rankings').select('*').eq('entry_id', defaultEntry.entry_id),
      supabase.from('bracket_picker_third_place_rankings').select('*').eq('entry_id', defaultEntry.entry_id),
      supabase.from('bracket_picker_knockout_picks').select('*').eq('entry_id', defaultEntry.entry_id),
    ])
    bpGroupRankings = (grRes.data ?? []) as BPGroupRanking[]
    bpThirdPlaceRankings = (tpRes.data ?? []) as BPThirdPlaceRanking[]
    bpKnockoutPicks = (kpRes.data ?? []) as BPKnockoutPick[]
  }

  // For bracket_picker pools: fetch ALL entries' BP data for leaderboard scoring
  if (pool.prediction_mode === 'bracket_picker' && allEntryIds.length > 0) {
    const [grAllRes, tpAllRes, kpAllRes] = await Promise.all([
      supabase.from('bracket_picker_group_rankings').select('*').in('entry_id', allEntryIds),
      supabase.from('bracket_picker_third_place_rankings').select('*').in('entry_id', allEntryIds),
      supabase.from('bracket_picker_knockout_picks').select('*').in('entry_id', allEntryIds),
    ])
    allBPGroupRankings = (grAllRes.data ?? []) as BPGroupRanking[]
    allBPThirdPlaceRankings = (tpAllRes.data ?? []) as BPThirdPlaceRanking[]
    allBPKnockoutPicks = (kpAllRes.data ?? []) as BPKnockoutPick[]

    // Also derive progress counts from the all-entries data
    for (const row of [...allBPGroupRankings, ...allBPThirdPlaceRankings, ...allBPKnockoutPicks]) {
      if (userEntryIds.includes(row.entry_id)) {
        bpEntryProgressMap[row.entry_id] = (bpEntryProgressMap[row.entry_id] || 0) + 1
      }
    }
  }

  // Fetch all predictions (needed for admin tabs + leaderboard bonus computation)
  let allPredictions: PredictionData[] = []
  if (allEntryIds.length > 0) {
    const { data: predData } = await supabase
      .from('predictions')
      .select('*')
      .in('entry_id', allEntryIds)

    allPredictions = (predData || []) as PredictionData[]
  }

  // Check deadline
  const isPastDeadline = pool.prediction_deadline
    ? new Date(pool.prediction_deadline) < new Date()
    : false

  // Lazy fallback: auto-submit draft entries if deadline has passed
  if (isPastDeadline) {
    import('@/lib/auto-submit').then(({ autoSubmitDraftEntries }) => {
      autoSubmitDraftEntries(pool_id).catch(() => {})
    })
  }

  const psoEnabled = settings?.pso_enabled ?? true

  return (
    <PoolDetail
      pool={pool}
      members={members}
      matches={matches}
      settings={settings}
      userPredictions={(userPredictions || []) as ExistingPrediction[]}
      allPredictions={allPredictions}
      teams={teams}
      conductData={conductData}
      playerScores={playerScores}
      bonusScores={bonusScores}
      memberId={membership.member_id}
      currentUserId={userData.user_id}
      isAdmin={isAdmin}
      isPastDeadline={isPastDeadline}
      psoEnabled={psoEnabled}
      userEntries={userEntries}
      isSuperAdmin={userData.is_super_admin ?? false}
      hasSeenHowToPlay={membership.has_seen_how_to_play ?? false}
      roundStates={roundStates}
      roundSubmissions={roundSubmissions}
      bpGroupRankings={bpGroupRankings}
      bpThirdPlaceRankings={bpThirdPlaceRankings}
      bpKnockoutPicks={bpKnockoutPicks}
      bpEntryProgressMap={bpEntryProgressMap}
      allBPGroupRankings={allBPGroupRankings}
      allBPThirdPlaceRankings={allBPThirdPlaceRankings}
      allBPKnockoutPicks={allBPKnockoutPicks}
    />
  )
}
