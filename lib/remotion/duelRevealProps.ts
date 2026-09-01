// =============================================================
// WHAT A REVEAL RENDER IS ALLOWED TO DRAW
// =============================================================
// The recap's counterpart, and the dangerous one.
//
// ## ⚠ THE SEAL IS ENFORCED IN RLS, AND THIS PATH IS NOT
//
// Migration 116 hides a duel until its matchweek opens, via
// `league_duel_is_revealed()` in a row-level policy. RLS defends the
// AUTHENTICATED path only, and a server-side render reads with the
// SERVICE-ROLE client — which does not go through policies at all.
//
// So this module carries the seal by hand. Get it wrong and the product emits a
// shareable MP4 naming somebody's future opponent, weeks early, past a gate that
// looks like it is holding. `lib/league/poolCards.ts` had to solve exactly this
// and filters explicitly for the same reason.
//
// ⚠ THE GATE IS ASKED OF THE DATABASE, not reimplemented here. Deriving "is this
// matchweek open" a second time is how two answers start disagreeing — the
// mistake migration 103's header is about. We call the same function the policy
// calls.
//
// ## ⚠ NO RESULT IN THESE PROPS
//
// A reveal happens before anything is played. `accuracy_*` and `points_*` are
// null on the row and must not be defaulted to zero — that would render a duel
// both sides drew 0–0 rather than one not yet played.
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

import { duelResult } from '@/lib/league/duelPoints'

export type RevealPerson = {
  user_id: string
  full_name: string | null
  username: string | null
}

export type RevealSeason = {
  duelPoints: number
  rank: number | null
  won: number
  tied: number
  lost: number
}

export type RevealSide = { name: string; person: RevealPerson; season: RevealSeason }

/** Exactly the props `remotion/DuelReveal.tsx` takes. */
export type DuelRevealProps = {
  poolName: string
  matchweek: number
  you: RevealSide
  them: RevealSide | null
}

export type RevealRefusal =
  | 'not-a-member'
  | 'wrong-pool'
  | 'not-revealed'
  | 'already-settled'
  | 'not-your-duel'
  | 'missing-entry'

export type RevealResult =
  | { ok: true; props: DuelRevealProps; side: 'a' | 'b' }
  | { ok: false; reason: RevealRefusal }

type DuelRow = {
  duel_id: string
  pool_id: string
  matchweek_number: number
  entry_a: string
  entry_b: string | null
  settled_at: string | null
}

type SettledRow = {
  entry_a: string
  entry_b: string | null
  points_a: number | null
  points_b: number | null
}

/**
 * A side's season so far.
 *
 * ⚠ THE RECORD IS DERIVED. `league_entry_totals` carries `duel_points` and
 * `final_rank` but no W/T/L columns, so it is counted from settled duels via
 * `duelResult` — never by re-deciding what a win is worth.
 *
 * ⚠ Byes are skipped STRUCTURALLY, before the points are read. `DUEL_BYE`
 * equals `DUEL_TIE`, so counting one as a tie would inflate every record in an
 * odd-sized pool, where somebody sits out every week.
 */
export function tallySeason(
  entryId: string,
  settled: readonly SettledRow[],
  totals: { duel_points: number | null; final_rank: number | null } | null,
): RevealSeason {
  let won = 0
  let tied = 0
  let lost = 0
  for (const d of settled) {
    const isA = d.entry_a === entryId
    if (!isA && d.entry_b !== entryId) continue
    if (isA && d.entry_b === null) continue // a bye: no opponent, not a tie
    const r = duelResult((isA ? d.points_a : d.points_b) ?? null)
    if (r === 'won') won++
    else if (r === 'tied') tied++
    else if (r === 'lost') lost++
  }
  return { duelPoints: totals?.duel_points ?? 0, rank: totals?.final_rank ?? null, won, tied, lost }
}

