// Crews — every write, on the ADMIN client.
//
// The four crew tables are deny-all (154): no client can read or write them, so every change goes
// through here, behind an API route that has already authenticated the caller. Each function checks
// the caller's right to act using lib/crews/rules.ts, then writes. They return a result rather than
// throwing, so a route maps it straight onto a response.
//
// ⚠ PostgREST has no transactions, so multi-step writes are ORDERED so that a failure part-way
// leaves nothing a member can see half-done: e.g. a crew row with no members is cleaned up, and a
// captain is only promoted after the leaver's row is closed (the one-captain index would refuse
// otherwise). Where a step is best-effort it is logged, not swallowed.

import type { createAdminClient } from '@/lib/supabase/server'
import { joinPool } from '@/lib/pools/join'
import {
  canManage,
  canRejoin,
  canRemove,
  canSetCoCaptain,
  cleanCrewName,
  inviteBlock,
  inviteRateLimit,
  isActive,
  joinOutcome,
  offersCrewSave,
  seatState,
  successionAfter,
  type CrewMember,
  type CrewRole,
} from './rules'

type Admin = ReturnType<typeof createAdminClient>

export type CrewFailure = {
  ok: false
  status: 400 | 403 | 404 | 409 | 429 | 500
  error: string
  reason?: string
}
export type CrewResult<T extends object = object> = ({ ok: true } & T) | CrewFailure

const fail = (status: CrewFailure['status'], error: string, reason?: string): CrewFailure => ({
  ok: false,
  status,
  error,
  ...(reason ? { reason } : {}),
})

const MEMBER_COLS = 'user_id, role, joined_at, left_at, left_reason'

// ── Loaders ─────────────────────────────────────────────────────────────────────────────────────

async function loadCrew(admin: Admin, crewId: string) {
  const { data, error } = await admin
    .from('crews')
    .select('crew_id, name, closed_at, created_by, created_at')
    .eq('crew_id', crewId)
    .maybeSingle()
  if (error) throw new Error(`crews: ${error.message}`)
  return data as { crew_id: string; name: string; closed_at: string | null; created_by: string | null; created_at: string } | null
}

async function loadMembers(admin: Admin, crewId: string): Promise<CrewMember[]> {
  const { data, error } = await admin.from('crew_members').select(MEMBER_COLS).eq('crew_id', crewId)
  if (error) throw new Error(`crew_members: ${error.message}`)
  return (data ?? []) as CrewMember[]
}

/** An open crew the actor is an active member of, or a failure to return. */
async function crewForActor(admin: Admin, crewId: string, actorId: string) {
  const crew = await loadCrew(admin, crewId)
  if (!crew || crew.closed_at) return { failure: fail(404, 'Crew not found.') } as const
  const members = await loadMembers(admin, crewId)
  const actor = members.find((m) => m.user_id === actorId) ?? null
  if (!isActive(actor)) return { failure: fail(404, 'Crew not found.') } as const
  return { crew, members, actor: actor! } as const
}

// ── Creating a crew ─────────────────────────────────────────────────────────────────────────────

/** My Crews → New crew. A crew of one; the creator is captain. */
export async function createCrew(
  admin: Admin,
  p: { userId: string; name: unknown },
): Promise<CrewResult<{ crewId: string }>> {
  const name = cleanCrewName(p.name)
  if (!name) return fail(400, 'Give the crew a name (up to 60 characters).')

  const { data: crew, error } = await admin
    .from('crews')
    .insert({ name, created_by: p.userId })
    .select('crew_id')
    .single()
  if (error || !crew) return fail(500, error?.message ?? 'Could not create the crew.')

  const { error: memErr } = await admin
    .from('crew_members')
    .insert({ crew_id: crew.crew_id, user_id: p.userId, role: 'captain', joined_via: 'created' })
  if (memErr) {
    await admin.from('crews').delete().eq('crew_id', crew.crew_id) // no members ⇒ no crew
    return fail(500, memErr.message)
  }
  return { ok: true, crewId: crew.crew_id }
}

