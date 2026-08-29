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
import { shortClubName } from '@/lib/league/clubName'

/**
 * How far off the prediction is — coloured by HOW WRONG, not by which way.
 *
 * ⚠ THIS USED TO COLOUR BY DIRECTION: a club finishing higher than you said was
 * green, lower was red. It read as praise and blame, and it was measuring the
 * wrong thing. Being six places out is six places out; the points are identical
 * whether the club overperformed or collapsed, so a green "▲ 7" sat next to a
 * red "▼ 6" while both were worth exactly zero.
 *
 * The heat now tracks what the member actually keeps. `zeroAt` is the distance
 * at which a club stops being worth anything — derived from the pool's own
 * prices, not fixed at five, so a pool that charges 25 a place runs the ramp
 * over four instead. On the default 100/20 it is exactly the five the scoring
 * ladder prints on the Scoring Rules tab, which is the point: the two screens
 * describe one scale.
 */
/**
 * How far along the ramp this club sits: 0 exact, 1 worth nothing.
 *
 * Kept separate from the colour so the progression can be tested as a number
 * rather than by string-matching a CSS expression.
 */
export function deltaHeatRatio(delta: number, zeroAt: number): number {
  if (zeroAt <= 0) return 0
  return Math.min(1, Math.abs(delta) / zeroAt)
}

/**
 * The heat colour, mixed from the theme's OWN semantic tokens.
 *
 * ⚠ WHY NOT TAILWIND SHADES. The first version stepped
 * success-600 → warning-500 → warning-600 → danger-500 → danger-600, and it
 * failed in both themes for different reasons. In light mode danger-500
 * (#F15757) and danger-600 (#EF4444) are the same red to the eye, so 4 and 5
 * were indistinguishable — which is what Ryan saw. In DARK mode the ramps are
 * inverted, higher numbers being lighter: warning-600 (#FCCE52) is a paler
 * yellow than warning-500 (#FBBF24), so step 3 looked LESS severe than step 2.
 *
 * A shade ladder cannot escalate in both themes at once, because the palette
 * deliberately flips direction between them. Mixing does: green → amber → red
 * are the same three meanings in either theme, and `color-mix` walks between
 * whatever those tokens currently are. Two segments rather than one, because a
 * direct green-to-red mix passes through mud.
 */
export function deltaHeatColor(delta: number, zeroAt: number): string {
  // No decay configured: nothing is "more wrong" than anything else, so there
  // is no heat to show and inventing one would be a lie about the scoring.
  if (zeroAt <= 0) return 'var(--neutral-500)'

  const ratio = deltaHeatRatio(delta, zeroAt)
  if (ratio <= 0.5) {
    const t = Math.round((ratio / 0.5) * 100)
    return `color-mix(in oklab, var(--warning-500) ${t}%, var(--success-600))`
  }
  const t = Math.round(((ratio - 0.5) / 0.5) * 100)
  return `color-mix(in oklab, var(--danger-600) ${t}%, var(--warning-500))`
}

export function Delta({ delta, zeroAt }: { delta: number | null; zeroAt: number }) {
  if (delta === null) return <span className="text-neutral-300">—</span>
  if (delta === 0) return <span className="text-success-600 font-semibold">exact</span>
  // The arrow still says WHICH way — that is real information, and a member
  // wants it. It just no longer decides the colour.
  return (
    <span style={{ color: deltaHeatColor(delta, zeroAt) }}>
      {delta < 0 ? '▲' : '▼'} {Math.abs(delta)}
    </span>
  )
}

export type TablePrices = {
  /** What a club placed exactly right is worth, and what each place out costs. */
  exactPoints: number
  stepPenalty: number
  championBonus: number
  topFourBonus: number
  perfectTopFourBonus: number
  relegationBonus: number
  europaBonus: number
  conferenceBonus: number
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
 *   + conference_hits * conf_bonus
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
  const conferenceHits = rows.filter((r) => r.conference_hit).length
  const perfectTop = topN > 0 && topHits === topN

  const lines: Array<{ label: string; points: number }> = []
  if (championHits > 0) lines.push({ label: 'Champion called right', points: championHits * prices.championBonus })
  if (topHits > 0) lines.push({ label: `Top ${topN} named — ${topHits}`, points: topHits * prices.topFourBonus })
  if (perfectTop) lines.push({ label: `All ${topN}, as a set`, points: prices.perfectTopFourBonus })
  if (europaHits > 0) lines.push({ label: `Europa places named — ${europaHits}`, points: europaHits * prices.europaBonus })
  if (conferenceHits > 0) lines.push({ label: `Conference places named — ${conferenceHits}`, points: conferenceHits * prices.conferenceBonus })
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
  // The first distance worth nothing — the same arithmetic the Scoring Rules
  // ladder uses, so the colours and the printed rungs cannot disagree.
  const zeroAt = prices.stepPenalty > 0 ? Math.ceil(prices.exactPoints / prices.stepPenalty) : 0

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
          {/* ⚠ NO min-width. It was 420px, which is wider than a 375px phone
              MINUS the modal's own padding — so the one screen explaining how
              somebody scored had to be scrolled sideways to read. The columns
              tighten instead, and the club name shortens. */}
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="bg-neutral-50 text-[10px] uppercase tracking-wider text-neutral-500">
                <th className="py-2.5 pl-2 pr-1 sm:pl-3 text-left font-bold w-9 sm:w-12">{ownerLabel}</th>
                <th className="py-2.5 px-1 sm:px-2 text-left font-bold">Club</th>
                <th className="py-2.5 px-1 sm:px-2 text-right font-bold w-9 sm:w-12">Now</th>
                <th className="py-2.5 px-1 sm:px-2 text-right font-bold w-12 sm:w-14">Diff</th>
                <th className="py-2.5 pl-1 pr-2 sm:pl-2 sm:pr-3 text-right font-bold w-10 sm:w-14">Pts</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((r) => {
                const band = bandOf(r.predicted_position)
                return (
                  <tr key={r.club_id} className="border-t border-border-default">
                    <td className="py-2 pl-2 pr-1 sm:pl-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-[3px] h-5 rounded-full ${band ? bandStripe[band] : 'bg-transparent'}`}
                          aria-hidden="true"
                        />
                        <span className="font-bold text-neutral-900">{r.predicted_position}</span>
                      </div>
                    </td>
                    <td className="py-2 px-1 sm:px-2">
                      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {r.crest_url && <img src={r.crest_url} alt="" className="w-5 h-5 object-contain shrink-0" />}
                        {/* Truncation would eat the half that tells two clubs
                            apart — "Manchester Unit…" beside "Manchester Cit…".
                            Same shortener the league table uses, so a member
                            reads the same name on both screens. */}
                        <span className="font-semibold text-neutral-900 truncate">
                          <span className="hidden sm:inline">{r.club_name}</span>
                          <span className="sm:hidden">{shortClubName(r.club_name)}</span>
                        </span>
                      </div>
                    </td>
                    <td className="py-2 px-1 sm:px-2 text-right text-neutral-600">{r.actual_position ?? '—'}</td>
                    <td className="py-2 px-1 sm:px-2 text-right"><Delta delta={r.delta} zeroAt={zeroAt} /></td>
                    <td className="py-2 pl-1 pr-2 sm:pl-2 sm:pr-3 text-right font-bold text-neutral-900">{r.points ?? '—'}</td>
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
