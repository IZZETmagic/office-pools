// The web's crew words (lib/crews/words.ts) against the app's (mobile/lib/crews.ts).
//
// The two projects can't import each other, so each keeps its own copy. These are the tests that
// fail the day they drift — run on the same inputs, which include the cases each sentence has a
// rule about (Last Man Standing has no rank; the captaincy passes to the co-captain first).

import { describe, expect, it } from 'vitest'

import * as app from '../../../mobile/lib/crews'
import * as appCreate from '../../../mobile/lib/createPool'
import * as web from '../words'

const P = (o: Partial<{ userId: string; fullName: string | null; username: string | null; role: 'captain' | 'co_captain' | 'member'; joinedAt: string }>) => ({
  userId: 'u',
  username: 'dave',
  fullName: 'Dave Okafor',
  avatarUrl: null,
  avatarBuild: null,
  avatarColour: null,
  role: 'member' as const,
  joinedAt: '2026-06-01T12:00:00Z',
  ...o,
})

describe('the web says what the app says', () => {
  it('ordinals, including the teens', () => {
    for (const n of [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 112]) expect(web.ordinal(n)).toBe(app.ordinal(n))
  })

  it('names', () => {
    for (const p of [P({}), P({ fullName: null }), P({ fullName: '  ', username: null }), P({ fullName: 'Priya  Shah' })]) {
      expect(web.personName(p)).toBe(app.personName(p))
      expect(web.shortName(p)).toBe(app.shortName(p))
    }
    expect(web.personName(null)).toBe(app.personName(null))
  })

  it('roles', () => {
    for (const r of ['captain', 'co_captain', 'member', null] as const) expect(web.roleLabel(r)).toBe(app.roleLabel(r))
  })

  it('finishes — and Last Man Standing reads "Played"', () => {
    for (const [rank, players] of [[1, 12], [3, 0], [null, 12]] as const) {
      expect(web.finishText(rank, players)).toBe(app.finishText(rank, players))
    }
    expect(web.finishText(null, 12)).toBe('Played')
  })

  it('winners', () => {
    for (const w of [[], [P({})], [P({}), P({ fullName: 'Priya Shah' })], [P({}), P({ fullName: 'Priya Shah' }), P({ fullName: 'Sam Lee' })]]) {
      expect(web.winnersText(w)).toBe(app.winnersText(w))
    }
  })

  it('what leaving does — member, captain with a co-captain, captain without, last one out', () => {
    const cap = P({ userId: 'c', role: 'captain', fullName: 'Cara Diaz' })
    const co = P({ userId: 'k', role: 'co_captain', fullName: 'Kofi Mensah', joinedAt: '2026-07-01T12:00:00Z' })
    const early = P({ userId: 'e', fullName: 'Early Bird', joinedAt: '2026-05-01T12:00:00Z' })
    const cases = [
      { viewer: { role: 'member' as const }, members: [cap, early] },
      { viewer: { role: 'captain' as const }, members: [cap, co, early] },
      { viewer: { role: 'captain' as const }, members: [cap, early, P({ userId: 'l', fullName: 'Late Comer', joinedAt: '2026-08-01T12:00:00Z' })] },
      { viewer: { role: 'captain' as const }, members: [cap] },
    ]
    for (const c of cases) {
      const d = { viewer: { ...c.viewer, active: true, canManage: true, canSetCoCaptain: true, canRejoin: false }, members: c.members }
      expect(web.leaveConsequence(d)).toBe(app.leaveConsequence(d))
    }
    expect(web.leaveConsequence({ ...cases[1], viewer: { role: 'captain', active: true, canManage: true, canSetCoCaptain: true, canRejoin: false } })).toBe(
      'Kofi will become captain. Your history stays.',
    )
  })
})

