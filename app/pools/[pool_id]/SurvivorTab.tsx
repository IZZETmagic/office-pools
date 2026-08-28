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
// ## Nothing here decides anything
//
// Survival, elimination and round winners all come from `league_lms_settle`.
// This renders the record.
// =============================================================

import { useState, useMemo, useCallback } from 'react'
import { useStickyState } from '@/hooks/useStickyState'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import type { LmsRound, LmsSurvivor, LmsPick } from '@/lib/league/lms'
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
  currentMatchweek: number | null
  /** Rounds won this season, per entry. */
  roundsWon: Map<string, number>
  /**
   * Who each club plays in the OPEN matchweek. A club missing from the map has
   * no fixture this week — a real state under these rules, not a gap.
   */
  fixtures: Map<string, NextFixture>
}

export default function SurvivorTab({
  poolId, round, survivors, myPicks, clubs, entryNames, entryId, currentMatchweek, roundsWon,
  fixtures,
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

  const thisWeekPick = useMemo(
    () => picks.find((p) => p.matchweek_number === currentMatchweek) ?? null,
    [picks, currentMatchweek],
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
          { round_id: round.round_id, entry_id: entryId, matchweek_number: currentMatchweek, club_id: clubId, result: null },
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

      {/* Your state, said in one sentence before anything else */}
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
        ) : thisWeekPick ? (
          <div>
            <p className="text-sm font-semibold text-neutral-900">
              You&apos;re backing{' '}
              {clubs.find((c) => c.club_id === thisWeekPick.club_id)?.club_name ?? 'a club'}
              {/* The fixture again, on the line that confirms the pick. Somebody
                  coming back to this screen mid-week wants to know what they
                  are watching, not just who they chose. */}
              {(() => {
                const f = fixtures.get(thisWeekPick.club_id)
                return f ? (
                  <span className="font-normal text-neutral-500">
                    {' '}— {f.isHome ? 'v' : 'at'} {f.opponentName}
                  </span>
                ) : null
              })()}
            </p>
            <p className="text-xs text-neutral-500 mt-1">
              {fixtures.has(thisWeekPick.club_id)
                ? 'They have to win. A draw is not enough.'
                : 'They have no game this matchweek, so you go through — you cannot be beaten by a match that was not played.'}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-semibold text-neutral-900">You haven&apos;t picked yet</p>
            <p className="text-xs text-neutral-500 mt-1">
              No pick means you&apos;re out — we won&apos;t choose for you.
            </p>
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
              const isThisWeek = thisWeekPick?.club_id === c.club_id
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
