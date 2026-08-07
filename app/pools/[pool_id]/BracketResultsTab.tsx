'use client'

import { Fragment, useState, useMemo } from 'react'
import {
  calculateGroupStandings,
  rankThirdPlaceTeams,
  getAnnexCInfo,
  GROUP_LETTERS,
  type GroupStanding,
  type PredictionMap,
  type MatchConductData,
  type Match,
  type Team,
  type ThirdPlaceTeam,
} from '@/lib/tournament'
import {
  buildGroupStandingsFromRankings,
  resolveFullBracketFromPicks,
  getBPAnnexCInfo,
} from '@/lib/bracketPickerResolver'
import { calculateBracketPickerPoints, type MatchWithResult } from '@/lib/bracketPickerScoring'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Select } from '@/components/ui/Select'
import { MatchCard, type ResultMatch, type BracketPick } from './results/MatchCard'
import { type PoolSettings } from './results/points'
import type {
  MatchData,
  TeamData,
  SettingsData,
  BPGroupRanking,
  BPThirdPlaceRanking,
  BPKnockoutPick,
  EntryData,
  BonusScoreData,
} from './types'

// =============================================
// TYPES
// =============================================

type BracketResultsTabProps = {
  matches: MatchData[]
  teams: TeamData[]
  conductData: MatchConductData[]
  settings: SettingsData
  // Current user's active entry BP data
  bpGroupRankings: BPGroupRanking[]
  bpThirdPlaceRankings: BPThirdPlaceRanking[]
  bpKnockoutPicks: BPKnockoutPick[]
  // Multi-entry support
  userEntries: EntryData[]
  currentEntryId: string
  // All entries' BP data (for switching entries)
  allBPGroupRankings: BPGroupRanking[]
  allBPThirdPlaceRankings: BPThirdPlaceRanking[]
  allBPKnockoutPicks: BPKnockoutPick[]
  bpProvisionalScoring?: boolean
  /** Every bonus row for this pool; bp_knockout ones carry the per-match points. */
  bonusScores: BonusScoreData[]
}



// =============================================
// GROUP COMPARISON COMPONENT
// =============================================

