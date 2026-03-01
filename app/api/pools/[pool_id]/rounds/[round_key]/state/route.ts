import { createClient, createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { ROUND_ORDER, ROUND_LABELS, ROUND_MATCH_STAGES } from '@/lib/tournament'
import { sendBatchEmails } from '@/lib/email/send'
import { roundOpenTemplate } from '@/lib/email/templates'
import { TOPICS } from '@/lib/email/topics'
import type { RoundKey } from '@/app/pools/[pool_id]/types'

// =============================================================
// POST /api/pools/:poolId/rounds/:roundKey/state
// Admin-only: transition round state
// =============================================================
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string; round_key: string }> }
) {
  const { pool_id, round_key } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userData } = await supabase
    .from('users')
    .select('user_id')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Verify admin role
  const { data: membership } = await supabase
    .from('pool_members')
    .select('member_id, role')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()

  if (!membership || membership.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // Verify pool is progressive
  const { data: pool } = await supabase
    .from('pools')
    .select('prediction_mode, pool_name, tournament_id')
    .eq('pool_id', pool_id)
    .single()

  if (!pool || pool.prediction_mode !== 'progressive') {
    return NextResponse.json({ error: 'Pool is not in progressive mode' }, { status: 400 })
  }

  // Get current round state
  const { data: roundState } = await supabase
    .from('pool_round_states')
    .select('*')
    .eq('pool_id', pool_id)
    .eq('round_key', round_key)
    .single()

  if (!roundState) {
    return NextResponse.json({ error: 'Round not found' }, { status: 404 })
  }

  const body = await request.json()
  const { action, deadline } = body as {
    action: 'open' | 'close' | 'complete' | 'extend_deadline'
    deadline?: string
  }

  const now = new Date().toISOString()
  let updateData: Record<string, any> = { updated_at: now }

  switch (action) {
    case 'open': {
      if (roundState.state !== 'locked') {
        return NextResponse.json({ error: `Cannot open round in '${roundState.state}' state` }, { status: 400 })
      }

      // For knockout rounds, verify all teams are assigned
      if (round_key !== 'group') {
        const stages = ROUND_MATCH_STAGES[round_key as RoundKey] ?? []
        const { data: roundMatches } = await supabase
          .from('matches')
          .select('match_id, home_team_id, away_team_id')
          .eq('tournament_id', pool.tournament_id)
          .in('stage', stages)

        const unassigned = (roundMatches ?? []).filter(
          m => !m.home_team_id || !m.away_team_id
        )
        if (unassigned.length > 0) {
          return NextResponse.json({
            error: `Cannot open round: ${unassigned.length} match(es) don't have teams assigned yet`,
          }, { status: 400 })
        }
      }

      if (!deadline) {
        return NextResponse.json({ error: 'Deadline is required when opening a round' }, { status: 400 })
      }

      updateData = {
        ...updateData,
        state: 'open',
        deadline,
        opened_at: now,
        opened_by: userData.user_id,
      }
      break
    }

    case 'close': {
      if (roundState.state !== 'open') {
        return NextResponse.json({ error: `Cannot close round in '${roundState.state}' state` }, { status: 400 })
      }
      updateData = {
        ...updateData,
        state: 'locked',
        closed_at: now,
      }
      break
    }

    case 'complete': {
      if (roundState.state !== 'in_progress' && roundState.state !== 'open') {
        return NextResponse.json({ error: `Cannot complete round in '${roundState.state}' state` }, { status: 400 })
      }
      updateData = {
        ...updateData,
        state: 'completed',
        completed_at: now,
      }
      break
    }

    case 'extend_deadline': {
      if (roundState.state !== 'open' && roundState.state !== 'in_progress') {
        return NextResponse.json({ error: `Cannot extend deadline for round in '${roundState.state}' state` }, { status: 400 })
      }
      if (!deadline) {
        return NextResponse.json({ error: 'New deadline is required' }, { status: 400 })
      }
      updateData = {
        ...updateData,
        deadline,
      }
      break
    }

    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
  }

  // Apply state change
  const { error: updateError } = await supabase
    .from('pool_round_states')
    .update(updateData)
    .eq('id', roundState.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Send notifications for round open
  if (action === 'open') {
    sendRoundOpenNotifications(pool_id, pool.pool_name, round_key as RoundKey, deadline!).catch(console.error)
  }

  // If completing a round, auto-open next round
  if (action === 'complete') {
    const nextRound = ROUND_ORDER[round_key as RoundKey]
    if (nextRound) {
      // Check if next round matches have teams assigned
      const stages = ROUND_MATCH_STAGES[nextRound] ?? []
      const { data: nextMatches } = await supabase
        .from('matches')
        .select('match_id, home_team_id, away_team_id, match_date')
        .eq('tournament_id', pool.tournament_id)
        .in('stage', stages)
        .order('match_date', { ascending: true })

      const allTeamsAssigned = (nextMatches ?? []).every(m => m.home_team_id && m.away_team_id)

      if (allTeamsAssigned && nextMatches && nextMatches.length > 0) {
        // Default deadline: 2 hours before first match of next round
        const firstMatchDate = new Date(nextMatches[0].match_date)
        const defaultDeadline = new Date(firstMatchDate.getTime() - 2 * 60 * 60 * 1000).toISOString()

        await supabase
          .from('pool_round_states')
          .update({
            state: 'open',
            deadline: defaultDeadline,
            opened_at: now,
            opened_by: userData.user_id,
            updated_at: now,
          })
          .eq('pool_id', pool_id)
          .eq('round_key', nextRound)

        // Notify members about next round
        sendRoundOpenNotifications(pool_id, pool.pool_name, nextRound, defaultDeadline).catch(console.error)
      }
    }
  }

  return NextResponse.json({
    success: true,
    round_key,
    new_state: updateData.state ?? roundState.state,
  })
}

// =============================================================
// Helper: Send round open notification emails
// =============================================================
async function sendRoundOpenNotifications(
  poolId: string,
  poolName: string,
  roundKey: RoundKey,
  deadline: string
) {
  const adminClient = createAdminClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'

  // Get all pool members with their user info
  const { data: members } = await adminClient
    .from('pool_members')
    .select('users(email, full_name, username)')
    .eq('pool_id', poolId)

  if (!members || members.length === 0) return

  const stages = ROUND_MATCH_STAGES[roundKey] ?? []
  // Get match count for the round
  const { data: pool } = await adminClient
    .from('pools')
    .select('tournament_id')
    .eq('pool_id', poolId)
    .single()

  const { count: matchCount } = await adminClient
    .from('matches')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', pool?.tournament_id)
    .in('stage', stages)

  const roundName = ROUND_LABELS[roundKey]
  const poolUrl = `${appUrl}/pools/${poolId}?tab=predictions`

  const emails = members
    .filter((m: any) => m.users?.email)
    .map((m: any) => {
      const { subject, html } = roundOpenTemplate({
        userName: m.users.full_name || m.users.username || 'there',
        poolName,
        roundName,
        deadline,
        matchCount: matchCount ?? 0,
        poolUrl,
      })
      return {
        to: m.users.email,
        subject,
        html,
        topicId: TOPICS.POOL_ACTIVITY,
        tags: [{ name: 'category', value: 'round_open' }],
      }
    })

  if (emails.length > 0) {
    await sendBatchEmails(emails)
  }
}