/**
 * "Keep this group together?" → Save as a crew. The pool's admin saves its players (everyone but
 * spectators) as a crew; the saver is captain, an optional co-captain is named from the same group.
 * The pool becomes the crew's first season.
 *
 * ⚠ The pool is set PRIVATE on the way. A crew pool is never listed (Decision 6, 154's CHECK), and
 * 84 of the finished World Cup groups were Public. The competition is over, so nothing a member does
 * changes — but it is a write to their pool, so it is named here rather than left implicit.
 */
export async function saveCrewFromPool(
  admin: Admin,
  p: { userId: string; poolId: string; name: unknown; coCaptainUserId?: string | null },
): Promise<CrewResult<{ crewId: string; members: number }>> {
  const name = cleanCrewName(p.name)
  if (!name) return fail(400, 'Give the crew a name (up to 60 characters).')

  const { data: pool, error: poolErr } = await admin
    .from('pools')
    .select('pool_id, crew_id, archived_at, brand_slug, crew_prompt_dismissed_at')
    .eq('pool_id', p.poolId)
    .maybeSingle()
  if (poolErr) return fail(500, poolErr.message)
  if (!pool) return fail(404, 'Pool not found.')

  const { data: people, error: peopleErr } = await admin
    .from('pool_members')
    .select('user_id, role')
    .eq('pool_id', p.poolId)
  if (peopleErr) return fail(500, peopleErr.message)
  const me = (people ?? []).find((x) => x.user_id === p.userId)
  if (!me || me.role !== 'admin') return fail(403, 'Only this pool’s admin can save it as a crew.')

  const players = (people ?? []).filter((x) => x.role !== 'spectator')
  const { data: finishedAt } = await admin.rpc('pool_finished_at', { p_pool_id: p.poolId })
  if (
    !offersCrewSave({
      finishedAt: (finishedAt as string | null) ?? null,
      crewId: pool.crew_id,
      archivedAt: pool.archived_at,
      brandSlug: pool.brand_slug,
      dismissedAt: null, // "Not now" hides the prompt; it does not forbid saving later
      players: players.length,
    })
  ) {
    return fail(409, pool.crew_id ? 'This pool is already a crew’s.' : 'This pool can’t be saved as a crew.')
  }
  if (p.coCaptainUserId && (p.coCaptainUserId === p.userId || !players.some((x) => x.user_id === p.coCaptainUserId))) {
    return fail(400, 'The co-captain has to be someone else who played in this pool.')
  }

  const { data: crew, error: crewErr } = await admin
    .from('crews')
    .insert({ name, created_by: p.userId, created_from_pool_id: p.poolId })
    .select('crew_id')
    .single()
  if (crewErr || !crew) return fail(500, crewErr?.message ?? 'Could not create the crew.')

  const rows = players.map((x) => ({
    crew_id: crew.crew_id,
    user_id: x.user_id,
    role: (x.user_id === p.userId ? 'captain' : x.user_id === p.coCaptainUserId ? 'co_captain' : 'member') as CrewRole,
    joined_via: x.user_id === p.userId ? 'created' : 'played',
    joined_via_pool_id: p.poolId,
  }))
  const { error: memErr } = await admin.from('crew_members').insert(rows)
  if (memErr) {
    await admin.from('crews').delete().eq('crew_id', crew.crew_id)
    return fail(500, memErr.message)
  }

  const { error: linkErr } = await admin
    .from('pools')
    .update({ crew_id: crew.crew_id, is_private: true })
    .eq('pool_id', p.poolId)
  if (linkErr) {
    await admin.from('crews').delete().eq('crew_id', crew.crew_id) // cascades the members
    return fail(500, linkErr.message)
  }
  return { ok: true, crewId: crew.crew_id, members: rows.length }
}

