import { createAdminClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { ROUND_ORDER, ROUND_LABELS, ROUND_MATCH_STAGES } from '@/lib/tournament'
import { sendBatchEmails } from '@/lib/email/send'
import { roundOpenTemplate } from '@/lib/email/templates'
import { TOPICS } from '@/lib/email/topics'
import { withPerfLogging } from '@/lib/api-perf'
import type { RoundKey } from '@/app/pools/[pool_id]/types'

// =============================================================
// POST /api/pools/:poolId/rounds/:roundKey/state
// Admin-only: transition round state
// =============================================================
async function handlePOST(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string; round_key: string }> }
) {
  const { pool_id, round_key } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const isSuperAdmin = userData.is_super_admin === true

  const body = await request.json()
  const { action, deadline, override: overrideRaw, notify } = body as {
    action: 'open' | 'close' | 'complete' | 'extend_deadline'
    deadline?: string
    override?: boolean
    notify?: boolean
  }

  // A super-admin override lets a super admin force a round's state (e.g. to undo
  // an accidental "complete"), bypassing the normal gating. Only honoured for
  // actual super admins; ordinary pool admins must satisfy the usual rules.
  const override = isSuperAdmin && overrideRaw === true

  // Verify admin role. Super admins are allowed through even if they are not a
  // member of the pool, so they can fix any pool from the Super Admin dashboard.
  if (!isSuperAdmin) {
    const { data: membership } = await supabase
      .from('pool_members')
      .select('member_id, role')
      .eq('pool_id', pool_id)
      .eq('user_id', userData.user_id)
      .single()

    if (!membership || membership.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }
  }

  // Super admins act through the service-role client so RLS doesn't block them
  // on pools they aren't a member of. Pool admins keep their RLS-scoped client.
  const db = isSuperAdmin ? createAdminClient() : supabase

  // Verify pool is progressive (round states — and this override — only apply to
  // progressive pools).
  const { data: pool } = await db
    .from('pools')
    .select('prediction_mode, pool_name, tournament_id')
    .eq('pool_id', pool_id)
    .single()

  if (!pool || pool.prediction_mode !== 'progressive') {
    return NextResponse.json({ error: 'Pool is not in progressive mode' }, { status: 400 })
  }

  // Get current round state
  const { data: roundState } = await db
    .from('pool_round_states')
    .select('*')
    .eq('pool_id', pool_id)
    .eq('round_key', round_key)
    .single()

  if (!roundState) {
    return NextResponse.json({ error: 'Round not found' }, { status: 404 })
  }

  const now = new Date().toISOString()
  let updateData: Record<string, any> = { updated_at: now }

  switch (action) {
    case 'open': {
      // A super-admin override skips the normal gating (round must be 'locked'
      // and all knockout teams assigned). A deadline is still required so the
      // round can't be left open indefinitely.
      if (!override) {
        if (roundState.state !== 'locked') {
          return NextResponse.json({ error: `Cannot open round in '${roundState.state}' state` }, { status: 400 })
        }

        // For knockout rounds, verify all teams are assigned
        if (round_key !== 'group') {
          const stages = ROUND_MATCH_STAGES[round_key as RoundKey] ?? []
          const { data: roundMatches } = await db
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
        // When overriding a closed/completed round back to open, clear the
        // terminal timestamps so the row stays consistent.
        ...(override ? { completed_at: null, closed_at: null } : {}),
      }
      break
    }

    case 'close': {
      // A super-admin override can close (lock) a round from any state.
      if (!override && roundState.state !== 'open') {
        return NextResponse.json({ error: `Cannot close round in '${roundState.state}' state` }, { status: 400 })
      }
      updateData = {
        ...updateData,
        state: 'locked',
        closed_at: now,
        // Clear a terminal "completed" stamp if we're overriding back to locked.
        ...(override ? { completed_at: null } : {}),
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
  const { error: updateError } = await db
    .from('pool_round_states')
    .update(updateData)
    .eq('id', roundState.id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // Record super-admin overrides in the audit trail for traceability.
  if (override) {
    await db.from('admin_audit_log').insert({
      action: `round_state_override_${action}`,
      performed_by: userData.user_id,
      pool_id,
      details: {
        round_key,
        previous_state: roundState.state,
        new_state: updateData.state ?? roundState.state,
        new_deadline: deadline ?? null,
        notified: action === 'open' && notify === true,
      },
      summary: `Super-admin override: ${action} ${round_key} for pool ${pool.pool_name}`,
    })
  }

  // Send notifications for round open. For a super-admin override we stay silent
  // by default (it's usually a fix, not a fresh round) unless notify is set.
  if (action === 'open' && (!override || notify === true)) {
    sendRoundOpenNotifications(pool_id, pool.pool_name, round_key as RoundKey, deadline!).catch(console.error)
  }

  // If completing a round, auto-open next round
  if (action === 'complete') {
    const nextRound = ROUND_ORDER[round_key as RoundKey]
    if (nextRound) {
      // Check if next round matches have teams assigned
      const stages = ROUND_MATCH_STAGES[nextRound] ?? []
      const { data: nextMatches } = await db
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

        await db
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

export const POST = withPerfLogging('/api/pools/[id]/rounds/[key]/state', handlePOST)
