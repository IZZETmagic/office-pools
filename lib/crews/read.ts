// Crews — every read, on the ADMIN client.
//
// The backend computes once; the frontends display (the scoring-architecture rule). So these return
// DATA — counts, ranks, ids, states — never sentences, and the web and the app word them their own
// way. The rules they apply come from lib/crews/rules.ts.
//
// ⚠ Never summed points, anywhere (rules.allTimeTable). ⚠ Last Man Standing never has a rank.
// ⚠ "Finished" is pool_finished_at() (153), never pools.status — no league pool reaches 'completed'.
//
// Cost: a crew has a handful of pools and a person a handful of crews, so the per-pool RPCs for
// first lock and finished are a few calls, not a fan-out. If that stops being true, batch them into
// one SQL function rather than caching — a stale lock time is exactly what 153 exists to avoid.

import type { createAdminClient } from '@/lib/supabase/server'
import { getScoringSource, readEntryScoring } from '@/lib/scoring/readSource'
import {
  allTimeTable,
  buildRoster,
  canDisband,
  canManage,
  canRejoin,
  canRestore,
  canSetCoCaptain,
  isActive,
  seatState,
  spotsForCap,
  type AllTimeRow,
  type CrewMember,
  type CrewRole,
  type Finish,
  type RosterSignal,
  type SeatState,
} from './rules'

type Admin = ReturnType<typeof createAdminClient>

/**
 * Someone, as the screens draw them. avatarBuild + avatarColour are what the app's MemberAvatar
 * composes a face from (327 bytes, composed on the phone — see mobile/components/avatar/MemberAvatar);
 * a member who hasn't built one gets initials on their colour.
 */
export type Person = {
  userId: string
  username: string | null
  fullName: string | null
  avatarUrl: string | null
  avatarBuild: unknown
  avatarColour: string | null
}
export type PoolMode = { predictionMode: string; leagueMode: string | null }

type PoolRow = {
  pool_id: string
  pool_name: string
  crew_id: string
  created_at: string
  archived_at: string | null
  status: string
  accepting_members: boolean | null
  prediction_mode: string
  league_mode: string | null
  league_season_id: string | null
  tournament_id: string
  admin_user_id: string
}

type CrewPool = PoolRow & { finishedAt: string | null; firstLockAt: string | null; competition: string }

// ── Building blocks ─────────────────────────────────────────────────────────────────────────────

async function people(admin: Admin, ids: string[]): Promise<Map<string, Person>> {
  const out = new Map<string, Person>()
  const unique = [...new Set(ids)]
  if (unique.length === 0) return out
  const { data, error } = await admin
    .from('users')
    .select('user_id, username, full_name, avatar_url, avatar_build, avatar_colour')
    .in('user_id', unique)
  if (error) throw new Error(`users: ${error.message}`)
  for (const u of data ?? []) {
    out.set(u.user_id, {
      userId: u.user_id,
      username: u.username,
      fullName: u.full_name,
      avatarUrl: u.avatar_url,
      avatarBuild: u.avatar_build ?? null,
      avatarColour: u.avatar_colour ?? null,
    })
  }
  return out
}

const personOf = (map: Map<string, Person>, id: string): Person =>
  map.get(id) ?? { userId: id, username: null, fullName: null, avatarUrl: null, avatarBuild: null, avatarColour: null }