export async function buildDuelRevealProps(
  admin: SupabaseClient,
  { poolId, duelId, viewerUserId }: { poolId: string; duelId: string; viewerUserId: string },
): Promise<RevealResult> {
  const { data: membership } = await admin
    .from('pool_members')
    .select('member_id')
    .eq('pool_id', poolId)
    .eq('user_id', viewerUserId)
    .maybeSingle()
  if (!membership) return { ok: false, reason: 'not-a-member' }

  const { data: duelRow, error } = await admin
    .from('league_duels')
    .select('duel_id, pool_id, matchweek_number, entry_a, entry_b, settled_at')
    .eq('duel_id', duelId)
    .maybeSingle()
  if (error) throw new Error(`duel ${duelId}: ${error.message}`)
  const duel = duelRow as DuelRow | null
  if (!duel || duel.pool_id !== poolId) return { ok: false, reason: 'wrong-pool' }

  // ⚠ THE SEAL. Asked of the database, because the policy asks the same
  // function — see the header. Without this the service-role read walks straight
  // past migration 116.
  const { data: revealed, error: gateErr } = await admin.rpc('league_duel_is_revealed', {
    p_pool_id: poolId,
    p_matchweek_number: duel.matchweek_number,
  })
  if (gateErr) throw new Error(`reveal gate: ${gateErr.message}`)
  if (revealed !== true) return { ok: false, reason: 'not-revealed' }

  // A settled duel has a recap; rendering it as a reveal would be a card with a
  // result it refuses to show.
  if (duel.settled_at !== null) return { ok: false, reason: 'already-settled' }

  const { data: entries } = await admin
    .from('pool_entries')
    .select('entry_id, pool_members!inner(pool_id, user_id)')
    .eq('pool_members.pool_id', poolId)
    .eq('pool_members.user_id', viewerUserId)
  const mine = new Set(((entries ?? []) as Array<{ entry_id: string }>).map((e) => e.entry_id))

  const youIsA = mine.has(duel.entry_a)
  const youIsB = duel.entry_b !== null && mine.has(duel.entry_b)
  if (!youIsA && !youIsB) return { ok: false, reason: 'not-your-duel' }

  const youEntry = youIsA ? duel.entry_a : duel.entry_b!
  const themEntry = youIsA ? duel.entry_b : duel.entry_a

  const [{ data: settledRows }, { data: pool }] = await Promise.all([
    admin
      .from('league_duels')
      .select('entry_a, entry_b, points_a, points_b')
      .eq('pool_id', poolId)
      .not('settled_at', 'is', null),
    admin.from('pools').select('pool_name').eq('pool_id', poolId).maybeSingle(),
  ])
  const settled = (settledRows ?? []) as SettledRow[]

  const you = await side(admin, youEntry, poolId, settled)
  const them = themEntry ? await side(admin, themEntry, poolId, settled) : null
  if (!you || (themEntry && !them)) return { ok: false, reason: 'missing-entry' }

  return {
    ok: true,
    side: youIsA ? 'a' : 'b',
    props: {
      poolName: (pool as { pool_name: string } | null)?.pool_name ?? 'Showdown',
      matchweek: duel.matchweek_number,
      you: you!,
      them,
    },
  }
}

async function side(
  admin: SupabaseClient,
  entryId: string,
  poolId: string,
  settled: readonly SettledRow[],
): Promise<RevealSide | null> {
  const [{ data: row }, { data: totals }] = await Promise.all([
    admin
      .from('pool_entries')
      .select('entry_name, pool_members!inner(user_id, users!inner(full_name, username))')
      .eq('entry_id', entryId)
      .maybeSingle(),
    admin
      .from('league_entry_totals')
      .select('duel_points, final_rank')
      .eq('entry_id', entryId)
      .eq('pool_id', poolId)
      .maybeSingle(),
  ])
  if (!row) return null
  const e = row as unknown as {
    entry_name: string | null
    pool_members: { user_id: string; users: { full_name: string | null; username: string | null } }
  }
  const u = e.pool_members.users
  return {
    name: u.full_name?.trim() || u.username?.trim() || e.entry_name || 'Unknown',
    person: { user_id: e.pool_members.user_id, full_name: u.full_name, username: u.username },
    season: tallySeason(
      entryId,
      settled,
      totals as { duel_points: number | null; final_rank: number | null } | null,
    ),
  }
}
