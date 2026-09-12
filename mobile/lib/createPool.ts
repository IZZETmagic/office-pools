// =============================================================
// THE CREATE-POOL WIZARD'S DECISIONS
// =============================================================
// Everything the wizard DECIDES, lifted out of the screen that renders it.
//
// ⚠ NOTHING IN THIS FILE MAY IMPORT `react-native` OR `expo-router`, directly
// or transitively. It is the only reason the wizard has any test coverage at
// all: the root `vitest.config.ts` globs `mobile/**/__tests__/**` but resolves
// imports against the ROOT `node_modules`, which knows nothing about the Expo
// app's. An import of either turns every test in the suite into an unresolved
// module rather than a failure that says anything.
//
// So icon names are plain strings here and are narrowed at the render site
// (`Icon`'s `name` prop is `string`), and every function takes `now` as an
// argument rather than reading the clock.
//
// The web equivalent is `components/pools/CreatePoolModal.tsx`, which holds all
// of this inline. Where a rule here is subtle, the reason is the one recorded
// there — those comments were paid for, and this file is where mobile inherits
// them rather than rediscovering them.
// =============================================================

// ⚠ IMPORTED, NEVER RE-DECLARED. An inline
// `'full_tournament' | 'progressive' | 'bracket_picker'` here would be the
// thirtieth copy of a union that omits `league_pickem` — the exact inventory
// `lib/predictionMode.ts` exists to end, and which eslint's `no-restricted-syntax`
// rule now refuses. `PoolMode` is an alias rather than a second declaration.
import type {
  LeagueDepth as LeagueDepthType,
  LeagueMode as LeagueModeType,
  PredictionMode,
} from './predictionMode'

/** Level 1 of the league structure (Decision 9). Immutable once a pool exists. */
export type LeagueMode = LeagueModeType

/** Level 2, and only for the two modes that have weekly picks. */
export type LeagueDepth = LeagueDepthType

/**
 * What the `pools.prediction_mode` column will hold.
 *
 * ⚠ EVERY league pool is `league_pickem`, whatever its `league_mode` — that is
 * the column all the league plumbing keys on. `league_mode` is the separate
 * axis that decides whether it is played by picking fixtures or by ordering the
 * table.
 */
export type PoolMode = PredictionMode

/** A row of `tournaments`, as the wizard selects it. */
export type TournamentRow = {
  tournament_id: string
  name: string
  short_name: string | null
  host_countries: string | null
  start_date: string
  end_date: string
  /** 'league' | 'groups_knockout'. Null on rows predating migration 024 — those are brackets. */
  format: string | null
  /**
   * The competition's crest, served by the fixtures provider.
   *
   * ⚠ NULL is the common case and a real answer, not a missing one. The
   * provider has a genuine crest for the Premier League and a generic grey
   * shield for the World Cup, so the column is filled only where the image is
   * actually the competition's own. A null must render as nothing, never as a
   * placeholder box.
   */
  logo_url: string | null
  external_provider?: string | null
  external_league_id?: number | null
  external_season?: number | null
}

/** A row of `league_seasons`, as the wizard selects it. */
export type SeasonRow = {
  season_id: string
  club_count: number | null
  external_provider: string | null
  external_league_id: number | null
  external_season: number | null
}

/** A tournament with its league season resolved (null for a bracket). */
export type Competition = TournamentRow & {
  /** Set only for a league: the `league_seasons` row this entry actually plays. */
  league_season_id: string | null
  /**
   * Clubs in this league's season. Null for a bracket competition, and null for
   * a league whose season row is missing — such a league is dropped by
   * `selectableCompetitions` anyway.
   *
   * Read from `league_seasons`, not `tournaments.num_teams`: the season row is
   * written by the importer from the feed, where `num_teams` on the placeholder
   * is a copy of it. One source, and it is the league's own.
   */
  league_club_count: number | null
}

/** A `league_matchweeks` row, reduced to what a deadline shortcut needs. */
export type UpcomingLock = {
  number: number
  label: string | null
  lockAt: string
}

// ============================================================= dates

/**
 * A `YYYY-MM-DD` from the database, parsed as a LOCAL date.
 *
 * ⚠ THE `T00:00:00` IS THE WHOLE POINT. `new Date('2026-08-21')` is parsed as
 * UTC midnight by spec, which is 20:00 on the 20th in Bermuda — so the screen
 * rendered a Premier League season as starting a day early for everybody west
 * of Greenwich, and `hasStarted` flipped a day early with it. This was live in
 * `mobile/app/create-pool.tsx` before this module existed.
 *
 * A full timestamp (anything with a `T` already in it) is passed straight
 * through, because that one carries its own offset and must not be reinterpreted.
 */
