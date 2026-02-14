'use client'

import { ThirdPlaceTeam } from '@/lib/tournament'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'

type Props = {
  rankedThirds: ThirdPlaceTeam[]
}

export function ThirdPlaceTable({ rankedThirds }: Props) {
  if (rankedThirds.length === 0) return null

  const hasAnyData = rankedThirds.some(t => t.played > 0)

  return (
    <Card padding="md" className="mt-6">
      <h3 className="text-lg font-bold text-gray-900 mb-1">Third-Place Teams Ranking</h3>
      <p className="text-xs text-gray-500 mb-4">
        Top 8 third-place teams advance to the Round of 32. Ranked by: points, goal difference, goals scored, FIFA ranking.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500 text-xs">
              <th className="text-left py-2 pr-2 w-6">#</th>
              <th className="text-left py-2 pr-2">Team</th>
              <th className="text-center py-2 px-1 w-12">Group</th>
              <th className="text-center py-2 px-1 w-8">P</th>
              <th className="text-center py-2 px-1 w-8">W</th>
              <th className="text-center py-2 px-1 w-8">D</th>
              <th className="text-center py-2 px-1 w-8">L</th>
              <th className="text-center py-2 px-1 w-8">GF</th>
              <th className="text-center py-2 px-1 w-8">GA</th>
              <th className="text-center py-2 px-1 w-8">GD</th>
              <th className="text-center py-2 px-1 w-10 font-bold">Pts</th>
              <th className="text-center py-2 pl-2 w-24">Status</th>
            </tr>
          </thead>
          <tbody>
            {rankedThirds.map((team, idx) => {
              const pos = idx + 1
              const qualifies = pos <= 8
              let rowClass = ''
              let statusBadge: React.ReactNode = null

              if (hasAnyData) {
                if (qualifies) {
                  rowClass = 'bg-green-50'
                  statusBadge = <Badge variant="green">Advances</Badge>
                } else {
                  rowClass = 'bg-red-50'
                  statusBadge = <Badge variant="gray">Eliminated</Badge>
                }
              }

              return (
                <tr key={team.team_id} className={`border-b border-gray-100 ${rowClass}`}>
                  <td className="py-2 pr-2 text-gray-500 font-medium">{pos}</td>
                  <td className="py-2 pr-2 font-medium text-gray-900 whitespace-nowrap">
                    {team.country_name}
                  </td>
                  <td className="text-center py-2 px-1 text-gray-600">{team.group_letter}</td>
                  <td className="text-center py-2 px-1 text-gray-600">{team.played}</td>
                  <td className="text-center py-2 px-1 text-gray-600">{team.wins}</td>
                  <td className="text-center py-2 px-1 text-gray-600">{team.draws}</td>
                  <td className="text-center py-2 px-1 text-gray-600">{team.losses}</td>
                  <td className="text-center py-2 px-1 text-gray-600">{team.goalsFor}</td>
                  <td className="text-center py-2 px-1 text-gray-600">{team.goalsAgainst}</td>
                  <td className="text-center py-2 px-1 text-gray-600">
                    {team.goalDifference > 0 ? `+${team.goalDifference}` : team.goalDifference}
                  </td>
                  <td className="text-center py-2 px-1 font-bold text-gray-900">{team.points}</td>
                  <td className="text-center py-2 pl-2">{statusBadge}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Qualifying cutoff line visual indicator */}
      {hasAnyData && rankedThirds.length > 8 && (
        <p className="text-xs text-gray-400 mt-2 text-center">
          Top 8 qualify for the Round of 32
        </p>
      )}
    </Card>
  )
}
