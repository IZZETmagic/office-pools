import type {
  ApiFootballStandingRow,
  ApiFootballStandingsResponse,
  ApiFootballEnvelope,
  ApiFootballEvent,
  ApiFootballFixture,
  ApiFootballLineup,
  ApiFootballQuotaInfo,
  ApiFootballRequestOptions,
  ApiFootballTeam,
  ApiFootballTeamStatistics,
} from './types'

const DEFAULT_HOST = 'v3.football.api-sports.io'

function getConfig() {
  const key = process.env.API_FOOTBALL_KEY
  if (!key) throw new Error('API_FOOTBALL_KEY is not set')
  const host = process.env.API_FOOTBALL_HOST || DEFAULT_HOST
  return { key, host }
}

let lastQuota: ApiFootballQuotaInfo = { requestsRemaining: null, rateLimitRemaining: null }
export function getLastQuota(): ApiFootballQuotaInfo {
  return lastQuota
}

async function request<T>(
  path: string,
  query: Record<string, string | number | undefined>,
  opts: ApiFootballRequestOptions = {}
): Promise<ApiFootballEnvelope<T>> {
  const { key, host } = getConfig()
  const url = new URL(`https://${host}${path}`)
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000)

  try {
    let attempt = 0
    let lastErr: unknown = null
    while (attempt < 3) {
      try {
        const res = await fetch(url, {
          headers: { 'x-apisports-key': key, accept: 'application/json' },
          signal: controller.signal,
          cache: 'no-store',
        })
        lastQuota = {
          requestsRemaining: numericHeader(res.headers.get('x-ratelimit-requests-remaining')),
          rateLimitRemaining: numericHeader(res.headers.get('x-ratelimit-remaining')),
        }
        if (res.status >= 500) {
          lastErr = new Error(`api-football ${res.status}`)
          attempt++
          await sleep(250 * 2 ** attempt)
          continue
        }
        if (!res.ok) {
          const body = await res.text().catch(() => '')
          if (opts.strict) throw new NonRetryableStatus(`api-football ${res.status}: ${body}`)
          return { get: path, parameters: {}, errors: body, results: 0, paging: { current: 1, total: 1 }, response: [] }
        }
        return (await res.json()) as ApiFootballEnvelope<T>
      } catch (e) {
        // ⚠⚠ A 4xx MUST NOT BE RETRIED, AND USED TO BE. The strict throw above
        // is raised INSIDE this try, so its own catch swallowed it and went
        // round again — three requests, 3.5s of backoff, for an answer that
        // could not change. On a 429 that is the worst possible response: the
        // per-minute limit is 300 and we were spending three of them, twice
        // over, to be told the same thing. Measured by the guard's own tests.
        if (e instanceof NonRetryableStatus) throw e
        lastErr = e
        if (e instanceof Error && e.name === 'AbortError') break
        attempt++
        await sleep(250 * 2 ** attempt)
      }
    }
    if (opts.strict) throw lastErr instanceof Error ? lastErr : new Error('api-football request failed')
    return { get: path, parameters: {}, errors: String(lastErr), results: 0, paging: { current: 1, total: 1 }, response: [] }
  } finally {
    // ⚠ ONE PLACE, ALWAYS. The old condition (`attempt >= 3 || lastErr === null`)
    // left the timer running whenever a retry SUCCEEDED after a 5xx, and an
    // 8-second timer holding a serverless invocation open is a cost nobody
    // attributes to the request that caused it.
    clearTimeout(timeout)
  }
}

/**
 * A status the provider will keep giving us — 4xx. Retrying it spends calls to
 * be refused again, so it leaves the retry loop immediately.
 *
 * ⚠ The 8-second timeout is a budget for ALL THREE attempts, not one each,
 * because the controller is created once outside the loop. That is worth
 * knowing before raising the retry count: the backoff sleeps come out of the
 * same budget.
 */
class NonRetryableStatus extends Error {}

