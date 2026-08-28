// =============================================================
// Re-homing: our matchweeks are PICKING rounds, not league rounds
// =============================================================
// api-football never re-homes a moved fixture. Verified against three real
// Premier League seasons: *Arsenal v Manchester City*, labelled
// `Regular Season - 12`, bulk played 18 Oct 2022, actually played 15 Feb 2023 —
// 120 days later, still labelled round 12. Round 8 of 2022 has three fixtures
// played 145, 180 and 200 days after the rest. The round label is permanent, so
// tracking where a fixture is actually PICKED is ours to do.
//
// Decision 10:
//
//   > A fixture whose date moves is re-homed to the matchweek whose window most
//   > recently precedes its new date — and only while its current matchweek is
//   > still unlocked.
//
// ## Why "most recently precedes", i.e. the weekend BEFORE
//
// A midweek makeup game attached to the weekend before is a late straggler: the
// lock is untouched, it is predicted on the Friday and played the following
// Wednesday. Attached to the weekend after, it would drag that matchweek's lock
// back onto the Tuesday and leave a one-day picking window. The measured split
// is decisive — late stragglers are 10 of 114 rounds and harmless; games pulled
// ahead of the bulk are 3 of 114 and cost a median 6 days of picking time.
//
// ## Why this is a pure function
//
// Every other league rule lives in SQL, because mobile writes predictions
// directly and the UI is not a gate. This one is different: the ONLY thing that
// ever moves a fixture between matchweeks is the ingest arm, which is
// server-side and has no second writer to guard against. Keeping the policy
// here buys something SQL cannot — it runs against three real seasons in a unit
// test, which is how the floor below was chosen rather than guessed.
//
// The WRITE still belongs to the database (`league_apply_rehome`), and so does
// every consequence of it: moving `matchweek_id` fires
// `trg_refresh_league_matchweek_window_upd`, which recomputes both sides.

/** A matchweek as the planner sees it: a slot with a window and a deadline. */
export type RehomeMatchweek = {
  matchweekId: string
  matchweekNumber: number
  /** null before the window has ever been derived. Never re-derived once passed. */
  lockAt: string | null
  /** null when the matchweek holds no fixtures. */
  firstKickoffAt: string | null
}

export type RehomeFixture = {
  fixtureId: string
  matchweekId: string
  kickoffAt: string
  isCompleted: boolean
  manualOverride: boolean
}

export type RehomeMove = {
  fixtureId: string
  fromMatchweekId: string
  toMatchweekId: string
  /** 'date' — the fixture moved. 'floor' — its round got too thin to be a round. */
  reason: 'date' | 'floor'
}

export type RehomePlan = {
  moves: RehomeMove[]
  /**
   * Matchweeks left holding nothing. ⚠ Load-bearing for the caller: a matchweek
   * with no fixtures never snapshots its ranks (migration 094), and Showdown and
   * Last Man Standing both settle off that snapshot — so an emptied matchweek
   * stalls both modes permanently unless it is skipped.
   */
  emptied: string[]
}

/**
 * The smallest number of fixtures that still makes a picking round.
 *
 * Ryan's call, from the simulation over three seasons: with no floor the same
 * rule produces rounds of one fixture, which is not a week of football to argue
 * about — it is a coin toss that decides a duel. Five is where the tail stops
 * being degenerate, and it costs about one picking round a season.
 */
export const MIN_ROUND_FIXTURES = 5

const t = (iso: string | null): number =>
  iso === null ? Number.POSITIVE_INFINITY : Date.parse(iso)

/** Has this matchweek's deadline passed? A null lock has not. */
function isLocked(mw: RehomeMatchweek, now: number): boolean {
  return mw.lockAt !== null && Date.parse(mw.lockAt) <= now
}

/**
 * Where every fixture should be picked, given where they are actually played.
 *
 * Pure: it reads state and returns intent. Nothing here writes, and nothing here
 * knows about a database.
 */
