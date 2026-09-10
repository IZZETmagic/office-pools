import { NextRequest, NextResponse } from 'next/server'

import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { withPerfLogging } from '@/lib/api-perf'
import { buildOpponentDossier } from '@/lib/scouting/opponent'
import { readCrowdMajority, readOpponentPicks } from '@/lib/scouting/readOpponent'

// =============================================================
// /api/pools/:pool_id/entries/:entry_id/dossier — the opponent scout report
// =============================================================
// How one member of a pool picks, built entirely from picks that have already
// been revealed. No provider call sits behind any figure here.
//
// ## ⚠⚠ IT READS WITH THE ADMIN CLIENT, SO IT RE-IMPLEMENTS THE RLS IT BYPASSES
//
// This is the Last Man Standing lesson and the `fixture-picks` route's central
// warning, and it applies with more force here because the subject of this read
// is ANOTHER MEMBER. Three guards, all of which must hold:
//
//   1. THE CALLER IS IN THIS POOL. Resolved from `pool_members` on the caller's
//      own `user_id` before anything else is read.
//   2. THE SUBJECT IS IN THIS POOL. An entry id is a uuid the caller could have
//      obtained anywhere; without this, `/pools/<my pool>/entries/<a stranger's
//      entry>/dossier` would return a stranger's season.
//   3. ONLY REVEALED PICKS ARE COUNTED. Enforced inside `readOpponentPicks`
//      against `league_matchweeks.lock_at`, not here — one owner for the seal.
//
// Remove any one and nothing fails: the route returns a complete, plausible
// dossier about somebody the caller is not entitled to read.
//
// ## ⚠ IT IS NOT HOW YOU LEARN WHO YOUR OPPONENT IS
//
// A Showdown draw is sealed (migrations 116–118) and this route does not open
// it. The caller names the entry; the route never answers "who am I playing".
// The Duels surface decides when a name is visible — `opponentVisible` — and
// only then does the phone have an entry id to ask about.
//
// ## ⚠ THE CROWD FIGURE IS PLATFORM-WIDE AND THIS ROUTE CANNOT MAKE IT OTHERWISE
//
// `league_crowd_majority` (142) takes no pool argument, deliberately. A
// pool-scoped crowd stat leaks the pool's own picks through an aggregate.
//
// ## Cost
//
// Two bounded reads for the picks and one set-based RPC for the crowd, all
// keyed on one entry. Nothing here is per-fixture and nothing fans out.
// =============================================================

export const dynamic = 'force-dynamic'

