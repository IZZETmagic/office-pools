// =============================================================
// WHAT A POOL CARD SAYS — one definition, for both lists
// =============================================================
// The dashboard and the pools list render the same card. They rendered it from
// two hand-kept copies, and the copies had drifted: the action pill existed on
// one page and not the other, the deadline chip used two different formats, and
// the bottom row pinned itself on one card and dangled on the other. The doc
// comment on the old `ProgressTile` had already noticed the risk and said the
// two "had drifted nowhere only by luck" — by then they had.
//
// So the card is now one component (components/pools/PoolCard.tsx) and every
// sentence on it is decided here, where it can be tested without a DOM.
//
// ## Three things worth knowing before editing
//
// 1. ⚠ THE UNIT IS THE CURRENT DECISION, NOT THE SEASON. `totalMatches` /
//    `predictedMatches` mean the open matchweek for a league pool and the whole
//    tournament for a World Cup one. Over 380 fixtures "12 of 380" would be
//    true and useless; the weekly question is the one a member is asking.
//    Both page servers already narrow it — see lib/league/poolCards.ts.
//
// 2. ⚠ NOTHING HERE SAYS "SUBMITTED". Picks save as they are made and the
//    deadline is the only switch, so there is no moment of submitting to
//    report — see drafts/2026-08-29_autosave_no_submit.md. The pill describes
//    the STATE OF THE PICKS instead, which is true whether or not a member ever
//    pressed anything, and stays true when the flows drop their buttons.
//
// 3. ⚠ WALL-CLOCK TEXT IS CLIENT-ONLY. Anything reading local date fields
//    (`getHours`, `toLocaleDateString`) formats in the RUNTIME's timezone, and
//    on the server that is UTC. Both old copies did exactly this, which is the
//    bug components/LocalTime.tsx exists to fix — and it bites hardest now,
//    because a league card's clock is a Friday 19:00 kickoff rather than a date
//    nine months out. `deadlineChip` therefore returns a duration-only
//    `fallback` for the server and first client render, and the wall-clock
//    `format` for after mount.
// =============================================================

import type { PredictionMode } from '@/lib/predictionMode'
import type { FormResult } from '@/lib/design/formDots'
import type { ShowdownCardFacts, DuelOutcome, LmsCardFacts, TableCardFacts } from '@/lib/league/poolCards'
import { isLeaguePoolMode } from '@/lib/design/poolMode'
import { matchweekTile } from '@/lib/league/matchweekTile'
import { getLevelName } from '@/lib/levelNames'
import { formatNumber } from '@/lib/format'

/** One face in the card's avatar stack. Matches `AvatarPerson`. */
export type PoolCardMember = {
  user_id: string
  full_name: string | null
  username: string | null
}

/**
 * Everything the card reads off a pool.
 *
 * Both page servers build a superset of this; the card asks for no more than it
 * paints, so a field added for one page cannot quietly become load-bearing for
 * the other.
 */