/** A crew's seasons, each with its competition name, first lock (153) and finish (153). */
async function crewPools(admin: Admin, crewIds: string[]): Promise<CrewPool[]> {
  if (crewIds.length === 0) return []
  const { data, error } = await admin
    .from('pools')
    .select(
      'pool_id, pool_name, crew_id, created_at, archived_at, status, accepting_members, prediction_mode, league_mode, league_season_id, tournament_id, admin_user_id',
    )
    .in('crew_id', crewIds)
  if (error) throw new Error(`pools: ${error.message}`)
  const rows = (data ?? []) as PoolRow[]

  const seasonIds = [...new Set(rows.map((r) => r.league_season_id).filter((x): x is string => !!x))]
  const tournamentIds = [...new Set(rows.filter((r) => !r.league_season_id).map((r) => r.tournament_id))]
  const [seasons, tournaments] = await Promise.all([
    seasonIds.length
      ? admin.from('league_seasons').select('season_id, competition_name, season_label').in('season_id', seasonIds)
      : Promise.resolve({ data: [] as { season_id: string; competition_name: string; season_label: string }[] }),
    tournamentIds.length
      ? admin.from('tournaments').select('tournament_id, name').in('tournament_id', tournamentIds)
      : Promise.resolve({ data: [] as { tournament_id: string; name: string }[] }),
  ])
  const seasonName = new Map((seasons.data ?? []).map((s) => [s.season_id, `${s.competition_name} ${s.season_label}`.trim()]))
  const tournamentName = new Map((tournaments.data ?? []).map((t) => [t.tournament_id, t.name]))

  return Promise.all(
    rows.map(async (r) => {
      const [fin, lock] = await Promise.all([
        admin.rpc('pool_finished_at', { p_pool_id: r.pool_id }),
        admin.rpc('pool_first_lock_at', { p_pool_id: r.pool_id }),
      ])
      return {
        ...r,
        finishedAt: (fin.data as string | null) ?? null,
        firstLockAt: (lock.data as string | null) ?? null,
        competition: (r.league_season_id ? seasonName.get(r.league_season_id) : tournamentName.get(r.tournament_id)) ?? r.pool_name,
      }
    }),
  )
}

/** Every entry's rank in these pools — the same read the leaderboards use. LMS: no rank, ever. */
async function finishesFor(admin: Admin, pools: CrewPool[]): Promise<Finish[]> {
  const out: Finish[] = []
  for (const pool of pools) {
    const { data: entries, error } = await admin.from('pool_entries').select('entry_id, user_id').eq('pool_id', pool.pool_id)
    if (error) throw new Error(`pool_entries: ${error.message}`)
    const withUser = (entries ?? []).filter((e): e is { entry_id: string; user_id: string } => !!e.user_id)
    if (withUser.length === 0) continue
    const lms = pool.league_mode === 'last_man_standing'
    const scoring = lms
      ? null
      : await readEntryScoring(
          admin,
          withUser.map((e) => e.entry_id),
          await getScoringSource(admin, pool.pool_id, pool.prediction_mode),
        )
    for (const e of withUser) {
      out.push({ pool_id: pool.pool_id, user_id: e.user_id, rank: scoring?.get(e.entry_id)?.current_rank ?? null })
    }
  }
  return out
}

const bestRankIn = (finishes: Finish[], poolId: string, userId: string): number | null => {
  const ranks = finishes.filter((f) => f.pool_id === poolId && f.user_id === userId && f.rank !== null).map((f) => f.rank!)
  return ranks.length ? Math.min(...ranks) : null
}

const playersIn = (finishes: Finish[], poolId: string): number =>
  new Set(finishes.filter((f) => f.pool_id === poolId).map((f) => f.user_id)).size

// ── My Crews ────────────────────────────────────────────────────────────────────────────────────

export type CrewCard = {
  crewId: string
  name: string
  people: number
  seasons: number
  since: string
  /**
   * seat  — you hold an open saved spot in one of its pools (actionable, so it wins)
   * live  — one of its pools is running
   * quiet — nothing running; `poolId`/`competition` name the last season, if any
   * disbanded — its captain disbanded it (157); only that captain sees the card, to restore it
   */
  status:
    | { kind: 'seat'; poolId: string; competition: string; firstLockAt: string }
    | { kind: 'live'; poolId: string; competition: string }
    | { kind: 'quiet'; poolId: string | null; competition: string | null }
    | { kind: 'disbanded'; at: string }
  /** Most titles, then best finish. null until a season has finished with ranks. */
  leader: (Person & { titles: number }) | null
  /** Where the viewer sits all-time; null position until they have a ranked finish. */
  me: { position: number | null; titles: number; seasons: number }
  /** Up to three faces for the card — captain first, then by who joined first. */
  faces: Person[]
}

