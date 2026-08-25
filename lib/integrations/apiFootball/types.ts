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
  league: { id: number; season: number; round: string }
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
