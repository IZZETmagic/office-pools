'use client'

import { useMemo } from 'react'
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
} from '@/lib/tournament'
import { StandingsTable } from '@/components/predictions/StandingsTable'
import { ThirdPlaceTable } from '@/components/predictions/ThirdPlaceTable'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import type { MatchData, TeamData } from './types'

// =============================================
// TYPES
// =============================================

type StandingsTabProps = {
  matches: MatchData[]
  teams: TeamData[]
  conductData: MatchConductData[]
}

/** Bracket match cell data */
type BracketMatch = {
  matchNumber: number
  stage: string
  homeName: string
  awayName: string
  homeScore: number | null
  awayScore: number | null
  homePso: number | null
  awayPso: number | null
  isCompleted: boolean
  isLive: boolean
  winnerSide: 'home' | 'away' | null
}

// =============================================
// BRACKET STRUCTURE
// =============================================

// Left half of the bracket: R32 (73-80) → R16 (89-92) → QF (97-98) → SF (101)
// Right half of the bracket: R32 (81-88) → R16 (93-96) → QF (99-100) → SF (102)
// Center: 3rd Place (103), Final (104)

const LEFT_R32 = [73, 74, 75, 76, 77, 78, 79, 80]
const RIGHT_R32 = [81, 82, 83, 84, 85, 86, 87, 88]
const LEFT_R16 = [89, 90, 91, 92]
const RIGHT_R16 = [93, 94, 95, 96]
const LEFT_QF = [97, 98]
const RIGHT_QF = [99, 100]
const LEFT_SF = [101]
const RIGHT_SF = [102]

// =============================================
// BRACKET LAYOUT CONSTANTS
// =============================================

// Cell dimensions
const CELL_W = 100
const CELL_H = 40
// Vertical gap between two matches that feed into the same next-round match
const PAIR_GAP = 4
// Horizontal gap between rounds (for connector lines)
const COL_GAP = 14
// Round column width = cell + gap
const ROUND_W = CELL_W + COL_GAP
// Header height above the bracket
const HEADER_H = 16

// Total bracket height: 8 R32 matches with gaps
// R32: 8 slots, grouped as 4 pairs. Within each pair gap is PAIR_GAP, between pairs we need space.
// Layout: each round's matches are centered vertically so connectors align.
// R32 total = 8 * CELL_H + 7 * PAIR_GAP  (8 cells with 7 gaps between them)
const R32_TOTAL_H = 8 * CELL_H + 7 * PAIR_GAP

// =============================================
// HELPER: Build bracket match data
// =============================================

function buildBracketMatch(
  matchNumber: number,
  matchMap: Map<number, MatchData>
): BracketMatch {
  const match = matchMap.get(matchNumber)
  if (!match) {
    return {
      matchNumber,
      stage: '',
      homeName: 'TBD',
      awayName: 'TBD',
      homeScore: null,
      awayScore: null,
      homePso: null,
      awayPso: null,
      isCompleted: false,
      isLive: false,
      winnerSide: null,
    }
  }

  const homeName =
    match.home_team?.country_name || match.home_team_placeholder || 'TBD'
  const awayName =
    match.away_team?.country_name || match.away_team_placeholder || 'TBD'

  let winnerSide: 'home' | 'away' | null = null
  if (match.is_completed && match.home_score_ft !== null && match.away_score_ft !== null) {
    if (match.home_score_ft > match.away_score_ft) {
      winnerSide = 'home'
    } else if (match.away_score_ft > match.home_score_ft) {
      winnerSide = 'away'
    } else if (match.home_score_pso !== null && match.away_score_pso !== null) {
      winnerSide = match.home_score_pso > match.away_score_pso ? 'home' : 'away'
    } else if (match.winner_team_id) {
      winnerSide = match.winner_team_id === match.home_team_id ? 'home' : 'away'
    }
  }

  return {
    matchNumber,
    stage: match.stage,
    homeName,
    awayName,
    homeScore: match.home_score_ft,
    awayScore: match.away_score_ft,
    homePso: match.home_score_pso,
    awayPso: match.away_score_pso,
    isCompleted: match.is_completed,
    isLive: match.status === 'live',
    winnerSide,
  }
}

// =============================================
// HELPER: Truncate long placeholder names
// =============================================