function numericHeader(v: string | null): number | null {
  if (v === null) return null
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

// =============================================================
// Public
// =============================================================

export async function getFixtures(params: {
  league: number
  season: number
  date?: string  // YYYY-MM-DD, optional (when omitted, returns full season)
  from?: string
  to?: string
}): Promise<ApiFootballFixture[]> {
  const env = await request<ApiFootballFixture>('/fixtures', params)
  return env.response
}

export async function getFixtureById(id: number): Promise<ApiFootballFixture | null> {
  const env = await request<ApiFootballFixture>('/fixtures', { id })
  return env.response[0] ?? null
}

/**
 * The three per-fixture reads, and the one rule they all have to obey.
 *
 * ⚠⚠ AN EMPTY RESPONSE IS NOT EVIDENCE OF AN EMPTY MATCH, AND THE CALLERS
 * DELETE. Steps 7b3 and 7b4 are replace-all — they clear the fixture's rows and
 * re-insert what came back — so a refusal that arrives as `[]` does not merely
 * skip an update, it ERASES the timeline or the stat card and writes nothing
 * back. `scripts/backfill-match-events.ts` has the same shape across every
 * fixture in a run.
 *
 * ⚠⚠ AND THE PROVIDER REFUSES WITH HTTP 200. A rejected parameter, a plan
 * restriction and an exhausted daily allowance all come back `200` with
 * `response: []` and a populated `errors` field — verified against the live API
 * on 2026-09-09 for all three of these paths:
 *   /fixtures/events?fixture=abc  ->  200 {"errors":{"fixture":"...integer."}}
 * So `res.ok` is true, `opts.strict` never fires, and the rate-limit headers
 * are present and healthy-looking on a refusal. `getFixturesAllPages` has read
 * `errors` since L3 for exactly this reason; these three did not, which left
 * the daily quota running out as a data-DELETION event rather than a stale one.
 *
 * ⚠ A GENUINELY UNKNOWN FIXTURE ANSWERS `errors: []`, which is what makes the
 * check a clean discriminator rather than a guess: `/fixtures/events?fixture=
 * 999999999` returns an empty response with NO errors. Empty-with-errors is a
 * refusal; empty-without is really nothing, and the callers may act on it.
 *
 * ⚠ STRICT, SO A TIMEOUT OR A 5xx THROWS TOO. Those return `[]` from `request`
 * as well, and an empty array from a dead socket deletes exactly as thoroughly
 * as one from a refusal.
 */
async function fixtureSubresource<T>(path: string, fixtureId: number): Promise<T[]> {
  const env = await request<T>(path, { fixture: fixtureId }, { strict: true })
  if (hasEnvelopeErrors(env.errors)) {
    throw new Error(`api-football ${path} refused: ${JSON.stringify(env.errors)}`)
  }
  return env.response
}

export async function getFixtureEvents(fixtureId: number): Promise<ApiFootballEvent[]> {
  return fixtureSubresource<ApiFootballEvent>('/fixtures/events', fixtureId)
}

/**
 * One fixture's line-ups — two entries, home and away.
 *
 * ⚠ AN EMPTY ARRAY IS THE NORMAL PRE-MATCH ANSWER, not a failure. The feed
 * publishes a line-up roughly an hour before kickoff and returns `[]` until it
 * does, which is exactly why the sync's line-up arm retries rather than
 * recording a fixture as done the first time it asks.
 *
 * That empty is now distinguishable from a refusal — see `fixtureSubresource`.
 * Before, "no line-up yet" and "the provider is unhappy" were the same value,
 * which was survivable here only because the arm retries; the same swallow in
 * 7b3 was not survivable at all.
 */
export async function getFixtureLineups(fixtureId: number): Promise<ApiFootballLineup[]> {
  return fixtureSubresource<ApiFootballLineup>('/fixtures/lineups', fixtureId)
}

/**
 * One fixture's team statistics — two entries, home and away.
 *
 * ⚠ THE TYPE SET VARIES BY FIXTURE AND BY SEASON. Sampled live 2026-09-06:
 * one fixture sent 18 types, another 16 — missing `expected_goals` entirely and
 * carrying a `Free Kicks` the first did not have. The mapper ignores unknown
 * types and leaves absent ones null; nothing here tries to normalise the shape.
 */
export async function getFixtureStatistics(
  fixtureId: number,
): Promise<ApiFootballTeamStatistics[]> {
  return fixtureSubresource<ApiFootballTeamStatistics>('/fixtures/statistics', fixtureId)
}

/**
 * Every meeting between two clubs the provider holds — back to 2010.
 *
 * ⚠ ONE CALL PER PAIRING, AND A PAIRING ONLY CHANGES WHEN THEY PLAY AGAIN.
 * That is what makes a scouting tab affordable: 190 pairings covers a whole
 * twenty-club league, against the 7,500/day plan. The caller caches.
 *
 * ⚠ IT CANNOT BE FILTERED TO ONE COMPETITION. `?league=` is refused without a
 * `season`, and a scout report wants every season — so the whole history comes
 * back with friendlies and pre-season tournaments mixed in, and
 * `lib/scouting/h2h.ts` filters them out on the way through.
 */
export async function getHeadToHead(
  homeExternalId: number,
  awayExternalId: number,
  last = 50,
): Promise<ApiFootballFixture[]> {
  const env = await request<ApiFootballFixture>('/fixtures/headtohead', {
    h2h: `${homeExternalId}-${awayExternalId}`,
    last,
  })
  return env.response
}

export async function getTeamsForLeague(params: {
  league: number
  season: number
}): Promise<ApiFootballTeam[]> {
  const env = await request<ApiFootballTeam>('/teams', params)
  return env.response
}

/**
 * `errors` is `[]` when clean and an OBJECT when populated — both shapes are
 * returned by the live API and both are handled here.
 */
export function hasEnvelopeErrors(errs: unknown): boolean {
  if (errs == null) return false
  if (Array.isArray(errs)) return errs.length > 0
  if (typeof errs === 'string') return errs.length > 0
  if (typeof errs === 'object') return Object.keys(errs as object).length > 0
  return false
}

/**
 * Max pages we will ever pull for one window.
 *
 * `/fixtures` does not paginate at this plan — `?league=39&season=2026` returns
 * all 380 fixtures with `paging {current:1,total:1}`, and league 1 returns all
 * 104 the same way. So `total > 1` means the provider changed its behaviour,
 * and that has to be loud rather than silently truncated.
 */
const MAX_FIXTURE_PAGES = 3

/**
 * Paged, strict `/fixtures`.
 *
 * Two things this does that `getFixtures` does not, both mandatory for the
 * league sync arm:
 *
 * 1. **It reads `env.errors`.** api-football reports a parameter rejection, a
 *    plan restriction and an exhausted daily allowance as **HTTP 200** with a
 *    populated `errors` field and `response: []`, e.g.
 *      {"errors":{"from":"The From field must contain a valid date: Y-m-d."},"response":[]}
 *    `opts.strict` only fires on `!res.ok` (see `request` above), so it cannot
 *    see this. Without the check, "the feed refused us" and "the provider has
 *    nothing for this window" are the same value — and the rate-limit headers
 *    are present on a refusal, so `getLastQuota()` looks healthy in both cases.
 *
 * 2. **It reads `env.paging` and throws** rather than truncating at the cap. A
 *    silently truncated window is a fixture that never syncs.
 *
 * Deliberately a separate function: `getFixtures` is on the World Cup path and
 * ignores both `errors` and `paging` today. Changing it would change World Cup
 * behaviour, which L3 must not do.
 */
export async function getFixturesAllPages(
  params: { league: number; season: number; date?: string; from?: string; to?: string },
  opts: ApiFootballRequestOptions = {},
): Promise<{ fixtures: ApiFootballFixture[]; calls: number }> {
  const out: ApiFootballFixture[] = []
  let calls = 0
  let page = 1
  for (;;) {
    // `page` is OMITTED on the first request. Measured against the live API on
    // 2026-08-22: sending `page=1` to /fixtures is REFUSED —
    //   {"errors":{"page":"The Page field do not exist."},"response":[]}
    // — as an HTTP 200, which is precisely the shape `hasEnvelopeErrors` exists
    // to catch. Without that check this would have looked like an empty feed on
    // every single tick, forever, with no error anywhere.
    const query = page === 1 ? params : { ...params, page }
    const env = await request<ApiFootballFixture>('/fixtures', query, opts)
    calls++
    if (hasEnvelopeErrors(env.errors)) {
      throw new Error(`api-football /fixtures refused: ${JSON.stringify(env.errors)}`)
    }
    out.push(...env.response)
    const total = env.paging?.total ?? 1
    if (page >= total) break
    if (page >= MAX_FIXTURE_PAGES) {
      throw new Error(
        `api-football /fixtures paging cap: ${total} pages for league ${params.league} ` +
          `${params.from ?? params.date}..${params.to ?? params.date} (cap ${MAX_FIXTURE_PAGES})`,
      )
    }
    page++
  }
  return { fixtures: out, calls }
}

/**
 * The real league table, from the feed.
 *
 * NEW INGESTION PATH (plan §0.3). Until this, the client spoke only /fixtures,
 * /fixtures/events and /teams.
 *
 * ⚠ Checks `errors` and THROWS, like getFixturesAllPages and unlike
 * getFixtures. api-football answers a refusal — a bad parameter, an exhausted
 * plan allowance, a season the key cannot see — with **HTTP 200 and a populated
 * `errors` object**, and an empty `response`. Without this check a refusal is
 * indistinguishable from "this league has no table", which would silently blank
 * the standings for every member and, once Table mode ships, silently score
 * everybody against nothing.
 *
 * Returns the FLATTENED rows. `/standings` nests them under
 * `response[0].league.standings`, and that inner level is an array of groups —
 * one for a league, several for a cup group stage.
 */
export async function getStandings(params: {
  league: number
  season: number
}, opts: ApiFootballRequestOptions = {}): Promise<ApiFootballStandingRow[]> {
  const env = await request<ApiFootballStandingsResponse>('/standings', params, opts)
  if (hasEnvelopeErrors(env.errors)) {
    throw new Error(`api-football /standings refused: ${JSON.stringify(env.errors)}`)
  }
  const groups = env.response[0]?.league?.standings ?? []
  return groups.flat()
}

export const ApiFootballClient = {
  getFixtures,
  getStandings,
  getFixtureById,
  getFixtureEvents,
  getFixtureLineups,
  getFixtureStatistics,
  getHeadToHead,
  getTeamsForLeague,
  getLastQuota,
  // Present for symmetry only. The league arm imports the NAMED export so that
  // `vi.mock('./client')` can intercept it.
  getFixturesAllPages,
}
