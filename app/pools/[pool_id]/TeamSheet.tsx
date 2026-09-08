'use client'

// =============================================================
// THE TEAM SHEET — both sides' picks, fixture by fixture
// =============================================================
// Lifted out of `DuelsTab` on 2026-09-07 so The Room can render the SAME sheet
// rather than a thinner one beside it.
//
// ⚠ THIS IS THE MISTAKE THE PHONE ALREADY MADE AND UNDID. RN's Room shipped
// with its own version — a chip either side of "ARS v CHE" as one grey string,
// no crest, no scoreline, no kickoff — and it drifted the moment the Duel tab's
// row grew. A member switching between the two tabs is comparing them directly,
// so the two surfaces have to BE the same component, not agree by hand.
//
// ⚠ MARKUP ONLY. The rule that decides who took a fixture lives in
// `lib/league/duelSheet.ts` and is mirrored on the phone; nothing here computes
// an outcome, a result or a clock. Three shipped bugs are behind that rule, and
// a component that recomputed any of it would be a fourth place to get it wrong.
//
// ⚠ IT TAKES `SheetRow[]` AND NOTHING ELSE about the duel. It does not know
// whose sheet it is showing, whether the week is live, or whether the viewer is
// in this duel at all — only which two colours to paint the chips. That is what
// lets The Room render five duels with it, none of which are the viewer's.

import { Avatar, type AvatarPerson } from '@/components/ui/Avatar'
import { LocalTime } from '@/components/LocalTime'
import type { AvatarInk } from '@/lib/design/avatarGradient'
import type { FixtureOutcome, SheetRow } from '@/lib/league/duelSheet'

