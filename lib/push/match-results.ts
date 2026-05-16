// Fan-out for match-completion push notifications.
//
// Triggered at the end of every `recalculatePool` run. Identifies matches
// that just completed (is_completed=true AND result_pushes_sent_at IS NULL),
// fires three push types per affected user, then marks the match as
// "pushes sent" so subsequent recalcs (for the same OR different pools)
// don't re-send.
//
// Push types fired here (Phase 1):
//   1. `prediction_result` (category: MATCH_RESULTS)
//        — one push per user per match summarising their best outcome
//   2. `matchday_mvp` (category: GAMIFICATION)
//        — one push per pool per match to the top scorer (skipped if miss)
//   3. `streak_milestone` (category: GAMIFICATION)
//        — push at exactly 3, 5, or 10-match hot/cold streaks per entry
//
// Concurrency: uses an atomic "claim" update so two parallel recalculatePool
// calls for the same match only let one send pushes.
//
// Failures: per-push errors are swallowed (logged) so a bad token doesn't
// block the rest of the fan-out. The match's `result_pushes_sent_at` cursor
// gets set even on partial failure — push retry isn't worth the complexity.

import { createAdminClient } from '@/lib/supabase/server'
import { sendPushToUser } from './apns'

type PendingMatch = {
  match_id: string
  match_number: number | null
  home_score_ft: number | null
  away_score_ft: number | null
  home_team: { country_name?: string | null } | Array<{ country_name?: string | null }> | null
  away_team: { country_name?: string | null } | Array<{ country_name?: string | null }> | null
}

type ScoreRow = {
  entry_id: string
  pool_id: string
  total_points: number
  score_type: 'exact' | 'winner_gd' | 'winner' | 'miss'
}

type EntryRow = {
  entry_id: string
  entry_name: string
  member_id: string
}

type MemberRow = {
  member_id: string
  user_id: string
  pool_id: string
}

/**
 * Atomically claim a match for push fan-out. Returns true if we successfully
 * claimed it; false if another process already did.
 */
async function claimMatch(
  adminClient: ReturnType<typeof createAdminClient>,
  matchId: string,
): Promise<boolean> {
  const { data } = await adminClient
    .from('matches')
    .update({ result_pushes_sent_at: new Date().toISOString() })
    .eq('match_id', matchId)
    .is('result_pushes_sent_at', null)
    .select('match_id')
    .maybeSingle()
  return !!data
}

/**
 * Find newly-completed matches across all tournaments and fan out their
 * pushes. Safe to call multiple times — the cursor + claim guard prevent
 * duplicate sends.
 */
export async function fanOutResultPushes(): Promise<void> {
  const adminClient = createAdminClient()

  const { data: pending } = await adminClient
    .from('matches')
    .select(
      'match_id, match_number, home_score_ft, away_score_ft,' +
        ' home_team:teams!matches_home_team_id_fkey(country_name),' +
        ' away_team:teams!matches_away_team_id_fkey(country_name)',
    )
    .eq('is_completed', true)
    .is('result_pushes_sent_at', null)
    .limit(50)

  const matches = (pending ?? []) as unknown as PendingMatch[]
  if (matches.length === 0) return

  for (const match of matches) {
    const claimed = await claimMatch(adminClient, match.match_id)
    if (!claimed) continue
    try {
      await fanOutForMatch(adminClient, match)
    } catch (err) {
      console.error('[match-results] fanOutForMatch error', match.match_id, err)
    }
  }
}

