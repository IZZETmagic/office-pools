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
// ## Nothing here decides anything
//
// Survival, elimination and round winners all come from `league_lms_settle`.
// This renders the record.
// =============================================================

import { useState, useMemo, useCallback } from 'react'
import { useStickyState } from '@/hooks/useStickyState'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { lmsPickKey, type LmsRound, type LmsSurvivor, type LmsPick, type LmsPickFixture } from '@/lib/league/lms'
import type { SeasonClub } from '@/lib/league/table'
import type { NextFixture } from '@/lib/league/read'

type Props = {
  poolId: string
  round: LmsRound | null
  survivors: LmsSurvivor[]
  myPicks: LmsPick[]
  clubs: SeasonClub[]
  entryNames: Map<string, string>
  entryId: string | null
  /** The week a pick can still be WRITTEN for. Never the one to narrate with. */
  currentMatchweek: number | null
  /** The week being PLAYED. Null between rounds — that is an answer, not a gap. */
  inPlayMatchweek: number | null
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
  poolId, round, survivors, myPicks, clubs, entryNames, entryId, currentMatchweek, inPlayMatchweek,
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

  const clubName = useCallback(
    (clubId: string) => clubs.find((c) => c.club_id === clubId)?.club_name ?? 'a club',
    [clubs],
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

  const standing = survivors.filter((s) => s.eliminated_matchweek === null)
  const out = survivors
    .filter((s) => s.eliminated_matchweek !== null)
    .sort((a, b) => (b.eliminated_matchweek ?? 0) - (a.eliminated_matchweek ?? 0))

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

  const name = (e: string) => entryNames.get(e) ?? 'Unknown'

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
          <div className="space-y-3">
            {/* IN PLAY. Skipped when the round began after this week did: there
                is no pick for a matchweek that predates the round, and reading
                that absence as "you missed it" would alarm somebody who did
                nothing wrong. */}
            {inPlayMatchweek !== null && inPlayMatchweek >= round.first_matchweek && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-0.5">
                  Matchweek {inPlayMatchweek} — in play
                </p>
                {inPlayPick ? (
                  <>
                    <p className="text-sm font-semibold text-neutral-900">
                      You&apos;re backing {clubName(inPlayPick.club_id)}
                      <Fixture game={gameFor(inPlayPick)} />
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

            {/* OPEN — the next decision, kept visually separate from the one
                already playing. */}
            {currentMatchweek !== null && (
              <div className={inPlayMatchweek !== null && inPlayMatchweek >= round.first_matchweek
                ? 'pt-3 border-t border-border-default' : undefined}>
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-0.5">
                  Matchweek {currentMatchweek} — open
                </p>
                {openPick ? (
                  <>
                    <p className="text-sm font-semibold text-neutral-900">
                      You&apos;re backing {clubName(openPick.club_id)}
                      <Fixture game={gameFor(openPick)} />
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
            {currentMatchweek === null && inPlayMatchweek === null && (
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

      {/* Who's left */}
      <Card padding="none" className="overflow-hidden">
        <div className="px-4 py-2.5 bg-neutral-50 text-[10px] uppercase tracking-wider text-neutral-500 font-bold">
          Still standing
        </div>
        <ul>
          {standing.map((s) => (
            <li key={s.entry_id} className="px-4 py-2.5 border-t border-border-default flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-neutral-900 truncate">{name(s.entry_id)}</span>
              {(roundsWon.get(s.entry_id) ?? 0) > 0 && (
                <span className="text-xs text-neutral-500 shrink-0">
                  {roundsWon.get(s.entry_id)} round{roundsWon.get(s.entry_id) === 1 ? '' : 's'} won
                </span>
              )}
            </li>
          ))}
          {standing.length === 0 && (
            <li className="px-4 py-3 border-t border-border-default text-sm text-neutral-500">
              Everyone is out — the round is over.
            </li>
          )}
        </ul>

        {out.length > 0 && (
          <>
            <div className="px-4 py-2.5 bg-neutral-50 text-[10px] uppercase tracking-wider text-neutral-500 font-bold border-t border-border-default">
              Out
            </div>
            <ul>
              {out.map((s) => (
                <li key={s.entry_id} className="px-4 py-2.5 border-t border-border-default flex items-center justify-between gap-3">
                  <span className="text-sm text-neutral-500 truncate">{name(s.entry_id)}</span>
                  <span className="text-xs text-neutral-400 shrink-0">MW {s.eliminated_matchweek}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <p className="text-xs text-neutral-400">
        When one player is left the round ends and a new one opens with everyone back in.
        Your season score is rounds won.
      </p>
    </div>
  )
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
