// Server component - fetches data on the server before rendering
// Auth is handled by middleware (proxy.ts) so we don't need to check here
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Badge, getStatusVariant } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'

// =====================
// PAGE COMPONENT
// This is a dynamic route - [pool_id] comes from the URL
// =====================
export default async function LeaderboardPage({ params }: { params: Promise<{ pool_id: string }> }) {

    const { pool_id } = await params
    const supabase = await createClient()

  // =====================
  // FETCH POOL DETAILS
  // =====================
  const { data: pool } = await supabase
    .from('pools')
    .select('pool_id, pool_name, description, pool_code, status')
    .eq('pool_id', pool_id)
    .single()

  if (!pool) {
    redirect('/pools') // Pool not found, go back to pools page
  }

  // =====================
  // CHECK USER ROLE
  // =====================
  const { data: { user } } = await supabase.auth.getUser()
  let isAdmin = false
  if (user) {
    const { data: userData } = await supabase
      .from('users')
      .select('user_id')
      .eq('auth_user_id', user.id)
      .single()
    if (userData) {
      const { data: membership } = await supabase
        .from('pool_members')
        .select('role')
        .eq('pool_id', pool_id)
        .eq('user_id', userData.user_id)
        .single()
      if (membership?.role === 'admin') isAdmin = true
    }
  }

  // =====================
  // FETCH LEADERBOARD DATA
  // Get all members with their points and rank, sorted by rank
  // =====================
  const { data: members } = await supabase
    .from('pool_members')
    .select(`
      member_id,
      current_rank,
      total_points,
      role,
      users (
        user_id,
        username,
        full_name
      )
    `)
    .eq('pool_id', pool_id)
    .order('current_rank', { ascending: true, nullsFirst: false })

  // =====================
  // PAGE LAYOUT
  // =====================
  return (
    <div className="min-h-screen bg-gray-50">

      {/* Top navigation bar */}
      <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center">
        <Link href="/dashboard" className="text-xl font-bold text-gray-900">
          ⚽ World Cup Pool
        </Link>
        <div className="flex items-center gap-4">
          {isAdmin && (
            <Link href={`/pools/${pool_id}/admin`} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
              Admin Panel
            </Link>
          )}
          <Link href="/pools" className="text-sm text-gray-600 hover:text-gray-900 font-medium">
            ← Back to Pools
          </Link>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-6 py-10">

        {/* Pool header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-3xl font-bold text-gray-900">{pool.pool_name}</h2>
            <Badge variant={getStatusVariant(pool.status)}>
              {pool.status}
            </Badge>
          </div>
          {pool.description && (
            <p className="text-gray-600">{pool.description}</p>
          )}
          <p className="text-sm text-gray-400 mt-1">
            Code: <span className="font-mono font-bold text-gray-600">{pool.pool_code}</span>
          </p>
        </div>

        {/* Leaderboard title */}
        <h3 className="text-2xl font-bold text-gray-900 mb-4">📊 Leaderboard</h3>

        {/* Empty state */}
        {!members || members.length === 0 ? (
          <Card padding="lg" className="text-center">
            <p className="text-gray-500">No members in this pool yet.</p>
          </Card>
        ) : (
          /* Leaderboard table */
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Player
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Points
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Role
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {members.map((member: any, index: number) => {
                  const rank = member.current_rank || index + 1
                  const isTopThree = rank <= 3
                  
                  return (
                    <tr key={member.member_id} className={isTopThree ? 'bg-yellow-50' : ''}>
                      {/* Rank column */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {rank === 1 && <span className="text-2xl mr-2">🥇</span>}
                          {rank === 2 && <span className="text-2xl mr-2">🥈</span>}
                          {rank === 3 && <span className="text-2xl mr-2">🥉</span>}
                          <span className="text-lg font-bold text-gray-900">#{rank}</span>
                        </div>
                      </td>

                      {/* Player name column */}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {member.users?.full_name || member.users?.username || 'Unknown Player'}
                          </div>
                          {member.users?.username && member.users?.full_name && (
                            <div className="text-xs text-gray-500">@{member.users.username}</div>
                          )}
                        </div>
                      </td>

                      {/* Points column */}
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <span className="text-xl font-bold text-blue-600">
                          {member.total_points || 0}
                        </span>
                      </td>

                      {/* Role column */}
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {member.role === 'admin' && (
                          <Badge variant="blue" className="py-1">Admin</Badge>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

      </main>
    </div>
  )
}