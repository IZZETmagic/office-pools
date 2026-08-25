'use client'

// =============================================================
// THE LEAGUE TABLE — the real one, as the competition has it
// =============================================================
// Plan §0.3. Every number here is INGESTED from api-football `/standings`
// (migration 075) and simply displayed. Nothing on this screen is computed in
// the browser, and that is deliberate twice over:
//
//   1. The architecture rule — the backend writes the answer down once, the
//      front end renders it.
//   2. A table computed from our own fixtures cannot see POINTS DEDUCTIONS.
//      Everton were docked ten points and then eight in 2023/24. A derived
//      table would have shown them ten places too high all season, visibly
//      wrong to anybody who had watched the football.
//
// Even the band shading and the movement arrows come from the feed:
// `description` names the Champions League and relegation places, `movement` is
// up / down / same. Hardcoding 1-4 and 18-20 would be wrong the first season a
// competition changed its qualification places, which they do.
// =============================================================

import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'

export type LeagueStandingRow = {
  club_id: string
  club_name: string
  crest_url: string | null
  rank: number
  points: number
  played: number
  won: number
  drawn: number
  lost: number
  goals_for: number
  goals_against: number
  goals_diff: number
  form: string | null
  description: string | null
  movement: 'up' | 'down' | 'same' | null
}

type Props = {
  rows: LeagueStandingRow[]
  /** When the feed was last read. Shown so nobody wonders if it is stale. */
  fetchedAt: string | null
}

/**
 * The feed's `description` is free text and varies by competition — "Promotion -
 * Champions League (League phase)", "Relegation", and so on. Matching on a
 * couple of keywords is deliberately loose: an unrecognised band simply gets no
 * stripe, which is a missing decoration rather than a wrong one.
 */
function bandOf(description: string | null): 'champions' | 'europa' | 'relegation' | null {
  if (!description) return null
  const d = description.toLowerCase()
  if (d.includes('relegation')) return 'relegation'
  if (d.includes('champions league')) return 'champions'
  if (d.includes('europa') || d.includes('conference')) return 'europa'
  return null
}

const BAND_STRIPE: Record<string, string> = {
  champions: 'bg-primary-500',
  europa: 'bg-success-500',
  relegation: 'bg-danger-500',
}

const BAND_LABEL: Record<string, string> = {
  champions: 'Champions League',
  europa: 'Europa / Conference',
  relegation: 'Relegation',
}

