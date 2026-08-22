import type {
  ApiFootballEnvelope,
  ApiFootballEvent,
  ApiFootballFixture,
  ApiFootballQuotaInfo,
  ApiFootballRequestOptions,
  ApiFootballTeam,
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
        if (opts.strict) throw new Error(`api-football ${res.status}: ${body}`)
        return { get: path, parameters: {}, errors: body, results: 0, paging: { current: 1, total: 1 }, response: [] }
      }
      return (await res.json()) as ApiFootballEnvelope<T>
    } catch (e) {
      lastErr = e
      if (e instanceof Error && e.name === 'AbortError') break
      attempt++
      await sleep(250 * 2 ** attempt)
    } finally {
      if (attempt >= 3 || lastErr === null) clearTimeout(timeout)
    }
  }
  clearTimeout(timeout)
  if (opts.strict) throw lastErr instanceof Error ? lastErr : new Error('api-football request failed')
  return { get: path, parameters: {}, errors: String(lastErr), results: 0, paging: { current: 1, total: 1 }, response: [] }
}

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

export async function getFixtureEvents(fixtureId: number): Promise<ApiFootballEvent[]> {
  const env = await request<ApiFootballEvent>('/fixtures/events', { fixture: fixtureId })
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
    const env = await request<ApiFootballFixture>('/fixtures', { ...params, page }, opts)
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

export const ApiFootballClient = {
  getFixtures,
  getFixtureById,
  getFixtureEvents,
  getTeamsForLeague,
  getLastQuota,
  // Present for symmetry only. The league arm imports the NAMED export so that
  // `vi.mock('./client')` can intercept it.
  getFixturesAllPages,
}
