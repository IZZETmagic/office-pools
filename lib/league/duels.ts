// =============================================================
// SHOWDOWN — keeping the fixture list in step with the pool
// =============================================================
// The schedule is a published round-robin (migration 083), which means it has to
// be regenerated whenever the set of entries changes: someone joins, someone
// leaves, someone stops participating. A fixture list that still names a member
// who left is worse than no fixture list.
//
// One helper, called from every door, because the alternative is four call sites
// that each remember three-quarters of the rule. The generator itself is in SQL
// and never rewrites a settled duel, so calling this more often than necessary
// is harmless — which is exactly what you want from something wired into four
// unrelated routes.
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { duelResult } from './duelPoints'

export type ScheduleResult = {
  written: number
  skipped: string | null
  error: string | null
}

/**
 * Rebuild the unplayed remainder of a Showdown pool's fixture list.
 *
 * A no-op for every other mode — the SQL returns `not a showdown pool` — so
 * callers do not need to know what kind of pool they are looking at.
 */
export async function regenerateDuelSchedule(
  admin: SupabaseClient,
  poolId: string,
): Promise<ScheduleResult> {
  const { data, error } = await admin.rpc('league_generate_duel_schedule', { p_pool_id: poolId })
  if (error) return { written: 0, skipped: null, error: error.message }
  const r = (data ?? {}) as { written?: number; skipped?: string }
  return { written: r.written ?? 0, skipped: r.skipped ?? null, error: null }
}

export type DuelRow = {
  duel_id: string
  matchweek_number: number
  entry_a: string
  entry_b: string | null
  accuracy_a: number | null
  accuracy_b: number | null
  points_a: number | null
  points_b: number | null
  settled_at: string | null
}

/**
 * Every duel in a pool — the fixture list and the results are the same rows.
 *
 * ⚠ PAGED, AND IT HAS TO BE. A round-robin draws `ceil(n/2)` duels a matchweek
 * across 38 matchweeks, so the row count is `ceil(n/2) × 38` and crosses
 * PostgREST's 1,000-row cap at **53 members**. The World Cup's largest pool had
 * 192 entries, so this is not a hypothetical size.
 *
 * The cap does not error. It returns exactly 1,000 rows with `error: null`, and
 * every consumer downstream renders a confident wrong answer: the season table
 * loses whole matchweeks, `headToHead` under-counts a rivalry, and the movement
 * arrows describe a table nobody is looking at. Same failure as the email
 * segment that silently resolved to 146 recipients of 3,958.
 *
 * ⚠ The order matters to the page, not only to the paging. `range()` without an
 * `order()` has no defined row order, so a second page could repeat rows from
 * the first. `matchweek_number` alone is not unique across a pool — several
 * duels share one — so `duel_id` breaks the tie and makes the sequence total.
 */
export async function readPoolDuels(
  supabase: SupabaseClient,
  poolId: string,
): Promise<{ duels: DuelRow[]; error: string | null }> {
  const PAGE = 1000
  const duels: DuelRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('league_duels')
      .select('duel_id, matchweek_number, entry_a, entry_b, accuracy_a, accuracy_b, points_a, points_b, settled_at')
      .eq('pool_id', poolId)
      .order('matchweek_number', { ascending: true })
      .order('duel_id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) return { duels: [], error: error.message }
    const page = (data ?? []) as DuelRow[]
    duels.push(...page)
    // A short page is the last page. A full one might not be, so ask again —
    // an exact-1,000 result is the shape that used to mean "truncated".
    if (page.length < PAGE) break
  }
  return { duels, error: null }
}

/**
 * Lifetime head-to-head between two entries, from the settled duels.
 *
 * ⚠ The concept's SECOND tiebreak — lifetime H2H between tied players — is
 * deliberately NOT wired into `league_finalize_ranks`. It is pairwise, so it
 * cannot be expressed as a sort key over a single row, and approximating it
 * would quietly pick a different champion. This surfaces the record for display;
 * the tiebreak itself is recorded as owed.
 */
export function headToHead(duels: DuelRow[], entryA: string, entryB: string) {
  let won = 0, drawn = 0, lost = 0
  for (const d of duels) {
    if (!d.settled_at || !d.entry_b) continue
    const isPair =
      (d.entry_a === entryA && d.entry_b === entryB) ||
      (d.entry_a === entryB && d.entry_b === entryA)
    if (!isPair) continue
    // ⚠ `duelResult`, NEVER a literal. This read `mine === 3` / `mine === 1`
    // until 2026-08-31 — the pre-121 scale — so from the first settled duel it
    // would have scored every single meeting as a LOSS, silently, and the
    // head-to-head record on the Tale of the Tape would have read 0-0-N for
    // everybody. Found while checking what the recap page could show.
    const mine = d.entry_a === entryA ? d.points_a : d.points_b
    const r = duelResult(mine)
    if (r === 'won') won++
    else if (r === 'tied') drawn++
    else lost++
  }
  return { won, drawn, lost }
}

/** What `league_matchweek_points` (migration 130) returns, before shaping. */
type MatchweekPointsPayload = {
  totals?: Record<string, number> | null
  /** ⚠ The inner key is TEXT — JSON object keys always are. */
  per_fixture?: Record<string, Record<string, number>> | null
}

