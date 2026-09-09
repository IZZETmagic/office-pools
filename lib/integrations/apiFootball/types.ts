// Shapes for the api-football.com REST API responses.
// Only the fields we actually consume are typed.

export type ApiFootballStatusShort =
  | 'TBD' | 'NS'
  | '1H' | 'HT' | '2H' | 'ET' | 'BT' | 'P' | 'INT' | 'LIVE'
  | 'FT' | 'AET' | 'PEN'
  | 'PST' | 'CANC' | 'ABD' | 'AWD' | 'WO' | 'SUSP'

export type ApiFootballFixture = {
  fixture: {
    id: number
    referee: string | null
    date: string
    venue: { id: number | null; name: string | null; city: string | null }
    status: { long: string; short: ApiFootballStatusShort; elapsed: number | null; extra: number | null }
  }
  // `name`, `country` and `logo` are OPTIONAL because this type is shared with
  // the World Cup path, which has never read them — not because the feed
  // sometimes omits them. It does not: every /fixtures row carries all three,
  // and the league importer uses them to build a competition's `tournaments`
  // placeholder without a second API call or a hand-maintained catalogue entry.
  league: { id: number; season: number; round: string; name?: string; country?: string; logo?: string }
  teams: {
    home: { id: number; name: string; winner: boolean | null }
    away: { id: number; name: string; winner: boolean | null }
  }
  goals: { home: number | null; away: number | null }
  score: {
    halftime: { home: number | null; away: number | null }
    fulltime: { home: number | null; away: number | null }
    extratime: { home: number | null; away: number | null }
    penalty: { home: number | null; away: number | null }
  }
  // ⚠⚠ PRESENT ONLY WHEN THE FIXTURE WAS ASKED FOR BY ID. `/fixtures?id=` and
  // `/fixtures?ids=` bundle these; `/fixtures?league=&season=` does NOT, and
  // `/fixtures?live=all` carries `events` alone. Verified against the live API
  // 2026-09-09, and the bundled objects are BYTE-IDENTICAL to what the
  // dedicated /fixtures/{events,lineups,statistics} endpoints return, so the
  // existing mappers read them unchanged.
  //
  // ⚠ OPTIONAL IS LOAD-BEARING, NOT DEFENSIVE. `undefined` here means "this
  // call did not carry line-ups", which is emphatically not "this fixture has
  // no line-ups" — the same distinction the client's refusal guard exists to
  // keep. Anything that treats an absent field as an empty one puts the
  // delete-on-nothing bug straight back.
  events?: ApiFootballEvent[]
  lineups?: ApiFootballLineup[]
  statistics?: ApiFootballTeamStatistics[]
  players?: ApiFootballPlayers[]
}

export type ApiFootballEvent = {
  time: { elapsed: number; extra: number | null }
  team: { id: number; name: string }
  player: { id: number | null; name: string | null }
  assist: { id: number | null; name: string | null }
  type: 'Goal' | 'Card' | 'subst' | 'Var'
  detail: string  // 'Yellow Card' | 'Red Card' | 'Second Yellow card' | ...
  comments: string | null
}

export type ApiFootballTeam = {
  team: {
    id: number
    name: string
    code: string | null
    country: string
    founded: number | null
    national: boolean
    logo: string
  }
}

export type ApiFootballEnvelope<T> = {
  get: string
  parameters: Record<string, string>
  errors: unknown
  results: number
  paging: { current: number; total: number }
  response: T[]
}

export type ApiFootballRequestOptions = {
  /** When true, throw on non-2xx instead of returning the envelope. */
  strict?: boolean
  /** Override default 8s timeout. */
  timeoutMs?: number
}

export type ApiFootballQuotaInfo = {
  /** Per-day requests remaining at the moment of this call. */
  requestsRemaining: number | null
  /** Per-minute requests remaining. */
  rateLimitRemaining: number | null
}

/**
 * One club's row in `/standings`.
 *
 * ⚠ `rank` already applies the competition's real tiebreakers — for the Premier
 * League that ends at head-to-head. Never recompute it from `points`: that is
 * exactly the information a derived table loses.
 */
export type ApiFootballStandingRow = {
  rank: number
  team: { id: number; name: string; logo?: string | null }
  points: number
  goalsDiff: number
  group?: string | null
  /** Recent form, most recent last, e.g. 'WWDLW'. */
  form?: string | null
  /** same | up | down since the previous round — the movement arrows. */
  status?: string | null
  /** Band label, e.g. 'Promotion - Champions League (Group Stage)'. */
  description?: string | null
  all: {
    played: number
    win: number
    draw: number
    lose: number
    goals: { for: number; against: number }
  }
}

