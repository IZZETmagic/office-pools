'use client'

import { useState } from 'react'
import {
  Match,
  Team,
  PredictionMap,
  ScoreEntry,
  GROUP_LETTERS,
  calculateGroupStandings,
  GroupStanding,
  ThirdPlaceTeam,
  rankThirdPlaceTeams,
  getAnnexCInfo,
  isPredictionComplete,
} from '@/lib/tournament'
import { StandingsTable } from './StandingsTable'
import { ThirdPlaceTable } from './ThirdPlaceTable'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'

type Props = {
  matches: Match[]
  teams: Team[]
  predictions: PredictionMap
  allGroupStandings: Map<string, GroupStanding[]>
  onUpdatePrediction?: (matchId: string, score: ScoreEntry) => void
  readOnly?: boolean
}

export function GroupStageForm({ matches, teams, predictions, allGroupStandings, onUpdatePrediction, readOnly }: Props) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['A']))

  const groupMatches = matches.filter(m => m.stage === 'group')

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(group)) {
        next.delete(group)
      } else {
        next.add(group)
      }
      return next
    })
  }

  // Count predictions
  const totalGroupMatches = groupMatches.length
  const predictedGroupMatches = groupMatches.filter(m => isPredictionComplete(predictions.get(m.match_id))).length

  return (
    <div>
      {/* Progress counter */}
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-neutral-600">
          <span className="font-bold text-neutral-900">{predictedGroupMatches}</span> of{' '}
          <span className="font-bold text-neutral-900">{totalGroupMatches}</span> matches predicted
        </p>
        {predictedGroupMatches === totalGroupMatches && totalGroupMatches > 0 && (
          <Badge variant="green">All group matches predicted</Badge>
        )}
      </div>

      {/* Group accordions */}
      <div className="space-y-3">
        {GROUP_LETTERS.map(letter => {
          const gMatches = groupMatches
            .filter(m => m.group_letter === letter)
            .sort((a, b) => a.match_number - b.match_number)
          const gTeams = teams.filter(t => t.group_letter === letter)
          const isExpanded = expandedGroups.has(letter)
          const groupPredicted = gMatches.filter(m => isPredictionComplete(predictions.get(m.match_id))).length
          const groupTotal = gMatches.length

          const standings = allGroupStandings.get(letter) || []

          return (
            <Card key={letter} padding="md" className="overflow-hidden">
              {/* Accordion header */}
              <button
                type="button"
                onClick={() => toggleGroup(letter)}
                className="w-full flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <h3 className="text-base sm:text-lg font-bold text-neutral-900 shrink-0">Group {letter}</h3>
                  <span className="text-xs text-neutral-500 truncate hidden sm:inline">
                    {gTeams.map(t => t.country_name).join(', ')}
                  </span>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  <span className="text-xs text-neutral-600">
                    {groupPredicted}/{groupTotal}
                  </span>
                  {groupPredicted === groupTotal && groupTotal > 0 ? (
                    <Badge variant="green">Done</Badge>
                  ) : groupPredicted > 0 ? (
                    <Badge variant="yellow">In Progress</Badge>
                  ) : (
                    <Badge variant="gray">Not Started</Badge>
                  )}
                  <svg
                    className={`w-5 h-5 text-neutral-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Accordion body */}
              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-neutral-100">
                  {/* Matches */}
                  <div className="space-y-3">
                    {gMatches.map(match => (
                      <MatchRow
                        key={match.match_id}
                        match={match}
                        prediction={predictions.get(match.match_id)}
                        onUpdate={onUpdatePrediction}
                        readOnly={readOnly}
                      />
                    ))}
                  </div>

                  {/* Standings table */}
                  <StandingsTable standings={standings} groupLetter={letter} />
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* Third-place teams ranking */}
      {predictedGroupMatches > 0 && (() => {
        const annexCInfo = getAnnexCInfo(allGroupStandings)
        return (
          <ThirdPlaceTable
            rankedThirds={rankThirdPlaceTeams(allGroupStandings)}
            annexCOptionNumber={annexCInfo?.optionNumber}
            annexCQualifyingGroups={annexCInfo?.qualifyingGroups}
          />
        )
      })()}
    </div>
  )
}

// =============================================
// MATCH ROW COMPONENT
// =============================================

function MatchRow({
  match,
  prediction,
  onUpdate,
  readOnly,
}: {
  match: Match
  prediction: ScoreEntry | undefined
  onUpdate?: (matchId: string, score: ScoreEntry) => void
  readOnly?: boolean
}) {
  const homeTeam = match.home_team?.country_name || match.home_team_placeholder || 'TBD'
  const awayTeam = match.away_team?.country_name || match.away_team_placeholder || 'TBD'

  const handleScoreChange = (team: 'home' | 'away', value: string) => {
    if (readOnly || !onUpdate) return
    const numValue = value === '' ? null : parseInt(value)
    if (numValue !== null && (isNaN(numValue) || numValue < 0)) return

    const current = prediction || { home: null, away: null }
    onUpdate(match.match_id, {
      ...current,
      [team]: numValue,
    })
  }

  // Format date/time in AST (UTC-4)
  const matchDate = new Date(match.match_date)
  const dateStr = matchDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'Atlantic/Bermuda',
  })
  const timeStr = matchDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Atlantic/Bermuda',
    timeZoneName: 'short',
  })

  // Split venue into stadium and city
  const venueParts = match.venue?.split(', ') || []
  const stadium = venueParts[0] || ''
  const city = venueParts.slice(1).join(', ') || ''

  return (
    <div className="py-2 sm:py-2.5 flex items-center gap-1 sm:gap-1.5 flex-nowrap">
      <span className="text-[10px] sm:text-xs text-neutral-400 shrink-0 mr-0.5 sm:mr-2">#{match.match_number}</span>
      <div className="hidden sm:block shrink-0 w-[108px] text-xs text-neutral-500 leading-tight">
        <span className="font-medium text-neutral-700">{dateStr}</span>
        <br />
        <span>{timeStr}</span>
      </div>

      {/* Home team */}
      <div className="flex-1 basis-0 text-right min-w-0">
        <span className="text-[11px] sm:text-sm font-medium text-neutral-900 truncate block">{homeTeam}</span>
      </div>

      {/* Score inputs */}
      <div className="flex items-center gap-0.5 shrink-0">
        <input
          type="number"
          min="0"
          inputMode="numeric"
          value={prediction?.home ?? ''}
          placeholder="-"
          disabled={readOnly}
          onChange={(e) => handleScoreChange('home', e.target.value)}
          className="w-9 sm:w-11 h-8 sm:h-9 px-0.5 text-center border border-neutral-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent text-neutral-900 font-bold text-sm disabled:bg-neutral-100 disabled:cursor-not-allowed"
        />
        <span className="text-neutral-400 font-bold text-[10px]">v</span>
        <input
          type="number"
          min="0"
          inputMode="numeric"
          value={prediction?.away ?? ''}
          placeholder="-"
          disabled={readOnly}
          onChange={(e) => handleScoreChange('away', e.target.value)}
          className="w-9 sm:w-11 h-8 sm:h-9 px-0.5 text-center border border-neutral-300 rounded focus:ring-2 focus:ring-primary-500 focus:border-transparent text-neutral-900 font-bold text-sm disabled:bg-neutral-100 disabled:cursor-not-allowed"
        />
      </div>

      {/* Away team */}
      <div className="flex-1 basis-0 text-left min-w-0">
        <span className="text-[11px] sm:text-sm font-medium text-neutral-900 truncate block">{awayTeam}</span>
      </div>

      <div className="hidden sm:block shrink-0 w-[100px] text-xs text-neutral-500 text-right leading-tight">
        <span className="font-medium text-neutral-700 truncate block">{city}</span>
        <span className="truncate block">{stadium}</span>
      </div>
    </div>
  )
}
