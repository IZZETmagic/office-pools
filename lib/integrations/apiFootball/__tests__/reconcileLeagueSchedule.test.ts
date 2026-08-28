// =============================================================
// The daily league reconcile — the input re-homing was missing
// =============================================================
// Found by running the sync and asking why nothing moved. The live arm only
// looks within ~3h of the kickoff it already holds, so a game moved months out
// is invisible until its ORIGINAL kickoff arrives — by which point its
// matchweek has locked and `league_apply_rehome` refuses the move. Re-homing
// was shipped, applied, and unreachable.
//
// The two properties that make this route worth having are both boundary
// conditions, and both fail silently if they drift:
//
//   · it must look BEYOND the live sync's window (or it sees nothing new);
//   · it must not look INSIDE it (or two arms write the same fixture).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ApiFootballFixture, ApiFootballStatusShort } from '../types'

const getFixturesAllPages = vi.fn()
vi.mock('../client', () => ({
  getFixturesAllPages: (...a: unknown[]) => getFixturesAllPages(...a),
}))
const rehomeSeason = vi.fn()
vi.mock('@/lib/league/rehomeSeason', () => ({
  rehomeSeason: (...a: unknown[]) => rehomeSeason(...a),
}))

const { reconcileLeagueSchedule, formatLeagueReconcileNote } = await import(
  '../reconcileLeagueSchedule'
)

const NOW = Date.parse('2026-11-01T12:00:00Z')
const FAR = '2027-02-14T15:00:00Z' // months out: only this route can see it
const SOON = '2026-11-01T12:20:00Z' // inside the live sync's window

function feedFixture(id: string, date: string, short: ApiFootballStatusShort = 'NS'): ApiFootballFixture {
  return {
    fixture: {
      id: Number(id), referee: null, date,
      venue: { id: null, name: 'Ground', city: 'Town' },
      status: { long: short, short, elapsed: null, extra: null },
    },
    league: { id: 39, season: 2026, round: 'Regular Season - 25' },
    teams: { home: { id: 1, name: 'A', winner: null }, away: { id: 2, name: 'B', winner: null } },
    goals: { home: null, away: null },
    score: {
      halftime: { home: null, away: null }, fulltime: { home: null, away: null },
      extratime: { home: null, away: null }, penalty: { home: null, away: null },
    },
  }
}

function ourRow(over: Record<string, unknown> = {}) {
  return {
    fixture_id: 'f-1', matchweek_id: 'mw-25', external_fixture_id: '900001',
    kickoff_at: FAR, original_kickoff_at: null,
    status: 'scheduled', status_detail: null,
    home_goals: null, away_goals: null, is_completed: false,
    live_minute: null, live_period: null, live_added: null, manual_override: false,
    ...over,
  }
}

/** Records the filters applied, so the window boundary can be asserted. */
function fakeDb(rows: unknown[], rpc?: { data: unknown; error: { message: string } | null }) {
  const filters: string[] = []
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = []
  const client = {
    from() {
      const api: Record<string, unknown> = {}
      for (const m of ['select', 'order', 'range', 'eq', 'gt', 'gte', 'lt', 'lte', 'not', 'or', 'limit']) {
        api[m] = (...a: unknown[]) => { filters.push(`${m}(${a.map(String).join(',')})`); return api }
      }
      api.maybeSingle = async () => ({ data: null, error: null })
      api.then = (res: (v: unknown) => unknown) => res({ data: rows, error: null })
      return api
    },
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args })
      return { then: (res: (v: unknown) => unknown) => res(rpc ?? { data: { seen: 0, changed: [] }, error: null }) }
    },
  }
  return { client: client as never, filters, rpcCalls }
}

beforeEach(() => {
  getFixturesAllPages.mockReset()
  rehomeSeason.mockReset().mockResolvedValue(0)
})
afterEach(() => vi.restoreAllMocks())

const ARGS = { seasonId: 'season-1', externalLeagueId: 39, externalSeason: 2026, now: NOW }

