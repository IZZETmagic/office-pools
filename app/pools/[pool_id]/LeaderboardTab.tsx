'use client'

import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import type { MemberData } from './types'

type LeaderboardTabProps = {
  members: MemberData[]
}

export function LeaderboardTab({ members }: LeaderboardTabProps) {
  // Sort by rank
  const sorted = [...members].sort(
    (a, b) => (a.current_rank ?? 999) - (b.current_rank ?? 999)
  )

  if (sorted.length === 0) {
    return (
      <Card padding="lg" className="text-center">
        <p className="text-gray-600">No members in this pool yet.</p>
      </Card>
    )
  }

  return (
    <>
      {/* Mobile card view */}
      <div className="sm:hidden space-y-2">
        {sorted.map((member, index) => {
          const rank = member.current_rank || index + 1
          const isTopThree = rank <= 3

          return (
            <div
              key={member.member_id}
              className={`flex items-center gap-3 p-3 rounded-lg border ${
                isTopThree ? 'bg-yellow-50 border-yellow-200' : 'bg-white border-gray-200'
              }`}
            >
              {/* Rank */}
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                {rank === 1 && <span className="text-lg">🥇</span>}
                {rank === 2 && <span className="text-lg">🥈</span>}
                {rank === 3 && <span className="text-lg">🥉</span>}
                {rank > 3 && <span className="text-sm font-bold text-gray-700">#{rank}</span>}
              </div>

              {/* Player info */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {member.users?.full_name || member.users?.username || 'Unknown Player'}
                </div>
                <div className="flex items-center gap-1.5">
                  {member.users?.username && member.users?.full_name && (
                    <span className="text-xs text-gray-500">@{member.users.username}</span>
                  )}
                  {member.role === 'admin' && (
                    <Badge variant="blue">Admin</Badge>
                  )}
                </div>
              </div>

              {/* Points */}
              <div className="flex-shrink-0 text-right">
                <div className="text-lg font-bold text-blue-600">{member.total_points || 0}</div>
                <div className="text-[10px] text-gray-500 uppercase">pts</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Desktop table view */}
      <div className="hidden sm:block bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Rank
              </th>
              <th className="px-4 md:px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">
                Player
              </th>
              <th className="px-4 md:px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">
                Points
              </th>
              <th className="px-4 md:px-6 py-3 text-center text-xs font-medium text-gray-700 uppercase tracking-wider">
                Role
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {sorted.map((member, index) => {
              const rank = member.current_rank || index + 1
              const isTopThree = rank <= 3

              return (
                <tr key={member.member_id} className={isTopThree ? 'bg-yellow-50' : ''}>
                  <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      {rank === 1 && <span className="text-2xl mr-2">🥇</span>}
                      {rank === 2 && <span className="text-2xl mr-2">🥈</span>}
                      {rank === 3 && <span className="text-2xl mr-2">🥉</span>}
                      <span className="text-lg font-bold text-gray-900">#{rank}</span>
                    </div>
                  </td>
                  <td className="px-4 md:px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {member.users?.full_name || member.users?.username || 'Unknown Player'}
                      </div>
                      {member.users?.username && member.users?.full_name && (
                        <div className="text-xs text-gray-600">@{member.users.username}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 md:px-6 py-4 whitespace-nowrap text-right">
                    <span className="text-xl font-bold text-blue-600">
                      {member.total_points || 0}
                    </span>
                  </td>
                  <td className="px-4 md:px-6 py-4 whitespace-nowrap text-center">
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
    </>
  )
}
