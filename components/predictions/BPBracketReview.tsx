'use client'

import { useState, useMemo } from 'react'
import type { TeamData, MatchData } from '@/app/pools/[pool_id]/types'
import type { GroupStanding } from '@/lib/tournament'
import { GROUP_LETTERS } from '@/lib/tournament'
import { Badge } from '@/components/ui/Badge'

// =============================================
// TYPES
// =============================================

type BPBracketReviewProps = {
  teams: TeamData[]
  matches: MatchData[]
  groupRankings: Map<string, string[]>
  thirdPlaceRanking: string[]
  knockoutTeamMap: Map<number, { home: GroupStanding | null; away: GroupStanding | null }>
  knockoutPicks: Map<string, { winner_team_id: string; predicted_penalty: boolean }>
  champion: GroupStanding | null
  runnerUp: GroupStanding | null
  thirdPlace: GroupStanding | null
  onEditStep: (step: number) => void
  readOnly?: boolean
}

// =============================================
// CONSTANTS
// =============================================

const KNOCKOUT_ROUNDS = [
  { key: 'round_32', label: 'Round of 32' },
  { key: 'round_16', label: 'Round of 16' },
  { key: 'quarter_final', label: 'Quarter Finals' },
  { key: 'semi_final', label: 'Semi Finals' },
  { key: 'third_place', label: '3rd Place Match' },
  { key: 'final', label: 'Final' },
] as const

const POSITION_LABELS = ['1st', '2nd', '3rd', '4th'] as const

// =============================================
// HELPERS
// =============================================

function countryCodeToEmoji(code: string): string {
  const upper = code.toUpperCase()
  const offset = 0x1f1e6
  const a = 'A'.charCodeAt(0)
  return String.fromCodePoint(upper.charCodeAt(0) - a + offset, upper.charCodeAt(1) - a + offset)
}

function getPositionColor(position: number): string {
  if (position <= 1) return 'text-success-700'
  if (position === 2) return 'text-warning-700'
  return 'text-neutral-400'
}

// =============================================
// COLLAPSIBLE SECTION
// =============================================

