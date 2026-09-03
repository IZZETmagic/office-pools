import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { invalidatePoolCache } from '@/lib/poolData'
import { saveTablePrediction, readTablePrediction, readTableBreakdown } from '@/lib/league/table'
import { summariseTable } from '@/lib/league/tableSummary'
import type { SupabaseClient } from '@supabase/supabase-js'

// =============================================================
// /api/pools/[pool_id]/table-prediction
//
// Table mode's one write. GET returns the entry's current ordering and, once
// there is a table to compare against, the per-club breakdown.
//
// The USER-scoped client is used throughout, deliberately: RLS on
// `league_table_predictions` is what stops a member reading a rival's
// prediction before the deadline, and reaching for the admin client here would
// step straight around it. The route's own membership check is about the POOL;
// RLS is about the row.
// =============================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pool_id: string }> },
) {
  const { pool_id } = await params
  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { supabase, userData } = auth.data

  const { searchParams } = new URL(request.url)
  const requestedEntry = searchParams.get('entryId')

  const { data: membership } = await supabase
    .from('pool_members')
    .select('member_id')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const entryId = requestedEntry ?? (await firstEntryId(supabase, membership.member_id))
  if (!entryId) return NextResponse.json({ error: 'No entry in this pool' }, { status: 404 })

  const [{ order, savedAt, error: orderErr }, { rows, error: rowsErr }, settings] =
    await Promise.all([
      readTablePrediction(supabase, entryId),
      readTableBreakdown(supabase, entryId),
      readTableSettings(supabase, pool_id),
    ])
  const error = orderErr ?? rowsErr
  if (error) return NextResponse.json({ error }, { status: 500 })
  if (!settings) return NextResponse.json({ error: 'Not a table pool' }, { status: 404 })

  // ⚠ ADDED FOR REACT NATIVE, and computed HERE rather than there. The web page
  // is a server component that reads the pool's prices and bands itself and
  // hands them to a component; RN has no such thing, and the two alternatives
  // were a second round of table reads from the phone or a second copy of the
  // band-bonus formula in `mobile/`. Both are worse than one answer computed
  // once — the same reason the leaderboard reads stored totals.
  //
  // Harmless to the web, which already has all of this and ignores the extra
  // fields.
  const summary = summariseTable(rows, settings.topN, settings.prices)

  return NextResponse.json({ entryId, order, savedAt, breakdown: rows, settings, summary })
}

/**
 * The pool's own prices and bands — what a hit is worth here, and which places
 * count as which band.
 *
 * ⚠ Bands come from the COMPETITION, never from 4 and 3. Those are Premier
 * League numbers, and a league that relegates one club would shade three. An
 * explicit pool setting still wins, exactly as it does in the engine; the
 * defaults below mirror the engine's own COALESCE (migrations 093/113), so the
 * screen and `league_score_table` cannot quote different prices.
 */
async function readTableSettings(supabase: SupabaseClient, poolId: string) {
  const { data: pool } = await supabase
    .from('pools')
    .select('league_season_id, league_mode, league_table_lock_at, league_table_profile')
    .eq('pool_id', poolId)
    .maybeSingle()
  if (!pool?.league_season_id || pool.league_mode !== 'table') return null

  const [settingsRes, bandsRes] = await Promise.all([
    supabase
      .from('league_pool_settings')
      // ⚠ One literal, not a concatenation — postgrest-js infers the row shape
      // from the string, and `'a, ' + 'b'` collapses it to GenericStringError.
      .select('table_top_n, table_relegation_n, table_exact_points, table_step_penalty, table_champion_bonus, table_top_four_bonus, table_relegation_bonus, table_perfect_top_four_bonus, table_europa_bonus, table_conference_bonus')
      .eq('pool_id', poolId)
      .maybeSingle(),
    supabase.rpc('league_default_bands', { p_season_id: pool.league_season_id }),
  ])
  if (bandsRes.error) console.error('[table-prediction] bands failed:', bandsRes.error)

  const s = settingsRes.data
  const bands = (bandsRes.data ?? {}) as {
    top_n?: number; relegation_n?: number
    europa_from?: number | null; europa_to?: number | null
    conference_from?: number | null; conference_to?: number | null
  }
  const lockAt = (pool.league_table_lock_at as string | null) ?? null

  return {
    // Sent so a screen can link to THIS competition's table rather than
    // whichever one Match Centre happens to open on.
    seasonId: pool.league_season_id as string,
    lockAt,
    isLocked: lockAt ? new Date(lockAt) <= new Date() : false,
    topN: s?.table_top_n ?? bands.top_n ?? 4,
    relegationN: s?.table_relegation_n ?? bands.relegation_n ?? 3,
    // Bounds, not a count — and null is a real answer: a competition without
    // Europa places must not shade a band it does not have.
    europaFrom: bands.europa_from ?? null,
    europaTo: bands.europa_to ?? null,
    conferenceFrom: bands.conference_from ?? null,
    conferenceTo: bands.conference_to ?? null,
    // 'headline_only' scores the bands alone, so a screen must not promise
    // per-place points this pool never awards.
    profile: pool.league_table_profile === 'headline_only' ? 'headline_only' : 'full_table',
    prices: {
      exactPoints: s?.table_exact_points ?? 100,
      stepPenalty: s?.table_step_penalty ?? 20,
      championBonus: s?.table_champion_bonus ?? 500,
      topFourBonus: s?.table_top_four_bonus ?? 100,
      relegationBonus: s?.table_relegation_bonus ?? 100,
      perfectTopFourBonus: s?.table_perfect_top_four_bonus ?? 250,
      europaBonus: s?.table_europa_bonus ?? 50,
      // Migration 113: half the Europa band, which is half the top band.
      conferenceBonus: s?.table_conference_bonus ?? 25,
    },
  }
}