export async function listMyCrews(admin: Admin, userId: string, now: number): Promise<CrewCard[]> {
  const { data: mine, error } = await admin
    .from('crew_members')
    .select('crew_id')
    .eq('user_id', userId)
    .is('left_at', null)
  if (error) throw new Error(`crew_members: ${error.message}`)
  const crewIds = (mine ?? []).map((m) => m.crew_id)
  if (crewIds.length === 0) return []

  const [{ data: crews }, { data: members }, pools, { data: seats }] = await Promise.all([
    admin.from('crews').select('crew_id, name, created_at, closed_at, closed_reason').in('crew_id', crewIds),
    admin.from('crew_members').select('crew_id, user_id, role, joined_at').in('crew_id', crewIds).is('left_at', null),
    crewPools(admin, crewIds),
    admin.from('crew_seats').select('pool_id, crew_id, resolution').eq('user_id', userId).in('crew_id', crewIds).is('resolved_at', null),
  ])

  const finished = pools.filter((p) => p.finishedAt)
  const finishes = await finishesFor(admin, finished)
  const roleRank = { captain: 0, co_captain: 1, member: 2 } as Record<string, number>
  const facesByCrew = new Map<string, string[]>()
  for (const id of crewIds) {
    facesByCrew.set(
      id,
      (members ?? [])
        .filter((m) => m.crew_id === id)
        .sort((a, b) => (roleRank[a.role] ?? 3) - (roleRank[b.role] ?? 3) || String(a.joined_at).localeCompare(String(b.joined_at)))
        .slice(0, 3)
        .map((m) => m.user_id),
    )
  }
  const names = await people(admin, [...finishes.map((f) => f.user_id), ...[...facesByCrew.values()].flat()])

  const cards: CrewCard[] = []
  for (const crew of crews ?? []) {
    // A closed crew is gone from everyone's list — except a DISBANDED one, for its captain, who can
    // restore it (157). Everyone else sees nothing, as when a crew's last member leaves.
    const disbandedForMe =
      !!crew.closed_at &&
      crew.closed_reason === 'disbanded' &&
      (members ?? []).some((m) => m.crew_id === crew.crew_id && m.user_id === userId && m.role === 'captain')
    if (crew.closed_at && !disbandedForMe) continue
    const own = pools.filter((p) => p.crew_id === crew.crew_id)
    const running = own.filter((p) => !p.finishedAt && !p.archived_at).sort((a, b) => a.created_at.localeCompare(b.created_at))
    const openSeat = (seats ?? [])
      .filter((s) => s.crew_id === crew.crew_id)
      .map((s) => ({ s, pool: own.find((p) => p.pool_id === s.pool_id) }))
      .find(({ s, pool }) => pool && seatState({ resolution: s.resolution }, pool.firstLockAt, now) === 'open')
    const last = [...own].sort((a, b) => (b.finishedAt ?? b.created_at).localeCompare(a.finishedAt ?? a.created_at))[0]

    const table = allTimeTable(finishes.filter((f) => own.some((p) => p.pool_id === f.pool_id)))
    const top = table.find((r) => r.best !== null)
    const myIdx = table.findIndex((r) => r.user_id === userId)
    const myRow: AllTimeRow | undefined = table[myIdx]

    cards.push({
      crewId: crew.crew_id,
      name: crew.name,
      people: (members ?? []).filter((m) => m.crew_id === crew.crew_id).length,
      seasons: own.length,
      since: crew.created_at,
      status: disbandedForMe
        ? { kind: 'disbanded', at: crew.closed_at! }
        : openSeat?.pool
        ? { kind: 'seat', poolId: openSeat.pool.pool_id, competition: openSeat.pool.competition, firstLockAt: openSeat.pool.firstLockAt! }
        : running[0]
          ? { kind: 'live', poolId: running[0].pool_id, competition: running[0].competition }
          : { kind: 'quiet', poolId: last?.pool_id ?? null, competition: last?.competition ?? null },
      leader: top ? { ...personOf(names, top.user_id), titles: top.titles } : null,
      me: {
        position: myRow && myRow.best !== null ? myIdx + 1 : null,
        titles: myRow?.titles ?? 0,
        seasons: myRow?.seasons ?? 0,
      },
      faces: (facesByCrew.get(crew.crew_id) ?? []).map((id) => personOf(names, id)),
    })
  }
  // Something to act on first, then something happening, then the rest — newest crew first within each.
  const order = { seat: 0, live: 1, quiet: 2, disbanded: 3 } as const
  return cards.sort((a, b) => order[a.status.kind] - order[b.status.kind] || b.since.localeCompare(a.since))
}

// ── One crew ────────────────────────────────────────────────────────────────────────────────────