/** "Not now" on Keep this group together? — for good. The pool's admin only. */
export async function dismissCrewPrompt(admin: Admin, p: { userId: string; poolId: string }): Promise<CrewResult> {
  const { data: me } = await admin
    .from('pool_members')
    .select('role')
    .eq('pool_id', p.poolId)
    .eq('user_id', p.userId)
    .maybeSingle()
  if (!me || me.role !== 'admin') return fail(403, 'Only this pool’s admin can do that.')
  const { error } = await admin
    .from('pools')
    .update({ crew_prompt_dismissed_at: new Date().toISOString() })
    .eq('pool_id', p.poolId)
    .is('crew_prompt_dismissed_at', null)
  return error ? fail(500, error.message) : { ok: true }
}

// ── Managing a crew ─────────────────────────────────────────────────────────────────────────────

export async function renameCrew(admin: Admin, p: { actorId: string; crewId: string; name: unknown }): Promise<CrewResult> {
  const name = cleanCrewName(p.name)
  if (!name) return fail(400, 'Give the crew a name (up to 60 characters).')
  const ctx = await crewForActor(admin, p.crewId, p.actorId)
  if ('failure' in ctx) return ctx.failure!
  if (!canManage(ctx.actor)) return fail(403, 'Only the captain or co-captain can rename the crew.')
  const { error } = await admin.from('crews').update({ name }).eq('crew_id', p.crewId)
  return error ? fail(500, error.message) : { ok: true }
}

/** The captain names (or changes) the co-captain. The previous co-captain becomes a member. */
export async function setCoCaptain(admin: Admin, p: { actorId: string; crewId: string; targetId: string }): Promise<CrewResult> {
  const ctx = await crewForActor(admin, p.crewId, p.actorId)
  if ('failure' in ctx) return ctx.failure!
  if (!canSetCoCaptain(ctx.actor)) return fail(403, 'Only the captain can name a co-captain.')
  const target = ctx.members.find((m) => m.user_id === p.targetId)
  if (!isActive(target) || target!.role === 'captain') return fail(400, 'Pick someone else in the crew.')
  if (target!.role === 'co_captain') return { ok: true }

  const { error: demoteErr } = await admin
    .from('crew_members')
    .update({ role: 'member' })
    .eq('crew_id', p.crewId)
    .eq('role', 'co_captain')
    .is('left_at', null)
  if (demoteErr) return fail(500, demoteErr.message)
  const { error } = await admin
    .from('crew_members')
    .update({ role: 'co_captain' })
    .eq('crew_id', p.crewId)
    .eq('user_id', p.targetId)
  return error ? fail(500, error.message) : { ok: true }
}

/** Open seats a person holds in this crew's pools are released when they stop being in it. */
async function releaseSeats(admin: Admin, crewId: string, userId: string) {
  const { error } = await admin
    .from('crew_seats')
    .update({ resolved_at: new Date().toISOString(), resolution: 'released' })
    .eq('crew_id', crewId)
    .eq('user_id', userId)
    .is('resolved_at', null)
  if (error) console.error('[crews] releasing seats failed:', error.message)
}

/** How many of this crew's pools each person has an entry in — succession's tie-break. */
async function poolsPlayedByMember(admin: Admin, crewId: string): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const { data: pools } = await admin.from('pools').select('pool_id').eq('crew_id', crewId)
  const ids = (pools ?? []).map((x) => x.pool_id)
  if (ids.length === 0) return out
  const { data: entries } = await admin.from('pool_entries').select('pool_id, user_id').in('pool_id', ids)
  const seen = new Set<string>()
  for (const e of entries ?? []) {
    const k = `${e.user_id}|${e.pool_id}`
    if (!e.user_id || seen.has(k)) continue
    seen.add(k)
    out.set(e.user_id, (out.get(e.user_id) ?? 0) + 1)
  }
  return out
}

