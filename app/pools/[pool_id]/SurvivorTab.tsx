'use client'

// =============================================================
// LAST MAN STANDING — who's left, and who you're backing
// =============================================================
// One club a matchweek, to win. Get it wrong and you're out until the round ends
// and a new one opens.
//
// ## The used-clubs rule is shown, not just enforced
//
// A club can be picked once per round. The database enforces it, but a member
// finding that out by tapping a crest and being refused is a bad screen — so the
// clubs already spent are visibly spent, greyed and unclickable, with the
// matchweek they were used in still attached. That is also the strategy surface:
// what you have left IS the game.
//
// ## Two weeks, not one
//
// From Friday kickoff to Monday night the week you are WATCHING and the week you
// can still PICK are different weeks. This screen used to know only the second,
// so on a live Saturday it announced the club you had lined up for next weekend
// and said nothing about the one playing. `inPlayMatchweek` leads; `openMatchweek`
// is the next decision, and is shown as one.
//
// ## The record is per ROUND, and resets with it
//
// Ryan, 2026-08-30: once the next round is active these reset, so the member can
// see who the clubs are playing again. `readLmsState` reads only the OPEN round,
// so both the used-clubs rule and the history below clear themselves when a new
// round starts — the grid comes back fully live and nothing carries over but
// rounds won.
//
// ## Everyone's picks are a WALL, not two lists
//
// This tab used to end with "Still standing" and "Out" — two lists of names
// that said each member's survival a second time and never showed what anybody
// had actually backed. The mobile app answered it as a grid (`LmsEntriesTab`):
// a member per row, a matchweek per column, a crest per cell. Read DOWN a column
// for this week, ACROSS a row for how somebody got here. This is that grid, and
// it is deliberately the same one — the comparator, the four cell states and the
// three member states are ported rather than reinvented, because two screens
// disagreeing about who is doing well is worse than either answer alone.
//
// ⚠ THE PICKER STAYS INLINE, and that is the one place this diverges from
// mobile. There the grid lives on its own route because a scrollable child
// inside the tab pager cannot get a height. That constraint is React Native's;
// the web has the room, so the mode's main action keeps its one click.
//
// ## Nothing here decides anything
//
// Survival, elimination and round winners all come from `league_lms_settle`.
// This renders the record.
// =============================================================

import { useState, useMemo, useCallback } from 'react'
import { useStickyState } from '@/hooks/useStickyState'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import {
  lmsPickKey,
  type LmsRound, type LmsSurvivor, type LmsPick, type LmsPickFixture, type LmsRosterEntry,
} from '@/lib/league/lms'
import type { SeasonClub } from '@/lib/league/table'
import type { NextFixture } from '@/lib/league/read'

type Props = {
  poolId: string
  round: LmsRound | null
  survivors: LmsSurvivor[]
  myPicks: LmsPick[]
  /**
   * Every pick the viewer may see — the wall's cells.
   *
   * ⚠ RLS DECIDED THIS, not us. `readLmsState` reads `league_lms_picks` on the
   * user's own client, so migration 086's two policies applied: your picks
   * always, everyone else's only once that matchweek locked. Nothing here
   * filters it again — a filter is not a gate, and a second copy of a policy is
   * a liability.
   */
  allPicks: LmsPick[]
  /** Every live entry in the pool. Ordered here, not by the server. */
  roster: LmsRosterEntry[]
  clubs: SeasonClub[]
  entryId: string | null
  /** The week a pick can still be WRITTEN for. Never the one to narrate with. */
  currentMatchweek: number | null
  /** The week being PLAYED. Null between rounds — that is an answer, not a gap. */
  inPlayMatchweek: number | null
  /** The wall's columns — this round's matchweeks, ascending. */
  matchweeks: number[]
  /**
   * Which of them have locked.
   *
   * ⚠ THE ONLY THING THAT READS AN EMPTY CELL. A missing pick is either sealed
   * or never made, and those are opposite accusations — one is the rule working,
   * the other is a member who did not turn up.
   */
  lockedMatchweeks: number[]
  /** Rounds won this season, per entry. */
  roundsWon: Map<string, number>
  /**
   * Who each club plays in the OPEN matchweek. A club missing from the map has
   * no fixture this week — a real state under these rules, not a gap.
   */
  fixtures: Map<string, NextFixture>
  /**
   * The game behind each of the viewer's own picks, keyed by `lmsPickKey` and
   * resolved against that pick's OWN matchweek. Frozen once the week settled, so
   * a pick from three weeks ago keeps the opponent it was made against instead
   * of being re-narrated by whatever the open matchweek now holds.
   */
  pickFixtures: Map<string, LmsPickFixture>
}