function shortName(name: string): string {
  // Shorten "Winner Match XX" → "W XX", "Loser Match XX" → "L XX"
  // Shorten "1st Group A" → "1st A", "2nd Group B" → "2nd B", "3rd Group C" → "3rd C"
  if (name.startsWith('Winner Match ')) return 'W' + name.slice(12)
  if (name.startsWith('Loser Match ')) return 'L' + name.slice(11)
  if (/^\d(st|nd|rd|th) Group [A-L]$/.test(name)) return name.replace(' Group ', ' ')
  return name
}

// =============================================
// BRACKET MATCH CELL (positioned absolutely)
// =============================================

function BracketCell({
  match,
  x,
  y,
}: {
  match: BracketMatch
  x: number
  y: number
}) {
  const hasScore = match.homeScore !== null && match.awayScore !== null

  return (
    <div
      className="absolute border border-neutral-300 rounded bg-white shadow-sm overflow-hidden"
      style={{ left: x, top: y, width: CELL_W, height: CELL_H }}
    >
      {/* Home team row */}
      <div
        className={`flex items-center justify-between px-1 border-b border-neutral-100 ${
          match.winnerSide === 'home'
            ? 'bg-success-50 font-semibold text-success-800'
            : 'text-neutral-700'
        }`}
        style={{ height: CELL_H / 2 - 0.5, fontSize: 10, lineHeight: '12px' }}
      >
        <span className="truncate flex-1 mr-0.5">
          {shortName(match.homeName)}
        </span>
        <span className="flex items-center gap-0.5 flex-shrink-0">
          {hasScore && (
            <span className="font-bold tabular-nums">
              {match.homeScore}
              {match.homePso !== null && (
                <span className="text-[8px] text-neutral-400">({match.homePso})</span>
              )}
            </span>
          )}
        </span>
      </div>

      {/* Away team row */}
      <div
        className={`flex items-center justify-between px-1 ${
          match.winnerSide === 'away'
            ? 'bg-success-50 font-semibold text-success-800'
            : 'text-neutral-700'
        }`}
        style={{ height: CELL_H / 2 - 0.5, fontSize: 10, lineHeight: '12px' }}
      >
        <span className="truncate flex-1 mr-0.5">
          {shortName(match.awayName)}
        </span>
        <span className="flex items-center gap-0.5 flex-shrink-0">
          {hasScore && (
            <span className="font-bold tabular-nums">
              {match.awayScore}
              {match.awayPso !== null && (
                <span className="text-[8px] text-neutral-400">({match.awayPso})</span>
              )}
            </span>
          )}
        </span>
      </div>

      {/* Status indicator - tiny top-right corner badge */}
      {(match.isLive || match.isCompleted) && (
        <div className="absolute top-0 right-0">
          {match.isLive && (
            <span className="text-[7px] font-bold text-danger-600 bg-danger-50 px-0.5 rounded-bl animate-pulse">LIVE</span>
          )}
          {match.isCompleted && !match.isLive && (
            <span className="text-[7px] font-medium text-success-600 bg-success-50 px-0.5 rounded-bl">FT</span>
          )}
        </div>
      )}
    </div>
  )
}

// =============================================
// Y-POSITION CALCULATOR FOR EACH ROUND
// =============================================

/**
 * Calculate center Y positions for matches in each round.
 * R32 has 8 matches evenly spaced. Each subsequent round's match is
 * centered between the two matches it receives from.
 */
function getMatchPositions() {
  // R32: 8 matches evenly spaced
  const r32Ys: number[] = []
  for (let i = 0; i < 8; i++) {
    r32Ys.push(HEADER_H + i * (CELL_H + PAIR_GAP))
  }

  // R16: 4 matches, each centered between a pair of R32 matches
  const r16Ys: number[] = []
  for (let i = 0; i < 4; i++) {
    const top = r32Ys[i * 2]
    const bot = r32Ys[i * 2 + 1]
    r16Ys.push((top + bot) / 2)
  }

  // QF: 2 matches
  const qfYs: number[] = []
  for (let i = 0; i < 2; i++) {
    const top = r16Ys[i * 2]
    const bot = r16Ys[i * 2 + 1]
    qfYs.push((top + bot) / 2)
  }

  // SF: 1 match
  const sfY = (qfYs[0] + qfYs[1]) / 2

  return { r32Ys, r16Ys, qfYs, sfY }
}

// =============================================
// SVG CONNECTOR LINES
// =============================================

/**
 * Generate SVG path strings for connector lines between two rounds.
 * Left side: lines go from right edge of source cells to left edge of target cells.
 */
