// lib/crews/store.ts against an in-memory database (./fakeDb). Each test is one of the decisions of
// 2026-10-02 carried all the way to the rows it writes.

import { describe, it, expect, vi } from 'vitest'

const joinPool = vi.fn()
vi.mock('@/lib/pools/join', () => ({ joinPool: (...a: unknown[]) => joinPool(...a) }))

import { fakeDb } from './fakeDb'
import {
  answerInvite,
  answerSeat,
  claimEmailInvites,
  createCrew,
  inviteToCrew,
  leaveCrew,
  lookupUsername,
  onCrewPoolJoined,
  rejoinCrew,
  removeMember,
  saveCrewFromPool,
  setCoCaptain,
} from '../store'

const crew = (extra: Record<string, unknown> = {}) => ({ crew_id: 'c1', name: 'Bermuda Office', closed_at: null, created_by: 'cap', created_at: '2026-06-01', ...extra })
const member = (user_id: string, role: string, joined_at = '2026-06-01', left?: 'left' | 'removed') => ({
  crew_id: 'c1',
  user_id,
  role,
  joined_at,
  joined_via: 'played',
  left_at: left ? '2026-09-01' : null,
  left_reason: left ?? null,
})
const active = (db: ReturnType<typeof fakeDb>) => db.tables.crew_members.filter((m) => m.left_at === null)

describe('creating a crew directly', () => {
  it('makes a crew of one with the creator as captain', async () => {
    const db = fakeDb({ crews: [], crew_members: [] })
    const r = await createCrew(db.client, { userId: 'me', name: '  Sunday   League ' })
    expect(r).toMatchObject({ ok: true })
    expect(db.tables.crews[0]).toMatchObject({ name: 'Sunday League', created_by: 'me' })
    expect(db.tables.crew_members).toEqual([expect.objectContaining({ user_id: 'me', role: 'captain', joined_via: 'created' })])
  })
  it('refuses a blank name', async () => {
    const db = fakeDb({ crews: [], crew_members: [] })
    expect(await createCrew(db.client, { userId: 'me', name: '  ' })).toMatchObject({ ok: false, status: 400 })
    expect(db.tables.crews).toEqual([])
  })
})

describe('saving a finished pool as a crew', () => {
  const seed = () => ({
    pools: [{ pool_id: 'wc', crew_id: null, archived_at: null, brand_slug: null, crew_prompt_dismissed_at: null, is_private: false }],
    pool_members: [
      { pool_id: 'wc', user_id: 'dave', role: 'admin' },
      { pool_id: 'wc', user_id: 'priya', role: 'player' },
      { pool_id: 'wc', user_id: 'tom', role: 'player' },
      { pool_id: 'wc', user_id: 'spec', role: 'spectator' },
    ],
    crews: [],
    crew_members: [],
  })

  it('saves the players (not spectators); the saver is captain; the pool becomes the crew’s, and private', async () => {
    const db = fakeDb(seed(), { pool_finished_at: '2026-07-19T20:00:00Z' })
    const r = await saveCrewFromPool(db.client, { userId: 'dave', poolId: 'wc', name: 'Football Daddies', coCaptainUserId: 'priya' })
    expect(r).toMatchObject({ ok: true, members: 3 })
    const roles = Object.fromEntries(db.tables.crew_members.map((m) => [m.user_id, m.role]))
    expect(roles).toEqual({ dave: 'captain', priya: 'co_captain', tom: 'member' })
    expect(db.tables.pools[0]).toMatchObject({ crew_id: db.tables.crews[0].crew_id, is_private: true })
  })
  it('only the pool’s admin', async () => {
    const db = fakeDb(seed(), { pool_finished_at: '2026-07-19T20:00:00Z' })
    expect(await saveCrewFromPool(db.client, { userId: 'tom', poolId: 'wc', name: 'X' })).toMatchObject({ ok: false, status: 403 })
  })
  it('only once the competition is over', async () => {
    const db = fakeDb(seed(), { pool_finished_at: null })
    expect(await saveCrewFromPool(db.client, { userId: 'dave', poolId: 'wc', name: 'X' })).toMatchObject({ ok: false, status: 409 })
    expect(db.tables.crews).toEqual([])
  })
  it('the co-captain must be someone else who played', async () => {
    const db = fakeDb(seed(), { pool_finished_at: '2026-07-19T20:00:00Z' })
    expect(await saveCrewFromPool(db.client, { userId: 'dave', poolId: 'wc', name: 'X', coCaptainUserId: 'spec' })).toMatchObject({ status: 400 })
  })
})