async function fanOutForMatch(
  adminClient: ReturnType<typeof createAdminClient>,
  match: PendingMatch,
): Promise<void> {
  // 1. Find all match_scores for this match across all pools.
  const { data: rawScores } = await adminClient
    .from('match_scores')
    .select('entry_id, pool_id, total_points, score_type')
    .eq('match_id', match.match_id)
  const scores = (rawScores ?? []) as ScoreRow[]
  if (scores.length === 0) return

  // 2. Resolve entry → user. Two-hop: pool_entries (entry → member_id) +
  // pool_members (member_id → user_id).
  const entryIds = [...new Set(scores.map((s) => s.entry_id))]
  const { data: rawEntries } = await adminClient
    .from('pool_entries')
    .select('entry_id, entry_name, member_id')
    .in('entry_id', entryIds)
  const entries = (rawEntries ?? []) as EntryRow[]

  const memberIds = [...new Set(entries.map((e) => e.member_id))]
  const { data: rawMembers } = await adminClient
    .from('pool_members')
    .select('member_id, user_id, pool_id')
    .in('member_id', memberIds)
  const members = (rawMembers ?? []) as MemberRow[]

  const memberByMemberId = new Map(members.map((m) => [m.member_id, m]))
  const entryById = new Map(
    entries
      .map((e) => {
        const member = memberByMemberId.get(e.member_id)
        if (!member) return null
        return [
          e.entry_id,
          { userId: member.user_id, poolId: member.pool_id, entryName: e.entry_name },
        ] as const
      })
      .filter((v): v is readonly [string, { userId: string; poolId: string; entryName: string }] => v !== null),
  )

  // 3. Pool names for body copy.
  const poolIds = [...new Set(scores.map((s) => s.pool_id))]
  const { data: pools } = await adminClient
    .from('pools')
    .select('pool_id, pool_name')
    .in('pool_id', poolIds)
  const poolNameById = new Map((pools ?? []).map((p) => [p.pool_id, p.pool_name]))

  // 4. Format the score line ("Brazil 2 - 1 Argentina") — same across all
  // recipients.
  const homeTeam = teamName(match.home_team)
  const awayTeam = teamName(match.away_team)
  const scoreLine =
    match.home_score_ft != null && match.away_score_ft != null
      ? `${match.home_score_ft} - ${match.away_score_ft}`
      : ''
  const titleLine = scoreLine
    ? `${homeTeam} ${scoreLine} ${awayTeam}`
    : `${homeTeam} vs ${awayTeam}`

  // 5. PREDICTION RESULT — ONE PUSH PER (user × pool × entry). Most users
  // are in 1-2 pools with 1-2 entries, so this is 1-4 pushes max per
  // matchday for the typical user. Each push clearly identifies the entry
  // AND the pool so multi-entry users can tell which result is which.
  // Body reads: "Main · WC Office · Exact +5 pts"
  type UserResult = { score: ScoreRow; poolName: string; entryName: string }
  const allByUser = new Map<string, UserResult[]>()
  for (const s of scores) {
    const entry = entryById.get(s.entry_id)
    if (!entry) continue
    const list = allByUser.get(entry.userId) ?? []
    list.push({
      score: s,
      poolName: poolNameById.get(s.pool_id) ?? 'Pool',
      entryName: entry.entryName,
    })
    allByUser.set(entry.userId, list)
  }

  const work: Array<Promise<unknown>> = []

  for (const [userId, results] of allByUser) {
    for (const r of results) {
      work.push(
        sendPushToUser(
          userId,
          {
            title: titleLine,
            body: `${r.entryName} · ${r.poolName} · ${formatOutcome(r.score.score_type, r.score.total_points)}`,
            data: {
              type: 'match_result',
              match_id: match.match_id,
              pool_id: r.score.pool_id,
              entry_id: r.score.entry_id,
            },
          },
          'MATCH_RESULTS',
        ).catch((err) =>
          console.error('[match-results] prediction_result push failed', userId, r.score.entry_id, err),
        ),
      )
    }
  }

  // 6. MVP — per pool, the entry(ies) with the highest total_points on THIS
  // match. Ties → co-MVP push to every tied entry (no single "winner" picked
  // arbitrarily). Skipped entirely if the top score was a miss or 0 pts.
  for (const poolId of poolIds) {
    const poolScores = scores
      .filter((s) => s.pool_id === poolId && s.score_type !== 'miss' && s.total_points > 0)
      .sort((a, b) => b.total_points - a.total_points)
    if (poolScores.length === 0) continue
    const topPoints = poolScores[0].total_points
    const tops = poolScores.filter((s) => s.total_points === topPoints)
    const isCoMvp = tops.length > 1
    const poolName = poolNameById.get(poolId) ?? 'Pool'
    const matchLabel = match.match_number != null ? `Match ${match.match_number}` : 'this match'
    for (const top of tops) {
      const entry = entryById.get(top.entry_id)
      if (!entry) continue
      work.push(
        sendPushToUser(
          entry.userId,
          {
            title: isCoMvp
              ? `🏆 You're co-MVP for ${matchLabel}`
              : `🏆 You're MVP for ${matchLabel}`,
            body: isCoMvp
              ? `+${top.total_points} pts · tied for top in ${poolName}`
              : `+${top.total_points} pts · top scorer in ${poolName}`,
            data: {
              type: 'gamification',
              sub: 'mvp',
              match_id: match.match_id,
              pool_id: poolId,
              tied: String(isCoMvp),
            },
          },
          'GAMIFICATION',
        ).catch((err) =>
          console.error('[match-results] mvp push failed', entry.userId, err),
        ),
      )
    }
  }

  // 7. STREAK MILESTONES — for each user whose score just landed, look at
  // their latest 10 match_scores per entry and detect a 3/5/10 streak.
  for (const userId of allByUser.keys()) {
    work.push(
      detectAndPushStreak(adminClient, userId).catch((err) =>
        console.error('[match-results] streak push failed', userId, err),
      ),
    )
  }

  // 8. LEADERBOARD SHAKE-UPS — for each user who got a prediction_result
  // push, check if their entry's rank moved in this pool's leaderboard
  // (current_rank vs previous_rank). If yes, identify the peer they
  // overtook / got passed by and fire a shake-up push.
  // Category: LEADERBOARD. Auto-deduped by the match-level cursor.
  work.push(
    fanOutShakeups(adminClient, allByUser, poolIds, poolNameById, entryById).catch((err) =>
      console.error('[match-results] shakeup push failed', err),
    ),
  )

  await Promise.allSettled(work)
}

