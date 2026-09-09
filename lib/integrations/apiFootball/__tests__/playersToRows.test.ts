// =============================================================
// Per-player statistics
// =============================================================
// Driven from a REAL captured response (Fulham 2-0 Newcastle, fixture 1379342)
// rather than a hand-written one, because every bug worth catching here is a
// bug about what the provider actually sends:
//
//   · `rating` is the string '7', and null for an unused substitute;
//   · `passes.accuracy` is 26 out of 35 — a COUNT, where the TEAM-level
//     equivalent is the string '83%';
//   · there is no `starter` field, only `substitute`, which has to be inverted;
//   · `penalty.commited` is spelled with one 't'.
//
// The percentage/count confusion is the one that would have shipped: 26 stored
// as a percentage of a 35-pass game looks entirely reasonable on a screen.
// =============================================================

import { readFileSync } from 'fs'
import { join } from 'path'

import { describe, expect, it } from 'vitest'

import { playersToRows } from '../mappers'
import type { ApiFootballPlayers } from '../types'

const bundle = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'pl-1379342-players.json'), 'utf8'),
) as { teams: { home: { id: number }; away: { id: number } }; players: ApiFootballPlayers[] }

const OPTS = { fixtureId: 'fx-1', homeExternalTeamId: bundle.teams.home.id }
const rows = playersToRows(bundle.players, OPTS)
const byName = (n: string) => rows.find((r) => r.player_name === n)!

describe('playersToRows — the real payload', () => {
  it('maps every player it was given', () => {
    expect(rows).toHaveLength(7)
    expect(rows.every((r) => r.fixture_id === 'fx-1')).toBe(true)
  })

  it('⚠ sides come from the TEAM ID, never the name', () => {
    expect(byName('Bernd Leno').side).toBe('home')
    expect(byName('Nick Pope').side).toBe('away')
  })

  it('⚠⚠ passes.accuracy is a COUNT of completed passes, not a percentage', () => {
    // The whole reason the column is `passes_accurate` and not `passes_pct`.
    const leno = byName('Bernd Leno')
    expect(leno.passes_total).toBe(35)
    expect(leno.passes_accurate).toBe(26)
    // The invariant migration 141 also enforces in SQL.
    for (const r of rows) {
      if (r.passes_total !== null && r.passes_accurate !== null) {
        expect(r.passes_accurate).toBeLessThanOrEqual(r.passes_total)
      }
    }
  })

  it('⚠ the rating is a string in the feed and a number here', () => {
    expect(byName('Bernd Leno').rating).toBe(7)
    expect(byName('Issa Diop').rating).toBe(7.5)
    expect(byName('Sven Botman').rating).toBe(7.3)
  })

  it('⚠ an unused substitute keeps his row, with nulls rather than zeros', () => {
    // He was named, so he belongs in the squad list. "Did not play" and
    // "played and registered nothing" must not collapse into the same row.
    const sub = byName('Benjamin Lecomte')
    expect(sub.is_starter).toBe(false)
    expect(sub.rating).toBeNull()
    expect(sub.minutes).toBeNull()
    expect(sub.passes_total).toBeNull()
  })

  it('⚠ is_starter is INVERTED from `substitute` — there is no starter field', () => {
    expect(byName('Bernd Leno').is_starter).toBe(true)
    expect(byName('Aaron Ramsdale').is_starter).toBe(false)
  })

  it('carries the captain through', () => {
    expect(byName('Bernd Leno').is_captain).toBe(true)
    expect(byName('Bruno Guimarães').is_captain).toBe(true)
    expect(byName('Issa Diop').is_captain).toBe(false)
  })

  it('keeps positions to the four the feed uses', () => {
    expect(rows.map((r) => r.position).every((p) => p === null || 'GDMF'.includes(p!))).toBe(true)
    expect(byName('Bernd Leno').position).toBe('G')
    expect(byName('Sven Botman').position).toBe('D')
  })
})

