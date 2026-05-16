import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { withPerfLogging } from '@/lib/api-perf'

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
// See ROADMAP §3 follow-up.
//
// Auth: caller may only read their own activity. Super admins may
// read any user's feed for support / debugging.
// =============================================================

type ActivityType =
  | 'mention'
  | 'rank_change'
  | 'deadline_alert'
  | 'pool_joined'
  | 'level_up'
  | 'streak_milestone'
  | 'badge_earned'
  | 'prediction_result'
  | 'matchday_mvp'
  | 'matchday_recap'
  | 'prediction_submitted'
  | 'points_adjusted'
  | 'xp_gain'
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
}

type MembershipRow = {
  pool_id: string
  joined_at: string
  pools: {
    pool_id: string
    pool_name: string
    prediction_deadline: string | null
    tournament_id: string | null
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

function makeId(type: ActivityType, poolId: string | null, createdAt: string): string {
  return `${type}-${poolId ?? 'none'}-${createdAt}`
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
): ActivityItem {
  return {
    activity_id: makeId(type, poolId, createdAt),
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
  _request: NextRequest,
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

  const { data: rows, error: pmErr } = await adminClient
    .from('pool_members')
    .select(
      `
      pool_id, joined_at,
      pools(pool_id, pool_name, prediction_deadline, tournament_id),
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
    const { data: peerRows } = await adminClient
      .from('pool_entries')
      .select(
        'entry_id, pool_id, entry_name, current_rank, previous_rank, member_id,' +
          ' pool_members:pool_members!pool_entries_member_id_fkey(' +
          'member_id, users(user_id, full_name, username)' +
          ')',
      )
      .in('pool_id', allPoolIds)
    type PeerRowRaw = PeerRow & {
      pool_members:
        | {
            member_id: string
            users: { full_name: string | null; username: string | null }
              | Array<{ full_name: string | null; username: string | null }>
              | null
          }
        | Array<{
            member_id: string
            users: { full_name: string | null; username: string | null }
              | Array<{ full_name: string | null; username: string | null }>
              | null
          }>
        | null
    }
    for (const r of (peerRows ?? []) as unknown as PeerRowRaw[]) {
      const list = peersByPool.get(r.pool_id) ?? []
      list.push({
        entry_id: r.entry_id,
        pool_id: r.pool_id,
        entry_name: r.entry_name,
        current_rank: r.current_rank,
        previous_rank: r.previous_rank,
        member_id: r.member_id,
      })
      peersByPool.set(r.pool_id, list)

      const pm = Array.isArray(r.pool_members) ? r.pool_members[0] : r.pool_members
      const u = pm?.users
            ? Array.isArray(pm.users)
              ? pm.users[0]
              : pm.users
            : null
      if (pm && u) {
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
    if (pool.prediction_deadline) {
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
              },
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
    type ScoreRow = {
      entry_id: string
      pool_id: string
      match_id: string
      match_number: number
      score_type: 'exact' | 'winner_gd' | 'winner' | 'miss'
      total_points: number
      actual_home_score: number | null
      actual_away_score: number | null
      calculated_at: string
    }
    const { data: scoreData } = await adminClient
      .from('match_scores')
      .select(
        'entry_id, pool_id, match_id, match_number, score_type, total_points, actual_home_score, actual_away_score, calculated_at',
      )
      .in('entry_id', allEntryIds)
      .order('calculated_at', { ascending: false })
      .limit(200)
    const scores = (scoreData ?? []) as ScoreRow[]

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

  // Newest first
  items.sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
  )

  return NextResponse.json({ items })
}

export const GET = withPerfLogging('/api/users/[user_id]/activity', handleGET)
