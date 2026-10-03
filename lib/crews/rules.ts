// Crews — the decisions, as pure functions.
//
// Every rule Crews runs on lives here, with no database and no clock of its own (`now` is passed
// in), so it can be tested exhaustively and the routes stay thin. The rules are Ryan's, settled on
// 2026-10-02 — drafts/2026-10-02_crews_plan.md §1, §9, §11, and programme Decisions 1–3 as amended.
//
//   · You're in a crew because you PLAYED in one of its pools, or said yes when its captain or
//     co-captain ADDED you by exact username or email. No friends list: adding is a lookup.
//   · Exits stick. Joining a crew pool by link does not re-add someone who left or was removed.
//     A leaver can rejoin themselves; the removed only by being added back (one Join tap).
//   · Captain + co-captain manage people; the captain alone names the co-captain.
//   · A captain who leaves hands over to the co-captain, else the longest-standing member (tie →
//     most crew pools played). The last member leaving closes the crew.
//   · Saved spots never exceed what the pool can hold. Nobody unticked is told.

export type CrewRole = 'captain' | 'co_captain' | 'member'

export type CrewMember = {
  user_id: string
  role: CrewRole
  joined_at: string
  left_at: string | null
  left_reason: 'left' | 'removed' | null
}

// ── Names ───────────────────────────────────────────────────────────────────────────────────────

export const CREW_NAME_MAX = 60

/** Trimmed, inner whitespace collapsed; null when empty or too long (matches 154's CHECK). */
export function cleanCrewName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.replace(/\s+/g, ' ').trim()
  if (name.length < 1 || name.length > CREW_NAME_MAX) return null
  return name
}

// ── Who may do what ─────────────────────────────────────────────────────────────────────────────

export function isActive(m: Pick<CrewMember, 'left_at'> | null | undefined): boolean {
  return !!m && m.left_at === null
}

/** Add people, remove people, rename, withdraw an invite. */
export function canManage(m: Pick<CrewMember, 'role' | 'left_at'> | null | undefined): boolean {
  return isActive(m) && (m!.role === 'captain' || m!.role === 'co_captain')
}

/**
 * Disband is the captain's alone (Ryan, 2026-10-02). The crew disappears for everyone; the captain
 * can restore it (`canRestore`).
 */
export function canDisband(m: Pick<CrewMember, 'role' | 'left_at'> | null | undefined): boolean {
  return isActive(m) && m!.role === 'captain'
}

/**
 * Restore a disbanded crew: only a crew the captain DISBANDED (not one whose last member left —
 * nobody is left to bring back), and only by its captain, whose row a disband leaves untouched.
 */
export function canRestore(
  crew: { closed_at: string | null; closed_reason: string | null },
  m: Pick<CrewMember, 'role' | 'left_at'> | null | undefined,
): boolean {
  return !!crew.closed_at && crew.closed_reason === 'disbanded' && isActive(m) && m!.role === 'captain'
}

/** Naming the co-captain is the captain's alone. */
export function canSetCoCaptain(m: Pick<CrewMember, 'role' | 'left_at'> | null | undefined): boolean {
  return isActive(m) && m!.role === 'captain'
}

/**
 * Removing someone. A manager may remove an ordinary member, and the captain may remove the
 * co-captain; nobody removes the captain (the captain leaves instead), and nobody removes themselves
 * (that is leaving).
 */
export function canRemove(
  actor: Pick<CrewMember, 'user_id' | 'role' | 'left_at'> | null | undefined,
  target: Pick<CrewMember, 'user_id' | 'role' | 'left_at'> | null | undefined,
): boolean {
  if (!canManage(actor) || !isActive(target)) return false
  if (actor!.user_id === target!.user_id) return false
  if (target!.role === 'captain') return false
  if (target!.role === 'co_captain') return actor!.role === 'captain'
  return true
}

// ── Joining by playing ──────────────────────────────────────────────────────────────────────────

/**
 * Someone just joined a pool that belongs to a crew. What happens to their crew membership?
 *   add      — no row yet: they're in, by having played
 *   already  — already an active member
 *   excluded — they left or were removed: exits stick, the join does not re-add them
 */
