// Time-based push notifications.
//
// MATCH STARTING SOON — fires ~1h before kickoff to users in pools that
// use the match's tournament. One push per (user, match).
//
// PREDICT REMINDER — daily nudge for users with at least one unsubmitted
// entry in a pool whose deadline is in the next 7 days, AND the user has
// not opened the app in N days (signaled by no recent push_tokens.updated_at
// touch). One push per user per day max.
//
// Both atomic-claim deduped.

import { createAdminClient } from '@/lib/supabase/server'
import { sendPushToUser } from './apns'

type MatchRow = {
  match_id: string
  match_number: number | null
  tournament_id: string
  match_date: string
  home_team: { country_name?: string | null } | Array<{ country_name?: string | null }> | null
  away_team: { country_name?: string | null } | Array<{ country_name?: string | null }> | null
}

function teamName(raw: MatchRow['home_team']): string {
  if (!raw) return 'TBD'
  const t = Array.isArray(raw) ? raw[0] : raw
  return t?.country_name ?? 'TBD'
}

/**
 * Find matches kicking off in the next 60-90 min and push "kicks off in
 * Xh" to users in any pool that uses the match's tournament.
 * Cron runs every 30 min; the 60-90 min window catches each match exactly
 * once in the cron cadence.
 */
export async function fireMatchStartingPushes(): Promise<{
  matches_checked: number
  pushes_sent: number
  pushes_skipped_dedup: number
}> {
  const adminClient = createAdminClient()
  const now = Date.now()
  const windowStart = new Date(now + 60 * 60 * 1000).toISOString() // T+60min
  const windowEnd = new Date(now + 90 * 60 * 1000).toISOString() // T+90min

  const { data: rawMatches } = await adminClient
    .from('matches')
    .select(
      'match_id, match_number, tournament_id, match_date,' +
        ' home_team:teams!matches_home_team_id_fkey(country_name),' +
        ' away_team:teams!matches_away_team_id_fkey(country_name)',
    )
    .gte('match_date', windowStart)
    .lte('match_date', windowEnd)
    .eq('is_completed', false)

  const matches = (rawMatches ?? []) as unknown as MatchRow[]
  if (matches.length === 0) {
    return { matches_checked: 0, pushes_sent: 0, pushes_skipped_dedup: 0 }
  }

  let pushes_sent = 0
  let pushes_skipped_dedup = 0

  for (const match of matches) {
    // 1. Find pools using this tournament.
    const { data: pools } = await adminClient
      .from('pools')
      .select('pool_id')
      .eq('tournament_id', match.tournament_id)
      .eq('status', 'open')
    const poolIds = (pools ?? []).map((p: { pool_id: string }) => p.pool_id)
    if (poolIds.length === 0) continue

    // 2. Find users in any of those pools.
    const { data: members } = await adminClient
      .from('pool_members')
      .select('user_id')
      .in('pool_id', poolIds)
    const userIds = [...new Set((members ?? []).map((m: { user_id: string }) => m.user_id))]
    if (userIds.length === 0) continue

    const home = teamName(match.home_team)
    const away = teamName(match.away_team)
    const kickoffMs = Date.parse(match.match_date)
    const minutesAway = Math.max(0, Math.round((kickoffMs - now) / 60_000))
    const timeStr = minutesAway < 60 ? `${minutesAway}m` : '~1h'

    for (const userId of userIds) {
      const claimed = await claimMatchStarting(adminClient, userId, match.match_id)
      if (!claimed) {
        pushes_skipped_dedup++
        continue
      }
      try {
        await sendPushToUser(
          userId,
          {
            title: `${home} vs ${away} kicks off in ${timeStr}`,
            body: match.match_number != null ? `Match ${match.match_number}` : 'Get ready!',
            data: {
              type: 'match_starting',
              match_id: match.match_id,
            },
          },
          'PREDICTIONS',
        )
        pushes_sent++
      } catch (err) {
        console.error('[time-based] match_starting push failed', userId, match.match_id, err)
      }
    }
  }

  return {
    matches_checked: matches.length,
    pushes_sent,
    pushes_skipped_dedup,
  }
}