export function planRehome(
  matchweeks: RehomeMatchweek[],
  fixtures: RehomeFixture[],
  nowIso: string,
): RehomePlan {
  const now = Date.parse(nowIso)
  const byId = new Map(matchweeks.map((m) => [m.matchweekId, m]))

  // Window order, not number order. Three real seasons contain rounds played out
  // of numerical order — the minimum gap between consecutive rounds is MINUS 121
  // days — so `matchweek_number` is not a timeline and must never be used as one.
  const ordered = [...matchweeks].sort(
    (a, b) => t(a.firstKickoffAt) - t(b.firstKickoffAt) || a.matchweekNumber - b.matchweekNumber,
  )

  const held = new Map<string, RehomeFixture[]>(matchweeks.map((m) => [m.matchweekId, []]))
  for (const f of fixtures) held.get(f.matchweekId)?.push(f)

  const moves: RehomeMove[] = []
  const move = (f: RehomeFixture, to: string, reason: RehomeMove['reason']) => {
    const from = f.matchweekId
    const src = held.get(from)
    if (src) src.splice(src.indexOf(f), 1)
    held.get(to)!.push(f)
    moves.push({ fixtureId: f.fixtureId, fromMatchweekId: from, toMatchweekId: to, reason })
    f.matchweekId = to
  }

  // ------------------------------------------------------------ 1. by date
  for (const f of fixtures) {
    // A played fixture is history: re-homing it would restate a scored week.
    if (f.isCompleted) continue
    // An admin who took control of a fixture outranks this.
    if (f.manualOverride) continue

    const src = byId.get(f.matchweekId)
    if (!src) continue
    // "…and only while its current matchweek is still unlocked." Predictions
    // made before a lock stand, and the fixture scores wherever it sits.
    if (isLocked(src, now)) continue

    const when = Date.parse(f.kickoffAt)
    let target: RehomeMatchweek | null = null
    for (const m of ordered) {
      if (m.firstKickoffAt === null) continue
      if (Date.parse(m.firstKickoffAt) <= when) target = m
      else break
    }
    // Earlier than every window: it belongs to the first matchweek there is.
    if (target === null) target = ordered.find((m) => m.firstKickoffAt !== null) ?? null
    if (target === null || target.matchweekId === f.matchweekId) continue

    // ⚠ The target must be unlocked too, and this is not the same check as the
    // source. A fixture PULLED AHEAD of the bulk lands in a window that may
    // already have closed, and adding a game to a week people have finished
    // picking hands them a fixture they never saw. It stays where it is, where
    // the deadline still protects it — its new earlier date drags its own
    // matchweek's lock forward, which is exactly the right answer.
    if (isLocked(target, now)) continue

    move(f, target.matchweekId, 'date')
  }

  // ----------------------------------------------------------- 2. the floor
  // Walked in window order so a thin round never absorbs into one that is about
  // to be emptied itself.
  for (const m of ordered) {
    const count = held.get(m.matchweekId)!.length
    if (count === 0 || count >= MIN_ROUND_FIXTURES) continue
    if (isLocked(m, now)) continue

    // Backwards, never forwards — same reasoning as the date rule. Absorbing
    // into the round AFTER would drag its lock back onto these fixtures' dates;
    // absorbing into the round BEFORE leaves every deadline untouched, because
    // everything arriving is played later than what is already there.
    let into: RehomeMatchweek | null = null
    for (const c of ordered) {
      if (c.matchweekId === m.matchweekId) break
      if (isLocked(c, now)) continue
      if (held.get(c.matchweekId)!.length === 0) continue
      into = c
    }
    if (into === null) continue

    for (const f of [...held.get(m.matchweekId)!]) move(f, into.matchweekId, 'floor')
  }

  return {
    moves,
    emptied: matchweeks
      .filter((m) => held.get(m.matchweekId)!.length === 0)
      .map((m) => m.matchweekId),
  }
}
