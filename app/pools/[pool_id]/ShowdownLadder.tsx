'use client'

// =============================================================
// THE SHOWDOWN LEADERBOARD — a ladder, not a table
// =============================================================
// Ryan, 2026-09-04, on the phone: it should not look like the other
// leaderboards. *"Like you're fighting, like you're trying to climb."* This is
// that board on the web.
//
// ## ⚠⚠ TWO CURRENCIES, ADDED HERE — `scored_total_points` IS PICKS ONLY
//
// Migration 121's header says it plainly: `total_points` is what your picking
// scored, `duel_points` is the duel half and lives beside it. The ranker sums
// them only inside its ORDER BY — `(t.total_points + t.duel_points) DESC` — and
// no column carries both.
//
// So the headline number is `seasonTotalPoints()`, and the split under the name
// is the two as they come. The phone's copy first shipped believing the
// opposite and rendered `total − duel`, which gave a member who TIED their duel
// 250 points and 0 for picks: a subtraction cancelling a sum that had never
// happened.
//
// ## ⚠ TWO ORDERS, AND ONLY ONE OF THEM IS OURS
//
// TABLE reads `current_rank` from the engine and never sorts by points.
// `league_finalize_ranks` resolves ties through a seven-key cascade, and a
// client sort would disagree with the number printed beside it.
//
// DUELS has no stored order — nothing in the database ranks by duel points
// alone — so that one IS a client sort, and its tie-break is a product decision
// rather than an engine fact: duel points → most wins → season total. Wins
// before total because two members level on points are separated by who
// actually won rather than drew.
//
// ## What this deliberately does not carry over from `LeaderboardTab`
//
// The points count-up on a live update, and the match/bonus breakdown modal.
// The phone's board has neither, and the numbers still move — `members` is
// realtime state on `PoolDetail`, so a goal repaints this the same as it
// repaints everything else. Only the roll-up animation is gone.

import { useMemo, useState } from 'react'

import { Avatar, type AvatarPerson } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { buildDuelRecords, type DuelFormResult, type DuelRecord } from '@/lib/league/duelRecord'
import type { DuelRow } from '@/lib/league/duels'
import { seasonTotalPoints } from '@/lib/scoring/readSource'

/** One entry, as the pool page already holds it. */
export type LadderEntry = {
  entry_id: string
  entry_name: string | null
  current_rank: number | null
  previous_rank: number | null
  scored_total_points: number | null
  match_points: number | null
  bonus_points: number | null
  point_adjustment: number | null
  duel_points: number | null
  person: AvatarPerson | null
  /** Their name, as they would recognise it. */
  name: string
}

type Board = 'table' | 'duels'

type Props = {
  entries: LadderEntry[]
  duels: DuelRow[]
  /** `league_entry_totals.duel_points`, per entry. */
  duelPoints: Map<string, number>
  /** The viewer's own entries — every one of them is "you". */
  myEntryIds: Set<string>
}

const EMPTY: DuelRecord = {
  entry: '', duelPoints: 0, won: 0, tied: 0, lost: 0, byes: 0, form: [],
}