export function joinOutcome(existing: Pick<CrewMember, 'left_at'> | null): 'add' | 'already' | 'excluded' {
  if (!existing) return 'add'
  return existing.left_at === null ? 'already' : 'excluded'
}

/** Rejoining yourself is for people who left on their own — never for the removed. */
export function canRejoin(existing: Pick<CrewMember, 'left_at' | 'left_reason'> | null): boolean {
  return !!existing && existing.left_at !== null && existing.left_reason === 'left'
}

// ── Leaving, and who is captain afterwards ──────────────────────────────────────────────────────

export type Succession =
  /** Nothing about the captaincy changes. */
  | { kind: 'none' }
  /** Promote this member to captain. `from` says why, for the crew page's "since Dave left". */
  | { kind: 'promote'; userId: string; from: 'co_captain' | 'longest_standing' }
  /** Nobody is left: the crew closes. */
  | { kind: 'close' }

/**
 * After `leaverId` leaves (or is removed), given everyone who was active BEFORE they went.
 * `poolsPlayed` breaks a tie on joined_at: most crew pools played wins. user_id is the final,
 * arbitrary-but-stable tie-break so the answer never depends on row order.
 */
export function successionAfter(
  activeBefore: CrewMember[],
  leaverId: string,
  poolsPlayed: ReadonlyMap<string, number> = new Map(),
): Succession {
  const leaver = activeBefore.find((m) => m.user_id === leaverId)
  const remaining = activeBefore.filter((m) => m.user_id !== leaverId && m.left_at === null)
  if (remaining.length === 0) return { kind: 'close' }
  if (!leaver || leaver.role !== 'captain') return { kind: 'none' }

  const co = remaining.find((m) => m.role === 'co_captain')
  if (co) return { kind: 'promote', userId: co.user_id, from: 'co_captain' }

  const next = [...remaining].sort((a, b) => {
    const byJoin = Date.parse(a.joined_at) - Date.parse(b.joined_at)
    if (byJoin !== 0) return byJoin
    const byPlayed = (poolsPlayed.get(b.user_id) ?? 0) - (poolsPlayed.get(a.user_id) ?? 0)
    if (byPlayed !== 0) return byPlayed
    return a.user_id < b.user_id ? -1 : a.user_id > b.user_id ? 1 : 0
  })[0]
  return { kind: 'promote', userId: next.user_id, from: 'longest_standing' }
}

// ── Adding people: a lookup, never a browse ─────────────────────────────────────────────────────

export type InviteTarget = { kind: 'username'; username: string } | { kind: 'email'; email: string }

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * What the captain typed. An `@` with a dot after it is an email; anything else is a username, with
 * a leading `@` allowed ("@dave"). Usernames are compared case-insensitively — production has 36
 * pairs that differ only by case — so the lookup returns every match and the captain picks a face.
 */
export function parseInviteTarget(raw: unknown): InviteTarget | null {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s) return null
  if (s.includes('@') && !s.startsWith('@')) {
    const email = s.toLowerCase()
    return EMAIL_SHAPE.test(email) ? { kind: 'email', email } : null
  }
  const username = s.replace(/^@/, '').trim()
  if (!username || /\s/.test(username)) return null
  return { kind: 'username', username }
}

export type InviteBlock =
  | 'already_member' // an active member already
  | 'already_invited' // an invite is open for them
  | 'declined_before' // they said "No thanks" to this crew — it sticks

/**
 * Can this crew invite this person? A removed member CAN be invited — that is how they come back. A
 * person who left can be invited too (or rejoin themselves). Only a "No thanks" closes the door.
 */
export function inviteBlock(p: {
  member: Pick<CrewMember, 'left_at'> | null
  hasOpenInvite: boolean
  declinedBefore: boolean
}): InviteBlock | null {
  if (isActive(p.member)) return 'already_member'
  if (p.hasOpenInvite) return 'already_invited'
  if (p.declinedBefore) return 'declined_before'
  return null
}

export type ClaimBlock =
  | 'own_invite' // the person who sent it
  | 'already_member' // already in the crew — the invite stays open for whoever it was meant for
  | 'removed' // a captain took them out; a forwarded link must not undo that