export type CrewDetail = {
  /** `disbandedAt` is set only on the captain's view of a crew they disbanded (157) — read-only, Restore. */
  crew: { crewId: string; name: string; createdAt: string; disbandedAt: string | null }
  viewer: {
    role: CrewRole | null
    active: boolean
    canManage: boolean
    canSetCoCaptain: boolean
    canRejoin: boolean
    /** The captain alone (157). */
    canDisband: boolean
    /** The captain, on a crew they disbanded. */
    canRestore: boolean
  }
  members: Array<Person & { role: CrewRole; joinedAt: string }>
  playingNow: Array<{
    poolId: string
    poolName: string
    competition: string
    /** The competition's ids — the create flow's "already playing this?" check compares these. */
    leagueSeasonId: string | null
    tournamentId: string
    mode: PoolMode
    players: number
    runBy: Person
    viewerIn: boolean
    /** null in Last Man Standing, or before the viewer has a rank. */
    viewerRank: number | null
    /** Can the viewer join from the crew page? Running, not archived, accepting members, not in it. */
    joinable: boolean
    firstLockAt: string | null
    seat: SeatState | null
  }>
  pastSeasons: Array<{
    poolId: string
    poolName: string
    competition: string
    mode: PoolMode
    finishedAt: string
    players: number
    /** Everyone who finished first. Empty for Last Man Standing. */
    winners: Person[]
    viewerRank: number | null
  }>
  allTime: Array<Person & { seasons: number; titles: number; best: number | null }>
  /** Open invites — the captain and co-captain only; null for everyone else. */
  invites: Array<{ inviteId: string; invitee: Person | null; email: string | null; createdAt: string }> | null
}

/**
 * null when the viewer may not see the crew: they were never in it, they were removed, or it closed.
 * Someone who LEFT on their own can still open it — that is where Rejoin lives.
 */
