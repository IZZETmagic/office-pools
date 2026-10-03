// lib/crews/read.ts against the in-memory fake. The scoring read is mocked so each test states the
// ranks it means; everything else — who may see what, statuses, history — is the real code.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const ranks = new Map<string, number | null>()
vi.mock('@/lib/scoring/readSource', () => ({
  getScoringSource: vi.fn(async (_a: unknown, _p: string, mode: string) => (mode === 'league_pickem' ? 'league' : 'shadow')),
  readEntryScoring: vi.fn(async (_a: unknown, entryIds: string[]) => new Map(entryIds.map((id) => [id, { current_rank: ranks.get(id) ?? null }]))),
}))

import { fakeDb } from './fakeDb'
import { listMyCrews, readCrew, readPoolCrew, readRoster } from '../read'

const NOW = Date.parse('2026-10-02T12:00:00Z')
const SOON = '2026-10-05T18:00:00Z'
const PAST = '2026-09-01T18:00:00Z'

const pool = (pool_id: string, crew_id: string, extra: Record<string, unknown> = {}) => ({
  pool_id,
  pool_name: pool_id.toUpperCase(),
  crew_id,
  created_at: '2026-06-01T00:00:00Z',
  archived_at: null,
  status: 'open',
  accepting_members: true,
  prediction_mode: 'full_tournament',
  league_mode: null,
  league_season_id: null,
  tournament_id: 't-wc',
  admin_user_id: 'dave',
  ...extra,
})
const mem = (crew_id: string, user_id: string, role = 'member', extra: Record<string, unknown> = {}) => ({
  crew_id,
  user_id,
  role,
  joined_at: '2026-06-01T00:00:00Z',
  left_at: null,
  left_reason: null,
  ...extra,
})
const entry = (entry_id: string, pool_id: string, user_id: string) => ({ entry_id, pool_id, user_id })

function world() {
  ranks.clear()
  // Bermuda Office: a finished World Cup season and a running Premier League one.
  ranks.set('e-wc-dave', 1).set('e-wc-priya', 2).set('e-wc-me', 3)
  ranks.set('e-pl-dave', 2).set('e-pl-me', 1)
  return fakeDb(
    {
      crews: [
        { crew_id: 'office', name: 'Bermuda Office', created_at: '2026-06-01T00:00:00Z', closed_at: null },
        { crew_id: 'five', name: 'Friday Five', created_at: '2026-07-01T00:00:00Z', closed_at: null },
        { crew_id: 'old', name: 'Closed', created_at: '2026-05-01T00:00:00Z', closed_at: '2026-08-01T00:00:00Z' },
        { crew_id: 'gone', name: 'I left', created_at: '2026-05-01T00:00:00Z', closed_at: null },
      ],
      crew_members: [
        mem('office', 'dave', 'captain'),
        mem('office', 'priya', 'co_captain'),
        mem('office', 'me'),
        mem('office', 'kicked', 'member', { left_at: '2026-09-01', left_reason: 'removed' }),
        mem('five', 'me', 'captain'),
        mem('five', 'sam'),
        mem('old', 'me'),
        mem('gone', 'me', 'member', { left_at: '2026-09-01', left_reason: 'left' }),
      ],
      pools: [
        pool('wc', 'office'),
        pool('pl', 'office', { prediction_mode: 'league_pickem', league_mode: 'pickem', league_season_id: 's-pl', created_at: '2026-08-10T00:00:00Z' }),
        pool('cl', 'five', { prediction_mode: 'league_pickem', league_mode: 'pickem', league_season_id: 's-cl', admin_user_id: 'me' }),
        pool('lms', 'five', { prediction_mode: 'league_pickem', league_mode: 'last_man_standing', league_season_id: 's-pl', created_at: '2026-05-01T00:00:00Z' }),
      ],
      pool_entries: [
        entry('e-wc-dave', 'wc', 'dave'), entry('e-wc-priya', 'wc', 'priya'), entry('e-wc-me', 'wc', 'me'),
        entry('e-pl-dave', 'pl', 'dave'), entry('e-pl-me', 'pl', 'me'),
        entry('e-lms-sam', 'lms', 'sam'), entry('e-lms-me', 'lms', 'me'),
      ],
      pool_members: [{ pool_id: 'wc', user_id: 'me' }, { pool_id: 'pl', user_id: 'me' }],
      crew_seats: [{ pool_id: 'cl', crew_id: 'five', user_id: 'me', resolved_at: null, resolution: null }],
      crew_invites: [{ invite_id: 'i1', crew_id: 'office', invitee_user_id: null, invitee_email: 'new@person.org', created_at: '2026-09-30', resolved_at: null }],
      users: [
        { user_id: 'dave', username: 'Dave', full_name: 'Dave', avatar_url: null, last_login: '2026-09-30T00:00:00Z' },
        { user_id: 'priya', username: 'priya', full_name: 'Priya', avatar_url: null, last_login: '2026-01-01T00:00:00Z' },
        { user_id: 'me', username: 'me', full_name: 'Me', avatar_url: null, last_login: '2026-10-01T00:00:00Z' },
        { user_id: 'sam', username: 'sam', full_name: 'Sam', avatar_url: null, last_login: null },
      ],
      tournaments: [{ tournament_id: 't-wc', name: 'FIFA World Cup 2026' }],
      league_seasons: [
        { season_id: 's-pl', competition_name: 'Premier League', season_label: '2026/27' },
        { season_id: 's-cl', competition_name: 'Champions League', season_label: '2026/27' },
      ],
    },
    {
      pool_finished_at: ({ p_pool_id }: { p_pool_id: string }) => (p_pool_id === 'wc' || p_pool_id === 'lms' ? '2026-07-19T20:00:00Z' : null),
      pool_first_lock_at: ({ p_pool_id }: { p_pool_id: string }) => (p_pool_id === 'cl' ? SOON : PAST),
      pool_tier_member_cap: ({ p_tier }: { p_tier: string }) => (p_tier === 'free' ? 10 : p_tier === 'plus' ? 30 : null),
    },
  )
}