export function PickChip({
  label, side, outcome, colour, align = 'left',
}: {
  label: string | null
  side: 'you' | 'them'
  /** Who took the fixture. Absolute — no chip flips it. */
  outcome: FixtureOutcome
  /** Whose chip this is, in their own colour. */
  colour: AvatarInk
  align?: 'left' | 'right'
}) {
  if (label === null) {
    return (
      <span className={`t-num t-num-medium text-xs text-muted/40 block ${align === 'right' ? 'text-right' : ''}`}>
        &mdash;
      </span>
    )
  }
  const won = outcome === side
  // ⚠ THE CHIP IS THE PERSON'S COLOUR, not primary-or-danger. `side` still
  // decides WHICH of the two people it belongs to; it no longer decides the
  // hue, which now comes from whoever that is.
  //
  // A won chip is filled with `strong` under white text, and needs no theme
  // switch — a fill is its own ground. An unwon chip is coloured TEXT, which
  // does: `strong` on the white card, `soft` on the dark one. The border is
  // `currentColor` mixed down, so it follows the text rather than needing a
  // third value.
  const tone =
    won ? 'text-white'
      : outcome === 'same' ? 'bg-mist text-muted'
        : 'border text-[var(--chip-strong)] dark:text-[var(--chip-soft)]'

  return (
    <span className={`block ${align === 'right' ? 'text-right' : ''}`}>
      <span
        style={{
          '--chip-strong': colour.strong,
          '--chip-soft': colour.soft,
          ...(won ? { background: colour.strong } : {}),
          ...(won || outcome === 'same' ? {}
            : { borderColor: 'color-mix(in srgb, currentColor 40%, transparent)' }),
        } as React.CSSProperties}
        className={`inline-flex items-center justify-center gap-1 t-detail uppercase tracking-wider rounded-md px-1.5 sm:px-2 py-1 w-full sm:w-auto sm:min-w-[3.25rem] ${tone}`}
        title={won ? 'Took this one'
          : outcome === 'same' ? 'Same pick — cannot separate you'
            : outcome === 'neither' ? 'Different picks, neither scored'
              : undefined}
      >
        {label}
        {/* The win marker. Colour alone cannot carry it: an outline means both
            "waiting" and "did not take it", and a solid grey means "you picked
            the same". The tick is the only unambiguous "this one was mine". */}
        {won && <span aria-hidden="true" className="text-[0.9em] leading-none">&#10003;</span>}
      </span>
    </span>
  )
}

/**
 * Two numbers either side of a fixed dash.
 *
 * The dash sits in the same place on every row and the numbers grow outwards
 * from it, so a column of scores reads down cleanly whether it is "1-4" or
 * "300-400". A single centred string cannot do that: it centres the STRING, and
 * a longer one pushes its own digits sideways.
 *
 * `t-num` is tabular, so equal digit counts occupy equal width and the
 * alignment holds without measuring anything.
 */
export function Scoreline({
  left, right, live = false,
}: { left: number | null; right: number | null; live?: boolean }) {
  return (
    <span className={`inline-grid grid-cols-[1fr_auto_1fr] items-baseline t-num t-num-extrabold text-sm whitespace-nowrap
      ${live ? 'text-danger-600' : 'text-ink'}`}>
      <span className="text-right">{left}</span>
      <span className="text-muted/40 font-normal px-0.5">&ndash;</span>
      <span className="text-left">{right}</span>
    </span>
  )
}

/**
 * One member in a duel: a face, a name, and whether they are ahead.
 *
 * Mirrored like the fixture row — avatar outermost, name inboard — so the two
 * cards share a reading direction. `dimmed` rather than a second colour: in
 * "Elsewhere on the card" and in The Room these duels are mostly not the
 * viewer's, and colouring them would compete with the blue and red that mean
 * "you" and "your opponent" everywhere else.
 */
export function DuelSide({
  name, person, leading, dimmed, align = 'left',
}: {
  name: string
  person: AvatarPerson | null
  leading: boolean
  dimmed: boolean
  align?: 'left' | 'right'
}) {
  const face = person
    ? <span className="shrink-0"><Avatar person={person} size={28} /></span>
    : <span className="w-7 h-7 rounded-full bg-mist shrink-0" aria-hidden="true" />
  const label = (
    <span className={`t-body truncate ${leading ? 'text-ink font-bold' : 'text-muted'}`}>{name}</span>
  )
  // Avatar outermost, name inboard — and the group is pushed to the card's own
  // edge by `justify`, not centred. Children are ordered explicitly rather than
  // flipped with `flex-row-reverse`, because reverse also inverts what
  // `justify-end` means and the two fight each other.
  return (
    <span className={`flex items-center gap-2.5 min-w-0 ${align === 'right' ? 'justify-end' : 'justify-start'} ${dimmed ? 'opacity-55' : ''}`}>
      {align === 'right' ? <>{label}{face}</> : <>{face}{label}</>}
    </span>
  )
}

/**
 * A club crest, or nothing. Never a broken image and never a placeholder box.
 *
 * ⚠ LARGER ON A PHONE THAN ON A DESKTOP, which looks backwards and is not:
 * above `md` the club name sits beside it and the crest is decoration, below
 * `md` the crest IS the club.
 */
export function Crest({ url, name }: { url: string | null; name: string | null }) {
  if (!url) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" aria-hidden="true" title={name ?? undefined}
      className="w-8 h-8 md:w-6 md:h-6 object-contain shrink-0" loading="lazy" />
  )
}

/** Kickoff, in the VIEWER's timezone — never the server's. See components/LocalTime. */
export function formatKickoff(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}

/**
 * The sheet itself: one row per fixture, both picks either side of the match.
 *
 * @param youInk    the LEFT column's colour — the viewer on the Duel tab,
 *                  `entry_a` in The Room.
 * @param themInk   the right column's.
 *
 * ⚠ LEFT AND RIGHT ARE PRESENTATIONAL, and the caller decides which is which.
 * On the Duel tab the viewer is always left, because a record you cannot read
 * from one side is unreadable; in The Room the sides are `entry_a` / `entry_b`,
 * which carry no meaning at all — the circle method's orientation is arbitrary.
 * What matters is only that the colours agree with the two names above them.
 */
