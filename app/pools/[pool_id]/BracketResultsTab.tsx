'use client'

import { Fragment, useState, useMemo, useRef, useEffect } from 'react'
import { Alert } from '@/components/ui/Alert'
import { getLiveClock, getMatchStatusBadge, type MatchStatusBadge } from '@/lib/matchStatus'
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
import {
  LEFT_R32,
  RIGHT_R32,
  LEFT_R16,
  RIGHT_R16,
  LEFT_QF,
  RIGHT_QF,
  LEFT_SF,
  RIGHT_SF,
} from '@/lib/bracketConstants'
import type {
  MatchData,
  TeamData,
  SettingsData,
  BPGroupRanking,
  BPThirdPlaceRanking,
  BPKnockoutPick,
  EntryData,
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
}

// =============================================
// BRACKET LAYOUT
// =============================================
// A half-bracket is four columns — R32 → R16 → QF → SF — so its width is four
// cells plus the three gaps between them. These sizes used to be fixed, which
// made the bracket 712px wide no matter how much room the page had; on a
// desktop it finished barely past halfway and the right third sat empty.
//
// makeLayout() stretches the cells and gaps to fill whatever width it is given.
// Both are floored at the baseline below, so this only ever makes the bracket
// bigger — a narrow screen still gets the original 712px and scrolls it, which
// is what the overflow-x-auto wrapper is for.

const BASE_CELL_W = 160
/** Two team rows to a cell — this is the pair, so it always stays even. */
const BASE_ROW_H = 32
const BASE_CELL_H = BASE_ROW_H * 2
const BASE_PAIR_GAP = 8
const BASE_COL_GAP = 24
const HEADER_H = 24

/** Width the bracket has always been, and the narrowest it is allowed to get. */
export const BASE_W = 4 * BASE_CELL_W + 3 * BASE_COL_GAP

export type BracketLayout = {
  cellW: number
  cellH: number
  pairGap: number
  colGap: number
  roundW: number
  width: number
  height: number
}

export function makeLayout(available: number): BracketLayout {
  // Cells take the bulk of the width; whatever is left becomes the gaps, which
  // is where the connector elbows are drawn — they need the room as much as the
  // cells do. Flooring both at the baseline is what keeps this from ever
  // shrinking the bracket below what it is today.
  const cellW = Math.max(BASE_CELL_W, Math.floor((available * 0.8) / 4))
  const colGap = Math.max(BASE_COL_GAP, Math.floor((available - 4 * cellW) / 3))

  // Height tracks width one-for-one, so a cell keeps its proportions as the
  // bracket stretches. This was damped to 60% at first, which pinned the boxes
  // at 69px on a desktop and left the two team rows looking squashed inside a
  // 220px-wide box. Rounded to an even number so the pair splits cleanly and
  // the divider between them lands on a whole pixel.
  const grow = cellW / BASE_CELL_W
  const cellH = Math.round((BASE_CELL_H * grow) / 2) * 2
  const pairGap = Math.round(BASE_PAIR_GAP * grow)

  return {
    cellW,
    cellH,
    pairGap,
    colGap,
    roundW: cellW + colGap,
    width: 4 * cellW + 3 * colGap,
    height: HEADER_H + 8 * cellH + 7 * pairGap,
  }
}

// =============================================
// HELPERS
// =============================================

function shortName(name: string): string {
  if (name.startsWith('Winner Match ')) return 'W' + name.slice(12)
  if (name.startsWith('Loser Match ')) return 'L' + name.slice(11)
  if (/^\d(st|nd|rd|th) Group [A-L]$/.test(name)) return name.replace(' Group ', ' ')
  return name
}

function getMatchPositions(L: BracketLayout) {
  const r32Ys: number[] = []
  for (let i = 0; i < 8; i++) {
    r32Ys.push(HEADER_H + i * (L.cellH + L.pairGap))
  }
  const r16Ys: number[] = []
  for (let i = 0; i < 4; i++) {
    r16Ys.push((r32Ys[i * 2] + r32Ys[i * 2 + 1]) / 2)
  }
  const qfYs: number[] = []
  for (let i = 0; i < 2; i++) {
    qfYs.push((r16Ys[i * 2] + r16Ys[i * 2 + 1]) / 2)
  }
  const sfY = (qfYs[0] + qfYs[1]) / 2
  return { r32Ys, r16Ys, qfYs, sfY }
}

