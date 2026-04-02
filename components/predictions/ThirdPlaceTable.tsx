'use client'

import { ThirdPlaceTeam } from '@/lib/tournament'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { BaseTeamTable, ColumnDef, RowStyle } from './BaseTeamTable'

type Props = {
  rankedThirds: ThirdPlaceTeam[]
  showConductScore?: boolean
  annexCOptionNumber?: number | null
  annexCQualifyingGroups?: string[] | null
}

const groupColumn: ColumnDef<ThirdPlaceTeam> = {
  key: 'group',
  label: 'Grp',
  headerClassName: 'text-center py-2 px-0.5 sm:px-1 w-8 sm:w-12',
  cellClassName: 'text-center py-2 px-0.5 sm:px-1 text-neutral-600',
  render: (team) => team.group_letter,
}

function getRowStyle(_team: ThirdPlaceTeam, pos: number, hasAnyData: boolean): RowStyle {
  if (!hasAnyData) return { rowClass: '', statusBadge: null }

  if (pos <= 8) {
    return { rowClass: 'bg-success-50', statusBadge: <Badge variant="green">Advances</Badge> }
  }
  return { rowClass: 'bg-danger-50', statusBadge: <Badge variant="gray">Eliminated</Badge> }
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
      <BaseTeamTable
        teams={rankedThirds}
        showConductScore={showConductScore}
        extraColumns={[groupColumn]}
        positionPadding={false}
        getRowStyle={getRowStyle}
      />

      {/* Qualifying cutoff line visual indicator */}
      {hasAnyData && rankedThirds.length > 8 && (
        <p className="text-xs text-neutral-500 mt-2 text-center">
          Top 8 qualify for the Round of 32
        </p>
      )}

      {/* Annex C option indicator */}
      {annexCOptionNumber != null && annexCQualifyingGroups && (
        <div className="mt-3 px-3 py-2 bg-primary-50 rounded-xl border border-primary-100">
          <p className="text-xs text-primary-800">
            <span className="font-semibold">FIFA Annex C Option #{annexCOptionNumber}</span>
            {' '}applies (Groups: {annexCQualifyingGroups.join(', ')})
          </p>
        </div>
      )}
    </Card>
  )
}