/**
 * Can this signed-in person take the invite behind a one-time link (migration 155)?
 *
 * The link is the proof — whoever can read the inbox it went to — so a link can be forwarded, and
 * that is the invitee's call. Two things it must never do: let the sender claim their own invite,
 * or bring back someone a captain removed (exits stick; the removed come back only when a captain
 * adds THEM). A "No thanks" to this crew in the past is NOT a block: opening the link and pressing
 * Join is a fresh yes. Neither block consumes the invite.
 */
export function claimBlock(p: {
  isInviter: boolean
  member: Pick<CrewMember, 'left_at' | 'left_reason'> | null
}): ClaimBlock | null {
  if (p.isInviter) return 'own_invite'
  if (isActive(p.member)) return 'already_member'
  if (p.member?.left_reason === 'removed') return 'removed'
  return null
}

export const CLAIM_BLOCK_TEXT: Record<ClaimBlock, string> = {
  own_invite: 'This invite is for the person you asked us to invite.',
  already_member: 'You’re already in this crew.',
  removed: 'You can’t join this crew with this invite.',
}

/** Generous for a real group, useless for spam (plan §5). */
export const INVITE_LIMITS = { openPerCrew: 20, perActorPerDay: 50 } as const

export function inviteRateLimit(p: { openForCrew: number; sentByActorToday: number }): string | null {
  if (p.openForCrew >= INVITE_LIMITS.openPerCrew) {
    return `This crew already has ${INVITE_LIMITS.openPerCrew} invites waiting. Give them a chance to answer first.`
  }
  if (p.sentByActorToday >= INVITE_LIMITS.perActorPerDay) {
    return `That's ${INVITE_LIMITS.perActorPerDay} invites today — try again tomorrow.`
  }
  return null
}

// ── Held seats ──────────────────────────────────────────────────────────────────────────────────

export type SeatState = 'open' | 'taken' | 'declined' | 'released' | 'expired'

/**
 * A seat is open while unresolved and before the pool's first lock — pool_first_lock_at() (153).
 * Expiry is derived, never stored: nothing runs at the lock, the seat simply stops being open.
 * A pool with no first lock (should not happen; 153 answers every pool) is treated as expired
 * rather than open forever.
 */
export function seatState(
  seat: { resolution: 'taken' | 'declined' | 'released' | null },
  firstLockAt: string | null,
  now: number,
): SeatState {
  if (seat.resolution) return seat.resolution
  if (!firstLockAt) return 'expired'
  return now < Date.parse(firstLockAt) ? 'open' : 'expired'
}

// ── Roster review — who gets a saved spot ───────────────────────────────────────────────────────

/** "Hasn't opened SportPool in 6 months". */
export const DORMANT_DAYS = 182

export type RosterSignal = {
  user_id: string
  /** Did they play the crew's previous season? null when the crew has no previous season. */
  playedLastSeason: boolean | null
  /** users.last_login. null is treated as unknown, not as dormant — no label without evidence. */
  lastLogin: string | null
}

export function rosterReasons(s: RosterSignal, now: number): string[] {
  const out: string[] = []
  if (s.playedLastSeason === false) out.push('Didn’t play last season')
  if (s.lastLogin && now - Date.parse(s.lastLogin) > DORMANT_DAYS * 86_400_000) {
    out.push('Hasn’t opened SportPool in 6 months')
  }
  return out
}

/**
 * How many saved spots a pool can offer: its tier's member cap (pool_tier_member_cap, 075) minus
 * the one the person starting it takes. null = no cap.
 */
export function spotsForCap(memberCap: number | null): number | null {
  return memberCap === null ? null : Math.max(0, memberCap - 1)
}

export type RosterRow = { user_id: string; reasons: string[]; ticked: boolean }

export type Roster = {
  rows: RosterRow[]
  /** null = the pool holds everyone. */
  spots: number | null
  /** How many more are ticked than the pool can hold — the starter must untick these, or go Plus. */
  over: number
}