beforeEach(() => ranks.clear())

describe('My Crews', () => {
  it('lists the crews I’m in — not closed ones, not ones I left — something to act on first', async () => {
    const cards = await listMyCrews(world().client, 'me', NOW)
    expect(cards.map((c) => c.crewId)).toEqual(['five', 'office'])
  })
  it('a held seat outranks a running season; a running season outranks quiet', async () => {
    const [five, office] = await listMyCrews(world().client, 'me', NOW)
    expect(five.status).toEqual({ kind: 'seat', poolId: 'cl', competition: 'Champions League 2026/27', firstLockAt: SOON })
    expect(office.status).toEqual({ kind: 'live', poolId: 'pl', competition: 'Premier League 2026/27' })
  })
  it('counts active people and seasons; the leader and my place come from finished seasons only', async () => {
    const office = (await listMyCrews(world().client, 'me', NOW)).find((c) => c.crewId === 'office')!
    expect(office).toMatchObject({ people: 3, seasons: 2 })
    expect(office.leader).toMatchObject({ userId: 'dave', titles: 1 })
    expect(office.me).toEqual({ position: 3, titles: 0, seasons: 1 })
  })
  it('a seat that has expired is not a seat any more', async () => {
    const db = world()
    db.tables.crew_seats[0].pool_id = 'lms' // lms locked in the past
    const five = (await listMyCrews(db.client, 'me', NOW)).find((c) => c.crewId === 'five')!
    expect(five.status.kind).not.toBe('seat')
  })
})

describe('one crew', () => {
  it('the removed and strangers cannot see it; a closed crew is gone', async () => {
    const db = world()
    expect(await readCrew(db.client, 'office', 'kicked', NOW)).toBeNull()
    expect(await readCrew(db.client, 'office', 'stranger', NOW)).toBeNull()
    expect(await readCrew(db.client, 'old', 'me', NOW)).toBeNull()
  })
  it('someone who left can still open it — that is where Rejoin lives', async () => {
    const d = await readCrew(world().client, 'gone', 'me', NOW)
    expect(d?.viewer).toEqual({ role: null, active: false, canManage: false, canSetCoCaptain: false, canRejoin: true })
  })
  it('members are listed captain first, active only', async () => {
    const d = await readCrew(world().client, 'office', 'me', NOW)
    expect(d!.members.map((m) => [m.userId, m.role])).toEqual([['dave', 'captain'], ['priya', 'co_captain'], ['me', 'member']])
  })
  it('playing now and past seasons, split by pool_finished_at — never pools.status', async () => {
    const d = await readCrew(world().client, 'office', 'me', NOW)
    expect(d!.playingNow.map((p) => [p.poolId, p.viewerIn, p.viewerRank])).toEqual([['pl', true, 1]])
    expect(d!.pastSeasons).toEqual([
      expect.objectContaining({ poolId: 'wc', competition: 'FIFA World Cup 2026', players: 3, viewerRank: 3, winners: [expect.objectContaining({ userId: 'dave' })] }),
    ])
  })
  it('all-time is seasons · titles · best — there is no points field to sum', async () => {
    const d = await readCrew(world().client, 'office', 'me', NOW)
    expect(d!.allTime.map((r) => [r.userId, r.seasons, r.titles, r.best])).toEqual([
      ['dave', 1, 1, 1],
      ['priya', 1, 0, 2],
      ['me', 1, 0, 3],
    ])
    expect(Object.keys(d!.allTime[0])).not.toContain('points')
  })
  it('Last Man Standing has no rank and no winner', async () => {
    ranks.set('e-lms-sam', 1)
    const d = await readCrew(world().client, 'five', 'me', NOW)
    const lms = d!.pastSeasons.find((p) => p.poolId === 'lms')!
    expect(lms.winners).toEqual([])
    expect(lms.viewerRank).toBeNull()
  })
  it('a member can join a running season they are not in; the seat state comes along', async () => {
    const d = await readCrew(world().client, 'five', 'me', NOW)
    expect(d!.playingNow.find((p) => p.poolId === 'cl')).toMatchObject({ viewerIn: false, joinable: true, seat: 'open' })
  })
  it('open invites are shown to the captain and co-captain only', async () => {
    const db = world()
    expect((await readCrew(db.client, 'office', 'dave', NOW))!.invites).toEqual([
      { inviteId: 'i1', invitee: null, email: 'new@person.org', createdAt: '2026-09-30' },
    ])
    expect((await readCrew(db.client, 'office', 'me', NOW))!.invites).toBeNull()
  })
})