export function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value)
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * The tournament name without its season.
 *
 *   "Premier League 2026/27" -> "Premier League"
 *   "FIFA World Cup 2026"    -> "FIFA World Cup"
 *
 * Only ever one active competition per sport is offered, so the year
 * distinguishes nothing — and the dates are printed on the same card, which is
 * where somebody actually checks which season they are joining.
 *
 * ⚠ DISPLAY ONLY. `tournaments.name` is unchanged, because it is what every
 * other surface, every email and every export uses, and there the season is
 * doing real work. `short_name` is not usable for this either: it reads
 * "Premier League" for the league but "WC2026" for the World Cup, so it is a
 * code, not a display name.
 *
 * Anchored to the END, so a name that legitimately contains a year
 * ("Copa America 2024 Qualifiers") keeps it.
 */
export function withoutSeason(name: string): string {
  return name.replace(/\s+\d{4}(\s*\/\s*\d{2,4})?$/, '')
}

/**
 * Has this competition finished?
 *
 * Mirrors `hasCompetitionEnded` in the web app's `lib/competitionFormat.ts`,
 * including its UTC end-of-day. Duplicated rather than imported because
 * `mobile/` is a separate npm project that does not resolve the web app's
 * paths — the same reason the screen inlined a copy before this module existed.
 *
 * ⚠ Derived from `end_date`, NEVER from `tournaments.status`. That column is
 * authored and goes stale: the World Cup still read 'upcoming' a month after
 * its final.
 */
export function hasCompetitionEnded(
  endDate: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!endDate) return false
  const endOfFinalDay = new Date(`${endDate}T23:59:59.999Z`).getTime()
  if (Number.isNaN(endOfFinalDay)) return false
  return endOfFinalDay < now.getTime()
}

/** "Aug 2026" — the month a season starts or ends, without the day. */
export function formatMonthYear(dateStr: string): string {
  const d = parseLocalDate(dateStr)
  if (!d) return dateStr
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
}

/**
 * "Aug 2026 – May 2027".
 *
 * A competition is picked by which one it is and roughly when it runs; the
 * exact 21st is noise on that card, and dropping it takes a third off the
 * widest line.
 */
export function formatSeasonRange(startDate: string, endDate: string): string {
  return `${formatMonthYear(startDate)} – ${formatMonthYear(endDate)}`
}