/** Leaving: one tap; history stays; open seats are released; the captaincy passes on. */
export async function leaveCrew(
  admin: Admin,
  p: { crewId: string; userId: string },
): Promise<CrewResult<{ closed: boolean; newCaptainId: string | null }>> {
  const ctx = await crewForActor(admin, p.crewId, p.userId)
  if ('failure' in ctx) return ctx.failure!
  const active = ctx.members.filter((m) => m.left_at === null)
  const next = successionAfter(active, p.userId, await poolsPlayedByMember(admin, p.crewId))

  const now = new Date().toISOString()
  const { error } = await admin
    .from('crew_members')
    .update({ left_at: now, left_reason: 'left' })
    .eq('crew_id', p.crewId)
    .eq('user_id', p.userId)
  if (error) return fail(500, error.message)
  await releaseSeats(admin, p.crewId, p.userId)

  if (next.kind === 'close') {
    await admin.from('crews').update({ closed_at: now }).eq('crew_id', p.crewId)
    await admin
      .from('crew_invites')
      .update({ resolved_at: now, resolution: 'revoked' })
      .eq('crew_id', p.crewId)
      .is('resolved_at', null)
    return { ok: true, closed: true, newCaptainId: null }
  }
  if (next.kind === 'promote') {
    const { error: promoteErr } = await admin
      .from('crew_members')
      .update({ role: 'captain' })
      .eq('crew_id', p.crewId)
      .eq('user_id', next.userId)
    if (promoteErr) console.error('[crews] promoting the next captain failed:', promoteErr.message)
    return { ok: true, closed: false, newCaptainId: next.userId }
  }
  return { ok: true, closed: false, newCaptainId: null }
}

/**
 * Deleting an account. Its crew_members rows cascade away with the users row (154), which on its own
 * would leave a crew with no captain. So, first, leave every crew the way a person leaving does —
 * the captaincy passes on, open seats are released, a crew whose last member this was closes.
 * Returns how many crews were left and any that failed, so the caller can refuse to go on.
 */
export async function leaveAllCrews(admin: Admin, userId: string): Promise<{ left: number; failed: string[] }> {
  const { data, error } = await admin.from('crew_members').select('crew_id').eq('user_id', userId).is('left_at', null)
  if (error) return { left: 0, failed: [`crew_members: ${error.message}`] }
  let left = 0
  const failed: string[] = []
  for (const { crew_id } of data ?? []) {
    const r = await leaveCrew(admin, { crewId: crew_id, userId })
    if (r.ok) left++
    else failed.push(`${crew_id}: ${r.error}`)
  }
  return { left, failed }
}

/** Someone who left on their own comes back. Never the removed — they need to be added back. */
export async function rejoinCrew(admin: Admin, p: { crewId: string; userId: string }): Promise<CrewResult> {
  const crew = await loadCrew(admin, p.crewId)
  if (!crew || crew.closed_at) return fail(404, 'Crew not found.')
  const members = await loadMembers(admin, p.crewId)
  const me = members.find((m) => m.user_id === p.userId) ?? null
  if (!canRejoin(me)) return fail(403, 'You can’t rejoin this crew yourself.')
  const { error } = await admin
    .from('crew_members')
    .update({ left_at: null, left_reason: null, role: 'member', joined_at: new Date().toISOString() })
    .eq('crew_id', p.crewId)
    .eq('user_id', p.userId)
  return error ? fail(500, error.message) : { ok: true }
}

/** Removal = no more saved spots. They are not told, and their history stays. */
export async function removeMember(admin: Admin, p: { actorId: string; crewId: string; targetId: string }): Promise<CrewResult> {
  const ctx = await crewForActor(admin, p.crewId, p.actorId)
  if ('failure' in ctx) return ctx.failure!
  const target = ctx.members.find((m) => m.user_id === p.targetId) ?? null
  if (!canRemove(ctx.actor, target)) return fail(403, 'You can’t remove this person.')
  const { error } = await admin
    .from('crew_members')
    .update({ left_at: new Date().toISOString(), left_reason: 'removed' })
    .eq('crew_id', p.crewId)
    .eq('user_id', p.targetId)
  if (error) return fail(500, error.message)
  await releaseSeats(admin, p.crewId, p.targetId)
  return { ok: true }
}

// ── Adding people: a lookup, never a browse ─────────────────────────────────────────────────────

export type UserMatch = {
  userId: string
  username: string
  fullName: string | null
  avatarUrl: string | null
  avatarBuild: unknown
  avatarColour: string | null
}

