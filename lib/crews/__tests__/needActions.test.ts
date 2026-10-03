// What each crew card button calls on the web (lib/crews/needActions.ts) — built from the real cards
// (lib/crews/needs.buildCrewNeeds), so a renamed action or a moved id fails here, not in a browser.

import { describe, expect, it } from 'vitest'

import { buildCrewNeeds } from '../needs'
import { crewActionPlan } from '../needActions'

const NOW = Date.parse('2026-10-02T12:00:00Z')
const cards = buildCrewNeeds(
  {
    seats: [
      {
        poolId: 'pool-1',
        poolName: 'Office League',
        crewId: 'crew-1',
        crewName: 'Bermuda Office',
        competition: 'Premier League 2026/27',
        mode: "Pick'em",
        firstLockAt: new Date(NOW + 3 * 86_400_000).toISOString(),
        resolution: null,
        inPool: 4,
        saved: 6,
      },
    ],
    invites: [{ inviteId: 'inv-1', crewId: 'crew-2', crewName: 'Five-a-side', crewClosed: false, inviter: 'Dave', people: 7 }],
    saves: [
      {
        poolId: 'pool-wc',
        poolName: 'World Cup Sweep',
        finishedAt: '2026-07-16T22:00:00Z',
        crewId: null,
        archivedAt: null,
        brandSlug: null,
        dismissedAt: null,
        players: 14,
      },
    ],
  },
  NOW,
)
const seat = cards.find((c) => c.kind === 'crew_seat')!
const invite = cards.find((c) => c.kind === 'crew_invite')!
const save = cards.find((c) => c.kind === 'crew_save')!

describe('every button the server sends has somewhere to go', () => {
  it('no card offers an action the web cannot carry out', () => {
    for (const c of cards) for (const a of c.actions ?? []) expect(crewActionPlan(c, a.id).kind).not.toBe('none')
  })
})

describe('a saved spot', () => {
  it('I’m in takes the seat — the ordinary join — and goes to the pool', () => {
    expect(crewActionPlan(seat, 'take')).toEqual({
      kind: 'request',
      url: '/api/crews/seats/pool-1',
      body: { answer: 'take' },
      then: { goTo: '/pools/pool-1' },
    })
  })
  it('Not this one declines the seat and stays put', () => {
    expect(crewActionPlan(seat, 'decline')).toMatchObject({ url: '/api/crews/seats/pool-1', body: { answer: 'decline' }, then: 'refresh' })
  })
})

describe('an invite', () => {
  it('Join answers the invite and lands in the crew', () => {
    expect(crewActionPlan(invite, 'join')).toEqual({
      kind: 'request',
      url: '/api/crews/invites/inv-1/answer',
      body: { answer: 'join' },
      then: { goTo: '/crews/crew-2' },
    })
  })
  it('No thanks answers the INVITE — never the seat route', () => {
    expect(crewActionPlan(invite, 'decline')).toMatchObject({ url: '/api/crews/invites/inv-1/answer', body: { answer: 'decline' } })
  })
})

describe('Keep this group together?', () => {
  it('Save as crew writes nothing — it opens the dialog that says the pool becomes private', () => {
    expect(crewActionPlan(save, 'save')).toEqual({ kind: 'open-save' })
  })
  it('Not now is for good', () => {
    expect(crewActionPlan(save, 'dismiss')).toMatchObject({ url: '/api/pools/pool-wc/crew-prompt/dismiss', then: 'refresh' })
  })
})

it('ids are escaped into the path', () => {
  expect(crewActionPlan({ ...seat, pool_id: 'a/b' }, 'take')).toMatchObject({ url: '/api/crews/seats/a%2Fb' })
})