describe('what it looks at', () => {
  it('⚠ reads only BEYOND the live sync’s window', async () => {
    // THE REASON THIS FILE EXISTS. Reading inside the window would double up
    // with the per-minute arm; reading only inside it would see nothing the arm
    // has not already seen, which is the bug being fixed.
    const db = fakeDb([ourRow()])
    getFixturesAllPages.mockResolvedValue({ fixtures: [feedFixture('900001', FAR)], calls: 1 })
    await reconcileLeagueSchedule(db.client, ARGS)
    const gt = db.filters.find((f) => f.startsWith('gt(kickoff_at'))
    expect(gt, 'the future-only filter is gone').toBeDefined()
    expect(Date.parse(gt!.slice('gt(kickoff_at,'.length, -1))).toBeGreaterThan(NOW)
  })

  it('never considers a completed or manually-overridden fixture', async () => {
    const db = fakeDb([ourRow()])
    getFixturesAllPages.mockResolvedValue({ fixtures: [feedFixture('900001', FAR)], calls: 1 })
    await reconcileLeagueSchedule(db.client, ARGS)
    expect(db.filters).toContain('eq(is_completed,false)')
    expect(db.filters).toContain('eq(manual_override,false)')
  })

  it('spends NO api call when nothing is ahead of the window', async () => {
    // The end of a season, every day, forever. A call here would be pure waste.
    const db = fakeDb([])
    const r = await reconcileLeagueSchedule(db.client, ARGS)
    expect(getFixturesAllPages).not.toHaveBeenCalled()
    expect(r.apiCalls).toBe(0)
    expect(r.checked).toBe(0)
  })

  it('leaves a fixture the feed says is live or finished to the other arm', async () => {
    const db = fakeDb([ourRow()])
    getFixturesAllPages.mockResolvedValue({ fixtures: [feedFixture('900001', SOON, '1H')], calls: 1 })
    const r = await reconcileLeagueSchedule(db.client, ARGS)
    expect(r.checked).toBe(0)
    expect(r.detected).toEqual([])
  })
})

describe('what it does with a move', () => {
  const MOVED = '2027-05-20T18:30:00Z'

  it('detects a game moved months out — the case the live sync cannot see', async () => {
    const db = fakeDb([ourRow()])
    getFixturesAllPages.mockResolvedValue({ fixtures: [feedFixture('900001', MOVED)], calls: 1 })
    const r = await reconcileLeagueSchedule(db.client, ARGS)
    expect(r.detected).toHaveLength(1)
    expect(r.detected[0]).toMatchObject({
      externalFixtureId: '900001', oldKickoff: FAR, newKickoff: MOVED,
    })
    expect(r.detected[0].shiftMinutes).toBeGreaterThan(0)
  })

  it('writes through the RPC, never the table', async () => {
    // league_apply_fixture_sync owns the guards — completed refused,
    // manual_override untouchable, the FIRST original kept by COALESCE.
    // A direct UPDATE here would bypass all three.
    const db = fakeDb([ourRow()])
    getFixturesAllPages.mockResolvedValue({ fixtures: [feedFixture('900001', MOVED)], calls: 1 })
    await reconcileLeagueSchedule(db.client, ARGS)
    expect(db.rpcCalls.map((c) => c.fn)).toEqual(['league_apply_fixture_sync'])
    const rows = db.rpcCalls[0].args.p_rows as Array<Record<string, unknown>>
    expect(rows[0]).toMatchObject({ set_kickoff: true, kickoff_at: MOVED })
  })

  it('⚠ counts what the DATABASE wrote, not what it asked for', async () => {
    // The RPC drops a refused write silently and correctly. Counting the ask
    // would report a move that never happened.
    const db = fakeDb([ourRow()], { data: { seen: 1, changed: [] }, error: null })
    getFixturesAllPages.mockResolvedValue({ fixtures: [feedFixture('900001', MOVED)], calls: 1 })
    const r = await reconcileLeagueSchedule(db.client, ARGS)
    expect(r.detected).toHaveLength(1)
    expect(r.applied).toBe(0)
  })

  it('⚠ and a row that comes back carrying the OLD kickoff is not a move', async () => {
    // The sharp case, and the one an empty `changed` cannot catch: the RPC
    // refused the reschedule but the row still changed for another reason, so
    // it appears in `changed` with its kickoff untouched. Counting rows rather
    // than comparing the value would score that as a successful move.
    const db = fakeDb([ourRow()], {
      data: { seen: 1, changed: [{ external_fixture_id: '900001', kickoff_at: FAR }] },
      error: null,
    })
    getFixturesAllPages.mockResolvedValue({ fixtures: [feedFixture('900001', MOVED)], calls: 1 })
    const r = await reconcileLeagueSchedule(db.client, ARGS)
    expect(r.detected).toHaveLength(1)
    expect(r.applied).toBe(0)
    expect(rehomeSeason).not.toHaveBeenCalled()
  })

  it('re-homes only once a move actually landed', async () => {
    const applied = {
      data: { seen: 1, changed: [{ external_fixture_id: '900001', kickoff_at: MOVED }] },
      error: null,
    }
    const db = fakeDb([ourRow()], applied)
    getFixturesAllPages.mockResolvedValue({ fixtures: [feedFixture('900001', MOVED)], calls: 1 })
    rehomeSeason.mockResolvedValue(1)
    const r = await reconcileLeagueSchedule(db.client, ARGS)
    expect(r.applied).toBe(1)
    expect(rehomeSeason).toHaveBeenCalledOnce()
    expect(r.rehomed).toBe(1)
  })

  it('does not re-home when nothing moved — it reads the whole season', async () => {
    const db = fakeDb([ourRow()])
    getFixturesAllPages.mockResolvedValue({ fixtures: [feedFixture('900001', FAR)], calls: 1 })
    const r = await reconcileLeagueSchedule(db.client, ARGS)
    expect(r.detected).toEqual([])
    expect(rehomeSeason).not.toHaveBeenCalled()
  })

  it('⚠ nor when a fixture changed for a reason that is NOT the kickoff', async () => {
    // A postponement flag with the same date still produces a payload and a
    // written row. Re-homing off "something was written" rather than "a kickoff
    // moved" would re-plan the entire season on every status flicker.
    const db = fakeDb([ourRow()], {
      data: { seen: 1, changed: [{ external_fixture_id: '900001', kickoff_at: FAR }] },
      error: null,
    })
    getFixturesAllPages.mockResolvedValue({ fixtures: [feedFixture('900001', FAR, 'PST')], calls: 1 })
    const r = await reconcileLeagueSchedule(db.client, ARGS)
    expect(r.detected).toEqual([])
    expect(r.applied).toBe(0)
    expect(rehomeSeason).not.toHaveBeenCalled()
  })

  it('a re-home failure never fails the reconcile', async () => {
    // The dates are already written and correct; the planner holds no state.
    const applied = {
      data: { seen: 1, changed: [{ external_fixture_id: '900001', kickoff_at: MOVED }] },
      error: null,
    }
    const db = fakeDb([ourRow()], applied)
    getFixturesAllPages.mockResolvedValue({ fixtures: [feedFixture('900001', MOVED)], calls: 1 })
    rehomeSeason.mockRejectedValue(new Error('boom'))
    const r = await reconcileLeagueSchedule(db.client, ARGS)
    expect(r.applied).toBe(1)
    expect(r.errors.some((e) => e.stage === 'league_rehome')).toBe(true)
  })
})

