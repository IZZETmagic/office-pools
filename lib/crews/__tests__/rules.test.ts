// The Crews rules (lib/crews/rules.ts), one decision at a time. Each describe names the decision it
// pins, so a failure here reads as "this rule changed", not just "a function changed".

import { describe, it, expect } from 'vitest'
import {
  allTimeTable,
  buildRoster,
  canManage,
  canRejoin,
  canRemove,
  canSetCoCaptain,
  cleanCrewName,
  inviteBlock,
  inviteRateLimit,
  joinOutcome,
  offersCrewSave,
  parseInviteTarget,
  rosterReasons,
  seatSelectionError,
  seatState,
  spotsForCap,
  successionAfter,
  type CrewMember,
} from '../rules'

const NOW = Date.parse('2026-10-02T12:00:00Z')

const m = (user_id: string, role: CrewMember['role'], joined_at: string, left?: 'left' | 'removed'): CrewMember => ({
  user_id,
  role,
  joined_at,
  left_at: left ? '2026-09-01T00:00:00Z' : null,
  left_reason: left ?? null,
})

describe('crew names', () => {
  it('trims and collapses whitespace', () => {
    expect(cleanCrewName('  Friday   Five-a-side ')).toBe('Friday Five-a-side')
  })
  it('refuses empty, blank, too long, or not a string', () => {
    expect(cleanCrewName('')).toBeNull()
    expect(cleanCrewName('    ')).toBeNull()
    expect(cleanCrewName('x'.repeat(61))).toBeNull()
    expect(cleanCrewName(42)).toBeNull()
    expect(cleanCrewName('x'.repeat(60))).toHaveLength(60)
  })
})

describe('captain and co-captain manage people; only the captain names the co-captain', () => {
  const cap = m('cap', 'captain', '2026-06-01')
  const co = m('co', 'co_captain', '2026-06-01')
  const mem = m('mem', 'member', '2026-06-01')
  const gone = m('gone', 'captain', '2026-06-01', 'left')

  it('canManage', () => {
    expect(canManage(cap)).toBe(true)
    expect(canManage(co)).toBe(true)
    expect(canManage(mem)).toBe(false)
    expect(canManage(gone)).toBe(false)
    expect(canManage(null)).toBe(false)
  })
  it('canSetCoCaptain', () => {
    expect(canSetCoCaptain(cap)).toBe(true)
    expect(canSetCoCaptain(co)).toBe(false)
  })
  it('canRemove: managers remove members; only the captain removes the co-captain; nobody removes the captain or themselves', () => {
    expect(canRemove(cap, mem)).toBe(true)
    expect(canRemove(co, mem)).toBe(true)
    expect(canRemove(cap, co)).toBe(true)
    expect(canRemove(co, cap)).toBe(false)
    expect(canRemove(cap, cap)).toBe(false)
    expect(canRemove(mem, co)).toBe(false)
    expect(canRemove(cap, m('x', 'member', '2026-06-01', 'removed'))).toBe(false)
  })
})

describe('exits stick', () => {
  it('a join adds a newcomer, leaves an active member alone, and never re-adds a leaver or the removed', () => {
    expect(joinOutcome(null)).toBe('add')
    expect(joinOutcome({ left_at: null })).toBe('already')
    expect(joinOutcome({ left_at: '2026-09-01' })).toBe('excluded')
  })
  it('only someone who left on their own may rejoin themselves', () => {
    expect(canRejoin({ left_at: '2026-09-01', left_reason: 'left' })).toBe(true)
    expect(canRejoin({ left_at: '2026-09-01', left_reason: 'removed' })).toBe(false)
    expect(canRejoin({ left_at: null, left_reason: null })).toBe(false)
    expect(canRejoin(null)).toBe(false)
  })
})

