import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { DEFAULT_POOL_SETTINGS } from '@/app/pools/[pool_id]/results/points'
import type { PoolSettings } from '@/app/pools/[pool_id]/results/points'
import type { MatchWithResult } from '@/lib/bonusCalculation'
import type { Team, MatchConductData } from '@/lib/tournament'
import { withPerfLogging } from '@/lib/api-perf'
import { getScoringSource, readEntryScoring, readMatchScoresNarrow } from '@/lib/scoring/readSource'
import { readEntryStats } from '@/lib/poolData'
import { getLevelName } from '@/lib/levelNames'
import { fetchMatchConductForTournament } from '@/lib/matchConduct'

// =============================================================
// GET /api/pools/:poolId/leaderboard
// Returns the full leaderboard with server-side computed points.
// Authenticated users who are pool members can access this.
// =============================================================

type LeaderboardEntryResponse = {
  entry_id: string
  entry_name: string
  entry_number: number
  member_id: string
  user_id: string
  full_name: string
  username: string
  match_points: number
  bonus_points: number
  point_adjustment: number
  total_points: number
  current_rank: number | null
  previous_rank: number | null
  has_submitted_predictions: boolean
  last_five: ('exact' | 'winner_gd' | 'winner' | 'miss' | 'no_pick')[]
  current_streak: { type: 'hot' | 'cold' | 'none'; length: number }
  hit_rate: number
  exact_count: number
  level: number
  level_name: string
  total_xp: number
  contrarian_wins: number
  crowd_agreement_pct: number
  total_completed: number
}

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> }
) {
  const { pool_id } = await params

  // 1. Authenticate (cookie or Bearer — handled by createClient)
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  // 2. Verify pool membership
  const { data: membership } = await supabase
    .from('pool_members')
    .select('member_id')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()

  if (!membership) {
    return NextResponse.json({ error: 'Not a member of this pool' }, { status: 403 })
  }

  // Use admin client for all data queries to bypass RLS
  // (pool membership was already verified above, so this is safe)
  const adminClient = createAdminClient()

  // 3. Fetch pool info
  const { data: pool } = await adminClient
    .from('pools')
    .select('pool_id, tournament_id, prediction_mode')
    .eq('pool_id', pool_id)
    .single()

  if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 })

  // 4. Fetch all needed data in parallel
  const [
    { data: matches },
    { data: teams },
    conductData,
    { data: settingsRow },
    { data: poolMembers },
  ] = await Promise.all([
    adminClient
      .from('matches')
      .select('*, home_team:teams!matches_home_team_id_fkey(country_name, flag_url), away_team:teams!matches_away_team_id_fkey(country_name, flag_url)')
      .eq('tournament_id', pool.tournament_id)
      .order('match_number', { ascending: true }),
    adminClient
      .from('teams')
      .select('team_id, country_name, country_code, group_letter, fifa_ranking_points, flag_url')
      .eq('tournament_id', pool.tournament_id),
    fetchMatchConductForTournament(adminClient, pool.tournament_id),
    adminClient
      .from('pool_settings')
      .select('*')
      .eq('pool_id', pool_id)
      .single(),
    adminClient
      .from('pool_members')
      .select('member_id, user_id, role, users(user_id, username, full_name)')
      .eq('pool_id', pool_id),
  ])

  if (!matches || !teams || !poolMembers) {
    return NextResponse.json({ error: 'Failed to fetch pool data' }, { status: 500 })
  }

  // Fetch all entries for these members
  const memberIds = poolMembers.map((m: any) => m.member_id)
  const { data: entries } = await adminClient
    .from('pool_entries')
    .select('entry_id, member_id, entry_name, entry_number, has_submitted_predictions, total_points, point_adjustment, current_rank, previous_rank, match_points, bonus_points, scored_total_points')
    .in('member_id', memberIds)

  if (!entries) {
    return NextResponse.json({ error: 'Failed to fetch entries' }, { status: 500 })
  }

  // Read source (prod columns by default, or the shadow engine for pools flipped
  // via sync_settings.shadow_read_enabled_pools). Prod mode = byte-identical.
  const source = await getScoringSource(adminClient, pool_id, pool.prediction_mode)

  // Fetch all predictions for all entries — paginate to avoid Supabase's 1000-row limit
  const entryIds = entries.map((e: any) => e.entry_id)
  const scoringMap = await readEntryScoring(adminClient, entryIds, source)
  const scoreOf = (entryId: string) =>
    scoringMap.get(entryId) ?? {
      match_points: 0, bonus_points: 0, point_adjustment: 0,
      scored_total_points: 0, current_rank: null as number | null, previous_rank: null as number | null,
    }
  // NOTE: this route used to page EVERY prediction in the pool here (13,385 rows
  // on the largest one) and every match_score alongside it, purely to recompute
  // ten numbers per entry that the scoring path already stores. It reads those
  // stored rows now. See the analytics block below.

  // Normalize data
  const normalizedMatches: MatchWithResult[] = matches.map((m: any) => ({
    ...m,
    home_team: Array.isArray(m.home_team) ? m.home_team[0] ?? null : m.home_team,
    away_team: Array.isArray(m.away_team) ? m.away_team[0] ?? null : m.away_team,
  }))

  const settings: PoolSettings = { ...DEFAULT_POOL_SETTINGS, ...(settingsRow || {}) }
  const conduct: MatchConductData[] = conductData
  const teamsData: Team[] = (teams as any[]).map(t => ({
    ...t,
    group_letter: t.group_letter?.trim() || '',
    country_code: t.country_code?.trim() || '',
  }))

  // Build member lookup (member_id → user info)
  const memberMap = new Map<string, any>()
  for (const m of poolMembers) {
    memberMap.set((m as any).member_id, m)
  }

  // The ONLY match_scores this route still needs: one match's rows, to name the
  // matchday MVP. Previously it read every scored row for every entry.
  const completedForMvp = normalizedMatches.filter((m) => m.is_completed)
  const lastCompleted = completedForMvp.length > 0 ? completedForMvp[completedForMvp.length - 1] : null
  const mvpScores = lastCompleted
    ? await readMatchScoresNarrow(adminClient, entryIds, source, [lastCompleted.match_id])
    : []

  // 5. Assemble each entry's row from stored values.

  // The precomputed analytics row per entry (entry_xp_state), written by the
  // scoring path on every recalc — form, streak, hit rate, exact count, crowd
  // stats, XP and the ratcheted level. This replaces recomputing all of it per
  // request, which is what made this the heaviest read in the product: mobile
  // calls it on every pool open AND after every scoring broadcast.
  //
  // `current_level` is already floored (migration 026), so nothing here needs to
  // re-apply the ratchet.
  const statsByEntry = new Map((await readEntryStats(adminClient, entryIds)).map((r) => [r.entry_id, r]))

  const leaderboard: LeaderboardEntryResponse[] = []

  for (const entry of entries) {
    const member = memberMap.get(entry.member_id)
    if (!member) continue

    const userInfo = (member as any).users
    const sc = scoreOf(entry.entry_id)
    const adjustment = sc.point_adjustment
    const stats = statsByEntry.get(entry.entry_id)

    // An entry with no stored analytics row gets zeros — the same shape this
    // route has always returned for an entry with no predictions, which is what
    // bracket_picker entries are (their picks live in bracket_picker_* tables,
    // not `predictions`). Preserved deliberately rather than "improved": mobile
    // renders these today and a silent change would move numbers members see.
    const matchPoints = stats ? sc.match_points : 0
    const bonusPoints = stats ? sc.bonus_points : 0

    const last_five: ('exact' | 'winner_gd' | 'winner' | 'miss' | 'no_pick')[] = stats
      ? [...(stats.last_five ?? [])]
      : []
    while (stats && last_five.length < 5) last_five.unshift('no_pick')

    const current_streak = stats?.current_streak ?? { type: 'none' as const, length: 0 }
    const hit_rate = stats?.hit_rate ?? 0
    const exact_count = stats?.exact_count ?? 0
    const level = stats?.current_level ?? 1
    const level_name = getLevelName(level)
    const total_xp = stats?.total_xp ?? 0
    const contrarian_wins = stats?.contrarian_wins ?? 0
    const crowd_agreement_pct = stats?.crowd_agreement_pct ?? 0
    const total_completed = stats?.total_completed ?? 0

    leaderboard.push({
      entry_id: entry.entry_id,
      entry_name: entry.entry_name,
      entry_number: entry.entry_number,
      member_id: entry.member_id,
      user_id: (member as any).user_id,
      full_name: userInfo?.full_name ?? 'Unknown',
      username: userInfo?.username ?? '',
      match_points: matchPoints,
      bonus_points: bonusPoints,
      point_adjustment: adjustment,
      total_points: sc.scored_total_points || (matchPoints + bonusPoints + adjustment),
      current_rank: sc.current_rank,
      previous_rank: sc.previous_rank,
      has_submitted_predictions: entry.has_submitted_predictions,
      last_five,
      current_streak,
      hit_rate,
      exact_count,
      level,
      level_name,
      total_xp,
      contrarian_wins,
      crowd_agreement_pct,
      total_completed,
    })
  }

  // 6. Sort by server-computed current_rank (includes all tiebreakers),
  // falling back to total_points if ranks are not yet computed
  leaderboard.sort((a, b) => {
    if (a.current_rank != null && b.current_rank != null) {
      if (a.current_rank !== b.current_rank) return a.current_rank - b.current_rank
    }
    return b.total_points - a.total_points
  })

  // 7. Compute pool-wide analytics data

  // --- Awards ---
  const awards: { type: string; emoji: string; label: string; entry_id: string }[] = []
  // MVP = 1st place
  if (leaderboard.length > 0) awards.push({ type: 'mvp', emoji: '🏆', label: 'MVP', entry_id: leaderboard[0].entry_id })
  // Contrarian King = most contrarian_wins
  const contrarianKing = leaderboard.reduce((max, e) => (e.contrarian_wins > (max?.contrarian_wins ?? 0)) ? e : max, null as LeaderboardEntryResponse | null)
  if (contrarianKing && contrarianKing.contrarian_wins > 0) awards.push({ type: 'contrarian', emoji: '🎲', label: 'Contrarian King', entry_id: contrarianKing.entry_id })
  // Crowd Follower = highest crowd_agreement_pct (min 3 completed)
  const crowdFollower = leaderboard.filter(e => e.total_completed >= 3).reduce((max, e) => (e.crowd_agreement_pct > (max?.crowd_agreement_pct ?? 0)) ? e : max, null as LeaderboardEntryResponse | null)
  if (crowdFollower) awards.push({ type: 'crowd', emoji: '👥', label: 'Crowd Follower', entry_id: crowdFollower.entry_id })
  // Hot Streak = longest current hot streak >= 3 (one person only)
  const hottestEntry = leaderboard.filter(e => e.current_streak.type === 'hot' && e.current_streak.length >= 3).sort((a, b) => b.current_streak.length - a.current_streak.length)[0]
  if (hottestEntry) awards.push({ type: 'hot', emoji: '🔥', label: `On Fire (${hottestEntry.current_streak.length})`, entry_id: hottestEntry.entry_id })
  // Cold Streak = longest current cold streak >= 3 (one person only)
  const coldestEntry = leaderboard.filter(e => e.current_streak.type === 'cold' && e.current_streak.length >= 3).sort((a, b) => b.current_streak.length - a.current_streak.length)[0]
  if (coldestEntry) awards.push({ type: 'cold', emoji: '❄️', label: 'Ice Cold', entry_id: coldestEntry.entry_id })
  // Sharpshooter = most exact scores (one person only)
  const sharpshooterEntry = leaderboard.filter(e => e.exact_count > 0).sort((a, b) => b.exact_count - a.exact_count)[0]
  if (sharpshooterEntry) awards.push({ type: 'sharpshooter', emoji: '🎯', label: 'Sharpshooter', entry_id: sharpshooterEntry.entry_id })

  // --- Superlatives ---
  const superlatives: { type: string; emoji: string; title: string; entry_id: string; name: string; detail: string }[] = []
  // Hottest Right Now
  const hottest = leaderboard.filter(e => e.current_streak.type === 'hot' && e.current_streak.length >= 2).sort((a, b) => b.current_streak.length - a.current_streak.length)[0]
  if (hottest) superlatives.push({ type: 'hot', emoji: '🔥', title: 'Hottest Right Now', entry_id: hottest.entry_id, name: hottest.entry_name || hottest.full_name, detail: `${hottest.current_streak.length}-match win streak` })
  // Ice Cold
  const coldest = leaderboard.filter(e => e.current_streak.type === 'cold' && e.current_streak.length >= 2).sort((a, b) => b.current_streak.length - a.current_streak.length)[0]
  if (coldest) superlatives.push({ type: 'cold', emoji: '❄️', title: 'Ice Cold', entry_id: coldest.entry_id, name: coldest.entry_name || coldest.full_name, detail: `${coldest.current_streak.length} misses in a row` })
  // Contrarian King
  if (contrarianKing && contrarianKing.contrarian_wins > 0) superlatives.push({ type: 'contrarian', emoji: '🎲', title: 'Contrarian King', entry_id: contrarianKing.entry_id, name: contrarianKing.entry_name || contrarianKing.full_name, detail: `${contrarianKing.contrarian_wins} contrarian wins` })
  // Crowd Follower
  if (crowdFollower && crowdFollower.total_completed >= 3) superlatives.push({ type: 'crowd', emoji: '👥', title: 'Crowd Follower', entry_id: crowdFollower.entry_id, name: crowdFollower.entry_name || crowdFollower.full_name, detail: `${Math.round(crowdFollower.crowd_agreement_pct)}% consensus picks` })
  // Sharpshooter
  const sharpshooter = leaderboard.filter(e => e.exact_count > 0).sort((a, b) => b.exact_count - a.exact_count)[0]
  if (sharpshooter) superlatives.push({ type: 'sharpshooter', emoji: '🎯', title: 'Sharpshooter', entry_id: sharpshooter.entry_id, name: sharpshooter.entry_name || sharpshooter.full_name, detail: `${sharpshooter.exact_count} exact scores` })
  // Biggest Climber
  const climber = leaderboard.filter(e => e.current_rank != null && e.previous_rank != null).sort((a, b) => ((b.previous_rank! - b.current_rank!) - (a.previous_rank! - a.current_rank!)))[0]
  if (climber && climber.previous_rank! - climber.current_rank! > 0) superlatives.push({ type: 'climber', emoji: '📈', title: 'Biggest Climber', entry_id: climber.entry_id, name: climber.entry_name || climber.full_name, detail: `Up ${climber.previous_rank! - climber.current_rank!} places` })
  // Biggest Faller
  const faller = leaderboard.filter(e => e.current_rank != null && e.previous_rank != null).sort((a, b) => ((a.previous_rank! - a.current_rank!) - (b.previous_rank! - b.current_rank!)))[0]
  if (faller && faller.previous_rank! - faller.current_rank! < 0) superlatives.push({ type: 'faller', emoji: '📉', title: 'Biggest Faller', entry_id: faller.entry_id, name: faller.entry_name || faller.full_name, detail: `Down ${Math.abs(faller.previous_rank! - faller.current_rank!)} places` })

  // --- Matchday MVP ---
  // Same rule as before (highest points on the last completed match), but read
  // from that ONE match's score rows rather than from a per-entry results map
  // built out of every scored row in the pool.
  let matchday_mvp: { entry_id: string; entry_name: string; full_name: string; match_points: number; match_number: number } | null = null
  if (lastCompleted) {
    let best: { entry_id: string; total_points: number } | null = null
    for (const row of mvpScores) {
      if (row.total_points > (best?.total_points ?? 0)) best = { entry_id: row.entry_id, total_points: row.total_points }
    }
    const bestEntry = best ? leaderboard.find(e => e.entry_id === best!.entry_id) ?? null : null
    if (bestEntry && best && best.total_points > 0) {
      matchday_mvp = { entry_id: bestEntry.entry_id, entry_name: bestEntry.entry_name, full_name: bestEntry.full_name, match_points: best.total_points, match_number: lastCompleted.match_number }
    }
  }

  // --- Matchday Info ---
  const completedCount = completedForMvp.length
  const upcomingMatches = normalizedMatches.filter(m => !m.is_completed && m.status !== 'live').sort((a, b) => new Date(a.match_date).getTime() - new Date(b.match_date).getTime())
  const matchday_info = {
    last_match_number: lastCompleted?.match_number ?? null,
    next_match_date: upcomingMatches.length > 0 ? upcomingMatches[0].match_date : null,
    completed_count: completedCount,
    total_count: normalizedMatches.length,
  }

  return NextResponse.json({
    pool_id,
    prediction_mode: pool.prediction_mode,
    entries: leaderboard,
    awards,
    superlatives,
    matchday_mvp,
    matchday_info,
  })
}

export const GET = withPerfLogging('/api/pools/[id]/leaderboard', handleGET)