export async function readCrew(admin: Admin, crewId: string, viewerId: string, now: number): Promise<CrewDetail | null> {
  const { data: crew } = await admin
    .from('crews')
    .select('crew_id, name, created_at, closed_at, closed_reason')
    .eq('crew_id', crewId)
    .maybeSingle()
  if (!crew) return null
  const { data: memberRows, error } = await admin
    .from('crew_members')
    .select('user_id, role, joined_at, left_at, left_reason')
    .eq('crew_id', crewId)
  if (error) throw new Error(`crew_members: ${error.message}`)
  const all = (memberRows ?? []) as CrewMember[]
  const me = all.find((m) => m.user_id === viewerId) ?? null
  if (!me || (!isActive(me) && !canRejoin(me))) return null
  // Closed: gone — except a DISBANDED crew, for its captain, who can restore it (157).
  const disbanded = !!crew.closed_at && canRestore(crew, me)
  if (crew.closed_at && !disbanded) return null

  const active = all.filter((m) => m.left_at === null)
  const pools = await crewPools(admin, [crewId])
  const finished = pools.filter((p) => p.finishedAt)
  const running = pools.filter((p) => !p.finishedAt && !p.archived_at)

  const [finishes, liveFinishes, { data: myPoolRows }, { data: mySeats }] = await Promise.all([
    finishesFor(admin, finished),
    finishesFor(admin, running),
    pools.length
      ? admin.from('pool_members').select('pool_id').eq('user_id', viewerId).in('pool_id', pools.map((p) => p.pool_id))
      : Promise.resolve({ data: [] as { pool_id: string }[] }),
    admin.from('crew_seats').select('pool_id, resolution').eq('user_id', viewerId).eq('crew_id', crewId),
  ])
  const inPool = new Set((myPoolRows ?? []).map((r) => r.pool_id))
  const seatByPool = new Map((mySeats ?? []).map((s) => [s.pool_id, s.resolution as 'taken' | 'declined' | 'released' | null]))

  // A disbanded crew is read-only: the only thing left to do with it is restore it.
  const manager = !disbanded && canManage(me)
  const { data: inviteRows } = manager
    ? await admin.from('crew_invites').select('invite_id, invitee_user_id, invitee_email, created_at').eq('crew_id', crewId).is('resolved_at', null)
    : { data: null }

  const table = allTimeTable(finishes)
  const names = await people(admin, [
    ...active.map((m) => m.user_id),
    ...table.map((r) => r.user_id),
    ...pools.map((p) => p.admin_user_id),
    ...(inviteRows ?? []).map((i) => i.invitee_user_id).filter((x): x is string => !!x),
  ])

  const roleOrder = { captain: 0, co_captain: 1, member: 2 } as const
  return {
    crew: { crewId: crew.crew_id, name: crew.name, createdAt: crew.created_at, disbandedAt: disbanded ? crew.closed_at : null },
    viewer: {
      role: isActive(me) ? me.role : null,
      active: isActive(me),
      canManage: manager,
      canSetCoCaptain: !disbanded && canSetCoCaptain(me),
      canRejoin: !disbanded && canRejoin(me),
      canDisband: !disbanded && canDisband(me),
      canRestore: disbanded,
    },
    members: active
      .sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || a.joined_at.localeCompare(b.joined_at))
      .map((m) => ({ ...personOf(names, m.user_id), role: m.role, joinedAt: m.joined_at })),
    playingNow: running
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((p) => {
        const seatRes = seatByPool.has(p.pool_id) ? seatByPool.get(p.pool_id)! : undefined
        return {
          poolId: p.pool_id,
          poolName: p.pool_name,
          competition: p.competition,
          leagueSeasonId: p.league_season_id,
          tournamentId: p.tournament_id,
          mode: { predictionMode: p.prediction_mode, leagueMode: p.league_mode },
          players: playersIn(liveFinishes, p.pool_id),
          runBy: personOf(names, p.admin_user_id),
          viewerIn: inPool.has(p.pool_id),
          viewerRank: p.league_mode === 'last_man_standing' ? null : bestRankIn(liveFinishes, p.pool_id, viewerId),
          joinable: !inPool.has(p.pool_id) && p.status !== 'completed' && p.accepting_members !== false && isActive(me),
          firstLockAt: p.firstLockAt,
          seat: seatRes === undefined ? null : seatState({ resolution: seatRes }, p.firstLockAt, now),
        }
      }),
    pastSeasons: finished
      .sort((a, b) => b.finishedAt!.localeCompare(a.finishedAt!))
      .map((p) => ({
        poolId: p.pool_id,
        poolName: p.pool_name,
        competition: p.competition,
        mode: { predictionMode: p.prediction_mode, leagueMode: p.league_mode },
        finishedAt: p.finishedAt!,
        players: playersIn(finishes, p.pool_id),
        winners: [...new Set(finishes.filter((f) => f.pool_id === p.pool_id && f.rank === 1).map((f) => f.user_id))].map((id) => personOf(names, id)),
        viewerRank: bestRankIn(finishes, p.pool_id, viewerId),
      })),
    allTime: table.map((r) => ({ ...personOf(names, r.user_id), seasons: r.seasons, titles: r.titles, best: r.best })),
    invites: manager
      ? (inviteRows ?? []).map((i) => ({
          inviteId: i.invite_id,
          invitee: i.invitee_user_id ? personOf(names, i.invitee_user_id) : null,
          email: i.invitee_email,
          createdAt: i.created_at,
        }))
      : null,
  }
}

// ── Roster review ───────────────────────────────────────────────────────────────────────────────

export type RosterView = {
  rows: Array<Person & { reasons: string[]; ticked: boolean }>
  /** null = the pool holds everyone. */
  spots: number | null
  over: number
  memberCap: number | null
}

/**
 * Who gets a saved spot when `starterId` starts a pool for this crew on `tier`. Everyone active but
 * the starter, with the reasons we can actually show — "Didn't play last season" (the crew's most
 * recent pool, and only for people who were already in the crew when it began) and "Hasn't opened
 * SportPool in 6 months" (users.last_login). Email bounces live in Resend, not Postgres — not in v1.
 */
