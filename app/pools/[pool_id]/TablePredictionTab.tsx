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
import { useRouter } from 'next/navigation'
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
import { TableBreakdownView, type TablePrices } from './TableBreakdownView'
import type { SeasonClub, TableBreakdownRow } from '@/lib/league/table'

type Props = {
  poolId: string
  entryId: string | null
  clubs: SeasonClub[]
  /** The entry's saved ordering. Empty means they have not predicted yet. */
  savedOrder: string[]
  /** When that ordering was last written, server-stamped. Null if never. */
  savedAt: string | null
  /**
   * What an unpicked screen starts from — ALPHABETICAL, always. Never the live
   * table: every first-time screen has to be the same screen. See `seedOrder`.
   */
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
  /**
   * The Conference band, same shape and same rule (migration 113). NULL until
   * the feed names it — which for England is not until the cups resolve, so
   * this band appears during the season rather than at the start of it.
   */
  conferenceFrom: number | null
  conferenceTo: number | null
  /** Read-only because the deadline passed — decision 11 covers joining late. */
  isLocked: boolean
  /** True when this member joined after the deadline and never got to predict. */
  joinedAfterLock: boolean
  /** Band bonus values, so the locked view can show how a total is made up. */
  prices: TablePrices
  /**
   * Report a successful save upward. PoolDetail unmounts this tab when the
   * member switches away, so the parent has to hold what landed — otherwise
   * coming back re-seeds `order` from the page-load snapshot and the save
   * looks lost. See the note on `tableSaved` in PoolDetail.
   */
  onSaved?: (order: string[], savedAt: string | null) => void
}

export function bandOf(
  position: number, clubCount: number, topN: number, relegationN: number,
  europaFrom: number | null, europaTo: number | null,
  conferenceFrom: number | null = null, conferenceTo: number | null = null,
) {
  if (position === 1) return 'champion' as const
  if (position <= topN) return 'top' as const
  if (europaFrom !== null && europaTo !== null && position >= europaFrom && position <= europaTo) {
    return 'europa' as const
  }
  if (conferenceFrom !== null && conferenceTo !== null
      && position >= conferenceFrom && position <= conferenceTo) {
    return 'conference' as const
  }
  if (position > clubCount - relegationN) return 'relegation' as const
  return null
}

/**
 * ⚠ Conference is a LIGHTER STEP OF THE EUROPA GREEN, not a fifth hue. Four
 * band colours are already in play and the only unused token family is
 * `accent`, which is gold — a neighbour of the amber that marks the champion.
 * Shading the third European competition as a rung below the second says what
 * it actually is, and is how printed league tables have always done it.
 */
const BAND_ROW: Record<string, string> = {
  champion: 'bg-warning-50/60 border-warning-200',
  top: 'bg-primary-50/50 border-primary-200',
  europa: 'bg-success-50/50 border-success-200',
  conference: 'bg-success-50/30 border-success-100',
  relegation: 'bg-danger-50/50 border-danger-200',
}