describe('succession: co-captain, else the longest-standing member; the last one out closes the crew', () => {
  it('a member leaving changes nothing', () => {
    const crew = [m('cap', 'captain', '2026-06-01'), m('a', 'member', '2026-06-02')]
    expect(successionAfter(crew, 'a')).toEqual({ kind: 'none' })
  })
  it('the captain leaving promotes the co-captain', () => {
    const crew = [m('cap', 'captain', '2026-06-01'), m('a', 'member', '2026-05-01'), m('co', 'co_captain', '2026-07-01')]
    expect(successionAfter(crew, 'cap')).toEqual({ kind: 'promote', userId: 'co', from: 'co_captain' })
  })
  it('with no co-captain, the earliest to join', () => {
    const crew = [m('cap', 'captain', '2026-06-01'), m('late', 'member', '2026-08-01'), m('early', 'member', '2026-06-05')]
    expect(successionAfter(crew, 'cap')).toEqual({ kind: 'promote', userId: 'early', from: 'longest_standing' })
  })
  it('a join-date tie goes to whoever played more crew pools, then a stable id order', () => {
    const crew = [m('cap', 'captain', '2026-06-01'), m('b', 'member', '2026-06-05'), m('a', 'member', '2026-06-05')]
    expect(successionAfter(crew, 'cap', new Map([['b', 3], ['a', 1]]))).toMatchObject({ userId: 'b' })
    expect(successionAfter(crew, 'cap')).toMatchObject({ userId: 'a' })
  })
  it('ignores people who already left', () => {
    const crew = [m('cap', 'captain', '2026-06-01'), m('gone', 'member', '2026-05-01', 'left'), m('a', 'member', '2026-07-01')]
    expect(successionAfter(crew, 'cap')).toMatchObject({ userId: 'a' })
  })
  it('the last member leaving closes the crew', () => {
    expect(successionAfter([m('cap', 'captain', '2026-06-01')], 'cap')).toEqual({ kind: 'close' })
  })
})

describe('adding people is a lookup by exact username or email', () => {
  it('reads emails, lowercased', () => {
    expect(parseInviteTarget('  Mia@Example.com ')).toEqual({ kind: 'email', email: 'mia@example.com' })
  })
  it('reads usernames, with or without a leading @', () => {
    expect(parseInviteTarget('dave')).toEqual({ kind: 'username', username: 'dave' })
    expect(parseInviteTarget('@Dave')).toEqual({ kind: 'username', username: 'Dave' })
  })
  it('refuses junk', () => {
    for (const raw of ['', '  ', 'two words', 'mia@', 'mia@example', '@', 7, null]) {
      expect(parseInviteTarget(raw)).toBeNull()
    }
  })
})

describe('who can be invited — only a "No thanks" closes the door', () => {
  it('blocks an active member and an open invite', () => {
    expect(inviteBlock({ member: { left_at: null }, hasOpenInvite: false, declinedBefore: false })).toBe('already_member')
    expect(inviteBlock({ member: null, hasOpenInvite: true, declinedBefore: false })).toBe('already_invited')
  })
  it('a "No thanks" sticks', () => {
    expect(inviteBlock({ member: null, hasOpenInvite: false, declinedBefore: true })).toBe('declined_before')
  })
  it('the removed and leavers CAN be invited back', () => {
    expect(inviteBlock({ member: { left_at: '2026-09-01' }, hasOpenInvite: false, declinedBefore: false })).toBeNull()
  })
  it('rate limits: 20 open per crew, 50 per person per day', () => {
    expect(inviteRateLimit({ openForCrew: 19, sentByActorToday: 49 })).toBeNull()
    expect(inviteRateLimit({ openForCrew: 20, sentByActorToday: 0 })).toMatch(/20 invites waiting/)
    expect(inviteRateLimit({ openForCrew: 0, sentByActorToday: 50 })).toMatch(/50 invites today/)
  })
})

describe('a held seat is open until it is answered or the pool first locks', () => {
  const lock = '2026-10-05T18:00:00Z'
  it('open before the lock, expired after — derived, never stored', () => {
    expect(seatState({ resolution: null }, lock, NOW)).toBe('open')
    expect(seatState({ resolution: null }, lock, Date.parse(lock))).toBe('expired')
  })
  it('an answer wins over the clock', () => {
    expect(seatState({ resolution: 'taken' }, lock, NOW)).toBe('taken')
    expect(seatState({ resolution: 'declined' }, lock, NOW)).toBe('declined')
    expect(seatState({ resolution: 'released' }, lock, NOW)).toBe('released')
  })
  it('no first lock is never "open forever"', () => {
    expect(seatState({ resolution: null }, null, NOW)).toBe('expired')
  })
})

