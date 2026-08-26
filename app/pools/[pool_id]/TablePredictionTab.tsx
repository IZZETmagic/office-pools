'use client'

// =============================================================
// TABLE MODE — one decision, then a season of watching it
// =============================================================
// Plan §3.6. Two screens that are really one screen at two points in time:
//
//   before the lock   drag twenty clubs into your finishing order
//   after the lock    the same list, against the real table, with the points
//                     each club is currently worth
//
// The second is the reason the mode exists. Decision 9's original objection to
// Full Table was that "done for the season in August leaves nothing to say to
// each other on a Tuesday in November" — this screen is the answer: in November
// it is a live argument, not an archive of a decision.
//
// ## Nothing here computes a score
//
// Every points figure comes from `league_table_breakdown` (migration 081). The
// per-club formula is one line and it would have been easy to inline — which is
// exactly why it is not: two copies of one formula agree until somebody changes
// a price in one of them, and then this screen quietly contradicts the
// leaderboard.
// =============================================================

import { useState, useCallback, useMemo, useId, useRef, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { LocalTime } from '@/components/LocalTime'
import { Badge } from '@/components/ui/Badge'
import type { SeasonClub, TableBreakdownRow } from '@/lib/league/table'

type Props = {
  poolId: string
  entryId: string | null
  clubs: SeasonClub[]
  /** The entry's saved ordering. Empty means they have not predicted yet. */
  savedOrder: string[]
  /** What an unpicked screen starts from — the live table, else alphabetical. */
  seededOrder: string[]
  breakdown: TableBreakdownRow[]
  lockAt: string | null
  /** How many places pay the top-band bonus. From the pool's settings. */
  topN: number
  /** How many places pay the relegation bonus. */
  relegationN: number
  /**
   * The Europa band, as RANK BOUNDS rather than a count — it does not start at
   * 1, and in Ligue 1 an unnamed qualifier sits between it and the Champions
   * League places. NULL when the competition has no Europa places.
   */
  europaFrom: number | null
  europaTo: number | null
  /** Read-only because the deadline passed — decision 11 covers joining late. */
  isLocked: boolean
  /** True when this member joined after the deadline and never got to predict. */
  joinedAfterLock: boolean
}

function bandOf(
  position: number, clubCount: number, topN: number, relegationN: number,
  europaFrom: number | null, europaTo: number | null,
) {
  if (position === 1) return 'champion' as const
  if (position <= topN) return 'top' as const
  if (europaFrom !== null && europaTo !== null && position >= europaFrom && position <= europaTo) {
    return 'europa' as const
  }
  if (position > clubCount - relegationN) return 'relegation' as const
  return null
}

const BAND_ROW: Record<string, string> = {
  champion: 'bg-warning-50/60 border-warning-200',
  top: 'bg-primary-50/50 border-primary-200',
  europa: 'bg-success-50/50 border-success-200',
  relegation: 'bg-danger-50/50 border-danger-200',
}

const BAND_STRIPE: Record<string, string> = {
  champion: 'bg-warning-500',
  top: 'bg-primary-500',
  europa: 'bg-success-500',
  relegation: 'bg-danger-500',
}

// ---------------------------------------------------------------- picking

type RowProps = {
  club: SeasonClub
  position: number
  clubCount: number
  topN: number
  relegationN: number
  europaFrom: number | null
  europaTo: number | null
}

/** The row's appearance, with no drag wiring — safe to render on the server. */
function ClubRowInner({ club, position, band }: { club: SeasonClub; position: number; band: string | null }) {
  return (
    <>
      <span className={`w-[3px] h-7 rounded-full shrink-0 ${band ? BAND_STRIPE[band] : 'bg-transparent'}`} aria-hidden="true" />
      <span className="w-6 text-sm font-bold text-neutral-900 tabular-nums shrink-0">{position}</span>
      {club.crest_url && <img src={club.crest_url} alt="" className="w-6 h-6 object-contain shrink-0" />}
      <span className="flex-1 min-w-0 text-sm font-semibold text-neutral-900 truncate">{club.club_name}</span>
      <Icon name="grip.vertical" size={16} className="text-neutral-300 shrink-0" />
    </>
  )
}

const ROW_BASE = 'flex items-center gap-2.5 px-2.5 py-2.5 rounded-xl border transition-colors touch-none'

/**
 * The server-rendered row: identical to look at, inert.
 *
 * ⚠ WHY THE LIST IS NOT SERVER-RENDERED AS DRAGGABLE. dnd-kit gives every
 * sortable node an `aria-describedby` pointing at its own screen-reader
 * instructions, and that id is React-generated. Server and client produced
 * different ones (`_R_955…` vs `_R_295…`), which React reports as a hydration
 * mismatch and — its words — "won't be patched up". The attribute therefore
 * stays pointing at an element that does not exist, so a screen-reader user
 * gets NO drag instructions at all. It is an accessibility failure wearing a
 * console warning.
 *
 * `suppressHydrationWarning` would hide it and keep the broken id, which is the
 * same mistake LocalTime's header warns about. So the list renders inert until
 * mount and draggable after — you cannot drag before hydration anyway, and this
 * way the ids are only ever generated once, on the client.
 */
function StaticClubRow({ club, position, clubCount, topN, relegationN, europaFrom, europaTo }: RowProps) {
  const band = bandOf(position, clubCount, topN, relegationN, europaFrom, europaTo)
  return (
    <div className={`${ROW_BASE} ${band ? BAND_ROW[band] : 'bg-surface-raised border-border-default'}`}>
      <ClubRowInner club={club} position={position} band={band} />
    </div>
  )
}

function SortableClubRow({ club, position, clubCount, topN, relegationN, europaFrom, europaTo }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: club.club_id })

  const band = bandOf(position, clubCount, topN, relegationN, europaFrom, europaTo)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 50 : undefined }}
      className={`${ROW_BASE}
        ${isDragging ? 'bg-primary-50 border-primary-300 shadow-lg opacity-90' : band ? BAND_ROW[band] : 'bg-surface-raised border-border-default'}`}
      {...attributes}
      {...listeners}
    >
      <ClubRowInner club={club} position={position} band={band} />
    </div>
  )
}

