'use client'

// =============================================================
// THROWAWAY HARNESS — The Room, with a locked week and an open one
// =============================================================
// ⚠ NOT A PRODUCT ROUTE, and gated off production by `app/dev-harness/layout.tsx`.
// It exists so the web Room's 2026-10-09 layout can be SEEN without a login and
// without opening a real pool. Nothing here writes.
//
// Week 5 has locked (settled duels, picks shown). Week 6 is OPEN — and its
// rivals' picks are deliberately IN the payload below, so the page proves the
// Room still dashes them rather than trusting the server alone.
//
// Delete when the Room is settled.

import { ShowdownRoom } from '@/app/pools/[pool_id]/ShowdownRoom'
import type { AvatarPerson } from '@/components/ui/Avatar'
import type { DuelRow } from '@/lib/league/duels'
import type { SeasonMatch } from '@/lib/league/matchweekFixtures'

const PEOPLE: Array<[string, AvatarPerson]> = [
  ['e1', { user_id: 'u-ryan', full_name: 'Ryan Sousa', username: 'IZZETmagic', avatar_colour: 'teal' }],
  ['e2', { user_id: 'u-elena', full_name: 'Elena Rossi', username: 'Elena Rossi', avatar_colour: 'teal' }],
  ['e3', { user_id: 'u-qq', full_name: 'Quantum Quark', username: 'Quantum Quark' }],
  ['e4', { user_id: 'u-tommy', full_name: 'Tommy O', username: 'Tommy O' }],
  ['e5', { user_id: 'u-mia', full_name: 'Mia T', username: 'Mia T' }],
]
const entryPeople = new Map(PEOPLE)
const entryNames = new Map(PEOPLE.map(([e, p]) => [e, p.username ?? '']))

const CLUBS = [
  ['ARS', 'Arsenal'], ['CHE', 'Chelsea'], ['LIV', 'Liverpool'], ['MCI', 'Manchester City'],
  ['TOT', 'Tottenham Hotspur'], ['NEW', 'Newcastle United'],
] as const

function fixtures(week: number, played: boolean): SeasonMatch[] {
  return [0, 1, 2].map((i) => {
    const [ha, hn] = CLUBS[i * 2]
    const [aa, an] = CLUBS[i * 2 + 1]
    return {
      match_id: `m${week}-${i}`,
      match_number: week * 10 + i,
      round_number: week,
      match_date: played ? '2026-10-04T14:00:00Z' : '2026-10-11T14:00:00Z',
      home_team: { country_name: hn, country_code: ha, flag_url: null },
      away_team: { country_name: an, country_code: aa, flag_url: null },
      home_score_ft: played ? [2, 1, 0][i] : null,
      away_score_ft: played ? [1, 1, 3][i] : null,
      is_completed: played,
      status: played ? 'FT' : 'NS',
      live_minute: null,
      live_period: null,
      live_added: null,
    }
  })
}

const matches = [...fixtures(5, true), ...fixtures(6, false)]

const duels: DuelRow[] = [
  { duel_id: 'd5a', matchweek_number: 5, entry_a: 'e1', entry_b: 'e3', accuracy_a: 200, accuracy_b: 100, points_a: 500, points_b: 0, settled_at: '2026-10-05T22:00:00Z' },
  { duel_id: 'd5b', matchweek_number: 5, entry_a: 'e2', entry_b: 'e4', accuracy_a: 100, accuracy_b: 100, points_a: 250, points_b: 250, settled_at: '2026-10-05T22:00:00Z' },
  { duel_id: 'd5c', matchweek_number: 5, entry_a: 'e5', entry_b: null, accuracy_a: null, accuracy_b: null, points_a: 250, points_b: null, settled_at: '2026-10-05T22:00:00Z' },
  { duel_id: 'd6a', matchweek_number: 6, entry_a: 'e1', entry_b: 'e2', accuracy_a: null, accuracy_b: null, points_a: null, points_b: null, settled_at: null },
  { duel_id: 'd6b', matchweek_number: 6, entry_a: 'e3', entry_b: 'e4', accuracy_a: null, accuracy_b: null, points_a: null, points_b: null, settled_at: null },
  { duel_id: 'd6c', matchweek_number: 6, entry_a: 'e5', entry_b: null, accuracy_a: null, accuracy_b: null, points_a: null, points_b: null, settled_at: null },
]

const pick = (entry: string, match: string, outcome: 'home' | 'draw' | 'away') => ({ entry_id: entry, match_id: match, outcome })
const leagueOutcomes = [
  // Week 5 — locked, so all of these show.
  pick('e1', 'm5-0', 'home'), pick('e1', 'm5-1', 'draw'), pick('e1', 'm5-2', 'home'),
  pick('e3', 'm5-0', 'home'), pick('e3', 'm5-1', 'home'), pick('e3', 'm5-2', 'away'),
  pick('e2', 'm5-0', 'away'), pick('e2', 'm5-1', 'draw'), pick('e2', 'm5-2', 'away'),
  pick('e4', 'm5-0', 'home'), pick('e4', 'm5-1', 'draw'), pick('e4', 'm5-2', 'home'),
  // Week 6 — OPEN. Your own (e1) should show; every rival's must be a dash.
  pick('e1', 'm6-0', 'home'), pick('e1', 'm6-1', 'away'), pick('e1', 'm6-2', 'draw'),
  pick('e2', 'm6-0', 'away'), pick('e2', 'm6-1', 'away'), pick('e2', 'm6-2', 'home'),
  pick('e3', 'm6-0', 'draw'), pick('e4', 'm6-0', 'home'),
]

export default function ShowdownRoomHarness() {
  return (
    <main className="min-h-screen bg-snow py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <p className="t-caption text-muted mb-4">Harness · The Room · week 5 locked, week 6 open</p>
        <ShowdownRoom
          poolId="harness"
          duels={duels}
          entryNames={entryNames}
          entryPeople={entryPeople}
          ownEntryIds={['e1']}
          matches={matches}
          inPlayMatchweek={null}
          openMatchweek={6}
          unwatchedMatchweek={null}
          leagueOutcomes={leagueOutcomes}
          allPredictions={[]}
          bulkState="ready"
          livePerFixture={new Map()}
        />
      </div>
    </main>
  )
}