describe('leaving — one tap, history stays, the captaincy passes on', () => {
  it('a captain leaving hands over to the co-captain, and releases their open seats', async () => {
    const db = fakeDb({
      crews: [crew()],
      crew_members: [member('cap', 'captain'), member('co', 'co_captain', '2026-07-01'), member('early', 'member', '2026-05-01')],
      crew_seats: [{ pool_id: 'p', user_id: 'cap', crew_id: 'c1', resolved_at: null, resolution: null }],
      pools: [],
    })
    const r = await leaveCrew(db.client, { crewId: 'c1', userId: 'cap' })
    expect(r).toEqual({ ok: true, closed: false, newCaptainId: 'co' })
    expect(active(db).find((m) => m.role === 'captain')?.user_id).toBe('co')
    expect(db.tables.crew_members.find((m) => m.user_id === 'cap')).toMatchObject({ left_reason: 'left' })
    expect(db.tables.crew_seats[0]).toMatchObject({ resolution: 'released' })
  })
  it('with no co-captain, the longest-standing member', async () => {
    const db = fakeDb({ crews: [crew()], crew_members: [member('cap', 'captain'), member('late', 'member', '2026-08-01'), member('early', 'member', '2026-06-02')], pools: [] })
    expect(await leaveCrew(db.client, { crewId: 'c1', userId: 'cap' })).toMatchObject({ newCaptainId: 'early' })
  })
  it('the last one out closes the crew and withdraws its open invites', async () => {
    const db = fakeDb({
      crews: [crew()],
      crew_members: [member('cap', 'captain')],
      crew_invites: [{ invite_id: 'i1', crew_id: 'c1', invitee_email: 'a@b.co', resolved_at: null, resolution: null }],
      pools: [],
    })
    expect(await leaveCrew(db.client, { crewId: 'c1', userId: 'cap' })).toMatchObject({ ok: true, closed: true })
    expect(db.tables.crews[0].closed_at).not.toBeNull()
    expect(db.tables.crew_invites[0]).toMatchObject({ resolution: 'revoked' })
  })
  it('someone who left can rejoin themselves; the removed cannot', async () => {
    const db = fakeDb({ crews: [crew()], crew_members: [member('cap', 'captain'), member('gone', 'member', '2026-06-01', 'left'), member('out', 'member', '2026-06-01', 'removed')] })
    expect(await rejoinCrew(db.client, { crewId: 'c1', userId: 'gone' })).toEqual({ ok: true })
    expect(db.tables.crew_members.find((m) => m.user_id === 'gone')).toMatchObject({ left_at: null, role: 'member' })
    expect(await rejoinCrew(db.client, { crewId: 'c1', userId: 'out' })).toMatchObject({ ok: false, status: 403 })
  })
})

describe('removing and naming', () => {
  const seed = () => ({
    crews: [crew()],
    crew_members: [member('cap', 'captain'), member('co', 'co_captain'), member('m1', 'member'), member('m2', 'member')],
    crew_seats: [{ pool_id: 'p', user_id: 'm1', crew_id: 'c1', resolved_at: null, resolution: null }],
  })
  it('a manager removes a member: no more seats, history untouched', async () => {
    const db = fakeDb(seed())
    expect(await removeMember(db.client, { actorId: 'co', crewId: 'c1', targetId: 'm1' })).toEqual({ ok: true })
    expect(db.tables.crew_members.find((m) => m.user_id === 'm1')).toMatchObject({ left_reason: 'removed' })
    expect(db.tables.crew_seats[0]).toMatchObject({ resolution: 'released' })
  })
  it('the co-captain cannot remove the captain', async () => {
    const db = fakeDb(seed())
    expect(await removeMember(db.client, { actorId: 'co', crewId: 'c1', targetId: 'cap' })).toMatchObject({ status: 403 })
  })
  it('the captain names a new co-captain; the old one becomes a member', async () => {
    const db = fakeDb(seed())
    expect(await setCoCaptain(db.client, { actorId: 'cap', crewId: 'c1', targetId: 'm2' })).toEqual({ ok: true })
    const roles = Object.fromEntries(active(db).map((m) => [m.user_id, m.role]))
    expect(roles).toMatchObject({ co: 'member', m2: 'co_captain', cap: 'captain' })
  })
  it('only the captain names the co-captain', async () => {
    const db = fakeDb(seed())
    expect(await setCoCaptain(db.client, { actorId: 'co', crewId: 'c1', targetId: 'm2' })).toMatchObject({ status: 403 })
  })
})

