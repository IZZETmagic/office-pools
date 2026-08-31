'use client'

// =============================================================
// SHOWDOWN — your duel, your record, and who you play next
// =============================================================
// The mode's whole appeal is that a 38-week parallel pick'em becomes a personal
// league: by November you have a named rival and a head-to-head record.
//
// ## ⚠ THE DRAW IS SEALED — this tab used to argue the opposite
//
// It used to carry a section headed "Why the fixture list is shown in advance",
// ending "a schedule we have already computed and withhold is a different kind
// of manipulation". Ryan overturned that on 2026-08-30: the draw is hidden and
// opens one matchweek at a time, so who you are playing is a surprise each week.
//
// What did NOT change is the round-robin. Gate 5 was satisfied by drawing a
// rotation rather than pairing at random each week — nobody faces the strong
// pickers more often than anybody else — and hiding *when you learn* the pairing
// changes no outcome. What changed is disclosure, and that is handled by saying
// plainly what happens: the season is drawn at pool creation and opens weekly.
// See `leagueModeInfo.ts`, which carries the sentence a member actually reads.
//
// ## Two things this tab no longer shows
//
// The season fixture list and the "Coming up" list of future opponents. They are
// not hidden here — they are NOT IN THE PROPS. Migration 116's RLS policy
// withholds the rows, so `duels` contains only matchweeks that have opened. Do
// not add them back: this component could not render them if it tried.
//
// That is also why `sealedMatchweek` and `sealedOpensAfter` are passed
// separately: the sealed card needs numbers that no longer arrive with the
// duels, because the whole point is that those rows are gone.
//
// ## ⚠ ONE DUEL AT A TIME (migration 119)
//
// A duel opens when the matchweek BEFORE it settles, so through a matchweek
// there is exactly one live duel and the next opponent is not knowable. The
// `open` card below therefore renders only BETWEEN rounds — once your duel is
// decided and before the next one locks. Nothing here enforces that; it falls
// out of RLS withholding the rows, which is the right place for it.
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
  /**
   * The matchweek open for PICKS. Null once the season is over.
   *
   * ⚠ NOT the same week as the duel being played, and this tab used to be given
   * only this one. MW2 locks at its own first kickoff on the Friday, so all
   * weekend "this week's duel" was MW3 — the one nobody had played yet — while
   * the duel that was actually being decided sat further down the page under
   * "Coming up". Ryan caught the same conflation on the pools-list tile.
   */
  openMatchweek: number | null
  /** The matchweek being played right now. Null between rounds. */
  inPlayMatchweek: number | null
  /**
   * The first matchweek still SEALED, and the matchweek that has to FINISH
   * before it opens (migration 119). Null at the end of the season.
   */
  sealedMatchweek: number | null
  sealedOpensAfter: number | null
  /** Duel points per entry, from the leaderboard read. */
  duelPoints: Map<string, number>
}

type Side = { entry: string; points: number | null; accuracy: number | null }