/**
 * Exact username, case-insensitive. ⚠ An exact `ilike` with every wildcard escaped — never a prefix
 * search, never autocomplete. 36 production usernames collide on case, so this returns every match
 * and the captain picks a face.
 */
export async function lookupUsername(admin: Admin, username: string): Promise<UserMatch[]> {
  const exact = username.replace(/[\\%_]/g, (c) => `\\${c}`)
  const { data, error } = await admin
    .from('users')
    .select('user_id, username, full_name, avatar_url, avatar_build, avatar_colour')
    .ilike('username', exact)
    .limit(5)
  if (error) throw new Error(`users lookup: ${error.message}`)
  return (data ?? []).map((u) => ({
    userId: u.user_id,
    username: u.username,
    fullName: u.full_name,
    avatarUrl: u.avatar_url,
    avatarBuild: u.avatar_build ?? null,
    avatarColour: u.avatar_colour ?? null,
  }))
}

/**
 * Add someone to a crew: by the user_id the captain picked from a lookup, or by email.
 *
 * ⚠ AN EMAIL NEVER REVEALS WHETHER IT HAS AN ACCOUNT. The email path answers `{ sent: true }` in
 * every case that is about the invitee — new address, existing account, already invited, already a
 * member, said no before — and only refuses for reasons about the CAPTAIN (rights, rate limits). A
 * blocked email invite is simply not written. The user_id path can be specific: the captain already
 * saw that person's face.
 */
export async function inviteToCrew(
  admin: Admin,
  p: { actorId: string; crewId: string; userId?: string; email?: string },
): Promise<CrewResult<{ sent: true; inviteId: string | null }>> {
  const ctx = await crewForActor(admin, p.crewId, p.actorId)
  if ('failure' in ctx) return ctx.failure!
  if (!canManage(ctx.actor)) return fail(403, 'Only the captain or co-captain can add people.')

  const dayAgo = new Date(Date.now() - 86_400_000).toISOString()
  const [{ count: openForCrew }, { count: sentByActorToday }] = await Promise.all([
    admin.from('crew_invites').select('invite_id', { count: 'exact', head: true }).eq('crew_id', p.crewId).is('resolved_at', null),
    admin.from('crew_invites').select('invite_id', { count: 'exact', head: true }).eq('invited_by', p.actorId).gte('created_at', dayAgo),
  ])
  const limited = inviteRateLimit({ openForCrew: openForCrew ?? 0, sentByActorToday: sentByActorToday ?? 0 })
  if (limited) return fail(429, limited)

  // Resolve the invitee: an email that belongs to an account becomes an invite to that account.
  let inviteeUserId = p.userId ?? null
  let inviteeEmail: string | null = null
  const byEmail = !p.userId
  if (byEmail) {
    if (!p.email) return fail(400, 'Who should we invite?')
    inviteeEmail = p.email.trim().toLowerCase()
    const { data: acct } = await admin.from('users').select('user_id').ilike('email', inviteeEmail.replace(/[\\%_]/g, (c) => `\\${c}`)).maybeSingle()
    if (acct) {
      inviteeUserId = acct.user_id
      inviteeEmail = null
    }
  }
  if (inviteeUserId === p.actorId) return byEmail ? { ok: true, sent: true, inviteId: null } : fail(400, 'You’re already in this crew.')

  const member = inviteeUserId ? ctx.members.find((m) => m.user_id === inviteeUserId) ?? null : null
  let q = admin.from('crew_invites').select('resolved_at, resolution').eq('crew_id', p.crewId)
  q = inviteeUserId ? q.eq('invitee_user_id', inviteeUserId) : q.eq('invitee_email', inviteeEmail!)
  const { data: prior } = await q
  const block = inviteBlock({
    member,
    hasOpenInvite: (prior ?? []).some((i) => i.resolved_at === null),
    declinedBefore: (prior ?? []).some((i) => i.resolution === 'declined'),
  })
  if (block) {
    if (byEmail) return { ok: true, sent: true, inviteId: null }
    return fail(409, {
      already_member: 'They’re already in this crew.',
      already_invited: 'They’ve already been invited.',
      declined_before: 'They’ve said no to this crew before.',
    }[block], block)
  }

  const { data: invite, error } = await admin
    .from('crew_invites')
    .insert({
      crew_id: p.crewId,
      invited_by: p.actorId,
      invitee_user_id: inviteeUserId,
      invitee_email: inviteeUserId ? null : inviteeEmail,
    })
    .select('invite_id')
    .single()
  if (error) return fail(500, error.message)
  // The invite email itself (and the in-app card) are Crews steps 5 and 7.
  return { ok: true, sent: true, inviteId: invite.invite_id }
}

