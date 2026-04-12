import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ROUND_KEYS, ROUND_MATCH_STAGES } from '@/lib/tournament'
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

  // Get match counts per stage
  const { data: matches } = await supabase
    .from('matches')
    .select('match_id, stage, is_completed')
    .eq('tournament_id', pool.tournament_id)

  const matchCountsByStage: Record<string, { total: number; completed: number }> = {}
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

  // For admins: get submission counts per round
  let adminStats: Record<string, { total_entries: number; submitted_entries: number }> = {}
  if (membership.role === 'admin') {
    // Get total entries in this pool
    const { data: allEntries } = await supabase
      .from('pool_entries')
      .select('entry_id')
      .in(
        'member_id',
        (await supabase.from('pool_members').select('member_id').eq('pool_id', pool_id)).data?.map(m => m.member_id) ?? []
      )

    const totalEntries = allEntries?.length ?? 0

    // Get submission counts per round
    if (totalEntries > 0) {
      const entryIds = allEntries!.map(e => e.entry_id)
      const { data: allSubmissions } = await supabase
        .from('entry_round_submissions')
        .select('round_key, has_submitted')
        .in('entry_id', entryIds)
        .eq('has_submitted', true)

      for (const roundKey of ROUND_KEYS) {
        const submitted = (allSubmissions ?? []).filter(s => s.round_key === roundKey).length
        adminStats[roundKey] = { total_entries: totalEntries, submitted_entries: submitted }
      }
    }
  }

  // Build response
  const rounds = (roundStates ?? []).map(rs => {
    const stages = ROUND_MATCH_STAGES[rs.round_key as keyof typeof ROUND_MATCH_STAGES] ?? []
    let matchCount = 0
    let completedMatchCount = 0
    for (const stage of stages) {
      const counts = matchCountsByStage[stage]
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
  })
}

export const GET = withPerfLogging('/api/pools/[id]/rounds', handleGET)
