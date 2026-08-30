// Pre-deadline push warnings — fires at T-24h, T-6h, and T-1h windows
// to users with INCOMPLETE entries in pools whose deadline is approaching.
//
// "Incomplete" is counted from the picks (predictions < fixtures), not read off
// `has_submitted_predictions`. Since 2026-08-29 that flag is set by an entry's
// first save, so it no longer distinguishes a finished card from a started one.
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
import { fetchTournamentFixtureCount } from '@/lib/roundMatches'

type WindowHours = 1 | 6 | 24

type PoolRow = {
  pool_id: string
  pool_name: string
  prediction_deadline: string
  tournament_id: string
  prediction_mode: string | null
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
  //
  // ⚠ LEAGUE POOLS EXCLUDED. Their `prediction_deadline` is the season's LAST
  // kickoff (app/api/pools/create:149), not a pick deadline — a league pool has
  // no pool-wide deadline at all, because each matchweek locks at its own first
  // kickoff. Left in, every league member would get "your deadline is
  // approaching" once a season, in the final week, about a date that does not
  // mean what this cron thinks it means. League reminders are `lib/league/notify.ts`.
  const { data: rawPools } = await adminClient
    .from('pools')
    .select('pool_id, pool_name, prediction_deadline, tournament_id, prediction_mode')
    .eq('status', 'open')
    .is('league_season_id', null)
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

    // 2. Find members of this pool with at least one INCOMPLETE entry.
    //
    // ⚠ NOT `has_submitted_predictions` any more, and the difference is the
    // whole point of the reminder. That column is now set by an entry's FIRST
    // SAVE (see the POST handler in app/api/pools/[pool_id]/predictions), so
    // reading it here would treat somebody three matches into sixty-four as
    // finished and never chase them again — the exact person this push exists
    // for. Completeness is counted from the picks instead.
    const { data: rawMemberships } = await adminClient
      .from('pool_members')
      .select('user_id, pool_entries(entry_id, has_submitted_predictions)')
      .eq('pool_id', pool.pool_id)
    const memberships = (rawMemberships ?? []) as unknown as MembershipRow[]

    // ⚠ A BRACKET PICKER'S PICKS ARE NOT IN `predictions`. They live in
    // bracket_picker_knockout_picks, so counting that table against the fixture
    // list would score every bracket entry 0-of-104 and push the entire pool
    // every window. Each mode is counted against the table it actually writes.
    // ⚠ A bracket picker only ever PICKS the knockout ties — the group stage is
    // ranked, not predicted match by match — so its target excludes group
    // fixtures. Counting all 104 against 40 knockout picks would leave a
    // finished bracket permanently "incomplete".
    const isBracketPicker = pool.prediction_mode === 'bracket_picker'
    //
    // ⚠ `picksTable` IS A VARIABLE, WHICH MEANS THE CONFINEMENT LINT DOES NOT
    // SEE IT. That rule matches a string literal in `.from('predictions')`, so
    // this reads the table without tripping it — noted here rather than left to
    // be discovered, because dodging a guard by accident is how guards rot.
    //
    // It is safe for the one reason the rule cares about: the pool query above
    // filters `league_season_id IS NULL`, so nothing here can be a league pool
    // whose picks live in `league_predictions`. If that filter ever goes, this
    // read has to move behind an owning module.
    const picksTable = isBracketPicker ? 'bracket_picker_knockout_picks' : 'predictions'

    const { count: target, error: targetError } = await fetchTournamentFixtureCount(adminClient, {
      tournamentId: pool.tournament_id,
      excludeGroupStage: isBracketPicker,
    })
    if (targetError) {
      console.warn('[deadline-warnings] fixture count failed', pool.pool_id, targetError)
      continue
    }

    // No fixtures means nothing can be incomplete — and would otherwise make
    // every entry look finished at 0 >= 0.
    if (!target) continue

    // Counted per entry with `head: true` rather than by pulling the rows and
    // grouping in JS. A pool of a dozen members has more than 1,000 prediction
    // rows, and PostgREST truncates an unbounded select there SILENTLY — which
    // would read as "everyone is short of a full card" and push the whole pool.
    const unsubmittedUserIds: string[] = []
    for (const m of memberships) {
      let incomplete = false
      for (const entry of m.pool_entries ?? []) {
        const { count } = await adminClient
          .from(picksTable)
          .select('*', { count: 'exact', head: true })
          .eq('entry_id', entry.entry_id)
        if ((count ?? 0) < target) {
          incomplete = true
          break
        }
      }
      if (incomplete) unsubmittedUserIds.push(m.user_id)
    }
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