/** Connector lines for left-to-right bracket flow */
function getConnectorPaths(
  sourceXRight: number,
  sourceYs: number[],
  targetXLeft: number,
  targetYs: number[],
  L: BracketLayout,
): string[] {
  const paths: string[] = []
  for (let i = 0; i < targetYs.length; i++) {
    const topSourceY = sourceYs[i * 2] + L.cellH / 2
    const botSourceY = sourceYs[i * 2 + 1] + L.cellH / 2
    const targetY = targetYs[i] + L.cellH / 2
    const midX = (sourceXRight + targetXLeft) / 2
    paths.push(`M ${sourceXRight} ${topSourceY} H ${midX} V ${targetY} H ${targetXLeft}`)
    paths.push(`M ${sourceXRight} ${botSourceY} H ${midX} V ${targetY}`)
  }
  return paths
}

// getReverseConnectorPaths lived here — the mirrored right-to-left variant for a
// bracket drawn inwards from both edges. Both halves render left-to-right, so it
// had no callers; removed rather than carried through the layout change.

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
// KNOCKOUT BRACKET COMPONENTS
// =============================================

type BracketCellData = {
  matchNumber: number
  homeName: string
  awayName: string
  homeCode: string | null
  awayCode: string | null
  homeFlagUrl: string | null
  awayFlagUrl: string | null
  // Actual result
  actualHomeScore: number | null
  actualAwayScore: number | null
  actualHomePso: number | null
  actualAwayPso: number | null
  isCompleted: boolean
  isLive: boolean
  actualWinnerSide: 'home' | 'away' | null
  // User's pick
  predictedWinnerSide: 'home' | 'away' | null
  pickIsCorrect: boolean | null // null = match not completed
  liveClock: string | null // "45'" / HT / ET / PENS while live
  statusBadge: MatchStatusBadge | null // Delayed / Postponed / etc.
}

/** Shared row styling for bracket cells and final match cards */
function getCellRowClass(data: BracketCellData, side: 'home' | 'away') {
  const isPickedWinner = data.predictedWinnerSide === side
  const isActualWinner = data.actualWinnerSide === side
  const matchDecided = data.actualWinnerSide !== null

  if (data.isCompleted && matchDecided) {
    // Winner you picked correctly
    if (isActualWinner && isPickedWinner) return 'bg-success-50 font-semibold text-success-800'
    // Winner you didn't pick
    if (isActualWinner && !isPickedWinner) return 'font-semibold text-ink'
    // Loser you incorrectly picked as winner
    if (!isActualWinner && isPickedWinner) return 'text-danger-500 line-through'
    // Loser (not picked) — still strike through as eliminated
    return 'text-muted line-through'
  }

  if (data.isCompleted) return 'text-muted'

  if (isPickedWinner) return 'bg-primary-50 font-semibold text-primary-800'
  return 'text-ink'
}

function BracketCell({ data, x, y, L }: { data: BracketCellData; x: number; y: number; L: BracketLayout }) {
  const hasScore = data.actualHomeScore !== null && data.actualAwayScore !== null

  let borderClass = 'border-border-default'
  if (data.isCompleted && data.pickIsCorrect === true) {
    borderClass = 'border-success-400'
  } else if (data.isCompleted && data.pickIsCorrect === false) {
    borderClass = 'border-danger-300'
  }

  return (
    <div
      // radii.md, matching KnockoutMatchCard in the RN bracket wizard — same
      // thing: a surface box with a thin border, overflow clipped, holding two
      // rows. Not rounded-inset; that step is for a corner nested inside an
      // already-rounded surface, and this one sits on the page background.
      className={`absolute border ${borderClass} rounded-control bg-surface shadow-sm overflow-hidden`}
      style={{ left: x, top: y, width: L.cellW, height: L.cellH }}
    >
      {/* Home team row */}
      <div
        className={`flex items-center justify-between px-2 text-xs border-b border-border-subtle ${getCellRowClass(data, 'home')}`}
        style={{ height: L.cellH / 2 - 0.5 }}
      >
        <span className="flex items-center gap-1.5 truncate flex-1 mr-1">
          {data.homeFlagUrl && (
            <img src={data.homeFlagUrl} alt="" className="w-4 h-3 rounded-[1px] object-cover shrink-0" />
          )}
          <span className="truncate">{data.homeCode || shortName(data.homeName)}</span>
        </span>
        {hasScore && (
          <span className="t-num t-num-extrabold flex-shrink-0">
            {data.actualHomeScore}
            {data.actualHomePso !== null && (
              <span className="text-[9px] text-muted ml-0.5">({data.actualHomePso})</span>
            )}
          </span>
        )}
      </div>

      {/* Away team row */}
      <div
        className={`flex items-center justify-between px-2 text-xs ${getCellRowClass(data, 'away')}`}
        style={{ height: L.cellH / 2 - 0.5 }}
      >
        <span className="flex items-center gap-1.5 truncate flex-1 mr-1">
          {data.awayFlagUrl && (
            <img src={data.awayFlagUrl} alt="" className="w-4 h-3 rounded-[1px] object-cover shrink-0" />
          )}
          <span className="truncate">{data.awayCode || shortName(data.awayName)}</span>
        </span>
        {hasScore && (
          <span className="t-num t-num-extrabold flex-shrink-0">
            {data.actualAwayScore}
            {data.actualAwayPso !== null && (
              <span className="text-[9px] text-muted ml-0.5">({data.actualAwayPso})</span>
            )}
          </span>
        )}
      </div>

      {/* Left edge indicator strip — no overlap with scores */}
      {data.isLive && (
        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-danger-500 animate-pulse" />
      )}
      {data.statusBadge ? (
        <span className={`absolute right-0.5 top-0.5 text-[8px] font-bold leading-none ${data.statusBadge.tone === 'red' ? 'text-danger-600' : 'text-warning-600'}`}>
          {data.statusBadge.label}
        </span>
      ) : data.isLive && data.liveClock ? (
        <span className="absolute right-0.5 top-0.5 t-num text-[8px] text-danger-600 leading-none">
          {data.liveClock}
        </span>
      ) : null}
      {!data.isLive && data.isCompleted && data.pickIsCorrect !== null && (
        <div className={`absolute left-0 top-0 bottom-0 w-[3px] ${
          data.pickIsCorrect ? 'bg-success-500' : 'bg-danger-500'
        }`} />
      )}
    </div>
  )
}

