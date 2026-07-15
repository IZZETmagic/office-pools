import type { ApiFootballEvent, ApiFootballFixture, ApiFootballStatusShort } from './types'

export type OurMatchRow = {
  match_id: string
  home_team_id: string | null
  away_team_id: string | null
  status: string | null
  status_detail: string | null
  is_completed: boolean | null
  home_score_ft: number | null
  away_score_ft: number | null
  home_score_pso: number | null
  away_score_pso: number | null
  live_minute: number | null
  live_period: string | null
  live_added: number | null
  winner_team_id: string | null
  data_source: 'api' | 'manual'
}

export type MatchUpdatePayload = {
  status?: 'scheduled' | 'live' | 'completed' | 'cancelled'
  status_detail?: MatchStatusDetail | null
  is_completed?: boolean
  completed_at?: string | null
  home_score_ft?: number | null
  away_score_ft?: number | null
  home_score_pso?: number | null
  away_score_pso?: number | null
  winner_team_id?: string | null
  live_minute?: number | null
  live_period?: string | null
  live_added?: number | null
  last_synced_at?: string
}

// 'SUSP' (suspended) is kept in the live bucket: it only happens after kickoff, so a
// suspended match must stay coarse='live' rather than regress to 'scheduled'. The
// specific "Suspended" reason is carried by mapStatusDetail below.
const LIVE_STATUSES: ApiFootballStatusShort[] = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'INT', 'LIVE', 'SUSP']
const FINAL_STATUSES: ApiFootballStatusShort[] = ['FT', 'AET', 'PEN']
const CANCELLED_STATUSES: ApiFootballStatusShort[] = ['CANC', 'ABD', 'WO']

function mapStatus(short: ApiFootballStatusShort): 'scheduled' | 'live' | 'completed' | 'cancelled' {
  if (FINAL_STATUSES.includes(short)) return 'completed'
  if (LIVE_STATUSES.includes(short)) return 'live'
  if (CANCELLED_STATUSES.includes(short)) return 'cancelled'
  return 'scheduled'
}

/** The precise abnormal reason to surface in the UI, in parallel with the coarse `status`. */
export type MatchStatusDetail =
  | 'postponed'
  | 'tbd'
  | 'suspended'
  | 'interrupted'
  | 'cancelled'
  | 'abandoned'
  | 'awarded'
  | 'walkover'

/**
 * Map an api-football short code to the specific reason we badge in the UI, or null for
 * normal scheduled/live/final states. Owned exclusively by the live sync — it is written
 * authoritatively every run (and cleared to null when a match resumes to normal play).
 *
 * NOTE: 'delayed' is intentionally NOT produced here. A delay is a *kickoff-time move*, not
 * a fixture status; the schedule reconcile pass records it via `original_match_date` and the
 * client derives the "Delayed" badge from that — keeping this column free of reconcile writes.
 */
export function mapStatusDetail(short: ApiFootballStatusShort): MatchStatusDetail | null {
  switch (short) {
    case 'PST': return 'postponed'
    case 'TBD': return 'tbd'
    case 'SUSP': return 'suspended'
    case 'INT': return 'interrupted'
    case 'CANC': return 'cancelled'
    case 'ABD': return 'abandoned'
    case 'AWD': return 'awarded'
    case 'WO': return 'walkover'
    default: return null
  }
}

function mapPeriod(short: ApiFootballStatusShort): string | null {
  if (short === '1H' || short === 'HT' || short === '2H') return short
  if (short === 'ET' || short === 'BT') return 'ET'
  if (short === 'P' || short === 'PEN') return 'PEN'
  return null
}

/**
 * Compute the partial UPDATE payload for our `matches` row given a fixture from
 * api-football. Returns `null` if nothing has changed (no DB write needed).
 *
 * Never writes home_team_id/away_team_id — bracket cascade is authoritative.
 */
