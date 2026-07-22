import { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/supabase/paginate'

export type SegmentKey =
  | 'all'
  | 'pool_admins'
  | 'empty_pool_admins'
  | 'solo_pool_admins'
  | 'small_pool_admins'
  | 'non_admin_members'
  | 'active_members'
  | 'inactive_users'
  | 'lapsed_users'
  | 'engaged_no_pool'
  | 'past_predictors'
  | 'past_predictors_non_admin'
  | 'recent_signups'
  | 'super_admins'
  | 'bracket_fix_affected'

export const SEGMENTS: Record<SegmentKey, { label: string; description: string }> = {
  all: {
    label: 'All Users',
    description: 'Every registered user',
  },
  pool_admins: {
    label: 'Pool Admins',
    description: 'Users who have created a pool',
  },
  empty_pool_admins: {
    label: 'Empty Pool Admins',
    description: 'Pool admins with no members in their pool yet',
  },
  solo_pool_admins: {
    label: 'Solo Pool Admins',
    description: 'Pool admins who are the only member of their pool',
  },
  small_pool_admins: {
    label: 'Small Pool Admins',
    description: 'Pool admins with 2-4 members in their pool',
  },
  non_admin_members: {
    label: 'Non-Admin Members',
    description: 'Users in a pool but haven\'t created their own',
  },
  active_members: {
    label: 'Active Members',
    description: 'Users who are in at least one pool',
  },
  inactive_users: {
    label: 'Inactive Users',
    description: 'Signed up but never joined a pool',
  },
  lapsed_users: {
    label: 'Lapsed Users',
    description: 'Signed up 30+ days ago and never joined a pool',
  },
  engaged_no_pool: {
    label: 'Engaged, No Pool',
    description: 'Signed up in last 30 days but not in any pool',
  },
  past_predictors: {
    label: 'Past Predictors',
    description: 'Users who have submitted predictions before',
  },
  past_predictors_non_admin: {
    label: 'Past Predictors (non-admin)',
    description: 'Submitted predictions and does not run a pool — so pool admins can get the admin email instead',
  },
  recent_signups: {
    label: 'Recent Signups',
    description: 'Joined in the last 14 days',
  },
  super_admins: {
    label: 'Super Admins',
    description: 'Internal / test emails only',
  },
  bracket_fix_affected: {
    label: 'Bracket Fix — Affected Entries',
    description: 'Users whose R16+ picks were reset when the bracket was aligned with FIFA',
  },
}

export const SEGMENT_KEYS = Object.keys(SEGMENTS) as SegmentKey[]

type SegmentUser = {
  email: string
  full_name: string | null
  username: string
}

type SegmentUserRow = SegmentUser & { user_id: string }

// Every segment below joins two or three unbounded lists in memory, so a single truncated
// fetch quietly shrinks the audience: before pagination, `past_predictors` resolved to 146
// recipients out of 3,958 (users capped at 1,000 of 4,841, AND entries at 1,000 of 4,263).
// `fetchAllRows` (lib/supabase/paginate) pages every one of them. See that file for why.
const fetchAll = fetchAllRows

/** Base query for every user with an email — chain filters onto it, then `.range()`. */
function usersQuery(supabase: SupabaseClient) {
  return supabase
    .from('users')
    .select('email, full_name, username, user_id')
    .not('email', 'is', null)
}

/** Every user with an email, paged. */
function allUsers(supabase: SupabaseClient): Promise<SegmentUserRow[]> {
  return fetchAll<SegmentUserRow>((from, to) => usersQuery(supabase).range(from, to))
}

/** user_ids that admin at least one pool. */
async function adminUserIds(supabase: SupabaseClient): Promise<Set<string>> {
  const pools = await fetchAll<{ admin_user_id: string }>((from, to) =>
    supabase.from('pools').select('admin_user_id').range(from, to)
  )
  return new Set(pools.map((p) => p.admin_user_id))
}

/** user_ids that belong to at least one pool. */
async function memberUserIds(supabase: SupabaseClient): Promise<Set<string>> {
  const members = await fetchAll<{ user_id: string }>((from, to) =>
    supabase.from('pool_members').select('user_id').range(from, to)
  )
  return new Set(members.map((m) => m.user_id))
}

/** How many members each pool has. */
async function memberCountByPool(supabase: SupabaseClient): Promise<Map<string, number>> {
  const members = await fetchAll<{ pool_id: string }>((from, to) =>
    supabase.from('pool_members').select('pool_id').range(from, to)
  )
  const counts = new Map<string, number>()
  for (const m of members) {
    counts.set(m.pool_id, (counts.get(m.pool_id) || 0) + 1)
  }
  return counts
}

/** Pools with their admin, paged. */
function allPools(supabase: SupabaseClient): Promise<{ pool_id: string; admin_user_id: string }[]> {
  return fetchAll<{ pool_id: string; admin_user_id: string }>((from, to) =>
    supabase.from('pools').select('pool_id, admin_user_id').range(from, to)
  )
}

/** user_ids that have ever submitted predictions for an entry. */
async function predictorUserIds(supabase: SupabaseClient): Promise<Set<string>> {
  // PostgREST returns the embedded to-one row as an object, but supabase-js types the
  // embed as an array — accept either shape rather than casting through `any`.
  type Embedded = { user_id: string }
  const entries = await fetchAll<{ pool_members: Embedded | Embedded[] }>((from, to) =>
    supabase
      .from('pool_entries')
      .select('member_id, pool_members!inner(user_id)')
      .eq('has_submitted_predictions', true)
      .range(from, to)
  )
  const ids = new Set<string>()
  for (const e of entries) {
    const member = Array.isArray(e.pool_members) ? e.pool_members[0] : e.pool_members
    if (member?.user_id) ids.add(member.user_id)
  }
  return ids
}

/** Admins of pools whose member count satisfies `matches`. */
async function adminIdsByPoolSize(
  supabase: SupabaseClient,
  matches: (memberCount: number) => boolean
): Promise<Set<string>> {
  const [pools, counts] = await Promise.all([allPools(supabase), memberCountByPool(supabase)])
  return new Set(
    pools.filter((p) => matches(counts.get(p.pool_id) || 0)).map((p) => p.admin_user_id)
  )
}

export async function querySegment(
  supabase: SupabaseClient,
  segment: SegmentKey
): Promise<SegmentUser[]> {
  switch (segment) {
    case 'all': {
      return allUsers(supabase)
    }

    case 'pool_admins': {
      const [users, adminIds] = await Promise.all([allUsers(supabase), adminUserIds(supabase)])
      return users.filter((u) => adminIds.has(u.user_id))
    }

    case 'empty_pool_admins': {
      const [users, adminIds] = await Promise.all([
        allUsers(supabase),
        adminIdsByPoolSize(supabase, (count) => count === 0),
      ])
      return users.filter((u) => adminIds.has(u.user_id))
    }

    case 'solo_pool_admins': {
      const [users, adminIds] = await Promise.all([
        allUsers(supabase),
        adminIdsByPoolSize(supabase, (count) => count === 1),
      ])
      return users.filter((u) => adminIds.has(u.user_id))
    }

    case 'small_pool_admins': {
      const [users, adminIds] = await Promise.all([
        allUsers(supabase),
        adminIdsByPoolSize(supabase, (count) => count >= 2 && count <= 4),
      ])
      return users.filter((u) => adminIds.has(u.user_id))
    }

    case 'non_admin_members': {
      const [users, adminIds, memberIds] = await Promise.all([
        allUsers(supabase),
        adminUserIds(supabase),
        memberUserIds(supabase),
      ])
      return users.filter((u) => memberIds.has(u.user_id) && !adminIds.has(u.user_id))
    }

    case 'active_members': {
      const [users, memberIds] = await Promise.all([allUsers(supabase), memberUserIds(supabase)])
      return users.filter((u) => memberIds.has(u.user_id))
    }

    case 'inactive_users': {
      const [users, memberIds] = await Promise.all([allUsers(supabase), memberUserIds(supabase)])
      return users.filter((u) => !memberIds.has(u.user_id))
    }

    case 'lapsed_users': {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const [users, memberIds] = await Promise.all([
        fetchAll<SegmentUserRow>((from, to) =>
          usersQuery(supabase).lt('created_at', thirtyDaysAgo).range(from, to)
        ),
        memberUserIds(supabase),
      ])
      return users.filter((u) => !memberIds.has(u.user_id))
    }

    case 'engaged_no_pool': {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const [users, memberIds] = await Promise.all([
        fetchAll<SegmentUserRow>((from, to) =>
          usersQuery(supabase).gte('created_at', thirtyDaysAgo).range(from, to)
        ),
        memberUserIds(supabase),
      ])
      return users.filter((u) => !memberIds.has(u.user_id))
    }

    case 'past_predictors': {
      const [users, predictorIds] = await Promise.all([
        allUsers(supabase),
        predictorUserIds(supabase),
      ])
      return users.filter((u) => predictorIds.has(u.user_id))
    }

    case 'past_predictors_non_admin': {
      const [users, predictorIds, adminIds] = await Promise.all([
        allUsers(supabase),
        predictorUserIds(supabase),
        adminUserIds(supabase),
      ])
      return users.filter((u) => predictorIds.has(u.user_id) && !adminIds.has(u.user_id))
    }

    case 'recent_signups': {
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      return fetchAll<SegmentUserRow>((from, to) =>
        usersQuery(supabase).gte('created_at', fourteenDaysAgo).range(from, to)
      )
    }

    case 'super_admins': {
      return fetchAll<SegmentUserRow>((from, to) =>
        usersQuery(supabase).eq('is_super_admin', true).range(from, to)
      )
    }

    case 'bracket_fix_affected': {
      // HISTORICAL — built for the one-shot July 2026 bracket-fix send and kept for the
      // audit trail. Deliberately NOT converted to fetchAll: the `predictions` scan below
      // would page through six figures of rows, and the `.in(entry_id, …)` list would blow
      // the URL length. It is truncation-prone by the same 1,000-row cap as everything else
      // above; re-derive it in SQL before ever reusing it.
      //
      // Affected = entries that had R16+ picks invalidated.
      // Two sources:
      //   1. Entries that have any bracket_picker_knockout_picks row (the R16+ rows were deleted by the bracket-fix migration; R32 rows remaining identify bracket-picker entries that need to re-pick R16+).
      //   2. Entries that have at least one predictions row pointing at an R16/QF/SF/3rd/Final match (full-tournament-mode users whose score picks were made against the old bracket structure).
      const { data: pickerEntries } = await supabase
        .from('bracket_picker_knockout_picks')
        .select('entry_id')
      const pickerEntryIds = new Set((pickerEntries || []).map((r) => r.entry_id))

      const { data: knockoutMatches } = await supabase
        .from('matches')
        .select('match_id')
        .in('stage', ['round_16', 'quarter_final', 'semi_final', 'third_place', 'final'])
      const knockoutMatchIds = (knockoutMatches || []).map((m) => m.match_id)

      let fullTournamentEntryIds = new Set<string>()
      if (knockoutMatchIds.length > 0) {
        const { data: ftPredictions } = await supabase
          .from('predictions')
          .select('entry_id')
          .in('match_id', knockoutMatchIds)
        fullTournamentEntryIds = new Set((ftPredictions || []).map((r) => r.entry_id))
      }

      const affectedEntryIds = Array.from(new Set([...pickerEntryIds, ...fullTournamentEntryIds]))
      if (affectedEntryIds.length === 0) return []

      const { data: entries } = await supabase
        .from('pool_entries')
        .select(`
          entry_id,
          pool_members!inner(user_id, users!inner(email, full_name, username))
        `)
        .in('entry_id', affectedEntryIds)
      if (!entries) return []

      const seen = new Set<string>()
      const result: SegmentUser[] = []
      for (const e of entries) {
        const member = e.pool_members as any
        const user = member.users
        if (!user?.email || seen.has(user.email)) continue
        seen.add(user.email)
        result.push({
          email: user.email,
          full_name: user.full_name,
          username: user.username,
        })
      }
      return result
    }

    default:
      return []
  }
}
