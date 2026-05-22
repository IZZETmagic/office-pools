// Pre-deadline push warnings — fires at T-24h, T-6h, and T-1h windows
// to users with unsubmitted entries in pools whose deadline is approaching.
//
// Triggered by a Supabase cron job hitting /api/cron/push-deadline-warnings
// every 30 min. Per-window dedupe via push_deadline_warnings_sent so each
// user gets at most one push per window per pool.
//
// Window selection: each cron run identifies pools with deadline currently
// inside one of the three windows. A user gets only the narrowest window's
// push (escalation by inserting smaller window_hours into the dedupe table
// alongside the larger ones).

import { createAdminClient } from '@/lib/supabase/server'
import { sendPushToUser } from './apns'

type WindowHours = 1 | 6 | 24

type PoolRow = {
  pool_id: string
  pool_name: string
  prediction_deadline: string
}

type MembershipRow = {
  user_id: string
  pool_entries: Array<{ entry_id: string; has_submitted_predictions: boolean | null }> | null
}

/**
 * Run a single pass over all pools with deadlines in the next 24h and send
 * the appropriate window push to users with unsubmitted entries. Returns
 * counts for the cron response.
 */
export async function firePendingDeadlineWarnings(): Promise<{
  pools_checked: number
  pushes_sent: number
  pushes_skipped_dedup: number
}> {
  const adminClient = createAdminClient()
  const now = Date.now()
  const windowEndMs = now + 24 * 60 * 60 * 1000

  // 1. Find candidate pools — deadline within the next 24h AND pool is open.
  // Anything beyond 24h is outside even the loosest window.
  const { data: rawPools } = await adminClient
    .from('pools')
    .select('pool_id, pool_name, prediction_deadline')
    .eq('status', 'open')
    .not('prediction_deadline', 'is', null)
    .gte('prediction_deadline', new Date(now).toISOString())
    .lte('prediction_deadline', new Date(windowEndMs).toISOString())

  const pools = (rawPools ?? []) as PoolRow[]
  if (pools.length === 0) {
    return { pools_checked: 0, pushes_sent: 0, pushes_skipped_dedup: 0 }
  }

  let pushes_sent = 0
  let pushes_skipped_dedup = 0

  for (const pool of pools) {
    const deadlineMs = Date.parse(pool.prediction_deadline)
    if (Number.isNaN(deadlineMs)) continue
    const msUntil = deadlineMs - now
    if (msUntil <= 0) continue // already passed; deadline-changed/passed alerts handle that

    const hoursUntil = msUntil / 3_600_000
    const windowHours: WindowHours | null =
      hoursUntil <= 1 ? 1 : hoursUntil <= 6 ? 6 : hoursUntil <= 24 ? 24 : null
    if (windowHours === null) continue

    // 2. Find members of this pool with at least one unsubmitted entry.
    const { data: rawMemberships } = await adminClient
      .from('pool_members')
      .select('user_id, pool_entries(entry_id, has_submitted_predictions)')
      .eq('pool_id', pool.pool_id)
    const memberships = (rawMemberships ?? []) as unknown as MembershipRow[]

    const unsubmittedUserIds = memberships
      .filter((m) => (m.pool_entries ?? []).some((e) => !e.has_submitted_predictions))
      .map((m) => m.user_id)
    if (unsubmittedUserIds.length === 0) continue

    // 3. Send the push for each candidate, using the dedupe table for atomic
    // "have we already sent this window?" checks.
    for (const userId of unsubmittedUserIds) {
      const claimed = await claimWindow(adminClient, userId, pool.pool_id, windowHours)
      if (!claimed) {
        pushes_skipped_dedup++
        continue
      }
      try {
        // Record pending action FIRST so the APNs badge math (computed inside
        // sendPushToUser) includes this notification. reference_id stays null
        // because per-pool there's only ever one outstanding deadline warning
        // at a time — the per-pool unique index suppresses dupes if the same
        // window fires twice. Pending row clears when the user opens the
        // Predictions tab or submits their picks (see mobile auto-mark wiring).
        // See migration 019.
        await adminClient
          .from('user_pending_actions')
          .insert({
            user_id: userId,
            action_type: 'deadline_warning',
            pool_id: pool.pool_id,
            reference_id: null,
          })
          .then(({ error }) => {
            if (error && error.code !== '23505') {
              console.warn(
                '[deadline-warnings] failed to insert pending action',
                userId,
                pool.pool_id,
                error,
              )
            }
          })
        await sendPushToUser(
          userId,
          {
            title: `Predictions lock in ${formatRemaining(msUntil)}`,
            body: `Lock in your picks for ${pool.pool_name} before the window closes.`,
            data: {
              type: 'deadline_warning',
              pool_id: pool.pool_id,
              window_hours: String(windowHours),
            },
          },
          'PREDICTIONS',
        )
        pushes_sent++
      } catch (err) {
        console.error('[deadline-warnings] push send failed', userId, pool.pool_id, err)
      }
    }
  }

  return {
    pools_checked: pools.length,
    pushes_sent,
    pushes_skipped_dedup,
  }
}

/**
 * Atomic claim — INSERT ... ON CONFLICT DO NOTHING + RETURNING. If a row
 * already exists for (user, pool, window), the insert is a no-op and the
 * RETURNING is empty, so we skip the send. Prevents double-pushes from
 * concurrent cron runs.
 */
async function claimWindow(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
  poolId: string,
  windowHours: WindowHours,
): Promise<boolean> {
  const { data } = await adminClient
    .from('push_deadline_warnings_sent')
    .insert({ user_id: userId, pool_id: poolId, window_hours: windowHours })
    .select('user_id')
    .maybeSingle()
  // If insert failed due to PK conflict, supabase-js returns data: null
  // without throwing (because we used .maybeSingle() — not .single()).
  return !!data
}

function formatRemaining(msUntil: number): string {
  if (msUntil <= 0) return 'now'
  const minutes = Math.floor(msUntil / 60_000)
  if (minutes < 60) return `${Math.max(1, minutes)}m`
  const hours = Math.round(msUntil / 3_600_000)
  return `${hours}h`
}