export default function SurvivorTab({
  poolId, round, survivors, myPicks, allPicks, roster, clubs, entryId,
  currentMatchweek, inPlayMatchweek, matchweeks, lockedMatchweeks,
  roundsWon, fixtures, pickFixtures,
}: Props) {
  // Sticky, not plain useState: this tab unmounts when the member switches tabs
  // and its initialiser would otherwise re-run against the page-load snapshot,
  // showing the club they backed BEFORE the pick they just made. See the header
  // of useStickyState.
  const [picks, setPicks] = useStickyState<LmsPick[]>(`lms:${poolId}`, myPicks)
  const [saving, setSaving] = useState<string | null>(null)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const usedBy = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of picks) m.set(p.club_id, p.matchweek_number)
    return m
  }, [picks])

  /** The pick for the week being played, and the pick for the week still open. */
  const inPlayPick = useMemo(
    () => (inPlayMatchweek === null ? null : picks.find((p) => p.matchweek_number === inPlayMatchweek) ?? null),
    [picks, inPlayMatchweek],
  )
  const openPick = useMemo(
    () => picks.find((p) => p.matchweek_number === currentMatchweek) ?? null,
    [picks, currentMatchweek],
  )

  // One lookup for both the crest and the name. The wall draws a badge per
  // member per matchweek, so a linear `find` per cell is the wrong shape once a
  // round is six weeks long.
  const clubById = useMemo(() => new Map(clubs.map((c) => [c.club_id, c])), [clubs])
  const clubName = useCallback(
    (clubId: string) => clubById.get(clubId)?.club_name ?? 'a club',
    [clubById],
  )
  const clubCrest = useCallback(
    (clubId: string) => clubById.get(clubId)?.crest_url ?? null,
    [clubById],
  )

  /**
   * The game behind a pick, from the server-resolved map.
   *
   * ⚠ NEVER `fixtures.get(pick.club_id)`. That map is the OPEN matchweek's
   * fixture list — right for the picker grid below, wrong for anything already
   * chosen, and using it is what made a locked-in pick appear to change who it
   * was playing every time the season moved on.
   */
  const gameFor = useCallback(
    (pick: LmsPick | null) => (pick ? pickFixtures.get(lmsPickKey(pick)) ?? null : null),
    [pickFixtures],
  )

  /**
   * Every pick in this round, most recent first — the record Ryan asked for:
   * which club, against whom, and how it turned out. Scoped to the open round,
   * like everything else here, so it clears when the next round starts.
   */
  const history = useMemo(
    () => picks.slice().sort((a, b) => b.matchweek_number - a.matchweek_number),
    [picks],
  )

  const me = useMemo(
    () => survivors.find((s) => s.entry_id === entryId) ?? null,
    [survivors, entryId],
  )
  const iAmOut = me?.eliminated_matchweek != null

  /**
   * Which of the two week-blocks the status card shows.
   *
   * ⚠ `showInPlay` is NOT simply "a week is in play". A round can open on the
   * matchweek AFTER the one still being played, and there is no pick for a week
   * that predates the round — so the block is skipped rather than rendered as an
   * accusation aimed at somebody who did nothing wrong.
   *
   * `bothWeeks` is what turns the card into two columns. It is deliberately the
   * only thing that does: one block on its own gets the full width, because a
   * half-width lone block reads as something that failed to load.
   */
  const showInPlay = inPlayMatchweek !== null && inPlayMatchweek >= (round?.first_matchweek ?? Infinity)
  const showOpen = currentMatchweek !== null
  const bothWeeks = showInPlay && showOpen

  // Only for the count in the heading. Who is standing is SHOWN by the wall's
  // name column now — a dot per member — rather than listed a second time
  // underneath it, which is how the mobile app says it.
  const standing = survivors.filter((s) => s.eliminated_matchweek === null)

  const choose = useCallback(async (clubId: string) => {
    if (!round || !entryId || currentMatchweek === null) return
    setSaving(clubId)
    setMessage(null)
    try {
      const res = await fetch(`/api/pools/${poolId}/lms-pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roundId: round.round_id, entryId, matchweekNumber: currentMatchweek, clubId,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setMessage({ kind: 'error', text: json.error ?? 'That did not save.' })
      } else {
        setPicks((prev) => [
          ...prev.filter((p) => p.matchweek_number !== currentMatchweek),
          // fixture_id null: the week has not settled, so the opponent is still
          // derived live — the two-state contract from migration 115.
          { round_id: round.round_id, entry_id: entryId, matchweek_number: currentMatchweek, club_id: clubId, result: null, fixture_id: null },
        ])
        setMessage({ kind: 'ok', text: 'Locked in. You can change it until the first kick-off.' })
      }
    } catch {
      setMessage({ kind: 'error', text: 'That did not save — check your connection and try again.' })
    } finally {
      setSaving(null)
    }
  }, [poolId, round, entryId, currentMatchweek])

  if (!round) {
    return (
      <Card padding="lg">
        <div className="text-center py-8">
          <Icon name="flame.fill" size={40} className="mx-auto text-neutral-300 mb-3" />
          <p className="text-sm text-neutral-600 font-medium">No round is running</p>
          <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
            A round opens with the next matchweek.
          </p>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-bold text-neutral-900">Round {round.round_number}</h2>
        <p className="text-xs text-neutral-500">
          {standing.length} still standing of {survivors.length}
        </p>
      </div>

      {/* Your state, said in one sentence before anything else.
          ⚠ THE WEEK BEING PLAYED LEADS, and the week still open follows it as a
          separate, separately-labelled decision. They are never the same week —
          a matchweek is in play only once it has LOCKED, and open only while it
          has not — which is exactly why handing this screen one number collapsed
          two different questions into one wrong answer. */}
      <Card padding="md">
        {iAmOut ? (
          <div>
            <p className="text-sm font-semibold text-neutral-900">
              You went out in matchweek {me?.eliminated_matchweek}
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              You&apos;re back in as soon as this round ends — everyone starts the next one level.
            </p>
          </div>
        ) : (
          /* NOW AND NEXT, SIDE BY SIDE.

             Ryan, 2026-08-30, on the stacked version: "these can be next to
             each other or one on the left and one on the right — this is now
             and the [other] is coming up or next."

             Stacked, the two blocks read as a list of two equal things, and
             the rule under them has to do all the work of saying which is
             which. Side by side they read as a SEQUENCE — left is the game on,
             right is the one to come — which is the relationship, not just the
             order.

             Two columns only when there ARE two. A lone block spanning half
             the card would look like something failed to load, so the grid
             collapses to one column whenever one side is absent, and on a
             phone always. */
          <div className={`grid gap-3 ${bothWeeks ? 'sm:grid-cols-2 sm:gap-0' : ''}`}>
            {/* IN PLAY — the game on now. Skipped when the round began after
                this week did: there is no pick for a matchweek that predates the
                round, and reading that absence as "you missed it" would alarm
                somebody who did nothing wrong. */}
            {showInPlay && (
              <div className={bothWeeks ? 'sm:pr-5' : undefined}>
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-0.5">
                  Matchweek {inPlayMatchweek} — in play
                </p>
                {inPlayPick ? (
                  <>
                    {/* THE BADGE, THEN THE NAME — the mobile app's shape. Anyone
                        who follows football reads a crest faster than a word,
                        and this line is the one thing on the tab a member checks
                        on a Saturday. */}
                    <p className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5 flex-wrap">
                      <Crest url={clubCrest(inPlayPick.club_id)} name={clubName(inPlayPick.club_id)} />
                      <span>
                        {clubName(inPlayPick.club_id)}
                        <Fixture game={gameFor(inPlayPick)} />
                      </span>
                    </p>
                    <p className="text-xs text-neutral-500 mt-1">{verdictLine(gameFor(inPlayPick))}</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-neutral-900">You didn&apos;t pick this week</p>
                    <p className="text-xs text-neutral-500 mt-1">
                      No pick is an elimination once the week settles — we won&apos;t choose for you.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* NEXT UP — the decision still to make. "Open" is what the DATABASE
                calls this week; "next up" is what it is to the person reading,
                and beside a week that is already running it is the word that
                carries the sequence. The sentence below still says it can be
                changed, which is the part "open" was doing.

                The rule between them turns with the layout: a line ABOVE when
                stacked, a line to the LEFT when side by side. */}
            {showOpen && (
              <div className={showInPlay
                ? 'pt-3 border-t border-border-default sm:pt-0 sm:pl-5 sm:border-t-0 sm:border-l'
                : undefined}>
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-0.5">
                  Matchweek {currentMatchweek} — next up
                </p>
                {openPick ? (
                  <>
                    <p className="text-sm font-semibold text-neutral-900 flex items-center gap-1.5 flex-wrap">
                      <Crest url={clubCrest(openPick.club_id)} name={clubName(openPick.club_id)} />
                      <span>
                        {clubName(openPick.club_id)}
                        <Fixture game={gameFor(openPick)} />
                      </span>
                    </p>
                    {/* ⚠ Same resolution as the fixture beside the club name.
                        Asking `fixtures` here and `gameFor` there is two sources
                        for one fact, and they can disagree — a club whose game
                        one map has and the other does not would be shown an
                        opponent above a sentence saying it has no game. */}
                    <p className="text-xs text-neutral-500 mt-1">
                      {verdictLine(gameFor(openPick), { changeable: true })}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-semibold text-neutral-900">You haven&apos;t picked yet</p>
                    <p className="text-xs text-neutral-500 mt-1">
                      No pick means you&apos;re out — we won&apos;t choose for you.
                    </p>
                  </>
                )}
              </div>
            )}

            {/* Nothing playing and nothing open: the season has run out of
                matchweeks. Said plainly rather than left as an empty card. */}
            {!showInPlay && !showOpen && (
              <div>
                <p className="text-sm font-semibold text-neutral-900">No matchweek to pick</p>
                <p className="text-xs text-neutral-500 mt-1">
                  The season has no matchweeks left to play.
                </p>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* The club grid */}
      {!iAmOut && currentMatchweek !== null && entryId && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-2">
            Matchweek {currentMatchweek} — pick one to win
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {clubs.map((c) => {
              const usedIn = usedBy.get(c.club_id)
              // The grid is the OPEN week's decision, so "currently selected"
              // means the open week's pick — not the club playing right now,
              // which cannot be changed and is not on offer here.
              const isThisWeek = openPick?.club_id === c.club_id
              const spent = usedIn !== undefined && !isThisWeek
              const fixture = fixtures.get(c.club_id) ?? null
              // ⚠ A club with no fixture cannot be backed to WIN, so it cannot
              // be picked. Until migration 103 it could — and `league_lms_settle`
              // survives an entry whose club had no completed fixture, so a
              // non-playing club was a guaranteed pass. In a blank matchweek
              // everybody could take one and nobody would ever go out.
              const notPlaying = fixture === null
              return (
                <button
                  key={c.club_id}
                  type="button"
                  disabled={spent || notPlaying || saving !== null}
                  onClick={() => choose(c.club_id)}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border-2 text-left transition-all ${
                    isThisWeek
                      ? 'border-primary-600 bg-primary-600/8'
                      : spent || notPlaying
                        ? 'border-neutral-200 bg-neutral-50 opacity-45 cursor-not-allowed'
                        : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                  }`}
                >
                  {c.crest_url && <img src={c.crest_url} alt="" className="w-6 h-6 object-contain shrink-0" />}
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-neutral-900 truncate">{c.club_name}</span>
                    {/* WHO THEY PLAY. The whole decision in this mode is "can
                        this club win THIS week", and until now the screen
                        offered twenty crests and no fixtures — so the answer
                        lived on another tab, or in the member's head.

                        Home and away are named rather than implied by order,
                        because "v" and "at" are doing real work here: a good
                        side away at a rival is a different bet from the same
                        side at home. */}
                    {fixture ? (
                      <span className="block text-[10px] text-neutral-500 truncate">
                        {fixture.isHome ? 'v ' : 'at '}
                        {fixture.opponentName}
                      </span>
                    ) : (
                      // Greyed out AND labelled. A blank space would read as a
                      // loading state; "not playing" is the reason the tile
                      // cannot be tapped, and the reason is the whole point —
                      // what you have left to spend IS the game.
                      <span className="block text-[10px] text-neutral-400 truncate">not playing this week</span>
                    )}
                    {spent && (
                      <span className="block text-[10px] text-neutral-500">used in MW {usedIn}</span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="text-xs text-neutral-400 mt-2">
            One club per round — once you&apos;ve used them, they&apos;re gone until the next round.
            Clubs with no game this matchweek can&apos;t be picked.
          </p>
        </div>
      )}

      {message && (
        <p className={`text-sm ${message.kind === 'ok' ? 'text-success-700' : 'text-danger-600'}`} role="status">
          {message.text}
        </p>
      )}

      {/* YOUR ROUND SO FAR — the record, and the answer to "why am I still in".
          A club on its own does not explain a week: "Arsenal" is not the story,
          "Arsenal beat Fulham 2-1" is. Until migration 115 the opponent was
          re-derived from whichever matchweek happened to be open, so this list
          could not be written at all — every row would have narrated an old pick
          with next weekend's fixture.

          Scoped to the OPEN round, like the used-clubs rule above it. When the
          next round starts this clears and the grid comes back fully live. */}
      {history.length > 0 && (
        <Card padding="none" className="overflow-hidden">
          <div className="px-4 py-2.5 bg-neutral-50 text-[10px] uppercase tracking-wider text-neutral-500 font-bold">
            Your round {round.round_number} so far
          </div>
          <ul>
            {history.map((p) => {
              const game = gameFor(p)
              return (
                <li
                  key={p.matchweek_number}
                  className="px-4 py-2.5 border-t border-border-default flex items-center justify-between gap-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-neutral-900 truncate">
                      MW {p.matchweek_number} — {clubName(p.club_id)}
                    </span>
                    <span className="block text-[11px] text-neutral-500 truncate">
                      {game
                        ? `${game.isHome ? 'v' : 'at'} ${game.opponentName}${
                            game.isCompleted && game.clubGoals != null && game.opponentGoals != null
                              ? ` ${game.clubGoals}–${game.opponentGoals}`
                              : ''
                          }`
                        : 'No game that matchweek'}
                    </span>
                  </span>
                  <span className={`text-xs shrink-0 font-semibold ${
                    p.result === 'survived' ? 'text-success-700'
                      : p.result === 'eliminated' ? 'text-danger-600'
                        : 'text-neutral-400'
                  }`}>
                    {p.result === 'survived' ? 'Survived' : p.result === 'eliminated' ? 'Out' : 'Not settled'}
                  </span>
                </li>
              )
            })}
          </ul>
        </Card>
      )}

      {/* EVERYONE'S PICKS — the wall, and what replaced the two name lists that
          used to sit here. A member per row, a matchweek per column, a crest in
          each cell. This mode's whole story is who backed what and when it went
          wrong, and that is a grid, not a list: you read DOWN a column to see
          the week and ACROSS a row to see how somebody got here.

          The lists it replaced said each member's survival a second time —
          "Still standing" over a name the wall already marks with a green dot.
          The ranked view of the same people is the Leaderboard tab's job. */}
      <PicksWall
        roster={roster}
        picks={allPicks}
        matchweeks={matchweeks}
        lockedMatchweeks={lockedMatchweeks}
        roundNumber={round.round_number}
        inPlayMatchweek={inPlayMatchweek}
        entryId={entryId}
        roundsWon={roundsWon}
        clubName={clubName}
        clubCrest={clubCrest}
      />

      <p className="text-xs text-neutral-400">
        When one player is left the round ends and a new one opens with everyone back in.
        Your season score is rounds won.
      </p>
    </div>
  )
}

// The wall's geometry. A row has to clear a 34px badge with air around it, and
// the name column has to hold a real display name without truncating every one.
const ROW_H = 44
const HEAD_H = 31
const CELL_W = 56
/**
 * The frozen name column.
 *
 * Narrower on a phone: at 176px it ate 47% of a 375px viewport and left the
 * weeks — the thing you came to read — in a third of the screen. The mobile app
 * runs 112px for the same reason, and gets the room back on a desktop browser
 * where there is room to give.
 */
const NAME_COL = 'w-[124px] sm:w-[176px]'

/** A member's cell in one matchweek, resolved to one of four states. */
type CellState =
  | { kind: 'pick'; pick: LmsPick }
  /** Their club is hidden from you — the week has not locked. */
  | { kind: 'sealed' }
  /** They were already out, or never in the round. Nothing was owed. */
  | { kind: 'gone' }
  /** Nothing picked, and nothing hiding it. */
  | { kind: 'none' }

/**
 * EVERYONE'S PICKS, as a grid.
 *
 * ⚠ WHAT IS MISSING FROM `picks` IS NOT NOTHING. The rows arrive already gated
 * by migration 086's policies — your own always, everyone else's only once that
 * matchweek has LOCKED — so an absent cell is ambiguous by construction, and
 * `lockedMatchweeks` is the only thing that resolves it. Rendering sealed and
 * never-picked the same way would accuse half the pool of not turning up, and
 * the difference between those two is the difference between the rule working
 * and a member losing.
 *
 * Ported from `LmsEntriesTab` on mobile, down to the four cell states and the
 * ordering, because two screens disagreeing about who is doing well is worse
 * than either answer on its own.
 */
function PicksWall({
  roster, picks, matchweeks, lockedMatchweeks, roundNumber, inPlayMatchweek, entryId,
  roundsWon, clubName, clubCrest,
}: {
  roster: LmsRosterEntry[]
  picks: LmsPick[]
  matchweeks: number[]
  lockedMatchweeks: number[]
  roundNumber: number
  inPlayMatchweek: number | null
  entryId: string | null
  roundsWon: Map<string, number>
  clubName: (clubId: string) => string
  clubCrest: (clubId: string) => string | null
}) {
  const locked = useMemo(() => new Set(lockedMatchweeks), [lockedMatchweeks])
  const byCell = useMemo(() => {
    const m = new Map<string, LmsPick>()
    for (const p of picks) m.set(`${p.entry_id}:${p.matchweek_number}`, p)
    return m
  }, [picks])

  /**
   * Standing above out, then whoever lasted longer, then by name.
   *
   * ⚠ Byte-for-byte the mobile wall's comparator, and it must stay that way.
   * The same eight people in two different orders on two devices is a bug the
   * user finds before we do.
   */
  const members = useMemo(
    () =>
      [...roster].sort((a, b) => {
        const g = (m: LmsRosterEntry) => (!m.inRound ? 2 : m.eliminatedMatchweek === null ? 0 : 1)
        if (g(a) !== g(b)) return g(a) - g(b)
        if ((a.eliminatedMatchweek ?? 0) !== (b.eliminatedMatchweek ?? 0)) {
          return (b.eliminatedMatchweek ?? 0) - (a.eliminatedMatchweek ?? 0)
        }
        return a.name.localeCompare(b.name)
      }),
    [roster],
  )

  const cellFor = useCallback(
    (member: LmsRosterEntry, mw: number): CellState => {
      const pick = byCell.get(`${member.entry_id}:${mw}`)
      if (pick) return { kind: 'pick', pick }
      if (!member.inRound) return { kind: 'gone' }
      // Out already: no pick was owed for a week they never played.
      if (member.eliminatedMatchweek !== null && mw > member.eliminatedMatchweek) {
        return { kind: 'gone' }
      }
      if (!locked.has(mw)) return { kind: 'sealed' }
      return { kind: 'none' }
    },
    [byCell, locked],
  )

  if (matchweeks.length === 0) {
    return (
      <div>
        <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-2">
          Everyone&apos;s picks
        </p>
        <p className="text-xs text-neutral-500">
          Nothing to show until the round&apos;s first matchweek opens.
        </p>
      </div>
    )
  }

  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-2">
        Everyone&apos;s picks — round {roundNumber}
      </p>

      <Card padding="none" className="overflow-hidden">
        <div className="flex">
          {/* Names stay put; only the weeks scroll. A member's row has to stay
              findable when a round is six weeks long. */}
          <div className={`shrink-0 border-r border-border-default ${NAME_COL}`}>
            <div style={{ height: HEAD_H }} />
            {members.map((m) => (
              <div
                key={m.entry_id}
                className={`flex items-center gap-1.5 pl-3 pr-2 ${
                  m.entry_id === entryId ? 'bg-primary-600/6' : ''
                }`}
                style={{ height: ROW_H }}
              >
                <StateDot member={m} />
                <span
                  className={`text-xs font-semibold truncate ${
                    m.eliminatedMatchweek === null ? 'text-neutral-900' : 'text-neutral-500'
                  }`}
                >
                  {m.name}
                </span>
                {/* The trophy is the ENTIRE memory of a round. Closing one opens
                    the next in the same transaction, so survival resets to
                    "everybody back in" and nothing else here records that the
                    round ever happened. */}
                {(roundsWon.get(m.entry_id) ?? m.roundsWon) > 0 && (
                  <span
                    className="shrink-0 flex items-center gap-0.5 text-accent-600"
                    title={`${roundsWon.get(m.entry_id) ?? m.roundsWon} round(s) won`}
                  >
                    <Icon name="trophy.fill" size={10} />
                    {(roundsWon.get(m.entry_id) ?? m.roundsWon) > 1 && (
                      <span className="text-[9px] font-bold">
                        ×{roundsWon.get(m.entry_id) ?? m.roundsWon}
                      </span>
                    )}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* ⚠ `flex-1 min-w-0` BOTH. Without flex-1 the region is only as
              wide as its columns — 168px inside a 734px card — so the
              current-user row tint stopped a third of the way across and the
              rest of the card was dead space. Without min-w-0 a flex child
              refuses to shrink below its content and scrolls the page
              instead of itself. */}
          <div className="overflow-x-auto flex-1 min-w-0">
            <div style={{ minWidth: matchweeks.length * CELL_W }}>
              <div className="flex" style={{ height: HEAD_H }}>
                {matchweeks.map((mw) => (
                  <div
                    key={mw}
                    className={`flex items-center justify-center text-[9px] font-bold tracking-wider ${
                      mw === inPlayMatchweek ? 'text-primary-600' : 'text-neutral-500'
                    }`}
                    // Grow into spare width, never shrink below CELL_W — three
                    // columns spread across the card, ten of them scroll.
                    style={{ flex: `1 0 ${CELL_W}px` }}
                  >
                    MW{mw}
                  </div>
                ))}
              </div>

              {members.map((m) => (
                <div
                  key={m.entry_id}
                  className={`flex ${m.entry_id === entryId ? 'bg-primary-600/6' : ''}`}
                  style={{ height: ROW_H }}
                >
                  {matchweeks.map((mw) => (
                    <WallCell
                      key={mw}
                      cell={cellFor(m, mw)}
                      clubName={clubName}
                      clubCrest={clubCrest}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <p className="text-xs text-neutral-400 mt-2">
        Clubs stay hidden until their matchweek locks — otherwise the pool could copy the best
        player.
      </p>
    </div>
  )
}

/** A colour before any words — the row's state readable at a glance down the list. */
function StateDot({ member }: { member: LmsRosterEntry }) {
  // ⚠ THREE STATES, NOT TWO. Grey is somebody who joined after the round opened,
  // and it must never be the red of an elimination: that would accuse them of
  // losing a round they were never allowed to play.
  const tone = !member.inRound
    ? 'bg-neutral-400'
    : member.eliminatedMatchweek === null
      ? 'bg-success-600'
      : 'bg-danger-600'
  return <span className={`shrink-0 w-[7px] h-[7px] rounded-full ${tone}`} />
}

function WallCell({
  cell, clubName, clubCrest,
}: {
  cell: CellState
  clubName: (clubId: string) => string
  clubCrest: (clubId: string) => string | null
}) {
  const base = 'flex items-center justify-center'

  if (cell.kind === 'sealed') {
    return (
      <div className={base} style={{ flex: `1 0 ${CELL_W}px`, height: ROW_H }} title="Hidden until this matchweek locks">
        <Icon name="lock.fill" size={11} className="text-neutral-400" />
      </div>
    )
  }

  if (cell.kind === 'gone') {
    return (
      <div className={base} style={{ flex: `1 0 ${CELL_W}px`, height: ROW_H }}>
        <span className="text-neutral-300 text-sm leading-none">·</span>
      </div>
    )
  }

  // ⚠ A locked week with no pick is a real, costly fact — it is how you go out
  // without ever being beaten — so it is marked rather than left blank.
  if (cell.kind === 'none') {
    return (
      <div className={base} style={{ flex: `1 0 ${CELL_W}px`, height: ROW_H }} title="No pick that matchweek">
        <Icon name="xmark" size={10} className="text-neutral-400" />
      </div>
    )
  }

  const { pick } = cell
  const name = clubName(pick.club_id)
  const crest = clubCrest(pick.club_id)
  const tint =
    pick.result === 'survived'
      ? 'bg-success-600/14'
      : pick.result === 'eliminated'
        ? 'bg-danger-600/14'
        : ''

  return (
    <div className={base} style={{ flex: `1 0 ${CELL_W}px`, height: ROW_H }}>
      <span
        className={`w-[34px] h-[34px] rounded-full flex items-center justify-center ${tint}`}
        title={name}
      >
        {crest ? (
          <img src={crest} alt={name} className="w-6 h-6 object-contain" />
        ) : (
          // ⚠ `crest_url` is nullable. An abbreviation beats a blank, which would
          // read as a cell where nobody picked.
          <span className="text-[9px] font-bold text-neutral-900">
            {name.slice(0, 3).toUpperCase()}
          </span>
        )}
      </span>
    </div>
  )
}

/**
 * A club's badge, at text size.
 *
 * Renders nothing without a URL rather than a placeholder box: the club's name
 * is always beside it, so a missing crest costs nothing, and `crest_url` is
 * nullable in this feed.
 */
function Crest({ url, name }: { url: string | null; name: string }) {
  if (!url) return null
  return <img src={url} alt={name} className="w-5 h-5 object-contain shrink-0" />
}

/**
 * The opponent, on the same line as the club.
 *
 * Home and away are NAMED rather than implied by order — "v" and "at" are doing
 * real work in this mode, because a good side away at a rival is a different bet
 * from the same side at home. Renders nothing when there is no game: a club with
 * no fixture is a real state under these rules, and the sentence beneath says so
 * in full rather than leaving a dash to be interpreted.
 */
function Fixture({ game }: { game: LmsPickFixture | null }) {
  if (!game) return null
  return (
    <span className="font-normal text-neutral-500">
      {' '}— {game.isHome ? 'v' : 'at'} {game.opponentName}
      {game.isCompleted && game.clubGoals != null && game.opponentGoals != null && (
        <span className="text-neutral-900 font-semibold">
          {' '}{game.clubGoals}–{game.opponentGoals}
        </span>
      )}
    </span>
  )
}

/**
 * What has to happen, or what already did, for the week being played.
 *
 * The score is shown but the VERDICT is not claimed here — survival comes from
 * `league_lms_settle` and only from there. A club that has won is "so far so
 * good", never "you survived": the week is not over until the engine says it is,
 * and a screen that calls it early is a screen that can be wrong.
 */
function verdictLine(game: LmsPickFixture | null, opts: { changeable?: boolean } = {}): string {
  const yetToPlay = opts.changeable
    ? 'They have to win. A draw is not enough — you can change it until the first kick-off.'
    : 'They have to win. A draw is not enough.'
  if (!game) {
    return 'They have no game this matchweek, so you go through — you cannot be beaten by a match that was not played.'
  }
  // Not settled yet, or settled with no scoreline to read: either way the ask is
  // unchanged, so it is one branch rather than two identical ones.
  if (!game.isCompleted || game.clubGoals == null || game.opponentGoals == null) return yetToPlay
  if (game.clubGoals > game.opponentGoals) return 'They won — so far so good. The week settles once every game is in.'
  return 'They didn’t win, so this one is gone once the week settles. A draw is not enough.'
}