/**
 * Per-pool rank-change push fan-out. For each pool with affected users,
 * loads the full leaderboard topology, identifies neighbor crossovers,
 * and pushes per user.
 */
async function fanOutShakeups(
  adminClient: ReturnType<typeof createAdminClient>,
  allByUser: Map<string, Array<{ score: ScoreRow; poolName: string; entryName: string }>>,
  poolIds: string[],
  poolNameById: Map<string, string>,
  entryById: Map<string, { userId: string; poolId: string; entryName: string }>,
): Promise<void> {
  if (allByUser.size === 0 || poolIds.length === 0) return

  type PeerRow = {
    entry_id: string
    pool_id: string
    entry_name: string
    current_rank: number | null
    previous_rank: number | null
    member_id: string
    pool_members:
      | { member_id: string; users: { full_name: string | null; username: string | null } | Array<{ full_name: string | null; username: string | null }> | null }
      | Array<{ member_id: string; users: { full_name: string | null; username: string | null } | Array<{ full_name: string | null; username: string | null }> | null }>
      | null
  }

  const { data: rawPeers } = await adminClient
    .from('pool_entries')
    .select(
      'entry_id, pool_id, entry_name, current_rank, previous_rank, member_id,' +
        ' pool_members:pool_members!pool_entries_member_id_fkey(' +
        'member_id, users(full_name, username)' +
        ')',
    )
    .in('pool_id', poolIds)
  const peerRows = (rawPeers ?? []) as unknown as PeerRow[]

  // Index peers by pool + entry_id; build a display-name table.
  const peersByPool = new Map<string, PeerRow[]>()
  const displayNameByMember = new Map<string, string>()
  for (const p of peerRows) {
    const list = peersByPool.get(p.pool_id) ?? []
    list.push(p)
    peersByPool.set(p.pool_id, list)
    const pm = Array.isArray(p.pool_members) ? p.pool_members[0] : p.pool_members
    const u = pm?.users ? (Array.isArray(pm.users) ? pm.users[0] : pm.users) : null
    if (pm && u) {
      displayNameByMember.set(pm.member_id, u.full_name || u.username || 'Someone')
    }
  }

  // For each (user × pool) that scored, check rank movement and find the
  // closest crossover peer. One shake-up push per (user × pool) per match.
  type UserPoolPair = { userId: string; poolId: string }
  const userPoolPairs: UserPoolPair[] = []
  const seenPairs = new Set<string>()
  for (const [userId, results] of allByUser) {
    for (const r of results) {
      const key = `${userId}::${r.score.pool_id}`
      if (seenPairs.has(key)) continue
      seenPairs.add(key)
      userPoolPairs.push({ userId, poolId: r.score.pool_id })
    }
  }

  for (const { userId, poolId } of userPoolPairs) {
    const peers = peersByPool.get(poolId) ?? []
    // Scan entryById for the entry this user has in this pool.
    let myEntryId: string | null = null
    for (const [eid, info2] of entryById) {
      if (info2.userId === userId && info2.poolId === poolId) {
        myEntryId = eid
        break
      }
    }
    if (!myEntryId) continue
    const me = peers.find((p) => p.entry_id === myEntryId)
    if (!me || me.current_rank == null || me.previous_rank == null) continue
    if (me.current_rank === me.previous_rank) continue // no movement

    const delta = me.previous_rank - me.current_rank // positive = climbed
    const climbed = delta > 0

    // Find the closest peer who crossed paths.
    let neighborName: string | null = null
    if (climbed) {
      const candidates = peers
        .filter(
          (p) =>
            p.entry_id !== me.entry_id &&
            p.previous_rank != null &&
            p.current_rank != null &&
            p.previous_rank < me.previous_rank! &&
            p.current_rank > me.current_rank!,
        )
        .sort((a, b) => b.previous_rank! - a.previous_rank!)
      const top = candidates[0]
      if (top) neighborName = displayNameByMember.get(top.member_id) ?? top.entry_name
    } else {
      const candidates = peers
        .filter(
          (p) =>
            p.entry_id !== me.entry_id &&
            p.previous_rank != null &&
            p.current_rank != null &&
            p.previous_rank > me.previous_rank! &&
            p.current_rank < me.current_rank!,
        )
        .sort((a, b) => a.previous_rank! - b.previous_rank!)
      const top = candidates[0]
      if (top) neighborName = displayNameByMember.get(top.member_id) ?? top.entry_name
    }

    const arrow = climbed ? '↑' : '↓'
    const absDelta = Math.abs(delta)
    const title = climbed
      ? `${arrow} Moved up to #${me.current_rank}`
      : `${arrow} Dropped to #${me.current_rank}`
    const poolName = poolNameById.get(poolId) ?? 'Pool'
    const body = neighborName
      ? climbed
        ? `Overtook ${neighborName} in ${poolName}`
        : `${neighborName} overtook you in ${poolName}`
      : `${absDelta} spot${absDelta === 1 ? '' : 's'} in ${poolName}`

    try {
      await sendPushToUser(
        userId,
        {
          title,
          body,
          data: {
            type: 'rank_change',
            pool_id: poolId,
            old_rank: String(me.previous_rank),
            new_rank: String(me.current_rank),
          },
        },
        'LEADERBOARD',
      )
    } catch (err) {
      console.error('[match-results] shakeup send failed', userId, poolId, err)
    }
  }
}

