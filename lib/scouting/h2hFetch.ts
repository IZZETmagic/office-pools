import { unstable_cache } from 'next/cache'

import { getHeadToHead } from '@/lib/integrations/apiFootball/client'
import type { H2HFixture } from './h2h'

// =============================================================
// Fetching a club pair's history, once
// =============================================================
// Extracted from `/api/fixtures/:id/h2h` so a second route can ask the same
// question without a second cache entry or a second copy of the provider's
// field names.
//
// ⚠⚠ CACHED ON THE ORDERED CLUB PAIR, NOT THE FIXTURE. The reverse fixture in
// April has the same history as the one in September, and so does every future
// meeting; keying on `fixture_id` would fetch identical rows again under a
// different name. Ordering the pair low-high before it becomes a key makes
// Arsenal-Chelsea and Chelsea-Arsenal one entry rather than two.
//
// ⚠ AND IT IS WHY THIS IS SHARED RATHER THAN COPIED. Two routes each building
// their own key would double the provider spend on the same answer, against a
// 7,500/day plan the fixture sync depends on.
// =============================================================

/** A day. A pairing's history changes only when they play, which is rarer. */
export const H2H_TTL_SECONDS = 60 * 60 * 24

/**
 * ⚠ THE ONE PLACE THE PROVIDER'S FIELD NAMES ARE READ, so a change to their
 * payload lands in a single function. `summariseH2H` is pure and knows nothing
 * about api-football.
 */
export function normaliseH2H(raw: unknown[]): H2HFixture[] {
  const out: H2HFixture[] = []
  for (const r of raw as Record<string, never>[]) {
    const f = r as unknown as {
      fixture: { id: number; date: string; venue?: { name: string | null } | null }
      league: { id: number; name: string }
      teams: { home: { id: number }; away: { id: number } }
      goals: { home: number | null; away: number | null }
      score?: { halftime?: { home: number | null; away: number | null } | null } | null
    }
    // A meeting with no score never happened as far as a record is concerned —
    // an abandoned or postponed fixture can still appear here.
    if (f?.goals?.home === null || f?.goals?.away === null) continue
    out.push({
      fixtureId: f.fixture.id,
      date: f.fixture.date,
      competitionId: f.league.id,
      competition: f.league.name,
      venueName: f.fixture.venue?.name ?? null,
      homeExternalId: f.teams.home.id,
      awayExternalId: f.teams.away.id,
      homeGoals: f.goals.home as number,
      awayGoals: f.goals.away as number,
      htHome: f.score?.halftime?.home ?? null,
      htAway: f.score?.halftime?.away ?? null,
    })
  }
  return out
}

export function fetchCachedH2H(a: number, b: number): Promise<H2HFixture[]> {
  // Ordered, so the pair is one cache entry rather than two.
  const [lo, hi] = a < b ? [a, b] : [b, a]
  return unstable_cache(
    async () => normaliseH2H(await getHeadToHead(lo, hi)),
    ['h2h', String(lo), String(hi)],
    { tags: [`h2h:${lo}-${hi}`], revalidate: H2H_TTL_SECONDS },
  )()
}
