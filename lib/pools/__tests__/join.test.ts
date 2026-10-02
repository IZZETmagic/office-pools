// joinPool — the one path every join takes (lib/pools/join.ts).
//
// Lifted out of POST /api/pools/join so taking a crew's held seat can walk the same steps. These
// tests pin the behaviour the route had, branch by branch, so the two doors cannot drift: the
// refusals and their statuses, the tier cap's `pool_full`, a newcomer's first entry, and a
// returning member getting their history back instead of an empty duplicate.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const restore = vi.fn()
const rescore = vi.fn()
const regenerate = vi.fn()
const crewJoined = vi.fn()

vi.mock('@/lib/entries/retire', () => ({
  restoreEntriesForMember: (...a: unknown[]) => restore(...a),
  rescoreRestoredEntries: (...a: unknown[]) => rescore(...a),
}))
vi.mock('@/lib/league/duels', () => ({
  regenerateDuelSchedule: (...a: unknown[]) => regenerate(...a),
}))
vi.mock('@/lib/crews/store', () => ({
  onCrewPoolJoined: (...a: unknown[]) => crewJoined(...a),
}))

import { joinPool } from '../join'

type Pool = {
  pool_id: string
  pool_name: string
  pool_code: string
  status: string
  accepting_members: boolean | null
  league_season_id: string | null
  crew_id?: string | null
}

type Opts = {
  pool?: Pool | null
  existingMember?: boolean
  memberInsertError?: { code?: string; message: string } | null
  username?: string | null
}

/** A client that answers the handful of queries joinPool makes, and records every insert. */
function fakeClient(opts: Opts) {
  const inserts: Array<{ table: string; row: Record<string, unknown> }> = []
  const lookups: Array<{ table: string; col: string; val: unknown }> = []

  const client = {
    from(table: string) {
      const q: Record<string, unknown> = {}
      let insertRow: Record<string, unknown> | null = null
      q.select = () => q
      q.eq = (col: string, val: unknown) => {
        lookups.push({ table, col, val })
        return q
      }
      q.insert = (row: Record<string, unknown>) => {
        insertRow = row
        inserts.push({ table, row })
        // pool_entries' insert is awaited directly, not via .single()
        if (table === 'pool_entries') return Promise.resolve({ error: null })
        return q
      }
      q.single = () => {
        if (table === 'pools') return Promise.resolve({ data: opts.pool ?? null })
        if (table === 'pool_members' && !insertRow) {
          return Promise.resolve({ data: opts.existingMember ? { member_id: 'm-old' } : null })
        }
        if (table === 'pool_members' && insertRow) {
          return opts.memberInsertError
            ? Promise.resolve({ data: null, error: opts.memberInsertError })
            : Promise.resolve({ data: { member_id: 'm-new' }, error: null })
        }
        if (table === 'users') {
          return Promise.resolve({ data: opts.username === null ? null : { username: opts.username ?? 'dave' } })
        }
        return Promise.resolve({ data: null })
      }
      return q
    },
  }
  return { client: client as never, inserts, lookups }
}

const OPEN: Pool = {
  pool_id: 'p1',
  pool_name: 'Bermuda Office',
  pool_code: 'ABC123',
  status: 'open',
  accepting_members: true,
  league_season_id: 'season-1',
}

beforeEach(() => {
  restore.mockReset().mockResolvedValue({ restored: 0, error: null })
  rescore.mockReset().mockResolvedValue({ error: null })
  regenerate.mockReset().mockResolvedValue({ error: null })
  crewJoined.mockReset().mockResolvedValue(undefined)
})