async function detectAndPushStreak(
  adminClient: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<void> {
  // Get the user's entries across all pools, with pool names.
  const { data: rawMembers } = await adminClient
    .from('pool_members')
    .select(
      'pool_id, pools(pool_name),' +
        ' pool_entries:pool_entries!pool_entries_member_id_fkey(entry_id, entry_name)',
    )
    .eq('user_id', userId)

  type StreakMembershipRow = {
    pool_id: string
    pools: { pool_name: string } | Array<{ pool_name: string }> | null
    pool_entries: Array<{ entry_id: string; entry_name: string }> | null
  }
  const memberships = (rawMembers ?? []) as unknown as StreakMembershipRow[]

  for (const m of memberships) {
    const pool = Array.isArray(m.pools) ? m.pools[0] : m.pools
    const poolName = pool?.pool_name ?? 'Pool'
    for (const entry of m.pool_entries ?? []) {
      const { data: recent } = await adminClient
        .from('match_scores')
        .select('score_type, calculated_at')
        .eq('entry_id', entry.entry_id)
        .order('calculated_at', { ascending: false })
        .limit(10)
      if (!recent || recent.length === 0) continue

      const first = (recent[0] as { score_type: string }).score_type
      const isHot = first !== 'miss'
      let length = 0
      for (const r of recent as Array<{ score_type: string }>) {
        const isCorrect = r.score_type !== 'miss'
        if (isHot ? isCorrect : !isCorrect) length++
        else break
      }

      // Fire only at the exact milestone — and only when the streak is
      // happening on this entry's latest match (i.e., the head of the list).
      if (![3, 5, 10].includes(length)) continue

      const emoji = isHot ? '🔥' : '🧊'
      const word = isHot ? 'hot' : 'cold'
      await sendPushToUser(
        userId,
        {
          title: `${emoji} ${length}-match ${word} streak!`,
          body: `${entry.entry_name} · ${poolName}`,
          data: {
            type: 'gamification',
            sub: 'streak',
            pool_id: m.pool_id,
            streak_type: word,
            streak_length: String(length),
          },
        },
        'GAMIFICATION',
      ).catch((err) =>
        console.error('[match-results] streak push send failed', userId, err),
      )
    }
  }
}

function teamName(raw: PendingMatch['home_team']): string {
  if (!raw) return 'TBD'
  const t = Array.isArray(raw) ? raw[0] : raw
  return t?.country_name ?? 'TBD'
}

function formatOutcome(
  scoreType: 'exact' | 'winner_gd' | 'winner' | 'miss',
  points: number,
): string {
  switch (scoreType) {
    case 'exact':
      return `Exact · +${points} pts`
    case 'winner_gd':
      return `Winner + GD · +${points} pts`
    case 'winner':
      return `Winner · +${points} pts`
    case 'miss':
      return 'Miss'
  }
}