function getConnectorPaths(
  sourceXRight: number,
  sourceYs: number[],
  targetXLeft: number,
  targetYs: number[],
): string[] {
  const paths: string[] = []
  for (let i = 0; i < targetYs.length; i++) {
    const topSourceY = sourceYs[i * 2] + CELL_H / 2
    const botSourceY = sourceYs[i * 2 + 1] + CELL_H / 2
    const targetY = targetYs[i] + CELL_H / 2
    const midX = (sourceXRight + targetXLeft) / 2

    paths.push(`M ${sourceXRight} ${topSourceY} H ${midX} V ${targetY} H ${targetXLeft}`)
    paths.push(`M ${sourceXRight} ${botSourceY} H ${midX} V ${targetY}`)
  }
  return paths
}

/**
 * Generate SVG path strings for reverse connector lines (right side of bracket).
 * Sources feed RIGHT-to-LEFT into targets.
 */
function getReverseConnectorPaths(
  sourceXLeft: number,
  sourceYs: number[],
  targetXRight: number,
  targetYs: number[],
): string[] {
  const paths: string[] = []
  for (let i = 0; i < targetYs.length; i++) {
    const topSourceY = sourceYs[i * 2] + CELL_H / 2
    const botSourceY = sourceYs[i * 2 + 1] + CELL_H / 2
    const targetY = targetYs[i] + CELL_H / 2
    const midX = (sourceXLeft + targetXRight) / 2

    paths.push(`M ${sourceXLeft} ${topSourceY} H ${midX} V ${targetY} H ${targetXRight}`)
    paths.push(`M ${sourceXLeft} ${botSourceY} H ${midX} V ${targetY}`)
  }
  return paths
}

// =============================================
// KNOCKOUT BRACKET COMPONENT
// =============================================