export async function revokeInvite(admin: Admin, p: { actorId: string; inviteId: string }): Promise<CrewResult> {
  const { data: inv } = await admin.from('crew_invites').select('crew_id, resolved_at').eq('invite_id', p.inviteId).maybeSingle()
  if (!inv) return fail(404, 'Invite not found.')
  const ctx = await crewForActor(admin, inv.crew_id, p.actorId)
  if ('failure' in ctx) return ctx.failure!
  if (!canManage(ctx.actor)) return fail(403, 'Only the captain or co-captain can withdraw an invite.')
  if (inv.resolved_at) return { ok: true }
  const { error } = await admin
    .from('crew_invites')
    .update({ resolved_at: new Date().toISOString(), resolution: 'revoked' })
    .eq('invite_id', p.inviteId)
  return error ? fail(500, error.message) : { ok: true }
}

/**
 * Email invites wait for an account. When someone signs in with a VERIFIED address, any open invite
 * to that address becomes theirs. ⚠ Verified only — otherwise someone could register the address
 * first and land in a crew. Called lazily from the crew readers, so there is no sign-up hook to miss.
 */
export async function claimEmailInvites(
  admin: Admin,
  p: { userId: string; email: string | null | undefined; emailVerified: boolean },
): Promise<number> {
  if (!p.emailVerified || !p.email) return 0
  const email = p.email.trim().toLowerCase()
  const { data: open } = await admin
    .from('crew_invites')
    .select('invite_id, crew_id')
    .eq('invitee_email', email)
    .is('resolved_at', null)
  let claimed = 0
  for (const inv of open ?? []) {
    const { error } = await admin
      .from('crew_invites')
      .update({ invitee_user_id: p.userId, invitee_email: null })
      .eq('invite_id', inv.invite_id)
    if (!error) {
      claimed++
    } else {
      // Already holds an open invite to this crew by user_id — the email copy is redundant.
      await admin
        .from('crew_invites')
        .update({ resolved_at: new Date().toISOString(), resolution: 'revoked' })
        .eq('invite_id', inv.invite_id)
    }
  }
  return claimed
}

/** "Dave added you to Bermuda Office" → Join / No thanks. One tap, once. */
export async function answerInvite(
  admin: Admin,
  p: { userId: string; inviteId: string; answer: 'join' | 'decline' },
): Promise<CrewResult<{ crewId: string }>> {
  const { data: inv } = await admin
    .from('crew_invites')
    .select('invite_id, crew_id, invitee_user_id, resolved_at')
    .eq('invite_id', p.inviteId)
    .maybeSingle()
  if (!inv || inv.invitee_user_id !== p.userId) return fail(404, 'Invite not found.')
  if (inv.resolved_at) return fail(409, 'This invite has already been answered.')
  const now = new Date().toISOString()

  if (p.answer === 'decline') {
    const { error } = await admin.from('crew_invites').update({ resolved_at: now, resolution: 'declined' }).eq('invite_id', p.inviteId)
    return error ? fail(500, error.message) : { ok: true, crewId: inv.crew_id }
  }

  const crew = await loadCrew(admin, inv.crew_id)
  if (!crew || crew.closed_at) return fail(409, 'This crew has closed.')
  const members = await loadMembers(admin, inv.crew_id)
  const existing = members.find((m) => m.user_id === p.userId) ?? null
  if (!isActive(existing)) {
    const { error } = existing
      ? await admin
          .from('crew_members')
          .update({ left_at: null, left_reason: null, role: 'member', joined_via: 'invite', joined_at: now })
          .eq('crew_id', inv.crew_id)
          .eq('user_id', p.userId)
      : await admin.from('crew_members').insert({ crew_id: inv.crew_id, user_id: p.userId, role: 'member', joined_via: 'invite' })
    if (error) return fail(500, error.message)
  }
  await admin.from('crew_invites').update({ resolved_at: now, resolution: 'joined' }).eq('invite_id', p.inviteId)
  return { ok: true, crewId: inv.crew_id }
}