/**
 * Everyone is ticked by default except people with a reason. If that still overflows the cap, the
 * default stays as it is and `over` says by how much — we never pick between friends on the
 * starter's behalf beyond the reasons we can show them. Nobody unticked is told.
 */
export function buildRoster(
  others: RosterSignal[],
  spots: number | null,
  now: number,
): Roster {
  const rows = others.map((s) => {
    const reasons = rosterReasons(s, now)
    return { user_id: s.user_id, reasons, ticked: reasons.length === 0 }
  })
  const ticked = rows.filter((r) => r.ticked).length
  return { rows, spots, over: spots === null ? 0 : Math.max(0, ticked - spots) }
}

/**
 * The starter's final choice, checked on the server. Every chosen person must be an active member
 * other than the starter, and there can be no more than the pool holds — a saved spot is always a
 * real promise.
 */
export function seatSelectionError(p: {
  chosen: string[]
  activeMemberIds: ReadonlySet<string>
  starterId: string
  spots: number | null
}): string | null {
  const unique = new Set(p.chosen)
  if (unique.size !== p.chosen.length) return 'Someone is listed twice.'
  for (const id of unique) {
    if (id === p.starterId) return 'You don’t need a saved spot — you’re creating the pool.'
    if (!p.activeMemberIds.has(id)) return 'Everyone given a saved spot has to be in the crew.'
  }
  if (p.spots !== null && unique.size > p.spots) {
    return `This pool holds ${p.spots + 1}, so it can save ${p.spots} spots — untick ${unique.size - p.spots}, or go Plus.`
  }
  return null
}

// ── History ─────────────────────────────────────────────────────────────────────────────────────

export type Finish = {
  pool_id: string
  user_id: string
  /**
   * Final rank, or null when the mode has none. ⚠ Last Man Standing NEVER has a rank (programme
   * rule), so an LMS season counts as played with no finish and no title.
   */
  rank: number | null
}

export type AllTimeRow = { user_id: string; seasons: number; titles: number; best: number | null }

/**
 * Seasons played · titles · best finish. ⚠ NEVER summed points: points across different games mean
 * nothing (the Profile "Total Points" lesson). A season counts once per person even with several
 * entries; their best entry's rank is the one that counts.
 */
export function allTimeTable(finishes: Finish[]): AllTimeRow[] {
  const best = new Map<string, Map<string, number | null>>() // user → pool → best rank
  for (const f of finishes) {
    const pools = best.get(f.user_id) ?? new Map<string, number | null>()
    const prev = pools.get(f.pool_id)
    if (prev === undefined) pools.set(f.pool_id, f.rank)
    else if (f.rank !== null && (prev === null || f.rank < prev)) pools.set(f.pool_id, f.rank)
    best.set(f.user_id, pools)
  }
  const rows: AllTimeRow[] = []
  for (const [user_id, pools] of best) {
    const ranks = [...pools.values()]
    const placed = ranks.filter((r): r is number => r !== null)
    rows.push({
      user_id,
      seasons: pools.size,
      titles: placed.filter((r) => r === 1).length,
      best: placed.length ? Math.min(...placed) : null,
    })
  }
  return rows.sort(
    (a, b) =>
      b.titles - a.titles ||
      (a.best ?? Infinity) - (b.best ?? Infinity) ||
      b.seasons - a.seasons ||
      (a.user_id < b.user_id ? -1 : 1),
  )
}

// ── "Keep this group together?" ─────────────────────────────────────────────────────────────────

/**
 * Whether a pool's admin is offered to save its people as a crew. Finished (pool_finished_at, 153),
 * not already a crew's, not archived, not branded (a branded pool is a public promotion, not a
 * group), not dismissed ("Not now" is for good), and at least two players.
 */
export function offersCrewSave(p: {
  finishedAt: string | null
  crewId: string | null
  archivedAt: string | null
  brandSlug: string | null
  dismissedAt: string | null
  players: number
}): boolean {
  return (
    p.finishedAt !== null &&
    p.crewId === null &&
    p.archivedAt === null &&
    p.brandSlug === null &&
    p.dismissedAt === null &&
    p.players >= 2
  )
}
