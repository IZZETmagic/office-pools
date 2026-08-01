'use client'

import { useMemo, useCallback, useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/Modal'
import type { LeaderboardEntry, PlayerScoreData, BonusScoreData, MatchData, MatchScoreData, PodiumResult } from './types'
import type { PoolSettings } from './results/points'
import { formatNumber } from '@/lib/format'
import { tierChipClass } from '@/lib/design/formDots'
import { rankChipTone, rankChipTextClass } from '@/lib/design/rank'
import { Icon } from '@/components/ui/Icon'
import { formatBonusDescription, type BonusMatchContext } from '@/lib/bonusDescription'

type PointAdjustmentRecord = {
  id: string
  amount: number
  reason: string
  created_at: string
}

// =============================================
// TYPES & CONSTANTS
// =============================================

type PointsBreakdownModalProps = {
  entry: LeaderboardEntry
  playerScore: PlayerScoreData | null
  bonusScores: BonusScoreData[]
  onClose: () => void
  isMultiEntry?: boolean
  poolSettings: PoolSettings
  matches: MatchData[]
  entryMatchScores: MatchScoreData[]
  predictionMode?: 'full_tournament' | 'progressive' | 'bracket_picker'
  // Actual final podium (tournament_awards) + this entry's predicted podium.
  // Drive the always-visible "Tournament Podium" pick-vs-actual section.
  actualPodium?: PodiumResult | null
  predictedPodium?: PodiumResult | null
  // Teams this entry had in each knockout slot, by match_number. Resolved by the
  // parent (LeaderboardTab) because only it holds the entry's predictions.
  knockoutTeams?: Map<number, { home: string | null; away: string | null }>
}

type MatchPointDetail = {
  matchNumber: number
  homeTeam: string
  awayTeam: string
  actualHome: number
  actualAway: number
  predictedHome: number
  predictedAway: number
  points: number
  type: 'exact' | 'winner_gd' | 'winner' | 'miss'
  basePoints: number
  multiplier: number
  psoPoints: number
  stage: string
  // Set only where the entry's knockout teams differ from who actually played.
  predictedHomeTeam: string | null
  predictedAwayTeam: string | null
}

const STAGE_LABELS: Record<string, string> = {
  group: 'Group Stage',
  round_32: 'Round of 32',
  round_16: 'Round of 16',
  quarter_final: 'Quarter Finals',
  semi_final: 'Semi Finals',
  third_place: 'Third Place',
  final: 'Final',
}

const TYPE_LABELS: Record<string, string> = {
  exact: 'Exact',
  winner_gd: 'W+GD',
  winner: 'Winner',
  miss: 'Miss',
}

// Tier colours come from lib/design/formDots (tierChipClass). The private copy
// that was here had exact on green, winner_gd on blue and winner on amber — all
// three shifted a step, so the modal explaining your points disagreed with the
// leaderboard you opened it from.
const BONUS_CATEGORY_ORDER = ['group_standings', 'qualification', 'bracket', 'tournament'] as const

const BONUS_CATEGORY_CONFIG: Record<string, { label: string }> = {
  group_standings: { label: 'Group Standings Bonus' },
  qualification: { label: 'Overall Qualification Bonus' },
  bracket: { label: 'Knockout & Bracket Bonus' },
  tournament: { label: 'Tournament Podium' },
}

// Bracket Picker prediction status colors and labels
/* statusColor in the RN breakdown screen — green / amber / slate, each as its
   own label colour over the same colour at 12%. Whole strings so Tailwind's
   scanner sees them. */
const BP_STATUS_CHIP: Record<string, string> = {
  correct: 'text-success-600 bg-success-600/12',
  pending: 'text-warning-500 bg-warning-500/12',
  miss: 'text-muted bg-muted/12',
}

const BP_TYPE_LABELS: Record<string, string> = {
  correct: 'Correct',
  miss: 'Miss',
  pending: 'Pending',
}

function getBpPredictionStatus(bs: BonusScoreData): 'correct' | 'miss' | 'pending' {
  if (bs.points_earned > 0) return 'correct'
  if (bs.bonus_type.endsWith('_pending')) return 'pending'
  return 'miss'
}

// Bracket Picker category ordering and labels
const BP_CATEGORY_ORDER = ['bp_group', 'bp_third_place', 'bp_knockout', 'bp_bonus', 'group_standings', 'qualification', 'bracket', 'tournament'] as const

const BP_CATEGORY_CONFIG: Record<string, { label: string }> = {
  bp_group: { label: 'Group Rankings' },
  bp_third_place: { label: 'Third-Place Rankings' },
  bp_knockout: { label: 'Knockout Bracket' },
  bp_bonus: { label: 'Bracket Picker Bonus' },
  group_standings: { label: 'Group Standings Bonus' },
  qualification: { label: 'Overall Qualification Bonus' },
  bracket: { label: 'Knockout & Bracket Bonus' },
  tournament: { label: 'Tournament Podium' },
}

// =============================================
// SUB-COMPONENTS
// =============================================


/** SummaryCell from the RN breakdown screen: caption label over a mono numeral. */
function SummaryCell({
  label, value, tone, bold, signed,
}: {
  label: string; value: number; tone: string; bold?: boolean; signed?: boolean
}) {
  const display = signed && value > 0 ? `+${value.toLocaleString()}` : value.toLocaleString()
  return (
    <div className="flex-1 flex flex-col items-center gap-1">
      <span className="t-caption text-muted">{label}</span>
      <span className={`t-num ${bold ? 't-num-black text-2xl' : 't-num-extrabold text-xl'} ${tone}`}>
        {display}
      </span>
    </div>
  )
}

/** VDivider: a 1px, 36px-tall hairline in silver at 40%. */
function SummaryDivider() {
  return <span className="w-px h-9 shrink-0 bg-silver/40" />
}

function PointsRow({ label, value, suffix = 'pts' }: { label: string; value: number | string; suffix?: string }) {
  return (
    <div className="flex justify-between items-center py-1.5 px-4">
      <span className="text-xs text-muted">{label}</span>
      <span className="t-num text-xs text-ink">{value} {suffix}</span>
    </div>
  )
}

// =============================================
// COMPONENT
// =============================================

export function PointsBreakdownModal({
  entry,
  playerScore,
  bonusScores,
  onClose,
  isMultiEntry = false,
  poolSettings,
  matches,
  entryMatchScores,
  predictionMode = 'full_tournament',
  actualPodium = null,
  predictedPodium = null,
  knockoutTeams,
}: PointsBreakdownModalProps) {
  const matchPoints = playerScore?.match_points ?? entry.total_points ?? 0
  const bonusPoints = playerScore?.bonus_points ?? 0
  const totalPoints = playerScore?.total_points ?? entry.total_points ?? 0

  // Fetch adjustment history
  const [adjustmentHistory, setAdjustmentHistory] = useState<PointAdjustmentRecord[]>([])
  useEffect(() => {
    if ((entry.point_adjustment ?? 0) === 0) return
    const supabase = createClient()
    supabase
      .from('point_adjustments')
      .select('id, amount, reason, created_at')
      .eq('entry_id', entry.entry_id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setAdjustmentHistory(data)
      })
  }, [entry.entry_id, entry.point_adjustment])

  // Build match lookup for team names
  const matchLookup = useMemo(() => {
    const map = new Map<string, MatchData>()
    for (const m of matches) map.set(m.match_id, m)
    return map
  }, [matches])

  const bonusMatchContext = useCallback((matchId: string | null): BonusMatchContext | null => {
    if (!matchId) return null
    const m = matchLookup.get(matchId)
    if (!m) return null
    const home = m.home_team?.country_name ?? m.home_team_placeholder ?? null
    const away = m.away_team?.country_name ?? m.away_team_placeholder ?? null
    const winner =
      m.winner_team_id && m.winner_team_id === m.home_team_id ? home
      : m.winner_team_id && m.winner_team_id === m.away_team_id ? away
      : null
    return { matchNumber: m.match_number, stage: m.stage, homeTeam: home, awayTeam: away, winnerTeam: winner }
  }, [matchLookup])

  // Build per-match point details from stored match_scores
  const matchDetails = useMemo(() => {
    const details: MatchPointDetail[] = []

    for (const ms of entryMatchScores) {
      const m = matchLookup.get(ms.match_id)
      const homeTeam = m?.home_team?.country_name ?? m?.home_team_placeholder ?? '?'
      const awayTeam = m?.away_team?.country_name ?? m?.away_team_placeholder ?? '?'

      // Only knockout slots can diverge — group fixtures are fixed for everyone.
      const had = ms.stage !== 'group' ? knockoutTeams?.get(ms.match_number) : undefined
      const teamsDiffer =
        !!had && !!had.home && !!had.away && (had.home !== homeTeam || had.away !== awayTeam)

      details.push({
        matchNumber: ms.match_number,
        homeTeam,
        awayTeam,
        predictedHomeTeam: teamsDiffer ? had.home : null,
        predictedAwayTeam: teamsDiffer ? had.away : null,
        actualHome: ms.actual_home_score,
        actualAway: ms.actual_away_score,
        predictedHome: ms.predicted_home_score,
        predictedAway: ms.predicted_away_score,
        points: ms.total_points,
        type: ms.score_type,
        basePoints: ms.base_points,
        multiplier: ms.multiplier,
        psoPoints: ms.pso_points,
        stage: ms.stage,
      })
    }

    details.sort((a, b) => a.matchNumber - b.matchNumber)
    return details
  }, [entryMatchScores, matchLookup, knockoutTeams])

  // Group match details by stage
  const matchesByStage = useMemo(() => {
    const grouped = new Map<string, MatchPointDetail[]>()
    for (const d of matchDetails) {
      const existing = grouped.get(d.stage) || []
      existing.push(d)
      grouped.set(d.stage, existing)
    }
    return grouped
  }, [matchDetails])

  // Count match point type totals per stage
  const stageStats = useMemo(() => {
    const stats = new Map<string, { total: number; exact: number; winnerGd: number; winner: number; miss: number; pso: number }>()
    for (const [stage, details] of matchesByStage) {
      const s = { total: 0, exact: 0, winnerGd: 0, winner: 0, miss: 0, pso: 0 }
      for (const d of details) {
        s.total += d.points
        if (d.type === 'exact') s.exact++
        else if (d.type === 'winner_gd') s.winnerGd++
        else if (d.type === 'winner') s.winner++
        else s.miss++
        s.pso += d.psoPoints
      }
      stats.set(stage, s)
    }
    return stats
  }, [matchesByStage])

  // Group bonus scores by category
  const groupedBonuses = useMemo(() => {
    const grouped = new Map<string, BonusScoreData[]>()
    for (const bs of bonusScores) {
      const existing = grouped.get(bs.bonus_category) || []
      existing.push(bs)
      grouped.set(bs.bonus_category, existing)
    }

    // Order group-scoped bonuses A→L. They arrive in whatever order the query
    // returned, so "Group F" could sit above "Group B" and you had to read every
    // row to find the group you wanted.
    //
    // Applied to every category rather than just group_standings: bp_group and
    // bp_third_place carry the same letters and had the same problem. Where a
    // category has no letters at all — bracket, qualification, tournament,
    // bp_bonus, bp_knockout — every comparison is 0 and, since sort is stable,
    // the existing order is preserved untouched.
    // Secondary key: the fixture. Bracket bonuses carry no group letter, so
    // before this they kept DB order — which, once the rows started naming their
    // match, read as 76, 80, 92, 100, 102, 104, 76, 80, 92: every "correct
    // winner" then every "correct pairing", jumping backwards in the middle.
    const letter = (bs: BonusScoreData) => bs.related_group_letter ?? '￿'
    const matchNo = (bs: BonusScoreData) =>
      (bs.related_match_id && matchLookup.get(bs.related_match_id)?.match_number) || 0
    for (const entries of grouped.values()) {
      entries.sort((a, b) => letter(a).localeCompare(letter(b)) || matchNo(a) - matchNo(b))
    }
    return grouped
  }, [bonusScores, matchLookup])

  // Category subtotals
  const categorySubtotals = useMemo(() => {
    const subtotals = new Map<string, number>()
    for (const [category, entries] of groupedBonuses) {
      subtotals.set(category, entries.reduce((sum, e) => sum + e.points_earned, 0))
    }
    return subtotals
  }, [groupedBonuses])

  // Per-category correct/miss/pending counts for bracket picker
  const bpCategoryStats = useMemo(() => {
    if (predictionMode !== 'bracket_picker') return new Map<string, { correct: number; miss: number; pending: number }>()
    const stats = new Map<string, { correct: number; miss: number; pending: number }>()
    for (const [category, entries] of groupedBonuses) {
      const s = { correct: 0, miss: 0, pending: 0 }
      for (const bs of entries) {
        s[getBpPredictionStatus(bs)]++
      }
      stats.set(category, s)
    }
    return stats
  }, [predictionMode, groupedBonuses])

  // Tournament Podium (champion / runner-up / third). Always rendered once the
  // tournament is finalized so a member who MISSED sees their pick vs the actual
  // result (0 pts) instead of a vanished section. Only positions the pool actually
  // scores (points > 0) are listed. bracket_picker has its own bp_champion display.
  const podiumRows = useMemo(() => {
    if (predictionMode === 'bracket_picker' || !actualPodium?.champion) return []
    const bonusByType = new Map(
      bonusScores.filter((b) => b.bonus_category === 'tournament').map((b) => [b.bonus_type, b] as const),
    )
    const defs = [
      { key: 'champion', label: 'Champion', medal: '🥇', cfg: poolSettings.bonus_champion_correct ?? 0, actual: actualPodium.champion, predicted: predictedPodium?.champion ?? null, bonusType: 'champion_correct' },
      { key: 'runnerUp', label: 'Runner-up', medal: '🥈', cfg: poolSettings.bonus_second_place_correct ?? 0, actual: actualPodium.runnerUp, predicted: predictedPodium?.runnerUp ?? null, bonusType: 'second_place_correct' },
      { key: 'thirdPlace', label: 'Third place', medal: '🥉', cfg: poolSettings.bonus_third_place_correct ?? 0, actual: actualPodium.thirdPlace, predicted: predictedPodium?.thirdPlace ?? null, bonusType: 'third_place_correct' },
    ]
    return defs
      .filter((d) => (d.cfg ?? 0) > 0)
      .map((d) => {
        const earned = bonusByType.get(d.bonusType)?.points_earned ?? 0
        const hit = earned > 0 || (!!d.predicted?.team_id && !!d.actual?.team_id && d.predicted.team_id === d.actual.team_id)
        return { ...d, earned, hit }
      })
  }, [predictionMode, actualPodium, predictedPodium, poolSettings, bonusScores])

  const podiumSubtotal = useMemo(() => podiumRows.reduce((s, r) => s + r.earned, 0), [podiumRows])

  const rank = entry.current_rank
  const playerName = entry.users?.full_name || entry.users?.username || 'Unknown Player'
  const username = entry.users?.username
  const entryName = entry.entry_name

  // Total PSO points across all stages
  const totalPsoPoints = useMemo(() => {
    let total = 0
    for (const s of stageStats.values()) total += s.pso
    return total
  }, [stageStats])

  const exportCsv = useCallback(() => {
    const esc = (v: string | number) => {
      const s = String(v)
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s
    }

    const lines: string[] = []

    // Summary
    lines.push('POINTS SUMMARY')
    lines.push(`Player,${esc(playerName)}`)
    if (isMultiEntry) lines.push(`Entry,${esc(entryName)}`)
    if (rank) lines.push(`Rank,${rank}`)
    lines.push(`Match Points,${matchPoints}`)
    lines.push(`Bonus Points,${bonusPoints}`)
    if ((entry.point_adjustment ?? 0) !== 0) {
      lines.push(`Point Adjustment,${entry.point_adjustment}`)
      if (entry.adjustment_reason) lines.push(`Adjustment Reason,${esc(entry.adjustment_reason)}`)
    }
    lines.push(`Total Points,${totalPoints}`)
    lines.push('')

    // Match Points
    if (matchDetails.length > 0) {
      lines.push('MATCH POINTS BREAKDOWN')
      lines.push('Match #,Stage,Home Team,Away Team,Predicted,Actual,Type,Base Pts,Multiplier,PSO Pts,Total Pts')
      for (const d of matchDetails) {
        lines.push([
          d.matchNumber,
          esc(STAGE_LABELS[d.stage] ?? d.stage),
          esc(d.homeTeam),
          esc(d.awayTeam),
          `${d.predictedHome}-${d.predictedAway}`,
          `${d.actualHome}-${d.actualAway}`,
          esc(TYPE_LABELS[d.type] ?? d.type),
          d.basePoints,
          d.multiplier,
          d.psoPoints,
          d.points,
        ].join(','))
      }
      lines.push('')

      // Stage subtotals
      lines.push('STAGE SUBTOTALS')
      lines.push('Stage,Exact,W+GD,Winner,Miss,PSO Pts,Total Pts')
      for (const stage of ['group', 'round_32', 'round_16', 'quarter_final', 'semi_final', 'third_place', 'final']) {
        const stats = stageStats.get(stage)
        if (!stats) continue
        lines.push([
          esc(STAGE_LABELS[stage] ?? stage),
          stats.exact,
          stats.winnerGd,
          stats.winner,
          stats.miss,
          stats.pso,
          stats.total,
        ].join(','))
      }
      lines.push('')
    }

    // Bonus Points
    if (bonusScores.length > 0) {
      if (predictionMode === 'bracket_picker') {
        // Bracket picker: full detail with status per prediction
        for (const category of BP_CATEGORY_ORDER) {
          const entries = groupedBonuses.get(category)
          if (!entries || entries.length === 0) continue
          const config = BP_CATEGORY_CONFIG[category]
          const stats = bpCategoryStats.get(category)
          const subtotal = categorySubtotals.get(category) ?? 0

          lines.push(config.label.toUpperCase())
          if (stats) {
            const parts: string[] = []
            if (stats.correct > 0) parts.push(`${stats.correct} Correct`)
            if (stats.miss > 0) parts.push(`${stats.miss} Miss`)
            if (stats.pending > 0) parts.push(`${stats.pending} Pending`)
            lines.push(`Summary,${parts.join(' / ')},${subtotal} pts`)
          }
          lines.push('Status,Description,Points')
          for (const bs of entries) {
            const status = getBpPredictionStatus(bs)
            lines.push([
              esc(BP_TYPE_LABELS[status]),
              esc(formatBonusDescription(bs, bonusMatchContext(bs.related_match_id))),
              bs.points_earned,
            ].join(','))
          }
          lines.push('')
        }
      } else {
        lines.push('BONUS POINTS BREAKDOWN')
        lines.push('Category,Description,Points')
        for (const category of BONUS_CATEGORY_ORDER) {
          const entries = groupedBonuses.get(category)
          if (!entries || entries.length === 0) continue
          const config = BONUS_CATEGORY_CONFIG[category]
          for (const bs of entries) {
            lines.push([
              esc(config.label),
              esc(formatBonusDescription(bs, bonusMatchContext(bs.related_match_id))),
              bs.points_earned,
            ].join(','))
          }
        }
        lines.push('')
      }
    }

    const csv = lines.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const safeName = (isMultiEntry ? entryName : playerName).replace(/[^a-zA-Z0-9]/g, '_')
    a.href = url
    a.download = `points_breakdown_${safeName}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [playerName, entryName, isMultiEntry, rank, matchPoints, bonusPoints, totalPoints, matchDetails, stageStats, bonusScores, groupedBonuses, predictionMode, bpCategoryStats, categorySubtotals, entry, bonusMatchContext])

  return (
    <Modal
      isOpen
      onClose={onClose}
      titleId="points-breakdown-title"
      size="md"
      className="sm:mx-4"
    >
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5 pb-4 bg-surface shadow-card dark:shadow-none dark:border-b dark:border-border-default shrink-0 relative z-10">
          <div className="flex items-center gap-3 min-w-0">
            {rank && (
              <span
                className={`shrink-0 inline-flex items-center justify-center min-w-13 h-11 px-3 rounded-pill text-white t-num t-num-black ${rankChipTone(rank).bg} ${rankChipTextClass(rank)}`}
              >
                #{rank}
              </span>
            )}
            <div className="min-w-0">
              {isMultiEntry ? (
                <>
                  <h2 id="points-breakdown-title" className="text-lg font-bold text-ink truncate">{entryName}</h2>
                  <div className="text-sm text-muted truncate">
                    {playerName}
                    {username && entry.users?.full_name && ` (@${username})`}
                  </div>
                </>
              ) : (
                <>
                  <h2 id="points-breakdown-title" className="text-lg font-bold text-ink truncate">{playerName}</h2>
                  {username && (
                    <div className="text-sm text-muted truncate">
                      @{username}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={exportCsv}
              className="p-1.5 text-muted hover:text-muted hover:bg-mist rounded-control transition-colors"
              aria-label="Export CSV"
              title="Export as CSV"
            >
              <Icon name="square.and.arrow.down" size={20} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-muted hover:text-muted hover:bg-mist rounded-control transition-colors"
              aria-label="Close"
            >
              <Icon name="xmark" size={20} />
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        {/* Snow, not surface. The whole card model depends on it: the shadows are
            almost invisible by design, so what actually separates a card from the
            page is the two-layer background. On white the cards vanished and the
            hairline borders were doing all the work — which is what made this read
            as a table rather than as the app. */}
        <div className="overflow-y-auto bg-snow px-4 sm:px-6 py-4 space-y-4 rounded-b-sheet sm:rounded-b-card">
          {/* Total summary */}
          {/* SummaryCard from mobile/app/pool/[id]/breakdown.tsx: ONE card with
              divider-separated cells, not four tinted tiles. The colour lives in
              the numeral rather than in a fill behind it — match primary, bonus
              amber, adjustment green or red, total in ink and a size larger. */}
          <div className="flex items-center bg-surface rounded-card py-3.5 shadow-card dark:shadow-none dark:border dark:border-border-default">
            <SummaryCell
              label={predictionMode === 'bracket_picker' ? 'Picks' : 'Match'}
              value={matchPoints}
              tone="text-primary-600"
            />
            <SummaryDivider />
            <SummaryCell label="Bonus" value={bonusPoints} tone="text-warning-500" />
            {(entry.point_adjustment ?? 0) !== 0 && (
              <>
                <SummaryDivider />
                <SummaryCell
                  label="Adj."
                  value={entry.point_adjustment ?? 0}
                  tone={(entry.point_adjustment ?? 0) > 0 ? 'text-success-600' : 'text-danger-600'}
                  signed
                />
              </>
            )}
            <SummaryDivider />
            <SummaryCell label="Total" value={totalPoints} tone="text-ink" bold />
          </div>

          {/* ========================================== */}
          {/* POINT ADJUSTMENTS (only if non-zero)       */}
          {/* ========================================== */}
          {(entry.point_adjustment ?? 0) !== 0 && (
            <div>
              <h3 className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default px-4 py-2.5 t-section-header text-ink mb-3">
                Point Adjustments
                <span className={`ml-2 text-sm font-bold ${(entry.point_adjustment ?? 0) > 0 ? 'text-success-600' : 'text-danger-600'}`}>
                  {(entry.point_adjustment ?? 0) > 0 ? '+' : ''}{formatNumber(entry.point_adjustment ?? 0)}
                </span>
              </h3>
              <div className="space-y-2">
                {adjustmentHistory.length > 0 ? (
                  adjustmentHistory.map((adj) => (
                    <div key={adj.id} className="rounded-chip bg-warning-50 dark:bg-warning-500/10 overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-2.5">
                        <span className="text-xs font-medium text-warning-800">{adj.reason}</span>
                        <span className={`text-xs font-bold ${adj.amount > 0 ? 'text-success-600' : 'text-danger-600'}`}>
                          {adj.amount > 0 ? '+' : ''}{formatNumber(adj.amount)} pts
                        </span>
                      </div>
                      <div className="px-3 pb-2 -mt-1">
                        <span className="text-[10px] text-warning-600">
                          {new Date(adj.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-chip bg-warning-50 dark:bg-warning-500/10 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-xs font-medium text-warning-800">Manual Adjustment</span>
                      <span className={`text-xs font-bold ${(entry.point_adjustment ?? 0) > 0 ? 'text-success-600' : 'text-danger-600'}`}>
                        {(entry.point_adjustment ?? 0) > 0 ? '+' : ''}{formatNumber(entry.point_adjustment ?? 0)} pts
                      </span>
                    </div>
                    {entry.adjustment_reason && (
                      <div className="px-3 pb-2.5 -mt-1">
                        <span className="text-xs text-warning-700 italic">{entry.adjustment_reason}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {predictionMode === 'bracket_picker' ? (
            <>
              {/* ========================================== */}
              {/* BRACKET PICKER POINTS BREAKDOWN            */}
              {/* ========================================== */}
              <div>
                <h3 className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default px-4 py-2.5 t-section-header text-ink mb-3">
                  Points Breakdown
                </h3>

                {bonusScores.length === 0 && matchPoints === 0 ? (
                  <div className="text-center py-6 bg-snow rounded-chip">
                    <div className="text-muted text-sm">No points calculated yet</div>
                    <div className="text-muted text-xs mt-1">
                      Points are calculated as tournament stages complete
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {BP_CATEGORY_ORDER.map((category) => {
                      const catEntries = groupedBonuses.get(category)
                      if (!catEntries || catEntries.length === 0) return null
                      const subtotal = categorySubtotals.get(category) ?? 0
                      const config = BP_CATEGORY_CONFIG[category]
                      const stats = bpCategoryStats.get(category)

                      return (
                        <div key={category} className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default overflow-hidden pb-2">
                          <div className="flex items-center gap-2 px-4 py-3">
                            <span className="t-card-title text-ink">
                              {config.label}
                            </span>
                            <span className="t-num t-num-extrabold text-sm text-primary-600 shrink-0 ml-auto">
                              {formatNumber(subtotal)} pts
                            </span>
                          </div>

                          {/* Summary bar */}
                          {stats && (stats.correct > 0 || stats.miss > 0 || stats.pending > 0) && (
                            <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5">
                              {stats.correct > 0 && (
                                <span className={`inline-flex items-center shrink-0 whitespace-nowrap rounded-pill font-semibold px-2.5 py-1 text-[11px] leading-none ${BP_STATUS_CHIP.correct}`}>
                                  {stats.correct} Correct
                                </span>
                              )}
                              {stats.miss > 0 && (
                                <span className={`inline-flex items-center shrink-0 whitespace-nowrap rounded-pill font-semibold px-2.5 py-1 text-[11px] leading-none ${BP_STATUS_CHIP.miss}`}>
                                  {stats.miss} Miss
                                </span>
                              )}
                              {stats.pending > 0 && (
                                <span className={`inline-flex items-center shrink-0 whitespace-nowrap rounded-pill font-semibold px-2.5 py-1 text-[11px] leading-none ${BP_STATUS_CHIP.pending}`}>
                                  {stats.pending} Pending
                                </span>
                              )}
                            </div>
                          )}

                          {/* Individual prediction rows */}
                          <div>
                            {catEntries.map((bs, i) => {
                              const status = getBpPredictionStatus(bs)
                              return (
                                <div
                                  key={`${bs.bonus_type}-${bs.related_group_letter}-${bs.related_match_id}-${i}`}
                                  className="flex items-center justify-between px-4 py-2 text-xs"
                                >
                                  <div className="flex items-center gap-2 min-w-0 flex-1">
                                    <span
                                      className={`shrink-0 w-16 text-center rounded-pill font-bold px-2 py-1 text-[11px] leading-none ${BP_STATUS_CHIP[status]}`}
                                    >
                                      {BP_TYPE_LABELS[status]}
                                    </span>
                                    <span className={`leading-snug truncate ${status === 'correct' ? 'text-muted' : status === 'pending' ? 'text-warning-600' : 'text-muted'}`}>
                                      {formatBonusDescription(bs, bonusMatchContext(bs.related_match_id))}
                                    </span>
                                  </div>
                                  <span className={`font-semibold flex-shrink-0 ml-2 ${bs.points_earned > 0 ? 'text-success-600' : 'text-muted'}`}>
                                    {bs.points_earned > 0 ? `+${formatNumber(bs.points_earned)}` : '0'}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* ========================================== */}
              {/* BRACKET PICKER SCORING RULES REFERENCE     */}
              {/* ========================================== */}
              <div>
                <h3 className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default px-4 py-2.5 t-section-header text-ink mb-3">
                  Scoring Rules
                </h3>

                <div className="space-y-3">
                  {/* Group Rankings Rules */}
                  <div className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default overflow-hidden pb-2">
                    <div className="px-4 py-3">
                      <span className="t-card-title text-ink">Group Stage Rankings</span>
                    </div>
                    <div>
                      <PointsRow label="Correct 1st Place" value={poolSettings.bp_group_correct_1st ?? 4} />
                      <PointsRow label="Correct 2nd Place" value={poolSettings.bp_group_correct_2nd ?? 3} />
                      <PointsRow label="Correct 3rd Place" value={poolSettings.bp_group_correct_3rd ?? 2} />
                      <PointsRow label="Correct 4th Place" value={poolSettings.bp_group_correct_4th ?? 1} />
                    </div>
                  </div>

                  {/* Third-Place Rules */}
                  <div className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default overflow-hidden pb-2">
                    <div className="px-4 py-3">
                      <span className="t-card-title text-ink">Third-Place Rankings</span>
                    </div>
                    <div>
                      <PointsRow label="Correct qualifier" value={poolSettings.bp_third_correct_qualifier ?? 2} />
                      <PointsRow label="Correct eliminated" value={poolSettings.bp_third_correct_eliminated ?? 1} />
                      <PointsRow label="All 8 qualifiers correct bonus" value={poolSettings.bp_third_all_correct_bonus ?? 10} />
                    </div>
                  </div>

                  {/* Knockout Rules */}
                  <div className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default overflow-hidden pb-2">
                    <div className="px-4 py-3">
                      <span className="t-card-title text-ink">Knockout Stage</span>
                    </div>
                    <div>
                      <PointsRow label="Round of 32" value={poolSettings.bp_r32_correct ?? 1} />
                      <PointsRow label="Round of 16" value={poolSettings.bp_r16_correct ?? 2} />
                      <PointsRow label="Quarter Finals" value={poolSettings.bp_qf_correct ?? 4} />
                      <PointsRow label="Semi Finals" value={poolSettings.bp_sf_correct ?? 8} />
                      <PointsRow label="3rd Place Match" value={poolSettings.bp_third_place_match_correct ?? 10} />
                      <PointsRow label="Final" value={poolSettings.bp_final_correct ?? 20} />
                    </div>
                  </div>

                  {/* Bonus Rules */}
                  <div className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default overflow-hidden pb-2">
                    <div className="px-4 py-3">
                      <span className="t-card-title text-ink">Bonus Points</span>
                    </div>
                    <div>
                      <PointsRow label="Champion correct" value={poolSettings.bp_champion_bonus ?? 50} />
                      <PointsRow label="Penalty prediction" value={poolSettings.bp_penalty_correct ?? 1} />
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* ========================================== */}
              {/* MATCH POINTS BREAKDOWN                     */}
              {/* ========================================== */}
              <div>
                <h3 className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default px-4 py-2.5 t-section-header text-ink mb-3">
                  Match Points
                </h3>

                {matchDetails.length === 0 ? (
                  <div className="text-center py-6 bg-snow rounded-chip">
                    <div className="text-muted text-sm">No completed matches with predictions yet</div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {renderMatchStageSection('group')}
                    {renderMatchStageSection('round_32')}
                    {renderMatchStageSection('round_16')}
                    {renderMatchStageSection('quarter_final')}
                    {renderMatchStageSection('semi_final')}
                    {renderMatchStageSection('third_place')}
                    {renderMatchStageSection('final')}

                    {totalPsoPoints > 0 && (
                      <div className="bg-accent-50 rounded-chip px-3 py-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-medium text-accent-700">Penalty Shootout Bonus (included above)</span>
                          <span className="text-xs font-bold text-accent-700">+{formatNumber(totalPsoPoints)} pts</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ========================================== */}
              {/* BONUS POINTS BREAKDOWN                     */}
              {/* ========================================== */}
              <div>
                <h3 className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default px-4 py-2.5 t-section-header text-ink mb-3">
                  Bonus Points
                </h3>

                {bonusScores.length === 0 ? (
                  <div className="text-center py-6 bg-snow rounded-chip">
                    <div className="text-muted text-sm">No bonus points earned yet</div>
                    <div className="text-muted text-xs mt-1">
                      Bonus points are calculated as tournament stages complete
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {BONUS_CATEGORY_ORDER.map((category) => {
                      // 'tournament' is rendered by the dedicated Tournament Podium
                      // section below (which also shows missed picks), so skip it here.
                      if (category === 'tournament') return null
                      const catEntries = groupedBonuses.get(category)
                      if (!catEntries || catEntries.length === 0) return null
                      const subtotal = categorySubtotals.get(category) ?? 0
                      const config = BONUS_CATEGORY_CONFIG[category]

                      return (
                        <div key={category} className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default overflow-hidden pb-2">
                          <div className="flex items-center gap-2 px-4 py-3">
                            <span className="t-card-title text-ink">
                              {config.label}
                            </span>
                            <span className="t-num t-num-extrabold text-sm text-primary-600 shrink-0 ml-auto">
                              {formatNumber(subtotal)} pts
                            </span>
                          </div>
                          <div>
                            {catEntries.map((bs, i) => (
                              <div
                                key={`${bs.bonus_type}-${bs.related_group_letter}-${bs.related_match_id}-${i}`}
                                className="flex items-start justify-between px-4 py-2 text-xs"
                              >
                                <span className="text-muted pr-3 leading-snug">
                                  {formatBonusDescription(bs, bonusMatchContext(bs.related_match_id))}
                                </span>
                                <span className={`t-num t-num-extrabold text-xs shrink-0 ${bs.points_earned > 0 ? 'text-warning-500' : 'text-muted'}`}>
                                  {bs.points_earned > 0 ? `+${formatNumber(bs.points_earned)}` : '0'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* ========================================== */}
              {/* TOURNAMENT PODIUM (pick vs actual)         */}
              {/* ========================================== */}
              {podiumRows.length > 0 && (
                <div>
                  <h3 className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default px-4 py-2.5 t-section-header text-ink mb-3">
                    Tournament Podium
                  </h3>
                  <div className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default overflow-hidden pb-2">
                    <div className="flex items-center gap-2 px-4 py-3">
                      <span className="t-card-title text-ink">Final Standings</span>
                      <span className="t-num t-num-extrabold text-sm text-primary-600 shrink-0 ml-auto">{formatNumber(podiumSubtotal)} pts</span>
                    </div>
                    <div>
                      {podiumRows.map((row) => (
                        <div key={row.key} className="flex items-center justify-between gap-2 px-4 py-2 text-xs">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="flex-shrink-0">{row.medal}</span>
                              <span className="font-medium text-muted">{row.label}:</span>
                              <span className="font-semibold text-ink">{row.actual?.country_name ?? '—'}</span>
                            </div>
                            <div className="mt-0.5 pl-6 text-[11px]">
                              {row.hit ? (
                                <span className="font-medium text-success-600">✓ You called it</span>
                              ) : (
                                <span className="text-muted">
                                  Your pick: <span className="text-muted">{row.predicted?.country_name ?? 'no pick'}</span>
                                </span>
                              )}
                            </div>
                          </div>
                          <span className={`flex-shrink-0 font-semibold ${row.hit ? 'text-success-600' : 'text-muted'}`}>
                            {row.hit ? `+${formatNumber(row.earned)}` : '0'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ========================================== */}
              {/* SCORING RULES REFERENCE                    */}
              {/* ========================================== */}
              <div>
                <h3 className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default px-4 py-2.5 t-section-header text-ink mb-3">
                  Scoring Rules
                </h3>

                <div className="space-y-3">
                  {/* Group Stage Rules */}
                  <div className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default overflow-hidden pb-2">
                    <div className="px-4 py-3">
                      <span className="t-card-title text-ink">Group Stage</span>
                    </div>
                    <div>
                      <PointsRow label="Exact Score" value={poolSettings.group_exact_score} />
                      <PointsRow label="Correct Winner + Goal Diff" value={poolSettings.group_correct_difference} />
                      <PointsRow label="Correct Result Only" value={poolSettings.group_correct_result} />
                    </div>
                  </div>

                  {/* Knockout Stage Rules */}
                  <div className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default overflow-hidden pb-2">
                    <div className="px-4 py-3">
                      <span className="t-card-title text-ink">Knockout Stage (Base)</span>
                    </div>
                    <div>
                      <PointsRow label="Exact Score" value={poolSettings.knockout_exact_score} />
                      <PointsRow label="Correct Winner + Goal Diff" value={poolSettings.knockout_correct_difference} />
                      <PointsRow label="Correct Result Only" value={poolSettings.knockout_correct_result} />
                    </div>
                  </div>

                  {/* Multipliers */}
                  <div className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default overflow-hidden pb-2">
                    <div className="px-4 py-3">
                      <span className="t-card-title text-ink">Round Multipliers</span>
                    </div>
                    <div>
                      <PointsRow label="Round of 32" value={`${poolSettings.round_32_multiplier}x`} suffix="" />
                      <PointsRow label="Round of 16" value={`${poolSettings.round_16_multiplier}x`} suffix="" />
                      <PointsRow label="Quarter Finals" value={`${poolSettings.quarter_final_multiplier}x`} suffix="" />
                      <PointsRow label="Semi Finals" value={`${poolSettings.semi_final_multiplier}x`} suffix="" />
                      <PointsRow label="Third Place" value={`${poolSettings.third_place_multiplier}x`} suffix="" />
                      <PointsRow label="Final" value={`${poolSettings.final_multiplier}x`} suffix="" />
                    </div>
                  </div>

                  {/* PSO Rules */}
                  {poolSettings.pso_enabled && (
                    <div className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default overflow-hidden pb-2">
                      <div className="px-4 py-3">
                        <span className="t-card-title text-ink">Penalty Shootout (Bonus)</span>
                      </div>
                      <div>
                        <PointsRow label="Exact PSO Score" value={poolSettings.pso_exact_score} />
                        <PointsRow label="Correct PSO Winner + GD" value={poolSettings.pso_correct_difference} />
                        <PointsRow label="Correct PSO Winner Only" value={poolSettings.pso_correct_result} />
                      </div>
                    </div>
                  )}

                  {/* Bonus Rules */}
                  <div className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default overflow-hidden pb-2">
                    <div className="px-4 py-3">
                      <span className="t-card-title text-ink">Bonus Points (per group / per match)</span>
                    </div>
                    <div>
                      <PointsRow label="Winner AND Runner-up correct" value={poolSettings.bonus_group_winner_and_runnerup ?? 0} />
                      <PointsRow label="Winner only correct" value={poolSettings.bonus_group_winner_only ?? 0} />
                      <PointsRow label="Runner-up only correct" value={poolSettings.bonus_group_runnerup_only ?? 0} />
                      <PointsRow label="Both qualify, positions swapped" value={poolSettings.bonus_both_qualify_swapped ?? 0} />
                      <PointsRow label="One qualifies, wrong position" value={poolSettings.bonus_one_qualifies_wrong_position ?? 0} />
                      <PointsRow label="Correct bracket pairing" value={poolSettings.bonus_correct_bracket_pairing ?? 0} />
                      <PointsRow label="Correct match winner" value={poolSettings.bonus_match_winner_correct ?? 0} />
                      <PointsRow label="Champion correct" value={poolSettings.bonus_champion_correct ?? 0} />
                      <PointsRow label="Runner-up correct" value={poolSettings.bonus_second_place_correct ?? 0} />
                      <PointsRow label="Third place correct" value={poolSettings.bonus_third_place_correct ?? 0} />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
    </Modal>
  )

  // =============================================
  // RENDER HELPERS
  // =============================================

  function renderMatchStageSection(stage: string) {
    const details = matchesByStage.get(stage)
    if (!details || details.length === 0) return null
    const stats = stageStats.get(stage)!
    const label = STAGE_LABELS[stage] ?? stage
    const isKnockout = stage !== 'group'

    return (
      <div key={stage} className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default overflow-hidden pb-2">
        {/* Stage header */}
        <div className="flex items-center gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="t-card-title text-ink">{label}</span>
            {isKnockout && (
              <span className="rounded-pill bg-primary-light px-1.5 py-0.5 text-[10px] font-bold text-primary-600">
                {details[0].multiplier.toFixed(1)}x
              </span>
            )}
          </div>
          <span className="t-num t-num-extrabold text-sm text-primary-600 ml-auto shrink-0">
            {formatNumber(stats.total)} pts
          </span>
        </div>

        {/* Hit type summary bar */}
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-2.5">
          {stats.exact > 0 && (
            <span className={`inline-flex items-center shrink-0 whitespace-nowrap rounded-pill font-semibold px-2.5 py-1 text-[11px] leading-none ${tierChipClass('exact')}`}>
              {stats.exact} Exact
            </span>
          )}
          {stats.winnerGd > 0 && (
            <span className={`inline-flex items-center shrink-0 whitespace-nowrap rounded-pill font-semibold px-2.5 py-1 text-[11px] leading-none ${tierChipClass('winner_gd')}`}>
              {stats.winnerGd} W+GD
            </span>
          )}
          {stats.winner > 0 && (
            <span className={`inline-flex items-center shrink-0 whitespace-nowrap rounded-pill font-semibold px-2.5 py-1 text-[11px] leading-none ${tierChipClass('winner')}`}>
              {stats.winner} Winner
            </span>
          )}
          {stats.miss > 0 && (
            <span className={`inline-flex items-center shrink-0 whitespace-nowrap rounded-pill font-semibold px-2.5 py-1 text-[11px] leading-none ${tierChipClass('miss')}`}>
              {stats.miss} Miss
            </span>
          )}
        </div>

        {/* Individual match rows */}
        {/* MatchRow from the RN breakdown screen: a fully-rounded tier pill, then
            Pred and Actual as separate labelled mono columns, the fixture, and the
            points. The web version ran the two scores together as "2-1 vs 1-0",
            which made you read a sentence to work out which was yours. */}
        <div>
          {details.map((d) => (
            <div key={d.matchNumber} className="flex flex-col gap-1 px-4 py-1.5">
              <div className="flex items-center gap-2">
              <span
                className={`shrink-0 w-16 text-center rounded-pill font-bold px-2 py-1 text-[11px] leading-none ${tierChipClass(d.type)}`}
              >
                {TYPE_LABELS[d.type]}
              </span>

              <span className="shrink-0 w-9 flex flex-col items-center gap-px">
                <span className="t-num t-num-regular text-xs text-ink">{d.predictedHome}-{d.predictedAway}</span>
                <span className="text-[8px] font-medium text-muted">Pred</span>
              </span>

              <span className="shrink-0 w-10 flex flex-col items-center gap-px">
                <span className="t-num t-num-regular text-xs text-ink">{d.actualHome}-{d.actualAway}</span>
                <span className="text-[8px] font-medium text-muted">Actual</span>
              </span>

              <span className="flex-1 min-w-0 t-detail text-muted truncate">
                {d.homeTeam} v {d.awayTeam}
              </span>

              <span
                className={`shrink-0 t-num t-num-extrabold text-xs ${d.points > 0 ? 'text-success-600' : 'text-muted'}`}
              >
                {d.points > 0 ? `+${formatNumber(d.points)}` : '0'}
                </span>
              </div>

              {/* A knockout fixture is scored on the scoreline you predicted even
                  when the teams you sent through never arrived. Without this the
                  row reads as a plain miss rather than a bracket that broke. */}
              {d.predictedHomeTeam && (
                /* Indented to sit under the Pred scoreline. Built from the same
                   pieces as the row above rather than one hand-computed margin:
                   the spacer carries the tier pill's own w-16, so if that pill is
                   ever resized this tracks it instead of silently drifting. Only
                   pl-2 is a constant — the Pred column is w-9 with the numerals
                   centred, so its left edge sits ~8px left of the digits. */
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-16 shrink-0" aria-hidden="true" />
                  <div className="flex items-center gap-1 min-w-0 pl-2">
                    <Icon name="arrow.triangle.branch" size={11} weight="medium" className="shrink-0 text-warning-500" />
                    <span className="t-detail text-warning-500 truncate">
                      You predicted: {d.predictedHomeTeam} v {d.predictedAwayTeam}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    )
  }
}