function CollapsibleSection({
  title,
  badge,
  isExpanded,
  onToggle,
  onEdit,
  readOnly,
  children,
}: {
  title: string
  badge?: React.ReactNode
  isExpanded: boolean
  onToggle: () => void
  onEdit?: () => void
  readOnly?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="bg-surface rounded-xl border border-neutral-200 overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between">
        <button
          type="button"
          onClick={onToggle}
          className="flex items-center gap-2 min-w-0"
        >
          <svg
            className={`w-4 h-4 text-neutral-400 transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          <span className="text-sm font-semibold text-neutral-900">{title}</span>
          {badge}
        </button>
        {!readOnly && onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="text-xs text-primary-600 hover:text-primary-800 font-medium shrink-0 ml-2"
          >
            Edit
          </button>
        )}
      </div>
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-neutral-100 pt-3">
          {children}
        </div>
      )}
    </div>
  )
}

// =============================================
// TEAM FLAG
// =============================================

function TeamFlag({ team, size = 'sm' }: { team: TeamData | GroupStanding | null; size?: 'sm' | 'md' | 'lg' }) {
  if (!team) {
    return (
      <div className={`rounded-sm bg-neutral-200 flex items-center justify-center ${
        size === 'lg' ? 'w-10 h-7' : size === 'md' ? 'w-7 h-5' : 'w-5 h-3.5'
      }`}>
        <span className="text-[6px] text-neutral-400">?</span>
      </div>
    )
  }

  const flagUrl = 'flag_url' in team ? team.flag_url : null
  const sizeClasses = size === 'lg' ? 'w-10 h-7' : size === 'md' ? 'w-7 h-5' : 'w-5 h-3.5'

  if (flagUrl) {
    return (
      <img
        src={flagUrl}
        alt={team.country_name}
        className={`${sizeClasses} object-cover rounded-[2px] shrink-0`}
      />
    )
  }

  return (
    <span className={`${size === 'lg' ? 'text-lg' : size === 'md' ? 'text-sm' : 'text-xs'} leading-none shrink-0`}>
      {countryCodeToEmoji(team.country_code)}
    </span>
  )
}

// =============================================
// MAIN COMPONENT
// =============================================

export function BPBracketReview({
  teams,
  matches,
  groupRankings,
  thirdPlaceRanking,
  knockoutTeamMap,
  knockoutPicks,
  champion,
  runnerUp,
  thirdPlace,
  onEditStep,
  readOnly,
}: BPBracketReviewProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['knockout']))

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

  // =============================================
  // COMPUTED: Teams map for quick lookup
  // =============================================

  const teamsMap = useMemo(() => {
    const map = new Map<string, TeamData>()
    for (const team of teams) {
      map.set(team.team_id, team)
    }
    return map
  }, [teams])

  // =============================================
  // COMPUTED: Knockout round data
  // =============================================

  const knockoutRoundData = useMemo(() => {
    const data = new Map<string, { match: MatchData; winner: TeamData | null; isPenalty: boolean }[]>()

    for (const round of KNOCKOUT_ROUNDS) {
      const roundMatches = matches
        .filter(m => m.stage === round.key)
        .sort((a, b) => a.match_number - b.match_number)

      const entries = roundMatches.map(match => {
        const pick = knockoutPicks.get(match.match_id)
        const winner = pick ? teamsMap.get(pick.winner_team_id) ?? null : null
        return {
          match,
          winner,
          isPenalty: pick?.predicted_penalty ?? false,
        }
      })

      data.set(round.key, entries)
    }

    return data
  }, [matches, knockoutPicks, teamsMap])

  // =============================================
  // COMPUTED: Completion stats
  // =============================================

  const stats = useMemo(() => {
    const groupRankingCount = groupRankings.size * 4
    const thirdPlaceCount = thirdPlaceRanking.length
    const knockoutPickCount = knockoutPicks.size

    const totalKnockoutMatches = matches.filter(
      m => m.stage !== 'group'
    ).length

    return {
      groupRankingCount,
      thirdPlaceCount,
      knockoutPickCount,
      totalKnockoutMatches,
      totalPredictions: groupRankingCount + thirdPlaceCount + knockoutPickCount,
      isGroupsComplete: groupRankings.size === 12,
      isThirdPlaceComplete: thirdPlaceRanking.length === 12,
      isKnockoutComplete: knockoutPickCount === totalKnockoutMatches && totalKnockoutMatches > 0,
    }
  }, [groupRankings, thirdPlaceRanking, knockoutPicks, matches])

  const isAllComplete = stats.isGroupsComplete && stats.isThirdPlaceComplete && stats.isKnockoutComplete

  // =============================================
  // RENDER
  // =============================================

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-neutral-900">Review Your Bracket</h2>
        {isAllComplete ? (
          <Badge variant="green">Complete</Badge>
        ) : (
          <Badge variant="yellow">Incomplete</Badge>
        )}
      </div>

      {/* Section 4: Champion (prominent, always visible) */}
      {champion ? (
        <div className="bg-success-50 border border-success-200 rounded-xl p-5 text-center">
          <div className="text-3xl mb-1">&#127942;</div>
          <p className="text-[10px] font-semibold text-success-600 uppercase tracking-wider mb-1">
            Your Predicted Champion
          </p>
          <div className="flex items-center justify-center gap-2.5 mb-3">
            <TeamFlag team={champion} size="lg" />
            <span className="text-xl font-bold text-neutral-900">{champion.country_name}</span>
          </div>

          {/* Runner-up and third place */}
          <div className="flex items-center justify-center gap-6 text-sm">
            {runnerUp && (
              <div className="flex items-center gap-1.5 text-neutral-600">
                <span className="text-neutral-400 text-xs font-medium">2nd</span>
                <TeamFlag team={runnerUp} size="sm" />
                <span className="font-medium">{runnerUp.country_name}</span>
              </div>
            )}
            {thirdPlace && (
              <div className="flex items-center gap-1.5 text-neutral-600">
                <span className="text-neutral-400 text-xs font-medium">3rd</span>
                <TeamFlag team={thirdPlace} size="sm" />
                <span className="font-medium">{thirdPlace.country_name}</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5 text-center">
          <div className="text-2xl mb-1 opacity-30">&#127942;</div>
          <p className="text-sm text-neutral-400">No champion predicted yet</p>
          {!readOnly && (
            <button
              type="button"
              onClick={() => onEditStep(2)}
              className="mt-2 text-xs text-primary-600 hover:text-primary-800 font-medium"
            >
              Complete knockout picks
            </button>
          )}
        </div>
      )}

      {/* Section 1: Group Rankings (collapsible) */}
      <CollapsibleSection
        title="Group Rankings"
        badge={
          stats.isGroupsComplete
            ? <Badge variant="green">12/12</Badge>
            : <Badge variant="yellow">{groupRankings.size}/12</Badge>
        }
        isExpanded={expandedSections.has('groups')}
        onToggle={() => toggleSection('groups')}
        onEdit={() => onEditStep(0)}
        readOnly={readOnly}
      >
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {GROUP_LETTERS.map(letter => {
            const teamIds = groupRankings.get(letter)
            if (!teamIds || teamIds.length === 0) {
              return (
                <div key={letter} className="rounded-lg border border-dashed border-neutral-200 p-2.5">
                  <p className="text-xs font-bold text-neutral-400 mb-1">Group {letter}</p>
                  <p className="text-[10px] text-neutral-300">Not ranked</p>
                </div>
              )
            }

            return (
              <div key={letter} className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-2.5">
                <p className="text-xs font-bold text-neutral-700 mb-1.5">Group {letter}</p>
                <div className="space-y-1">
                  {teamIds.map((teamId, idx) => {
                    const team = teamsMap.get(teamId)
                    if (!team) return null
                    return (
                      <div key={teamId} className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold w-4 text-right ${getPositionColor(idx)}`}>
                          {POSITION_LABELS[idx]}
                        </span>
                        <TeamFlag team={team} size="sm" />
                        <span className={`text-[11px] truncate ${idx <= 1 ? 'text-neutral-800 font-medium' : idx === 2 ? 'text-neutral-600' : 'text-neutral-400'}`}>
                          {team.country_name}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </CollapsibleSection>

      {/* Section 2: Third-Place Qualifiers (collapsible) */}
      <CollapsibleSection
        title="Third-Place Rankings"
        badge={
          stats.isThirdPlaceComplete
            ? <Badge variant="green">12 ranked</Badge>
            : <Badge variant="yellow">{thirdPlaceRanking.length} ranked</Badge>
        }
        isExpanded={expandedSections.has('third')}
        onToggle={() => toggleSection('third')}
        onEdit={() => onEditStep(1)}
        readOnly={readOnly}
      >
        {thirdPlaceRanking.length === 0 ? (
          <p className="text-sm text-neutral-400 text-center py-3">No third-place rankings set</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5">
            {thirdPlaceRanking.map((teamId, idx) => {
              const team = teamsMap.get(teamId)
              if (!team) return null
              const qualifies = idx < 8
              return (
                <div
                  key={teamId}
                  className={`flex items-center gap-2 py-1.5 px-2 rounded ${qualifies ? '' : 'opacity-45'}`}
                >
                  <span className={`text-[10px] font-bold w-4 text-right ${qualifies ? 'text-success-600' : 'text-red-400'}`}>
                    {idx + 1}
                  </span>
                  {qualifies ? (
                    <svg className="w-3.5 h-3.5 text-success-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5 text-red-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                  <TeamFlag team={team} size="sm" />
                  <span className={`text-xs truncate ${qualifies ? 'text-neutral-800 font-medium' : 'text-neutral-400'}`}>
                    {team.country_name}
                  </span>
                  <span className="text-[10px] text-neutral-400 ml-auto shrink-0">
                    Grp {team.group_letter}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </CollapsibleSection>

      {/* Section 3: Knockout Bracket (always expanded) */}
      <div className="bg-surface rounded-xl border border-neutral-200 overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-neutral-900">Knockout Bracket</span>
            {stats.isKnockoutComplete ? (
              <Badge variant="green">{stats.knockoutPickCount}/{stats.totalKnockoutMatches}</Badge>
            ) : (
              <Badge variant="yellow">{stats.knockoutPickCount}/{stats.totalKnockoutMatches}</Badge>
            )}
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={() => onEditStep(2)}
              className="text-xs text-primary-600 hover:text-primary-800 font-medium shrink-0"
            >
              Edit
            </button>
          )}
        </div>

        <div className="px-4 pb-4 border-t border-neutral-100 pt-3 space-y-4">
          {/* Round progression header */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[10px] text-neutral-400 font-medium">
            {KNOCKOUT_ROUNDS.map((round, idx) => (
              <span key={round.key} className="flex items-center gap-1 shrink-0">
                {idx > 0 && <span className="text-neutral-300">&rarr;</span>}
                <span className={
                  (knockoutRoundData.get(round.key) ?? []).length > 0 &&
                  (knockoutRoundData.get(round.key) ?? []).every(e => e.winner)
                    ? 'text-success-600'
                    : ''
                }>
                  {round.label}
                </span>
              </span>
            ))}
          </div>

          {/* Round-by-round picks */}
          {KNOCKOUT_ROUNDS.map(round => {
            const entries = knockoutRoundData.get(round.key) ?? []
            if (entries.length === 0) return null

            const pickedCount = entries.filter(e => e.winner).length
            const isRoundComplete = pickedCount === entries.length

            return (
              <div key={round.key}>
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="text-xs font-semibold text-neutral-700">{round.label}</h4>
                  <span className={`text-[10px] font-medium ${isRoundComplete ? 'text-success-600' : 'text-neutral-400'}`}>
                    {pickedCount}/{entries.length}
                  </span>
                </div>

                <div className={`grid gap-1.5 ${
                  entries.length > 4
                    ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'
                    : entries.length > 2
                    ? 'grid-cols-2 sm:grid-cols-3'
                    : entries.length === 2
                    ? 'grid-cols-2'
                    : 'grid-cols-1 max-w-xs'
                }`}>
                  {entries.map(({ match, winner, isPenalty }) => {
                    const resolved = knockoutTeamMap.get(match.match_number)
                    const homeTeam = resolved?.home
                    const awayTeam = resolved?.away

                    // Determine if winner is on the champion's path
                    const isChampionPath = champion && winner &&
                      winner.team_id === champion.team_id

                    return (
                      <div
                        key={match.match_id}
                        className={`rounded-lg border px-2.5 py-2 ${
                          isChampionPath
                            ? 'border-success-300 bg-success-50/60'
                            : winner
                            ? 'border-neutral-200 bg-neutral-50/50'
                            : 'border-dashed border-neutral-200 bg-white'
                        }`}
                      >
                        <div className="text-[10px] text-neutral-400 mb-1">M{match.match_number}</div>
                        {winner ? (
                          <div className="flex items-center gap-1.5">
                            <TeamFlag team={winner} size="sm" />
                            <span className={`text-xs font-medium truncate ${isChampionPath ? 'text-success-800' : 'text-neutral-800'}`}>
                              {winner.country_name}
                            </span>
                            {isPenalty && (
                              <span className="text-[9px] text-primary-500 font-medium shrink-0">(P)</span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-[11px] text-neutral-400">
                            <span className="truncate">{homeTeam?.country_name ?? match.home_team_placeholder ?? 'TBD'}</span>
                            <span className="text-neutral-300">v</span>
                            <span className="truncate">{awayTeam?.country_name ?? match.away_team_placeholder ?? 'TBD'}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Statistics summary */}
      <div className="bg-surface rounded-xl border border-neutral-200 p-4">
        <h3 className="text-sm font-semibold text-neutral-900 mb-3">Prediction Summary</h3>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-lg font-bold text-neutral-900">{stats.groupRankingCount}</p>
            <p className="text-[10px] text-neutral-500">Group rankings</p>
          </div>
          <div>
            <p className="text-lg font-bold text-neutral-900">{stats.thirdPlaceCount}</p>
            <p className="text-[10px] text-neutral-500">Third-place rankings</p>
          </div>
          <div>
            <p className="text-lg font-bold text-neutral-900">{stats.knockoutPickCount}</p>
            <p className="text-[10px] text-neutral-500">Knockout picks</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-neutral-100 text-center">
          <p className="text-sm text-neutral-700">
            <span className="font-bold text-neutral-900">{stats.totalPredictions}</span> total predictions
          </p>
        </div>
      </div>
    </div>
  )
}
