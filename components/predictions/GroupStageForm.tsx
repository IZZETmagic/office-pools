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
  onUpdatePrediction: (matchId: string, score: ScoreEntry) => void
}

export function GroupStageForm({ matches, teams, predictions, allGroupStandings, onUpdatePrediction }: Props) {
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
  const predictedGroupMatches = groupMatches.filter(m => predictions.has(m.match_id)).length

  return (
    <div>
      {/* Progress counter */}
      <div className="mb-6 flex items-center justify-between">
        <p className="text-sm text-gray-600">
          <span className="font-bold text-gray-900">{predictedGroupMatches}</span> of{' '}
          <span className="font-bold text-gray-900">{totalGroupMatches}</span> matches predicted
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
          const groupPredicted = gMatches.filter(m => predictions.has(m.match_id)).length
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
                  <h3 className="text-base sm:text-lg font-bold text-gray-900 shrink-0">Group {letter}</h3>
                  <span className="text-xs text-gray-500 truncate hidden sm:inline">
                    {gTeams.map(t => t.country_name).join(', ')}
                  </span>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  <span className="text-xs text-gray-600">
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
                    className={`w-5 h-5 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
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
                <div className="mt-4 pt-4 border-t border-gray-100">
                  {/* Matches */}
                  <div className="space-y-3">
                    {gMatches.map(match => (
                      <MatchRow
                        key={match.match_id}
                        match={match}
                        prediction={predictions.get(match.match_id)}
                        onUpdate={onUpdatePrediction}
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
      {predictedGroupMatches > 0 && (
        <ThirdPlaceTable rankedThirds={rankThirdPlaceTeams(allGroupStandings)} />
      )}
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
}: {
  match: Match
  prediction: ScoreEntry | undefined
  onUpdate: (matchId: string, score: ScoreEntry) => void
}) {
  const homeTeam = match.home_team?.country_name || match.home_team_placeholder || 'TBD'
  const awayTeam = match.away_team?.country_name || match.away_team_placeholder || 'TBD'

  const handleScoreChange = (team: 'home' | 'away', value: string) => {
    const numValue = value === '' ? 0 : parseInt(value)
    if (isNaN(numValue) || numValue < 0) return

    const current = prediction || { home: 0, away: 0 }
    onUpdate(match.match_id, {
      ...current,
      [team]: numValue,
    })
  }

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 py-2">
      {/* Match info */}
      <div className="hidden sm:block text-xs text-gray-500 w-16 shrink-0">
        #{match.match_number}
        <br />
        {new Date(match.match_date).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
        })}
      </div>

      {/* Home team */}
      <div className="flex-1 text-right min-w-0">
        <span className="text-xs sm:text-sm font-medium text-gray-900 truncate block">{homeTeam}</span>
      </div>

      {/* Score inputs */}
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="number"
          min="0"
          inputMode="numeric"
          value={prediction?.home ?? ''}
          placeholder="-"
          onChange={(e) => handleScoreChange('home', e.target.value)}
          className="w-10 sm:w-12 h-9 px-1 text-center border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-bold text-sm"
        />
        <span className="text-gray-500 font-bold text-[10px] sm:text-xs">vs</span>
        <input
          type="number"
          min="0"
          inputMode="numeric"
          value={prediction?.away ?? ''}
          placeholder="-"
          onChange={(e) => handleScoreChange('away', e.target.value)}
          className="w-10 sm:w-12 h-9 px-1 text-center border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 font-bold text-sm"
        />
      </div>

      {/* Away team */}
      <div className="flex-1 text-left min-w-0">
        <span className="text-xs sm:text-sm font-medium text-gray-900 truncate block">{awayTeam}</span>
      </div>
    </div>
  )
}