export function ShowdownLadder({ entries, duels, duelPoints, myEntryIds }: Props) {
  const [board, setBoard] = useState<Board>('table')

  const records = useMemo(() => buildDuelRecords(duels, duelPoints), [duels, duelPoints])

  const rows = useMemo(() => {
    const shaped = entries.map((e) => {
      const duel = records.get(e.entry_id) ?? EMPTY
      /**
       * ⚠ THE PICKING HALF, resolved the way the leaderboard resolves it:
       * `scored_total_points` is canonical and `total_points` is dead-legacy,
       * with match + bonus + adjustment as the fallback for an entry the engine
       * has not written yet.
       */
      const picks = e.scored_total_points
        ?? ((e.match_points ?? 0) + (e.bonus_points ?? 0) + (e.point_adjustment ?? 0))
      return {
        entry: e,
        duel,
        picks,
        // ⚠ ONE HELPER, because four surfaces forgot to add the two and this is
        // what `seasonTotalPoints` exists for.
        combined: seasonTotalPoints({ scored_total_points: picks, duel_points: duel.duelPoints }),
        isYou: myEntryIds.has(e.entry_id),
      }
    })

    if (board === 'table') {
      // ⚠ THE ENGINE'S ORDER, and it is only a SORT because the list arrives
      // unordered — the KEY is `current_rank`, never points. An entry with no
      // rank has not been scored and sits last rather than first.
      return [...shaped].sort(
        (a, b) =>
          (a.entry.current_rank ?? Number.MAX_SAFE_INTEGER) -
          (b.entry.current_rank ?? Number.MAX_SAFE_INTEGER),
      )
    }

    // Ours: duel points, then wins, then the season total.
    return [...shaped].sort(
      (a, b) =>
        b.duel.duelPoints - a.duel.duelPoints ||
        b.duel.won - a.duel.won ||
        b.combined - a.combined,
    )
  }, [entries, records, board, myEntryIds])

  return (
    <div className="space-y-4">
      {/* ⚠ PILLS, NOT A SEGMENTED CONTROL — Ryan asked for the tab strip's
          shape rather than something flipping in a corner. Two of them, because
          there are two questions: where you sit, and who is winning fights. */}
      <div className="flex gap-2">
        <BoardPill label="Table" active={board === 'table'} onClick={() => setBoard('table')} />
        <BoardPill label="Duels" active={board === 'duels'} onClick={() => setBoard('duels')} />
      </div>

      <ul className="space-y-2">
        {rows.map((r, i) => (
          <Row key={r.entry.entry_id} position={i + 1} row={r} board={board} />
        ))}
      </ul>

      {board === 'duels' && (
        // ⚠ THE BOARD SAYS WHAT IT IS, because it is not the pool's order and a
        // member reading it as one would think they were winning. Headed "Duels"
        // with no note, the two boards crown different members of the same pool
        // with nothing on screen saying which is right.
        <p className="t-detail text-muted px-1">
          Duel points only — 500 a win, 250 a draw or a bye. The pool&rsquo;s real order is
          on Table, where these are added to what your picking scored.
        </p>
      )}
    </div>
  )
}

// ------------------------------------------------------------------- a row

function Row({
  position, row, board,
}: {
  position: number
  row: {
    entry: LadderEntry
    duel: DuelRecord
    picks: number
    combined: number
    isYou: boolean
  }
  board: Board
}) {
  const { entry, duel, picks, combined, isYou } = row
  // ⚠ Gold for first, because `accent` is already the belt colour in the duel
  // band — the same idea should not arrive in a second colour two tabs on.
  const leader = position === 1

  return (
    <li
      className={`flex items-center gap-3 sm:gap-4 px-3 sm:px-5 py-3 rounded-card border transition-colors
        ${isYou
          ? 'bg-primary-500/12 border-primary-500/40'
          : 'bg-surface border-border-default'}`}
    >
      {/* ⚠ POSITION AND MOVEMENT ARE ONE BLOCK, not two children of the row. As
          siblings they each took the row's gap on both sides, so the arrow
          arrived with 12px either side and pushed the avatar a long way off the
          number. Grouped, the row's gap applies once — between the block and the
          avatar — and the two numbers sit together where they belong.

          ⚠ Both halves stay FIXED WIDTH, which is what keeps the column
          readable down the list: the arrow slot is held open even when a member
          has not moved, or their avatar would sit left of everybody else's. */}
      <span className="flex items-center gap-1 shrink-0">
        <span className={`t-num t-num-black text-base w-6 text-right tabular-nums
          ${leader ? 'text-accent-500' : 'text-muted'}`}>
          {position}
        </span>
        <span className="w-6 flex justify-center">
          <Movement current={entry.current_rank} previous={entry.previous_rank} />
        </span>
      </span>

      {entry.person
        ? <span className="shrink-0"><Avatar person={entry.person} size={32} /></span>
        : <span className="w-8 h-8 rounded-full bg-mist shrink-0" aria-hidden="true" />}

      <span className="min-w-0 flex-1">
        <span className="t-body font-bold text-ink block truncate">{entry.name}</span>
        {board === 'table' ? (
          /* The two halves as they come — no arithmetic between them. */
          <span className="t-detail text-muted block">
            {picks.toLocaleString()} picks · {duel.duelPoints.toLocaleString()} duels
          </span>
        ) : (
          <span className="t-detail text-muted block">
            {duel.won}W {duel.tied}T {duel.lost}L
            {duel.byes > 0 ? ` · ${duel.byes} bye${duel.byes === 1 ? '' : 's'}` : ''}
          </span>
        )}
      </span>

      {board === 'duels' && <Form form={duel.form} />}

      {/* ⚠ A MINIMUM WIDTH, AND IT IS WHAT ALIGNS THE FORM STRIP. Nothing after
          the name column had a width of its own on the phone, so the row packed
          to the right and every element's x depended on how many digits the
          total happened to have — a member on 250 pushed their dots ~55pt left
          of a member on 0. `min-w`, not a fixed width, so a five-figure season
          total grows the column rather than being clipped; every row grows with
          it, so the alignment holds either way. */}
      <span className="t-num t-num-black text-base text-right tabular-nums min-w-[4.5rem] shrink-0">
        {(board === 'table' ? combined : duel.duelPoints).toLocaleString()}
      </span>
    </li>
  )
}

