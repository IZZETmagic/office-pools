import { createClient, createAdminClient } from '@/lib/supabase/server'
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
  data_source: 'api' | 'manual' | null
  external_match_id: string | null
  last_synced_at: string | null
  live_minute: number | null
  live_period: string | null
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
  prediction_mode: string
  tournament_id: string
  admin_user_id: string
  created_at: string
  tournaments: { name: string } | null
  admin_user: { username: string; email: string } | null
  pool_members: { count: number }[]
  // Entry fee
  entry_fee: number | null
  entry_fee_currency: string
  // Branding fields
  brand_name: string | null
  brand_slug: string | null
  brand_emoji: string | null
  brand_color: string | null
  brand_accent: string | null
  brand_logo_url: string | null
  brand_landing_url: string | null
  // Branded pool prizes
  brand_prize_1st: string | null
  brand_prize_2nd: string | null
  brand_prize_3rd: string | null
}

export type SubscriptionPeriodData = {
  period_id: string
  provider: string
  plan_name: string
  monthly_cost_cents: number
  currency: string
  start_date: string
  ended_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type AuditLogData = {
  id: string
  action: string
  performed_by: string
  performed_at: string
  match_id: string | null
  target_user_id: string | null
  pool_id: string | null
  details: Record<string, any>
  summary: string | null
  performer: { username: string; email: string } | null
  matches: {
    match_number: number
    home_team: { country_name: string } | null
    away_team: { country_name: string } | null
  } | null
  target_user: { username: string; email: string } | null
}

// =============================================
// HELPERS
// =============================================

// Supabase / PostgREST caps every response at 1000 rows server-side
// (the Supabase project's db-max-rows setting). The client-side .range()
// only narrows the request — it can't ask for more than 1000 rows in a
// single trip. So we paginate until the server returns a partial page.
//
// At ~1700 users this is 2 round-trips. Negligible IO impact; this page
// loads only for super admins, a handful of times per day.
async function fetchAllUsers(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ data: SuperUserData[] }> {
  const PAGE_SIZE = 1000
  const all: SuperUserData[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('users')
      .select(
        'user_id, auth_user_id, email, username, full_name, is_super_admin, is_active, created_at, last_login'
      )
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as SuperUserData[]))
    if (data.length < PAGE_SIZE) break // last page reached
  }
  return { data: all }
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

  // STEP 3: Fetch all data in parallel.
  // Read through the service-role client so the dashboard shows EVERY pool/user,
  // not just rows the signed-in super admin happens to be a member of (RLS would
  // otherwise filter pools/users to the admin's own memberships). The page is
  // already gated by the is_super_admin check above.
  const admin = createAdminClient()
  const [matchesRes, usersRes, poolsRes, auditRes, subscriptionsRes] = await Promise.all([
    // All matches with team names
    admin
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

    // All users — paginated (Supabase hard-caps each response at 1000 rows
    // server-side; see fetchAllUsers above).
    fetchAllUsers(admin),

    // All pools with member counts and admin info
    admin
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
    admin
      .from('admin_audit_log')
      .select(
        `
        *,
        performer:users!admin_audit_log_performed_by_fkey(username, email),
        matches(match_number, home_team:teams!matches_home_team_id_fkey(country_name), away_team:teams!matches_away_team_id_fkey(country_name)),
        target_user:users!admin_audit_log_target_user_id_fkey(username, email)
      `
      )
      .order('performed_at', { ascending: false })
      .limit(100),

    // Subscription periods
    admin
      .from('subscription_periods')
      .select('*')
      .order('provider', { ascending: true })
      .order('start_date', { ascending: false }),
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
      performer: Array.isArray(a.performer) ? a.performer[0] ?? null : a.performer,
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
      target_user: Array.isArray(a.target_user) ? a.target_user[0] ?? null : a.target_user,
    }
  })

  const subscriptionPeriods = (subscriptionsRes.data || []) as SubscriptionPeriodData[]

  return (
    <SuperAdminDashboard
      matches={matches}
      users={users}
      pools={pools}
      auditLogs={auditLogs}
      subscriptionPeriods={subscriptionPeriods}
      currentUserId={userData.user_id}
    />
  )
}