function KnockoutBracket({
  matchMap,
  completedKnockout,
  totalKnockout,
}: {
  matchMap: Map<number, MatchData>
  completedKnockout: number
  totalKnockout: number
}) {
  const pos = getMatchPositions()

  // Layout X positions for left half:
  // R32_L | conn | R16_L | conn | QF_L | conn | SF_L | gap | CENTER | gap | SF_R | conn | QF_R | conn | R16_R | conn | R32_R
  const leftR32X = 0
  const leftR16X = leftR32X + ROUND_W
  const leftQfX = leftR16X + ROUND_W
  const leftSfX = leftQfX + ROUND_W
  const centerX = leftSfX + ROUND_W
  const rightSfX = centerX + ROUND_W
  const rightQfX = rightSfX + ROUND_W
  const rightR16X = rightQfX + ROUND_W
  const rightR32X = rightR16X + ROUND_W

  const totalW = rightR32X + CELL_W
  // Height needs to fit R32 matches + room for 3rd place match below center final
  const totalH = HEADER_H + R32_TOTAL_H + CELL_H + 24 // extra space for 3rd place card below final

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl font-bold text-neutral-900">Knockout Bracket</h2>
        {completedKnockout > 0 && (
          <Badge variant="green">
            {completedKnockout}/{totalKnockout} played
          </Badge>
        )}
      </div>

      {/* Bracket container - scrollable only when viewport is very narrow */}
      <div className="overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="relative" style={{ width: totalW, height: totalH }}>
          {/* Round headers */}
          {[
            { x: leftR32X, label: 'R32' },
            { x: leftR16X, label: 'R16' },
            { x: leftQfX, label: 'QF' },
            { x: leftSfX, label: 'SF' },
            { x: centerX, label: 'Final' },
            { x: rightSfX, label: 'SF' },
            { x: rightQfX, label: 'QF' },
            { x: rightR16X, label: 'R16' },
            { x: rightR32X, label: 'R32' },
          ].map((h, i) => (
            <div
              key={i}
              className={`absolute text-center font-bold uppercase tracking-wider ${
                h.label === 'Final'
                  ? 'text-[9px] text-warning-600'
                  : 'text-[9px] text-neutral-400'
              }`}
              style={{ left: h.x, top: 0, width: CELL_W }}
            >
              {h.label}
            </div>
          ))}

          {/* === SINGLE SVG FOR ALL CONNECTOR LINES === */}
          <svg
            className="absolute top-0 left-0 pointer-events-none"
            width={totalW}
            height={totalH}
            fill="none"
          >
            {/* Left R32 → R16 */}
            {getConnectorPaths(leftR32X + CELL_W, pos.r32Ys, leftR16X, pos.r16Ys).map((d, i) => (
              <path key={`l32-${i}`} d={d} stroke="#d1d5db" strokeWidth={1.5} />
            ))}
            {/* Left R16 → QF */}
            {getConnectorPaths(leftR16X + CELL_W, pos.r16Ys, leftQfX, pos.qfYs).map((d, i) => (
              <path key={`l16-${i}`} d={d} stroke="#d1d5db" strokeWidth={1.5} />
            ))}
            {/* Left QF → SF */}
            {getConnectorPaths(leftQfX + CELL_W, pos.qfYs, leftSfX, [pos.sfY]).map((d, i) => (
              <path key={`lqf-${i}`} d={d} stroke="#d1d5db" strokeWidth={1.5} />
            ))}
            {/* Right R32 → R16 */}
            {getReverseConnectorPaths(rightR32X, pos.r32Ys, rightR16X + CELL_W, pos.r16Ys).map((d, i) => (
              <path key={`r32-${i}`} d={d} stroke="#d1d5db" strokeWidth={1.5} />
            ))}
            {/* Right R16 → QF */}
            {getReverseConnectorPaths(rightR16X, pos.r16Ys, rightQfX + CELL_W, pos.qfYs).map((d, i) => (
              <path key={`r16-${i}`} d={d} stroke="#d1d5db" strokeWidth={1.5} />
            ))}
            {/* Right QF → SF */}
            {getReverseConnectorPaths(rightQfX, pos.qfYs, rightSfX + CELL_W, [pos.sfY]).map((d, i) => (
              <path key={`rqf-${i}`} d={d} stroke="#d1d5db" strokeWidth={1.5} />
            ))}
            {/* Left SF → Final */}
            <path
              d={`M ${leftSfX + CELL_W} ${pos.sfY + CELL_H / 2} H ${centerX}`}
              stroke="#d1d5db" strokeWidth={1.5}
            />
            {/* Right SF → Final */}
            <path
              d={`M ${rightSfX} ${pos.sfY + CELL_H / 2} H ${centerX + CELL_W}`}
              stroke="#d1d5db" strokeWidth={1.5}
            />
          </svg>

          {/* === MATCH CELLS === */}

          {/* Left R32 */}
          {LEFT_R32.map((num, i) => (
            <BracketCell key={num} match={buildBracketMatch(num, matchMap)} x={leftR32X} y={pos.r32Ys[i]} />
          ))}

          {/* Left R16 */}
          {LEFT_R16.map((num, i) => (
            <BracketCell key={num} match={buildBracketMatch(num, matchMap)} x={leftR16X} y={pos.r16Ys[i]} />
          ))}

          {/* Left QF */}
          {LEFT_QF.map((num, i) => (
            <BracketCell key={num} match={buildBracketMatch(num, matchMap)} x={leftQfX} y={pos.qfYs[i]} />
          ))}

          {/* Left SF */}
          <BracketCell match={buildBracketMatch(LEFT_SF[0], matchMap)} x={leftSfX} y={pos.sfY} />

          {/* Center: Final */}
          <BracketCell match={buildBracketMatch(104, matchMap)} x={centerX} y={pos.sfY} />

          {/* Center: 3rd Place (below final) */}
          <div
            className="absolute text-center"
            style={{ left: centerX, top: pos.sfY + CELL_H + 8, width: CELL_W }}
          >
            <div className="text-[8px] font-bold text-neutral-400 uppercase mb-0.5">3rd Place</div>
            <div className="relative" style={{ width: CELL_W, height: CELL_H }}>
              <BracketCell match={buildBracketMatch(103, matchMap)} x={0} y={0} />
            </div>
          </div>

          {/* Right SF */}
          <BracketCell match={buildBracketMatch(RIGHT_SF[0], matchMap)} x={rightSfX} y={pos.sfY} />

          {/* Right QF */}
          {RIGHT_QF.map((num, i) => (
            <BracketCell key={num} match={buildBracketMatch(num, matchMap)} x={rightQfX} y={pos.qfYs[i]} />
          ))}

          {/* Right R16 */}
          {RIGHT_R16.map((num, i) => (
            <BracketCell key={num} match={buildBracketMatch(num, matchMap)} x={rightR16X} y={pos.r16Ys[i]} />
          ))}

          {/* Right R32 */}
          {RIGHT_R32.map((num, i) => (
            <BracketCell key={num} match={buildBracketMatch(num, matchMap)} x={rightR32X} y={pos.r32Ys[i]} />
          ))}
        </div>
      </div>
    </div>
  )
}