describe('joinPool', () => {
  it('looks a pool up by code or by id', async () => {
    const byCode = fakeClient({ pool: OPEN })
    await joinPool(byCode.client, { poolCode: 'ABC123' }, 'u1')
    expect(byCode.lookups).toContainEqual({ table: 'pools', col: 'pool_code', val: 'ABC123' })

    const byId = fakeClient({ pool: OPEN })
    await joinPool(byId.client, { poolId: 'p1' }, 'u1')
    expect(byId.lookups).toContainEqual({ table: 'pools', col: 'pool_id', val: 'p1' })
  })

  it('404s an unknown pool', async () => {
    const { client } = fakeClient({ pool: null })
    expect(await joinPool(client, { poolCode: 'NOPE' }, 'u1')).toEqual({
      ok: false,
      status: 404,
      error: 'Pool not found. Check the code and try again.',
    })
  })

  it('refuses a finished pool and a closed one, with their own copy', async () => {
    const finished = fakeClient({ pool: { ...OPEN, status: 'completed' } })
    expect(await joinPool(finished.client, { poolId: 'p1' }, 'u1')).toEqual({
      ok: false,
      status: 400,
      error: 'This pool has finished.',
    })
    const closed = fakeClient({ pool: { ...OPEN, accepting_members: false } })
    expect(await joinPool(closed.client, { poolId: 'p1' }, 'u1')).toEqual({
      ok: false,
      status: 400,
      error: 'This pool is not accepting new members.',
    })
  })

  it('409s an existing member and inserts nothing', async () => {
    const { client, inserts } = fakeClient({ pool: OPEN, existingMember: true })
    expect(await joinPool(client, { poolId: 'p1' }, 'u1')).toMatchObject({ ok: false, status: 409 })
    expect(inserts).toEqual([])
  })

  it('turns the tier cap (SP010) into pool_full, not a server error', async () => {
    const { client } = fakeClient({
      pool: OPEN,
      memberInsertError: { code: 'SP010', message: 'This pool is full.' },
    })
    expect(await joinPool(client, { poolId: 'p1' }, 'u1')).toEqual({
      ok: false,
      status: 409,
      error: 'This pool is full.',
      reason: 'pool_full',
    })
  })

  it('500s any other insert failure', async () => {
    const { client } = fakeClient({ pool: OPEN, memberInsertError: { message: 'boom' } })
    expect(await joinPool(client, { poolId: 'p1' }, 'u1')).toEqual({ ok: false, status: 500, error: 'boom' })
  })

  it('a newcomer joins as a player and gets a first entry named after them', async () => {
    const { client, inserts } = fakeClient({ pool: OPEN, username: 'dave' })
    const r = await joinPool(client, { poolId: 'p1' }, 'u1')
    expect(r).toEqual({ ok: true, memberId: 'm-new', poolId: 'p1', poolName: 'Bermuda Office', restoredEntries: 0 })
    expect(inserts).toEqual([
      { table: 'pool_members', row: { pool_id: 'p1', user_id: 'u1', role: 'player' } },
      { table: 'pool_entries', row: { member_id: 'm-new', entry_name: 'dave', entry_number: 1 } },
    ])
    expect(rescore).not.toHaveBeenCalled()
    expect(regenerate).toHaveBeenCalledWith(client, 'p1')
  })

  it('falls back to "Entry 1" when there is no username', async () => {
    const { client, inserts } = fakeClient({ pool: OPEN, username: null })
    await joinPool(client, { poolId: 'p1' }, 'u1')
    expect(inserts[1]).toEqual({
      table: 'pool_entries',
      row: { member_id: 'm-new', entry_name: 'Entry 1', entry_number: 1 },
    })
  })

  it('a returning member gets their history back — no empty duplicate entry', async () => {
    restore.mockResolvedValue({ restored: 2, error: null })
    const { client, inserts } = fakeClient({ pool: OPEN })
    const r = await joinPool(client, { poolId: 'p1' }, 'u1')
    expect(r).toMatchObject({ ok: true, restoredEntries: 2 })
    expect(inserts.map((i) => i.table)).toEqual(['pool_members'])
    expect(rescore).toHaveBeenCalledWith(client, { poolId: 'p1', leagueSeasonId: 'season-1' })
    expect(regenerate).toHaveBeenCalledWith(client, 'p1')
  })

  it('a crew’s pool tells the crew who joined; any other pool does not', async () => {
    const crewPool = fakeClient({ pool: { ...OPEN, crew_id: 'crew-1' } })
    await joinPool(crewPool.client, { poolId: 'p1' }, 'u1')
    expect(crewJoined).toHaveBeenCalledWith(crewPool.client, { crewId: 'crew-1', poolId: 'p1', userId: 'u1' })

    crewJoined.mockClear()
    const plain = fakeClient({ pool: OPEN })
    await joinPool(plain.client, { poolId: 'p1' }, 'u1')
    expect(crewJoined).not.toHaveBeenCalled()
  })

  it('a refused join tells the crew nothing', async () => {
    const { client } = fakeClient({ pool: { ...OPEN, crew_id: 'crew-1' }, existingMember: true })
    await joinPool(client, { poolId: 'p1' }, 'u1')
    expect(crewJoined).not.toHaveBeenCalled()
  })

  it('does not fail the join when the best-effort steps fail', async () => {
    restore.mockResolvedValue({ restored: 1, error: 'restore hiccup' })
    rescore.mockResolvedValue({ error: 'rescore hiccup' })
    regenerate.mockResolvedValue({ error: 'schedule hiccup' })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeClient({ pool: OPEN })
    expect(await joinPool(client, { poolId: 'p1' }, 'u1')).toMatchObject({ ok: true })
    spy.mockRestore()
  })
})
