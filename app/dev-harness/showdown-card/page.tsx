'use client'

// =============================================================
// THROWAWAY HARNESS — the Showdown duel band, in every state at once
// =============================================================
// ⚠ NOT A PRODUCT ROUTE. It exists so the band can be SEEN before it is handed
// over, and it is the only way to see it honestly: the four states are mutually
// exclusive in a real pool, so no live pool ever shows more than one, and
// reaching even that one costs a login and a seeded season.
//
// The same reasoning as the drag-picker harness — never verify a card against a
// real open pool, because the real pool is somebody's data. Nothing here writes.
//
// Delete when the band is settled.
//
// ⚠ NOT `app/_harness/` — a leading underscore is a Next PRIVATE FOLDER and is
// excluded from routing, so that path 404s however correct the page is.

import { notFound } from 'next/navigation'

import { PoolCard } from '@/components/pools/PoolCard'
import type { PoolCardPool } from '@/lib/pools/card'

const MEMBERS = [
  { user_id: 'u1', full_name: 'Ryan Sousa', username: 'IZZETmagic', avatar_url: null },
  { user_id: 'u2', full_name: 'Sophie Owen', username: 'sowen', avatar_url: null },
  { user_id: 'u3', full_name: 'Marcus Bell', username: 'mbell', avatar_url: null },
]

const MARCUS = { user_id: 'u3', full_name: 'Marcus Bell', username: 'mbell' }

/** A Showdown pool, with only the fields the card reads. */
function pool(over: Partial<PoolCardPool>): PoolCardPool {
  return {
    pool_id: 'p1',
    pool_name: 'Showdown Duels',
    pool_code: 'ABC123',
    status: 'open',
    // The open matchweek's lock — the foot's clock, deliberately NOT the band's.
    prediction_deadline: new Date(Date.now() + 2 * 24 * 3600e3).toISOString(),
    prediction_mode: 'scores',
    league_mode: 'showdown',
    role: 'admin',
    total_points: 1400,
    current_rank: 1,
    highest_level: null,
    externalLeagueId: 39,
    openMatchweekNumber: 4,
    inPlayMatchweekNumber: 3,
    matchweekCount: 38,
    has_submitted_predictions: false,
    memberCount: 10,
    members: MEMBERS,
    totalEntries: 10,
    hasScoringStarted: true,
    totalMatches: 10,
    predictedMatches: 0,
    form: [],
    showdown: {
      duelPoints: 500,
      won: 1,
      tied: 0,
      lost: 0,
      byes: 0,
      opponentName: null,
      opponent: null,
      isBye: false,
      revealsAt: null,
      duelMatchweek: 4,
      recentDuels: ['won', 'won', 'tied'],
    },
    ...over,
  } as PoolCardPool
}

const CASES: { name: string; note: string; pool: PoolCardPool }[] = [
  {
    name: 'Sealed',
    note: 'The clock sits where the matchweek sits once the draw opens — one row, not a taller stack.',
    pool: pool({
      showdown: {
        ...pool({}).showdown!,
        revealsAt: new Date(Date.now() + 118.8 * 3600e3).toISOString(),
      },
    }),
  },
  {
    name: 'Revealed',
    note: 'A face, and the matchweek in the centre. Never a scoreline — the card excludes the in-play duel by design.',
    pool: pool({
      showdown: { ...pool({}).showdown!, opponentName: 'Marcus Bell', opponent: MARCUS },
    }),
  },
  {
    name: 'Bye',
    note: 'Nobody was drawn against them. Not an error, and it says so.',
    pool: pool({ showdown: { ...pool({}).showdown!, isBye: true } }),
  },
  {
    name: 'Revealed, no user row',
    note: 'The name without the person — rare, and the name is still the answer.',
    pool: pool({
      showdown: { ...pool({}).showdown!, opponentName: 'Marcus Bell', opponent: null },
    }),
  },
  {
    name: 'Unranked',
    note: 'Before scoring starts there is no rank to show, and the corner says so rather than printing #null.',
    pool: pool({
      current_rank: null,
      hasScoringStarted: false,
      showdown: { ...pool({}).showdown!, opponentName: 'Marcus Bell', opponent: MARCUS },
    }),
  },
]

export default function ShowdownCardHarness() {
  // ⚠ 404 IN PRODUCTION. This is a routable path under `app/`, so without this
  // it ships as a public page on sportpool.io — an unauthenticated route
  // rendering fabricated pools, which is exactly the kind of thing that gets
  // found by a crawler rather than by us.
  if (process.env.NODE_ENV === 'production') notFound()

  return (
    <div className="min-h-screen bg-snow p-8">
      <p className="t-caption text-muted">Harness &middot; not a product route</p>
      {/* ⚠ NOT `t-display`. `leagueModeCopy.guard` reserves it for Showdown
          SURFACES, and this is a page ABOUT one — borrowing the treatment
          here would widen an allow-list with a file that never ships. */}
      <h2 className="t-section mb-1 text-ink">Showdown duel band</h2>
      <p className="t-body mb-8 max-w-2xl text-muted">
        Every state at once, which no real pool can show. List variant at 544px on
        the left, grid variant at 357px on the right &mdash; the band has to hold
        both.
      </p>

      <div className="flex flex-col gap-10">
        {CASES.map((c) => (
          <section key={c.name}>
            <h2 className="t-section text-ink">{c.name}</h2>
            <p className="t-body mb-3 max-w-2xl text-muted">{c.note}</p>
            <div className="flex flex-wrap items-start gap-6">
              <div style={{ width: 544 }}>
                <PoolCard pool={c.pool} unreadCount={0} variant="list" />
              </div>
              <div style={{ width: 357 }}>
                <PoolCard pool={c.pool} unreadCount={0} variant="grid" />
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
