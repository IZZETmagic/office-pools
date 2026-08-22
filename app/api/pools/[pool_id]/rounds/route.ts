import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ROUND_KEYS } from '@/lib/tournament'
import { selectorForKey } from '@/lib/competitionRounds'
import { withPerfLogging } from '@/lib/api-perf'

// =============================================================
// GET /api/pools/:poolId/rounds - Get round states for progressive pool
// =============================================================
async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> }
) {
  const { pool_id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const { data: membership } = await supabase
    .from('pool_members')
    .select('member_id, role')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()

  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  // Verify this is a progressive pool
  const { data: pool } = await supabase
    .from('pools')
    .select('prediction_mode, tournament_id')
    .eq('pool_id', pool_id)
    .single()

  if (!pool) return NextResponse.json({ error: 'Pool not found' }, { status: 404 })
  if (pool.prediction_mode !== 'progressive') {
    return NextResponse.json({ error: 'Pool is not in progressive mode' }, { status: 400 })
  }

  // Get round states
  const { data: roundStates, error: roundError } = await supabase
    .from('pool_round_states')
    .select('*')
    .eq('pool_id', pool_id)
    .order('created_at', { ascending: true })

  if (roundError) return NextResponse.json({ error: roundError.message }, { status: 500 })

  // Fixture counts, bucketed by stage. The matchweek bucket that used to live
  // here counted `matches.round_number`, a column migration 049 removed when
  // leagues moved to `league_*`; a league's matchweek counts come from
  // `league_matchweeks.fixture_count` and are wired up in L7.
  const { data: matches, error: matchesErr } = await supabase
    .from('matches')
    .select('match_id, stage, is_completed')
    .eq('tournament_id', pool.tournament_id)
  if (matchesErr) return NextResponse.json({ error: matchesErr.message }, { status: 500 })

  const matchCountsByStage: Record<string, { total: number; completed: number }> = {}
  // Always empty since 049 removed matches.round_number — a league's counts
  // are not in `matches` at all any more. Kept so the response shape and the
  // `selector.roundNumber` lookup below are unchanged; L7 repoints it.
  const matchCountsByRound: Record<number, { total: number; completed: number }> = {}
  for (const match of matches ?? []) {
    if (!matchCountsByStage[match.stage]) {
      matchCountsByStage[match.stage] = { total: 0, completed: 0 }
    }
    matchCountsByStage[match.stage].total++
    if (match.is_completed) matchCountsByStage[match.stage].completed++
  }

  // Get entry ID from query param for submission status
  const { searchParams } = new URL(request.url)
  const entryId = searchParams.get('entryId')

  // Get entry round submissions if entryId provided
  let entrySubmissions: Record<string, any> = {}
  if (entryId) {
    const { data: submissions } = await supabase
      .from('entry_round_submissions')
      .select('*')
      .eq('entry_id', entryId)

    for (const sub of submissions ?? []) {
      entrySubmissions[sub.round_key] = sub
    }
  }

  // For admins: get submission counts per round + per-entry submission map
  // for the currently-open round (drives the Members tab Submitted/Pending
  // badge in a round-aware way).
  let adminStats: Record<string, { total_entries: number; submitted_entries: number }> = {}
  let currentOpenRoundKey: string | null = null
  let currentRoundEntrySubmissions: Record<string, boolean> | null = null

  if (membership.role === 'admin') {
    const openRound = (roundStates ?? []).find(rs => rs.state === 'open')
    currentOpenRoundKey = openRound?.round_key ?? null

    const { data: poolMemberIds } = await supabase
      .from('pool_members')
      .select('member_id')
      .eq('pool_id', pool_id)

    const { data: allEntries } = await supabase
      .from('pool_entries')
      .select('entry_id')
      .in('member_id', poolMemberIds?.map(m => m.member_id) ?? [])

    const totalEntries = allEntries?.length ?? 0
    const entryIds = (allEntries ?? []).map(e => e.entry_id)

    if (totalEntries > 0) {
      const { data: allSubmissions } = await supabase
        .from('entry_round_submissions')
        .select('round_key, has_submitted, entry_id')
        .in('entry_id', entryIds)

      for (const roundKey of ROUND_KEYS) {
        const submitted = (allSubmissions ?? []).filter(
          s => s.round_key === roundKey && s.has_submitted
        ).length
        adminStats[roundKey] = { total_entries: totalEntries, submitted_entries: submitted }
      }

      if (currentOpenRoundKey) {
        const map: Record<string, boolean> = Object.fromEntries(entryIds.map(id => [id, false]))
        for (const sub of allSubmissions ?? []) {
          if (sub.round_key === currentOpenRoundKey) {
            map[sub.entry_id] = !!sub.has_submitted
          }
        }
        currentRoundEntrySubmissions = map
      }
    }
  }

  // Build response
  const rounds = (roundStates ?? []).map(rs => {
    // Fixture counts per round. Bracket rounds aggregate their stages; a
    // matchweek aggregates its own round_number bucket, because every matchweek
    // shares one stage and a stage lookup would report the whole season.
    const selector = selectorForKey(rs.round_key)
    let matchCount = 0
    let completedMatchCount = 0
    const buckets =
      selector.kind === 'stages'
        ? selector.stages.map((st) => matchCountsByStage[st])
        : [matchCountsByRound[selector.roundNumber]]
    for (const counts of buckets) {
      if (counts) {
        matchCount += counts.total
        completedMatchCount += counts.completed
      }
    }

    return {
      ...rs,
      match_count: matchCount,
      completed_match_count: completedMatchCount,
      entry_submission: entrySubmissions[rs.round_key] ?? null,
      ...(membership.role === 'admin' ? { admin_stats: adminStats[rs.round_key] ?? null } : {}),
    }
  })

  return NextResponse.json({
    mode: 'progressive',
    rounds,
    ...(membership.role === 'admin'
      ? {
          current_open_round_key: currentOpenRoundKey,
          current_round_entry_submissions: currentRoundEntrySubmissions,
        }
      : {}),
  })
}

export const GET = withPerfLogging('/api/pools/[id]/rounds', handleGET)
