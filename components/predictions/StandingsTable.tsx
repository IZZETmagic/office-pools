'use client'

import { GroupStanding } from '@/lib/tournament'
import { Badge } from '@/components/ui/Badge'
import { BaseTeamTable, RowStyle } from './BaseTeamTable'

type Props = {
  standings: GroupStanding[]
  groupLetter: string
  showConductScore?: boolean
}

function getRowStyle(_team: GroupStanding, pos: number, hasAnyData: boolean): RowStyle {
  if (!hasAnyData) return { rowClass: '', statusBadge: null }

  if (pos <= 2) {
    return { rowClass: 'bg-success-50', statusBadge: <Badge variant="green">Qualified</Badge> }
  }
  if (pos === 3) {
    return { rowClass: 'bg-warning-50', statusBadge: <Badge variant="yellow">Possible</Badge> }
  }
  return { rowClass: '', statusBadge: <Badge variant="gray">Eliminated</Badge> }
}

export function StandingsTable({ standings, groupLetter, showConductScore }: Props) {
  if (standings.length === 0) return null

  return (
    <div className="mt-4">
      <h4 className="text-sm font-semibold text-neutral-700 mb-2">
        Group {groupLetter} Standings
      </h4>
      <BaseTeamTable
        teams={standings}
        showConductScore={showConductScore}
        positionPadding={true}
        getRowStyle={getRowStyle}
      />
    </div>
  )
}
