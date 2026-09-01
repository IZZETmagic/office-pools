// =============================================================
// WHAT A RENDER IS ALLOWED TO DRAW
// =============================================================
// Everything a duel-recap render needs, assembled and — more to the point —
// REFUSED. A render endpoint takes an id from the caller and hands back a file,
// which makes it an authorization surface before it is anything else. Migration
// 102 closed a live gap of exactly this shape, where any account could settle
// another pool's duels.
//
// ## ⚠ THE SERVICE-ROLE CLIENT DOES NOT GO THROUGH RLS
//
// This reads with the admin client, because `league_duels` and
// `league_entry_totals` are not readable otherwise. So every check RLS would
// have made has to be made here, by hand:
//
//   1. the viewer is a MEMBER of the pool
//   2. the duel BELONGS to that pool  (never trust the id alongside it)
//   3. the duel is SETTLED
//   4. the viewer OWNS one of the two entries
//
// The same shape as `lib/league/poolCards.ts`, which filters explicitly for the
// same reason. See the header of remotion/DuelReveal.tsx for why the reveal
// card's version of check 3 is a great deal more dangerous than this one.
//
// ## ⚠ ORIENTATION IS NOT COSMETIC
//
// The card says "You beat Mia Torres". `league_duels` has an `entry_a` and an
// `entry_b` and no notion of who is looking, so a render that always treated
// entry A as "you" would tell half the pool they won when they lost. `orient`
// below is the whole of that, and it is a pure function so it can be tested
// without a database.
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

/** The columns of `league_duels` this needs. */
export type DuelRow = {
  duel_id: string
  pool_id: string
  matchweek_number: number
  entry_a: string
  entry_b: string | null
  accuracy_a: number | null
  accuracy_b: number | null
  points_a: number | null
  points_b: number | null
  settled_at: string | null
}

export type RecapPerson = {
  user_id: string
  full_name: string | null
  username: string | null
}

export type RecapSide = { name: string; person: RecapPerson; score: number }

/** Exactly the props `remotion/DuelRecap.tsx` takes. */
export type DuelRecapProps = {
  poolName: string
  matchweek: number
  you: RecapSide
  them: RecapSide | null
  points: number
}

/** Why a render was refused. Mapped to HTTP by the route, not here. */
export type RefusalReason =
  | 'not-a-member'
  | 'wrong-pool'
  | 'not-settled'
  | 'not-your-duel'
  | 'missing-entry'

export type BuildResult =
  | {
      ok: true
      props: DuelRecapProps
      /**
       * Which side of the row the viewer is.
       *
       * ⚠ THE CACHE KEY NEEDS THIS. The card is oriented to the viewer, so one
       * file per `duel_id` would serve "You beat Mia Torres" to Mia Torres. Two
       * files per duel is the correct maximum — not one, and not one per member.
       */
      side: 'a' | 'b'
    }
  | { ok: false; reason: RefusalReason }

/**
 * Which side of the duel the viewer is on.
 *
 * ⚠ Returns null when the viewer owns NEITHER entry — a member of the pool can
 * be a member without being in this particular duel, and rendering somebody
 * else's duel as "you" is both wrong and a small privacy leak. Membership is
 * necessary, not sufficient.
 */
export function orient(
  duel: Pick<DuelRow, 'entry_a' | 'entry_b'>,
  viewerEntryIds: readonly string[],
): { youIsA: boolean } | null {
  const set = new Set(viewerEntryIds)
  if (set.has(duel.entry_a)) return { youIsA: true }
  if (duel.entry_b !== null && set.has(duel.entry_b)) return { youIsA: false }
  return null
}

/**
 * The viewer's half of a settled duel, in the composition's own terms.
 *
 * ⚠ `them === null` IS THE BYE, and it is read off `entry_b` rather than off
 * the points — DUEL_BYE equals DUEL_TIE, so the number cannot tell them apart.
 * A bye also only exists on side A: the generator never puts the empty slot in
 * `entry_b`'s place for the other member, because there is no other member.
 */
