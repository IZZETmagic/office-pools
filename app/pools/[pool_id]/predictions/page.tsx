// Server component - fetches data on the server before rendering
// Auth is handled by middleware (proxy.ts) so we don't need to check here
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import PredictionsFlow from '@/components/predictions/PredictionsFlow'
import { Alert } from '@/components/ui/Alert'
import { Card } from '@/components/ui/Card'

// =====================
// PAGE COMPONENT
// =====================
export default async function PredictionsPage({ params }: { params: Promise<{ pool_id: string }> }) {

  const { pool_id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Get user_id from users table
  const { data: userData } = await supabase
    .from('users')
    .select('user_id')
    .eq('auth_user_id', user?.id)
    .single()

  if (!userData) {
    redirect('/pools')
  }

  // =====================
  // FETCH POOL DETAILS
  // =====================
  const { data: pool } = await supabase
    .from('pools')
    .select('pool_id, pool_name, pool_code, prediction_deadline, tournament_id')
    .eq('pool_id', pool_id)
    .single()

  if (!pool) {
    redirect('/pools')
  }

  // =====================
  // GET MEMBER_ID
  // Predictions are linked to member_id, not user_id
  // =====================
  const { data: membership } = await supabase
    .from('pool_members')
    .select('member_id, role')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()

  if (!membership) {
    redirect('/pools')
  }

  const isAdmin = membership.role === 'admin'

  // =====================
  // FETCH ALL TEAMS
  // =====================
  const { data: rawTeams } = await supabase
    .from('teams')
    .select('team_id, country_name, country_code, group_letter, fifa_ranking_points, flag_url')
    .order('group_letter', { ascending: true })
    .order('fifa_ranking_points', { ascending: false })

  const teams = rawTeams || []

  // =====================
  // FETCH MATCHES
  // Get all matches for this tournament (all stages)
  // =====================
  const { data: rawMatches } = await supabase
    .from('matches')
    .select(`
      match_id,
      match_number,
      stage,
      group_letter,
      match_date,
      venue,
      status,
      home_team_id,
      away_team_id,
      home_team_placeholder,
      away_team_placeholder,
      home_team:teams!matches_home_team_id_fkey(country_name, flag_url),
      away_team:teams!matches_away_team_id_fkey(country_name, flag_url)
    `)
    .eq('tournament_id', pool.tournament_id)
    .order('match_number', { ascending: true })

  // Transform the data - convert team arrays to single objects
  const matches = rawMatches?.map((match: any) => ({
    ...match,
    home_team: Array.isArray(match.home_team) ? match.home_team[0] : match.home_team,
    away_team: Array.isArray(match.away_team) ? match.away_team[0] : match.away_team,
  })) || []

  // =====================
  // FETCH EXISTING PREDICTIONS
  // =====================
  const { data: existingPredictions } = await supabase
    .from('predictions')
    .select('match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id, prediction_id')
    .eq('member_id', membership.member_id)

  // Check if deadline has passed
  const isPastDeadline = pool.prediction_deadline
    ? new Date(pool.prediction_deadline) < new Date()
    : false

  // =====================
  // PAGE LAYOUT
  // =====================
  return (
    <div className="min-h-screen bg-gray-50">

      {/* Top navigation bar */}
      <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
        <Link href="/dashboard" className="text-xl font-bold text-gray-900">
          World Cup Pool
        </Link>
        <div className="flex items-center gap-4">
          {isAdmin && (
            <Link href={`/pools/${pool_id}/admin`} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              Admin Panel
            </Link>
          )}
          <Link href="/pools" className="text-sm text-gray-600 hover:text-gray-900 font-medium">
            Back to Pools
          </Link>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-6 py-10">

        {/* Pool header */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">{pool.pool_name}</h2>
          <p className="text-sm text-gray-500">
            Code: <span className="font-mono font-bold text-gray-600">{pool.pool_code}</span>
          </p>
          {pool.prediction_deadline && (
            <p className="text-sm text-gray-500 mt-1">
              Deadline: {new Date(pool.prediction_deadline).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              })}
              {isPastDeadline && <span className="text-red-600 font-semibold ml-2">(Passed)</span>}
            </p>
          )}
        </div>

        <h3 className="text-2xl font-bold text-gray-900 mb-4">Make Your Predictions</h3>

        {/* Deadline warning */}
        {isPastDeadline && (
          <Alert variant="error" className="mb-6">
            The prediction deadline has passed. You can no longer submit or edit predictions.
          </Alert>
        )}

        {/* No matches */}
        {matches.length === 0 ? (
          <Card padding="lg" className="text-center">
            <p className="text-gray-500">No matches available for predictions.</p>
          </Card>
        ) : (
          /* Predictions flow */
          <PredictionsFlow
            matches={matches}
            teams={teams}
            memberId={membership.member_id}
            existingPredictions={existingPredictions || []}
            isPastDeadline={isPastDeadline}
          />
        )}

      </main>
    </div>
  )
}
