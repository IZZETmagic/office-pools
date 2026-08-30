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
// ## And why "precedes" is only half the rule — AMENDED 2026-08-29
//
// The paragraph above settles where a straggler goes and says nothing about
// where a PULLED-AHEAD game goes, because backwards is free for a straggler and
// unavailable for a pulled-ahead game: it is its own round's first kickoff, so
// there is nothing behind it but rounds that have already locked. The original
// answer — leave it, and let it drag its own round's deadline forward — was
// assumed rather than measured, and La Liga 2026/27 matchweek 6 falsifies it:
// one fixture on 3 September against nine on 16 September closes the round
// thirteen days early and, ordered by lock time, opens it ahead of matchweeks 4
// and 5, which are left a 24-hour picking window each.
//
// So a pulled-ahead fixture now weighs the two deadlines and takes the cheaper —
// `cheaperRoundAhead` below. Over the three rounds La Liga has of this shape it
// moves exactly one, which is the point: this is a tie-break for a case that had
// no rule, not a new direction of travel. Backwards is still free, still tried
// first, and still wins whenever it is available.
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
  /**
   * 'date'  — the fixture moved, and a later round now holds its date.
   * 'early' — the fixture is played BEFORE the bulk of its own round, and the
   *           round it precedes is a cheaper deadline than its own.
   * 'floor' — its round got too thin to be a round.
   */
  reason: 'date' | 'early' | 'floor'
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

/**
 * How far in front of its first kickoff a matchweek locks.
 *
 * Mirrors `refresh_league_matchweek_window` (migration 101):
 * `lock_at = first_kickoff_at - interval '1 hour'`. The planner needs it for one
 * question only — whether a round it is about to drag a deadline onto would
 * still be open afterwards — so it is a guard, not a second definition of the
 * deadline. Nothing here writes a lock.
 */
export const LOCK_LEAD_MS = 60 * 60 * 1000

const t = (iso: string | null): number =>
  iso === null ? Number.POSITIVE_INFINITY : Date.parse(iso)


/** Has this matchweek's deadline passed? A null lock has not. */
function isLocked(mw: RehomeMatchweek, now: number): boolean {
  return mw.lockAt !== null && Date.parse(mw.lockAt) <= now
}

/**
 * Decision 10's "most recently precedes": the last round already under way by
 * the time this fixture kicks off. Null when nothing is.
 *
 * `ordered` must already be sorted by `windowStart`, which lets this stop at the
 * first round starting later rather than scanning the season.
 */
function lastWindowAtOrBefore(
  ordered: RehomeMatchweek[],
  when: number,
  windowStart: (m: RehomeMatchweek) => number,
): RehomeMatchweek | null {
  let found: RehomeMatchweek | null = null
  for (const m of ordered) {
    const start = windowStart(m)
    if (!Number.isFinite(start)) continue
    if (start <= when) found = m
    else break
  }
  return found
}

/**
 * The round ahead of this fixture, when moving into it is a net gain.
 *
 * Only ever asked of a fixture that cannot go backwards. It is tempting to weigh
 * this by comparing each round's deadline against its own bulk, and that is
 * wrong: it moved four March fixtures of 2023 round 29 into round 30 and dragged
 * round 30's deadline back **13.9 days** to do it, which is the harm the rule
 * above exists to avoid, merely relocated.
 *
 * Derive it instead. Write the total damage — how far each deadline sits in
 * front of the football it is a round of — for both outcomes, where A is this
 * fixture's round and B the one ahead:
 *
 *   stay:  (A_bulk − when)    + (B_bulk − B_first)
 *   move:  (A_bulk − A_next)  + (B_bulk − when)
 *
 * Subtract, and **both bulks cancel**: moving is better by exactly
 * `A_next − B_first`. Nothing about how the rounds are shaped survives, only
 * this — *is the round ahead played sooner than the rest of my own round?*
 * Which is also the honest reading of the question: a game on 3 September that
 * shares a label with nine games on 16 September belongs, for picking purposes,
 * with the ones played the same week.
 *
 * Ties stay put. The fixture is already where the provider filed it, and a rule
 * that moves on a tie churns the schedule for nothing.
 */
