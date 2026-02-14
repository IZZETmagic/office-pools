'use client'

import { useState } from 'react'
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
import { Button } from '@/components/ui/Button'

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
  onSubmit: () => void
  submitting: boolean
}

export function SummaryView({
  matches,
  teams,
  predictions,
  knockoutResolutions,
  champion,
  onEditStage,
  onSubmit,
  submitting,
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
        <Card padding="lg" className="mb-8 text-center bg-gradient-to-r from-yellow-50 to-amber-50 border-2 border-yellow-300">
          <p className="text-sm text-yellow-700 font-medium mb-1">Your Predicted Champion</p>
          <h2 className="text-3xl font-bold text-gray-900">{champion.country_name}</h2>
          <p className="text-sm text-gray-500 mt-1">Group {champion.group_letter}</p>
        </Card>
      )}

      {/* Group Stage Section */}
      <SectionHeader
        title="Group Stage"
        matchCount={matches.filter(m => m.stage === 'group').length}
        isExpanded={expandedSections.has('group')}
        onToggle={() => toggleSection('group')}
        onEdit={() => onEditStage(0)}
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
              onEdit={() => onEditStage(stageEditMap[stage] ?? 0)}
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
                          <div className="flex-1 text-right">
                            <span className={`text-sm font-medium ${winner?.team_id === homeTeam?.team_id ? 'text-green-700 font-bold' : 'text-gray-700'}`}>
                              {homeTeam?.country_name || 'TBD'}
                            </span>
                          </div>
                          <div className="px-4 text-center shrink-0">
                            <span className="text-lg font-bold text-gray-900">
                              {pred ? `${pred.home} - ${pred.away}` : '? - ?'}
                            </span>
                            {pred && pred.home === pred.away && (pred.homePso != null && pred.awayPso != null) && (
                              <p className="text-xs text-blue-600 font-medium">
                                PSO: {pred.homePso} - {pred.awayPso}
                              </p>
                            )}
                            {pred && pred.home === pred.away && pred.winnerTeamId && !(pred.homePso != null && pred.awayPso != null) && (
                              <p className="text-xs text-blue-600 font-medium">
                                PSO: {pred.winnerTeamId === homeTeam?.team_id ? homeTeam?.country_name : awayTeam?.country_name} wins
                              </p>
                            )}
                          </div>
                          <div className="flex-1 text-left">
                            <span className={`text-sm font-medium ${winner?.team_id === awayTeam?.team_id ? 'text-green-700 font-bold' : 'text-gray-700'}`}>
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

      {/* Submit button */}
      <div className="mt-8 space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-sm text-amber-800">
            Once submitted, predictions cannot be changed after the deadline. Please review all your predictions before submitting.
          </p>
        </div>
        <Button
          variant="green"
          size="lg"
          fullWidth
          onClick={onSubmit}
          loading={submitting}
          loadingText="Submitting..."
        >
          Submit All Predictions
        </Button>
      </div>
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
  onEdit: () => void
}) {
  return (
    <div className="flex items-center justify-between py-3 mb-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-2"
      >
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        <Badge variant="gray">{matchCount} matches</Badge>
      </button>
      <button
        type="button"
        onClick={onEdit}
        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
      >
        Edit
      </button>
    </div>
  )
}
