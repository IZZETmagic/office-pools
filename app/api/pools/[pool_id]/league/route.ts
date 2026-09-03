import { NextResponse } from 'next/server'
import { matchweekNumber } from '@/lib/competitionRounds'

import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { readLeaguePoolView, readLeaguePredictions, deriveRoundSubmissions } from '@/lib/league/read'
import { readEntryTotals } from '@/lib/league/duels'
import { getLeagueSeasonCached } from '@/lib/league/season'

// =============================================================
// /api/pools/:pool_id/league — ONE READ, TWO SURFACES
// =============================================================
// Decision 12, 2026-09-02. This is the contract the React Native league build
// is gated on, and it is not an optimisation with a nice-to-have second
// consumer — **without it there is no RN league build at all.**
//
// ## Why RN cannot simply do what it does everywhere else
//
// Mobile is direct-to-PostgREST: ~110 `.from()` table reads against 14 API
// routes, every one of which is a write or a notification. That works for the
// World Cup and **cannot** work for a league, because migration 050 closed four
// tables to clients on purpose — `league_match_scores`, `league_entry_totals`,
// `league_fixture_state`, `league_score_events`. RLS on, zero policies.
//
// The failure is the dangerous kind. RLS with no policy is not a 403: PostgREST
// returns `[]` with `error: null`, so the read "succeeds", the map is empty and
// the screen renders a confident zero. `denyAllTables.guard.test.ts` exists
// because that bug was found four times in one afternoon on 2026-08-30 — on the
// WEB, where the pattern is better understood than it would be in a new RN file.
//
// The web does not read those tables the way mobile would either: the pool page
// is a `force-dynamic` **server component** holding the service-role client,
// having already established the viewer is a member. RN has no server component
// and must never hold that key. So there is no port of the web screens — there
// is this, a server surface both call.
//
// ## What it returns, and what it deliberately does not
//
// The season half comes from `getLeagueSeasonCached` (see `lib/league/season.ts`)
// — one entry shared by every pool playing that season, invalidated by the
// fixture sync off its own `changed` array. Before this, `readLeaguePoolView`
// made three uncached reads per viewer per page load, 175 kB of fixtures among
// them, whichever tab was open.
//
// ⚠ IT DOES NOT CARRY THE LIVE HALF, AND THAT IS THE DESIGN. Score, status and
// minute reach an open page over the `pool:{id}:leaderboard` broadcast (migration
// 125), applied straight from the payload with no fetch. This route is what a
// screen needs to LOAD. A client that polls it for live scores has misunderstood
// it and will pay 175 kB a goal for the privilege.
//
// ⚠ NOR IS IT A REPLACEMENT FOR `/duel-live`. That returns ten fixtures and a
// points map for one matchweek; this returns a season. They are different
// budgets for different jobs.
//
// ## Auth
//
// Membership is proven with the CALLER's client, then the admin client does the
// engine-table reads — the same order `/duel-live` and `/live` use. Never the
// reverse, and never the admin client for the membership test itself.
// =============================================================

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ pool_id: string }> },
) {
  const { pool_id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const { data: membership } = await supabase
    .from('pool_members')
    .select('member_id')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .maybeSingle()
  if (!membership) {
    return NextResponse.json({ error: 'Not a member of this pool' }, { status: 403 })
  }

  const admin = createAdminClient()

  const { data: pool } = await admin
    .from('pools')
    .select('pool_id, pool_name, league_season_id, tournament_id, league_mode, league_depth, league_table_lock_at')
    .eq('pool_id', pool_id)
    .maybeSingle()
  if (!pool?.league_season_id) {
    return NextResponse.json({ error: 'Not a league pool' }, { status: 404 })
  }

  // ⚠ THE CACHED SEASON IS PASSED IN, not fetched inside `readLeaguePoolView`.
  // That helper is imported by client components, so it cannot import
  // `next/cache` itself — the caching decision belongs to server callers, which
  // is what this is. Omit `season` and it silently falls back to three uncached
  // reads per request, which is the thing this whole contract exists to stop.
  let season
  try {
    season = await getLeagueSeasonCached(pool.league_season_id)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 })
  }

  const { view, error: viewErr } = await readLeaguePoolView(supabase, {
    poolId: pool_id,
    seasonId: pool.league_season_id,
    tournamentId: pool.tournament_id as string,
    season,
  })
  // ⚠ Surfaced, never swallowed. Every number below is derived from this, so a
  // failed read that returned 200 would render an empty season as a real one —
  // the discarded-PostgREST-error pattern this codebase has paid for repeatedly.
  if (viewErr || !view) {
    return NextResponse.json({ error: viewErr ?? 'league view unavailable' }, { status: 502 })
  }

  // The viewer's own entries in this pool. Scoped to the caller — this is the
  // half that is NOT shared and must never be cached.
  const { data: entries } = await admin
    .from('pool_entries')
    .select('entry_id, entry_name, member_id')
    .eq('member_id', membership.member_id)
    .is('retired_at', null)
  const entryIds = (entries ?? []).map((e) => e.entry_id as string)

  // ⚠ ADMIN, AND REQUIRED. `league_entry_totals` is one of migration 050's four
  // deny-all tables; a user-scoped read returns zero rows and no error, which is
  // exactly how a duel card once showed 0–0 for a matchweek everybody scored in.
  const { totals, error: totalsErr } = await readEntryTotals(admin, pool_id)
  if (totalsErr) {
    return NextResponse.json({ error: `entry totals: ${totalsErr}` }, { status: 502 })
  }

  // The viewer's picks per entry, and whether each matchweek counts as submitted
  // — derived from the picks rather than from a flag, which is what the league
  // already does and what *Submitting an entry is a step that shouldn't exist*
  // is generalising to the other two modes.
  //
  // ⚠ BOTH KINDS OF PICK. `readLeaguePredictions` returns scorelines and
  // Results-depth `outcomes` SEPARATELY on purpose — a Results pick has no
  // scoreline, and folding it into `ExistingPrediction` would mean punching a
  // nullable hole in a type the World Cup shares. `deriveRoundSubmissions` has
  // to see both or a Results pool reads as 0-of-10 picked for ever.
  //
  // One round trip per entry, and almost always exactly one: a member has a
  // single entry in every league pool the product can currently create.
  const picks: Array<{
    entry_id: string
    predictions: Awaited<ReturnType<typeof readLeaguePredictions>>['predictions']
    outcomes: Record<string, 'home' | 'draw' | 'away'>
    submissions: ReturnType<typeof deriveRoundSubmissions>
  }> = []
  for (const entryId of entryIds) {
    const { predictions, outcomes, error: predErr } = await readLeaguePredictions(admin, entryId)
    if (predErr) {
      return NextResponse.json({ error: `league predictions: ${predErr}` }, { status: 502 })
    }
    picks.push({
      entry_id: entryId,
      predictions,
      // A Map does not survive JSON. Sent as an object, which is also the shape
      // the client rebuilds a Map from.
      outcomes: Object.fromEntries(outcomes),
      submissions: deriveRoundSubmissions(entryId, view.matches, predictions, outcomes),
    })
  }

  /**
   * What a fixture pays, READ from the same columns the engine COALESCEs
   * against so this can never describe scoring nobody is using.
   *
   * ⚠⚠ AT RESULTS DEPTH A CORRECT TAP IS CHARGED AT `group_exact_score` — the
   * pool's TOP price — not at `group_correct_result`. Migration 066: *"getting
   * the outcome right is the most that can be achieved, so the top price is the
   * semantically right one to charge it at."* The World Cup scoring screen
   * showed that same number under "Exact Score" and then "Correct Result — 50"
   * beneath it, so a member who called Arsenal to win read that their pick was
   * worth 50. It is worth 100. Shipping the raw three and letting ONE place
   * decide what they mean is how that stays fixed.
   *
   * Defaults mirror 066 exactly: 100 / 75 / 50.
   */
  const { data: settings } = await admin
    .from('pool_settings')
    .select('group_exact_score, group_correct_difference, group_correct_result')
    .eq('pool_id', pool_id)
    .maybeSingle()

  return NextResponse.json({
    pool: {
      pool_id: pool.pool_id,
      pool_name: pool.pool_name,
      league_mode: pool.league_mode,
      prices: {
        exact: settings?.group_exact_score ?? 100,
        goalDifference: settings?.group_correct_difference ?? 75,
        result: settings?.group_correct_result ?? 50,
      },
      // ⚠ `?? null`, and the polarity matters. A pool created before migration
      // 077 has NULL depth, the engine reads NULL as Scores (066, deliberately),
      // and three copy sites once read it as Results — telling members they were
      // playing one game while being scored at another. Ship the raw value; let
      // one place decide what it means.
      league_depth: pool.league_depth ?? null,
      league_table_lock_at: pool.league_table_lock_at ?? null,
    },
    season: {
      teams: view.teams,
      matches: view.matches,
      /**
       * When each matchweek CLOSES for picks, and when its football starts.
       *
       * ⚠ SHIPPED NARROW, ON PURPOSE. `view.roundStates` carries a `state`
       * string too, and sending it would invite the client to read it — but in
       * this vocabulary `'locked'` means BOTH *"its deadline passed"* and
       * *"its turn has not come"* (read.ts:508). A screen reading the string
       * would call matchweek 30 revealed in August. The reveal question is a
       * CLOCK question, which is exactly how `computeReveal` answers it, so
       * only the clock crosses the wire.
       *
       * ⚠ `lock_at` is NOT the first kickoff. Migration 101 closes picks an
       * HOUR before the first game. Deriving one from the other is a live bug
       * on the web today (`LeagueScoringRulesTab` still says picks close "at
       * the moment the first match starts"), so both are sent rather than
       * computed.
       */
      matchweeks: view.roundStates.map((r) => ({
        number: matchweekNumber(r.round_key),
        lock_at: r.deadline,
        first_kickoff_at: r.opened_at,
      })).filter((m): m is { number: number; lock_at: string | null; first_kickoff_at: string | null } =>
        m.number !== null,
      ),
      matchweekCount: view.matchweekCount,
      openMatchweekNumber: view.openMatchweekNumber,
      inPlayMatchweekNumber: view.inPlayMatchweekNumber,
      sealedMatchweekNumber: view.sealedMatchweekNumber,
      sealedOpensAfterMatchweek: view.sealedOpensAfterMatchweek,
    },
    you: {
      entries: (entries ?? []).map((e) => {
        const mine = picks.find((p) => p.entry_id === e.entry_id)
        return {
          entry_id: e.entry_id,
          entry_name: e.entry_name,
          // The STORED totals, never recomputed here. One owner per number —
          // the engine wrote them, this hands them over unchanged.
          totals: totals.get(e.entry_id as string) ?? null,
          predictions: mine?.predictions ?? [],
          outcomes: mine?.outcomes ?? {},
          submissions: mine?.submissions ?? [],
        }
      }),
    },
  })
}