export type PoolCardPool = {
  pool_id: string
  pool_name: string
  pool_code: string
  status: string
  /**
   * The card's clock.
   *
   * ⚠ For a league pool this is the OPEN MATCHWEEK'S LOCK, not
   * `pools.prediction_deadline` — every league pool in production carries the
   * season end (2027-05-30) in that column. Both servers substitute it; see the
   * note on `deadlineAt` in lib/league/poolCards.ts.
   */
  prediction_deadline: string | null
  prediction_mode: PredictionMode
  /** pickem | showdown | last_man_standing | table. NULL on a World Cup pool. */
  league_mode: string | null
  role: string
  total_points: number
  current_rank: number | null
  /** NULL for a league pool: there is no league XP system. */
  highest_level: number | null
  /** `tournaments.external_league_id` — the competition, for the rail. */
  externalLeagueId?: number | null
  openMatchweekNumber?: number | null
  inPlayMatchweekNumber?: number | null
  matchweekCount?: number | null
  /**
   * Derived from the picks on both paths, never read as a member's press.
   * League pools derive it in lib/league/poolCards.ts; World Cup pools from
   * their entries. Kept because the scoring engine reads the column, not
   * because the card needs an act to have happened.
   */
  has_submitted_predictions: boolean
  memberCount: number
  /**
   * The faces at the card's foot — the pool's first few members by `joined_at`,
   * as RN's home card shows them.
   *
   * ⚠ THIS IS NOT THE WHOLE POOL, and `memberCount` above is not derivable from
   * it. Both page servers ask for three rows and the exact count in one query;
   * the stack's "+N" is the count minus what it drew. A 192-member pool is the
   * largest in production and it still sends three rows.
   */
  members: PoolCardMember[]
  totalEntries: number
  hasScoringStarted: boolean
  /** Decisions owed in the CURRENT unit. See note 1 in the header. */
  totalMatches: number
  /** How many of them this member has made. */
  predictedMatches: number
  form: FormResult[]
  /** "Round of 16" on a progressive pool. NULL elsewhere — league included. */
  currentRoundLabel?: string | null
  /** Showdown's tiles. NULL for every other mode. See lib/league/poolCards.ts. */
  showdown?: ShowdownCardFacts | null
  /** Last Man Standing's tiles. NULL for every other mode. */
  lms?: LmsCardFacts | null
  /** Predict the Table's tiles. NULL for every other mode. */
  table?: TableCardFacts | null
  brand_name?: string | null
  brand_emoji?: string | null
  brand_color?: string | null
  brand_logo_url?: string | null
}

/**
 * Table mode and Last Man Standing are ONE decision, not N.
 *
 * Mirrors `SINGLE_DECISION_MODES` in lib/league/poolCards.ts, which is what
 * makes `totalMatches` 1 for these two. The consequence here is copy: "All 1
 * picked" is not a sentence, and "0 of 1" is not how anyone describes not
 * having ordered a table yet.
 */
const SINGLE_DECISION_MODES = new Set(['table', 'last_man_standing'])

export function isSingleDecision(pool: Pick<PoolCardPool, 'league_mode'>): boolean {
  return SINGLE_DECISION_MODES.has(pool.league_mode ?? '')
}

// -------------------------------------------------------------
// THE ACTION PILL
// -------------------------------------------------------------

export type CardAction = {
  label: string
  icon: 'arrow' | 'check' | null
  /** Tailwind classes for the pill. */
  className: string
  /** True when the pill is a button that jumps straight to the picking screen. */
  isButton: boolean
}

/**
 * What this member has left to do, in three or four words.
 *
 * ⚠ THE ORDER OF THESE BRANCHES IS THE WHOLE FUNCTION. A completed pool is
 * finished whatever the picks say; a locked one offers nothing whatever is
 * missing. Only after both is it worth asking how far through the member is.
 */
export function poolCardAction(pool: PoolCardPool, now: number = Date.now()): CardAction {
  const single = isSingleDecision(pool)

  if (pool.status === 'completed') {
    return { label: 'Results', icon: 'arrow', className: 'bg-silver text-ink', isButton: false }
  }

  const deadline = pool.prediction_deadline ? new Date(pool.prediction_deadline).getTime() : null
  const locked = deadline !== null && deadline <= now
  const complete = pool.totalMatches > 0 && pool.predictedMatches >= pool.totalMatches

  // Locked and short — there is nothing to offer, and an amber "Pick" would be
  // a button that cannot do what it says. The deadline chip beside it already
  // reads "Closed"; this says what that cost.
  if (locked && !complete) {
    return { label: 'Not picked', icon: null, className: 'bg-silver text-muted', isButton: false }
  }

  if (complete || pool.has_submitted_predictions) {
    return {
      label: single ? settledLabel(pool) : 'All picked',
      icon: 'check',
      className: 'bg-success-100 dark:bg-success-900/30 text-success-900 font-bold',
      isButton: false,
    }
  }

  // Part-way through, and this is the state the old pill could not show at all:
  // a member three fixtures into ten read exactly the same as one who had not
  // opened the pool. It cannot happen on a single-decision mode, which is why
  // that check comes first.
  if (!single && pool.predictedMatches > 0 && pool.totalMatches > 0) {
    return {
      label: `${pool.predictedMatches} of ${pool.totalMatches} picked`,
      icon: 'arrow',
      className: 'bg-warning-500 text-white',
      isButton: true,
    }
  }

  return { label: openingLabel(pool), icon: 'arrow', className: 'bg-warning-500 text-white', isButton: true }
}

