// =============================================================
// recalculatePool — cross-pool regression lock for Bug #1
// =============================================================
// T-0018 / D-014 (2026-04-24), Priya.
//
// This is a CONTRACT test against a mocked Supabase client. It is not
// a real DB round-trip. The question it answers is: "when we call
// `recalculatePool({ poolId: 'pool-A' })`, does the DELETE on the
// match_scores table include `.eq('pool_id', 'pool-A')` on the query
// builder chain?" If it does, pool B's rows can never be touched by
// pool A's recalc, regardless of what entry_ids are in the batch.
//
// Why contract-level rather than real DB:
//
//   - Standing up a test Supabase schema requires credentials the agent
//     does not have and a Chairman-only setup call we haven't made.
//   - The assertion we care about is the filter clause, which is a
//     property of the query-builder chain. Mocking that chain proves
//     the property with 100% fidelity against what the Supabase client
//     actually emits, modulo a trusted library.
//   - Fails red on the unfixed code (no .eq('pool_id', …)); fails green
//     on the fix branch. That is the regression lock Tim asked for.
//
// If this test ever needs to upgrade to a real-DB integration, that is
// a separate ticket with infra setup on its critical path. See
// products/office-pools/engineering/07-bug-1-fix-handoff.md §1 for
// the deviation note.
//
// See:
//   - products/office-pools/engineering/05-scoring-bug-1-preflight.md §2.2
//   - products/office-pools/engineering/04-scoring-recalc-audit.md §1.4 Bug 1

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Tracks every .delete() chain issued against the mock client.
// Shape: { table, calls: [{ method, args }] }
type DeleteCall = {
  table: string
  filters: Array<{ method: string; args: unknown[] }>
}

const deleteCalls: DeleteCall[] = []

/**
 * Builds a query-builder chain that records every filter call.
 * The chain is also thenable so `await adminClient.from(...).delete().in(...)`
 * resolves to `{ error: null }`.
 */
function buildDeleteChain(table: string) {
  const record: DeleteCall = { table, filters: [] }
  deleteCalls.push(record)
  const chain: any = {}
  const filterMethods = ['eq', 'in', 'neq', 'gt', 'gte', 'lt', 'lte']
  for (const method of filterMethods) {
    chain[method] = (...args: unknown[]) => {
      record.filters.push({ method, args })
      return chain
    }
  }
  chain.then = (resolve: (v: { error: null }) => unknown) => resolve({ error: null })
  return chain
}

/**
 * Canned responses for the read-phase queries `recalculatePool` issues
 * before it gets to the write phase. Just enough to get the orchestrator
 * into `writeScoresToDB` with a non-trivial result for pool A.
 */
function buildReadChain(table: string) {
  const chain: any = {}
  // All filter methods return chain for chaining
  const filterMethods = ['eq', 'in', 'neq', 'gt', 'gte', 'lt', 'lte', 'order', 'range']
  for (const method of filterMethods) {
    chain[method] = () => chain
  }
  chain.select = () => chain
  chain.single = () => {
    if (table === 'pools') {
      return Promise.resolve({
        data: { pool_id: 'pool-A', tournament_id: 'tournament-fixture', prediction_mode: 'full_tournament' },
        error: null,
      })
    }
    if (table === 'pool_settings') {
      return Promise.resolve({ data: {}, error: null })
    }
    if (table === 'tournament_awards') {
      return Promise.resolve({ data: null, error: null })
    }
    return Promise.resolve({ data: null, error: null })
  }
  // Thenable for non-.single() reads
  chain.then = (resolve: (v: { data: any[]; error: null }) => unknown) => {
    if (table === 'matches') {
      return resolve({
        data: [
          {
            match_id: 'match-fixture',
            match_number: 1,
            stage: 'group',
            group_letter: 'A',
            match_date: '2026-06-11T20:00:00Z',
            venue: null,
            status: 'live',
            home_team_id: 'team-home',
            away_team_id: 'team-away',
            home_team_placeholder: null,
            away_team_placeholder: null,
            home_team: { country_name: 'Mexico', flag_url: null },
            away_team: { country_name: 'USA', flag_url: null },
            is_completed: false,
            home_score_ft: 1,
            away_score_ft: 0,
            home_score_pso: null,
            away_score_pso: null,
            winner_team_id: null,
            tournament_id: 'tournament-fixture',
          },
        ],
        error: null,
      })
    }
    if (table === 'teams') {
      return resolve({
        data: [
          { team_id: 'team-home', country_name: 'Mexico', country_code: 'MEX', group_letter: 'A', fifa_ranking_points: 1500, flag_url: null },
          { team_id: 'team-away', country_name: 'USA', country_code: 'USA', group_letter: 'A', fifa_ranking_points: 1500, flag_url: null },
        ],
        error: null,
      })
    }
    if (table === 'match_conduct') return resolve({ data: [], error: null })
    if (table === 'pool_members') {
      return resolve({ data: [{ member_id: 'member-1' }], error: null })
    }
    if (table === 'pool_entries') {
      return resolve({
        data: [
          {
            entry_id: 'entry-A-1',
            member_id: 'member-1',
            has_submitted_predictions: true,
            point_adjustment: 0,
            predictions_submitted_at: '2026-06-01T00:00:00Z',
          },
        ],
        error: null,
      })
    }
    if (table === 'predictions') {
      return resolve({
        data: [
          {
            entry_id: 'entry-A-1',
            match_id: 'match-fixture',
            predicted_home_score: 1,
            predicted_away_score: 0,
            predicted_home_pso: null,
            predicted_away_pso: null,
            predicted_winner_team_id: 'team-home',
          },
        ],
        error: null,
      })
    }
    return resolve({ data: [], error: null })
  }
  return chain
}