function cheaperRoundAhead(
  f: RehomeFixture,
  when: number,
  ordered: RehomeMatchweek[],
  windowStart: (m: RehomeMatchweek) => number,
  restOfRound: Map<string, number[]>,
  now: number,
): string | null {
  // What this round's deadline becomes once this fixture leaves — its second
  // earliest kickoff, which is `lock_at` recomputed by hand.
  //
  // ⚠ From the ORIGINAL holdings, never from `held` as it is being mutated. Four
  // fixtures sharing an early slot must each see the other three, or they leave
  // one at a time, each one making the next look lonelier than it is.
  const sorted = restOfRound.get(f.matchweekId)
  if (sorted === undefined) return null
  // Nothing else in the round: leaving empties it. The floor rule below is the
  // one that decides what happens to a round that thin, working backwards where
  // no deadline moves — so this must not pre-empt it.
  if (sorted.length < 2) return null
  const ownNext = sorted[1]
  // Not the earliest of its own round, so leaving would not move its deadline at
  // all. All cost, no gain.
  if (ownNext <= when) return null

  const ahead = ordered.find(
    (m) => m.matchweekId !== f.matchweekId && windowStart(m) > when,
  )
  if (ahead === undefined) return null
  if (isLocked(ahead, now)) return null

  if (windowStart(ahead) >= ownNext) return null

  // ⚠ THE MOVE DRAGS `ahead`'s DEADLINE BACK ONTO THIS KICKOFF. If that deadline
  // would land in the past, the round locks the instant the move is written and
  // nobody in it can pick at all — strictly worse than the thirteen days this
  // rule exists to save. Cheaper is not the only test; the result must still be
  // a round somebody can play.
  if (when - LOCK_LEAD_MS <= now) return null

  return ahead.matchweekId
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

  const held = new Map<string, RehomeFixture[]>(matchweeks.map((m) => [m.matchweekId, []]))
  for (const f of fixtures) held.get(f.matchweekId)?.push(f)

  /**
   * The season as it stands, frozen: every round's window and the rounds in that
   * order.
   *
   * Window order, not number order. Three real seasons contain rounds played out
   * of numerical order — the minimum gap between consecutive rounds is MINUS 121
   * days — so `matchweek_number` is not a timeline and must never be used as one.
   *
   * ⚠ THE WINDOW IS DERIVED FROM THE FIXTURES, not read from `firstKickoffAt`,
   * and that is the whole reason pass 1a runs before 1b. A stored window is the
   * round's earliest kickoff, so ONE pulled-ahead fixture drags its whole round
   * to the front of this ordering — and then every OTHER fixture in that round
   * looks like it belongs somewhere else. Against La Liga 2026/27 the stale
   * ordering planned nine of matchweek 6's ten fixtures into matchweek 5 and
   * emptied matchweek 6, on a season nobody had touched; the same shape destroyed
   * round 29 of 2024 in the replay. Re-freezing once 1a has taken the outlier out
   * puts the round back on the football it is made of.
   *
   * ⚠ FROZEN PER PASS, not read live. Two reasons, and both have already bitten.
   * A live window makes the plan depend on the order the fixtures happen to
   * arrive in, which is unreproducible. And `lastWindowAtOrBefore` stops at the
   * first round starting later than the fixture — a sorted-array early exit that
   * is silently wrong the moment the values move underneath the sort. Reading
   * live cost 10 of the 43 date moves the three-season replay expects, with no
   * error anywhere.
   */
  const freeze = () => {
    const windows = new Map<string, number>(
      matchweeks.map((m) => {
        const own = held.get(m.matchweekId)!
        return [
          m.matchweekId,
          own.length === 0
            ? t(m.firstKickoffAt)
            : Math.min(...own.map((f) => Date.parse(f.kickoffAt))),
        ]
      }),
    )
    const windowStart = (m: RehomeMatchweek) => windows.get(m.matchweekId) ?? Number.POSITIVE_INFINITY
    const ordered = [...matchweeks].sort(
      (a, b) => windowStart(a) - windowStart(b) || a.matchweekNumber - b.matchweekNumber,
    )
    return { ordered, windowStart }
  }

  // Snapshotted BEFORE anything moves. `cheaperRoundAhead` asks each fixture
  // "when is the rest of your round played", and the answer must not depend on
  // which fixture happened to be considered first — a plan that changed with
  // iteration order would be unreproducible against the same season.
  const kickoffsByRound = new Map<string, number[]>(
    matchweeks.map((m) => [
      m.matchweekId,
      held
        .get(m.matchweekId)!
        .map((f) => Date.parse(f.kickoffAt))
        .sort((a, b) => a - b),
    ]),
  )

  const moves: RehomeMove[] = []
  const move = (f: RehomeFixture, to: string, reason: RehomeMove['reason']) => {
    const from = f.matchweekId
    const src = held.get(from)
    if (src) src.splice(src.indexOf(f), 1)
    held.get(to)!.push(f)
    moves.push({ fixtureId: f.fixtureId, fromMatchweekId: from, toMatchweekId: to, reason })
    f.matchweekId = to
  }

  /** The three reasons a fixture is off-limits to either pass. */
  const untouchable = (f: RehomeFixture): boolean => {
    // A played fixture is history: re-homing it would restate a scored week.
    if (f.isCompleted) return true
    // An admin who took control of a fixture outranks this.
    if (f.manualOverride) return true
    const src = byId.get(f.matchweekId)
    if (!src) return true
    // "…and only while its current matchweek is still unlocked." Predictions
    // made before a lock stand, and the fixture scores wherever it sits.
    return isLocked(src, now)
  }

  // -------------------------------------------------- 1a. pulled ahead of its round
  //
  // ⚠ THIS RUNS FIRST, and the order is load-bearing rather than stylistic. A
  // pulled-ahead fixture is the thing that corrupts the window ordering pass 1b
  // reads, so it has to be gone before 1b looks. See `freeze` above.
  //
  // Every decision here is taken against the ORIGINAL fixture list — the
  // ordering below is built once, and `kickoffsByRound` is a snapshot — so the
  // plan is the same whatever order the fixtures arrive in.
  const early = freeze()
  for (const f of fixtures) {
    if (untouchable(f)) continue
    const when = Date.parse(f.kickoffAt)

    // Backwards is free, so it wins whenever it is available and this pass has
    // nothing to say. It is unavailable exactly when the fixture already defines
    // the earliest window there is — which is what a pulled-ahead fixture always
    // does, since it IS its own round's first kickoff — or when the round behind
    // it has locked.
    const back = lastWindowAtOrBefore(early.ordered, when, early.windowStart)
    if (back !== null && back.matchweekId !== f.matchweekId && !isLocked(back, now)) continue

    const forward = cheaperRoundAhead(f, when, early.ordered, early.windowStart, kickoffsByRound, now)
    if (forward !== null) move(f, forward, 'early')
  }

  // ------------------------------------------------------------ 1b. by date
  //
  // Decision 10 proper: the round whose window most recently precedes the date
  // the fixture is actually played on. Re-ordered now that 1a has taken the
  // outliers out, so a round is ranked by the football it is really made of.
  const dated = freeze()
  for (const f of fixtures) {
    if (untouchable(f)) continue

    const when = Date.parse(f.kickoffAt)
    let target = lastWindowAtOrBefore(dated.ordered, when, dated.windowStart)
    // Earlier than every window: it belongs to the first matchweek there is.
    if (target === null)
      target = dated.ordered.find((m) => Number.isFinite(dated.windowStart(m))) ?? null
    if (target === null || target.matchweekId === f.matchweekId) continue

    // ⚠ The target must be unlocked too, and this is not the same check as the
    // source. A fixture PULLED AHEAD of the bulk lands in a window that may
    // already have closed, and adding a game to a week people have finished
    // picking hands them a fixture they never saw. It stays where it is — and
    // 1a has already asked whether the round ahead is a better home than that.
    if (isLocked(target, now)) continue

    move(f, target.matchweekId, 'date')
  }

  // ----------------------------------------------------------- 2. the floor
  // Walked in window order so a thin round never absorbs into one that is about
  // to be emptied itself. Re-derived again: 1b has just changed what each round
  // holds, and a round is thin or not according to what it holds NOW.
  const floored = freeze()
  for (const m of floored.ordered) {
    const count = held.get(m.matchweekId)!.length
    if (count === 0 || count >= MIN_ROUND_FIXTURES) continue
    if (isLocked(m, now)) continue

    // Backwards, never forwards — same reasoning as the date rule. Absorbing
    // into the round AFTER would drag its lock back onto these fixtures' dates;
    // absorbing into the round BEFORE leaves every deadline untouched, because
    // everything arriving is played later than what is already there.
    let into: RehomeMatchweek | null = null
    for (const c of floored.ordered) {
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