export default function LeagueTableTab({ rows, fetchedAt }: Props) {
  if (rows.length === 0) {
    return (
      <Card padding="lg">
        <div className="text-center py-8">
          <Icon name="list.bullet" size={40} className="mx-auto text-neutral-300 mb-3" />
          <p className="text-sm text-neutral-600 font-medium">The table isn&apos;t in yet</p>
          <p className="text-xs text-neutral-400 mt-1">
            It appears once the season&apos;s first matches have been played.
          </p>
        </div>
      </Card>
    )
  }

  // Which bands are actually present, so the key never advertises a band this
  // competition does not have.
  const bandsPresent = [...new Set(rows.map((r) => bandOf(r.description)).filter(Boolean))] as string[]

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-bold text-neutral-900">League Table</h2>
        {fetchedAt && (
          <p className="text-xs text-neutral-400">
            Updated {new Date(fetchedAt).toLocaleString('en-US', {
              weekday: 'short', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
            })}
          </p>
        )}
      </div>

      {/* Wide content scrolls inside its own container so the page body never
          scrolls sideways on a phone. */}
      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm tabular-nums">
            <thead>
              <tr className="bg-neutral-50 text-[10px] uppercase tracking-wider text-neutral-500">
                <th className="py-2.5 pl-3 pr-1 text-left font-bold w-10">#</th>
                <th className="py-2.5 px-2 text-left font-bold">Club</th>
                <th className="py-2.5 px-2 text-right font-bold w-9">P</th>
                <th className="py-2.5 px-2 text-right font-bold w-9 hidden sm:table-cell">W</th>
                <th className="py-2.5 px-2 text-right font-bold w-9 hidden sm:table-cell">D</th>
                <th className="py-2.5 px-2 text-right font-bold w-9 hidden sm:table-cell">L</th>
                <th className="py-2.5 px-2 text-right font-bold w-12">GD</th>
                <th className="py-2.5 px-2 text-right font-bold w-11">Pts</th>
                <th className="py-2.5 pl-2 pr-3 text-left font-bold hidden md:table-cell">Form</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const band = bandOf(r.description)
                return (
                  <tr key={r.club_id} className="border-t border-border-default">
                    <td className="py-2 pl-3 pr-1">
                      <div className="flex items-center gap-1.5">
                        {/* The band stripe sits on the position, where a real
                            table puts it. No band = no stripe, not a grey one. */}
                        <span
                          className={`w-[3px] h-5 rounded-full ${band ? BAND_STRIPE[band] : 'bg-transparent'}`}
                          aria-hidden="true"
                        />
                        <span className="font-bold text-neutral-900">{r.rank}</span>
                        <Movement direction={r.movement} />
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {r.crest_url && (
                          <img src={r.crest_url} alt="" className="w-5 h-5 object-contain shrink-0" />
                        )}
                        <span className="font-semibold text-neutral-900 truncate">{r.club_name}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right text-neutral-600">{r.played}</td>
                    <td className="py-2 px-2 text-right text-neutral-600 hidden sm:table-cell">{r.won}</td>
                    <td className="py-2 px-2 text-right text-neutral-600 hidden sm:table-cell">{r.drawn}</td>
                    <td className="py-2 px-2 text-right text-neutral-600 hidden sm:table-cell">{r.lost}</td>
                    <td className="py-2 px-2 text-right text-neutral-600">
                      {r.goals_diff > 0 ? `+${r.goals_diff}` : r.goals_diff}
                    </td>
                    <td className="py-2 px-2 text-right font-bold text-neutral-900">{r.points}</td>
                    <td className="py-2 pl-2 pr-3 hidden md:table-cell">
                      <Form form={r.form} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {bandsPresent.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {bandsPresent.map((b) => (
            <span key={b} className="flex items-center gap-1.5 text-xs text-neutral-500">
              <span className={`w-[3px] h-3 rounded-full ${BAND_STRIPE[b]}`} aria-hidden="true" />
              {BAND_LABEL[b]}
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-neutral-400">
        Positions, points and form come from the official feed, so deductions and
        tiebreakers match the real table.
      </p>
    </div>
  )
}

function Movement({ direction }: { direction: 'up' | 'down' | 'same' | null }) {
  if (direction === 'up') {
    return <span className="text-success-600 text-[9px] leading-none" aria-label="up">▲</span>
  }
  if (direction === 'down') {
    return <span className="text-danger-600 text-[9px] leading-none" aria-label="down">▼</span>
  }
  // `same` and unknown both render an empty slot of the SAME WIDTH, so the
  // position column does not jitter between clubs.
  return <span className="w-[7px] inline-block" aria-hidden="true" />
}

/** Most recent LAST, matching how the feed sends it and how tables print it. */
function Form({ form }: { form: string | null }) {
  if (!form) return <span className="text-neutral-300 text-xs">—</span>
  const letters = form.slice(-5).split('')
  return (
    <span className="flex items-center gap-1" aria-label={`Recent form: ${letters.join(', ')}`}>
      {letters.map((c, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`w-4 h-4 rounded-[3px] text-[9px] font-bold flex items-center justify-center ${
            c === 'W' ? 'bg-success-100 text-success-700'
              : c === 'L' ? 'bg-danger-100 text-danger-700'
              : 'bg-neutral-100 text-neutral-600'
          }`}
        >
          {c}
        </span>
      ))}
    </span>
  )
}
