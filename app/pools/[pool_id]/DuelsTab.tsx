'use client'

// =============================================================
// SHOWDOWN — your duel, your record, and who you play next
// =============================================================
// The mode's whole appeal is that a 38-week parallel pick'em becomes a personal
// league: by November you have a named rival and a head-to-head record.
//
// ## Why the fixture list is shown in advance
//
// Because it exists in advance. The pairing is a round-robin drawn at pool
// creation rather than a weekly random draw, and that choice was forced by gate
// 5 — every element of uncertainty must be inherited from the sport, and who you
// happen to draw is our dice. Publishing it is the honest half of that: a
// schedule we have already computed and withhold is a different kind of
// manipulation. It also happens to be better, because a rival you can see coming
// for three weeks is more anticipation than one you learn about on Monday.
//
// ## Nothing here computes a score
//
// Points come from `league_duels`, written by `league_score_duels` when the
// matchweek is both fully played and fully scored.
// =============================================================

import { useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import type { DuelRow } from '@/lib/league/duels'

type Props = {
  duels: DuelRow[]
  /** entry_id → display name, for both sides of every duel. */
  entryNames: Map<string, string>
  /** The viewer's own entries, so their duels can be picked out. */
  ownEntryIds: string[]
  /** The matchweek currently open, so "this week" means something. */
  currentMatchweek: number | null
  /** Duel points per entry, from the leaderboard read. */
  duelPoints: Map<string, number>
}

type Side = { entry: string; points: number | null; accuracy: number | null }

export default function DuelsTab({
  duels,
  entryNames,
  ownEntryIds,
  currentMatchweek,
  duelPoints,
}: Props) {
  const own = useMemo(() => new Set(ownEntryIds), [ownEntryIds])

  /** Every duel the viewer is in, oriented so "you" is always the first side. */
  const mine = useMemo(() => {
    const out: Array<{
      duel: DuelRow
      you: Side
      them: Side | null
      matchweek: number
    }> = []
    for (const d of duels) {
      const iAmA = own.has(d.entry_a)
      const iAmB = d.entry_b !== null && own.has(d.entry_b)
      if (!iAmA && !iAmB) continue
      const you: Side = iAmA
        ? { entry: d.entry_a, points: d.points_a, accuracy: d.accuracy_a }
        : { entry: d.entry_b as string, points: d.points_b, accuracy: d.accuracy_b }
      const them: Side | null = iAmA
        ? (d.entry_b ? { entry: d.entry_b, points: d.points_b, accuracy: d.accuracy_b } : null)
        : { entry: d.entry_a, points: d.points_a, accuracy: d.accuracy_a }
      out.push({ duel: d, you, them, matchweek: d.matchweek_number })
    }
    return out.sort((a, b) => a.matchweek - b.matchweek)
  }, [duels, own])

  const record = useMemo(() => {
    let won = 0, drawn = 0, lost = 0, byes = 0
    for (const m of mine) {
      if (!m.duel.settled_at) continue
      if (!m.them) { byes++; continue }
      if (m.you.points === 3) won++
      else if (m.you.points === 1) drawn++
      else lost++
    }
    return { won, drawn, lost, byes }
  }, [mine])

  const thisWeek = useMemo(
    () => (currentMatchweek === null ? null : mine.find((m) => m.matchweek === currentMatchweek) ?? null),
    [mine, currentMatchweek],
  )
  const next = useMemo(
    () => mine.filter((m) => !m.duel.settled_at && (currentMatchweek === null || m.matchweek > currentMatchweek)).slice(0, 4),
    [mine, currentMatchweek],
  )

  // The duel table — everyone, by duel points. Built from the duels themselves
  // so it cannot disagree with the fixture list beside it.
  const table = useMemo(() => {
    const rows = new Map<string, { entry: string; w: number; d: number; l: number; pts: number }>()
    const ensure = (e: string) => {
      if (!rows.has(e)) rows.set(e, { entry: e, w: 0, d: 0, l: 0, pts: 0 })
      return rows.get(e)!
    }
    for (const duel of duels) {
      ensure(duel.entry_a)
      if (duel.entry_b) ensure(duel.entry_b)
      if (!duel.settled_at) continue
      for (const [e, p] of [[duel.entry_a, duel.points_a], [duel.entry_b, duel.points_b]] as const) {
        if (!e || p === null) continue
        const r = ensure(e)
        if (p === 3) r.w++
        else if (p === 1) r.d++
        else r.l++
      }
    }
    for (const r of rows.values()) r.pts = duelPoints.get(r.entry) ?? r.w * 3 + r.d
    return [...rows.values()].sort((a, b) => b.pts - a.pts || b.w - a.w)
  }, [duels, duelPoints])

  const name = (e: string | null) => (e ? entryNames.get(e) ?? 'Unknown' : 'Bye')

  if (duels.length === 0) {
    return (
      <Card padding="lg">
        <div className="text-center py-8">
          <Icon name="arrow.triangle.merge" size={40} className="mx-auto text-neutral-300 mb-3" />
          <p className="text-sm text-neutral-600 font-medium">No duels yet</p>
          <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
            The fixture list is drawn once there are two members. Invite someone and it appears.
          </p>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-neutral-900">Your duels</h2>
        <p className="text-sm text-neutral-600 mt-1">
          Every matchweek you face one member. Beat their score for three points, tie for one.
        </p>
      </div>

      {/* This week */}
      {thisWeek && (
        <Card padding="md">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-2.5">
            Matchweek {thisWeek.matchweek}
          </p>
          {thisWeek.them ? (
            <div className="flex items-center gap-3">
              <Fighter label="You" name={name(thisWeek.you.entry)} accuracy={thisWeek.you.accuracy} align="left" />
              <span className="text-xs font-bold text-neutral-400 shrink-0">v</span>
              <Fighter label="Them" name={name(thisWeek.them.entry)} accuracy={thisWeek.them.accuracy} align="right" />
            </div>
          ) : (
            <p className="text-sm text-neutral-600">
              You sit this one out. With an odd number of members somebody has a bye each
              week — it rotates, so everyone gets the same number.
            </p>
          )}
          {thisWeek.duel.settled_at && thisWeek.them && (
            <p className="text-xs text-neutral-500 mt-3 pt-3 border-t border-border-default">
              {thisWeek.you.points === 3 ? 'You won this duel — three points.'
                : thisWeek.you.points === 1 ? 'A tie — one point each.'
                : 'They took this one.'}
            </p>
          )}
        </Card>
      )}

      {/* Record */}
      <Card padding="md">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-baseline gap-4 tabular-nums">
            <Stat label="Won" value={record.won} />
            <Stat label="Tied" value={record.drawn} />
            <Stat label="Lost" value={record.lost} />
            {record.byes > 0 && <Stat label="Byes" value={record.byes} />}
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-neutral-900 tabular-nums">
              {record.won * 3 + record.drawn}
            </p>
            <p className="text-xs text-neutral-500">duel points</p>
          </div>
        </div>
      </Card>

      {/* Who you play next — the payoff of a published fixture list */}
      {next.length > 0 && (
        <Card padding="md">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-2.5">
            Coming up
          </p>
          <ul className="space-y-1.5">
            {next.map((m) => (
              <li key={m.duel.duel_id} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-neutral-500 tabular-nums w-14 shrink-0">MW {m.matchweek}</span>
                <span className="flex-1 min-w-0 font-semibold text-neutral-900 truncate">
                  {m.them ? name(m.them.entry) : 'Bye'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* The duel table */}
      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[380px] text-sm tabular-nums">
            <thead>
              <tr className="bg-neutral-50 text-[10px] uppercase tracking-wider text-neutral-500">
                <th className="py-2.5 pl-3 pr-1 text-left font-bold w-8">#</th>
                <th className="py-2.5 px-2 text-left font-bold">Member</th>
                <th className="py-2.5 px-2 text-right font-bold w-9">W</th>
                <th className="py-2.5 px-2 text-right font-bold w-9">T</th>
                <th className="py-2.5 px-2 text-right font-bold w-9">L</th>
                <th className="py-2.5 pl-2 pr-3 text-right font-bold w-11">Pts</th>
              </tr>
            </thead>
            <tbody>
              {table.map((r, i) => (
                <tr
                  key={r.entry}
                  className={`border-t border-border-default ${own.has(r.entry) ? 'bg-primary-50/40' : ''}`}
                >
                  <td className="py-2 pl-3 pr-1 font-bold text-neutral-900">{i + 1}</td>
                  <td className="py-2 px-2 font-semibold text-neutral-900 truncate">{name(r.entry)}</td>
                  <td className="py-2 px-2 text-right text-neutral-600">{r.w}</td>
                  <td className="py-2 px-2 text-right text-neutral-600">{r.d}</td>
                  <td className="py-2 px-2 text-right text-neutral-600">{r.l}</td>
                  <td className="py-2 pl-2 pr-3 text-right font-bold text-neutral-900">{r.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-neutral-400">
        The fixture list is drawn when the pool is created and everyone plays everyone
        the same number of times. It changes only when someone joins or leaves, and never
        for a matchweek already played.
      </p>
    </div>
  )
}

function Fighter({
  label, name, accuracy, align,
}: { label: string; name: string; accuracy: number | null; align: 'left' | 'right' }) {
  return (
    <div className={`flex-1 min-w-0 ${align === 'right' ? 'text-right' : ''}`}>
      <p className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold">{label}</p>
      <p className="text-sm font-bold text-neutral-900 truncate">{name}</p>
      {accuracy !== null && (
        <p className="text-xs text-neutral-500 tabular-nums">{accuracy} pts</p>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="flex flex-col">
      <span className="text-lg font-bold text-neutral-900">{value}</span>
      <span className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">{label}</span>
    </span>
  )
}