export function fixtureToMatchUpdate(
  fixture: ApiFootballFixture,
  current: OurMatchRow,
  opts: {
    /** ISO timestamp to stamp `last_synced_at`/`completed_at`. Pass once per sync run. */
    now: string
    /** Resolves api-football team ids → our team_id. Used only for winner_team_id. */
    teamIdByExternal: Map<number, string>
  }
): MatchUpdatePayload | null {
  const next: MatchUpdatePayload = { last_synced_at: opts.now }

  const newStatus = mapStatus(fixture.fixture.status.short)
  if (newStatus !== current.status) next.status = newStatus

  // Precise reason (postponed/suspended/…) alongside the coarse status. Diffed like every
  // other field; writing null here is intentional — it clears the badge when a suspended or
  // interrupted match resumes to normal play. Never touches `original_match_date` (reconcile).
  const newDetail = mapStatusDetail(fixture.fixture.status.short)
  if (newDetail !== (current.status_detail ?? null)) next.status_detail = newDetail

  const newIsCompleted = newStatus === 'completed'
  if (newIsCompleted !== !!current.is_completed) next.is_completed = newIsCompleted
  if (newIsCompleted && !current.is_completed) next.completed_at = opts.now

  const newHome = fixture.goals.home
  const newAway = fixture.goals.away
  if (newHome !== current.home_score_ft) next.home_score_ft = newHome
  if (newAway !== current.away_score_ft) next.away_score_ft = newAway

  const psoH = fixture.score.penalty.home
  const psoA = fixture.score.penalty.away
  if (psoH !== current.home_score_pso) next.home_score_pso = psoH
  if (psoA !== current.away_score_pso) next.away_score_pso = psoA

  const elapsed = fixture.fixture.status.elapsed ?? null
  if (elapsed !== current.live_minute) next.live_minute = elapsed

  const period = mapPeriod(fixture.fixture.status.short)
  if (period !== current.live_period) next.live_period = period

  // Stoppage/added minutes at the end of the current half (the clock holds at
  // 45'/90'/105'/120' while `extra` counts the added time). Diffed and written
  // like every other field — including back to null once the half's stoppage
  // window ends — so it never lingers into the next period.
  const added = fixture.fixture.status.extra ?? null
  if (added !== current.live_added) next.live_added = added

  // Winner derivation for knockout: when match final, prefer PSO winner else FT.
  // Diffed against current like every other field — an unconditional write here
  // made every sync of an already-completed match register as a phantom change
  // (and a realtime `matches` event) for the whole 4h live window.
  if (newIsCompleted) {
    let winnerExt: number | null = null
    if (psoH !== null && psoA !== null && psoH !== psoA) {
      winnerExt = psoH > psoA ? fixture.teams.home.id : fixture.teams.away.id
    } else if (newHome !== null && newAway !== null && newHome !== newAway) {
      winnerExt = newHome > newAway ? fixture.teams.home.id : fixture.teams.away.id
    }
    const winnerTeamId = winnerExt !== null ? opts.teamIdByExternal.get(winnerExt) ?? null : null
    if (winnerTeamId !== current.winner_team_id) next.winner_team_id = winnerTeamId
  }

  // If only `last_synced_at` would be written, treat as no-op.
  const writableKeys = Object.keys(next).filter((k) => k !== 'last_synced_at')
  if (writableKeys.length === 0) return null
  return next
}

export type ConductRow = {
  match_id: string
  team_id: string
  yellow_cards: number
  indirect_red_cards: number
  direct_red_cards: number
  yellow_direct_red_cards: number
  last_synced_at: string
}

/**
 * Aggregate api-football events into per-team match_conduct rows.
 * Always emits one row per side so previously-deleted cards reset to 0.
 * Returns [] if either team isn't mapped to one of our team_ids.
 */
export function eventsToConduct(
  fixture: ApiFootballFixture,
  events: ApiFootballEvent[],
  ourMatchId: string,
  opts: {
    now: string
    teamIdByExternal: Map<number, string>
  }
): ConductRow[] {
  const homeExt = fixture.teams.home.id
  const awayExt = fixture.teams.away.id
  const homeId = opts.teamIdByExternal.get(homeExt)
  const awayId = opts.teamIdByExternal.get(awayExt)
  if (!homeId || !awayId) return []

  type Bucket = { yellow: boolean; direct_red: boolean; second_yellow: boolean }
  const homeByPlayer = new Map<string, Bucket>()
  const awayByPlayer = new Map<string, Bucket>()

  for (const ev of events) {
    if (ev.type !== 'Card') continue
    const playerKey = ev.player?.id != null
      ? `id:${ev.player.id}`
      : `name:${ev.player?.name ?? 'unknown'}`
    const map =
      ev.team.id === homeExt ? homeByPlayer
      : ev.team.id === awayExt ? awayByPlayer
      : null
    if (!map) continue
    let b = map.get(playerKey)
    if (!b) {
      b = { yellow: false, direct_red: false, second_yellow: false }
      map.set(playerKey, b)
    }
    const detail = (ev.detail || '').toLowerCase()
    if (detail.includes('second yellow')) b.second_yellow = true
    else if (detail.includes('yellow')) b.yellow = true
    else if (detail.includes('red')) b.direct_red = true
  }

  return [
    summarize(ourMatchId, homeId, homeByPlayer, opts.now),
    summarize(ourMatchId, awayId, awayByPlayer, opts.now),
  ]
}

function summarize(
  matchId: string,
  teamId: string,
  byPlayer: Map<string, { yellow: boolean; direct_red: boolean; second_yellow: boolean }>,
  now: string
): ConductRow {
  let yellow_cards = 0
  let indirect_red_cards = 0
  let direct_red_cards = 0
  let yellow_direct_red_cards = 0
  // FIFA fair-play deduction model — each player contributes exactly one category, the worst.
  for (const b of byPlayer.values()) {
    if (b.yellow && b.direct_red) yellow_direct_red_cards++
    else if (b.direct_red) direct_red_cards++
    else if (b.second_yellow) indirect_red_cards++
    else if (b.yellow) yellow_cards++
  }
  return {
    match_id: matchId,
    team_id: teamId,
    yellow_cards,
    indirect_red_cards,
    direct_red_cards,
    yellow_direct_red_cards,
    last_synced_at: now,
  }
}

/** True when the fixture status indicates the match is currently in progress. */
export function isLiveStatus(short: ApiFootballStatusShort): boolean {
  return LIVE_STATUSES.includes(short)
}

/** True when the fixture status indicates a final (completed) result. */
export function isFinalStatus(short: ApiFootballStatusShort): boolean {
  return FINAL_STATUSES.includes(short)
}