export function TeamSheetRows({
  rows, youInk, themInk,
}: {
  rows: SheetRow[]
  youInk: AvatarInk
  themInk: AvatarInk
}) {
  return (
    <ul>
      {rows.map((b) => (
        <li key={b.number}
          className={`grid grid-cols-[3.25rem_1fr_3.25rem] sm:grid-cols-[4.75rem_1fr_4.75rem] items-center gap-3 sm:gap-5 px-3 sm:px-5 py-3.5 border-t border-border-default
            ${b.outcome === 'pending' ? 'bg-primary-50/40 dark:bg-primary-900/10 py-4' : ''}`}>
          <PickChip label={b.myPick} side="you" outcome={b.outcome} colour={youInk} />

          {/* [name][crest] v [crest][name] — mirrored about the v, so the
              two clubs carry the same weight and the eye lands in the
              middle rather than reading left to right. */}
          {/* ⚠ A COLUMN, not an inline span with block children. The
              kickoff line sat 2px under the crests on a `mt-0.5`, which
              is not technically an overlap and reads as one — the crests
              are 24px and the text baseline lands right on them. A real
              flex column with a gap is the fix; the spacing is then a
              property of the container rather than a margin guess. */}
          <span className="min-w-0 flex flex-col gap-2">
            <span className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 sm:gap-4">
              {/* ⚠ ABBREVIATION ON A PHONE, NAME ABOVE IT. Adding the
                  crests cost the width that made the names fit: at 375px
                  six of ten truncated, including "Crystal Palace" and
                  "Man United". A crest beside "CRY" is unambiguous where a
                  clipped "Crystal Pal…" is just worse — and it is what a
                  broadcast scoreboard does at this size. */}
              {/* ⚠ THE WINNING CLUB IS LIT, THE LOSER IS DIMMED — the
                  score alone makes you read two digits and compare them.
                  A draw dims neither. This is about the MATCH, and is a
                  different question from who took the fixture in the
                  duel: both members can lose a game City won. */}
              <span className={`flex items-center justify-end gap-2.5 min-w-0
                ${b.result === 'home' ? 'opacity-100' : b.result ? 'opacity-60 md:opacity-45' : ''}`}>
                {/* ⚠ THE CREST IS THE ONLY LABEL ON A PHONE, so the name
                    still has to reach a screen reader — sr-only, not
                    removed. A crest with no accessible name is an
                    unlabelled image where the content is. */}
                <span className="sr-only">{b.homeName}</span>
                <span className={`t-body truncate hidden md:inline ${b.result === 'home' ? 'text-ink font-bold' : 'text-muted'}`}>{b.homeName}</span>
                <Crest url={b.homeCrest} name={b.homeName} />
              </span>

              {/* The score lives where the v was, which is what makes it
                  affordable on a phone: it replaces a separator rather
                  than adding a column. */}
              {b.homeScore !== null && b.awayScore !== null ? (
                <Scoreline left={b.homeScore} right={b.awayScore} live={!!b.clock} />
              ) : (
                <span className="t-detail text-muted/40">v</span>
              )}

              <span className={`flex items-center gap-2.5 min-w-0
                ${b.result === 'away' ? 'opacity-100' : b.result ? 'opacity-60 md:opacity-45' : ''}`}>
                <Crest url={b.awayCrest} name={b.awayName} />
                <span className="sr-only">{b.awayName}</span>
                <span className={`t-body truncate hidden md:inline ${b.result === 'away' ? 'text-ink font-bold' : 'text-muted'}`}>{b.awayName}</span>
              </span>
            </span>
            {!b.isCompleted && b.kickoffAt && (
              <span className="flex justify-center">
                {/* A pill, so it reads as metadata about the fixture
                    rather than a second line of the fixture itself. A
                    live clock is red and ticking; a kickoff is blue and
                    quiet. */}
                <span className={`t-detail uppercase tracking-wider rounded-full px-2.5 py-1
                  ${b.clock ? 'bg-danger-500/15 text-danger-600' : 'bg-primary-500/12 text-primary-600'}`}>
                  {b.clock ?? <LocalTime iso={b.kickoffAt} format={formatKickoff} />}
                </span>
              </span>
            )}
          </span>

          <PickChip label={b.theirPick} side="them" outcome={b.outcome} colour={themInk} align="right" />
        </li>
      ))}
    </ul>
  )
}
