'use client'

import { GroupStanding } from '@/lib/tournament'
import { Badge } from '@/components/ui/Badge'
import { formatNumber } from '@/lib/format'

export type ColumnDef<T extends GroupStanding> = {
  key: string
  label: string
  headerClassName: string
  cellClassName: string
  render: (team: T) => React.ReactNode
}

export type RowStyle = {
  rowClass: string
  statusBadge: React.ReactNode
}

type Props<T extends GroupStanding> = {
  teams: T[]
  showConductScore?: boolean
  /** Extra columns inserted after Team name and before P,W,D,L... */
  extraColumns?: ColumnDef<T>[]
  /** Whether the # column has left padding (default true) */
  positionPadding?: boolean
  /** Determines row background color and status badge per row */
  getRowStyle: (team: T, position: number, hasAnyData: boolean) => RowStyle
}

export function BaseTeamTable<T extends GroupStanding>({
  teams,
  showConductScore,
  extraColumns,
  positionPadding = true,
  getRowStyle,
}: Props<T>) {
  if (teams.length === 0) return null

  const hasAnyData = teams.some(t => t.played > 0)

  const posPadClass = positionPadding ? 'pl-2 sm:pl-3 pr-1 sm:pr-2' : 'pr-1 sm:pr-2'

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-neutral-700 text-[10px] sm:text-xs">
            <th className={`text-left py-2 ${posPadClass} w-5 sm:w-6`}>#</th>
            <th className="text-left py-2 pr-1 sm:pr-2">Team</th>
            {extraColumns?.map(col => (
              <th key={col.key} className={col.headerClassName}>{col.label}</th>
            ))}
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
          {teams.map((team, idx) => {
            const pos = idx + 1
            const { rowClass, statusBadge } = getRowStyle(team, pos, hasAnyData)

            return (
              <tr key={team.team_id} className={`border-b border-neutral-100 text-xs sm:text-sm ${rowClass}`}>
                <td className={`py-2 ${posPadClass} text-neutral-600 font-medium`}>{pos}</td>
                <td className="py-2 pr-1 sm:pr-2 font-medium text-neutral-900 whitespace-nowrap text-xs sm:text-sm">
                  {team.country_name}
                </td>
                {extraColumns?.map(col => (
                  <td key={col.key} className={col.cellClassName}>{col.render(team)}</td>
                ))}
                <td className="text-center py-2 px-0.5 sm:px-1 text-neutral-600">{team.played}</td>
                <td className="text-center py-2 px-0.5 sm:px-1 text-neutral-600">{team.wins}</td>
                <td className="text-center py-2 px-0.5 sm:px-1 text-neutral-600">{team.draws}</td>
                <td className="text-center py-2 px-0.5 sm:px-1 text-neutral-600">{team.losses}</td>
                <td className="text-center py-2 px-0.5 sm:px-1 text-neutral-600 hidden sm:table-cell">{formatNumber(team.goalsFor)}</td>
                <td className="text-center py-2 px-0.5 sm:px-1 text-neutral-600 hidden sm:table-cell">{formatNumber(team.goalsAgainst)}</td>
                <td className="text-center py-2 px-0.5 sm:px-1 text-neutral-600">
                  {team.goalDifference > 0 ? `+${formatNumber(team.goalDifference)}` : formatNumber(team.goalDifference)}
                </td>
                <td className="text-center py-2 px-0.5 sm:px-1 font-bold text-neutral-900">{formatNumber(team.points)}</td>
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
  )
}