export async function readRoster(
  admin: Admin,
  p: { crewId: string; starterId: string; tier: string; now: number },
): Promise<RosterView | null> {
  const { data: rows } = await admin
    .from('crew_members')
    .select('user_id, role, joined_at, left_at, left_reason')
    .eq('crew_id', p.crewId)
    .is('left_at', null)
  const active = (rows ?? []) as CrewMember[]
  if (!active.some((m) => m.user_id === p.starterId)) return null
  const others = active.filter((m) => m.user_id !== p.starterId)

  const { data: lastPool } = await admin
    .from('pools')
    .select('pool_id, created_at')
    .eq('crew_id', p.crewId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const playedLast = new Set<string>()
  if (lastPool) {
    const { data: entries } = await admin.from('pool_entries').select('user_id').eq('pool_id', lastPool.pool_id)
    for (const e of entries ?? []) if (e.user_id) playedLast.add(e.user_id)
  }

  const ids = others.map((m) => m.user_id)
  const { data: users } = ids.length
    ? await admin.from('users').select('user_id, username, full_name, avatar_url, avatar_build, avatar_colour, last_login').in('user_id', ids)
    : {
        data: [] as {
          user_id: string
          username: string
          full_name: string | null
          avatar_url: string | null
          avatar_build: unknown
          avatar_colour: string | null
          last_login: string | null
        }[],
      }
  const byId = new Map((users ?? []).map((u) => [u.user_id, u]))

  const signals: RosterSignal[] = others.map((m) => ({
    user_id: m.user_id,
    playedLastSeason: !lastPool || m.joined_at > lastPool.created_at ? null : playedLast.has(m.user_id),
    lastLogin: byId.get(m.user_id)?.last_login ?? null,
  }))

  const { data: cap } = await admin.rpc('pool_tier_member_cap', { p_tier: p.tier })
  const memberCap = (cap as number | null) ?? null
  const roster = buildRoster(signals, spotsForCap(memberCap), p.now)
  return {
    rows: roster.rows.map((r) => {
      const u = byId.get(r.user_id)
      return {
        userId: r.user_id,
        username: u?.username ?? null,
        fullName: u?.full_name ?? null,
        avatarUrl: u?.avatar_url ?? null,
        avatarBuild: u?.avatar_build ?? null,
        avatarColour: u?.avatar_colour ?? null,
        reasons: r.reasons,
        ticked: r.ticked,
      }
    }),
    spots: roster.spots,
    over: roster.over,
    memberCap,
  }
}

// ── A pool's crew ───────────────────────────────────────────────────────────────────────────────

export type PoolCrewView = {
  /** null when the pool is not a crew's. */
  crew: { crewId: string; name: string } | null
  /** Members already in the pool. */
  inPool: number
  /** Open saved spots — unanswered and before the first lock. 0 after it: a seat lapses at the lock. */
  saved: number
  firstLockAt: string | null
  /**
   * WHO is still pending — the pool's ADMIN only (decision 5: a count for members, names for the
   * admin). null for everyone else, so a member's payload can never carry the names.
   */
  pending: Person[] | null
}

/**
 * The pool screens' crew line. null when the viewer is not in the pool (the crew tables are deny-all,
 * so this route is the only way a client learns a pool's crew, and it answers members only).
 */
export async function readPoolCrew(admin: Admin, poolId: string, viewerId: string, now: number): Promise<PoolCrewView | null> {
  const { data: me } = await admin.from('pool_members').select('role').eq('pool_id', poolId).eq('user_id', viewerId).maybeSingle()
  if (!me) return null
  const { data: pool } = await admin.from('pools').select('crew_id').eq('pool_id', poolId).maybeSingle()
  if (!pool) return null
  if (!pool.crew_id) return { crew: null, inPool: 0, saved: 0, firstLockAt: null, pending: null }

  const [{ data: crew }, { count: inPool }, { data: lock }, { data: seats }] = await Promise.all([
    admin.from('crews').select('crew_id, name').eq('crew_id', pool.crew_id).maybeSingle(),
    admin.from('pool_members').select('member_id', { count: 'exact', head: true }).eq('pool_id', poolId),
    admin.rpc('pool_first_lock_at', { p_pool_id: poolId }),
    admin.from('crew_seats').select('user_id, resolution').eq('pool_id', poolId).is('resolved_at', null),
  ])
  const firstLockAt = (lock as string | null) ?? null
  const open = (seats ?? []).filter((s) => seatState({ resolution: s.resolution }, firstLockAt, now) === 'open')
  const isAdmin = me.role === 'admin'
  const names = isAdmin ? await people(admin, open.map((s) => s.user_id)) : null
  return {
    crew: crew ? { crewId: crew.crew_id, name: crew.name } : null,
    inPool: inPool ?? 0,
    saved: open.length,
    firstLockAt,
    pending: names ? open.map((s) => personOf(names, s.user_id)) : null,
  }
}