/** The full deadline, as the Settings step prints it back. */
export function formatDeadline(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** That date at 13:00 LOCAL — the default hour for a hand-set deadline. */
export function atOnePm(d: Date): Date {
  const out = new Date(d)
  out.setHours(13, 0, 0, 0)
  return out
}

// ============================================================= competitions

/**
 * Pair each league tournament with the `league_seasons` row it actually plays.
 *
 * A league's identity is its season row, not the placeholder `tournaments` row
 * that carries its dates. Matched on the `(provider, league_id, season)` triple
 * the importer dedupes on — the same key `loadSyncTargets` uses.
 *
 * The create route resolves the pairing server-side too and does not trust the
 * client's; this exists so the wizard can DROP a league it cannot create rather
 * than offering one that 409s at submit.
 */
export function pairSeasons(
  tournaments: TournamentRow[],
  seasons: SeasonRow[],
): Competition[] {
  const byTriple = new Map<string, { seasonId: string; clubCount: number | null }>()
  for (const s of seasons) {
    byTriple.set(
      `${s.external_provider ?? 'api_football'}|${s.external_league_id}|${s.external_season}`,
      { seasonId: s.season_id, clubCount: s.club_count ?? null },
    )
  }

  return tournaments.map((t) => {
    if (t.format !== 'league') {
      return { ...t, league_season_id: null, league_club_count: null }
    }
    const season = byTriple.get(
      `${t.external_provider ?? 'api_football'}|${t.external_league_id}|${t.external_season}`,
    )
    return {
      ...t,
      league_season_id: season?.seasonId ?? null,
      league_club_count: season?.clubCount ?? null,
    }
  })
}

/**
 * The competitions the wizard may offer.
 *
 * Two drops, both of which would otherwise create a pool that cannot be played:
 *
 * - one whose last match has been played. Creating a pool for it is never what
 *   somebody means, and the World Cup would otherwise sit at the top of this
 *   list for ever.
 * - a LEAGUE with no season row. `scripts/import-league-season.ts` puts it well
 *   of its own catalogue: "an entry that has never been run is a claim, not a
 *   capability." Its pool would have no fixtures, clubs or matchweeks to score.
 */
export function selectableCompetitions(
  competitions: Competition[],
  now: Date = new Date(),
): Competition[] {
  return competitions.filter(
    (c) =>
      !hasCompetitionEnded(c.end_date, now) &&
      (c.format !== 'league' || !!c.league_season_id),
  )
}

/** Does this competition run as a league table rather than a bracket? */
export function isLeague(competition: Competition | null | undefined): boolean {
  return competition?.format === 'league'
}

/**
 * The mode that will actually be submitted, DERIVED from the competition rather
 * than synced into state.
 *
 * ⚠ This matters beyond tidiness. A member can pick Full Tournament for the
 * World Cup, step back, switch to the Premier League, and step forward again.
 * Held in state, that stale mode rides along and creates a league pool that
 * scores ZERO for every fixture, silently — the scoring gate compares predicted
 * teams against a bracket that does not exist. Derived, it cannot: the
 * competition always wins, and there is no render in which the two disagree.
 */
export function effectiveMode(chosen: PoolMode, competitionIsLeague: boolean): PoolMode {
  if (competitionIsLeague) return 'league_pickem'
  return chosen === 'league_pickem' ? 'full_tournament' : chosen
}

// ============================================================= mode catalogues

export type ModeOption<V extends string> = {
  value: V
  label: string
  /** SF-Symbol-style name, resolved by `mobile/components/ui/Icon.tsx`. */
  icon: string
  /**
   * A FUNCTION of the club count rather than a string, because Predict the
   * Table's copy names it — and "put all twenty clubs in finishing order" is
   * wrong for every league that is not England, Spain or Italy. Bundesliga and
   * Ligue 1 are eighteen; the Championship is twenty-four; the Scottish
   * Premiership is twelve.
   *
   * The other three ignore the argument. That is deliberately uniform: a mix of
   * strings and functions would need a `typeof` at the render site, and the next
   * mode whose copy needs a count would have to change the shape again.
   */
  desc: (clubs: number | null) => string
}

/** All four league modes (Decision 9). */
export const LEAGUE_MODES: ModeOption<LeagueMode>[] = [
  {
    value: 'pickem',
    label: 'Matchweek Pick’em',
    icon: 'stairs',
    desc: () =>
      'Members predict each matchweek’s fixtures. Picks lock at the first kick-off, and the next matchweek opens as that one closes.',
  },
  {
    value: 'showdown',
    label: 'Showdown',
    icon: 'arrow.triangle.merge',
    desc: () =>
      'The same weekly picks, plus a head-to-head duel against one other member. Three points for beating them, one for a tie. The fixture list is drawn up front, so you can see your rival coming.',
  },
  {
    value: 'last_man_standing',
    label: 'Last Man Standing',
    icon: 'flame.fill',
    desc: () =>
      'Pick one club a week to win. Get it wrong and you’re out — and you can’t use the same club twice. When one player is left the round ends and a new one starts, so nobody is watching from the sidelines in March.',
  },
  {
    value: 'table',
    label: 'Predict the Table',
    icon: 'list.bullet',
    desc: (clubs) =>
      `One decision before the season: put ${clubs ? `all ${clubs} clubs` : 'every club'} in finishing order. ` +
      'Scored live against the real table all season — good for people who don’t follow every match.',
  },
]

/**
 * Level 2, and only for the two modes that have weekly picks.
 *
 * Results is the default on purpose (Decision 6): 380 taps across a season is
 * something people finish, where 760 numbers is not.
 */
export const LEAGUE_DEPTHS: { value: LeagueDepth; label: string; desc: string }[] = [
  { value: 'results', label: 'Pick a winner', desc: 'Home, draw or away. One tap per match.' },
  { value: 'scores', label: 'Predict the score', desc: 'Exact goals for both sides. Two numbers per match.' },
]

/** Does this league mode ask for a depth? The DB CHECK refuses the pair otherwise. */
export function modeHasDepth(mode: LeagueMode): boolean {
  return mode === 'pickem' || mode === 'showdown'
}

/**
 * The three bracket modes.
 *
 * ⚠ Icons corrected to the web's 2026-08 set. `square.grid.2x2` resolves to
 * Hugeicons' Grid02, which reads as a crop tool, and `arrow.forward.circle`
 * says nothing about rounds. A ticked-off list, a flight of steps and two legs
 * feeding into one say what the three modes actually are.
 */
export const WC_MODES: ModeOption<Exclude<PoolMode, 'league_pickem'>>[] = [
  {
    value: 'full_tournament',
    label: 'Full Tournament',
    icon: 'checklist',
    desc: () =>
      'Members predict all matches upfront before the tournament starts. They must predict which teams qualify for the knockout rounds based on their group stage predictions.',
  },
  {
    value: 'progressive',
    label: 'Progressive',
    icon: 'stairs',
    desc: () =>
      'Members predict round-by-round as teams advance. After each round completes, the next round opens with actual qualified teams and matchups.',
  },
  {
    value: 'bracket_picker',
    label: 'Bracket Picker',
    icon: 'arrow.triangle.merge',
    desc: () =>
      'Members rank groups and pick knockout winners only — no score predictions needed. Quick & simple (~10 min).',
  },
]

// ============================================================= deadline

/**
 * What the deadline step is called, which is not cosmetic — it names a
 * different thing in each mode.
 */
export function deadlineTitle(mode: PoolMode, leagueMode: LeagueMode | null): string {
  // ⬅ 143. The two league titles that used to live here — "First round
  // deadline" for Last Man Standing and "First matchweek deadline" for the
  // rest — were BOTH claims this screen could not keep. The date they labelled
  // was overwritten by the create route with the season's last kickoff and the
  // round opened in whichever week happened to be unlocked. Those modes no
  // longer reach this function at all; they ask `startMatchweekTitle` instead.
  if (mode === 'league_pickem') {
    if (leagueMode === 'table') return 'Table deadline'
  }
  if (mode === 'progressive') return 'Group stage deadline'
  return 'Prediction deadline'
}

/**
 * ⬅ 143. Does this pool choose a START MATCHWEEK rather than a deadline?
 *
 * ⚠ Mirrors `asksStartMatchweek` in `components/pools/CreatePoolModal.tsx`.
 * Mobile is a separate npm project and cannot import the web app's paths — the
 * same reason `hasCompetitionEnded` is duplicated above. A change to one is a
 * change to both, and `buildCreatePayload` reads this so the two wizards cannot
 * send different shapes.
 */
export function asksStartMatchweek(
  competition: Competition | null,
  leagueMode: LeagueMode | null,
): boolean {
  return isLeague(competition) && leagueMode !== 'table'
}

/** The heading over the start-matchweek chooser. */
export function startMatchweekTitle(): string {
  return 'When does the pool start?'
}

export function startMatchweekDescription(): string {
  return 'Members pick from this matchweek on. Earlier weeks aren’t scored and nobody is marked as having missed them.'
}

export function deadlineDescription(mode: PoolMode, leagueMode: LeagueMode | null): string {
  if (mode === 'league_pickem' && leagueMode === 'table') {
    return 'When the table locks. Every member’s order is shown to the pool at this moment, and the date is fixed once it passes.'
  }
  return 'When picks close. You can move this later from the pool’s settings.'
}

/** One shortcut chip. */
export type QuickPick = { key: string; label: string; at: Date }

/**
 * The deadline shortcuts, which depend on whether the competition has started.
 *
 * BEFORE IT STARTS — kick-off, and the day and week before it, all at 13:00.
 * They are what somebody setting up in advance wants.
 *
 * ONCE IT HAS STARTED — those three are all in the past. "Tournament Start
 * (Aug 21)" in September is not a shortcut, it is a button that sets a date the
 * form immediately rejects. They are replaced by the next matchweek locks, at
 * their REAL lock time rather than a made-up 13:00 — the point of the shortcut
 * is to match the competition.
 *
 * NEITHER — a competition that has started and has no matchweeks we can read
 * (any World Cup, or a league whose fixtures have not been imported) gets no
 * chips at all. An empty row is honest; a row of dead buttons is not.
 */
export function quickPicks(
  competition: Competition | null,
  upcomingLocks: UpcomingLock[],
  now: Date = new Date(),
): QuickPick[] {
  if (!competition) return []

  const start = parseLocalDate(competition.start_date)
  if (!start) return []

  const dayMonth = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  if (start.getTime() > now.getTime()) {
    const shift = (days: number) => {
      const d = new Date(start)
      d.setDate(d.getDate() - days)
      return atOnePm(d)
    }
    return [
      { key: 'start', days: 0, prefix: 'Tournament Start' },
      { key: 'day', days: 1, prefix: '1 Day Before' },
      { key: 'week', days: 7, prefix: '1 Week Before' },
    ].map(({ key, days, prefix }) => {
      const at = shift(days)
      return { key, label: `${prefix} (${dayMonth(at)})`, at }
    })
  }

  return upcomingLocks.map((mw) => {
    const at = new Date(mw.lockAt)
    return {
      key: `mw${mw.number}`,
      label: `${mw.label ?? `Matchweek ${mw.number}`} (${dayMonth(at)})`,
      at,
    }
  })
}

/**
 * The deadline the wizard should pre-fill when a competition is chosen.
 *
 * ⚠ Unless kick-off has already gone. A competition already under way — a
 * Premier League season somebody is joining in October — would otherwise
 * pre-fill a deadline months in the past, and for a table pool that date is the
 * real lock (migration 098), not decoration. A week out is the honest default
 * for a pool starting mid-season: long enough for the group to file a table,
 * and the admin can move it either way before creating.
 */
export function defaultDeadline(competition: Competition, now: Date = new Date()): Date {
  const start = parseLocalDate(competition.start_date)
  if (start && start.getTime() > now.getTime()) return atOnePm(start)
  const inAWeek = new Date(now)
  inAWeek.setDate(inAWeek.getDate() + 7)
  return atOnePm(inAWeek)
}

/**
 * A deadline already gone closes nothing, and for a table pool it is the real
 * lock — so the pool would be created shut.
 *
 * ⚠ The native picker can be constrained to a minimum DAY, and a day-level
 * floor cannot catch "today at 09:00" chosen at noon. This is the check that
 * does, and it runs at submit.
 */
export function validateDeadline(
  deadline: Date | null,
  now: Date = new Date(),
): string | null {
  if (!deadline || Number.isNaN(deadline.getTime())) return 'Pick a deadline for this pool.'
  if (deadline.getTime() <= now.getTime()) return 'The deadline has to be in the future.'
  return null
}

// ============================================================= submit

export type WizardState = {
  poolName: string
  description: string
  competition: Competition
  leagueMode: LeagueMode
  leagueDepth: LeagueDepth
  predictionMode: PoolMode
  deadline: Date
  isPrivate: boolean
  maxEntriesPerUser: number
  /**
   * ⬅ 143. The matchweek a league pool starts from. NULL for a bracket pool,
   * for table mode, and until the options have loaded.
   */
  startMatchweek: number | null
}

export type CreatePoolPayload = {
  pool_name: string
  description: string | null
  tournament_id: string
  league_season_id: string | null
  prediction_deadline: string
  prediction_mode: PoolMode
  league_mode: LeagueMode | null
  league_depth: LeagueDepth | null
  /** ⬅ 143. The matchweek a league pool plays from. NULL = no floor. */
  league_start_matchweek: number | null
  is_private: boolean
  max_participants: number
  max_entries_per_user: number
}

/**
 * The POST body for `/api/pools/create`.
 *
 * Matches the web wizard field for field. Three of them are worth naming:
 *
 * `max_participants: 0` — always, and there is no control behind it. Migration
 * 075 records that `pools.max_participants` is "stored, displayed and editable
 * but enforced NOWHERE": an admin could set 20 and 50 people would still join.
 * The route turns 0 into NULL. The limit that IS real is the tier ceiling,
 * enforced by a BEFORE INSERT trigger precisely so no client can miss it.
 *
 * `league_mode` / `league_depth` — sent unconditionally rather than behind a
 * branch, so there is no second copy of the route's own rule to drift out of
 * step with. The route resolves them to NULL for a bracket pool.
 *
 * `max_entries_per_user: 1` for a league — forced here as well as by the route.
 * A second entry is unreachable by construction: the table picker and the
 * Pick'em picker both resolve to the member's FIRST entry, so entry 2 could
 * never be filled and would score 0 all season. Showdown is worse — its draw is
 * per entry, so a member would be drawn against people twice with one side
 * unplayable.
 */
export function buildCreatePayload(state: WizardState): CreatePoolPayload {
  const league = isLeague(state.competition)
  const mode = effectiveMode(state.predictionMode, league)

  return {
    pool_name: state.poolName.trim(),
    description: state.description.trim() || null,
    tournament_id: state.competition.tournament_id,
    // Present only for a league. The route resolves the placeholder tournament
    // from it server-side and forces the mode, so the two cannot drift apart
    // via a crafted request.
    league_season_id: state.competition.league_season_id ?? null,
    prediction_deadline: state.deadline.toISOString(),
    prediction_mode: mode,
    league_mode: league ? state.leagueMode : null,
    league_depth: league && modeHasDepth(state.leagueMode) ? state.leagueDepth : null,
    // ⬅ 143. Only the modes that HAVE a start matchweek send one. Table is
    // excluded by Decision 11 — a full-time table has no week it begins in, it
    // has `league_table_lock_at` — and a CHECK constraint refuses the pair.
    league_start_matchweek: asksStartMatchweek(state.competition, state.leagueMode)
      ? state.startMatchweek
      : null,
    is_private: state.isPrivate,
    max_participants: 0,
    max_entries_per_user: league
      ? 1
      : Math.max(1, Math.min(10, state.maxEntriesPerUser || 1)),
  }
}

// ============================================================= start matchweek

/**
 * ⚠ MIRROR OF `lib/league/startMatchweek.ts` IN THE WEB APP. Mobile is a
 * separate npm project that cannot resolve the web app's paths, which is the
 * same reason `hasCompetitionEnded` above is a copy rather than an import. Both
 * copies are pinned by tests that assert the same expectations, and a change to
 * one is a change to both.
 *
 * The full reasoning — why a matchweek and not a date, and why the answer is a
 * floor rather than an equality — lives in migration 143's header.
 */
export type StartMatchweekOption = {
  number: number
  title: string
  lockAt: string
  isOpenNow: boolean
  closesIn: string
}

/**
 * How soon picks close, in words.
 *
 * ⚠ Days are FLOORED. "in 1 day" for something 44 hours away overstates the
 * notice a group has, and understating it is the safe direction on a screen
 * whose only job is judging whether there is enough time.
 */
export function closesInLabel(lockAt: string, now: number): string {
  const at = new Date(lockAt).getTime()
  if (Number.isNaN(at)) return ''
  if (at <= now) return 'closed'
  const days = Math.floor((at - now) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

/**
 * The instant picks close, device-local.
 *
 * ⚠ `lock_at`, NEVER `first_kickoff_at`. Migration 101 moved picking shut to an
 * hour BEFORE the first match of the week and backfilled it; printing the
 * kickoff here would tell an admin their group has an hour more than it does.
 */
export function formatLockInstant(lockAt: string): string {
  const d = new Date(lockAt)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * The matchweeks a pool being created right now may start from.
 *
 * ⚠ ROWS MUST ALREADY BE THE UNLOCKED, NON-EMPTY ONES. Eligibility is the
 * create route's rule and re-deciding it here would be a second copy of
 * Decision 16. This orders and labels; it does not choose.
 *
 * ⚠ A row that locked while the wizard sat open is DROPPED, not disabled. A
 * greyed row invites "why can't I pick that" for a week whose answer is simply
 * that it has started.
 */
export function startMatchweekOptions(
  rows: UpcomingLock[],
  now: number,
  limit = 4,
): StartMatchweekOption[] {
  return rows
    .filter((r) => {
      const at = new Date(r.lockAt).getTime()
      return !Number.isNaN(at) && at > now
    })
    .sort((a, b) => new Date(a.lockAt).getTime() - new Date(b.lockAt).getTime())
    .slice(0, limit)
    .map((r, i) => ({
      number: r.number,
      title: r.label ?? `Matchweek ${r.number}`,
      lockAt: r.lockAt,
      isOpenNow: i === 0,
      closesIn: closesInLabel(r.lockAt, now),
    }))
}

/**
 * The option the wizard lands on.
 *
 * ⚠ THE OPEN ONE — today's behaviour, now stated rather than assumed.
 * Defaulting to the second week would fix the Saturday this was found on and
 * break every ordinary creation, and it would be us deciding how much notice a
 * group needs, which is the decision this screen hands back to the admin.
 */
export function defaultStartMatchweek(options: StartMatchweekOption[]): number | null {
  return options[0]?.number ?? null
}
