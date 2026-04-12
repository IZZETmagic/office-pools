import { SupabaseClient } from '@supabase/supabase-js'

export type SegmentKey =
  | 'all'
  | 'pool_admins'
  | 'active_members'
  | 'inactive_users'
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
  active_members: {
    label: 'Active Members',
    description: 'Users who are in at least one pool',
  },
  inactive_users: {
    label: 'Inactive Users',
    description: 'Signed up but never joined a pool',
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