// ------------------------------------------------------------------- parts

/**
 * Which way they moved since the last matchweek settled.
 *
 * ⚠ RANK IS LOWER-IS-BETTER, SO A FALL IN THE NUMBER IS A CLIMB. Reading it the
 * other way points every arrow at the wrong member.
 */
function Movement({ current, previous }: { current: number | null; previous: number | null }) {
  if (current === null || previous === null || current === previous) return null
  const climbed = current < previous
  return (
    <span className={`inline-flex items-center gap-0.5 t-detail
      ${climbed ? 'text-success-600' : 'text-danger-600'}`}>
      <Icon name={climbed ? 'arrow.up' : 'arrow.down'} size={10} weight="semibold" />
      {Math.abs(previous - current)}
    </span>
  )
}

/** How many duels the strip shows. Fixed, so every row is the same width. */
const FORM_SLOTS = 5

/**
 * The last five duels, as a COLUMN-ALIGNED strip.
 *
 * ⚠ ALWAYS FIVE SLOTS, PADDED AT THE FRONT. Ryan: *"can they all be aligned
 * vertically? Otherwise it's going to be hard to read."* Rendering only the
 * results a member has makes each row a different width, so the fourth duel sits
 * at a different x on every line and the strip cannot be read DOWN. With a fixed
 * grid the rightmost column is always the most recent duel and the one beside it
 * always the one before, for everybody.
 *
 * ⚠ PADDED AT THE FRONT, NOT THE BACK. The strip is anchored on the LATEST
 * duel, so a member with three results has two empty slots on the left rather
 * than trailing gaps that would push their most recent result out of the column
 * everybody else's sits in.
 */
function Form({ form }: { form: DuelFormResult[] }) {
  const slots: (DuelFormResult | null)[] = [
    ...Array<null>(Math.max(0, FORM_SLOTS - form.length)).fill(null),
    ...form.slice(-FORM_SLOTS),
  ]
  const tone = (r: DuelFormResult) =>
    r === 'won' ? 'bg-success-500'
      : r === 'lost' ? 'bg-danger-500'
        : r === 'tied' ? 'bg-accent-500'
          // ⚠ A BYE IS ITS OWN MARK. It pays what a draw pays, so colouring it
          // as one would be defensible and wrong: nobody was drawn against you,
          // and a strip that cannot say so is a record of duels you did not have.
          : 'bg-silver'
  return (
    <span className="hidden sm:flex items-center gap-1 shrink-0" aria-hidden="true">
      {slots.map((r, i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full ${r
            ? tone(r)
            // An empty slot is a faint track, not a missing dot — it holds the
            // column open and reads as "no duel here" rather than as a result.
            : 'bg-muted/20'}`}
        />
      ))}
    </span>
  )
}

function BoardPill({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`px-4 py-2 rounded-pill t-caption transition-colors
        ${active
          ? 'bg-primary-500/16 text-primary-700'
          : 'bg-mist text-muted hover:text-ink'}`}
    >
      {label}
    </button>
  )
}
