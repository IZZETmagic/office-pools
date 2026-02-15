import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SuperAdminDashboard } from './SuperAdminDashboard'

// =============================================
// TYPES
// =============================================
export type SuperMatchData = {
  match_id: string
  tournament_id: string
  match_number: number
  stage: string
  group_letter: string | null
  home_team_id: string | null
  away_team_id: string | null
  home_team_placeholder: string | null
  away_team_placeholder: string | null
  match_date: string
  venue: string | null
  status: string
  home_score_ft: number | null
  away_score_ft: number | null
  home_score_pso: number | null
  away_score_pso: number | null
  winner_team_id: string | null
  is_completed: boolean
  completed_at: string | null
  home_team: { country_name: string } | null
  away_team: { country_name: string } | null
  tournaments: { name: string } | null
}

export type SuperUserData = {
  user_id: string
  auth_user_id: string | null
  email: string
  username: string
  full_name: string | null
  is_super_admin: boolean
  is_active: boolean
  created_at: string
  last_login: string | null
}

export type SuperPoolData = {
  pool_id: string
  pool_name: string
  pool_code: string
  description: string | null
  status: string
  tournament_id: string
  admin_user_id: string
  created_at: string
  tournaments: { name: string } | null
  admin_user: { username: string; email: string } | null
  pool_members: { count: number }[]
}

export type AuditLogData = {
  log_id: string
  match_id: string | null
  reset_by_user_id: string | null
  reset_at: string
  previous_home_score: number | null
  previous_away_score: number | null
  previous_home_pso: number | null
  previous_away_pso: number | null
  previous_status: string | null
  action_type: string | null
  reason: string | null
  matches: {
    match_number: number
    home_team: { country_name: string } | null
    away_team: { country_name: string } | null
  } | null
  users: { username: string; email: string } | null
}

// =============================================
// SERVER COMPONENT - auth check & data fetching
// =============================================
export default async function SuperAdminPage() {
  const supabase = await createClient()

  // STEP 1: Authenticate
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // STEP 2: Verify super admin status
  const { data: userData } = await supabase
    .from('users')
    .select('user_id, is_super_admin')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData || !userData.is_super_admin) {
    redirect('/dashboard?error=super_admin_required')
  }

  // STEP 3: Fetch all data in parallel
  const [matchesRes, usersRes, poolsRes, auditRes] = await Promise.all([
    // All matches with team names
    supabase
      .from('matches')
      .select(
        `
        *,
        home_team:teams!matches_home_team_id_fkey(country_name),
        away_team:teams!matches_away_team_id_fkey(country_name),
        tournaments(name)
      `
      )
      .order('match_number', { ascending: true }),

    // All users
    supabase
      .from('users')
      .select('user_id, auth_user_id, email, username, full_name, is_super_admin, is_active, created_at, last_login')
      .order('created_at', { ascending: false }),

    // All pools with member counts and admin info
    supabase
      .from('pools')
      .select(
        `
        *,
        tournaments(name),
        admin_user:users!pools_admin_user_id_fkey(username, email),
        pool_members(count)
      `
      )
      .order('created_at', { ascending: false }),

    // Audit logs
    supabase
      .from('match_reset_log')
      .select(
        `
        *,
        matches(match_number, home_team:teams!matches_home_team_id_fkey(country_name), away_team:teams!matches_away_team_id_fkey(country_name)),
        users(username, email)
      `
      )
      .order('reset_at', { ascending: false })
      .limit(100),
  ])

  // Normalize team data
  const matches: SuperMatchData[] = (matchesRes.data || []).map((m: any) => ({
    ...m,
    home_team: Array.isArray(m.home_team) ? m.home_team[0] ?? null : m.home_team,
    away_team: Array.isArray(m.away_team) ? m.away_team[0] ?? null : m.away_team,
    tournaments: Array.isArray(m.tournaments) ? m.tournaments[0] ?? null : m.tournaments,
  }))

  const users = (usersRes.data || []) as SuperUserData[]

  const pools: SuperPoolData[] = (poolsRes.data || []).map((p: any) => ({
    ...p,
    tournaments: Array.isArray(p.tournaments) ? p.tournaments[0] ?? null : p.tournaments,
    admin_user: Array.isArray(p.admin_user) ? p.admin_user[0] ?? null : p.admin_user,
  }))

  // Normalize audit log data
  const auditLogs: AuditLogData[] = (auditRes.data || []).map((a: any) => {
    const matchData = Array.isArray(a.matches) ? a.matches[0] ?? null : a.matches
    return {
      ...a,
      matches: matchData
        ? {
            ...matchData,
            home_team: Array.isArray(matchData.home_team)
              ? matchData.home_team[0] ?? null
              : matchData.home_team,
            away_team: Array.isArray(matchData.away_team)
              ? matchData.away_team[0] ?? null
              : matchData.away_team,
          }
        : null,
      users: Array.isArray(a.users) ? a.users[0] ?? null : a.users,
    }
  })

  return (
    <SuperAdminDashboard
      matches={matches}
      users={users}
      pools={pools}
      auditLogs={auditLogs}
      currentUserId={userData.user_id}
    />
  )
}