/**
 * The invitation, when nothing has been decided yet.
 *
 * ⚠ A LEAGUE POOL'S PILL DOES NOT NAME ITS MATCHWEEK, and that is the whole
 * point of this comment. It used to say "Pick Matchweek 6" while the tile two
 * inches below said "Matchweek 3 · in play", and Ryan read that as a bug.
 *
 * Both numbers were right. They answer different questions — the tile answers
 * "where is the season", the pill answered "what can I still pick" — and they
 * diverge whenever a round locks early. La Liga 2026/27 MW6 holds *Real
 * Sociedad v Celta Vigo* on 3 September and its other nine fixtures on 16
 * September, so MW6 locks thirteen days before most of it is played and
 * genuinely IS the open matchweek: `league_open_matchweek` returns it in SQL,
 * and migration 058 drops a pick aimed anywhere else. See
 * lib/league/earlyKickoff.ts, which measured this at 3 of 38 La Liga rounds.
 *
 * So the pill could not be "corrected" to the tile's number — that would point
 * the button at a locked matchweek. It drops the number instead. One number on
 * the card, no contradiction, and the picking screen explains the early lock on
 * arrival (RoundStatusCard renders "Picks close N days before most of this
 * matchweek is played").
 *
 * A progressive World Cup pool still names its round: its tile shows the XP
 * level, so "Round of 16" competes with nothing.
 */
function openingLabel(pool: PoolCardPool): string {
  if (pool.league_mode === 'table') return 'Predict the table'
  if (pool.league_mode === 'last_man_standing') return 'Pick your club'
  if (pool.currentRoundLabel) return `Pick ${pool.currentRoundLabel}`
  return 'Make your picks'
}

/** The done state for the two modes where "All picked" would be one decision. */
function settledLabel(pool: PoolCardPool): string {
  if (pool.league_mode === 'table') return 'Table set'
  if (pool.league_mode === 'last_man_standing') return 'Club picked'
  return 'All picked'
}

// -------------------------------------------------------------
// THE STATUS LINE — DELETED, and worth saying why
// -------------------------------------------------------------
// `poolCardStatusText` used to own the card's bottom-left: "No results yet",
// "Awaiting results", "On the podium!", "Keep climbing!". Every one of those
// was a restatement of a tile already on the card — the first two of a Points
// tile reading 0, the last two of the Rank tile two inches above them — and the
// slot now carries the member avatars instead, which are the only thing on the
// card that says WHO you are playing. Ryan's call, 2026-08-30.
//
// The member-count chip went with it for the same reason: the stack's "+N"
// already counts the pool.

// -------------------------------------------------------------
// THE CLOCK
// -------------------------------------------------------------