describe('My Crews says what the app says', () => {
  const card = (o: Partial<Parameters<typeof web.crewSummary>[0] & Parameters<typeof web.leaderText>[0] & Parameters<typeof web.meText>[0]> = {}) => ({
    people: 14,
    seasons: 3,
    since: '2026-06-15T12:00:00Z',
    leader: { ...P({ userId: 'd' }), titles: 2 },
    me: { position: 4, titles: 0, seasons: 3 },
    ...o,
  })
  it('the summary line — including one person, no seasons, and a bad date', () => {
    for (const c of [card(), card({ people: 1, seasons: 0 }), card({ seasons: 1, since: 'nope' })]) {
      expect(web.crewSummary(c)).toBe(app.crewSummary(c))
    }
  })
  it('the status chip, all three kinds', () => {
    const statuses = [
      { kind: 'seat' as const, poolId: 'p', competition: 'Premier League 2026/27', firstLockAt: '2026-10-09T12:00:00Z' },
      { kind: 'live' as const, poolId: 'p', competition: 'Champions League 2026/27' },
      { kind: 'quiet' as const, poolId: 'p', competition: 'FIFA World Cup 2026' },
      { kind: 'quiet' as const, poolId: null, competition: null },
      { kind: 'disbanded' as const, at: '2026-10-02T12:00:00Z' },
    ]
    for (const st of statuses) expect(web.crewStatusText(st)).toBe(app.crewStatusText(st))
  })
  it('who leads, and where you stand', () => {
    for (const c of [card(), card({ leader: null }), card({ me: { position: 1, titles: 2, seasons: 3 } }), card({ me: { position: null, titles: 0, seasons: 0 } })]) {
      for (const viewer of ['d', 'someone-else', null]) expect(web.leaderText(c, viewer)).toBe(app.leaderText(c, viewer))
      expect(web.meText(c)).toBe(app.meText(c))
    }
  })
  it('disbanding — the confirmation and the captain’s notice', () => {
    expect(web.DISBAND_CONSEQUENCE).toBe(app.DISBAND_CONSEQUENCE)
    expect(web.DISBANDED_NOTICE).toBe(app.DISBANDED_NOTICE)
  })
  it('the invite preview line', () => {
    expect(web.invitePreviewText('Dave Okafor', 'Bermuda Office')).toBe(app.invitePreviewText('Dave Okafor', 'Bermuda Office'))
  })
})

describe('starting a pool for a crew works as it does in the app', () => {
  const running = [
    { poolName: 'Office League', competition: 'Premier League 2026/27', leagueSeasonId: 's-pl', tournamentId: 't-pl' },
    { poolName: 'WC Sweep', competition: 'FIFA World Cup 2026', leagueSeasonId: null, tournamentId: 't-wc' },
  ]
  it('already playing this? — by season for a league, by tournament otherwise', () => {
    const asks = [
      { tournament_id: 't-pl', league_season_id: 's-pl' },
      { tournament_id: 't-pl', league_season_id: 's-other' },
      { tournament_id: 't-wc', league_season_id: null },
      { tournament_id: 't-new', league_season_id: null },
    ]
    for (const a of asks) expect(web.crewAlreadyPlaying(running, a)).toEqual(appCreate.crewAlreadyPlaying(running, a))
    expect(web.crewAlreadyPlaying(running, asks[0])?.poolName).toBe('Office League')
    expect(web.crewAlreadyPlaying(running, asks[3])).toBeNull()
  })
  it('saved spots never exceed what the pool holds', () => {
    for (const [chosen, spots] of [[9, 9], [10, 9], [12, 9], [3, null]] as const) {
      expect(web.seatSelectionProblem(chosen, spots)).toBe(appCreate.seatSelectionProblem(chosen, spots))
    }
    expect(web.seatSelectionProblem(10, 9)).toContain('untick 1 more')
  })
})

describe('the deadline pill', () => {
  const NOW = Date.parse('2026-10-02T12:00:00Z')
  it('counts down in minutes, then hours, then names the day', () => {
    expect(web.deadlineLabel(new Date(NOW + 40 * 60_000).toISOString(), NOW)).toBe('40m left')
    expect(web.deadlineLabel(new Date(NOW + 30_000).toISOString(), NOW)).toBe('1m left')
    expect(web.deadlineLabel(new Date(NOW + 5 * 3_600_000).toISOString(), NOW)).toBe('5h left')
    expect(web.deadlineLabel(new Date(NOW + 3 * 86_400_000).toISOString(), NOW)).toMatch(/^[A-Z][a-z]{2} \d{1,2}:\d{2} (am|pm)$/)
    expect(web.deadlineLabel('not a date', NOW)).toBe('')
  })
})