export const BAND_STRIPE: Record<string, string> = {
  champion: 'bg-warning-500',
  top: 'bg-primary-500',
  europa: 'bg-success-500',
  conference: 'bg-success-300',
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
  conferenceFrom: number | null
  conferenceTo: number | null
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
function StaticClubRow({ club, position, clubCount, topN, relegationN, europaFrom, europaTo, conferenceFrom, conferenceTo }: RowProps) {
  const band = bandOf(position, clubCount, topN, relegationN, europaFrom, europaTo, conferenceFrom, conferenceTo)
  return (
    <div className={`${ROW_BASE} ${band ? BAND_ROW[band] : 'bg-surface-raised border-border-default'}`}>
      <ClubRowInner club={club} position={position} band={band} />
    </div>
  )
}

function SortableClubRow({ club, position, clubCount, topN, relegationN, europaFrom, europaTo, conferenceFrom, conferenceTo }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: club.club_id })

  const band = bandOf(position, clubCount, topN, relegationN, europaFrom, europaTo, conferenceFrom, conferenceTo)

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
  savedAt: initialSavedAt,
  seededOrder,
  breakdown,
  lockAt,
  topN,
  relegationN,
  europaFrom,
  europaTo,
  conferenceFrom,
  conferenceTo,
  isLocked,
  joinedAfterLock,
  prices,
  onSaved,
}: Props) {
  const dndId = useId()
  const router = useRouter()
  const clubsById = useMemo(() => new Map(clubs.map((c) => [c.club_id, c])), [clubs])

  /**
   * THE DEADLINE ARRIVING WHILE THE PAGE IS OPEN.
   *
   * `isLocked` is computed on the server at render, so a reload after the
   * deadline is already read-only and the trigger from migration 078 refuses
   * the write regardless. What was missing is the member sitting on this screen
   * as the clock passes: they went on dragging against a table that was already
   * closed, and only found out when a save came back 403.
   *
   * This asks the SERVER to decide rather than flipping a local flag. Locked is
   * server state — and the locked screen needs the scoring breakdown, which
   * only a server render has. Flipping locally would show a member who DID
   * predict the "you didn't predict the table" card, because their breakdown
   * had not been fetched.
   *
   * ⚠ Re-armed hourly instead of once at the deadline: setTimeout takes a
   * 32-bit delay, so anything beyond ~24.8 days overflows and fires
   * IMMEDIATELY — a table closing next season would lock itself on load.
   */
  useEffect(() => {
    if (isLocked || !lockAt) return
    const deadline = new Date(lockAt).getTime()
    if (Number.isNaN(deadline)) return

    const HOUR = 60 * 60 * 1000
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        router.refresh()
        return
      }
      timer = setTimeout(tick, Math.min(remaining, HOUR))
    }
    tick()
    return () => clearTimeout(timer)
  }, [isLocked, lockAt, router])

  const [order, setOrder] = useState<string[]>(
    savedOrder.length > 0 ? savedOrder : seededOrder,
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [dirty, setDirty] = useState(false)

  /**
   * ⚠ HAS THIS MEMBER ACTUALLY SAVED ANYTHING?
   *
   * There is no longer a Save button — dragging is the only verb on this
   * screen, and every drag writes. What survives is the QUESTION the button
   * used to answer, because the failure it guarded against is still real: the
   * clubs arrive pre-filled (alphabetically — see `seedOrder`), so an untouched
   * screen looks exactly like a filed prediction. A member who reads it that
   * way closes the tab believing they are done, and scores nothing when the
   * deadline passes on Friday.
   *
   * So this is what the status line up top reports — "not saved yet" until
   * there is a row in the database, "Saved <time>" after. "Saved" is a claim
   * about the database and has to be answerable from it: `savedOrder` is the
   * server-rendered truth on load, and this tracks it forward on each success.
   */
  const [hasSaved, setHasSaved] = useState(savedOrder.length > 0)

  /** Server-stamped, never the browser's clock — see TableSaveResult.savedAt. */
  const [savedAt, setSavedAt] = useState<string | null>(initialSavedAt)

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

  /**
   * Held in a ref so `flush` keeps its [poolId, entryId] deps. The parent
   * passes an inline arrow, which is a new function every render; in the
   * dependency list it would rebuild `flush`, and `flush` is a dependency of
   * the autosave effect — so every parent render would fire another save.
   */
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved

  /**
   * ⚠ TELL THE REST OF THE PAGE THE SCORE MOVED — once per burst, not per drag.
   *
   * Reordering the table changes what it is worth, and the API now rescores on
   * every save so the database is right immediately. The LEADERBOARD is not:
   * it is server-rendered, so switching to that tab without reloading still
   * showed the total from page load. That is the second half of Ryan seeing
   * 1,000 on the leaderboard and 860 in the breakdown — fixing the engine alone
   * left the screen disagreeing with itself.
   *
   * `router.refresh()` re-runs the server component and is the only thing that
   * corrects it. It is also expensive on this page, and autosave fires on every
   * drag — so the timer RESETS on each save and fires once the member stops.
   * Dragging six clubs costs one refresh, not six.
   *
   * Safe against in-progress edits: `order` is seeded in a useState initialiser
   * that does not re-run on a prop change, and PoolDetail's `tableSaved` is
   * state rather than derived, so neither is clobbered by fresher props.
   */
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => router.refresh(), 2500)
  }, [router])
  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
  }, [])

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
        if (json.savedAt) setSavedAt(json.savedAt)
        setMessage(null)
        // `orderRef`, not `order`: this closure was made before the drag that
        // triggered it, and the ref is what the request actually carried.
        onSavedRef.current?.(orderRef.current, json.savedAt ?? null)
        scheduleRefresh()
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
  }, [poolId, entryId, scheduleRefresh])

  /**
   * ⚠ THE GATE IS `dirty`, AND IT HAS TO STAY THAT WAY.
   *
   * This used to require `hasSaved` as well, so the first table was committed
   * by a button and only later drags saved themselves. The button is gone —
   * dragging is the whole interface now — but the reason it existed is not, and
   * `dirty` is what carries it: a member who has never saved is looking at the
   * SEEDED order (alphabetical — see `seedOrder`), not at anything they chose.
   * Writing that on mount would file a prediction they never made and score
   * them on it — and would make "opened the tab once" indistinguishable from
   * "predicted", which is the one thing this table has to be able to tell apart.
   *
   * `dirty` only turns true in `handleDragEnd`, so nothing is written until the
   * member moves a club. That first drag files the whole order, the nineteen
   * untouched positions included — which is correct: they are looking at the
   * list, and leaving a club where it sits is a choice about that club.
   */
  useEffect(() => {
    if (!dirty) return
    void flush()
  }, [order, dirty, flush])

  // ------------------------------------------------------------ locked view
  if (isLocked) {
    return (
      <LockedView
        prices={prices}
        breakdown={breakdown}
        joinedAfterLock={joinedAfterLock}
        lockAt={lockAt}
        clubCount={clubs.length}
        topN={topN}
        relegationN={relegationN}
        europaFrom={europaFrom}
        europaTo={europaTo}
        conferenceFrom={conferenceFrom}
        conferenceTo={conferenceTo}
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
          Drag the clubs into the order you think they&apos;ll finish — it saves as you go.
          You only do this once, then you watch it all season.
        </p>
        {/* The two facts about time, on one line: when it closes, and when it
            last saved. `ml-auto` rather than `justify-between` so the status
            still sits right when there is no deadline to sit opposite. */}
        <div className="flex items-center gap-3 mt-2">
          {lockAt && (
            <p className="text-xs text-neutral-500">
              {/* ⚠ Formatted on the CLIENT only, via LocalTime.

                  The locale here was already pinned to 'en-US' and it STILL
                  mismatched: the server rendered "Fri, Aug 28 at 4:00 PM ADT"
                  and the browser "Fri, Aug 28, 4:00 PM ADT". Pinning the locale
                  does not pin the ICU VERSION, and Node's and the browser's
                  disagree about whether a comma or the word "at" separates date
                  from time.

                  The timezone half is the real hazard, as it was in PoolInfoTab:
                  this dev machine happens to be on Atlantic time, but on Vercel
                  the server runtime is UTC — so a server-formatted deadline is a
                  UTC deadline shown to somebody who is not in UTC. Formatting
                  client-side means one runtime does it, and it is the viewer's. */}
              Closes <LocalTime iso={lockAt} format={formatDeadline} />
            </p>
          )}
          <div className="ml-auto">
            <SaveStatus
              hasSaved={hasSaved}
              saving={saving}
              dirty={dirty}
              savedAt={savedAt}
              message={message}
              onRetry={() => void flush()}
            />
          </div>
        </div>
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
              conferenceFrom={conferenceFrom}
              conferenceTo={conferenceTo}
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
                  conferenceFrom={conferenceFrom}
                  conferenceTo={conferenceTo}
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
      <BandLegend topN={topN} europaFrom={europaFrom} conferenceFrom={conferenceFrom} />

      {/* ⚠ THERE IS NO SAVE BUTTON, AND THAT IS THE DESIGN.
          Ryan's call: the only verb on this screen is dragging, and a table is
          finished when the deadline says so, not when somebody presses a thing.
          A commit button on a screen that already autosaves every other change
          was one rule for the first drag and another for the rest of them.

          What the button was ALSO carrying is the un-filed state, and that has
          not gone away — a never-touched screen shows the alphabetical seed and
          still reads like a real prediction. It moved to `SaveStatus`, which
          says so in words instead of implying it with a disabled control. Don't
          put a button back here; if the un-filed state needs to be louder, make
          the status line louder. */}
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
function BandLegend({ topN, europaFrom, conferenceFrom }: {
  topN: number; europaFrom: number | null; conferenceFrom: number | null
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Legend stripe={BAND_STRIPE.champion} label="Champion" />
      <Legend stripe={BAND_STRIPE.top} label={`Top ${topN}`} />
      {europaFrom !== null && <Legend stripe={BAND_STRIPE.europa} label="Europa" />}
      {conferenceFrom !== null && <Legend stripe={BAND_STRIPE.conference} label="Conference" />}
      <Legend stripe={BAND_STRIPE.relegation} label="Relegation" />
    </div>
  )
}

/**
 * Client-only, via LocalTime — so `new Date()` here is the VIEWER's clock, and
 * "today" means their today.
 */
function formatSavedAt(d: Date): string {
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  return sameDay
    ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/**
 * "Saved", with the time it was saved — right-aligned, on the deadline line.
 *
 * ⚠ The live region is the WRAPPER and is always mounted. Putting
 * `role="status"` on the branches instead would mean each state change
 * unmounts one region and mounts another, and a freshly-mounted live region
 * does not reliably announce its initial contents — the save would go
 * unannounced to exactly the people relying on it.
 */
function SaveStatus({
  hasSaved, saving, dirty, savedAt, message, onRetry,
}: {
  hasSaved: boolean
  saving: boolean
  dirty: boolean
  savedAt: string | null
  message: { kind: 'ok' | 'error'; text: string } | null
  onRetry: () => void
}) {
  return (
    <div
      className="shrink-0 flex items-center gap-1.5 text-xs min-h-[1.5rem]"
      role="status"
      aria-live="polite"
    >
      {message?.kind === 'error' ? (
        <>
          <span className="text-danger-600 font-medium">Not saved</span>
          <button
            type="button"
            onClick={onRetry}
            className="font-semibold text-primary-600 hover:text-primary-700 underline"
          >
            Try again
          </button>
        </>
      ) : saving || dirty ? (
        <span className="text-neutral-500">Saving…</span>
      ) : !hasSaved ? (
        /* ⚠ NOT styled as quiet grey, and not `null`.
           With the Save button gone this is the only thing on the screen that
           distinguishes "I have filed my table" from "I am looking at the live
           table somebody seeded for me". Grey reads as a caption and gets
           skipped; amber reads as something outstanding, which it is. It is
           still not a control — there is nothing to press, and the member
           clears it by dragging. */
        <span className="flex items-center gap-1.5 text-warning-700 font-medium">
          <Icon name="exclamationmark.circle.fill" size={13} />
          Not saved yet
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-success-700">
          <Icon name="checkmark" size={13} />
          {savedAt ? (
            <>
              Saved <LocalTime iso={savedAt} format={formatSavedAt} />
            </>
          ) : (
            'Saved'
          )}
        </span>
      )}
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
  prices,
  topN,
  relegationN,
  europaFrom,
  europaTo,
  conferenceFrom,
  conferenceTo,
}: {
  breakdown: TableBreakdownRow[]
  joinedAfterLock: boolean
  lockAt: string | null
  clubCount: number
  topN: number
  relegationN: number
  europaFrom: number | null
  europaTo: number | null
  conferenceFrom: number | null
  conferenceTo: number | null
  prices: TablePrices
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

      {/* The presentation lives in TableBreakdownView so that this screen and
          the one showing a RIVAL's table cannot drift apart. */}
      <TableBreakdownView
        breakdown={breakdown}
        topN={topN}
        prices={prices}
        bandOf={(position) => bandOf(position, clubCount, topN, relegationN, europaFrom, europaTo, conferenceFrom, conferenceTo)}
        bandStripe={BAND_STRIPE}
        ownerLabel="You"
      />
    </div>
  )
}