// =============================================
// MAIN COMPONENT
// =============================================

export function StandingsTab({ matches, teams, conductData }: StandingsTabProps) {
  // Build match lookup by match_number
  const matchMap = useMemo(() => {
    const map = new Map<number, MatchData>()
    for (const m of matches) {
      map.set(m.match_number, m)
    }
    return map
  }, [matches])

  // Build actual group standings from completed match results
  const { allGroupStandings, rankedThirds, annexCInfo, hasAnyCompletedGroupMatch } = useMemo(() => {
    // Create a PredictionMap from actual match results (treating real scores as "predictions")
    const actualScores: PredictionMap = new Map()
    for (const m of matches) {
      if (m.stage === 'group' && (m.is_completed || m.status === 'live') && m.home_score_ft !== null && m.away_score_ft !== null) {
        actualScores.set(m.match_id, {
          home: m.home_score_ft,
          away: m.away_score_ft,
        })
      }
    }

    const hasAnyCompletedGroupMatch = actualScores.size > 0

    // Convert MatchData to the Match type expected by calculateGroupStandings
    const tournamentMatches: Match[] = matches
      .filter((m) => m.stage === 'group')
      .map((m) => ({
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
      }))

    // Convert TeamData to Team type
    const tournamentTeams: Team[] = teams.map((t) => ({
      team_id: t.team_id,
      country_name: t.country_name,
      country_code: t.country_code,
      group_letter: t.group_letter,
      fifa_ranking_points: t.fifa_ranking_points,
      flag_url: t.flag_url,
    }))

    const allGroupStandings = new Map<string, GroupStanding[]>()
    for (const letter of GROUP_LETTERS) {
      const groupMatches = tournamentMatches.filter((m) => m.group_letter === letter)
      const standings = calculateGroupStandings(
        letter,
        groupMatches,
        actualScores,
        tournamentTeams,
        conductData
      )
      allGroupStandings.set(letter, standings)
    }

    const rankedThirds = rankThirdPlaceTeams(allGroupStandings)
    const annexCInfo = getAnnexCInfo(allGroupStandings)

    return { allGroupStandings, rankedThirds, annexCInfo, hasAnyCompletedGroupMatch }
  }, [matches, teams, conductData])

  // Count knockout stats
  const knockoutMatches = matches.filter((m) => m.stage !== 'group')
  const completedKnockout = knockoutMatches.filter((m) => m.is_completed).length
  const totalKnockout = knockoutMatches.length

  return (
    <div className="space-y-8">
      {/* ================================ */}
      {/* GROUP STANDINGS SECTION           */}
      {/* ================================ */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-xl font-bold text-neutral-900">Group Standings</h2>
          <Badge variant="blue">Actual Results</Badge>
        </div>

        {!hasAnyCompletedGroupMatch ? (
          <Card padding="lg" className="text-center">
            <p className="text-neutral-500">No group stage matches have been completed yet.</p>
            <p className="text-xs text-neutral-400 mt-1">Standings will appear here once match results are entered.</p>
          </Card>
        ) : (
          <>
            <div className="bg-primary-50 border border-primary-200 rounded-lg px-4 py-2 mb-4 text-xs text-primary-700">
              Based on actual match results. FP (Fair Play) is the Team Conduct Score used as a FIFA tiebreaker.
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {GROUP_LETTERS.map((letter) => {
                const standings = allGroupStandings.get(letter) || []
                const hasData = standings.some((s) => s.played > 0)
                if (!hasData) return null

                return (
                  <Card key={letter} padding="md">
                    <StandingsTable
                      standings={standings}
                      groupLetter={letter}
                      showConductScore
                    />
                  </Card>
                )
              })}
            </div>

            {/* Third-place ranking */}
            <ThirdPlaceTable
              rankedThirds={rankedThirds}
              showConductScore
              annexCOptionNumber={annexCInfo?.optionNumber}
              annexCQualifyingGroups={annexCInfo?.qualifyingGroups}
            />
          </>
        )}
      </div>

      {/* ================================ */}
      {/* KNOCKOUT BRACKET SECTION          */}
      {/* ================================ */}
      <KnockoutBracket matchMap={matchMap} completedKnockout={completedKnockout} totalKnockout={totalKnockout} />
    </div>
  )
}
