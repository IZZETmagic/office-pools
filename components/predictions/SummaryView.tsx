'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import {
  Match,
  Team,
  PredictionMap,
  GroupStanding,
  GROUP_LETTERS,
  STAGE_LABELS,
  calculateGroupStandings,
} from '@/lib/tournament'
import { StandingsTable } from './StandingsTable'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'

type ResolvedKnockoutMatch = {
  match: Match
  homeTeam: GroupStanding | null
  awayTeam: GroupStanding | null
  winner: GroupStanding | null
}

type Props = {
  matches: Match[]
  teams: Team[]
  predictions: PredictionMap
  knockoutResolutions: Map<string, ResolvedKnockoutMatch>
  champion: GroupStanding | null
  onEditStage: (stageIndex: number) => void
  /**
   * Is every match predicted? DERIVED by the parent from the picks themselves,
   * never a flag the member set — `onSubmit`/`submitting` are gone from this
   * type because there is nothing left to press.
   */
  hasSubmitted?: boolean
  readOnly?: boolean
}

export function SummaryView({
  matches,
  teams,
  predictions,
  knockoutResolutions,
  champion,
  onEditStage,
  hasSubmitted,
  readOnly,
}: Props) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }

  // Organize knockout matches by stage
  const knockoutStages = ['round_32', 'round_16', 'quarter_final', 'semi_final', 'third_place', 'final']
  const matchesByStage = new Map<string, ResolvedKnockoutMatch[]>()
  for (const stage of knockoutStages) {
    matchesByStage.set(stage, [])
  }
  for (const [, resolved] of knockoutResolutions) {
    const stage = resolved.match.stage
    const list = matchesByStage.get(stage)
    if (list) list.push(resolved)
  }

  return (
    <div>
      {/* Champion highlight */}
      {champion && (
        <div className="mb-8 text-center p-6 rounded-2xl bg-gradient-to-br from-primary-50 via-accent-50 to-accent-100 border border-accent-100 shadow-sm">
          <div className="text-4xl mb-2">&#127942;</div>
          <p className="text-xs font-semibold text-accent-500 uppercase tracking-wide mb-1">Your Predicted Champion</p>
          <h2 className="text-3xl font-bold text-neutral-900">{champion.country_name}</h2>
          <p className="text-sm text-neutral-500 mt-1">Group {champion.group_letter}</p>
        </div>
      )}

      {/* Group Stage Section */}
      <SectionHeader
        title="Group Stage"
        matchCount={matches.filter(m => m.stage === 'group').length}
        isExpanded={expandedSections.has('group')}
        onToggle={() => toggleSection('group')}
        onEdit={readOnly ? undefined : () => onEditStage(0)}
      />
      {expandedSections.has('group') && (
        <div className="mb-4 space-y-4">
          {GROUP_LETTERS.map(letter => {
            const gMatches = matches.filter(m => m.stage === 'group' && m.group_letter === letter)
            const standings = calculateGroupStandings(letter, gMatches, predictions, teams)
            return (
              <Card key={letter} padding="md">
                <StandingsTable standings={standings} groupLetter={letter} />
              </Card>
            )
          })}
        </div>
      )}

      {/* Knockout Stages */}
      {knockoutStages.map((stage, idx) => {
        const stageMatches = matchesByStage.get(stage) || []
        if (stageMatches.length === 0) return null
        const label = stage === 'third_place' ? 'Third Place' : stage === 'final' ? 'Final' : (STAGE_LABELS[stage] || stage)
        // Map stage to edit index: round_32=1, round_16=2, quarter_final=3, semi_final=4, third_place/final=5
        const stageEditMap: Record<string, number> = {
          round_32: 1,
          round_16: 2,
          quarter_final: 3,
          semi_final: 4,
          third_place: 5,
          final: 5,
        }

        return (
          <div key={stage}>
            <SectionHeader
              title={label}
              matchCount={stageMatches.length}
              isExpanded={expandedSections.has(stage)}
              onToggle={() => toggleSection(stage)}
              onEdit={readOnly ? undefined : () => onEditStage(stageEditMap[stage] ?? 0)}
            />
            {expandedSections.has(stage) && (
              <div className="mb-4 space-y-2">
                {stageMatches
                  .sort((a, b) => a.match.match_number - b.match.match_number)
                  .map(({ match, homeTeam, awayTeam, winner }) => {
                    const pred = predictions.get(match.match_id)
                    return (
                      <Card key={match.match_id} padding="md">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 text-right min-w-0">
                            <span className={`text-xs sm:text-sm font-medium truncate block ${winner?.team_id === homeTeam?.team_id ? 'text-success-700 font-bold' : 'text-neutral-700'}`}>
                              {homeTeam?.country_name || 'TBD'}
                            </span>
                          </div>
                          <div className="px-2 sm:px-4 text-center shrink-0">
                            <span className="text-base sm:text-lg font-bold text-neutral-900">
                              {pred && pred.home != null && pred.away != null ? `${pred.home} - ${pred.away}` : '? - ?'}
                            </span>
                            {pred && pred.home != null && pred.away != null && pred.home === pred.away && (pred.homePso != null && pred.awayPso != null) && (
                              <p className="text-xs text-primary-600 font-medium">
                                PSO: {pred.homePso} - {pred.awayPso}
                              </p>
                            )}
                            {pred && pred.home != null && pred.away != null && pred.home === pred.away && pred.winnerTeamId && !(pred.homePso != null && pred.awayPso != null) && (
                              <p className="text-xs text-primary-600 font-medium">
                                PSO: {pred.winnerTeamId === homeTeam?.team_id ? homeTeam?.country_name : awayTeam?.country_name} wins
                              </p>
                            )}
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <span className={`text-xs sm:text-sm font-medium truncate block ${winner?.team_id === awayTeam?.team_id ? 'text-success-700 font-bold' : 'text-neutral-700'}`}>
                              {awayTeam?.country_name || 'TBD'}
                            </span>
                          </div>
                        </div>
                      </Card>
                    )
                  })}
              </div>
            )}
          </div>
        )
      })}

      {/* Closing state.

          ⚠ NO SUBMIT BUTTON. It used to sit under a warning reading "Once
          submitted, predictions cannot be changed" — the one sentence this
          whole change exists to delete. Picks save as they are made and the
          deadline is the only thing that closes them.

          `hasSubmitted` here is the DERIVED completeness the parent computes
          (all matches predicted), not a flag anyone pressed. */}
      {hasSubmitted ? (
        <div className="mt-8">
          <div className="bg-success-50 border border-success-200 rounded-xl p-4 text-center">
            <p className="text-sm font-semibold text-success-800">
              {readOnly
                ? 'Your predictions are locked in. Good luck!'
                : 'Every match is predicted and saved.'}
            </p>
            {!readOnly && (
              <p className="text-sm text-success-800 mt-1">
                You can still change any of them until the deadline.
              </p>
            )}
          </div>
        </div>
      ) : !readOnly ? (
        <div className="mt-8">
          <div className="bg-neutral-50 border border-border-default rounded-xl p-4 text-center">
            <p className="text-sm text-neutral-700">
              Your picks save themselves as you make them. Anything still blank
              when the deadline passes earns 0 points.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

// =============================================
// SECTION HEADER
// =============================================

function SectionHeader({
  title,
  matchCount,
  isExpanded,
  onToggle,
  onEdit,
}: {
  title: string
  matchCount: number
  isExpanded: boolean
  onToggle: () => void
  onEdit?: () => void
}) {
  return (
    <div className="flex items-center justify-between py-3 mb-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2"
      >
        <Icon name="chevron.down" size={16} className={`text-muted transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        <h3 className="text-lg font-bold text-neutral-900">{title}</h3>
        <Badge variant="gray">{matchCount} matches</Badge>
      </button>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="text-sm text-primary-600 hover:text-primary-800 font-medium"
        >
          Edit
        </button>
      )}
    </div>
  )
}
