import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAllPages } from '@/lib/poolData'
import {
  getShadowReadPools,
  readRecentMatchScoreEvents,
  type MatchScoreEvent,
} from '@/lib/scoring/readSource'
import { withPerfLogging } from '@/lib/api-perf'
import {
  readLeagueNeeds,
  readLeagueStories,
  readSettledWeeks,
  type LeagueActivityPool,
} from '@/lib/activity/readLeagueActivity'
import { pageWeeks, slicePage } from '@/lib/activity/page'
import { sortNeeds, type ActivityLink, type NeedItem } from '@/lib/activity/needsYou'
import { readCrewNeeds } from '@/lib/crews/needs'
import { activityApiVersion } from '@/lib/activity/version'

// =============================================================
// GET /api/users/:user_id/activity
// Returns the user's Activity feed — synthesized events from
// pool memberships, entries, deadline state, rank movement, and
// point adjustments. Mirrors the iOS ActivityService.fetchActivity
// shape so the mobile client can be a thin renderer.
//
// V1 scope: cheap event types only (one Supabase round-trip total).
// XP-gain events (match XP / bonus / badge) are NOT computed here yet —
// the existing per-entry analytics fan-out on the client handles those
// until we extract a slim XP-only helper from computeFullXPBreakdown.
// See SPORTPOOL_PROGRAMME §3 follow-up.
//
// Auth: caller may only read their own activity. Super admins may
// read any user's feed for support / debugging.
//
// ⭐ `?v=2` — the Activity tab redesign (Needs You → Matchweek Story → chips).
// Adds, and ONLY adds, for a caller that asks for it:
//   - `needs_you`   open decisions with a button (lib/activity/needsYou.ts)
//   - `matchweek_story` items for league pools (lib/activity/matchweekStories.ts)
//   - `link` on every item, so a row can open the screen it is about
//   - `seen_at` + a real `is_read` (migration 149's user_activity_seen)
//   - `message_id` on mention metadata
//   - PAGING: `before=<iso>` returns the page older than that; the response's
//     `next_before` is the cursor for the next one, NULL at the end of the
//     history. A page is three matchweeks (lib/activity/page.ts). Needs You
//     only comes on the first page.
// ⚠ Without `v=2` the response is byte-for-byte what it was, because phones on
// an older OTA render every unknown type as a generic row. Deploy this BEFORE
// the OTA that asks for v2.
// =============================================================

type ActivityType =
  | 'mention'
  | 'rank_change'
  | 'deadline_alert'
  | 'pool_joined'
  | 'pool_left'
  | 'pool_removed'
  | 'level_up'
  | 'streak_milestone'
  | 'badge_earned'
  | 'prediction_result'
  | 'matchday_mvp'
  | 'matchday_recap'
  | 'prediction_submitted'
  | 'points_adjusted'
  | 'xp_gain'
  | 'matchweek_story'
  | 'welcome'

type ColorKey = 'primary' | 'success' | 'warning' | 'error' | 'accent'

type ActivityItem = {
  activity_id: string
  pool_id: string | null
  activity_type: ActivityType
  title: string
  body: string | null
  icon: string
  color_key: ColorKey
  metadata: Record<string, unknown> | null
  is_read: boolean
  created_at: string
  /** v2 only. The screen this row opens. */
  link?: ActivityLink
}

type MembershipRow = {
  pool_id: string
  joined_at: string
  pools: {
    pool_id: string
    pool_name: string
    prediction_deadline: string | null
    tournament_id: string | null
    league_season_id: string | null
    league_mode: string | null
    league_table_lock_at: string | null
    league_start_matchweek: number | null
  } | null
  pool_entries: Array<{
    entry_id: string
    entry_name: string
    entry_number: number
    has_submitted_predictions: boolean | null
    predictions_submitted_at: string | null
    auto_submitted: boolean | null
    current_rank: number | null
    previous_rank: number | null
    last_rank_update: string | null
    created_at: string
  }>
}

type AdjustmentRow = {
  id: string
  entry_id: string
  pool_id: string
  amount: number
  reason: string
  created_at: string
}