describe('adding people — a lookup, and an email never reveals an account', () => {
  const seed = () => ({
    crews: [crew()],
    crew_members: [member('cap', 'captain'), member('m1', 'member'), member('out', 'member', '2026-06-01', 'removed')],
    crew_invites: [] as Record<string, unknown>[],
    users: [
      { user_id: 'dave1', username: 'Dave', email: 'dave@one.com', full_name: 'Dave Okafor', avatar_url: null },
      { user_id: 'dave2', username: 'dave', email: 'dave@two.com', full_name: 'Dave Lin', avatar_url: null },
      { user_id: 'mia', username: 'mia', email: 'mia@example.com', full_name: 'Mia', avatar_url: null },
      { user_id: 'pct', username: 'a%b', email: null, full_name: null, avatar_url: null },
    ],
  })

  it('a username lookup is exact and case-insensitive — both Daves, never a prefix match', async () => {
    const db = fakeDb(seed())
    expect((await lookupUsername(db.client, 'DAVE')).map((u) => u.userId).sort()).toEqual(['dave1', 'dave2'])
    expect(await lookupUsername(db.client, 'dav')).toEqual([])
    expect((await lookupUsername(db.client, 'a%b')).map((u) => u.userId)).toEqual(['pct'])
    expect(await lookupUsername(db.client, 'a_b')).toEqual([])
  })

  it('an email that belongs to an account becomes an invite to that account', async () => {
    const db = fakeDb(seed())
    expect(await inviteToCrew(db.client, { actorId: 'cap', crewId: 'c1', email: 'MIA@example.com' })).toMatchObject({ ok: true, sent: true })
    expect(db.tables.crew_invites[0]).toMatchObject({ invitee_user_id: 'mia', invitee_email: null })
  })
  it('an unknown email is kept lowercase for when they sign up', async () => {
    const db = fakeDb(seed())
    await inviteToCrew(db.client, { actorId: 'cap', crewId: 'c1', email: 'New@Person.org' })
    expect(db.tables.crew_invites[0]).toMatchObject({ invitee_user_id: null, invitee_email: 'new@person.org' })
  })
  it('an email to an existing member answers "sent" and writes nothing', async () => {
    const db = fakeDb(seed())
    db.tables.users.push({ user_id: 'm1', username: 'm1', email: 'm1@x.com' })
    expect(await inviteToCrew(db.client, { actorId: 'cap', crewId: 'c1', email: 'm1@x.com' })).toEqual({ ok: true, sent: true, inviteId: null })
    expect(db.tables.crew_invites).toEqual([])
  })
  it('by user_id the captain is told why, because they already saw the face', async () => {
    const db = fakeDb(seed())
    expect(await inviteToCrew(db.client, { actorId: 'cap', crewId: 'c1', userId: 'm1' })).toMatchObject({ status: 409, reason: 'already_member' })
  })
  it('the removed can be added back', async () => {
    const db = fakeDb(seed())
    expect(await inviteToCrew(db.client, { actorId: 'cap', crewId: 'c1', userId: 'out' })).toMatchObject({ ok: true })
  })
  it('only the captain or co-captain adds people', async () => {
    const db = fakeDb(seed())
    expect(await inviteToCrew(db.client, { actorId: 'm1', crewId: 'c1', userId: 'mia' })).toMatchObject({ status: 403 })
  })
  it('rate-limited at 20 open invites per crew', async () => {
    const db = fakeDb(seed())
    for (let i = 0; i < 20; i++) db.tables.crew_invites.push({ crew_id: 'c1', invitee_email: `x${i}@y.z`, resolved_at: null, invited_by: 'someone-else', created_at: '2026-01-01' })
    expect(await inviteToCrew(db.client, { actorId: 'cap', crewId: 'c1', userId: 'mia' })).toMatchObject({ status: 429 })
  })

  it('Join brings them in (re-activating a removed row); No thanks sticks', async () => {
    const db = fakeDb(seed())
    const sent = await inviteToCrew(db.client, { actorId: 'cap', crewId: 'c1', userId: 'out' })
    const inviteId = (sent as { inviteId: string }).inviteId
    expect(await answerInvite(db.client, { userId: 'out', inviteId, answer: 'join' })).toMatchObject({ ok: true })
    expect(db.tables.crew_members.find((m) => m.user_id === 'out')).toMatchObject({ left_at: null, joined_via: 'invite', role: 'member' })

    const toMia = await inviteToCrew(db.client, { actorId: 'cap', crewId: 'c1', userId: 'mia' })
    await answerInvite(db.client, { userId: 'mia', inviteId: (toMia as { inviteId: string }).inviteId, answer: 'decline' })
    expect(await inviteToCrew(db.client, { actorId: 'cap', crewId: 'c1', userId: 'mia' })).toMatchObject({ status: 409, reason: 'declined_before' })
  })
  it('only the invitee can answer', async () => {
    const db = fakeDb(seed())
    const sent = await inviteToCrew(db.client, { actorId: 'cap', crewId: 'c1', userId: 'mia' })
    expect(await answerInvite(db.client, { userId: 'm1', inviteId: (sent as { inviteId: string }).inviteId, answer: 'join' })).toMatchObject({ status: 404 })
  })

  it('an email invite is claimed only against a verified address', async () => {
    const db = fakeDb({ crew_invites: [{ invite_id: 'i1', crew_id: 'c1', invitee_user_id: null, invitee_email: 'new@person.org', resolved_at: null, resolution: null }] })
    expect(await claimEmailInvites(db.client, { userId: 'newbie', email: 'New@Person.org', emailVerified: false })).toBe(0)
    expect(db.tables.crew_invites[0].invitee_user_id).toBeNull()
    expect(await claimEmailInvites(db.client, { userId: 'newbie', email: 'New@Person.org', emailVerified: true })).toBe(1)
    expect(db.tables.crew_invites[0]).toMatchObject({ invitee_user_id: 'newbie', invitee_email: null })
  })
})