// ── Seasons: joining by playing, and held seats ─────────────────────────────────────────────────

/**
 * Called by joinPool after someone joins a pool that belongs to a crew: they are in the crew now,
 * unless they left or were removed (exits stick), and any held seat of theirs is taken.
 */
export async function onCrewPoolJoined(admin: Admin, p: { crewId: string; poolId: string; userId: string }) {
  const { data: row } = await admin
    .from('crew_members')
    .select('left_at')
    .eq('crew_id', p.crewId)
    .eq('user_id', p.userId)
    .maybeSingle()
  if (joinOutcome(row ?? null) === 'add') {
    const { error } = await admin
      .from('crew_members')
      .insert({ crew_id: p.crewId, user_id: p.userId, role: 'member', joined_via: 'played', joined_via_pool_id: p.poolId })
    if (error) console.error('[crews] adding a player to the crew failed:', error.message)
  }
  const { error: seatErr } = await admin
    .from('crew_seats')
    .update({ resolved_at: new Date().toISOString(), resolution: 'taken' })
    .eq('pool_id', p.poolId)
    .eq('user_id', p.userId)
    .is('resolved_at', null)
  if (seatErr) console.error('[crews] marking the seat taken failed:', seatErr.message)
}

/** Hold seats in a new crew pool. The selection was already checked (rules.seatSelectionError). */
export async function holdSeats(admin: Admin, p: { poolId: string; crewId: string; userIds: string[] }) {
  if (p.userIds.length === 0) return { error: null }
  const { error } = await admin
    .from('crew_seats')
    .insert(p.userIds.map((user_id) => ({ pool_id: p.poolId, crew_id: p.crewId, user_id })))
  return { error: error?.message ?? null }
}

/**
 * "Your spot's saved" → I'm in / Not this one.
 *   take    — the ordinary join (lib/pools/join.ts), which marks the seat taken. It works after the
 *             first lock too, while the pool still takes members: the seat lapses, the door doesn't.
 *   decline — only while the seat is open; afterwards there is nothing to decline.
 */
export async function answerSeat(
  admin: Admin,
  p: { userId: string; poolId: string; answer: 'take' | 'decline' },
): Promise<CrewResult<{ poolId: string }>> {
  const { data: seat } = await admin
    .from('crew_seats')
    .select('resolution')
    .eq('pool_id', p.poolId)
    .eq('user_id', p.userId)
    .maybeSingle()
  if (!seat) return fail(404, 'No saved spot here.')

  if (p.answer === 'take') {
    const joined = await joinPool(admin, { poolId: p.poolId }, p.userId)
    if (!joined.ok) return fail(joined.status, joined.error, joined.reason)
    return { ok: true, poolId: p.poolId }
  }

  const { data: lock } = await admin.rpc('pool_first_lock_at', { p_pool_id: p.poolId })
  if (seatState({ resolution: seat.resolution }, (lock as string | null) ?? null, Date.now()) !== 'open') {
    return { ok: true, poolId: p.poolId }
  }
  const { error } = await admin
    .from('crew_seats')
    .update({ resolved_at: new Date().toISOString(), resolution: 'declined' })
    .eq('pool_id', p.poolId)
    .eq('user_id', p.userId)
    .is('resolved_at', null)
  return error ? fail(500, error.message) : { ok: true, poolId: p.poolId }
}