export type DeadlineChip = {
  /** False when there is no deadline at all — the chip is not rendered. */
  show: boolean
  /** Tailwind classes. Derived from the DURATION, so it is safe to render on the server. */
  className: string
  /** Duration-only text for the server and the first client render. */
  fallback: string
  /** Wall-clock text, run in the viewer's own timezone after mount. */
  format: (d: Date) => string
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * When the next decision is due.
 *
 * ⚠ SPLIT IN TWO ON PURPOSE, and the split is the timezone fix. `className` and
 * `fallback` are functions of the DURATION between two instants, which every
 * runtime agrees on; `format` reads local calendar fields, which only the
 * viewer's browser can get right. See note 3 in the header.
 *
 * ⚠ The hour is not decoration. A league deadline is a Friday 19:00 kickoff, and
 * the dashboard's old formatter printed dates only — "Aug 30, 2026 (1 day)" for
 * a lock that evening.
 */
export function deadlineChip(deadline: string | null, now: number = Date.now()): DeadlineChip {
  if (!deadline) {
    return { show: false, className: '', fallback: '', format: () => '' }
  }

  const at = new Date(deadline).getTime()
  const left = at - now

  if (left <= 0) {
    return { show: true, className: 'text-danger-600', fallback: 'Closed', format: () => 'Closed' }
  }

  const className =
    left < DAY ? 'text-danger-600' : left < 7 * DAY ? 'text-warning-600' : 'text-muted'

  if (left < HOUR) {
    const mins = Math.max(1, Math.round(left / MINUTE))
    const text = `Locks in ${mins} min`
    return { show: true, className, fallback: text, format: () => text }
  }

  const days = Math.ceil(left / DAY)

  return {
    show: true,
    className,
    // Duration only: true in every timezone, so the server and the client's
    // first paint agree and React has nothing to reconcile.
    fallback: left < DAY ? `Locks in ${Math.round(left / HOUR)}h` : `${days}d left`,
    format: (d) => {
      const time = clockTime(d)
      // Inside a day the hour is the whole answer; a weekday name would be
      // ambiguous for a lock that is 20 hours away and tomorrow.
      if (left < DAY) return `Locks ${time}`
      // Within the week, the weekday is how people actually hold a fixture —
      // "Locks Fri 7:00 PM", not "in 3 days".
      if (left < 7 * DAY) {
        return `Locks ${d.toLocaleDateString('en-US', { weekday: 'short' })} ${time}`
      }
      const month = d.toLocaleDateString('en-US', { month: 'short' })
      return `${month} ${d.getDate()}, ${time}`
    },
  }
}

function clockTime(d: Date): string {
  const hour = d.getHours()
  const minute = d.getMinutes().toString().padStart(2, '0')
  const period = hour >= 12 ? 'PM' : 'AM'
  return `${hour % 12 || 12}:${minute} ${period}`
}

// -------------------------------------------------------------
// THE ORDER THE CARDS COME IN
// -------------------------------------------------------------

/**
 * The dashboard's needs-attention sort, which existed twice verbatim inside
 * DashboardClient — once for the mobile strip and once for the desktop grid.
 *
 * Reading order: a branded pool is somebody's front door and goes first;
 * unread banter is a person waiting on you; then how much of the current
 * decision is outstanding, with STARTED-BUT-UNFINISHED ahead of untouched
 * (the half-done one is the one you will lose by forgetting); then whichever
 * locks soonest.
 */
export function byAttention(unreadCounts: Map<string, number>) {
  return (a: PoolCardPool, b: PoolCardPool): number => {
    const brand = rankBrand(a) - rankBrand(b)
    if (brand !== 0) return brand

    const unread = rankUnread(a, unreadCounts) - rankUnread(b, unreadCounts)
    if (unread !== 0) return unread

    const progress = rankProgress(a) - rankProgress(b)
    if (progress !== 0) return progress

    return deadlineOrder(a) - deadlineOrder(b)
  }
}

function rankBrand(p: PoolCardPool): number {
  return p.brand_name && (p.brand_emoji || p.brand_logo_url) && p.brand_color ? 0 : 1
}

function rankUnread(p: PoolCardPool, unread: Map<string, number>): number {
  return (unread.get(p.pool_id) ?? 0) > 0 ? 0 : 1
}

function rankProgress(p: PoolCardPool): number {
  const done = p.totalMatches > 0 && p.predictedMatches >= p.totalMatches
  if (done || p.has_submitted_predictions) return 2
  return p.predictedMatches > 0 ? 0 : 1
}

function deadlineOrder(p: PoolCardPool): number {
  return p.prediction_deadline ? new Date(p.prediction_deadline).getTime() : Infinity
}


// -------------------------------------------------------------
// THE KPI STRIP — the one slot that varies with the mode
// -------------------------------------------------------------

/**
 * Four tiles. Everything else on the card is fixed furniture; this is where a
 * mode gets to be itself.
 *
 * ⚠ ADD A MODE HERE, NOT IN THE COMPONENT. `PoolCard` renders whatever this
 * returns, so a new mode is a branch in `kpiTiles` plus whatever facts it needs
 * on `PoolCardPool` — no JSX, and it is unit-testable without a DOM. Last Man
 * Standing and Table still fall through to the default and are owed their own
 * branches.
 */
export type KpiTile =
  | {
      kind: 'stat'
      label: string
      value: string
      sub?: string
      /** `accent` is the mode's own number; `ink` a neutral one; `muted` an absence. */
      tone: 'accent' | 'ink' | 'muted'
      /** Wider than its siblings, for a tile carrying a name rather than a number. */
      wide?: boolean
    }
  | { kind: 'dots'; label: string; dots: string[]; palette: 'form' | 'duel' }

export function kpiTiles(pool: PoolCardPool): KpiTile[] {
  if (pool.league_mode === 'showdown' && pool.showdown) return showdownTiles(pool.showdown, pool)
  if (pool.league_mode === 'last_man_standing' && pool.lms) return lmsTiles(pool.lms, pool)
  if (pool.league_mode === 'table' && pool.table) return tableTiles(pool.table, pool)
  return defaultTiles(pool)
}

/**
 * Showdown: the duel, the record, and who you play next.
 *
 * That phrase is DuelsTab's own header, and the tiles are it. The mode is a
 * layer over the weekly accuracy number, so accuracy points are not the number
 * that decides anything here — `duel_points` is, and it leads
 * `league_finalize_ranks`. Putting it in tile one means it and the Rank tile
 * beside it can never disagree.
 */
function showdownTiles(sd: ShowdownCardFacts, pool: PoolCardPool): KpiTile[] {
  return [
    {
      kind: 'stat',
      label: 'Duel pts',
      value: formatNumber(sd.duelPoints),
      // Byes are deliberately absent: a bye is not a result, and W/T/L is the
      // record a football follower already reads. DuelsTab shows byes in full.
      sub: `${sd.won}W ${sd.tied}T ${sd.lost}L`,
      tone: 'accent',
    },
    rankTile(pool),
    {
      kind: 'stat',
      label: 'This week',
      // A bye says so rather than showing a dash — with an odd number of members
      // somebody sits out every matchweek, and it is not an error.
      value: sd.isBye ? 'Bye' : (sd.opponentName ?? '—'),
      sub: sd.isBye ? 'sits out' : sd.duelMatchweek != null ? `MW ${sd.duelMatchweek}` : undefined,
      tone: sd.isBye || !sd.opponentName ? 'muted' : 'ink',
      wide: true,
    },
    { kind: 'dots', label: 'Form', dots: sd.recentDuels, palette: 'duel' },
  ]
}

/**
 * Last Man Standing: how many rounds you have won, and whether you are still in
 * this one.
 *
 * ⚠ THE SEASON SCORE IS ROUNDS WON, not survival. Rounds repeat all season —
 * Decision 9, because a single elimination is over in five or six matchweeks of
 * thirty-eight and a pool dead in September fails the purpose clause. So
 * `rounds_won` is tile one and leads `league_finalize_ranks`, ahead even of
 * Showdown's duel_points.
 *
 * The survivor count is a fact about the POOL, not the viewer, and it is the
 * mode's whole tension — nothing else on the card conveys "four of you left".
 */
function lmsTiles(lms: LmsCardFacts, pool: PoolCardPool): KpiTile[] {
  return [
    {
      kind: 'stat',
      label: 'Rounds won',
      value: formatNumber(lms.roundsWon),
      sub: lms.roundNumber != null ? `Round ${lms.roundNumber}` : undefined,
      tone: 'accent',
    },
    rankTile(pool),
    lmsWeekTile(lms),
    {
      kind: 'stat',
      label: 'Still in',
      value: String(lms.survivorsLeft),
      sub: lms.roundEntrants > 0 ? `of ${lms.roundEntrants}` : undefined,
      // Dimmed once you are out: the number is still true and still worth
      // watching, but it has stopped being about you.
      tone: lms.isEliminated ? 'muted' : 'ink',
    },
  ]
}

/**
 * The third tile, in the four states this mode has.
 *
 * ⚠ THE CLUB BEING PLAYED WINS, and the matchweek is always named.
 *
 * The tile is labelled "This week", and it used to be handed the pick for the
 * OPEN matchweek — the one you can still change. Those are the same week from
 * Monday night to Friday evening and different for the three days the football
 * is on, so on a live Saturday the card named a club whose game had not kicked
 * off and said nothing about the one being watched. Reproduced 30 Aug 2026: MW2
 * in play with Arsenal picked, MW3 open with Hull City picked, tile read
 * "Hull City". Same collapse `matchweekTile` was written to undo.
 *
 * In play wins WHEN THERE IS AN ANSWER, and otherwise it falls back rather than
 * inventing one. A round can open on the week after the one still being played,
 * and there is no pick for a week that preceded the round — reading that
 * absence as "you missed it" would alarm somebody who did nothing wrong.
 *
 * ⚠ "Out" is not an error state and must not read as one. Being knocked out is
 * the mode working, the round carries on without you, and a new one opens with
 * everybody back in. The matchweek shown is the one whose RESULT knocked you
 * out — see the column comment on `eliminated_matchweek`.
 */
function lmsWeekTile(lms: LmsCardFacts): KpiTile {
  if (lms.isEliminated) {
    return {
      kind: 'stat',
      label: 'This week',
      value: 'Out',
      sub: lms.eliminatedMatchweek != null ? `went MW ${lms.eliminatedMatchweek}` : undefined,
      tone: 'muted',
      wide: true,
    }
  }
  if (lms.inPlayClubName) {
    return {
      kind: 'stat',
      label: 'This week',
      value: lms.inPlayClubName,
      sub: lms.inPlayMatchweek != null ? `MW ${lms.inPlayMatchweek} in play` : undefined,
      tone: 'ink',
      wide: true,
    }
  }
  if (lms.openClubName) {
    return {
      kind: 'stat',
      label: 'This week',
      value: lms.openClubName,
      sub: lms.openMatchweek != null ? `MW ${lms.openMatchweek}` : undefined,
      tone: 'ink',
      wide: true,
    }
  }
  return { kind: 'stat', label: 'This week', value: 'Pick a club', tone: 'muted', wide: true }
}

/**
 * Predict the Table: one decision in August, and how it is aging.
 *
 * ⚠ THE SCORE IS PROVISIONAL until the season-end snapshot exists, and the card
 * says so. Scoring runs live all season by Decision 9 — a hidden bank revealed
 * on the last day would be a lurch, and the leaderboard must never lag — but
 * `league_standings` is upserted CURRENT STATE, so a June feed correction could
 * restate an award. `league_standings_final` is the copy that gets paid from.
 * "provisional" is that distinction, said out loud.
 *
 * There is no Form tile and no This-week tile: the mode has no weekly decision.
 * `spotOn` and `averageOff` are what move instead — how many clubs you nailed,
 * and how wrong the rest are.
 */
function tableTiles(t: TableCardFacts, pool: PoolCardPool): KpiTile[] {
  return [
    {
      kind: 'stat',
      label: 'Table pts',
      value: formatNumber(pool.total_points ?? 0),
      // ⚠ For a Table pool `total_points` IS the table score — match_points is
      // 0, so migration 080's `match_points + bonus_points + adjustment` is
      // just the bonus. It is also what the rank cascade falls through to here,
      // so tile 1 and tile 2 agree.
      sub: t.isFinal ? 'final' : 'provisional',
      tone: 'accent',
    },
    rankTile(pool),
    tableAccuracyTile(t),
    {
      kind: 'stat',
      label: 'Avg off',
      value: t.averageOff == null ? '—' : t.averageOff.toFixed(1),
      sub: t.averageOff == null ? undefined : 'places',
      tone: t.averageOff == null ? 'muted' : 'ink',
    },
  ]
}

/**
 * "Spot on", in the three states this mode has before it has a number.
 *
 * ⚠ AN UNPLAYED SEASON IS NOT A TABLE FULL OF MISSES. Every club's actual
 * position is NULL until it has a standings row, so a zero here in August would
 * be a judgement on a table nobody has had a chance to be right about.
 */
function tableAccuracyTile(t: TableCardFacts): KpiTile {
  if (!t.hasTable) {
    return { kind: 'stat', label: 'Spot on', value: '—', sub: 'no table yet', tone: 'muted' }
  }
  if (t.averageOff == null) {
    return { kind: 'stat', label: 'Spot on', value: '—', sub: 'not started', tone: 'muted' }
  }
  return {
    kind: 'stat',
    label: 'Spot on',
    value: String(t.spotOn),
    sub: `of ${t.clubCount}`,
    tone: t.spotOn > 0 ? 'ink' : 'muted',
  }
}

/** The World Cup shape, still the fallback for Pick'em. */
function defaultTiles(pool: PoolCardPool): KpiTile[] {
  const isLeague = isLeaguePoolMode(pool.prediction_mode)
  const tile = matchweekTile(pool)
  return [
    {
      kind: 'stat',
      label: 'Points',
      value: formatNumber(pool.total_points ?? 0),
      tone: 'accent',
    },
    rankTile(pool),
    isLeague
      ? {
          kind: 'stat',
          label: 'Matchweek',
          value: tile.number == null ? '—' : String(tile.number),
          sub: tile.caption,
          tone: tile.number == null ? 'muted' : 'accent',
        }
      : {
          kind: 'stat',
          label: 'Level',
          value: String(pool.highest_level ?? 1),
          sub: getLevelName(pool.highest_level ?? 1),
          tone: 'accent',
        },
    { kind: 'dots', label: 'Form', dots: pool.form, palette: 'form' },
  ]
}

/** Shared by every mode — and for Showdown it is already the duel-points rank. */
function rankTile(pool: PoolCardPool): KpiTile {
  const ranked = pool.hasScoringStarted && pool.current_rank != null
  return {
    kind: 'stat',
    label: 'Rank',
    value: ranked ? `#${pool.current_rank}` : '—',
    sub: ranked ? `of ${pool.totalEntries}` : undefined,
    tone: ranked ? 'ink' : 'muted',
  }
}

/**
 * A duel outcome's dot.
 *
 * ⚠ NOT the accuracy tiers. `getFormDotClass` colours how close a scoreline was;
 * a duel is won, tied or lost, and reusing gold/green/blue for that would say
 * the two strips mean the same thing. A bye is drawn faint because nothing
 * happened.
 */
const DUEL_DOT: Record<DuelOutcome | 'none', string> = {
  won: 'bg-success-500',
  tied: 'bg-warning-400',
  lost: 'bg-danger-600',
  bye: 'bg-silver opacity-40',
  none: 'bg-silver',
}

export function duelDotClass(outcome: string): string {
  return DUEL_DOT[outcome as DuelOutcome] ?? DUEL_DOT.none
}