export default function DuelsTab({
  duels,
  entryNames,
  ownEntryIds,
  openMatchweek,
  inPlayMatchweek,
  sealedMatchweek,
  sealedOpensAfter,
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

  /**
   * The two duels that are actually happening, in that order.
   *
   * ⚠ THESE ARE DIFFERENT WEEKS FOR MOST OF THE WEEKEND, and collapsing them is
   * a mistake this tab has now made twice. `inPlayMatchweek` is being played;
   * `openMatchweek` is the one you can still pick. From Friday's kickoff to
   * Sunday night both exist at once.
   *
   * The first version of this file showed only the in-play one and left the
   * open one in a "Coming up" list. Sealing the draw deleted that list — so the
   * duel you were actively picking for stopped appearing anywhere, even though
   * its rows are revealed and in the payload. Caught in the browser on the
   * seeded pool: matchweek 2 was on screen, matchweek 4 was on screen as
   * sealed, and matchweek 3 — the one being picked — was nowhere.
   *
   * So both render, always, and each says which it is.
   */
  const inPlay = useMemo(
    () => (inPlayMatchweek === null ? null : mine.find((m) => m.matchweek === inPlayMatchweek) ?? null),
    [mine, inPlayMatchweek],
  )
  const open = useMemo(
    () =>
      openMatchweek === null || openMatchweek === inPlayMatchweek
        ? null
        : mine.find((m) => m.matchweek === openMatchweek) ?? null,
    [mine, openMatchweek, inPlayMatchweek],
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
            The draw is made once there are two members, and your first opponent opens with the
            matchweek. Invite someone and it appears.
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
          One duel at a time. You face one member each matchweek, and your next opponent is
          revealed once the current duel is decided — or a day before you pick, whichever comes
          first. Beat their score for three points, tie for one.
        </p>
      </div>

      {/* Being played now, then the one you are still picking. Both, because
          they are different weeks all weekend. */}
      {inPlay && <DuelPanel m={inPlay} state="playing" name={name} />}
      {open && <DuelPanel m={open} state="picking" name={name} />}

      {/* What is coming, without saying who — the payoff of a sealed draw.
          There is no row for this matchweek in `duels`; RLS withheld it. */}
      {sealedMatchweek !== null && (
        <Card padding="md">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-2.5">
            Matchweek {sealedMatchweek}
          </p>
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold">You</p>
              <p className="text-sm font-bold text-neutral-900 truncate">
                {ownEntryIds.length > 0 ? name(ownEntryIds[0]) : 'You'}
              </p>
            </div>
            <span className="text-xs font-bold text-neutral-400 shrink-0">v</span>
            <div className="flex-1 min-w-0 text-right">
              <p className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold">Sealed</p>
              <div className="ml-auto h-4 w-20 rounded bg-neutral-200" aria-hidden="true" />
            </div>
          </div>
          <p className="text-xs text-neutral-500 mt-3 pt-3 border-t border-border-default">
            {/* Say the mechanism, not a mood. The draw really was made at pool
                creation; claiming a weekly pairing is the sentence that would
                fail the disclosure gate. */}
            {sealedOpensAfter !== null ? (
              <>Your matchweek {sealedMatchweek} opponent is revealed once matchweek{' '}
              {sealedOpensAfter} is decided — or a day before you pick, whichever comes first.</>
            ) : (
              <>Your matchweek {sealedMatchweek} opponent is revealed once the current duel is
              decided — or a day before you pick, whichever comes first.</>
            )}
          </p>
        </Card>
      )}

      {/* Record — AFTER the three duel cards, not between them. Playing, picking
          and sealed are one timeline and a stats block in the middle breaks it. */}
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
        The draw is made when the pool is created and rotates, so everybody meets everybody —
        but it opens one matchweek at a time. It changes only when someone joins or leaves, and
        never for a matchweek that has already opened.
      </p>
    </div>
  )
}

/**
 * One duel, with the week it belongs to and what is happening in it.
 *
 * Rendered for the in-play week and the open week both, so the heading has to
 * carry which is which — without it the two cards are identical and the member
 * cannot tell the games being played from the games they are still picking.
 */
function DuelPanel({
  m, state, name,
}: {
  m: { duel: DuelRow; you: Side; them: Side | null; matchweek: number }
  state: 'playing' | 'picking'
  name: (e: string | null) => string
}) {
  return (
    <Card padding="md">
      <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-2.5">
        Matchweek {m.matchweek}
        <span className="ml-1.5 font-semibold text-neutral-400 normal-case tracking-normal">
          {state === 'playing' ? '· being played now' : '· you are picking this one'}
        </span>
      </p>
      {m.them ? (
        <div className="flex items-center gap-3">
          <Fighter label="You" name={name(m.you.entry)} accuracy={m.you.accuracy} align="left" />
          <span className="text-xs font-bold text-neutral-400 shrink-0">v</span>
          <Fighter label="Them" name={name(m.them.entry)} accuracy={m.them.accuracy} align="right" />
        </div>
      ) : (
        <p className="text-sm text-neutral-600">
          You sit this one out. With an odd number of members somebody has a bye each
          week — it rotates, so everyone gets the same number.
        </p>
      )}
      {m.duel.settled_at && m.them && (
        <p className="text-xs text-neutral-500 mt-3 pt-3 border-t border-border-default">
          {m.you.points === 3 ? 'You won this duel — three points.'
            : m.you.points === 1 ? 'A tie — one point each.'
            : 'They took this one.'}
        </p>
      )}
    </Card>
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