/** Larger match card used for the Final and 3rd-place match */
function FinalMatchCard({ data, label }: { data: BracketCellData; label: string }) {
  const hasScore = data.actualHomeScore !== null && data.actualAwayScore !== null

  let borderClass = 'border-border-default'
  if (data.isCompleted && data.pickIsCorrect === true) borderClass = 'border-success-400'
  else if (data.isCompleted && data.pickIsCorrect === false) borderClass = 'border-danger-300'

  return (
    <div className={`border ${borderClass} rounded-card bg-surface shadow-sm overflow-hidden`}>
      <div className="px-3 py-1.5 bg-snow border-b border-border-default flex items-center justify-between">
        <span className={`text-xs font-bold uppercase tracking-wider ${
          label === 'Final' ? 'text-warning-600' : 'text-muted'
        }`}>
          {label}
        </span>
        {data.statusBadge ? (
          <span className={`text-xs font-bold ${data.statusBadge.tone === 'red' ? 'text-danger-600' : 'text-warning-600'}`}>
            {data.statusBadge.label}
          </span>
        ) : data.isLive ? (
          <span className="text-xs font-bold text-danger-600 animate-pulse">{data.liveClock ?? 'LIVE'}</span>
        ) : null}
        {!data.isLive && data.isCompleted && data.pickIsCorrect !== null && (
          data.pickIsCorrect ? (
            <span className="text-xs font-bold text-success-600">&#10003; Correct</span>
          ) : (
            <span className="text-xs font-bold text-danger-600">&#10007; Wrong</span>
          )
        )}
      </div>
      <div className="divide-y divide-border-subtle">
        <div className={`flex items-center justify-between px-3 py-2.5 ${getCellRowClass(data, 'home')}`}>
          <span className="flex items-center gap-2 flex-1">
            {data.homeFlagUrl && (
              <img src={data.homeFlagUrl} alt="" className="w-5 h-3.5 rounded-[1px] object-cover shrink-0" />
            )}
            <span className="text-sm font-medium">{data.homeName}</span>
          </span>
          {hasScore && (
            <span className="text-sm t-num t-num-extrabold flex-shrink-0">
              {data.actualHomeScore}
              {data.actualHomePso !== null && (
                <span className="t-detail text-muted ml-1">({data.actualHomePso})</span>
              )}
            </span>
          )}
        </div>
        <div className={`flex items-center justify-between px-3 py-2.5 ${getCellRowClass(data, 'away')}`}>
          <span className="flex items-center gap-2 flex-1">
            {data.awayFlagUrl && (
              <img src={data.awayFlagUrl} alt="" className="w-5 h-3.5 rounded-[1px] object-cover shrink-0" />
            )}
            <span className="text-sm font-medium">{data.awayName}</span>
          </span>
          {hasScore && (
            <span className="text-sm t-num t-num-extrabold flex-shrink-0">
              {data.actualAwayScore}
              {data.actualAwayPso !== null && (
                <span className="t-detail text-muted ml-1">({data.actualAwayPso})</span>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// =============================================
// KNOCKOUT BRACKET WITH PICKS OVERLAY
// =============================================

function KnockoutComparison({
  matchMap,
  knockoutPicks,
  completedKnockout,
  totalKnockout,
  correctPicks,
  totalPickable,
  teams,
}: {
  matchMap: Map<number, MatchData>
  knockoutPicks: BPKnockoutPick[]
  completedKnockout: number
  totalKnockout: number
  correctPicks: number
  totalPickable: number
  teams: TeamData[]
}) {
  // How much width the page is actually giving us. Measured rather than assumed:
  // the tab sits in a max-w-6xl column, but that is only the ceiling — the real
  // number depends on the viewport and the container's own padding. Starts at
  // the baseline so the server renders the same 712px the client first paints,
  // then the observer widens it.
  const wrapRef = useRef<HTMLDivElement>(null)
  const [availableW, setAvailableW] = useState(BASE_W)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setAvailableW(entry.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const L = useMemo(() => makeLayout(availableW), [availableW])
  const pos = useMemo(() => getMatchPositions(L), [L])

  // Build team lookup: team_id → TeamData
  const teamById = useMemo(() => new Map(teams.map(t => [t.team_id, t])), [teams])

  // Build picks map: match_id → winner_team_id
  const picksById = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of knockoutPicks) {
      m.set(p.match_id, p.winner_team_id)
    }
    return m
  }, [knockoutPicks])

  function buildCellData(matchNumber: number): BracketCellData {
    const match = matchMap.get(matchNumber)
    if (!match) {
      return {
        matchNumber,
        homeName: 'TBD',
        awayName: 'TBD',
        homeCode: null,
        awayCode: null,
        homeFlagUrl: null,
        awayFlagUrl: null,
        actualHomeScore: null,
        actualAwayScore: null,
        actualHomePso: null,
        actualAwayPso: null,
        isCompleted: false,
        isLive: false,
        liveClock: null,
        statusBadge: null,
        actualWinnerSide: null,
        predictedWinnerSide: null,
        pickIsCorrect: null,
      }
    }

    const homeName = match.home_team?.country_name || match.home_team_placeholder || 'TBD'
    const awayName = match.away_team?.country_name || match.away_team_placeholder || 'TBD'

    const homeTeam = match.home_team_id ? teamById.get(match.home_team_id) : null
    const awayTeam = match.away_team_id ? teamById.get(match.away_team_id) : null

    // Actual winner
    let actualWinnerSide: 'home' | 'away' | null = null
    if (match.is_completed && match.home_score_ft !== null && match.away_score_ft !== null) {
      if (match.home_score_ft > match.away_score_ft) {
        actualWinnerSide = 'home'
      } else if (match.away_score_ft > match.home_score_ft) {
        actualWinnerSide = 'away'
      } else if (match.home_score_pso !== null && match.away_score_pso !== null) {
        actualWinnerSide = match.home_score_pso > match.away_score_pso ? 'home' : 'away'
      } else if (match.winner_team_id) {
        actualWinnerSide = match.winner_team_id === match.home_team_id ? 'home' : 'away'
      }
    }

    // User's pick
    const pickedWinnerId = picksById.get(match.match_id)
    let predictedWinnerSide: 'home' | 'away' | null = null
    if (pickedWinnerId) {
      if (pickedWinnerId === match.home_team_id) predictedWinnerSide = 'home'
      else if (pickedWinnerId === match.away_team_id) predictedWinnerSide = 'away'
    }

    // Compare
    let pickIsCorrect: boolean | null = null
    if (match.is_completed && match.winner_team_id && pickedWinnerId) {
      pickIsCorrect = match.winner_team_id === pickedWinnerId
    }

    return {
      matchNumber,
      homeName,
      awayName,
      homeCode: homeTeam?.country_code || null,
      awayCode: awayTeam?.country_code || null,
      homeFlagUrl: homeTeam?.flag_url || null,
      awayFlagUrl: awayTeam?.flag_url || null,
      actualHomeScore: match.home_score_ft,
      actualAwayScore: match.away_score_ft,
      actualHomePso: match.home_score_pso,
      actualAwayPso: match.away_score_pso,
      isCompleted: match.is_completed,
      isLive: match.status === 'live',
      liveClock: getLiveClock({ status: match.status, livePeriod: match.live_period, liveMinute: match.live_minute }),
      statusBadge: getMatchStatusBadge({ status: match.status, statusDetail: match.status_detail, originalMatchDate: match.original_match_date }),
      actualWinnerSide,
      predictedWinnerSide,
      pickIsCorrect,
    }
  }

  // Half-bracket layout: 4 columns (R32 → R16 → QF → SF)
  const halfR32X = 0
  const halfR16X = halfR32X + L.roundW
  const halfQfX = halfR16X + L.roundW
  const halfSfX = halfQfX + L.roundW

  const roundHeaders = [
    { x: halfR32X, label: 'R32' },
    { x: halfR16X, label: 'R16' },
    { x: halfQfX, label: 'QF' },
    { x: halfSfX, label: 'SF' },
  ]

  function renderBracketHalf(
    label: string,
    r32: number[],
    r16: number[],
    qf: number[],
    sf: number,
  ) {
    return (
      <div>
        <h3 className="text-sm font-bold text-muted mb-2 uppercase tracking-wide">{label}</h3>
        <div className="overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="relative" style={{ width: L.width, height: L.height, minWidth: L.width }}>
            {/* Round headers */}
            {roundHeaders.map((h, i) => (
              <div
                key={i}
                className="absolute text-center t-caption text-muted"
                style={{ left: h.x, top: 0, width: L.cellW }}
              >
                {h.label}
              </div>
            ))}

            {/* SVG connector lines */}
            <svg className="absolute top-0 left-0 pointer-events-none" width={L.width} height={L.height} fill="none">
              {getConnectorPaths(halfR32X + L.cellW, pos.r32Ys, halfR16X, pos.r16Ys, L).map((d, i) => (
                <path key={`r32-${i}`} d={d} stroke="var(--border-default)" strokeWidth={1.5} />
              ))}
              {getConnectorPaths(halfR16X + L.cellW, pos.r16Ys, halfQfX, pos.qfYs, L).map((d, i) => (
                <path key={`r16-${i}`} d={d} stroke="var(--border-default)" strokeWidth={1.5} />
              ))}
              {getConnectorPaths(halfQfX + L.cellW, pos.qfYs, halfSfX, [pos.sfY], L).map((d, i) => (
                <path key={`qf-${i}`} d={d} stroke="var(--border-default)" strokeWidth={1.5} />
              ))}
            </svg>

            {/* Match cells */}
            {r32.map((num, i) => <BracketCell key={num} data={buildCellData(num)} x={halfR32X} y={pos.r32Ys[i]} L={L} />)}
            {r16.map((num, i) => <BracketCell key={num} data={buildCellData(num)} x={halfR16X} y={pos.r16Ys[i]} L={L} />)}
            {qf.map((num, i) => <BracketCell key={num} data={buildCellData(num)} x={halfQfX} y={pos.qfYs[i]} L={L} />)}
            <BracketCell data={buildCellData(sf)} x={halfSfX} y={pos.sfY} L={L} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={wrapRef}>
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-xl font-bold text-ink">Knockout Bracket</h2>
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

      <Alert variant="info" className="mb-6 text-xs">
        Your picks are highlighted. <span className="inline-block w-1 h-3 bg-success-500 rounded-chip align-middle mr-0.5"></span><span className="text-success-700 font-medium">Green</span> = correct, <span className="inline-block w-1 h-3 bg-danger-500 rounded-chip align-middle mr-0.5"></span><span className="text-danger-600 font-medium">Red</span> = incorrect, <span className="text-primary-700 font-medium">blue highlight</span> = your pick (pending).
      </Alert>

      {/* Split bracket — two halves stacked */}
      <div className="space-y-8">
        {renderBracketHalf('Upper Bracket', LEFT_R32, LEFT_R16, LEFT_QF, LEFT_SF[0])}
        {renderBracketHalf('Lower Bracket', RIGHT_R32, RIGHT_R16, RIGHT_QF, RIGHT_SF[0])}
      </div>

      {/* Final & 3rd Place */}
      <div className="mt-8">
        <h3 className="text-sm font-bold text-muted mb-3 uppercase tracking-wide">Finals</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
          <FinalMatchCard data={buildCellData(104)} label="Final" />
          <FinalMatchCard data={buildCellData(103)} label="3rd Place" />
        </div>
      </div>
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
        completedKnockout={completedKnockout}
        totalKnockout={totalKnockout}
        correctPicks={correctPicks}
        totalPickable={totalPickable}
        teams={teams}
      />
    </div>
  )
}