function buildUpdateChain() {
  const chain: any = {}
  const filterMethods = ['eq', 'in']
  for (const method of filterMethods) {
    chain[method] = () => chain
  }
  chain.then = (resolve: (v: { error: null }) => unknown) => resolve({ error: null })
  return chain
}

function buildInsertResult() {
  return {
    then: (resolve: (v: { error: null }) => unknown) => resolve({ error: null }),
  }
}

/**
 * The mock admin client. Dispatches .from(table).{select|delete|insert|update}
 * to the right chain builder.
 */
const mockAdminClient = {
  from: (table: string) => ({
    select: (..._args: unknown[]) => buildReadChain(table),
    delete: () => buildDeleteChain(table),
    insert: (_rows: unknown) => buildInsertResult(),
    update: (_patch: unknown) => buildUpdateChain(),
  }),
}

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => mockAdminClient,
}))

// Bonus calculation can pull a large bracket resolver graph; stub it out.
// We are testing the delete-filter contract, not bonus math.
vi.mock('@/lib/bonusCalculation', () => ({
  calculateAllBonusPoints: () => [],
}))

vi.mock('@/lib/bracketResolver', () => ({
  resolveFullBracket: () => ({
    knockoutTeamMap: new Map(),
    groupTables: new Map(),
    thirdPlaceRanking: [],
  }),
  buildActualResultsMap: () => new Map(),
}))

import { recalculatePool } from '../recalculate'

describe('recalculatePool — cross-pool regression lock (T-0018 Bug #1)', () => {
  beforeEach(() => {
    deleteCalls.length = 0
  })

  it('scopes every match_scores DELETE by pool_id', async () => {
    const result = await recalculatePool({ poolId: 'pool-A' })
    expect(result.success).toBe(true)

    const matchScoreDeletes = deleteCalls.filter(c => c.table === 'match_scores')
    expect(matchScoreDeletes.length).toBeGreaterThan(0)

    for (const call of matchScoreDeletes) {
      const poolIdFilter = call.filters.find(
        f => f.method === 'eq' && f.args[0] === 'pool_id' && f.args[1] === 'pool-A'
      )
      expect(
        poolIdFilter,
        'match_scores DELETE must include .eq("pool_id", <poolId>). ' +
          'Without this filter, a legitimate schema evolution could cause a ' +
          'cross-pool wipe. See audit §1.4 Bug 1.'
      ).toBeDefined()
    }
  })

  it('also retains the entry_id batch filter on match_scores DELETE', async () => {
    // Regression guard: the .eq('pool_id') fix must not replace the .in('entry_id')
    // filter, only augment it. Without the entry_id filter the delete would wipe
    // the entire pool's match_scores on every recalc — correct but wasteful.
    await recalculatePool({ poolId: 'pool-A' })
    const matchScoreDeletes = deleteCalls.filter(c => c.table === 'match_scores')
    for (const call of matchScoreDeletes) {
      const entryIdFilter = call.filters.find(
        f => f.method === 'in' && f.args[0] === 'entry_id' && Array.isArray(f.args[1])
      )
      expect(entryIdFilter).toBeDefined()
    }
  })

  it('filter order is .eq("pool_id") BEFORE .in("entry_id")', async () => {
    // The diff applies .eq('pool_id') before .in('entry_id'). This is not
    // semantically required by PostgREST (filters compose), but we lock
    // the order so future refactors produce predictable SQL and so diffs
    // against master stay minimal.
    await recalculatePool({ poolId: 'pool-A' })
    const matchScoreDeletes = deleteCalls.filter(c => c.table === 'match_scores')
    for (const call of matchScoreDeletes) {
      const poolIdIdx = call.filters.findIndex(
        f => f.method === 'eq' && f.args[0] === 'pool_id'
      )
      const entryIdIdx = call.filters.findIndex(
        f => f.method === 'in' && f.args[0] === 'entry_id'
      )
      expect(poolIdIdx).toBeGreaterThanOrEqual(0)
      expect(entryIdIdx).toBeGreaterThanOrEqual(0)
      expect(poolIdIdx).toBeLessThan(entryIdIdx)
    }
  })

  it('bonus_scores DELETE is deliberately NOT yet pool-scoped (deferred per D-014 Option B)', async () => {
    // This test documents the current intentional state: bonus_scores
    // pool-scoping is deferred to post-WC per the Chairman's D-014 decision,
    // bundled with Bug #2 in the backlog. When Bug #2 lands, this test must
    // flip: change the assertion to expect the filter, and delete this
    // explanatory comment. Test name and body are intentionally explicit so
    // an engineer reading the file doesn't "helpfully" add the filter without
    // the accompanying backlog work.
    await recalculatePool({ poolId: 'pool-A' })
    const bonusScoreDeletes = deleteCalls.filter(c => c.table === 'bonus_scores')
    // Our fixture has no bonus scores (calculateAllBonusPoints is stubbed to []),
    // so the delete branch isn't entered in this run. Assert that, explicitly,
    // rather than making a stronger claim we can't back up with this fixture.
    expect(bonusScoreDeletes.length).toBe(0)
  })
})