describe('the failure modes that would otherwise be silent', () => {
  it('a dry run writes nothing but still reports what would move', async () => {
    const db = fakeDb([ourRow()])
    getFixturesAllPages.mockResolvedValue({ fixtures: [feedFixture('900001', '2027-05-20T18:30:00Z')], calls: 1 })
    const r = await reconcileLeagueSchedule(db.client, { ...ARGS, dryRun: true })
    expect(r.detected).toHaveLength(1)
    expect(r.wrote).toBe(false)
    expect(db.rpcCalls).toEqual([])
  })

  it('a fixture missing from the season feed is REPORTED, not skipped quietly', async () => {
    // Ours not being in the feed is a mapping break, not a reschedule. Silence
    // would hide it for a whole season.
    const db = fakeDb([ourRow()])
    getFixturesAllPages.mockResolvedValue({ fixtures: [], calls: 1 })
    const r = await reconcileLeagueSchedule(db.client, ARGS)
    expect(r.unmatched).toEqual(['900001'])
    expect(r.checked).toBe(0)
  })

  it('a feed failure writes nothing at all', async () => {
    // Without the feed there is nothing to compare against, and writing
    // anything would be inventing a schedule.
    const db = fakeDb([ourRow()])
    getFixturesAllPages.mockRejectedValue(new Error('429 rate limited'))
    const r = await reconcileLeagueSchedule(db.client, ARGS)
    expect(db.rpcCalls).toEqual([])
    expect(r.errors[0].stage).toBe('league_reconcile_fetch')
    // ⚠ And it stops THERE. Falling through with an empty feed would mark every
    // fixture in the season "not present in the feed" — a rate limit reported
    // as 380 mapping breaks.
    expect(r.unmatched).toEqual([])
    expect(r.checked).toBe(0)
  })

  it('the note says what happened, including a quiet run', async () => {
    const db = fakeDb([])
    const r = await reconcileLeagueSchedule(db.client, ARGS)
    expect(formatLeagueReconcileNote(r)).toBe('checked=0 calls=0 moved=0/0')
  })
})