function makeId(
  type: ActivityType,
  poolId: string | null,
  createdAt: string,
  discriminator?: string,
): string {
  const base = `${type}-${poolId ?? 'none'}-${createdAt}`
  return discriminator ? `${base}-${discriminator}` : base
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Human-readable countdown for the pre-deadline alert title. */
function formatRemaining(msUntil: number): string {
  if (msUntil <= 0) return 'now'
  const minutes = Math.floor(msUntil / 60_000)
  if (minutes < 60) return `${Math.max(1, minutes)}m`
  const hours = Math.round(msUntil / 3_600_000)
  return `${hours}h`
}

function synth(
  type: ActivityType,
  title: string,
  body: string | null,
  icon: string,
  colorKey: ColorKey,
  poolId: string | null,
  createdAt: string,
  metadata: Record<string, unknown> | null,
  idDiscriminator?: string,
): ActivityItem {
  return {
    activity_id: makeId(type, poolId, createdAt, idDiscriminator),
    pool_id: poolId,
    activity_type: type,
    title,
    body,
    icon,
    color_key: colorKey,
    metadata,
    is_read: true,
    created_at: createdAt,
  }
}

async function handleGET(
  request: NextRequest,
  { params }: { params: Promise<{ user_id: string }> },
) {
  const { user_id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { userData } = auth.data

  // Caller can only fetch their own feed (super admins may inspect any feed).
  if (userData.user_id !== user_id && !userData.is_super_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Single admin client for the read — caller authz is enforced above; the
  // synthesis crosses tables that have their own RLS, simpler to bypass.
  const adminClient = createAdminClient()
  const search = new URL(request.url).searchParams
  // "At least 2", not "exactly 2" — versions only add fields, and a build asking for v3 must not
  // fall back to the v1 response (lib/activity/version.ts).
  const v2 = activityApiVersion(search.get('v')) >= 2
  // Crew cards in Needs you (lib/crews/needs.ts) — only for a build that can answer them.
  //
  // ⚠ A CAPABILITY FLAG, NOT A VERSION BUMP. The app talks to production, and until this deploys
  // production answers anything but v=2 with the v1 response — so an app asking for v=3 would lose
  // Needs You entirely the moment it shipped (or the moment Metro reloaded). `v=2&crews=1` is safe
  // in both orders: the old server ignores `crews`, the new one adds the cards. A build that
  // doesn't send it never sees a card it can't act on.
  const withCrews = v2 && search.get('crews') === '1'
  // Only honoured with v2. A malformed cursor is treated as "first page" rather
  // than an error, so a bad client value cannot strand the feed empty.
  const rawBefore = v2 ? search.get('before') : null
  // Kept as sent, not re-serialised: toISOString() would cut Postgres's
  // microseconds and move the cursor (see the note in lib/activity/page.ts).
  const before = rawBefore && !Number.isNaN(Date.parse(rawBefore)) ? rawBefore : null

  const { data: rows, error: pmErr } = await adminClient
    .from('pool_members')
    .select(
      `
      pool_id, joined_at,
      pools(
        pool_id, pool_name, prediction_deadline, tournament_id,
        league_season_id, league_mode, league_table_lock_at, league_start_matchweek
      ),
      pool_entries(
        entry_id, entry_name, entry_number,
        has_submitted_predictions, predictions_submitted_at,
        auto_submitted, current_rank, previous_rank,
        last_rank_update, created_at
      )
      `,
    )
    .eq('user_id', user_id)
  if (pmErr) {
    console.error('[activity] membership fetch failed', pmErr)
    return NextResponse.json({ error: 'Failed to load activity' }, { status: 500 })
  }

  const memberships = (rows ?? []) as unknown as MembershipRow[]
  const items: ActivityItem[] = []
  const now = Date.now()

  // Pool-wide leaderboard topology — used to enrich rank_change events with
  // neighbor context ("you overtook Sarah", "Mike passed you"). One query;
  // bounded by total members across the user's pools.
  type PeerRow = {
    entry_id: string
    pool_id: string
    entry_name: string
    current_rank: number | null
    previous_rank: number | null
    member_id: string
  }
  const allPoolIds = memberships
    .map((m) => m.pools?.pool_id)
    .filter((x): x is string => !!x)
  const peersByPool = new Map<string, PeerRow[]>()
  const peerDisplayName = new Map<string, string>() // member_id -> display name
  if (allPoolIds.length > 0) {
    // `pool_id` is NOT a column of `pool_entries` — it never has been. It lives
    // on `pool_members`, which this query already embeds. Selecting and
    // filtering it here returned 42703 and the error was discarded, so
    // `peerRows` was null and the peer list has been silently empty forever.
    // `!inner` is required for the embedded filter to apply.
    //
    // Paged, because this is unbounded by design: 4,980 entries across 552
    // pools today, and an unbounded PostgREST select truncates at 1,000 with no
    // error — which would leave most pools quietly peer-less instead of all of
    // them.
    const peerRows = await fetchAllPages<PeerRowRaw>('activity peers', (from, to) =>
      adminClient
        .from('pool_entries')
        .select(
          'entry_id, entry_name, current_rank, previous_rank, member_id,' +
            ' pool_members:pool_members!pool_entries_member_id_fkey!inner(' +
            'pool_id, member_id, users(user_id, full_name, username)' +
            ')',
        )
        .in('pool_members.pool_id', allPoolIds)
        .range(from, to) as unknown as PromiseLike<{
        data: PeerRowRaw[] | null
        error: { message: string } | null
      }>,
    )
    type PeerRowRaw = Omit<PeerRow, 'pool_id'> & {
      pool_members:
        | {
            pool_id: string
            member_id: string
            users: { full_name: string | null; username: string | null }
              | Array<{ full_name: string | null; username: string | null }>
              | null
          }
        | Array<{
            pool_id: string
            member_id: string
            users: { full_name: string | null; username: string | null }
              | Array<{ full_name: string | null; username: string | null }>
              | null
          }>
        | null
    }
    for (const r of peerRows) {
      const pm = Array.isArray(r.pool_members) ? r.pool_members[0] : r.pool_members
      // The pool now comes from the embed. `!inner` guarantees it is present,
      // but a missing one would silently file every peer under "undefined", so
      // it is skipped rather than trusted.
      if (!pm?.pool_id) continue
      const list = peersByPool.get(pm.pool_id) ?? []
      list.push({
        entry_id: r.entry_id,
        pool_id: pm.pool_id,
        entry_name: r.entry_name,
        current_rank: r.current_rank,
        previous_rank: r.previous_rank,
        member_id: r.member_id,
      })
      peersByPool.set(pm.pool_id, list)

      const u = pm.users ? (Array.isArray(pm.users) ? pm.users[0] : pm.users) : null
      if (u) {
        peerDisplayName.set(pm.member_id, u.full_name || u.username || 'Someone')
      }
    }
  }

  for (const m of memberships) {
    const pool = m.pools
    if (!pool) continue
    const poolName = pool.pool_name
    const poolId = pool.pool_id

    // 1. Pool joined
    items.push(
      synth(
        'pool_joined',
        `Joined ${poolName}`,
        "You're in! Time to make your predictions.",
        'person.badge.plus',
        'primary',
        poolId,
        m.joined_at,
        { pool_name: poolName },
      ),
    )

    // 2. Predictions submitted / auto-submitted
    for (const e of m.pool_entries ?? []) {
      if (!e.predictions_submitted_at) continue
      if (e.auto_submitted) {
        items.push(
          synth(
            'prediction_submitted',
            'Predictions auto-submitted',
            `Your draft predictions for ${e.entry_name} were automatically submitted at the deadline.`,
            'paperplane.circle.fill',
            'warning',
            poolId,
            e.predictions_submitted_at,
            { pool_name: poolName, entry_name: e.entry_name },
          ),
        )
      } else {
        items.push(
          synth(
            'prediction_submitted',
            'Predictions submitted',
            `${e.entry_name} predictions locked in for ${poolName}.`,
            'paperplane.circle.fill',
            'success',
            poolId,
            e.predictions_submitted_at,
            { pool_name: poolName, entry_name: e.entry_name },
          ),
        )
      }
    }

    // 3. Additional entry created (entry_number > 1)
    for (const e of m.pool_entries ?? []) {
      if (e.entry_number > 1) {
        items.push(
          synth(
            'pool_joined',
            'New entry created',
            `${e.entry_name} added to ${poolName}.`,
            'plus.circle.fill',
            'primary',
            poolId,
            e.created_at,
            { pool_name: poolName },
          ),
        )
      }
    }

    // 4. Deadline alerts — one row per pool. Either "passed" (after deadline)
    // or "locks in X" if we're inside a T-24h / T-6h / T-1h window AND the
    // user still has unsubmitted entries. The pre-deadline alert uses a
    // window-aligned timestamp so the same alert is stable across refreshes
    // within that window (no spam).
    // v2: a league pool's `prediction_deadline` is the season END (see
    // LeagueCardFacts.deadlineAt), so this alert would fire in May. Needs You
    // carries the real weekly deadline instead.
    if (pool.prediction_deadline && !(v2 && pool.league_mode)) {
      const deadlineMs = Date.parse(pool.prediction_deadline)
      if (!Number.isNaN(deadlineMs)) {
        if (deadlineMs < now) {
          items.push(
            synth(
              'deadline_alert',
              'Prediction deadline passed',
              `The prediction window for ${poolName} has closed.`,
              'clock.badge.exclamationmark.fill',
              'warning',
              poolId,
              pool.prediction_deadline,
              { pool_name: poolName, deadline: pool.prediction_deadline },
            ),
          )
        } else {
          const hasUnsubmitted = (m.pool_entries ?? []).some(
            (e) => !e.has_submitted_predictions,
          )
          if (hasUnsubmitted) {
            const msUntil = deadlineMs - now
            const hoursUntil = msUntil / 3_600_000
            // Pick the narrowest window the user is inside. Only one alert per
            // pool — escalates from 24h → 6h → 1h as the window narrows.
            const windowHours =
              hoursUntil <= 1 ? 1 : hoursUntil <= 6 ? 6 : hoursUntil <= 24 ? 24 : null
            if (windowHours !== null) {
              const windowStartMs = deadlineMs - windowHours * 3_600_000
              const windowCreatedAt = new Date(windowStartMs).toISOString()
              const remainingLabel = formatRemaining(msUntil)
              items.push(
                synth(
                  'deadline_alert',
                  `Predictions lock in ${remainingLabel}`,
                  `Lock in your picks for ${poolName} before the window closes.`,
                  'clock.badge.exclamationmark.fill',
                  windowHours === 1 ? 'error' : 'warning',
                  poolId,
                  windowCreatedAt,
                  {
                    pool_name: poolName,
                    deadline: pool.prediction_deadline,
                    hours_remaining: Math.round(hoursUntil * 10) / 10,
                  },
                ),
              )
            }
          }
        }
      }
    }

    // 5. Rank movement (enriched with neighbor "shake-up" context)
    const peers = peersByPool.get(poolId) ?? []
    for (const e of m.pool_entries ?? []) {
      if (
        e.current_rank != null &&
        e.previous_rank != null &&
        e.last_rank_update &&
        e.current_rank !== e.previous_rank
      ) {
        const delta = e.previous_rank - e.current_rank
        const meta: Record<string, unknown> = {
          pool_name: poolName,
          old_rank: e.previous_rank,
          new_rank: e.current_rank,
          delta,
        }

        // Find the closest overtaken / overtaking peer.
        let neighborName: string | null = null
        if (delta > 0) {
          // User climbed. Someone who was above us before is now below us.
          // "Closest" = highest old_rank that still fits (numerically just
          // above where the user used to sit).
          const candidates = peers
            .filter(
              (p) =>
                p.entry_id !== e.entry_id &&
                p.previous_rank != null &&
                p.current_rank != null &&
                p.previous_rank < e.previous_rank! &&
                p.current_rank > e.current_rank!,
            )
            .sort((a, b) => (b.previous_rank! - a.previous_rank!))
          const top = candidates[0]
          if (top) {
            neighborName = peerDisplayName.get(top.member_id) ?? top.entry_name
            meta.overtook_entry_id = top.entry_id
            meta.overtook_name = neighborName
          }
        } else {
          // User dropped. Someone who was below us before is now above us.
          const candidates = peers
            .filter(
              (p) =>
                p.entry_id !== e.entry_id &&
                p.previous_rank != null &&
                p.current_rank != null &&
                p.previous_rank > e.previous_rank! &&
                p.current_rank < e.current_rank!,
            )
            .sort((a, b) => (a.previous_rank! - b.previous_rank!))
          const top = candidates[0]
          if (top) {
            neighborName = peerDisplayName.get(top.member_id) ?? top.entry_name
            meta.passed_by_entry_id = top.entry_id
            meta.passed_by_name = neighborName
          }
        }

        if (delta > 0) {
          const baseBody = `${e.entry_name} climbed ${delta} spot${delta === 1 ? '' : 's'} in ${poolName}.`
          const enrichedBody = neighborName
            ? `Overtook ${neighborName} in ${poolName}.`
            : baseBody
          items.push(
            synth(
              'rank_change',
              `Moved up to #${e.current_rank}`,
              enrichedBody,
              'arrow.up.circle.fill',
              'success',
              poolId,
              e.last_rank_update,
              meta,
              e.entry_id,
            ),
          )
        } else {
          const abs = Math.abs(delta)
          const baseBody = `${e.entry_name} fell ${abs} spot${abs === 1 ? '' : 's'} in ${poolName}.`
          const enrichedBody = neighborName
            ? `${neighborName} overtook you in ${poolName}.`
            : baseBody
          items.push(
            synth(
              'rank_change',
              `Dropped to #${e.current_rank}`,
              enrichedBody,
              'arrow.down.circle.fill',
              'error',
              poolId,
              e.last_rank_update,
              meta,
              e.entry_id,
            ),
          )
        }
      }
    }
  }

  // Pool-name lookup reused by point-adjustments and prediction-results.
  const poolNameByPoolId = new Map<string, string>()
  for (const m of memberships) {
    if (m.pools) poolNameByPoolId.set(m.pools.pool_id, m.pools.pool_name)
  }

  // 6. Point adjustments
  const allEntryIds = memberships.flatMap((m) => (m.pool_entries ?? []).map((e) => e.entry_id))
  if (allEntryIds.length > 0) {
    const { data: adjData } = await adminClient
      .from('point_adjustments')
      .select('id, entry_id, pool_id, amount, reason, created_at')
      .in('entry_id', allEntryIds)
      .order('created_at', { ascending: false })
      .limit(20)

    const adjustments = (adjData ?? []) as AdjustmentRow[]

    for (const a of adjustments) {
      const poolName = poolNameByPoolId.get(a.pool_id) ?? 'Pool'
      const sign = a.amount > 0 ? '+' : ''
      items.push(
        synth(
          'points_adjusted',
          `Points adjusted (${sign}${a.amount})`,
          `${poolName}: ${a.reason}`,
          'slider.horizontal.3',
          a.amount > 0 ? 'success' : 'warning',
          a.pool_id,
          a.created_at,
          { pool_name: poolName, adjustment: a.amount, reason: a.reason },
        ),
      )
    }
  }

  // 8. Banter mentions — recent pool_messages across the user's pools where
  // an `@username` token matches the current user. Mentions aren't persisted
  // to a join table, so we re-parse content here. Safe because we cap the
  // window at the 200 most recent messages across all the user's pools.
  const poolIds = memberships.map((m) => m.pools?.pool_id).filter((x): x is string => !!x)
  if (poolIds.length > 0) {
    const { data: meRow } = await adminClient
      .from('users')
      .select('username')
      .eq('user_id', user_id)
      .maybeSingle()
    const myUsername = (meRow as { username?: string | null } | null)?.username
    if (myUsername) {
      type MsgRow = {
        message_id: string
        pool_id: string
        user_id: string
        content: string
        created_at: string
      }
      const { data: msgData } = await adminClient
        .from('pool_messages')
        .select('message_id, pool_id, user_id, content, created_at')
        .in('pool_id', poolIds)
        .ilike('content', `%@${myUsername}%`)
        // Paging: without this the 50-newest cap would hide older mentions forever.
        .lt('created_at', before ?? '9999-12-31T00:00:00Z')
        .order('created_at', { ascending: false })
        .limit(50)
      const msgs = (msgData ?? []) as MsgRow[]
      // Drop self-mentions and substring false-positives.
      const mentionMatcher = new RegExp(`@${escapeRegex(myUsername)}(?!\\w)`)
      const matched = msgs.filter(
        (m) => m.user_id !== user_id && mentionMatcher.test(m.content),
      )

      if (matched.length > 0) {
        // Resolve sender display names in one batch.
        const senderIds = Array.from(new Set(matched.map((m) => m.user_id)))
        const { data: senderRows } = await adminClient
          .from('users')
          .select('user_id, full_name, username')
          .in('user_id', senderIds)
        const senderById = new Map<string, { name: string }>()
        for (const s of (senderRows ?? []) as Array<{
          user_id: string
          full_name: string | null
          username: string | null
        }>) {
          senderById.set(s.user_id, {
            name: s.full_name || s.username || 'Someone',
          })
        }

        for (const m of matched) {
          const poolName = poolNameByPoolId.get(m.pool_id) ?? 'Pool'
          const senderName = senderById.get(m.user_id)?.name ?? 'Someone'
          const preview = m.content.length > 100 ? `${m.content.slice(0, 100)}…` : m.content
          items.push(
            synth(
              'mention',
              `${senderName} mentioned you`,
              preview,
              'at.circle.fill',
              'primary',
              m.pool_id,
              m.created_at,
              {
                pool_name: poolName,
                sender_name: senderName,
                message_preview: preview,
                message_id: m.message_id,
                sender_user_id: m.user_id,
              },
              // Two mentions in one pool in the same second would otherwise
              // share an id.
              m.message_id,
            ),
          )
        }
      }
    }
  }

  // 7. Prediction results — one event per scored match per entry. Timestamped
  // at match_scores.calculated_at (the moment scoring ran), which is the right
  // "when did I find out?" anchor for the feed.
  if (allEntryIds.length > 0) {
    // Read each entry from the SAME source its pool's leaderboard uses, or the
    // feed reports points that don't match the pool. A user can sit in both
    // cut-over and prod pools, so the two groups are read separately and merged:
    // the global newest-200 is a subset of (newest-200 from each), so this is
    // exact rather than an approximation.
    const shadowPools = await getShadowReadPools(adminClient)
    const shadowIds: string[] = []
    const prodIds: string[] = []
    for (const m of memberships) {
      const isShadow = m.pools ? shadowPools.has(m.pools.pool_id) : false
      for (const e of m.pool_entries ?? []) {
        if (e.entry_id) (isShadow ? shadowIds : prodIds).push(e.entry_id)
      }
    }

    const [shadowScores, prodScores] = await Promise.all([
      readRecentMatchScoreEvents(adminClient, shadowIds, 'shadow', 200),
      readRecentMatchScoreEvents(adminClient, prodIds, 'prod', 200),
    ])
    type ScoreRow = MatchScoreEvent
    const scores = [...shadowScores, ...prodScores]
      .sort((a, b) => (a.calculated_at < b.calculated_at ? 1 : -1))
      .slice(0, 200)

    // Resolve home/away team names + match_date per match in one batch.
    const matchIds = Array.from(new Set(scores.map((s) => s.match_id)))
    type MatchRow = {
      match_id: string
      match_date: string | null
      home_team: { country_name?: string | null } | Array<{ country_name?: string | null }> | null
      away_team: { country_name?: string | null } | Array<{ country_name?: string | null }> | null
    }
    const matchInfo = new Map<
      string,
      { home: string; away: string; match_date: string | null }
    >()
    if (matchIds.length > 0) {
      const { data: matchRows } = await adminClient
        .from('matches')
        .select(
          'match_id, match_date,' +
            ' home_team:teams!matches_home_team_id_fkey(country_name),' +
            ' away_team:teams!matches_away_team_id_fkey(country_name)',
        )
        .in('match_id', matchIds)
      for (const r of (matchRows ?? []) as unknown as MatchRow[]) {
        const home = Array.isArray(r.home_team) ? r.home_team[0] : r.home_team
        const away = Array.isArray(r.away_team) ? r.away_team[0] : r.away_team
        matchInfo.set(r.match_id, {
          home: home?.country_name ?? 'TBD',
          away: away?.country_name ?? 'TBD',
          match_date: r.match_date,
        })
      }
    }

    // Look up entry names from the membership we already fetched.
    const entryNameById = new Map<string, string>()
    for (const m of memberships) {
      for (const e of m.pool_entries ?? []) entryNameById.set(e.entry_id, e.entry_name)
    }

    for (const s of scores) {
      const info = matchInfo.get(s.match_id)
      if (!info) continue // match metadata missing — skip rather than render half a row
      const poolName = poolNameByPoolId.get(s.pool_id) ?? 'Pool'
      const score =
        s.actual_home_score != null && s.actual_away_score != null
          ? `${s.actual_home_score} - ${s.actual_away_score}`
          : '–'
      const outcome = s.score_type
      const title = `${info.home} ${score} ${info.away}`
      const colorKey: ColorKey =
        outcome === 'exact' ? 'accent' : outcome === 'miss' ? 'error' : 'success'
      const icon = outcome === 'miss' ? 'xmark.circle.fill' : 'checkmark.circle.fill'
      const entryName = entryNameById.get(s.entry_id) ?? 'Entry'
      items.push(
        synth(
          'prediction_result',
          title,
          `${entryName} · ${poolName}${s.total_points ? ` · +${s.total_points} pts` : ''}`,
          icon,
          colorKey,
          s.pool_id,
          s.calculated_at,
          {
            pool_name: poolName,
            match_number: s.match_number,
            outcome,
            home_team: info.home,
            away_team: info.away,
            score,
          },
        ),
      )
    }

    // 9. Matchday recap — one card per (pool × entry × matchday) where the
    // user predicted ≥2 matches that day. Aggregates outcomes + points across
    // the day so the user gets a digest beyond the per-match rows.
    type RecapBucket = {
      pool_id: string
      entry_id: string
      date: string // YYYY-MM-DD (matchday key)
      matches: number
      exact: number
      winner_gd: number
      winner: number
      miss: number
      points: number
      latest_calculated_at: string
    }
    const buckets = new Map<string, RecapBucket>()
    for (const s of scores) {
      const info = matchInfo.get(s.match_id)
      if (!info?.match_date) continue
      const date = info.match_date.slice(0, 10)
      const key = `${s.pool_id}::${s.entry_id}::${date}`
      let b = buckets.get(key)
      if (!b) {
        b = {
          pool_id: s.pool_id,
          entry_id: s.entry_id,
          date,
          matches: 0,
          exact: 0,
          winner_gd: 0,
          winner: 0,
          miss: 0,
          points: 0,
          latest_calculated_at: s.calculated_at,
        }
        buckets.set(key, b)
      }
      b.matches += 1
      b.points += s.total_points
      b[s.score_type] += 1
      if (s.calculated_at > b.latest_calculated_at) b.latest_calculated_at = s.calculated_at
    }

    for (const b of buckets.values()) {
      if (b.matches < 2) continue // single-match days are covered by the result row
      const poolName = poolNameByPoolId.get(b.pool_id) ?? 'Pool'
      const entryName = entryNameById.get(b.entry_id) ?? 'Entry'
      const niceDate = new Date(`${b.date}T12:00:00Z`).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      })
      const parts: string[] = []
      if (b.exact) parts.push(`${b.exact} exact`)
      if (b.winner_gd) parts.push(`${b.winner_gd} winner+GD`)
      if (b.winner) parts.push(`${b.winner} winner`)
      if (b.miss) parts.push(`${b.miss} miss`)
      const subtitle = parts.join(' · ')
      items.push(
        synth(
          'matchday_recap',
          `Matchday recap — ${niceDate}`,
          `${b.matches} matches · +${b.points} pts${subtitle ? ` · ${subtitle}` : ''} · ${entryName} · ${poolName}`,
          'calendar.badge.checkmark',
          b.exact > 0 ? 'accent' : 'primary',
          b.pool_id,
          // Use end-of-day as the stable timestamp so the recap sits at the
          // "end" of the matchday in the feed regardless of when individual
          // matches finalized.
          `${b.date}T23:59:59.000Z`,
          {
            pool_name: poolName,
            entry_name: entryName,
            date: b.date,
            matches: b.matches,
            exact: b.exact,
            winner_gd: b.winner_gd,
            winner: b.winner,
            miss: b.miss,
            points: b.points,
          },
        ),
      )
    }
  }

  // Membership lifecycle events — surfaces "you left X" and "you were
  // removed from X" cards in the feed. Pulled from the audit table
  // (pool_membership_events) because the source-of-truth pool_members
  // row is gone by the time these events would be displayed; the audit
  // row snapshots pool_name so the card text survives a pool delete.
  const { data: lifecycleRows } = await adminClient
    .from('pool_membership_events')
    .select('event_id, pool_id, event_type, pool_name, created_at')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false })
    .limit(50)
  for (const e of (lifecycleRows ?? []) as Array<{
    event_id: string
    pool_id: string
    event_type: 'left' | 'removed'
    pool_name: string
    created_at: string
  }>) {
    if (e.event_type === 'left') {
      items.push({
        activity_id: `pool_left-${e.event_id}`,
        pool_id: e.pool_id,
        activity_type: 'pool_left',
        title: `Left ${e.pool_name}`,
        body: 'You left the pool.',
        icon: 'rectangle.portrait.and.arrow.right',
        color_key: 'warning',
        metadata: { pool_name: e.pool_name },
        is_read: true,
        created_at: e.created_at,
      })
    } else {
      items.push({
        activity_id: `pool_removed-${e.event_id}`,
        pool_id: e.pool_id,
        activity_type: 'pool_removed',
        title: `Removed from ${e.pool_name}`,
        body: 'An admin removed you from this pool.',
        icon: 'person.crop.circle.badge.xmark',
        color_key: 'error',
        metadata: { pool_name: e.pool_name },
        is_read: true,
        created_at: e.created_at,
      })
    }
  }

  if (!v2) {
    // Newest first
    items.sort((a, b) =>
      a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
    )
    return NextResponse.json({ items })
  }

  // ---- v2: league stories, Needs You, links, read state ---------------------
  const nameByEntry = new Map<string, string>()
  for (const list of peersByPool.values()) {
    for (const p of list) {
      nameByEntry.set(p.entry_id, peerDisplayName.get(p.member_id) ?? p.entry_name)
    }
  }
  const leaguePools: LeagueActivityPool[] = memberships
    .filter((m) => m.pools?.league_mode)
    .map((m) => {
      const pool = m.pools!
      return {
        poolId: pool.pool_id,
        poolName: pool.pool_name,
        seasonId: pool.league_season_id,
        mode: pool.league_mode,
        tableLockAt: pool.league_table_lock_at,
        startMatchweek: pool.league_start_matchweek,
        entries: [...(m.pool_entries ?? [])]
          .sort((a, b) => a.entry_number - b.entry_number)
          .map((e) => ({ entryId: e.entry_id, entryName: e.entry_name })),
        entrantCount: peersByPool.get(pool.pool_id)?.length ?? null,
      }
    })

  // ---- the page -------------------------------------------------------------
  // Everything above is computed in full (it is cheap, and the World Cup is
  // over); the page is cut from it here. The league stories — the expensive
  // part — are only ever read for this page's three matchweeks.
  const allWeeks = await readSettledWeeks(adminClient, leaguePools)
  const pw = pageWeeks(allWeeks, before)

  items.sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
  )
  const { page, nextBefore } = slicePage(items, before, pw.floor, pw.olderWeeks)

  const [needs, stories, seenRes] = await Promise.all([
    // About now, so first page only.
    before
      ? Promise.resolve([] as NeedItem[])
      : readLeagueNeeds(adminClient, leaguePools, now).catch((err) => {
          // Decoration around links: a league failure must not take the feed down.
          console.error('[activity] needs you failed', err)
          return [] as NeedItem[]
        }),
    readLeagueStories(adminClient, leaguePools, pw.weeks, nameByEntry).catch((err) => {
      console.error('[activity] league stories failed', err)
      return []
    }),
    adminClient.from('user_activity_seen').select('seen_at').eq('user_id', user_id).maybeSingle(),
  ])
  const crewNeeds =
    withCrews && !before
      ? await readCrewNeeds(adminClient, user_id, now).catch((err) => {
          // Same rule as the league cards: a crew failure must not take the feed down.
          console.error('[activity] crew needs failed', err)
          return [] as NeedItem[]
        })
      : []
  if (seenRes.error) console.error('[activity] seen_at read failed', seenRes.error.message)
  const seenAt = (seenRes.data as { seen_at?: string } | null)?.seen_at ?? null

  for (const st of stories) {
    page.push({
      activity_id: st.id,
      pool_id: st.poolId,
      activity_type: 'matchweek_story',
      title: st.title,
      body: st.body,
      icon: 'calendar.badge.checkmark',
      color_key: st.colorKey,
      metadata: st.meta as unknown as Record<string, unknown>,
      is_read: true,
      created_at: st.createdAt,
    })
  }

  const leagueModeByPool = new Map(leaguePools.map((p) => [p.poolId, p.mode]))
  for (const it of page) {
    it.link = linkFor(it, leagueModeByPool.get(it.pool_id ?? '') ?? null)
    // No row yet means the tab has never been opened on a v2 build. Everything
    // counts as read then, or the first open after the update would light up the
    // member's whole history as new.
    it.is_read = seenAt == null || it.created_at <= seenAt
  }

  page.sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
  )

  return NextResponse.json({
    items: page,
    needs_you: crewNeeds.length ? sortNeeds([...needs, ...crewNeeds]) : needs,
    seen_at: seenAt,
    next_before: nextBefore,
  })
}