describe('roster review', () => {
  it('everyone but the starter; reasons only with evidence; Free saves 9', async () => {
    const r = await readRoster(world().client, { crewId: 'office', starterId: 'dave', tier: 'free', now: NOW })
    expect(r!.rows.map((x) => [x.userId, x.reasons, x.ticked])).toEqual([
      // Priya was in the crew when the Premier League season began and has no entry in it.
      ['priya', ['Didn’t play last season', 'Hasn’t opened SportPool in 6 months'], false],
      ['me', [], true],
    ])
    expect(r).toMatchObject({ memberCap: 10, spots: 9, over: 0 })
  })
  it('"Didn’t play last season" only for people who were in the crew when it began', async () => {
    const db = world()
    db.tables.crew_members.push(mem('office', 'late', 'member', { joined_at: '2026-09-01T00:00:00Z' }))
    db.tables.crew_members.push(mem('office', 'skipped', 'member', { joined_at: '2026-06-01T00:00:00Z' }))
    db.tables.users.push({ user_id: 'late', username: 'late', last_login: '2026-09-30T00:00:00Z' }, { user_id: 'skipped', username: 'skipped', last_login: '2026-09-30T00:00:00Z' })
    const r = await readRoster(db.client, { crewId: 'office', starterId: 'dave', tier: 'free', now: NOW })
    expect(r!.rows.find((x) => x.userId === 'late')!.reasons).toEqual([])
    expect(r!.rows.find((x) => x.userId === 'skipped')!.reasons).toEqual(['Didn’t play last season'])
  })
  it('an uncapped tier saves everyone; a non-member cannot start a pool for the crew', async () => {
    const db = world()
    expect(await readRoster(db.client, { crewId: 'office', starterId: 'dave', tier: 'max', now: NOW })).toMatchObject({ spots: null, memberCap: null })
    expect(await readRoster(db.client, { crewId: 'office', starterId: 'stranger', tier: 'free', now: NOW })).toBeNull()
  })
})

describe('a pool’s crew line — a count for members, names for the admin', () => {
  function poolWorld() {
    return fakeDb(
      {
        pools: [{ pool_id: 'cl', crew_id: 'five' }, { pool_id: 'plain', crew_id: null }],
        crews: [{ crew_id: 'five', name: 'Friday Five' }],
        pool_members: [
          { pool_id: 'cl', user_id: 'me', role: 'admin', member_id: 'm1' },
          { pool_id: 'cl', user_id: 'sam', role: 'player', member_id: 'm2' },
          { pool_id: 'plain', user_id: 'me', role: 'player', member_id: 'm3' },
        ],
        crew_seats: [
          { pool_id: 'cl', user_id: 'tom', resolved_at: null, resolution: null },
          { pool_id: 'cl', user_id: 'ella', resolved_at: null, resolution: null },
        ],
        users: [
          { user_id: 'tom', username: 'tom', full_name: 'Tom', avatar_url: null },
          { user_id: 'ella', username: 'ella', full_name: 'Ella', avatar_url: null },
        ],
      },
      { pool_first_lock_at: '2026-10-05T18:00:00Z' },
    )
  }
  it('the admin sees who is still pending', async () => {
    const v = await readPoolCrew(poolWorld().client, 'cl', 'me', NOW)
    expect(v).toMatchObject({ crew: { crewId: 'five', name: 'Friday Five' }, inPool: 2, saved: 2 })
    expect(v!.pending!.map((p) => p.userId).sort()).toEqual(['ella', 'tom'])
  })
  it('a member sees only the count — the names never leave the server', async () => {
    const v = await readPoolCrew(poolWorld().client, 'cl', 'sam', NOW)
    expect(v).toMatchObject({ saved: 2, pending: null })
  })
  it('after the first lock no spot is saved any more', async () => {
    const v = await readPoolCrew(poolWorld().client, 'cl', 'me', Date.parse('2026-10-06T00:00:00Z'))
    expect(v).toMatchObject({ saved: 0, pending: [] })
  })
  it('not a crew pool → no crew; not a member → nothing at all', async () => {
    expect(await readPoolCrew(poolWorld().client, 'plain', 'me', NOW)).toMatchObject({ crew: null })
    expect(await readPoolCrew(poolWorld().client, 'cl', 'stranger', NOW)).toBeNull()
  })
})