describe('roster review — reasons, defaults, and the tier cap', () => {
  it('gives a reason only with evidence', () => {
    expect(rosterReasons({ user_id: 'a', playedLastSeason: false, lastLogin: '2026-09-30T00:00:00Z' }, NOW)).toEqual(['Didn’t play last season'])
    expect(rosterReasons({ user_id: 'a', playedLastSeason: true, lastLogin: '2026-01-01T00:00:00Z' }, NOW)).toEqual(['Hasn’t opened SportPool in 6 months'])
    expect(rosterReasons({ user_id: 'a', playedLastSeason: null, lastLogin: null }, NOW)).toEqual([])
  })
  it('a Free pool (10) saves 9 spots; Plus (30) saves 29; uncapped saves everyone', () => {
    expect(spotsForCap(10)).toBe(9)
    expect(spotsForCap(30)).toBe(29)
    expect(spotsForCap(null)).toBeNull()
  })
  it('ticks everyone without a reason, and reports — never resolves — an overflow', () => {
    const others = Array.from({ length: 13 }, (_, i) => ({
      user_id: `u${i}`,
      playedLastSeason: i < 2 ? false : true,
      lastLogin: '2026-09-30T00:00:00Z',
    }))
    const r = buildRoster(others, 9, NOW)
    expect(r.rows.filter((x) => x.ticked)).toHaveLength(11)
    expect(r.rows.filter((x) => !x.ticked).map((x) => x.user_id)).toEqual(['u0', 'u1'])
    expect(r.over).toBe(2)
    expect(buildRoster(others, null, NOW).over).toBe(0)
  })
  it('the server refuses more spots than the pool holds, strangers, the starter, and duplicates', () => {
    const active = new Set(['a', 'b', 'c', 'me'])
    expect(seatSelectionError({ chosen: ['a', 'b'], activeMemberIds: active, starterId: 'me', spots: 2 })).toBeNull()
    expect(seatSelectionError({ chosen: ['a', 'b', 'c'], activeMemberIds: active, starterId: 'me', spots: 2 })).toMatch(/holds 3.*untick 1/)
    expect(seatSelectionError({ chosen: ['a', 'zz'], activeMemberIds: active, starterId: 'me', spots: null })).toMatch(/in the crew/)
    expect(seatSelectionError({ chosen: ['me'], activeMemberIds: active, starterId: 'me', spots: null })).toMatch(/creating the pool/)
    expect(seatSelectionError({ chosen: ['a', 'a'], activeMemberIds: active, starterId: 'me', spots: null })).toMatch(/twice/)
  })
})

describe('all-time: seasons · titles · best — never summed points', () => {
  it('counts each season once per person, using their best entry', () => {
    const t = allTimeTable([
      { pool_id: 'wc', user_id: 'dave', rank: 1 },
      { pool_id: 'wc', user_id: 'dave', rank: 4 },
      { pool_id: 'pl', user_id: 'dave', rank: 3 },
      { pool_id: 'wc', user_id: 'priya', rank: 2 },
      { pool_id: 'pl', user_id: 'priya', rank: 1 },
      { pool_id: 'pl', user_id: 'tom', rank: 2 },
    ])
    expect(t).toEqual([
      { user_id: 'dave', seasons: 2, titles: 1, best: 1 },
      { user_id: 'priya', seasons: 2, titles: 1, best: 1 },
      { user_id: 'tom', seasons: 1, titles: 0, best: 2 },
    ])
  })
  it('a Last Man Standing season counts as played, with no finish and no title', () => {
    expect(allTimeTable([{ pool_id: 'lms', user_id: 'sam', rank: null }])).toEqual([
      { user_id: 'sam', seasons: 1, titles: 0, best: null },
    ])
  })
})

describe('"Keep this group together?" is offered only when it makes sense', () => {
  const base = { finishedAt: '2026-07-19', crewId: null, archivedAt: null, brandSlug: null, dismissedAt: null, players: 12 }
  it('a finished, crewless, unbranded, undismissed pool of 2+', () => {
    expect(offersCrewSave(base)).toBe(true)
  })
  it('not while running, already a crew, archived, branded, dismissed, or a pool of one', () => {
    expect(offersCrewSave({ ...base, finishedAt: null })).toBe(false)
    expect(offersCrewSave({ ...base, crewId: 'c' })).toBe(false)
    expect(offersCrewSave({ ...base, archivedAt: '2026-08-01' })).toBe(false)
    expect(offersCrewSave({ ...base, brandSlug: 'acme' })).toBe(false)
    expect(offersCrewSave({ ...base, dismissedAt: '2026-08-01' })).toBe(false)
    expect(offersCrewSave({ ...base, players: 1 })).toBe(false)
  })
})