/**
 * Where a row goes when it is tapped. Pool-less rows (a pool that was left or
 * deleted) go nowhere — the pool screen would only 404.
 */
function linkFor(item: ActivityItem, leagueMode: string | null): ActivityLink | undefined {
  const poolId = item.pool_id
  if (!poolId || item.activity_type === 'pool_left' || item.activity_type === 'pool_removed') {
    return undefined
  }
  const meta = (item.metadata ?? {}) as Record<string, unknown>
  switch (item.activity_type) {
    case 'mention':
      return { pathname: '/pool/[id]', params: { id: poolId, banter: 'open' } }
    case 'matchweek_story': {
      const entryId = String(meta.entry_id ?? '')
      const mw = String(meta.matchweek_number ?? '')
      if (leagueMode === 'showdown' && mw) {
        return { pathname: '/pool/[id]/duel/[matchweek]', params: { id: poolId, matchweek: mw } }
      }
      if (leagueMode === 'last_man_standing' && entryId) {
        return { pathname: '/pool/[id]/survivor/[entryId]', params: { id: poolId, entryId } }
      }
      if (leagueMode === 'table' && entryId) {
        return { pathname: '/pool/[id]/table/[entryId]', params: { id: poolId, entryId } }
      }
      if (entryId && mw) {
        return { pathname: '/pool/[id]/pickem/[entryId]', params: { id: poolId, entryId, mw } }
      }
      return { pathname: '/pool/[id]', params: { id: poolId } }
    }
    default:
      return { pathname: '/pool/[id]', params: { id: poolId } }
  }
}

export const GET = withPerfLogging('/api/users/[user_id]/activity', handleGET)