function GroupComparison({
  groupLetter,
  actualStandings,
  predictedStandings,
  hasActualData,
  groupPoints,
}: {
  groupLetter: string
  actualStandings: GroupStanding[]
  predictedStandings: GroupStanding[]
  hasActualData: boolean
  groupPoints: number | null
}) {
  // Build a map of actual positions: team_id → position (0-indexed)
  const actualPositionMap = new Map<string, number>()
  for (let i = 0; i < actualStandings.length; i++) {
    actualPositionMap.set(actualStandings[i].team_id, i)
  }

  return (
    <Card padding="md">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-ink">Group {groupLetter}</h3>
        {groupPoints !== null && (
          <span className="t-num t-num-medium text-xs text-muted">
            {groupPoints} {groupPoints === 1 ? 'pt' : 'pts'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Predicted column */}
        <div>
          <div className="t-caption text-muted mb-1.5">
            Your Picks
          </div>
          <div className="space-y-1">
            {predictedStandings.map((team, idx) => {
              const actualPos = actualPositionMap.get(team.team_id)
              const isCorrect = hasActualData && actualPos === idx
              const isWrong = hasActualData && actualPos !== undefined && actualPos !== idx

              return (
                <div
                  key={team.team_id}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-inset text-xs ${
                    isCorrect
                      ? 'bg-success-50 text-success-800 ring-1 ring-success-200'
                      : isWrong
                        ? 'bg-danger-50 text-danger-700 ring-1 ring-danger-200'
                        : 'bg-snow text-ink'
                  }`}
                >
                  <span className="t-num t-num-regular text-[10px] text-muted w-3">{idx + 1}</span>
                  <span className="truncate flex-1 font-medium">{team.country_name}</span>
                  {isCorrect && <span className="text-success-600 text-xs flex-shrink-0">&#10003;</span>}
                  {isWrong && <span className="text-danger-500 text-xs flex-shrink-0">&#10007;</span>}
                </div>
              )
            })}
          </div>
        </div>

        {/* Actual column */}
        <div>
          <div className="t-caption text-muted mb-1.5">
            Actual
          </div>
          {!hasActualData ? (
            <div className="text-xs text-muted italic py-2">
              No results yet
            </div>
          ) : (
            <div className="space-y-1">
              {actualStandings.map((team, idx) => (
                <div
                  key={team.team_id}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-inset text-xs bg-silver text-ink"
                >
                  <span className="t-num t-num-regular text-[10px] text-muted w-3">{idx + 1}</span>
                  <span className="truncate flex-1 font-medium">{team.country_name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

// =============================================
// THIRD PLACE COMPARISON COMPONENT
// =============================================

function ThirdPlaceComparison({
  predictedThirds,
  actualThirds,
  hasActualData,
  teams,
  thirdPlacePoints,
}: {
  predictedThirds: BPThirdPlaceRanking[]
  actualThirds: ThirdPlaceTeam[]
  hasActualData: boolean
  teams: TeamData[]
  thirdPlacePoints: number | null
}) {
  const teamMap = new Map(teams.map(t => [t.team_id, t]))
  const sortedPredicted = [...predictedThirds].sort((a, b) => a.rank - b.rank)

  // All actual 3rd-place team IDs (all 12 groups)
  const actualThirdPlaceTeamIds = new Set(actualThirds.map(t => t.team_id))
  // Actual qualifiers (top 8) by team_id
  const actualQualifierIds = new Set(actualThirds.slice(0, 8).map(t => t.team_id))

  return (
    <Card padding="md">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-ink">Third-Place Rankings</h3>
          <span className="text-xs text-muted">Top 8 qualify</span>
        </div>
        {thirdPlacePoints !== null && (
          <span className="t-num t-num-medium text-xs text-muted">
            {thirdPlacePoints} {thirdPlacePoints === 1 ? 'pt' : 'pts'}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Predicted */}
        <div>
          <div className="t-caption text-muted mb-1.5">
            Your Picks
          </div>
          <div className="space-y-1">
            {sortedPredicted.map((pick, idx) => {
              const team = teamMap.get(pick.team_id)
              const isQualifier = idx < 8
              // First check: did this team actually finish 3rd in their group?
              const isActualThird = hasActualData && actualThirdPlaceTeamIds.has(pick.team_id)
              const actuallyQualified = hasActualData && actualQualifierIds.has(pick.team_id)

              // States for teams that DID finish 3rd
              const isCorrectQualifier = isActualThird && isQualifier && actuallyQualified
              const isMissedQualifier = isActualThird && isQualifier && !actuallyQualified
              const isWronglyEliminated = isActualThird && !isQualifier && actuallyQualified
              const isCorrectlyEliminated = isActualThird && !isQualifier && !actuallyQualified

              // State for teams that did NOT finish 3rd (wrong group prediction)
              const isWrongTeam = hasActualData && !isActualThird

              return (
                <Fragment key={pick.team_id}>
                  {idx === 8 && (
                    <div className="flex items-center gap-2 py-0.5">
                      <div className="flex-1 border-t border-dashed border-border-default" />
                      <span className="text-[9px] text-muted uppercase tracking-wider">Eliminated</span>
                      <div className="flex-1 border-t border-dashed border-border-default" />
                    </div>
                  )}
                  <div
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-inset text-xs ${
                      isCorrectQualifier
                        ? 'bg-success-50 text-success-800 ring-1 ring-success-200'
                        : isCorrectlyEliminated
                          ? 'bg-success-50 text-success-800 ring-1 ring-success-200'
                          : isMissedQualifier
                            ? 'bg-danger-50 text-danger-700 ring-1 ring-danger-200'
                            : isWronglyEliminated
                              ? 'bg-warning-50 text-warning-700 ring-1 ring-warning-200'
                              : isWrongTeam
                                ? 'bg-danger-50 text-danger-700 ring-1 ring-danger-200'
                                : isQualifier
                                  ? 'bg-primary-50 text-primary-700'
                                  : 'bg-snow text-muted'
                    }`}
                  >
                    <span className="t-num t-num-regular text-[10px] text-muted w-4">{idx + 1}</span>
                    <span className="truncate flex-1 font-medium">
                      {team?.country_name ?? 'Unknown'}
                    </span>
                    <span className="t-detail text-muted">{pick.group_letter}</span>
                    {(isCorrectQualifier || isCorrectlyEliminated) && <span className="text-success-600 text-xs flex-shrink-0">&#10003;</span>}
                    {(isMissedQualifier || isWrongTeam) && <span className="text-danger-500 text-xs flex-shrink-0">&#10007;</span>}
                    {isWronglyEliminated && <span className="text-warning-600 text-xs flex-shrink-0">!</span>}
                  </div>
                </Fragment>
              )
            })}
          </div>
        </div>

        {/* Actual */}
        <div>
          <div className="t-caption text-muted mb-1.5">
            Actual
          </div>
          {!hasActualData ? (
            <div className="text-xs text-muted italic py-2">
              No results yet
            </div>
          ) : (
            <div className="space-y-1">
              {actualThirds.map((team, idx) => {
                const isQualifier = idx < 8
                return (
                  <Fragment key={team.team_id}>
                    {idx === 8 && (
                      <div className="flex items-center gap-2 py-0.5">
                        <div className="flex-1 border-t border-dashed border-border-default" />
                        <span className="text-[9px] text-muted uppercase tracking-wider">Eliminated</span>
                        <div className="flex-1 border-t border-dashed border-border-default" />
                      </div>
                    )}
                    <div
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-inset text-xs ${
                        isQualifier
                          ? 'bg-primary-100 text-primary-700'
                          : 'bg-silver text-muted'
                      }`}
                    >
                      <span className="t-num t-num-regular text-[10px] text-muted w-4">{idx + 1}</span>
                      <span className="truncate flex-1 font-medium">{team.country_name}</span>
                      <span className="t-detail text-muted">{team.group_letter}</span>
                    </div>
                  </Fragment>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

// =============================================
// =============================================
// KNOCKOUT RESULTS
// =============================================
// A filtered match list, the same shape the progressive and full-tournament
// pools get on their Results tab. It replaced a drawn bracket grid: the grid
// looked the part but could only ever show the real tournament, so a member
// whose bracket had diverged spent most of it reading about teams they never
// picked.
//
// The rows are MatchCards in bracket_picker mode. That mode exists because
// these pools store none of what the card normally reads — no scoreline, and no
// match_scores row at all (998 entries, zero of either). What they do have is a
// winner pick per match and a bp_knockout bonus carrying related_match_id,
// which is where the points below come from.

type StageKey = 'all' | 'round_32' | 'round_16' | 'quarter_final' | 'semi_final' | 'finals'
type StatusKey = 'all' | 'completed' | 'live' | 'upcoming'

const STAGE_OPTIONS: { key: StageKey; label: string }[] = [
  { key: 'all', label: 'All Rounds' },
  { key: 'round_32', label: 'Round of 32' },
  { key: 'round_16', label: 'Round of 16' },
  { key: 'quarter_final', label: 'Quarter-Finals' },
  { key: 'semi_final', label: 'Semi-Finals' },
  { key: 'finals', label: 'Finals' },
]

const STATUS_OPTIONS: { key: StatusKey; label: string }[] = [
  { key: 'all', label: 'All Matches' },
  { key: 'completed', label: 'Completed' },
  { key: 'live', label: 'Live' },
  { key: 'upcoming', label: 'Upcoming' },
]

function KnockoutComparison({
  matchMap,
  knockoutPicks,
  predictedKnockoutTeams,
  bonusScores,
  settings,
  completedKnockout,
  totalKnockout,
  correctPicks,
  totalPickable,
  teams,
}: {
  matchMap: Map<number, MatchData>
  knockoutPicks: BPKnockoutPick[]
  /** The user's own bracket, keyed by match number — same slots as the real match. */
  predictedKnockoutTeams: Map<number, { home: GroupStanding | null; away: GroupStanding | null }>
  /** Every bonus for this entry; the bp_knockout ones carry the per-match points. */
  bonusScores: BonusScoreData[]
  settings: SettingsData
  completedKnockout: number
  totalKnockout: number
  correctPicks: number
  totalPickable: number
  teams: TeamData[]
}) {
  const [stage, setStage] = useState<StageKey>('all')
  const [status, setStatus] = useState<StatusKey>('all')

  const teamById = useMemo(() => new Map(teams.map(t => [t.team_id, t])), [teams])
  const picksById = useMemo(
    () => new Map(knockoutPicks.map(p => [p.match_id, p.winner_team_id])),
    [knockoutPicks],
  )

  // Points per match. Summed rather than assigned because a match can carry more
  // than one bp_knockout row, and a silent overwrite would under-report.
  const pointsByMatch = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of bonusScores) {
      if (b.bonus_category === 'bp_knockout' && b.related_match_id) {
        m.set(b.related_match_id, (m.get(b.related_match_id) ?? 0) + b.points_earned)
      }
    }
    return m
  }, [bonusScores])

  const rows = useMemo(() => {
    const knockout = [...matchMap.values()]
      .filter(m => m.stage !== 'group')
      .sort((a, b) => a.match_number - b.match_number)

    return knockout.map(m => {
      const slots = predictedKnockoutTeams.get(m.match_number)
      const pickId = picksById.get(m.match_id) ?? null
      const pickTeam = pickId ? teamById.get(pickId) : null

      const match: ResultMatch = {
        match_id: m.match_id,
        match_number: m.match_number,
        stage: m.stage,
        group_letter: m.group_letter,
        match_date: m.match_date,
        venue: m.venue,
        status: m.status,
        status_detail: m.status_detail,
        original_match_date: m.original_match_date,
        live_minute: m.live_minute,
        live_period: m.live_period,
        home_score_ft: m.home_score_ft,
        away_score_ft: m.away_score_ft,
        home_score_pso: m.home_score_pso,
        away_score_pso: m.away_score_pso,
        home_team_placeholder: m.home_team_placeholder,
        away_team_placeholder: m.away_team_placeholder,
        home_team_id: m.home_team_id,
        away_team_id: m.away_team_id,
        home_team: m.home_team
          ? {
              country_name: m.home_team.country_name,
              country_code: teamById.get(m.home_team_id ?? '')?.country_code ?? '',
              flag_url: teamById.get(m.home_team_id ?? '')?.flag_url ?? null,
            }
          : null,
        away_team: m.away_team
          ? {
              country_name: m.away_team.country_name,
              country_code: teamById.get(m.away_team_id ?? '')?.country_code ?? '',
              flag_url: teamById.get(m.away_team_id ?? '')?.flag_url ?? null,
            }
          : null,
        // No scoreline exists in this mode — the pick is carried on bracketPick.
        prediction: null,
        predicted_home_team_name: slots?.home?.country_name ?? null,
        predicted_away_team_name: slots?.away?.country_name ?? null,
        predicted_home_team_id: slots?.home?.team_id ?? null,
        predicted_away_team_id: slots?.away?.team_id ?? null,
      }

      const bracketPick: BracketPick | null = pickId
        ? {
            teamName: pickTeam?.country_name ?? null,
            flagUrl: pickTeam?.flag_url ?? null,
            // Undecided until the match is done AND has a winner — a pick on an
            // unplayed tie is not wrong, it is unresolved.
            isCorrect:
              m.is_completed && m.winner_team_id ? m.winner_team_id === pickId : null,
            // A completed match with no bonus row earned nothing; an unplayed one
            // has no answer yet, and 0 would read as a miss.
            points: pointsByMatch.get(m.match_id) ?? (m.is_completed ? 0 : null),
          }
        : null

      return { match, bracketPick }
    })
  }, [matchMap, predictedKnockoutTeams, picksById, teamById, pointsByMatch])

  const filtered = useMemo(() => {
    return rows.filter(({ match }) => {
      if (stage === 'finals') {
        if (match.stage !== 'third_place' && match.stage !== 'final') return false
      } else if (stage !== 'all' && match.stage !== stage) {
        return false
      }
      if (status === 'upcoming') {
        return match.status !== 'completed' && match.status !== 'live'
      }
      if (status !== 'all' && match.status !== status) return false
      return true
    })
  }, [rows, stage, status])

  const totalPoints = useMemo(
    () => rows.reduce((sum, r) => sum + (r.bracketPick?.points ?? 0), 0),
    [rows],
  )

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl font-bold text-ink">Knockout Results</h2>
        {totalPickable > 0 && (
          <Badge variant={correctPicks === totalPickable ? 'green' : correctPicks > 0 ? 'blue' : 'gray'}>
            {correctPicks}/{totalPickable} correct
          </Badge>
        )}
        {completedKnockout > 0 && (
          <Badge variant="gray">
            {completedKnockout}/{totalKnockout} played
          </Badge>
        )}
      </div>

      {/* Header row — points left, filters right — matching the Results tab the
          other two modes get, which is the point of this view. */}
      <div className="mb-4 px-4 py-3 bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="hidden sm:inline t-card-title text-ink truncate">Knockout Points</span>
          <span className="t-num t-num-extrabold text-lg text-primary-600 whitespace-nowrap">
            {totalPoints}
            <span className="t-detail text-muted ml-1">pts</span>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <Select
            value={stage}
            onChange={e => setStage(e.target.value as StageKey)}
            aria-label="Filter by round"
          >
            {STAGE_OPTIONS.map(o => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </Select>
          <Select
            value={status}
            onChange={e => setStatus(e.target.value as StatusKey)}
            aria-label="Filter by match status"
          >
            {STATUS_OPTIONS.map(o => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </Select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-surface rounded-card shadow-card p-8 text-center">
          <p className="t-body text-muted">No matches match these filters.</p>
        </div>
      ) : (
        <div className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default overflow-hidden divide-y divide-border-subtle">
          {filtered.map(({ match, bracketPick }, i) => (
            <MatchCard
              key={match.match_id}
              match={match}
              // Unused by the card, but part of its contract.
              poolSettings={settings as unknown as PoolSettings}
              predictionMode="bracket_picker"
              index={i}
              bracketPick={bracketPick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// =============================================
// MAIN COMPONENT
// =============================================

export function BracketResultsTab({
  matches,
  teams,
  conductData,
  settings,
  bpGroupRankings: initialGroupRankings,
  bpThirdPlaceRankings: initialThirdPlaceRankings,
  bpKnockoutPicks: initialKnockoutPicks,
  userEntries,
  currentEntryId,
  allBPGroupRankings,
  allBPThirdPlaceRankings,
  allBPKnockoutPicks,
  bpProvisionalScoring = false,
  bonusScores,
}: BracketResultsTabProps) {
  const [selectedEntryId, setSelectedEntryId] = useState(currentEntryId)
  const showEntrySelector = userEntries.length > 1

  // Derive BP data for the selected entry
  const groupRankings = useMemo(() => {
    if (selectedEntryId === currentEntryId) return initialGroupRankings
    return allBPGroupRankings.filter(r => r.entry_id === selectedEntryId)
  }, [selectedEntryId, currentEntryId, initialGroupRankings, allBPGroupRankings])

  const thirdPlaceRankings = useMemo(() => {
    if (selectedEntryId === currentEntryId) return initialThirdPlaceRankings
    return allBPThirdPlaceRankings.filter(r => r.entry_id === selectedEntryId)
  }, [selectedEntryId, currentEntryId, initialThirdPlaceRankings, allBPThirdPlaceRankings])

  const entryBonusScores = useMemo(
    () => bonusScores.filter(b => b.entry_id === selectedEntryId),
    [bonusScores, selectedEntryId],
  )

  const knockoutPicks = useMemo(() => {
    if (selectedEntryId === currentEntryId) return initialKnockoutPicks
    return allBPKnockoutPicks.filter(r => r.entry_id === selectedEntryId)
  }, [selectedEntryId, currentEntryId, initialKnockoutPicks, allBPKnockoutPicks])

  // Check if entry has submitted
  const selectedEntry = userEntries.find(e => e.entry_id === selectedEntryId)
  const isSubmitted = selectedEntry?.has_submitted_predictions ?? false

  // Match map
  const matchMap = useMemo(() => {
    const map = new Map<number, MatchData>()
    for (const m of matches) {
      map.set(m.match_number, m)
    }
    return map
  }, [matches])

  // Convert teams for tournament lib
  const tournamentTeams: Team[] = useMemo(() =>
    teams.map(t => ({
      team_id: t.team_id,
      country_name: t.country_name,
      country_code: t.country_code,
      group_letter: t.group_letter,
      fifa_ranking_points: t.fifa_ranking_points,
      flag_url: t.flag_url,
    })),
    [teams]
  )

  // Convert matches for tournament lib
  const tournamentMatches: Match[] = useMemo(() =>
    matches.map(m => ({
      match_id: m.match_id,
      match_number: m.match_number,
      stage: m.stage,
      group_letter: m.group_letter,
      match_date: m.match_date,
      venue: m.venue,
      status: m.status,
      home_team_id: m.home_team_id,
      away_team_id: m.away_team_id,
      home_team_placeholder: m.home_team_placeholder,
      away_team_placeholder: m.away_team_placeholder,
      home_team: m.home_team ? { country_name: m.home_team.country_name, flag_url: null } : null,
      away_team: m.away_team ? { country_name: m.away_team.country_name, flag_url: null } : null,
    })),
    [matches]
  )

  // ---- Actual group standings (from real match results) ----
  const { actualGroupStandings, actualRankedThirds, hasAnyCompletedGroupMatch } = useMemo(() => {
    const actualScores: PredictionMap = new Map()
    for (const m of matches) {
      if (m.stage === 'group' && (m.is_completed || m.status === 'live') && m.home_score_ft !== null && m.away_score_ft !== null) {
        actualScores.set(m.match_id, { home: m.home_score_ft, away: m.away_score_ft })
      }
    }

    const hasAnyCompletedGroupMatch = actualScores.size > 0
    const groupMatches = tournamentMatches.filter(m => m.stage === 'group')

    const actualGroupStandings = new Map<string, GroupStanding[]>()
    for (const letter of GROUP_LETTERS) {
      const gMatches = groupMatches.filter(m => m.group_letter === letter)
      actualGroupStandings.set(letter, calculateGroupStandings(letter, gMatches, actualScores, tournamentTeams, conductData))
    }

    const actualRankedThirds = rankThirdPlaceTeams(actualGroupStandings)
    return { actualGroupStandings, actualRankedThirds, hasAnyCompletedGroupMatch }
  }, [matches, tournamentMatches, tournamentTeams, conductData])

  // ---- Predicted group standings (from user's BP picks) ----
  const predictedGroupStandings = useMemo(() => {
    if (groupRankings.length === 0) return new Map<string, GroupStanding[]>()
    return buildGroupStandingsFromRankings(groupRankings, tournamentTeams)
  }, [groupRankings, tournamentTeams])

  // ---- The user's own knockout bracket ----
  // Which teams THEY had in each knockout slot, resolved from their group
  // rankings plus their knockout picks. The grid below draws the real
  // tournament, so a pick for a team that never turned up had nowhere to
  // appear and simply vanished — 36% of every knockout pick ever made, and
  // 62% of Final picks. Keyed by match number, same slots as the real match.
  const predictedKnockoutTeams = useMemo(() => {
    const empty = new Map<number, { home: GroupStanding | null; away: GroupStanding | null }>()
    if (groupRankings.length === 0) return empty
    return resolveFullBracketFromPicks({
      groupRankings,
      thirdPlaceRankings,
      knockoutPicks,
      teams: tournamentTeams,
      matches: tournamentMatches,
    }).knockoutTeamMap
  }, [groupRankings, thirdPlaceRankings, knockoutPicks, tournamentTeams, tournamentMatches])

  // ---- Knockout stats ----
  const { completedKnockout, totalKnockout, correctPicks, totalPickable } = useMemo(() => {
    const knockoutMatches = matches.filter(m => m.stage !== 'group')
    const completed = knockoutMatches.filter(m => m.is_completed)
    const picksMap = new Map(knockoutPicks.map(p => [p.match_id, p.winner_team_id]))

    let correct = 0
    let pickable = 0
    for (const m of completed) {
      if (m.winner_team_id && picksMap.has(m.match_id)) {
        pickable++
        if (m.winner_team_id === picksMap.get(m.match_id)) correct++
      }
    }

    return {
      completedKnockout: completed.length,
      totalKnockout: knockoutMatches.length,
      correctPicks: correct,
      totalPickable: pickable,
    }
  }, [matches, knockoutPicks])

  // ---- Group scoring summary ----
  const groupScoreSummary = useMemo(() => {
    if (!hasAnyCompletedGroupMatch || groupRankings.length === 0) return null

    let correctPositions = 0
    let totalPositions = 0

    for (const letter of GROUP_LETTERS) {
      const actual = actualGroupStandings.get(letter) || []
      const predicted = predictedGroupStandings.get(letter) || []
      if (actual.length === 0 || predicted.length === 0) continue

      // Only count groups with completed matches
      const hasData = actual.some(s => s.played > 0)
      if (!hasData) continue

      for (let i = 0; i < predicted.length; i++) {
        const actualPos = actual.findIndex(a => a.team_id === predicted[i].team_id)
        totalPositions++
        if (actualPos === i) correctPositions++
      }
    }

    return { correctPositions, totalPositions }
  }, [hasAnyCompletedGroupMatch, groupRankings, actualGroupStandings, predictedGroupStandings])

  // ---- Per-section points from scoring engine ----
  const { groupPointsMap, thirdPlacePoints } = useMemo(() => {
    const groupPointsMap = new Map<string, number>()
    if (!hasAnyCompletedGroupMatch || groupRankings.length === 0) {
      return { groupPointsMap, thirdPlacePoints: null as number | null }
    }

    // Build actual third-place qualifier IDs — only when ALL 12 groups are fully complete
    const completedGroupLetters = new Set<string>()
    for (const letter of GROUP_LETTERS) {
      const completedGroupMatches = matches.filter(
        m => m.stage === 'group' && m.group_letter === letter && m.is_completed
      )
      if (completedGroupMatches.length >= 6) completedGroupLetters.add(letter)
    }

    const actualThirdQualifierIds = new Set<string>()
    if (completedGroupLetters.size === 12) {
      for (const t of actualRankedThirds.slice(0, 8)) {
        actualThirdQualifierIds.add(t.team_id)
      }
    }

    // Build completed matches as MatchWithResult
    const completedMatches: MatchWithResult[] = matches
      .filter(m => m.is_completed)
      .map(m => ({
        match_id: m.match_id,
        match_number: m.match_number,
        stage: m.stage,
        group_letter: m.group_letter,
        match_date: m.match_date,
        venue: m.venue,
        status: m.status,
        home_team_id: m.home_team_id,
        away_team_id: m.away_team_id,
        home_team_placeholder: m.home_team_placeholder,
        away_team_placeholder: m.away_team_placeholder,
        home_team: m.home_team ? { country_name: m.home_team.country_name, flag_url: null } : null,
        away_team: m.away_team ? { country_name: m.away_team.country_name, flag_url: null } : null,
        is_completed: m.is_completed,
        home_score_ft: m.home_score_ft,
        away_score_ft: m.away_score_ft,
        home_score_pso: m.home_score_pso,
        away_score_pso: m.away_score_pso,
        winner_team_id: m.winner_team_id,
      }))

    const allGroupsComplete = completedGroupLetters.size === 12

    const breakdown = calculateBracketPickerPoints({
      groupRankings,
      // Only score third-place when all 12 groups are fully complete
      thirdPlaceRankings: allGroupsComplete ? thirdPlaceRankings : [],
      knockoutPicks,
      actualGroupStandings,
      actualThirdPlaceQualifierTeamIds: actualThirdQualifierIds,
      completedMatches,
      settings,
      provisionalGroups: bpProvisionalScoring,
    })

    // Sum groupDetails by group_letter
    for (const detail of breakdown.groupDetails) {
      groupPointsMap.set(detail.group_letter, (groupPointsMap.get(detail.group_letter) || 0) + detail.points)
    }

    return {
      groupPointsMap,
      thirdPlacePoints: allGroupsComplete
        ? breakdown.thirdPlacePoints + breakdown.thirdPlaceAllCorrectBonus
        : null,
    }
  }, [hasAnyCompletedGroupMatch, groupRankings, thirdPlaceRankings, knockoutPicks, matches, actualGroupStandings, actualRankedThirds, settings, bpProvisionalScoring])

  // If no predictions submitted
  if (!isSubmitted && groupRankings.length === 0) {
    return (
      <div className="bg-surface rounded-card shadow p-8 text-center">
        <p className="text-muted">
          {selectedEntryId === currentEntryId
            ? 'You haven\'t submitted your bracket picks yet. Head to the Predictions tab to get started!'
            : 'This entry hasn\'t been submitted yet.'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Entry selector */}
      {showEntrySelector && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-ink">Viewing entry:</label>
          <select
            value={selectedEntryId}
            onChange={e => setSelectedEntryId(e.target.value)}
            className="text-sm border border-border-default rounded-card px-3 py-1.5 bg-surface focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            {userEntries.map(entry => (
              <option key={entry.entry_id} value={entry.entry_id}>
                {entry.entry_name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ================================ */}
      {/* GROUP RANKINGS COMPARISON         */}
      {/* ================================ */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-xl font-bold text-ink">Group Rankings</h2>
          {groupScoreSummary && (
            <Badge variant={groupScoreSummary.correctPositions > 0 ? 'green' : 'gray'}>
              {groupScoreSummary.correctPositions}/{groupScoreSummary.totalPositions} correct
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {GROUP_LETTERS.map(letter => {
            const actual = actualGroupStandings.get(letter) || []
            const predicted = predictedGroupStandings.get(letter) || []
            const hasData = actual.some(s => s.played > 0)

            if (predicted.length === 0) return null

            return (
              <GroupComparison
                key={letter}
                groupLetter={letter}
                actualStandings={actual}
                predictedStandings={predicted}
                hasActualData={hasData}
                groupPoints={groupPointsMap.get(letter) ?? null}
              />
            )
          })}
        </div>
      </div>

      {/* ================================ */}
      {/* THIRD-PLACE COMPARISON            */}
      {/* ================================ */}
      {thirdPlaceRankings.length > 0 && (
        <ThirdPlaceComparison
          predictedThirds={thirdPlaceRankings}
          actualThirds={actualRankedThirds}
          hasActualData={hasAnyCompletedGroupMatch}
          teams={teams}
          thirdPlacePoints={thirdPlacePoints}
        />
      )}

      {/* ================================ */}
      {/* KNOCKOUT BRACKET COMPARISON       */}
      {/* ================================ */}
      <KnockoutComparison
        matchMap={matchMap}
        knockoutPicks={knockoutPicks}
        predictedKnockoutTeams={predictedKnockoutTeams}
        bonusScores={entryBonusScores}
        settings={settings}
        completedKnockout={completedKnockout}
        totalKnockout={totalKnockout}
        correctPicks={correctPicks}
        totalPickable={totalPickable}
        teams={teams}
      />
    </div>
  )
}
