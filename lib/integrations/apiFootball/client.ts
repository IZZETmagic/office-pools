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

export const ApiFootballClient = {
  getFixtures,
  getFixtureById,
  getFixtureEvents,
  getTeamsForLeague,
  getLastQuota,
}