describe('playersToRows — the traps', () => {
  const one = (over: Record<string, unknown>): ApiFootballPlayers[] => [
    {
      team: { id: 1, name: 'Home' },
      players: [
        {
          player: { id: 99, name: 'A Player' },
          statistics: [
            {
              games: { minutes: 90, number: 9, position: 'F', rating: '7.0', captain: false, substitute: false },
              offsides: null,
              shots: { total: null, on: null },
              goals: { total: null, conceded: null, assists: null, saves: null },
              passes: { total: null, key: null, accuracy: null },
              tackles: { total: null, blocks: null, interceptions: null },
              duels: { total: null, won: null },
              dribbles: { attempts: null, success: null, past: null },
              fouls: { drawn: null, committed: null },
              cards: { yellow: 0, red: 0 },
              penalty: { won: null, commited: null, scored: 0, missed: 0, saved: null },
              ...over,
            } as never,
          ],
        },
      ],
    },
  ]
  const first = (over: Record<string, unknown>) => playersToRows(one(over), { fixtureId: 'f', homeExternalTeamId: 1 })[0]

  it('⚠ reads the provider’s misspelled `commited`', () => {
    expect(first({ penalty: { won: 1, commited: 2, scored: 0, missed: 0, saved: null } }).penalty_committed).toBe(2)
  })

  it('⚠ a correctly-spelled `committed` is NOT read — that is the point', () => {
    // If someone "tidies" the mapper key to match the column name, this fails
    // rather than silently storing NULL for every player forever.
    const r = first({ penalty: { won: null, committed: 5, scored: 0, missed: 0, saved: null } as never })
    expect(r.penalty_committed).toBeNull()
  })

  it('⚠ an empty string is null, not zero', () => {
    // `Number('')` is 0. "Took no shots" and "not recorded" are different facts.
    expect(first({ shots: { total: '', on: null } as never }).shots_total).toBeNull()
  })

  it('⚠ null stays null and is never coerced to 0', () => {
    const r = first({})
    expect(r.shots_total).toBeNull()
    expect(r.duels_total).toBeNull()
    expect(r.offsides).toBeNull()
    // …while a real zero survives as zero.
    expect(r.yellow_cards).toBe(0)
    expect(r.penalty_scored).toBe(0)
  })

  it('⚠ a rating outside 0-10 is dropped, not stored', () => {
    // The column is CHECK 0..10; failing the whole fixture's write over one
    // glitched display-only number would cost forty players their statistics.
    expect(first({ games: { minutes: 1, number: 1, position: 'F', rating: '99', captain: false, substitute: false } }).rating).toBeNull()
    expect(first({ games: { minutes: 1, number: 1, position: 'F', rating: '-1', captain: false, substitute: false } }).rating).toBeNull()
  })

  it('⚠⚠ a rating of 0 is "unrated", not a rating — it becomes null', () => {
    // REGRESSION, found in production. 50 rows came back rated 0 on the first
    // real backfill and not one was an assessment: 44 never played, and the
    // other 6 were 1-minute cameos the provider does not rate. Storing them
    // would drag every avg(rating) down with phantom zeros.
    const g = { minutes: 1, number: 1, position: 'F', captain: false, substitute: true }
    expect(first({ games: { ...g, rating: '0' } }).rating).toBeNull()
    expect(first({ games: { ...g, rating: 0 } as never }).rating).toBeNull()
    // …and a genuinely bad rating survives.
    expect(first({ games: { ...g, rating: '3.0' } }).rating).toBe(3)
  })

  it('⚠ an unknown position is null rather than guessed', () => {
    expect(first({ games: { minutes: 1, number: 1, position: 'ST', rating: null, captain: false, substitute: false } }).position).toBeNull()
  })

  it('⚠ a player with no provider id is skipped, not given a synthetic one', () => {
    const sides = one({})
    sides[0].players[0].player.id = null
    expect(playersToRows(sides, { fixtureId: 'f', homeExternalTeamId: 1 })).toHaveLength(0)
  })

  it('⚠⚠ player id 0 is a SENTINEL and is skipped — it repeats within a fixture', () => {
    // REGRESSION, found in production. api-football uses 0 for a player it does
    // not hold, so one fixture can carry several: Marseille v Paris FC had two,
    // and the second violated uq_match_player_stats_fixture_player on the first
    // real backfill. They arrive with no position, 0 minutes and rating '0' —
    // storing them would also drop a fake 0.0 into every rating average.
    const sides: ApiFootballPlayers[] = [
      {
        team: { id: 1, name: 'Home' },
        players: [
          { player: { id: 0, name: 'Bamo Meite' }, statistics: one({})[0].players[0].statistics },
          { player: { id: 0, name: 'Nouhoum Kamissoko' }, statistics: one({})[0].players[0].statistics },
          { player: { id: 7, name: 'A Real Player' }, statistics: one({})[0].players[0].statistics },
        ],
      },
    ]
    const out = playersToRows(sides, { fixtureId: 'f', homeExternalTeamId: 1 })
    expect(out).toHaveLength(1)
    expect(out[0].player_name).toBe('A Real Player')
  })

  it('survives an absent players arm entirely', () => {
    expect(playersToRows(undefined, { fixtureId: 'f', homeExternalTeamId: 1 })).toEqual([])
    expect(playersToRows([], { fixtureId: 'f', homeExternalTeamId: 1 })).toEqual([])
  })
})
