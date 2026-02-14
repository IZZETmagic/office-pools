import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ResultsView } from './ResultsView'
import type { ResultMatch } from './MatchCard'
import { DEFAULT_POOL_SETTINGS, type PoolSettings } from './points'

// =============================================
// SERVER COMPONENT – data fetching
// =============================================
export default async function ResultsPage({
  params,
}: {
  params: Promise<{ pool_id: string }>
}) {
  const { pool_id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // ── Resolve user_id ──
  const { data: userData } = await supabase
    .from('users')
    .select('user_id')
    .eq('auth_user_id', user?.id)
    .single()

  if (!userData) redirect('/pools')

  // ── Fetch pool details ──
  const { data: pool } = await supabase
    .from('pools')
    .select('pool_id, pool_name, pool_code, tournament_id')
    .eq('pool_id', pool_id)
    .single()

  if (!pool) redirect('/pools')

  // ── Get member_id and role ──
  const { data: membership } = await supabase
    .from('pool_members')
    .select('member_id, role')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()

  if (!membership) redirect('/pools')

  const isAdmin = membership.role === 'admin'

  // ── Fetch pool settings ──
  const { data: rawPoolSettings } = await supabase
    .from('pool_settings')
    .select('*')
    .eq('pool_id', pool_id)
    .single()

  const poolSettings: PoolSettings = rawPoolSettings
    ? { ...DEFAULT_POOL_SETTINGS, ...rawPoolSettings }
    : DEFAULT_POOL_SETTINGS

  // ── Fetch all matches with team info ──
  const { data: rawMatches } = await supabase
    .from('matches')
    .select(
      `
      match_id,
      match_number,
      stage,
      group_letter,
      match_date,
      venue,
      status,
      home_score_ft,
      away_score_ft,
      home_team_placeholder,
      away_team_placeholder,
      home_team:teams!matches_home_team_id_fkey(country_name, country_code),
      away_team:teams!matches_away_team_id_fkey(country_name, country_code)
    `
    )
    .eq('tournament_id', pool.tournament_id)
    .order('match_date', { ascending: true })
    .order('match_number', { ascending: true })

  // ── Fetch predictions for this member (all matches) ──
  const { data: rawPredictions } = await supabase
    .from('predictions')
    .select('match_id, predicted_home_score, predicted_away_score')
    .eq('member_id', membership.member_id)

  // Build a prediction lookup map
  const predictionMap = new Map(
    (rawPredictions ?? []).map((p: any) => [p.match_id, p])
  )

  // ── Transform into ResultMatch[] ──
  const matches: ResultMatch[] = (rawMatches ?? []).map((m: any) => ({
    match_id: m.match_id,
    match_number: m.match_number,
    stage: m.stage,
    group_letter: m.group_letter,
    match_date: m.match_date,
    venue: m.venue,
    status: m.status,
    home_score_ft: m.home_score_ft,
    away_score_ft: m.away_score_ft,
    home_team_placeholder: m.home_team_placeholder,
    away_team_placeholder: m.away_team_placeholder,
    home_team: Array.isArray(m.home_team)
      ? m.home_team[0] ?? null
      : m.home_team,
    away_team: Array.isArray(m.away_team)
      ? m.away_team[0] ?? null
      : m.away_team,
    prediction: predictionMap.get(m.match_id)
      ? {
          predicted_home_score: (predictionMap.get(m.match_id) as any)
            .predicted_home_score,
          predicted_away_score: (predictionMap.get(m.match_id) as any)
            .predicted_away_score,
        }
      : null,
  }))

  // =============================================
  // RENDER
  // =============================================
  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Nav bar ── */}
      <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
        <Link
          href="/dashboard"
          className="text-xl font-bold text-gray-900"
        >
          World Cup Pool
        </Link>
        <div className="flex items-center gap-4">
          {isAdmin && (
            <Link href={`/pools/${pool_id}/admin`} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              Admin Panel
            </Link>
          )}
          <Link
            href="/pools"
            className="text-sm text-gray-600 hover:text-gray-900 font-medium"
          >
            &larr; Back to Pools
          </Link>
        </div>
      </nav>

      {/* ── Content ── */}
      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Pool header */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-1">
            {pool.pool_name}
          </h2>
          <p className="text-sm text-gray-400">
            Code:{' '}
            <span className="font-mono font-bold text-gray-600">
              {pool.pool_code}
            </span>
          </p>
        </div>

        <h3 className="text-2xl font-bold text-gray-900 mb-6">
          Match Results
        </h3>

        {matches.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center">
            <p className="text-gray-500">
              No matches available for this tournament yet.
            </p>
          </div>
        ) : (
          <ResultsView matches={matches} poolSettings={poolSettings} />
        )}
      </main>
    </div>
  )
}
