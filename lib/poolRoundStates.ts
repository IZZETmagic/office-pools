// =============================================================
// SEEDING pool_round_states
// =============================================================
// Two routes create pools (app/api/pools/create and the branded-pool admin
// route) and both carried the same literal seven-key World Cup list. That is
// fine while there is one competition shape and wrong the moment there are two,
// so the list moves here and is derived from the competition instead.
//
// A league's rounds cannot be a constant: 20 clubs give 38 matchweeks, 18 give
// 34, the Championship's 24 give 46. They come from the imported fixtures.

import type { SupabaseClient } from '@supabase/supabase-js'
import { bracketRoundDefs } from '@/lib/competitionRounds'

export type SeedResult = {
  seeded: number
  openRoundKey: string | null
  error: string | null
}

/**
 * Create the round-state rows for a newly created pool.
 *
 * Bracket pools keep exactly their previous behaviour: seven rows, `group`
 * open at the pool's own deadline, the rest locked with no deadline (the
 * cascade sets one when it opens them).
 *
 * League pools are REFUSED here. They used to be seeded from `matches` rows
 * with stage='regular_season', bucketed by `matches.round_number` — a shape
 * migration 049 removed and migration 050 replaced with `league_matchweeks`.
 * The league seeder is L7 and reads that table; until then this returns an
 * error rather than a zero seed, because a league pool with no round states can
 * neither accept a prediction nor open one, and `{ seeded: 0, error: null }`
 * reads as success at the call site.
 *
 * The design notes that survive for L7: a league's whole calendar is known up
 * front, so every matchweek's deadline (its first kickoff) can be stored at
 * creation rather than filled in at open time; and a league pool may be created
 * mid-season, so matchweeks already kicked off seed `completed`, the next seeds
 * `open`, and the rest `locked` — seeding all of them `locked` would leave a
 * September pool with nothing open and nothing to open it.
 */
export async function seedPoolRoundStates(
  supabase: SupabaseClient,
  args: {
    poolId: string
    tournamentId: string
    predictionMode: string
    /** Used as the first round's deadline for bracket pools. */
    predictionDeadline: string | null
    /** Defaults to now(); injectable so the mid-season branch is testable. */
    now?: Date
  }
): Promise<SeedResult> {
  const { poolId, tournamentId, predictionMode, predictionDeadline } = args
  const now = args.now ?? new Date()

  if (predictionMode === 'league_pickem') {
    // This used to seed matchweek round states by reading `matches` for
    // stage='regular_season' and bucketing on `matches.round_number`. Both are
    // gone: migration 049 dropped the column and 050 moved leagues to their own
    // tables, so production has zero `regular_season` rows and this branch can
    // only ever have produced an empty seed.
    //
    // It refuses rather than returning `{ seeded: 0 }`, because a league pool
    // with no round states can neither accept a prediction nor open one — and a
    // silent zero is indistinguishable from success at the call site. The
    // replacement reads `league_matchweeks` and lands in L7.
    return {
      seeded: 0,
      openRoundKey: null,
      error:
        `cannot seed round states for a league pool from \`matches\` — leagues live in \`league_matchweeks\` ` +
        `since migration 050 (tournament ${tournamentId}). The league seeder is L7.`,
    }
  }

  // Bracket — unchanged behaviour, just no longer a literal in two routes.
  const defs = bracketRoundDefs()
  const openKey = defs[0]?.key ?? null
  const payload = defs.map((d) => ({
    pool_id: poolId,
    round_key: d.key,
    state: d.key === openKey ? 'open' : 'locked',
    deadline: d.key === openKey ? predictionDeadline : null,
    opened_at: d.key === openKey ? now.toISOString() : null,
  }))

  const { error } = await supabase.from('pool_round_states').insert(payload)
  if (error) return { seeded: 0, openRoundKey: null, error: error.message }
  return { seeded: payload.length, openRoundKey: openKey, error: null }
}