async function claimMatchStarting(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  matchId: string,
): Promise<boolean> {
  const { data } = await adminClient
    .from('push_match_starting_sent')
    .insert({ user_id: userId, match_id: matchId })
    .select('user_id')
    .maybeSingle()
  return !!data
}

// ===== REMINDER TO PREDICT =====

/**
 * Daily nudge for users with at least one unsubmitted entry in any of
 * their pools where the deadline is in the next 7 days. One push per
 * user per day max.
 *
 * Not gated on app-recency (would require a last_active_at column).
 * Future enhancement: only push to dormant users (no app open in 3+ days).
 */
export async function firePredictReminders(): Promise<{
  users_checked: number
  pushes_sent: number
  pushes_skipped_dedup: number
}> {
  const adminClient = createAdminClient()
  const now = Date.now()
  const sevenDays = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString()
  const today = new Date(now).toISOString().slice(0, 10)

  // Find pools with upcoming deadlines in the next 7 days.
  const { data: pools } = await adminClient
    .from('pools')
    .select('pool_id, pool_name, prediction_deadline')
    .eq('status', 'open')
    .not('prediction_deadline', 'is', null)
    .gte('prediction_deadline', new Date(now).toISOString())
    .lte('prediction_deadline', sevenDays)
  const poolList = (pools ?? []) as Array<{
    pool_id: string
    pool_name: string
    prediction_deadline: string
  }>
  if (poolList.length === 0) {
    return { users_checked: 0, pushes_sent: 0, pushes_skipped_dedup: 0 }
  }

  const poolIds = poolList.map((p) => p.pool_id)
  const poolNameById = new Map(poolList.map((p) => [p.pool_id, p.pool_name]))

  type MembershipRow = {
    user_id: string
    pool_id: string
    pool_entries: Array<{ has_submitted_predictions: boolean | null }> | null
  }
  const { data: rawMemberships } = await adminClient
    .from('pool_members')
    .select('user_id, pool_id, pool_entries(has_submitted_predictions)')
    .in('pool_id', poolIds)
  const memberships = (rawMemberships ?? []) as unknown as MembershipRow[]

  // Aggregate per user — find the pool with the soonest deadline that
  // has an unsubmitted entry.
  type UserBucket = { poolId: string; poolName: string; deadlineMs: number }
  const userBuckets = new Map<string, UserBucket>()
  for (const m of memberships) {
    const hasUnsubmitted = (m.pool_entries ?? []).some((e) => !e.has_submitted_predictions)
    if (!hasUnsubmitted) continue
    const poolName = poolNameById.get(m.pool_id)
    const pool = poolList.find((p) => p.pool_id === m.pool_id)
    if (!pool || !poolName) continue
    const deadlineMs = Date.parse(pool.prediction_deadline)
    const existing = userBuckets.get(m.user_id)
    if (!existing || deadlineMs < existing.deadlineMs) {
      userBuckets.set(m.user_id, { poolId: m.pool_id, poolName, deadlineMs })
    }
  }

  let pushes_sent = 0
  let pushes_skipped_dedup = 0
  for (const [userId, bucket] of userBuckets) {
    const claimed = await claimReminder(adminClient, userId, today)
    if (!claimed) {
      pushes_skipped_dedup++
      continue
    }
    const hoursUntil = Math.max(0, Math.round((bucket.deadlineMs - now) / 3_600_000))
    const when =
      hoursUntil < 24
        ? `${hoursUntil}h`
        : `${Math.round(hoursUntil / 24)}d`
    try {
      await sendPushToUser(
        userId,
        {
          title: `Make your picks for ${bucket.poolName}`,
          body: `Predictions lock in ${when} — don't miss out`,
          data: {
            type: 'predict_reminder',
            pool_id: bucket.poolId,
          },
        },
        'PREDICTIONS',
      )
      pushes_sent++
    } catch (err) {
      console.error('[time-based] predict_reminder push failed', userId, err)
    }
  }

  return {
    users_checked: userBuckets.size,
    pushes_sent,
    pushes_skipped_dedup,
  }
}

async function claimReminder(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  today: string,
): Promise<boolean> {
  const { data } = await adminClient
    .from('push_predict_reminder_sent')
    .insert({ user_id: userId, sent_on: today })
    .select('user_id')
    .maybeSingle()
  return !!data
}
