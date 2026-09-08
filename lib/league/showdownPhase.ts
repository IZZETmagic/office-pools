// =============================================================
// THE VIEWER'S DUELS, ORIENTED — and which phase they are in
// =============================================================
// `duelPhase` orders the six phases and derives nothing; this is the layer that
// hands it its inputs, on the web. It was written inline in `DuelsTab` and had
// to come out the moment The Room needed the same answer: the Room must not
// list a week whose walkout the member has not watched, and "has this been
// watched" is a phase question with exactly one owner.
//
// ⚠ TWO CALLERS, ONE FUNCTION, AND THAT IS NOT THE SAME AS TWO DERIVATIONS.
// `PoolDetail` and `DuelsTab` both call this with the same props, so they get
// the same answer by construction — a pure function of its inputs, computed
// twice, costs a memo and cannot disagree. What the codebase forbids is two
// DIFFERENT chains reaching the same conclusion by different routes, which is
// what `duelPhase`'s own header records the cost of.
//
// ⚠ THE ROOM AND THE BAND WANT OPPOSITE THINGS FROM THE SAME ANSWER. The band
// exists to OFFER the unwatched walkout; the Room exists to WITHHOLD that week
// until it has been watched. Left to derive their own, one of the two would
// eventually name the opponent the other is still hiding — which is exactly the
// gap the phone shipped for a day: the Room listed both names one tab away from
// a header reading "Sealed · Opponent hidden".

import { duelPhase, type DuelPhaseResult } from './duelPhase'
import type { DuelRow } from './duels'

/** One side of a duel, as the surfaces read it. */
export type Side = { entry: string; points: number | null; accuracy: number | null }

/** A duel the viewer is in, oriented so "you" is always the first side. */
export type MyDuel = {
  duel: DuelRow
  you: Side
  them: Side | null
  matchweek: number
}

/**
 * Every duel the viewer is in, oriented and ordered by matchweek NUMBER.
 *
 * ⚠ NUMBER ORDER IS RIGHT HERE AND WRONG FOR "THE LAST RESULT". Rounds are
 * played out of numerical order — migration 101 measured a minimum gap of minus
 * 121 days across three real seasons — so the lowest-numbered unsettled week is
 * the one you are in, while the most recent RESULT has to be found by
 * `settled_at`. Hence the two different reductions below.
 */
export function orientDuels(duels: DuelRow[], ownEntryIds: string[]): MyDuel[] {
  const own = new Set(ownEntryIds)
  const out: MyDuel[] = []
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
}

/** The duel in focus — the first UNSETTLED bout, falling back to the last result. */
export function currentDuel(mine: MyDuel[]): MyDuel | null {
  const unsettled = mine.find((m) => !m.duel.settled_at)
  if (unsettled) return unsettled
  const settled = mine.filter((m) => m.duel.settled_at)
  if (settled.length === 0) return null
  return settled.reduce((a, b) => (a.duel.settled_at! > b.duel.settled_at! ? a : b))
}

/**
 * When this viewer's most recent duel was DECIDED.
 *
 * ⚠ NOT `current`'s. Once next week's duel reveals, `current` moves on to it
 * while last week's recap may still be unseen — the ordinary case for anyone who
 * does not open the app on a Monday.
 */
export function lastSettledAt(mine: MyDuel[]): string | null {
  let latest: string | null = null
  for (const m of mine) {
    const at = m.duel.settled_at
    if (at && (latest === null || at > latest)) latest = at
  }
  return latest
}

export type ShowdownPhaseInput = {
  duels: DuelRow[]
  ownEntryIds: string[]
  /** The first matchweek still SEALED, from the server. */
  sealedMatchweek: number | null
  /** The matchweek being played right now, from the server. Null between rounds. */
  inPlayMatchweek: number | null
  /** entry_id → `pool_entries.last_reveal_seen_duel` (136), the viewer's own. */
  revealSeen: Map<string, string | null>
  /** Migration 136 is not deployed — suppress the walkout. */
  revealColumnMissing: boolean
  /** `pool_entries.last_recap_seen_at` (122), as the client currently believes it. */
  recapSeenAt: string | null
  /**
   * A walkout the viewer has just watched, before the write comes back.
   *
   * ⚠ IT OVERRIDES THE MARKER RATHER THAN REPLACING IT. The server value is the
   * truth and re-arrives on every navigation; this only carries the gap between
   * pressing Skip and the row being updated.
   */
  seenOverride?: string | null
}

export type ShowdownPhase = DuelPhaseResult & {
  mine: MyDuel[]
  current: MyDuel | null
}

export function showdownPhase(input: ShowdownPhaseInput): ShowdownPhase {
  const mine = orientDuels(input.duels, input.ownEntryIds)
  const current = currentDuel(mine)
  const youEntry = current?.you.entry ?? null

  /**
   * ⚠ THE COLUMN MAY BE KNOWN-ABSENT, WHICH IS NOT `null`. Null means "never
   * watched one" and OPENS the walkout; absent means the dismissal cannot be
   * stored, which must CLOSE it, or the ceremony replays on every page load.
   * Saying "the reveal I last watched is the one on screen" does that in VALUES
   * rather than as an extra branch, so `duelPhase` keeps one code path. It
   * re-arms itself the moment 136 lands.
   */
  const stored = input.revealColumnMissing
    ? current?.duel.duel_id ?? null
    : youEntry ? input.revealSeen.get(youEntry) ?? null : null

  const phase = duelPhase({
    hasDraw: mine.length > 0 || input.sealedMatchweek !== null,
    current: current
      ? {
          duelId: current.duel.duel_id,
          matchweek: current.matchweek,
          settledAt: current.duel.settled_at,
        }
      : null,
    sealedMatchweek: input.sealedMatchweek,
    /**
     * ⚠ THE SERVER'S OWN ANSWER, and it must be about `current`'s week rather
     * than merely "some week is in play". A late joiner (migration 100) has no
     * duel in the week being played, and telling the machine football is
     * happening would put their finished bout on a live band.
     */
    isInPlay: input.inPlayMatchweek !== null && current?.matchweek === input.inPlayMatchweek,
    lastSettledAt: lastSettledAt(mine),
    revealSeenDuel: input.seenOverride ?? stored,
    recapSeenAt: input.recapSeenAt,
  })

  return { ...phase, mine, current }
}

/**
 * The matchweek The Room must NOT offer yet.
 *
 * ⚠⚠ "REVEALED" MEANS TWO THINGS AND THIS IS THE SECOND ONE. Migration 116
 * reveals a duel to the DATABASE — the rows arrive in the payload; the walkout
 * reveals it to the MEMBER. Those were the same moment until phase 2 existed,
 * and in the gap between them the Room would list a name the band two tabs away
 * is still calling "Sealed".
 *
 * ⚠ IT HIDES A WEEK, NOT A NAME. Blanking the opponent inside the row would
 * leave a duel that looks like a bye — and a bye is structural (`entry_b IS
 * NULL`), so faking one is a lie the rest of the code cannot see through. The
 * week simply is not offered, and arrives whole the moment the walkout is
 * watched.
 */
export function unwatchedMatchweek(phase: ShowdownPhase): number | null {
  return phase.phase === 'revealable' ? phase.matchweek : null
}
