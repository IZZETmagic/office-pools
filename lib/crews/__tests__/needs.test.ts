// The three crew cards in Activity → Needs you (lib/crews/needs.ts → buildCrewNeeds).

import { describe, it, expect } from 'vitest'
import { buildCrewNeeds, modeLabel, type InviteFact, type SaveFact, type SeatFact } from '../needs'
import { sortNeeds } from '@/lib/activity/needsYou'

const NOW = Date.parse('2026-10-02T12:00:00Z')

const seat = (o: Partial<SeatFact> = {}): SeatFact => ({
  poolId: 'cl',
  poolName: 'Five-a-side CL',
  crewId: 'five',
  crewName: 'Friday Five-a-side',
  competition: 'Champions League 2026/27',
  mode: "Pick'em",
  firstLockAt: '2026-10-05T18:00:00Z',
  resolution: null,
  inPool: 6,
  saved: 3,
  ...o,
})
const invite = (o: Partial<InviteFact> = {}): InviteFact => ({
  inviteId: 'i1',
  crewId: 'office',
  crewName: 'Bermuda Office',
  crewClosed: false,
  inviter: 'Dave',
  people: 14,
  ...o,
})
const save = (o: Partial<SaveFact> = {}): SaveFact => ({
  poolId: 'wc',
  poolName: 'Football Daddies',
  finishedAt: '2026-07-19T20:00:00Z',
  crewId: null,
  archivedAt: null,
  brandSlug: null,
  dismissedAt: null,
  players: 12,
  ...o,
})

describe('the three crew cards', () => {
  it('a saved spot: deadline = first lock, "6 of 9 in", two buttons, opens the pool preview', () => {
    const [card] = buildCrewNeeds({ seats: [seat()], invites: [], saves: [] }, NOW)
    expect(card).toMatchObject({
      kind: 'crew_seat',
      title: 'Your spot’s saved',
      subtitle: 'Champions League 2026/27 · Pick\'em',
      deadline_at: '2026-10-05T18:00:00Z',
      made: 6,
      total: 9,
      link: { pathname: '/pool-preview/[id]', params: { id: 'cl' } },
      crew: { crew_id: 'five', name: 'Friday Five-a-side' },
    })
    expect(card.actions?.map((a) => a.id)).toEqual(['decline', 'take'])
  })
  it('a seat disappears once answered or once the pool locks', () => {
    expect(buildCrewNeeds({ seats: [seat({ resolution: 'taken' })], invites: [], saves: [] }, NOW)).toEqual([])
    expect(buildCrewNeeds({ seats: [seat({ firstLockAt: '2026-10-01T00:00:00Z' })], invites: [], saves: [] }, NOW)).toEqual([])
  })
  it('an invite names who added you, has no deadline, and carries the invite id for the answer', () => {
    const [card] = buildCrewNeeds({ seats: [], invites: [invite()], saves: [] }, NOW)
    expect(card).toMatchObject({
      kind: 'crew_invite',
      title: 'Dave added you to Bermuda Office',
      deadline_at: null,
      link: null,
      crew: { crew_id: 'office', invite_id: 'i1', people: 14 },
    })
    expect(card.actions?.map((a) => [a.id, a.label])).toEqual([['decline', 'No thanks'], ['join', 'Join']])
  })
  it('an invite with no known inviter still reads, and a closed crew’s invite is not shown', () => {
    expect(buildCrewNeeds({ seats: [], invites: [invite({ inviter: null })], saves: [] }, NOW)[0].title).toBe('You’ve been added to Bermuda Office')
    expect(buildCrewNeeds({ seats: [], invites: [invite({ crewClosed: true })], saves: [] }, NOW)).toEqual([])
  })
  it('Keep this group together?: the pool’s name is the suggested crew name', () => {
    const [card] = buildCrewNeeds({ seats: [], invites: [], saves: [save()] }, NOW)
    expect(card).toMatchObject({
      kind: 'crew_save',
      subtitle: 'Save these 12 as a crew for next time',
      deadline_at: null,
      crew: { crew_id: null, name: 'Football Daddies', people: 12 },
    })
    expect(card.actions?.map((a) => [a.id, a.label])).toEqual([['dismiss', 'Not now'], ['save', 'Save as crew']])
  })
  it('Keep this group together? only when rules.offersCrewSave says so', () => {
    for (const o of [{ finishedAt: null }, { crewId: 'c' }, { dismissedAt: '2026-08-01' }, { players: 1 }, { brandSlug: 'acme' }]) {
      expect(buildCrewNeeds({ seats: [], invites: [], saves: [save(o)] }, NOW)).toEqual([])
    }
  })
  it('a seat (with a clock) comes before cards without one', () => {
    const cards = buildCrewNeeds({ seats: [seat()], invites: [invite()], saves: [save()] }, NOW)
    expect(cards[0].kind).toBe('crew_seat')
    expect(cards.slice(1).every((c) => c.deadline_at === null)).toBe(true)
  })
})

describe('sortNeeds — no-deadline cards after every card with one', () => {
  it('orders picks and crew cards together', () => {
    const mk = (id: string, deadline_at: string | null) =>
      ({ id, deadline_at }) as Parameters<typeof sortNeeds>[0][number]
    expect(sortNeeds([mk('none', null), mk('late', '2026-10-09'), mk('soon', '2026-10-03')]).map((x) => x.id)).toEqual([
      'soon',
      'late',
      'none',
    ])
  })
})

describe('mode labels', () => {
  it('league modes, World Cup modes, and a fallback', () => {
    expect(modeLabel('league_pickem', 'last_man_standing')).toBe('Last One Standing')
    expect(modeLabel('league_pickem', null)).toBe("Pick'em")
    expect(modeLabel('progressive', null)).toBe('Round by Round')
    expect(modeLabel('mystery', null)).toBe('Pool')
  })
})