describe('playing in a crew pool is how you join the crew — unless you left or were removed', () => {
  const seed = () => ({
    crew_members: [member('cap', 'captain'), member('gone', 'member', '2026-06-01', 'left'), member('out', 'member', '2026-06-01', 'removed')],
    crew_seats: [{ pool_id: 'pl', user_id: 'new', crew_id: 'c1', resolved_at: null, resolution: null }],
  })
  it('a newcomer is added, by having played, and their seat is taken', async () => {
    const db = fakeDb(seed())
    await onCrewPoolJoined(db.client, { crewId: 'c1', poolId: 'pl', userId: 'new' })
    expect(db.tables.crew_members.find((m) => m.user_id === 'new')).toMatchObject({ role: 'member', joined_via: 'played', joined_via_pool_id: 'pl' })
    expect(db.tables.crew_seats[0]).toMatchObject({ resolution: 'taken' })
  })
  it('exits stick: a leaver or the removed is not re-added by joining', async () => {
    const db = fakeDb(seed())
    await onCrewPoolJoined(db.client, { crewId: 'c1', poolId: 'pl', userId: 'gone' })
    await onCrewPoolJoined(db.client, { crewId: 'c1', poolId: 'pl', userId: 'out' })
    expect(active(db).map((m) => m.user_id)).toEqual(['cap'])
  })
})

describe('held seats — I’m in / Not this one', () => {
  const seed = () => ({ crew_seats: [{ pool_id: 'pl', user_id: 'me', crew_id: 'c1', resolved_at: null, resolution: null }] })
  it('I’m in is the ordinary join', async () => {
    joinPool.mockResolvedValueOnce({ ok: true, memberId: 'm', poolId: 'pl', poolName: 'P', restoredEntries: 0 })
    const db = fakeDb(seed())
    expect(await answerSeat(db.client, { userId: 'me', poolId: 'pl', answer: 'take' })).toEqual({ ok: true, poolId: 'pl' })
    expect(joinPool).toHaveBeenCalledWith(db.client, { poolId: 'pl' }, 'me')
  })
  it('a full pool comes back as pool_full', async () => {
    joinPool.mockResolvedValueOnce({ ok: false, status: 409, error: 'This pool is full.', reason: 'pool_full' })
    const db = fakeDb(seed())
    expect(await answerSeat(db.client, { userId: 'me', poolId: 'pl', answer: 'take' })).toMatchObject({ ok: false, status: 409, reason: 'pool_full' })
  })
  it('Not this one, while the seat is open', async () => {
    const db = fakeDb(seed(), { pool_first_lock_at: new Date(Date.now() + 86_400_000).toISOString() })
    await answerSeat(db.client, { userId: 'me', poolId: 'pl', answer: 'decline' })
    expect(db.tables.crew_seats[0]).toMatchObject({ resolution: 'declined' })
  })
  it('after the first lock there is nothing to decline', async () => {
    const db = fakeDb(seed(), { pool_first_lock_at: new Date(Date.now() - 1000).toISOString() })
    await answerSeat(db.client, { userId: 'me', poolId: 'pl', answer: 'decline' })
    expect(db.tables.crew_seats[0]).toMatchObject({ resolution: null })
  })
})

describe('the fake enforces what the store’s write order depends on', () => {
  it('a second active captain is refused, as 154’s partial unique index would', async () => {
    const db = fakeDb({ crew_members: [member('cap', 'captain'), member('co', 'co_captain')] })
    const r = (await (db.client as unknown as { from: (t: string) => { update: (p: object) => { eq: (c: string, v: string) => Promise<{ error: unknown }> } } })
      .from('crew_members').update({ role: 'captain' }).eq('user_id', 'co')) as { error: unknown }
    expect(r.error).toBeTruthy()
    expect(db.tables.crew_members.find((m) => m.user_id === 'co')?.role).toBe('co_captain')
  })
})
