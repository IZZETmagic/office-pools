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
import { bracketRoundDefs, leagueRoundDefs, matchweekKey, type RoundDef } from '@/lib/competitionRounds'

export type SeedResult = {
  seeded: number
  openRoundKey: string | null
  error: string | null
}

type FixtureRow = { stage: string; round_number: number | null; match_date: string | null }

/**
 * Create the round-state rows for a newly created pool.
 *
 * Bracket pools keep exactly their previous behaviour: seven rows, `group`
 * open at the pool's own deadline, the rest locked with no deadline (the
 * cascade sets one when it opens them).
 *
 * League pools get one row per matchweek, and differ in two ways that matter:
 *
 *   1. **Every deadline is known up front.** A league's fixture calendar is
 *      published before a ball is kicked, so each matchweek's deadline — its
 *      first kickoff — is stored immediately rather than filled in at open
 *      time. That lets the UI show "Matchweek 7 locks Sat 12:30" in August, and
 *      the auto-open sweep later writes the same value.
 *
 *   2. **A pool can be created mid-season.** Decision 2 settled that a league
 *      pool stays joinable after first lock — *"week 3 of 38 is viable; a
 *      bracket is not"*. So matchweeks already kicked off are seeded
 *      `completed`, the next upcoming one is seeded `open`, and the rest
 *      `locked`. Seeding every matchweek `locked` would leave a pool created in
 *      September with nothing open and nothing to open it, since the auto-open
 *      sweep only advances a round when the PREVIOUS one completes.
 *
 * The deadline is the matchweek's first kickoff exactly, with no grace window,
 * because `trg_enforce_prediction_before_kickoff` (migration 045) enforces that
 * instant at the database level and silently drops later writes. A deadline
 * here that disagreed with the trigger would either close a matchweek early or
 * show an open round whose saves vanish without an error.
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
    const { data: fixtures, error } = await supabase
      .from('matches')
      .select('stage, round_number, match_date')
      .eq('tournament_id', tournamentId)
      .eq('stage', 'regular_season')
    if (error) return { seeded: 0, openRoundKey: null, error: error.message }

    const rows = (fixtures ?? []) as FixtureRow[]
    if (rows.length === 0) {
      // Refuse quietly-empty. A league pool with no round states has no way to
      // accept a prediction and no way to ever open one.
      return {
        seeded: 0,
        openRoundKey: null,
        error: `tournament ${tournamentId} has no regular_season fixtures — import the season before creating league pools`,
      }
    }

    return insertLeagueRounds(supabase, poolId, rows, now)
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

async function insertLeagueRounds(
  supabase: SupabaseClient,
  poolId: string,
  fixtures: FixtureRow[],
  now: Date
): Promise<SeedResult> {
  const defs: RoundDef[] = leagueRoundDefs(fixtures)

  // First kickoff per matchweek — the deadline, and what decides past vs future.
  const firstKickoff = new Map<string, string>()
  for (const f of fixtures) {
    if (f.round_number == null || !f.match_date) continue
    const key = matchweekKey(f.round_number)
    const current = firstKickoff.get(key)
    if (!current || f.match_date < current) firstKickoff.set(key, f.match_date)
  }

  const nowIso = now.toISOString()

  // The first matchweek that has not kicked off yet. A matchweek with no dated
  // fixture cannot be judged past, so it is treated as upcoming.
  const openKey =
    defs.find((d) => {
      const k = firstKickoff.get(d.key)
      return !k || k > nowIso
    })?.key ?? null

  const openOrder = openKey ? (defs.find((d) => d.key === openKey)?.order ?? 0) : defs.length

  const payload = defs.map((d) => {
    const deadline = firstKickoff.get(d.key) ?? null
    const state = d.order < openOrder ? 'completed' : d.key === openKey ? 'open' : 'locked'
    return {
      pool_id: poolId,
      round_key: d.key,
      state,
      deadline,
      opened_at: d.key === openKey ? nowIso : null,
      completed_at: state === 'completed' ? nowIso : null,
    }
  })

  const { error } = await supabase.from('pool_round_states').insert(payload)
  if (error) return { seeded: 0, openRoundKey: null, error: error.message }
  return { seeded: payload.length, openRoundKey: openKey, error: null }
}
