'use client'

import { GroupStanding } from '@/lib/tournament'
import { Badge } from '@/components/ui/Badge'

type Props = {
  standings: GroupStanding[]
  groupLetter: string
}

export function StandingsTable({ standings, groupLetter }: Props) {
  if (standings.length === 0) return null

  const hasAnyPredictions = standings.some(s => s.played > 0)

  return (
    <div className="mt-4">
      <h4 className="text-sm font-semibold text-gray-500 mb-2">
        Group {groupLetter} Standings
      </h4>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500 text-xs">
              <th className="text-left py-2 pr-2 w-6">#</th>
              <th className="text-left py-2 pr-2">Team</th>
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
            {standings.map((team, idx) => {
              const pos = idx + 1
              let rowClass = ''
              let statusBadge: React.ReactNode = null

              if (hasAnyPredictions) {
                if (pos <= 2) {
                  rowClass = 'bg-green-50'
                  statusBadge = <Badge variant="green">Qualified</Badge>
                } else if (pos === 3) {
                  rowClass = 'bg-yellow-50'
                  statusBadge = <Badge variant="yellow">Possible</Badge>
                } else {
                  statusBadge = <Badge variant="gray">Eliminated</Badge>
                }
              }

              return (
                <tr key={team.team_id} className={`border-b border-gray-100 ${rowClass}`}>
                  <td className="py-2 pr-2 text-gray-500 font-medium">{pos}</td>
                  <td className="py-2 pr-2 font-medium text-gray-900 whitespace-nowrap">
                    {team.country_name}
                  </td>
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
    </div>
  )
}
