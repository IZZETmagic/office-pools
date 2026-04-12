import { SupabaseClient } from '@supabase/supabase-js'

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
  | 'recent_signups'
  | 'super_admins'

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
  recent_signups: {
    label: 'Recent Signups',
    description: 'Joined in the last 14 days',
  },
  super_admins: {
    label: 'Super Admins',
    description: 'Internal / test emails only',
  },
}

export const SEGMENT_KEYS = Object.keys(SEGMENTS) as SegmentKey[]

type SegmentUser = {
  email: string
  full_name: string | null
  username: string
}

export async function querySegment(
  supabase: SupabaseClient,
  segment: SegmentKey
): Promise<SegmentUser[]> {
  switch (segment) {
    case 'all': {
      const { data } = await supabase
        .from('users')
        .select('email, full_name, username')
        .not('email', 'is', null)
      return data || []
    }

    case 'pool_admins': {
      const { data } = await supabase
        .from('users')
        .select('email, full_name, username, user_id')
        .not('email', 'is', null)
      if (!data) return []
      const { data: pools } = await supabase
        .from('pools')
        .select('admin_user_id')
      const adminIds = new Set((pools || []).map((p) => p.admin_user_id))
      return data.filter((u) => adminIds.has(u.user_id))
    }

    case 'empty_pool_admins': {
      const { data: users } = await supabase
        .from('users')
        .select('email, full_name, username, user_id')
        .not('email', 'is', null)
      if (!users) return []
      const { data: pools } = await supabase
        .from('pools')
        .select('pool_id, admin_user_id')
      if (!pools) return []
      const { data: members } = await supabase
        .from('pool_members')
        .select('pool_id')
      const memberCountByPool = new Map<string, number>()
      for (const m of members || []) {
        memberCountByPool.set(m.pool_id, (memberCountByPool.get(m.pool_id) || 0) + 1)
      }
      const emptyPoolAdminIds = new Set(
        pools
          .filter((p) => !memberCountByPool.has(p.pool_id) || memberCountByPool.get(p.pool_id) === 0)
          .map((p) => p.admin_user_id)
      )
      return users.filter((u) => emptyPoolAdminIds.has(u.user_id))
    }

    case 'solo_pool_admins': {
      const { data: users } = await supabase
        .from('users')
        .select('email, full_name, username, user_id')
        .not('email', 'is', null)
      if (!users) return []
      const { data: pools } = await supabase
        .from('pools')
        .select('pool_id, admin_user_id')
      if (!pools) return []
      const { data: members } = await supabase
        .from('pool_members')
        .select('pool_id')
      const memberCountByPool = new Map<string, number>()
      for (const m of members || []) {
        memberCountByPool.set(m.pool_id, (memberCountByPool.get(m.pool_id) || 0) + 1)
      }
      const soloAdminIds = new Set(
        pools
          .filter((p) => memberCountByPool.get(p.pool_id) === 1)
          .map((p) => p.admin_user_id)
      )
      return users.filter((u) => soloAdminIds.has(u.user_id))
    }

    case 'small_pool_admins': {
      const { data: users } = await supabase
        .from('users')
        .select('email, full_name, username, user_id')
        .not('email', 'is', null)
      if (!users) return []
      const { data: pools } = await supabase
        .from('pools')
        .select('pool_id, admin_user_id')
      if (!pools) return []
      const { data: members } = await supabase
        .from('pool_members')
        .select('pool_id')
      const memberCountByPool = new Map<string, number>()
      for (const m of members || []) {
        memberCountByPool.set(m.pool_id, (memberCountByPool.get(m.pool_id) || 0) + 1)
      }
      const smallPoolAdminIds = new Set(
        pools
          .filter((p) => {
            const count = memberCountByPool.get(p.pool_id) || 0
            return count >= 2 && count <= 4
          })
          .map((p) => p.admin_user_id)
      )
      return users.filter((u) => smallPoolAdminIds.has(u.user_id))
    }

    case 'non_admin_members': {
      const { data: users } = await supabase
        .from('users')
        .select('email, full_name, username, user_id')
        .not('email', 'is', null)
      if (!users) return []
      const { data: pools } = await supabase
        .from('pools')
        .select('admin_user_id')
      const adminIds = new Set((pools || []).map((p) => p.admin_user_id))
      const { data: members } = await supabase
        .from('pool_members')
        .select('user_id')
      const memberIds = new Set((members || []).map((m) => m.user_id))
      return users.filter((u) => memberIds.has(u.user_id) && !adminIds.has(u.user_id))
    }

    case 'active_members': {
      const { data } = await supabase
        .from('users')
        .select('email, full_name, username, user_id')
        .not('email', 'is', null)
      if (!data) return []
      const { data: members } = await supabase
        .from('pool_members')
        .select('user_id')
      const memberIds = new Set((members || []).map((m) => m.user_id))
      return data.filter((u) => memberIds.has(u.user_id))
    }

    case 'inactive_users': {
      const { data } = await supabase
        .from('users')
        .select('email, full_name, username, user_id')
        .not('email', 'is', null)
      if (!data) return []
      const { data: members } = await supabase
        .from('pool_members')
        .select('user_id')
      const memberIds = new Set((members || []).map((m) => m.user_id))
      return data.filter((u) => !memberIds.has(u.user_id))
    }

    case 'lapsed_users': {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('users')
        .select('email, full_name, username, user_id')
        .not('email', 'is', null)
        .lt('created_at', thirtyDaysAgo)
      if (!data) return []
      const { data: members } = await supabase
        .from('pool_members')
        .select('user_id')
      const memberIds = new Set((members || []).map((m) => m.user_id))
      return data.filter((u) => !memberIds.has(u.user_id))
    }

    case 'engaged_no_pool': {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('users')
        .select('email, full_name, username, user_id')
        .not('email', 'is', null)
        .gte('created_at', thirtyDaysAgo)
      if (!data) return []
      const { data: members } = await supabase
        .from('pool_members')
        .select('user_id')
      const memberIds = new Set((members || []).map((m) => m.user_id))
      return data.filter((u) => !memberIds.has(u.user_id))
    }

    case 'past_predictors': {
      const { data: users } = await supabase
        .from('users')
        .select('email, full_name, username, user_id')
        .not('email', 'is', null)
      if (!users) return []
      const { data: entries } = await supabase
        .from('pool_entries')
        .select('member_id, pool_members!inner(user_id)')
        .eq('has_submitted_predictions', true)
      const predictorIds = new Set(
        (entries || []).map((e) => (e.pool_members as any).user_id as string)
      )
      return users.filter((u) => predictorIds.has(u.user_id))
    }

    case 'recent_signups': {
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('users')
        .select('email, full_name, username')
        .not('email', 'is', null)
        .gte('created_at', fourteenDaysAgo)
      return data || []
    }

    case 'super_admins': {
      const { data } = await supabase
        .from('users')
        .select('email, full_name, username')
        .not('email', 'is', null)
        .eq('is_super_admin', true)
      return data || []
    }

    default:
      return []
  }
}