export function toProps(
  duel: DuelRow,
  youIsA: boolean,
  poolName: string,
  sideA: Omit<RecapSide, 'score'>,
  sideB: Omit<RecapSide, 'score'> | null,
): DuelRecapProps {
  const you = youIsA
    ? { ...sideA, score: duel.accuracy_a ?? 0 }
    : { ...sideB!, score: duel.accuracy_b ?? 0 }
  const themSide = youIsA ? sideB : sideA
  const themScore = youIsA ? duel.accuracy_b : duel.accuracy_a

  return {
    poolName,
    matchweek: duel.matchweek_number,
    you,
    them: themSide ? { ...themSide, score: themScore ?? 0 } : null,
    // ⚠ Read from the row the engine wrote. Never recomputed — see the register
    // in SPORTPOOL_PROGRAMME.md; a second place deciding what a duel paid is a
    // second scoring engine.
    points: (youIsA ? duel.points_a : duel.points_b) ?? 0,
  }
}

/**
 * Read a duel and turn it into render props, or refuse.
 *
 * `admin` must be the service-role client — the tables are deny-all — which is
 * exactly why all four checks are spelled out above.
 */
export async function buildDuelRecapProps(
  admin: SupabaseClient,
  { poolId, duelId, viewerUserId }: { poolId: string; duelId: string; viewerUserId: string },
): Promise<BuildResult> {
  // 1. membership
  const { data: membership } = await admin
    .from('pool_members')
    .select('member_id')
    .eq('pool_id', poolId)
    .eq('user_id', viewerUserId)
    .maybeSingle()
  if (!membership) return { ok: false, reason: 'not-a-member' }

  const { data: duelRow, error: duelErr } = await admin
    .from('league_duels')
    .select('duel_id, pool_id, matchweek_number, entry_a, entry_b, accuracy_a, accuracy_b, points_a, points_b, settled_at')
    .eq('duel_id', duelId)
    .maybeSingle()
  if (duelErr) throw new Error(`duel ${duelId}: ${duelErr.message}`)
  const duel = duelRow as DuelRow | null

  // 2. ⚠ The duel must belong to the pool in the URL. Without this the pool id
  //    is decoration and any duel id in the product is renderable by anyone who
  //    is a member of any one pool.
  if (!duel || duel.pool_id !== poolId) return { ok: false, reason: 'wrong-pool' }

  // 3. settled only — a recap of an unplayed duel is not a recap
  if (duel.settled_at === null) return { ok: false, reason: 'not-settled' }

  // 4. the viewer's own entries in THIS pool
  const { data: entries } = await admin
    .from('pool_entries')
    .select('entry_id, pool_members!inner(pool_id, user_id)')
    .eq('pool_members.pool_id', poolId)
    .eq('pool_members.user_id', viewerUserId)
  const viewerEntryIds = ((entries ?? []) as Array<{ entry_id: string }>).map((e) => e.entry_id)

  const orientation = orient(duel, viewerEntryIds)
  if (!orientation) return { ok: false, reason: 'not-your-duel' }

  const [sideA, sideB, pool] = await Promise.all([
    readSide(admin, duel.entry_a),
    duel.entry_b ? readSide(admin, duel.entry_b) : Promise.resolve(null),
    admin.from('pools').select('pool_name').eq('pool_id', poolId).maybeSingle(),
  ])
  if (!sideA || (duel.entry_b && !sideB)) return { ok: false, reason: 'missing-entry' }

  return {
    ok: true,
    side: orientation.youIsA ? 'a' : 'b',
    props: toProps(
      duel,
      orientation.youIsA,
      (pool.data as { pool_name: string } | null)?.pool_name ?? 'Showdown',
      sideA,
      sideB,
    ),
  }
}

/** entry → the person behind it. `pool_entries` reaches users via `member_id`. */
async function readSide(
  admin: SupabaseClient,
  entryId: string,
): Promise<Omit<RecapSide, 'score'> | null> {
  const { data } = await admin
    .from('pool_entries')
    .select('entry_name, pool_members!inner(user_id, users!inner(full_name, username))')
    .eq('entry_id', entryId)
    .maybeSingle()
  if (!data) return null
  const row = data as unknown as {
    entry_name: string | null
    pool_members: { user_id: string; users: { full_name: string | null; username: string | null } }
  }
  const u = row.pool_members.users
  return {
    name: u.full_name?.trim() || u.username?.trim() || row.entry_name || 'Unknown',
    person: { user_id: row.pool_members.user_id, full_name: u.full_name, username: u.username },
  }
}
