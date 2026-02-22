'use client'

import { ThirdPlaceTeam } from '@/lib/tournament'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'

type Props = {
  rankedThirds: ThirdPlaceTeam[]
  showConductScore?: boolean
  annexCOptionNumber?: number | null
  annexCQualifyingGroups?: string[] | null
}

export function ThirdPlaceTable({ rankedThirds, showConductScore, annexCOptionNumber, annexCQualifyingGroups }: Props) {
  if (rankedThirds.length === 0) return null

  const hasAnyData = rankedThirds.some(t => t.played > 0)

  return (
    <Card padding="md" className="mt-6">
      <h3 className="text-base sm:text-lg font-bold text-neutral-900 mb-1">Third-Place Teams Ranking</h3>
      <p className="text-xs text-neutral-600 mb-4">
        Top 8 third-place teams advance to the Round of 32.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-neutral-700 text-[10px] sm:text-xs">
              <th className="text-left py-2 pr-1 sm:pr-2 w-5 sm:w-6">#</th>
              <th className="text-left py-2 pr-1 sm:pr-2">Team</th>
              <th className="text-center py-2 px-0.5 sm:px-1 w-8 sm:w-12">Grp</th>
              <th className="text-center py-2 px-0.5 sm:px-1 w-6 sm:w-8">P</th>
              <th className="text-center py-2 px-0.5 sm:px-1 w-6 sm:w-8">W</th>
              <th className="text-center py-2 px-0.5 sm:px-1 w-6 sm:w-8">D</th>
              <th className="text-center py-2 px-0.5 sm:px-1 w-6 sm:w-8">L</th>
              <th className="text-center py-2 px-0.5 sm:px-1 w-6 sm:w-8 hidden sm:table-cell">GF</th>
              <th className="text-center py-2 px-0.5 sm:px-1 w-6 sm:w-8 hidden sm:table-cell">GA</th>
              <th className="text-center py-2 px-0.5 sm:px-1 w-6 sm:w-8">GD</th>
              <th className="text-center py-2 px-0.5 sm:px-1 w-8 sm:w-10 font-bold">Pts</th>
              {showConductScore && (
                <th className="text-center py-2 px-0.5 sm:px-1 w-6 sm:w-8 hidden sm:table-cell" title="Fair Play (Conduct Score)">FP</th>
              )}
              <th className="text-center py-2 pl-1 sm:pl-2 w-20 sm:w-24 hidden sm:table-cell">Status</th>
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
                  rowClass = 'bg-success-50'
                  statusBadge = <Badge variant="green">Advances</Badge>
                } else {
                  rowClass = 'bg-danger-50'
                  statusBadge = <Badge variant="gray">Eliminated</Badge>
                }
              }

              return (
                <tr key={team.team_id} className={`border-b border-neutral-100 text-xs sm:text-sm ${rowClass}`}>
                  <td className="py-2 pr-1 sm:pr-2 text-neutral-600 font-medium">{pos}</td>
                  <td className="py-2 pr-1 sm:pr-2 font-medium text-neutral-900 whitespace-nowrap text-xs sm:text-sm">
                    {team.country_name}
                  </td>
                  <td className="text-center py-2 px-0.5 sm:px-1 text-neutral-600">{team.group_letter}</td>
                  <td className="text-center py-2 px-0.5 sm:px-1 text-neutral-600">{team.played}</td>
                  <td className="text-center py-2 px-0.5 sm:px-1 text-neutral-600">{team.wins}</td>
                  <td className="text-center py-2 px-0.5 sm:px-1 text-neutral-600">{team.draws}</td>
                  <td className="text-center py-2 px-0.5 sm:px-1 text-neutral-600">{team.losses}</td>
                  <td className="text-center py-2 px-0.5 sm:px-1 text-neutral-600 hidden sm:table-cell">{team.goalsFor}</td>
                  <td className="text-center py-2 px-0.5 sm:px-1 text-neutral-600 hidden sm:table-cell">{team.goalsAgainst}</td>
                  <td className="text-center py-2 px-0.5 sm:px-1 text-neutral-600">
                    {team.goalDifference > 0 ? `+${team.goalDifference}` : team.goalDifference}
                  </td>
                  <td className="text-center py-2 px-0.5 sm:px-1 font-bold text-neutral-900">{team.points}</td>
                  {showConductScore && (
                    <td className="text-center py-2 px-0.5 sm:px-1 text-neutral-600 hidden sm:table-cell">
                      {team.conductScore ?? 0}
                    </td>
                  )}
                  <td className="text-center py-2 pl-1 sm:pl-2 hidden sm:table-cell">{statusBadge}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Qualifying cutoff line visual indicator */}
      {hasAnyData && rankedThirds.length > 8 && (
        <p className="text-xs text-neutral-500 mt-2 text-center">
          Top 8 qualify for the Round of 32
        </p>
      )}

      {/* Annex C option indicator */}
      {annexCOptionNumber != null && annexCQualifyingGroups && (
        <div className="mt-3 px-3 py-2 bg-primary-50 rounded-lg border border-primary-100">
          <p className="text-xs text-primary-800">
            <span className="font-semibold">FIFA Annex C Option #{annexCOptionNumber}</span>
            {' '}applies (Groups: {annexCQualifyingGroups.join(', ')})
          </p>
        </div>
      )}
    </Card>
  )
}
