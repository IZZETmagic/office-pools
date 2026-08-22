// =============================================================
// ROUND → FIXTURES, as a database query
// =============================================================
// lib/competitionRounds.ts decides WHAT a round contains and stays pure so it
// can be unit-tested without a database. This is the one place that turns that
// decision into a PostgREST query, so every server path asks the question the
// same way.
//
// It exists because the old shape — `.in('stage', ROUND_MATCH_STAGES[key] ?? [])`
// — is repeated at roughly a dozen call sites, and every one of them silently
// selects nothing for a matchweek key. `.in('stage', [])` is not an error; it is
// a valid query returning zero rows, which reads downstream as "this round has
// no fixtures yet" and simply does nothing.

import type { SupabaseClient } from '@supabase/supabase-js'
import { selectorForKey } from '@/lib/competitionRounds'

/**
 * Fixtures belonging to one round of one competition.
 *
 * Ordered by kickoff, because callers use the first row to derive a deadline.
 *
 * ⚠ Errors are returned, not swallowed. A discarded PostgREST error here would
 * present as an empty round — a matchweek that never opens, or one that
 * auto-completes because "all zero of its fixtures are finished".
 */
export async function fetchRoundMatches<T = Record<string, unknown>>(
  supabase: SupabaseClient,
  args: { tournamentId: string; roundKey: string; columns: string }
): Promise<{ data: T[]; error: string | null }> {
  const selector = selectorForKey(args.roundKey)

  let q = supabase
    .from('matches')
    .select(args.columns)
    .eq('tournament_id', args.tournamentId)

  if (selector.kind === 'matchweek') {
    // A matchweek's fixtures are not in `matches`. Migration 049 dropped
    // `round_number` and 050 moved leagues to `league_fixtures`, so this arm
    // could now only issue a select PostgREST answers with 42703 — which, read
    // through a discarded error, is an empty round that looks real. Refusing is
    // the same choice the unknown-key branch below already makes. L5 repoints
    // this at the fixture store.
    return {
      data: [],
      error: `round key '${args.roundKey}' is a matchweek — league fixtures live in \`league_fixtures\`, not \`matches\` (L5)`,
    }
  } else {
    // An unrecognised key yields an empty stage list. Rather than run
    // `.in('stage', [])` and hand back a plausible-looking empty round, say so.
    if (selector.stages.length === 0) {
      return { data: [], error: `unknown round key '${args.roundKey}' — no fixture selector` }
    }
    q = q.in('stage', selector.stages)
  }

  const { data, error } = await q.order('match_date', { ascending: true })
  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as T[], error: null }
}

/**
 * The round keys a pool actually has, in competition order.
 *
 * `nextRoundKey` resolves the successor against real rows rather than a static
 * map, so this is what feeds it.
 */
export async function fetchPoolRoundKeys(
  supabase: SupabaseClient,
  poolId: string
): Promise<{ keys: string[]; error: string | null }> {
  const { data, error } = await supabase
    .from('pool_round_states')
    .select('round_key')
    .eq('pool_id', poolId)
  if (error) return { keys: [], error: error.message }
  return { keys: (data ?? []).map((r) => (r as { round_key: string }).round_key), error: null }
}