export async function POST(
  request: NextRequest,
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
    .single()
  if (!membership) return NextResponse.json({ error: 'Not a member' }, { status: 403 })

  const body = await request.json()
  const { entryId, order } = body as { entryId?: string; order?: string[] }

  if (!Array.isArray(order) || order.length === 0) {
    return NextResponse.json({ error: 'An ordering is required.' }, { status: 400 })
  }

  const resolvedEntry = entryId ?? (await firstEntryId(supabase, membership.member_id))
  if (!resolvedEntry) return NextResponse.json({ error: 'No entry in this pool' }, { status: 404 })

  // The entry must belong to THIS member. RLS would refuse the write anyway,
  // but it refuses it by writing nothing — which this route reports as
  // `locked`, and "your deadline passed" is the wrong answer to "that is not
  // your entry".
  const { data: owned } = await supabase
    .from('pool_entries')
    .select('entry_id')
    .eq('entry_id', resolvedEntry)
    .eq('member_id', membership.member_id)
    .maybeSingle()
  if (!owned) return NextResponse.json({ error: 'That entry is not yours.' }, { status: 403 })

  // Guard the shape before writing. A Table pool is the only place this write
  // means anything, and the pool's mode is immutable, so this is a fixed
  // expectation rather than a guess.
  const { data: pool } = await supabase
    .from('pools')
    .select('league_mode, league_table_lock_at')
    .eq('pool_id', pool_id)
    .single()
  if (pool?.league_mode !== 'table') {
    return NextResponse.json(
      { error: 'This pool is not played by predicting the table.' },
      { status: 400 },
    )
  }

  const result = await saveTablePrediction(supabase, resolvedEntry, order)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })

  if (result.locked) {
    // 403 rather than 200-with-a-flag: nothing was saved, and a member who
    // dragged twenty clubs deserves to be told that plainly.
    return NextResponse.json(
      {
        error: 'The table prediction for this pool has closed.',
        lockedAt: pool?.league_table_lock_at ?? null,
        locked: true,
      },
      { status: 403 },
    )
  }

  // ⚠ RESCORE NOW, or the leaderboard keeps yesterday's answer.
  //
  // `league_entry_totals` is written by `league_score_table`, and until now the
  // only thing that called it was the fixtures sync — via
  // `league_after_standings_change`, when a fixture COMPLETES. That is the right
  // trigger for "the real table moved". It is not the only thing that changes a
  // score: reordering your own prediction changes it too.
  //
  // So between editing a table and the next fixture finishing — which before a
  // season starts can be days — the leaderboard showed a total computed from an
  // ordering the member had already replaced. Caught by Ryan reading 1,000 on
  // the leaderboard and 860 in the breakdown for the same entry: the breakdown
  // computes live and was right, the stored total was fourteen hours old.
  //
  // Pool-scoped and idempotent, so calling it per save is cheap — and a table
  // is edited in one short window before one deadline, not all season.
  //
  // ⚠ NEVER fails the save. The prediction is already committed and verified by
  // this point; a scoring hiccup must not tell the member their table did not
  // save. It is stale for one more tick instead, which is what it was before.
  //
  // Admin client on purpose: this is a system recomputation over the whole
  // pool's entries, not a read on the caller's behalf. The route's user-scoped
  // client stays user-scoped for everything that touches predictions.
  try {
    const { error: scoreErr } = await createAdminClient()
      .rpc('league_score_table', { p_pool_id: pool_id })
    if (scoreErr) console.error('[table-prediction] rescore failed:', scoreErr.message)
    // ⚠ AND EXPIRE THE POOL CACHE, or rescoring changes nothing anyone can see.
    //
    // The pool page is cached with a 45s TTL (lib/poolData.ts), so a
    // `router.refresh()` right after a save re-fetches and is handed the SAME
    // stale render. Measured: the database moved to 840 while the leaderboard
    // went on showing 920 through a refresh. The outbox consumer already does
    // this for exactly the same reason after a fixture is scored; a member
    // reordering their own table is the other thing that changes a total.
    invalidatePoolCache(pool_id)
  } catch (err) {
    console.error('[table-prediction] rescore threw:', err instanceof Error ? err.message : err)
  }

  return NextResponse.json({ saved: result.stored, savedAt: result.savedAt, entryId: resolvedEntry })
}

/**
 * Table mode's entry, when the caller did not name one. Oldest first, matching
 * how every other league surface picks a default entry for a member with more
 * than one.
 */
async function firstEntryId(
  supabase: SupabaseClient,
  memberId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('pool_entries')
    .select('entry_id')
    .eq('member_id', memberId)
    .is('retired_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return (data as { entry_id: string } | null)?.entry_id ?? null
}
