// =============================================================
// Running the re-homing plan against a season
// =============================================================
// The policy is in `rehome.ts` and is pure. This is the half that touches the
// world: read the season, ask the planner, hand the answer to the database.
//
// Deliberately thin. Anything resembling a decision here would be a second copy
// of a rule that already has three seasons of tests pointed at it.

import type { SupabaseClient } from '@supabase/supabase-js'
import { planRehome, type RehomeFixture, type RehomeMatchweek } from './rehome'

/** Well above a league season (380 fixtures), low enough to notice a runaway. */
const CAP = 5000

type Push = (stage: string, message: string, extra?: Record<string, unknown>) => void

/**
 * Re-plan a whole season and apply whatever moved.
 *
 * Returns the number of fixtures actually re-homed — read back from the RPC, so
 * a move refused by one of its guards is never counted as one that happened.
 */
export async function rehomeSeason(
  admin: SupabaseClient,
  seasonId: string,
  push: Push,
): Promise<number> {
  const mwRes = await admin
    .from('league_matchweeks')
    .select('matchweek_id, matchweek_number, lock_at, first_kickoff_at')
    .eq('season_id', seasonId)
    .order('matchweek_number')
  // ⚠ Checked, not destructured away. `const { data } = await …` hides a 400,
  // and a re-home planned from an empty matchweek list would move every fixture
  // in the season to nowhere.
  if (mwRes.error) throw new Error(`matchweeks: ${mwRes.error.message}`)

  const fxRes = await admin
    .from('league_fixtures')
    .select('fixture_id, matchweek_id, kickoff_at, is_completed, manual_override')
    .eq('season_id', seasonId)
    .range(0, CAP - 1)
  if (fxRes.error) throw new Error(`fixtures: ${fxRes.error.message}`)

  const fixtures = fxRes.data ?? []
  // An exact cap is a truncation, not a season. Planning on a partial fixture
  // list would empty matchweeks that are not actually empty.
  if (fixtures.length >= CAP) {
    throw new Error(`season ${seasonId} returned ${fixtures.length} fixtures — read was truncated`)
  }

  const matchweeks: RehomeMatchweek[] = (mwRes.data ?? []).map((m) => ({
    matchweekId: m.matchweek_id as string,
    matchweekNumber: m.matchweek_number as number,
    lockAt: (m.lock_at as string | null) ?? null,
    firstKickoffAt: (m.first_kickoff_at as string | null) ?? null,
  }))

  const planned: RehomeFixture[] = fixtures.map((f) => ({
    fixtureId: f.fixture_id as string,
    matchweekId: f.matchweek_id as string,
    kickoffAt: f.kickoff_at as string,
    isCompleted: Boolean(f.is_completed),
    manualOverride: Boolean(f.manual_override),
  }))

  const plan = planRehome(matchweeks, planned, new Date().toISOString())
  if (plan.moves.length === 0) return 0

  const { data, error } = await admin.rpc('league_apply_rehome', {
    p_season_id: seasonId,
    p_moves: plan.moves.map((m) => ({
      fixture_id: m.fixtureId,
      to_matchweek_id: m.toMatchweekId,
    })),
    p_now: new Date().toISOString(),
  })
  if (error) throw new Error(`league_apply_rehome: ${error.message}`)

  const moved = (data as { moved?: number } | null)?.moved ?? 0

  // Not an error — the SQL guards refuse a move the planner asked for whenever
  // a lock passed between planning and writing, which is correct. But silent it
  // must not be: the two numbers disagreeing is the only sign that the policy
  // and the database read the same season differently.
  if (moved !== plan.moves.length) {
    push('league_rehome', `planned ${plan.moves.length} move(s), the database applied ${moved}`, {
      season_id: seasonId,
    })
  }

  // An emptied matchweek is no longer a stall — migration 106 settles it and
  // Last Man Standing skips it — but it IS a week the pool cannot pick in, and
  // whoever reads these logs should not have to derive that from a fixture
  // count.
  if (plan.emptied.length > 0) {
    push('league_rehome', `${plan.emptied.length} matchweek(s) now hold no fixtures`, {
      season_id: seasonId,
      matchweek_ids: plan.emptied,
    })
  }

  return moved
}