/**
 * `/standings` nests the table two levels down, and the inner level is an ARRAY
 * OF GROUPS — one for a league, several for a cup group stage. Flattening it is
 * the mapper's job, not the caller's.
 */
export type ApiFootballStandingsResponse = {
  league: {
    id: number
    season: number
    standings: ApiFootballStandingRow[][]
  }
}

// =============================================================
// /fixtures/lineups and /fixtures/statistics — migration 139
// =============================================================
// Only the fields we consume, as everywhere else in this file. Both payloads
// return exactly two entries, home first, but nothing here relies on that
// order: the mappers resolve the side from `team.id` against the fixture's own
// home club, the same way `eventsToTimeline` does.
// =============================================================

/** One player in a line-up. `grid` is "row:col", and is NULL for substitutes. */
export type ApiFootballLineupPlayer = {
  player: {
    id: number | null
    name: string | null
    number: number | null
    /** 'G' | 'D' | 'M' | 'F' in practice, but the feed is not typed this tightly. */
    pos: string | null
    /**
     * "row:col" — row 1 is the goalkeeper, counting out from that team's own
     * goal. Null for every substitute, verified on the live feed.
     */
    grid: string | null
  }
}

export type ApiFootballLineup = {
  team: { id: number; name: string }
  coach: { id: number | null; name: string | null } | null
  /** '4-2-3-1'. A caption; the pitch is drawn from each player's `grid`. */
  formation: string | null
  startXI: ApiFootballLineupPlayer[] | null
  substitutes: ApiFootballLineupPlayer[] | null
}

/**
 * One statistic.
 *
 * ⚠ `value` IS THREE DIFFERENT THINGS. A count arrives as a number, a
 * percentage as '65%', and xG as '1.81' — and any of them can be null. Sampled
 * live 2026-09-06: `Red Cards` came back null on one fixture and 0 on another
 * for the same real-world state.
 */
export type ApiFootballStatistic = {
  type: string
  value: number | string | null
}

export type ApiFootballTeamStatistics = {
  team: { id: number; name: string }
  statistics: ApiFootballStatistic[] | null
}

// =============================================================
// Per-player statistics — the `players` arm of the /fixtures?ids= bundle
// =============================================================
// ⚠ THE SHAPE IS FIXED, unlike `match_team_stats`. Sampled across 920
// player-rows in two competitions on 2026-09-09: every row carried the same
// eleven groups, twenty players a side, positions only ever G/D/M/F. So these
// are named fields rather than a type/value list.
//
// ⚠ MOST NUMBERS ARE NULL MOST OF THE TIME. The feed sends null, not 0, for a
// stat a player did not register — `shots.total` was null on 560 of 800 rows.
// =============================================================

export type ApiFootballPlayerStatLine = {
  games: {
    minutes: number | null
    number: number | null
    position: string | null
    /** ⚠ A STRING — '7', '7.5', '10'. Null for an unused substitute. */
    rating: string | null
    captain: boolean | null
    substitute: boolean | null
  }
  offsides: number | null
  shots: { total: number | null; on: number | null }
  goals: {
    total: number | null
    conceded: number | null
    assists: number | null
    saves: number | null
  }
  passes: {
    total: number | null
    key: number | null
    /**
     * ⚠⚠ A COUNT OF COMPLETED PASSES, NOT A PERCENTAGE — the opposite of the
     * TEAM-level `Passes %`, which arrives as '83%'. Measured on 604 rows
     * carrying both: not one had accuracy greater than total. It is a string
     * regardless, so it still needs parsing.
     */
    accuracy: string | number | null
  }
  tackles: { total: number | null; blocks: number | null; interceptions: number | null }
  duels: { total: number | null; won: number | null }
  dribbles: { attempts: number | null; success: number | null; past: number | null }
  fouls: { drawn: number | null; committed: number | null }
  cards: { yellow: number | null; red: number | null }
  penalty: {
    won: number | null
    /** ⚠ THE PROVIDER SPELLS IT WITH ONE 't'. Correcting it here stores NULL. */
    commited: number | null
    scored: number | null
    missed: number | null
    saved: number | null
  }
}

export type ApiFootballPlayerEntry = {
  player: { id: number | null; name: string | null; photo?: string | null }
  statistics: ApiFootballPlayerStatLine[]
}

/** One side of the bundle's `players` array. */
export type ApiFootballPlayers = {
  team: { id: number; name: string; logo?: string | null }
  players: ApiFootballPlayerEntry[]
}
