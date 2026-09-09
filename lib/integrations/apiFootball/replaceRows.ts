import type { SupabaseClient } from '@supabase/supabase-js'

// =============================================================
// Retrying a replace-all write
// =============================================================
// ⚠⚠ THIS IS ONLY SAFE BECAUSE OF MIGRATION 140. Every `replace_match_*`
// function deletes and re-inserts inside one plpgsql body, which is one
// transaction — so a call either happened entirely or not at all, and calling
// it twice with the same rows lands in exactly the same state as calling it
// once. Retrying the OLD delete-then-insert pair would have been reckless: a
// second attempt after a half-completed first is how you turn a transient blip
// into a doubled timeline. Atomicity is what buys the retry, not the other way
// round.
//
// WHY IT EXISTS: on 2026-09-09 the backfills lost a write to
// `TypeError: fetch failed` on FOUR consecutive runs — a different fixture each
// time, never the same one twice. Each failure cost nothing thanks to 140, but
// each also meant a fixture silently kept yesterday's rows until somebody
// re-ran the script. In the live sync nobody re-runs anything, and the
// completion tick fires exactly once.
//
// ⚠ A DATABASE ERROR IS NEVER RETRIED, AND THE DIFFERENCE IS THE `code`.
// Measured against production on 2026-09-09:
//
//   constraint violation  ->  { code: '23514', message: 'new row ... violates' }
//   unreachable host      ->  { code: '',      message: 'TypeError: fetch failed' }
//
// PostgREST attaches a SQLSTATE to anything Postgres actually answered. An
// empty code means the request never got there. Retrying a 23514 spends three
// round trips to be told the same thing three times, and hides the real fault
// behind a delay.
// =============================================================

/** Total attempts, including the first. Two retries at 250ms and 500ms. */
export const REPLACE_ATTEMPTS = 3

type WriteError = { message: string; code?: string | null } | null

/**
 * Did this error come from Postgres, or from the wire before it?
 *
 * ⚠ THE ABSENCE OF A CODE IS THE SIGNAL, not the presence of a known string.
 * Matching on `'fetch failed'` would miss a DNS failure, a TLS reset and a
 * pooler timeout, all of which are equally worth retrying and none of which say
 * that.
 */
export function isTransportError(error: WriteError): boolean {
  if (!error) return false
  return !error.code
}

/**
 * A per-run stop on retrying.
 *
 * ⚠ WITHOUT THIS, "SUPABASE IS DOWN" BECOMES "THE TICK TIMES OUT". Retrying
 * costs 750ms of backoff per failing write; forty failing writes is thirty
 * seconds added to a sync that runs every minute, and a tick that overruns is a
 * worse outcome than the writes failing fast and being reported. Once the run
 * has seen `max` transport failures it stops hoping and makes one attempt each.
 */
export type RetryBudget = { transportFailures: number; max: number }

export function createRetryBudget(max = 5): RetryBudget {
  return { transportFailures: 0, max }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Call one of migration 140/141's replace functions, retrying transport faults.
 *
 * Returns the error rather than throwing, because every caller already has an
 * error channel it wants this to feed — `push()` in the sync, `failures` in the
 * scripts — and each attributes the failure to its own fixture.
 */
export async function replaceRows(
  admin: SupabaseClient,
  fn:
    | 'replace_match_events'
    | 'replace_match_lineups'
    | 'replace_match_team_stats'
    | 'replace_match_player_stats',
  fixtureId: string,
  rows: unknown[],
  budget?: RetryBudget,
  sleep: (ms: number) => Promise<unknown> = wait,
): Promise<{ error: WriteError; attempts: number }> {
  let last: WriteError = null

  for (let attempt = 1; attempt <= REPLACE_ATTEMPTS; attempt++) {
    const { error } = await admin.rpc(fn, { p_fixture_id: fixtureId, p_rows: rows })
    if (!error) return { error: null, attempts: attempt }
    last = error as WriteError

    // Postgres answered and said no. It will say no again.
    if (!isTransportError(last)) return { error: last, attempts: attempt }

    if (budget) {
      budget.transportFailures++
      if (budget.transportFailures > budget.max) return { error: last, attempts: attempt }
    }
    if (attempt < REPLACE_ATTEMPTS) await sleep(250 * attempt)
  }

  return { error: last, attempts: REPLACE_ATTEMPTS }
}
