'use client'

// =============================================================
// One table prediction, scored — the presentation, for anyone's entry
// =============================================================
// Extracted from `TablePredictionTab`'s locked view when the same thing was
// needed for OTHER members. Two copies of a scoring breakdown is how the screen
// a member checks and the screen they compare against start disagreeing, so
// there is one.
//
// It renders and nothing else. Who is allowed to see whose table is decided
// twice before this is reached: by RLS on `league_table_predictions` (migration
// 078 — your own always, everyone else's only after the lock) and again by the
// caller, which must not offer a rival's table before the deadline even when
// RLS would allow it. The admin policy has no lock check, so an admin who also
// plays would otherwise get a pre-deadline look at everybody's picks through a
// screen we built for transparency.

import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import type { TableBreakdownRow } from '@/lib/league/table'

/**
 * How far off the prediction is, in the direction a football follower reads it:
 * a club finishing HIGHER than you said is a positive surprise, so it is green.
 */
export function Delta({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-neutral-300">—</span>
  if (delta === 0) return <span className="text-success-600 font-semibold">exact</span>
  const better = delta < 0
  return (
    <span className={better ? 'text-success-600' : 'text-danger-600'}>
      {better ? '▲' : '▼'} {Math.abs(delta)}
    </span>
  )
}

export type TablePrices = {
  championBonus: number
  topFourBonus: number
  perfectTopFourBonus: number
  relegationBonus: number
  europaBonus: number
}

/**
 * The band bonuses, counted from the same per-row flags the engine counted.
 *
 * ⚠ THIS MIRRORS SQL, AND THE COUPLING IS THE RISK. The authority is
 * `league_score_table` (migration 093):
 *
 *     champion_hit * champ
 *   + top_hits     * top_bonus
 *   + (top_hits = top_n AND top_n > 0 ? perfect : 0)
 *   + releg_hits   * releg_bonus
 *   + europa_hits  * eur_bonus
 *
 * It is repeated here rather than returned by the RPC because the breakdown is
 * per club and the bonuses are per entry. If the engine's formula changes, this
 * must change with it — and the way you will find out is the total below no
 * longer matching the leaderboard, which is exactly the symptom that made this
 * necessary in the first place: a modal saying 700 beside a leaderboard saying
 * 1,240, with nothing on screen to explain the 540.
 */
export function bandBonuses(rows: TableBreakdownRow[], topN: number, prices: TablePrices) {
  const championHits = rows.filter((r) => r.champion_hit).length
  const topHits = rows.filter((r) => r.top_hit).length
  const relegHits = rows.filter((r) => r.releg_hit).length
  const europaHits = rows.filter((r) => r.europa_hit).length
  const perfectTop = topN > 0 && topHits === topN

  const lines: Array<{ label: string; points: number }> = []
  if (championHits > 0) lines.push({ label: 'Champion called right', points: championHits * prices.championBonus })
  if (topHits > 0) lines.push({ label: `Top ${topN} named — ${topHits}`, points: topHits * prices.topFourBonus })
  if (perfectTop) lines.push({ label: `All ${topN}, as a set`, points: prices.perfectTopFourBonus })
  if (europaHits > 0) lines.push({ label: `Europa places named — ${europaHits}`, points: europaHits * prices.europaBonus })
  if (relegHits > 0) lines.push({ label: `Relegation named — ${relegHits}`, points: relegHits * prices.relegationBonus })

  return { lines, total: lines.reduce((sum, l) => sum + l.points, 0) }
}

type Props = {
  breakdown: TableBreakdownRow[]
  topN: number
  prices: TablePrices
  /** Colours the left edge of each row by qualification band. */
  bandOf: (position: number) => string | null
  bandStripe: Record<string, string>
  /**
   * Whose table this is, in the first column heading. "You" on your own,
   * a first name on somebody else's — the column is their predicted position,
   * and it should read as theirs.
   */
  ownerLabel: string
  /** Hidden on someone else's table: the summary already carries the total. */
  showFooterNote?: boolean
}

export function TableBreakdownView({
  breakdown,
  topN,
  prices,
  bandOf,
  bandStripe,
  ownerLabel,
  showFooterNote = true,
}: Props) {
  const positional = breakdown.reduce((sum, r) => sum + (r.points ?? 0), 0)
  const bonuses = bandBonuses(breakdown, topN, prices)
  const total = positional + bonuses.total
  const isFinal = breakdown[0]?.is_final ?? false
  const exact = breakdown.filter((r) => r.delta === 0).length

  return (
    <div className="space-y-4">
      <Card padding="md">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-2xl font-bold text-neutral-900 tabular-nums">{total.toLocaleString()}</p>
            <p className="text-xs text-neutral-500 mt-0.5">
              points from this table · {exact} exactly right
            </p>
          </div>
          {/* "Provisional" until the season-end snapshot exists — decision 9.
              The label is the honest half of scoring it live. */}
          <Badge variant={isFinal ? 'green' : 'gray'}>{isFinal ? 'Final' : 'Provisional'}</Badge>
        </div>
      </Card>

      {/* ⚠ WITHOUT THIS THE MODAL CONTRADICTED THE LEADERBOARD. The per-club
          points below are only the POSITIONAL half; the band bonuses are the
          rest, and they are most of a good table's score. Showing the total
          without them read as a mistake in the scoring — the opposite of what
          a breakdown is for. */}
      {bonuses.lines.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="px-3 py-2 bg-neutral-50 text-[10px] uppercase tracking-wider text-neutral-500 font-bold">
            How the total is made up
          </div>
          <div className="divide-y divide-border-default">
            <Line label="Points from where you put each club" points={positional} />
            {bonuses.lines.map((l) => (
              <Line key={l.label} label={l.label} points={l.points} />
            ))}
            <div className="flex items-center justify-between px-3 py-2.5 bg-neutral-50">
              <span className="text-sm font-bold text-neutral-900">Total</span>
              <span className="text-sm font-bold text-neutral-900 tabular-nums">{total.toLocaleString()}</span>
            </div>
          </div>
        </Card>
      )}

      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm tabular-nums">
            <thead>
              <tr className="bg-neutral-50 text-[10px] uppercase tracking-wider text-neutral-500">
                <th className="py-2.5 pl-3 pr-1 text-left font-bold w-12">{ownerLabel}</th>
                <th className="py-2.5 px-2 text-left font-bold">Club</th>
                <th className="py-2.5 px-2 text-right font-bold w-12">Now</th>
                <th className="py-2.5 px-2 text-right font-bold w-14">Diff</th>
                <th className="py-2.5 pl-2 pr-3 text-right font-bold w-14">Pts</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((r) => {
                const band = bandOf(r.predicted_position)
                return (
                  <tr key={r.club_id} className="border-t border-border-default">
                    <td className="py-2 pl-3 pr-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-[3px] h-5 rounded-full ${band ? bandStripe[band] : 'bg-transparent'}`}
                          aria-hidden="true"
                        />
                        <span className="font-bold text-neutral-900">{r.predicted_position}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {r.crest_url && <img src={r.crest_url} alt="" className="w-5 h-5 object-contain shrink-0" />}
                        <span className="font-semibold text-neutral-900 truncate">{r.club_name}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right text-neutral-600">{r.actual_position ?? '—'}</td>
                    <td className="py-2 px-2 text-right"><Delta delta={r.delta} /></td>
                    <td className="py-2 pl-2 pr-3 text-right font-bold text-neutral-900">{r.points ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {showFooterNote && (
        <p className="text-xs text-neutral-400">
          {isFinal
            ? 'The season is over — these are the final positions.'
            : 'Positions move every matchweek, so this total is provisional until the season ends.'}
        </p>
      )}
    </div>
  )
}

function Line({ label, points }: { label: string; points: number }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 gap-3">
      <span className="text-sm text-neutral-600">{label}</span>
      <span className="text-sm font-semibold text-neutral-900 tabular-nums shrink-0">
        +{points.toLocaleString()}
      </span>
    </div>
  )
}