/**
 * Live points per entry for one matchweek — the running duel score.
 *
 * ⚠ NOT `league_duels.accuracy_a/_b`. Those are written by `league_score_duels`
 * when the matchweek settles, so through the weekend — the one time anybody is
 * watching — they are NULL. Reading them is why the duel card showed two names
 * and no numbers while the games were being played.
 *
 * ⚠ AGGREGATED IN SQL — migration 130. This used to select the raw score rows
 * and sum them in a `for` loop here, which was two problems wearing one coat:
 *
 *   1. It broke the scoring architecture rule (settled 2026-07-29, *"aggregates
 *      belong in SQL"*) in the file next door to migration 124, whose header
 *      states that rule.
 *   2. The row count is entries × fixtures, so it crossed PostgREST's 1,000-row
 *      cap at **100 members** — and over the cap PostgREST returns exactly 1,000
 *      rows with `error: null`, so the duel card would have rendered a
 *      plausible, wrong scoreline rather than failing. The World Cup's largest
 *      pool had 192 entries.
 *
 * The RPC returns ONE row whatever the pool size, so neither can recur. The
 * per-fixture breakdown comes back with it rather than as a second read — the
 * team sheet needs a number per entry per fixture and that is real data, not an
 * aggregate anyone can avoid; what it does not need is those numbers as N rows.
 *
 * ⚠ TAKES THE ADMIN CLIENT, AND MUST. `league_match_scores` is DENY-ALL — RLS
 * on, zero policies — and migration 050 lists it as one of exactly four engine
 * tables deliberately closed to clients (with `league_entry_totals`,
 * `league_fixture_state`, `league_score_events`). A user-scoped read returns
 * ZERO ROWS AND NO ERROR, so the duel card renders 0 – 0 and looks like a pool
 * where nobody has scored. Found exactly that way. 130 keeps the same posture:
 * `service_role` holds EXECUTE and `authenticated` does not, so calling this
 * with a user client now fails LOUDLY instead of returning an empty map.
 *
 * Safe because this is a server component that has already established the
 * viewer is a member of the pool, and the query is scoped to that pool.
 */
export async function readMatchweekPoints(
  admin: SupabaseClient,
  poolId: string,
  matchweekNumber: number,
): Promise<{
  points: Map<string, number>
  /** entry_id → fixture_number → points, for the fixture-by-fixture breakdown. */
  perFixture: Map<string, Map<number, number>>
  error: string | null
}> {
  const { data, error } = await admin.rpc('league_matchweek_points', {
    p_pool_id: poolId,
    p_matchweek_number: matchweekNumber,
  })
  if (error) {
    return { points: new Map(), perFixture: new Map(), error: error.message }
  }

  const payload = (data ?? {}) as MatchweekPointsPayload
  const points = new Map<string, number>(Object.entries(payload.totals ?? {}))
  const perFixture = new Map<string, Map<number, number>>()
  for (const [entryId, byFixture] of Object.entries(payload.per_fixture ?? {})) {
    // ⚠ `Number(fx)`, and it is load-bearing. JSON object keys are text, so the
    // fixture number arrives as `"3"`. A Map keyed by `"3"` reads identically
    // to one keyed by `3` in a debugger and misses every numeric lookup — the
    // team sheet would render every fixture as blank with nothing in a log.
    perFixture.set(entryId, new Map(Object.entries(byFixture ?? {}).map(([fx, pts]) => [Number(fx), pts])))
  }
  return { points, perFixture, error: null }
}

export type EntryTotals = {
  totalPoints: number
  rank: number | null
  duelPoints: number
  correct: number
  /** Last Man Standing. Zero for every other mode. */
  roundsWon: number
}

/**
 * Season totals per entry — points, rank, duel points, rounds won.
 *
 * Shared by Showdown and Last Man Standing: one row per entry carries both
 * modes' currencies, so both read it here rather than each writing its own
 * query against a deny-all table and getting the client wrong separately.
 *
 * ⚠ ADMIN CLIENT, for the same reason as `readMatchweekPoints`:
 * `league_entry_totals` is one of migration 050's four DENY-ALL engine tables,
 * so a user-scoped read returns zero rows and no error.
 *
 * That is not hypothetical. The pool page read this table with the user client
 * for `duel_points`, so `DuelsTab` has been receiving an empty map and falling
 * back to recomputing `w*3+d` itself — which is exactly the divergence
 * `ShowdownCardFacts.duelPoints` warns about, sitting one settled matchweek
 * away from two screens disagreeing about the same number.
 */
export async function readEntryTotals(
  admin: SupabaseClient,
  poolId: string,
): Promise<{ totals: Map<string, EntryTotals>; error: string | null }> {
  const { data, error } = await admin
    .from('league_entry_totals')
    .select('entry_id, total_points, final_rank, duel_points, correct_count, rounds_won')
    .eq('pool_id', poolId)
  if (error) return { totals: new Map(), error: error.message }

  const totals = new Map<string, EntryTotals>()
  for (const r of (data ?? []) as Array<{
    entry_id: string; total_points: number | null; final_rank: number | null
    duel_points: number | null; correct_count: number | null; rounds_won: number | null
  }>) {
    totals.set(r.entry_id, {
      totalPoints: r.total_points ?? 0,
      rank: r.final_rank,
      duelPoints: r.duel_points ?? 0,
      correct: r.correct_count ?? 0,
      roundsWon: r.rounds_won ?? 0,
    })
  }
  return { totals, error: null }
}
