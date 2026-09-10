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
    .select('entry_id, entry_name, retired_at')
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

  const dossier = buildOpponentDossier(picks, { crowdMajority })

  return NextResponse.json({
    entry_id,
    entry_name: subject.entry_name,
    /** ⚠ The viewer's own dossier is the same object. The phone reads this to
     *  decide whether it is drawing a scout report or a mirror. */
    is_self: false,
    dossier,
  })
}

export const GET = withPerfLogging('/api/pools/[pool_id]/entries/[entry_id]/dossier', handler)