// ---------------------------------------------------------------- component

/** Client-only — see the LocalTime note at the call site. */
function formatDeadline(d: Date): string {
  return d.toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  })
}

function formatLockedDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function TablePredictionTab({
  poolId,
  entryId,
  clubs,
  savedOrder,
  seededOrder,
  breakdown,
  lockAt,
  topN,
  relegationN,
  europaFrom,
  europaTo,
  isLocked,
  joinedAfterLock,
}: Props) {
  const dndId = useId()
  const clubsById = useMemo(() => new Map(clubs.map((c) => [c.club_id, c])), [clubs])

  const [order, setOrder] = useState<string[]>(
    savedOrder.length > 0 ? savedOrder : seededOrder,
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [dirty, setDirty] = useState(false)

  /**
   * ⚠ HAS THIS MEMBER ACTUALLY SAVED ANYTHING?
   *
   * The button used to read `dirty ? 'Save my table' : 'Saved'`, and `dirty`
   * starts false — so a member who had never saved opened this screen, saw the
   * clubs pre-filled in live-table order (decision 12/17, so it looks exactly
   * like a real prediction), and a DISABLED button saying "Saved". Nothing on
   * the screen contradicted it. They would close the tab believing they were
   * done and score nothing when the deadline passed on Friday.
   *
   * "Saved" is a claim about the database, so it has to be answerable from the
   * database: `savedOrder` is the server-rendered truth on load, and this
   * tracks it forward when a save succeeds. Untouched-and-unsaved must offer
   * the save — accepting the seeded order with one tap is the whole point of
   * seeding it.
   */
  const [hasSaved, setHasSaved] = useState(savedOrder.length > 0)

  /** See StaticClubRow: dnd-kit's generated ids cannot survive hydration. */
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setOrder((prev) => {
      const from = prev.indexOf(active.id as string)
      const to = prev.indexOf(over.id as string)
      if (from === -1 || to === -1) return prev
      return arrayMove(prev, from, to)
    })
    setDirty(true)
    setMessage(null)
  }, [])

  /**
   * AUTOSAVE, with in-flight coalescing rather than a debounce timer.
   *
   * Twenty clubs is a lot of dragging, and making somebody hit Save after each
   * one is the kind of friction that gets a table left half-ordered. So every
   * reorder writes.
   *
   * ⚠ Coalescing, NOT debouncing, and the difference matters. A debounce holds
   * the newest state in a timer, so a member who drags and immediately closes
   * the tab — or whose phone backgrounds the page — loses the change that
   * triggered it, silently. Here the request goes out at once; if one is already
   * in flight the next is marked pending and fires the moment it returns. At
   * most one write is ever queued, the last one always wins, and there is no
   * window where the newest order exists only in a timer.
   *
   * `orderRef` is what gets sent, not the `order` closure: a save that starts
   * during a drag must post the order as it stands when the request is built,
   * not as it was when the callback was created.
   */
  const orderRef = useRef(order)
  orderRef.current = order
  const inFlight = useRef(false)
  const pending = useRef(false)

  const flush = useCallback(async () => {
    if (!entryId) return
    if (inFlight.current) {
      pending.current = true
      return
    }
    inFlight.current = true
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/pools/${poolId}/table-prediction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId, order: orderRef.current }),
      })
      const json = await res.json()
      if (!res.ok) {
        // The lock is a silent-skip trigger, so the route reports it as 403
        // rather than letting the member believe a refused write landed.
        setMessage({
          kind: 'error',
          text: json.locked
            ? 'The deadline passed while you were editing — this table is closed.'
            : json.error ?? 'That did not save.',
        })
      } else {
        setDirty(false)
        setHasSaved(true)
        setMessage(null)
      }
    } catch {
      setMessage({ kind: 'error', text: 'Not saved — check your connection. Your changes are still here.' })
    } finally {
      inFlight.current = false
      setSaving(false)
      if (pending.current) {
        pending.current = false
        void flush()
      }
    }
  }, [poolId, entryId])

  /**
   * ⚠ Only autosaves once there IS a table. A member who has never saved is
   * looking at the seeded order (the live table, decisions 12/17) — writing
   * that for them would be filing a prediction they never made, on their
   * behalf, and scoring them on it. They commit it once, deliberately; after
   * that every change is theirs and saves itself.
   */
  useEffect(() => {
    if (!dirty || !hasSaved) return
    void flush()
  }, [order, dirty, hasSaved, flush])

  // ------------------------------------------------------------ locked view
  if (isLocked) {
    return (
      <LockedView
        breakdown={breakdown}
        joinedAfterLock={joinedAfterLock}
        lockAt={lockAt}
        clubCount={clubs.length}
        topN={topN}
        relegationN={relegationN}
        europaFrom={europaFrom}
        europaTo={europaTo}
      />
    )
  }

  if (!entryId) {
    return (
      <Card padding="lg">
        <p className="text-sm text-neutral-600 text-center py-6">
          You need an entry in this pool before you can predict the table.
        </p>
      </Card>
    )
  }

  const rows = order.map((id) => clubsById.get(id)).filter(Boolean) as SeasonClub[]

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-neutral-900">Predict the table</h2>
        <p className="text-sm text-neutral-600 mt-1">
          Drag the clubs into the order you think they&apos;ll finish. You only do this once
          — then you watch it all season.
        </p>
        {lockAt && (
          <p className="text-xs text-neutral-500 mt-2">
            {/* ⚠ Formatted on the CLIENT only, via LocalTime.

                The locale here was already pinned to 'en-US' and it STILL
                mismatched: the server rendered "Fri, Aug 28 at 4:00 PM ADT" and
                the browser "Fri, Aug 28, 4:00 PM ADT". Pinning the locale does
                not pin the ICU VERSION, and Node's and the browser's disagree
                about whether a comma or the word "at" separates date from time.

                The timezone half is the real hazard, as it was in PoolInfoTab:
                this dev machine happens to be on Atlantic time, but on Vercel
                the server runtime is UTC — so a server-formatted deadline is a
                UTC deadline shown to somebody who is not in UTC. Formatting
                client-side means one runtime does it, and it is the viewer's. */}
            Closes <LocalTime iso={lockAt} format={formatDeadline} />
          </p>
        )}
      </div>

      {!mounted ? (
        <div className="space-y-1.5">
          {rows.map((club, i) => (
            <StaticClubRow
              key={club.club_id}
              club={club}
              position={i + 1}
              clubCount={rows.length}
              topN={topN}
              relegationN={relegationN}
              europaFrom={europaFrom}
              europaTo={europaTo}
            />
          ))}
        </div>
      ) : (
        <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5">
              {rows.map((club, i) => (
                <SortableClubRow
                  key={club.club_id}
                  club={club}
                  position={i + 1}
                  clubCount={rows.length}
                  topN={topN}
                  relegationN={relegationN}
                  europaFrom={europaFrom}
                  europaTo={europaTo}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* The band key — §3.6 — below the list rather than above it. Twenty rows
          is taller than a phone screen, so a key at the top has scrolled away
          by the time somebody is arranging the relegation places, which is the
          end of the table where the colours are least obvious. Here it sits
          directly under the rows it explains. */}
      <BandLegend topN={topN} europaFrom={europaFrom} />

      {/* Two different footers, because the two states are different promises.

          Before a table exists this is a COMMIT: the order on screen is the
          seeded one, and it becomes a prediction only when the member says so.
          After that it is a STATUS: every drag saves itself, and the only thing
          left to tell them is whether it landed. */}
      <div className="sticky bottom-0 pt-3 pb-1 bg-gradient-to-t from-surface-base via-surface-base to-transparent">
        {!hasSaved ? (
          <>
            <button
              type="button"
              onClick={() => void flush()}
              disabled={saving}
              className="w-full py-3 rounded-xl bg-primary-600 text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-700 transition-colors"
            >
              {saving ? 'Saving…' : 'Save my table'}
            </button>
            <p className="text-xs text-neutral-500 text-center mt-2">
              After this, every change saves on its own.
            </p>
          </>
        ) : (
          <div className="flex items-center justify-center gap-2 py-2 min-h-[2.75rem]" role="status" aria-live="polite">
            {message?.kind === 'error' ? (
              <>
                <span className="text-sm text-danger-600">{message.text}</span>
                <button
                  type="button"
                  onClick={() => void flush()}
                  className="text-sm font-semibold text-primary-600 hover:text-primary-700 underline"
                >
                  Try again
                </button>
              </>
            ) : saving || dirty ? (
              <span className="text-sm text-neutral-500">Saving…</span>
            ) : (
              <span className="text-sm text-success-700 flex items-center gap-1.5">
                <Icon name="checkmark" size={14} />
                Saved — you can keep changing it until the deadline
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * The band key.
 *
 * Kept as a component rather than inlined because the labels are DERIVED, not
 * fixed: `Top 4` is a variable and Europa is optional. Migration 089 exists
 * because those bands were once hardcoded to England's 4-and-3, so the shape
 * that reads as a constant here is the one worth keeping in one place.
 */
function BandLegend({ topN, europaFrom }: { topN: number; europaFrom: number | null }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Legend stripe={BAND_STRIPE.champion} label="Champion" />
      <Legend stripe={BAND_STRIPE.top} label={`Top ${topN}`} />
      {europaFrom !== null && <Legend stripe={BAND_STRIPE.europa} label="Europa" />}
      <Legend stripe={BAND_STRIPE.relegation} label="Relegation" />
    </div>
  )
}

function Legend({ stripe, label }: { stripe: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-neutral-500">
      <span className={`w-[3px] h-3 rounded-full ${stripe}`} aria-hidden="true" />
      {label}
    </span>
  )
}

// ---------------------------------------------------------------- locked view

function LockedView({
  breakdown,
  joinedAfterLock,
  lockAt,
  clubCount,
  topN,
  relegationN,
  europaFrom,
  europaTo,
}: {
  breakdown: TableBreakdownRow[]
  joinedAfterLock: boolean
  lockAt: string | null
  clubCount: number
  topN: number
  relegationN: number
  europaFrom: number | null
  europaTo: number | null
}) {
  // Decision 11, said plainly rather than hidden. A member who joined after the
  // deadline scores nothing on this component and is told so in one sentence —
  // the alternative, excluding it from their denominator, would make two
  // members' totals stop meaning the same thing.
  if (joinedAfterLock || breakdown.length === 0) {
    return (
      <Card padding="lg">
        <div className="text-center py-8">
          <Icon name="lock.fill" size={36} className="mx-auto text-neutral-300 mb-3" />
          <p className="text-sm font-medium text-neutral-700">
            {joinedAfterLock
              ? 'The table prediction closed before you joined'
              : 'You didn’t predict the table'}
          </p>
          <p className="text-xs text-neutral-500 mt-1.5 max-w-sm mx-auto">
            It scores nothing for you, and everything else in the pool counts as normal.
            You can still see the real table and how everyone else did.
          </p>
        </div>
      </Card>
    )
  }

  const total = breakdown.reduce((sum, r) => sum + (r.points ?? 0), 0)
  const isFinal = breakdown[0]?.is_final ?? false
  const exact = breakdown.filter((r) => r.delta === 0).length

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-bold text-neutral-900">Your table</h2>
        {lockAt && (
          <p className="text-xs text-neutral-400">
            Locked <LocalTime iso={lockAt} format={formatLockedDate} />
          </p>
        )}
      </div>

      <Card padding="md">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-2xl font-bold text-neutral-900 tabular-nums">{total.toLocaleString()}</p>
            <p className="text-xs text-neutral-500 mt-0.5">
              points from your table · {exact} exactly right
            </p>
          </div>
          {/* "Provisional" until the season-end snapshot exists — decision 9.
              The label is the honest half of scoring it live. */}
          <Badge variant={isFinal ? "green" : "gray"}>
            {isFinal ? 'Final' : 'Provisional'}
          </Badge>
        </div>
      </Card>

      <Card padding="none" className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm tabular-nums">
            <thead>
              <tr className="bg-neutral-50 text-[10px] uppercase tracking-wider text-neutral-500">
                <th className="py-2.5 pl-3 pr-1 text-left font-bold w-12">You</th>
                <th className="py-2.5 px-2 text-left font-bold">Club</th>
                <th className="py-2.5 px-2 text-right font-bold w-12">Now</th>
                <th className="py-2.5 px-2 text-right font-bold w-14">Diff</th>
                <th className="py-2.5 pl-2 pr-3 text-right font-bold w-14">Pts</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((r) => {
                const band = bandOf(r.predicted_position, clubCount, topN, relegationN, europaFrom, europaTo)
                return (
                  <tr key={r.club_id} className="border-t border-border-default">
                    <td className="py-2 pl-3 pr-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`w-[3px] h-5 rounded-full ${band ? BAND_STRIPE[band] : 'bg-transparent'}`}
                          aria-hidden="true"
                        />
                        <span className="font-bold text-neutral-900">{r.predicted_position}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {r.crest_url && <img src={r.crest_url} alt="" className="w-5 h-5 object-contain shrink-0" />}
                        <span className="font-semibold text-neutral-900 truncate">{r.club_name}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right text-neutral-600">
                      {r.actual_position ?? '—'}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <Delta delta={r.delta} />
                    </td>
                    <td className="py-2 pl-2 pr-3 text-right font-bold text-neutral-900">
                      {r.points ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-neutral-400">
        {isFinal
          ? 'The season is over — these are the final positions.'
          : 'Positions move every matchweek, so this total is provisional until the season ends.'}
      </p>
    </div>
  )
}

/**
 * How far off you are, in the direction a football follower reads it: a club
 * finishing HIGHER than you said is a positive surprise, so it shows green.
 */
function Delta({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-neutral-300">—</span>
  if (delta === 0) return <span className="text-success-600 font-semibold">exact</span>
  const better = delta < 0
  return (
    <span className={better ? 'text-success-600' : 'text-danger-600'}>
      {better ? '▲' : '▼'} {Math.abs(delta)}
    </span>
  )
}