async function handler(
  _req: NextRequest,
  { params }: { params: Promise<{ pool_id: string; entry_id: string }> },
) {
  const { pool_id, entry_id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { userData } = auth.data

  const admin = createAdminClient()

  // ---- guard 1: the caller is in this pool --------------------------------
  const { data: me, error: meErr } = await admin
    .from('pool_members')
    .select('member_id')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .maybeSingle()

  // ⚠ THE ERROR IS READ RATHER THAN DISCARDED. `const { data } = await …` on a
  // 400 yields null, which lands in the same branch as "not a member" — a
  // membership check that fails open on a schema change is not a check.
  if (meErr) {
    return NextResponse.json({ error: 'Could not verify membership' }, { status: 500 })
  }
  if (!me) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // ---- guard 2: the subject is in this pool -------------------------------
  const { data: subject, error: subjErr } = await admin
    .from('pool_entries')
    .select('entry_id, entry_name, retired_at, user_id, users(user_id, full_name, username)')
    .eq('entry_id', entry_id)
    .eq('pool_id', pool_id)
    .maybeSingle()

  if (subjErr) {
    return NextResponse.json({ error: 'Could not read entry' }, { status: 500 })
  }
  // ⚠ 404, NOT 403. A 403 confirms the entry exists somewhere, which is itself
  // an answer about a pool the caller is not in.
  if (!subject) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // ---- the dossier ---------------------------------------------------------
  let picks
  try {
    picks = await readOpponentPicks(admin, entry_id)
  } catch (e) {
    console.error('[dossier] read failed for', entry_id, '—', (e as Error).message)
    return NextResponse.json({ error: 'Could not read picks' }, { status: 500 })
  }

  // ⚠ THE DENOMINATOR FOR MISSED PICKS, AND IT MUST COVER THE SAME WINDOW THE
  // PICKS DO — fixtures in matchweeks that have LOCKED. Counting every fixture
  // in the season would report a member in matchweek six as having missed three
  // hundred games, and counting only played ones would miss a postponement.
  // Without it `reliability` is null, which reads as "we did not look" rather
  // than as "missed none" — the two must not collapse.
  let available: number | undefined
  try {
    available = await countAvailableFixtures(admin, pool_id)
  } catch (e) {
    console.error('[dossier] available count unavailable —', (e as Error).message)
    available = undefined
  }

  // ⚠ THE CROWD IS BEST-EFFORT AND ITS FAILURE IS NOT THE DOSSIER'S. Migration
  // 142 must be applied before this deploys; if it has not been, the contrarian
  // section is absent and every other section still renders. A dossier that
  // 500s because one of its nine cards could not be built is worse than one
  // that arrives with eight.
  let crowdMajority
  try {
    crowdMajority = await readCrowdMajority(admin, picks.map((p) => p.fixtureId))
  } catch (e) {
    console.error('[dossier] crowd unavailable —', (e as Error).message)
    crowdMajority = undefined
  }

  const dossier = buildOpponentDossier(picks, { crowdMajority, available })

  /**
   * The pool and the standing behind the report — enough for a header that says
   * WHOSE season this is and WHERE it is being played.
   *
   * ⚠ BEST-EFFORT, LIKE THE CROWD. A dossier that 500s because its header could
   * not be built is worse than one that arrives without a crest on it.
   */
  const context = await readDossierContext(admin, pool_id, entry_id)

  const subjectUser = (subject as unknown as {
    users: { user_id: string; full_name: string | null; username: string | null } | null
  }).users

  return NextResponse.json({
    entry_id,
    entry_name: subject.entry_name,
    /** ⚠ The USER id, not the entry id — the avatar gradient is keyed on the
     *  person, so that a member is the same colour here as in Banter. */
    user_id: subjectUser?.user_id ?? null,
    full_name: subjectUser?.full_name ?? subjectUser?.username ?? null,
    ...context,
    /**
     * ⚠ THE SAME OBJECT EITHER WAY — the self-scout is not a second engine, it
     * is this one pointed inward. Only the copy changes ("You predict" rather
     * than "They predict"), which is why the mirror costs nothing to ship.
     *
     * ⚠ AND THE REVEAL FILTER STILL APPLIES TO YOUR OWN PICKS. A member reading
     * their own dossier over live picks would see different numbers to the ones
     * their opponent sees, and the two would never reconcile.
     */
    is_self: subject.user_id === userData.user_id,
    dossier,
  })
}

/**
 * The pool, the competition, and where this entry stands in it.
 *
 * ## ⚠⚠ THE RANK IS WITHHELD IN LAST MAN STANDING, AND THAT IS NOT COSMETIC
 *
 * `league_entry_totals.final_rank` is written for every league pool, but in an
 * LMS pool it is entry-id order rather than a standing — there is no such thing
 * as second place in a survival pool, only in and out. Rendering it would put a
 * confident, meaningless "4th" on a member's own header. The mode gate lives
 * here, at the source, rather than in the component, so no future surface can
 * read the column and reach a different conclusion about it.
 */
async function readDossierContext(
  admin: ReturnType<typeof createAdminClient>,
  poolId: string,
  entryId: string,
) {
  try {
    const { data: pool } = await admin
      .from('pools')
      .select('pool_id, name, league_mode, league_season_id')
      .eq('pool_id', poolId)
      .maybeSingle()

    let competition: { name: string; season: string } | null = null
    if (pool?.league_season_id) {
      const { data: season } = await admin
        .from('league_seasons')
        .select('competition_name, season_label')
        .eq('season_id', pool.league_season_id)
        .maybeSingle()
      if (season) {
        competition = { name: season.competition_name, season: season.season_label }
      }
    }

    const { data: totals } = await admin
      .from('league_entry_totals')
      .select('total_points, final_rank')
      .eq('entry_id', entryId)
      .maybeSingle()

    // ⚠⚠ SEE THE HEADER. Not a display preference.
    const rankIsMeaningful = pool?.league_mode !== 'last_man_standing'

    return {
      pool: pool ? { pool_id: pool.pool_id, name: pool.name, league_mode: pool.league_mode } : null,
      competition,
      standing: totals
        ? {
            total_points: totals.total_points,
            rank: rankIsMeaningful ? totals.final_rank : null,
          }
        : null,
    }
  } catch (e) {
    console.error('[dossier] context unavailable —', (e as Error).message)
    return { pool: null, competition: null, standing: null }
  }
}

/**
 * Fixtures in this pool's season whose matchweek has already locked.
 *
 * ⚠ THE POOL'S SEASON, NOT THE ENTRY'S PICKS. Deriving it from the picks would
 * make the denominator move with the numerator — somebody who picked nothing
 * would have missed nothing, which is the one member this number exists to
 * describe.
 */
async function countAvailableFixtures(
  admin: ReturnType<typeof createAdminClient>,
  poolId: string,
): Promise<number | undefined> {
  const { data: pool, error: poolErr } = await admin
    .from('pools')
    .select('league_season_id')
    .eq('pool_id', poolId)
    .maybeSingle()

  if (poolErr) throw new Error(poolErr.message)
  // A pool with no season is a World Cup pool; it has no league fixtures and
  // `reliability` should stay null rather than read zero.
  if (!pool?.league_season_id) return undefined

  const { count, error } = await admin
    .from('league_fixtures')
    .select('fixture_id, league_matchweeks!inner(lock_at)', { count: 'exact', head: true })
    .eq('season_id', pool.league_season_id)
    .not('league_matchweeks.lock_at', 'is', null)
    .lte('league_matchweeks.lock_at', new Date().toISOString())

  if (error) throw new Error(error.message)
  return count ?? undefined
}

export const GET = withPerfLogging('/api/pools/[pool_id]/entries/[entry_id]/dossier', handler)
