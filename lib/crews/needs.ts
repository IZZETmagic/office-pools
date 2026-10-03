// Crews in Activity → Needs you: the three crew cards.
//
//   crew_seat    "Your spot's saved"           every member holding an open seat; deadline = the
//                                              pool's first lock (153); gone when taken, declined,
//                                              or the pool locks
//   crew_invite  "Dave added you to …"         whoever was added; no deadline; gone when answered
//                                              or withdrawn
//   crew_save    "Keep this group together?"   the pool's admin only; no deadline; gone when saved
//                                              or "Not now" (for good)
//
// All three light the Activity dot (Ryan, 2026-10-02) — which needs no change: the dot already
// lights for anything in Needs you.
//
// Disclosure gate: "This lists the crew decisions waiting on you — a spot saved for you, someone
// adding you, a group you could keep — and each goes away when you answer it." Nothing here names
// anyone who HASN'T taken a spot: that is the pool admin's Members tab, and only theirs.
//
// The builder is PURE (tested in __tests__/needs.test.ts); the reader below feeds it.

import type { createAdminClient } from '@/lib/supabase/server'
import { MODE_LABEL, sortNeeds, type NeedItem } from '@/lib/activity/needsYou'
import { offersCrewSave, seatState } from './rules'

type Admin = ReturnType<typeof createAdminClient>

const WORLD_CUP_MODE: Record<string, string> = {
  full_tournament: 'Full Tournament',
  progressive: 'Round by Round',
  bracket_picker: 'Bracket',
}

export function modeLabel(predictionMode: string, leagueMode: string | null): string {
  if (leagueMode) return MODE_LABEL[leagueMode] ?? 'Pool'
  return WORLD_CUP_MODE[predictionMode] ?? (predictionMode === 'league_pickem' ? MODE_LABEL.pickem : 'Pool')
}

export type SeatFact = {
  poolId: string
  poolName: string
  crewId: string
  crewName: string
  competition: string
  mode: string
  firstLockAt: string | null
  resolution: 'taken' | 'declined' | 'released' | null
  /** Already in the pool. */
  inPool: number
  /** Still holding an open seat (including this one). */
  saved: number
}

export type InviteFact = {
  inviteId: string
  crewId: string
  crewName: string
  crewClosed: boolean
  inviter: string | null
  people: number
}

export type SaveFact = {
  poolId: string
  poolName: string
  finishedAt: string | null
  crewId: string | null
  archivedAt: string | null
  brandSlug: string | null
  dismissedAt: string | null
  players: number
}

export function buildCrewNeeds(
  f: { seats: SeatFact[]; invites: InviteFact[]; saves: SaveFact[] },
  now: number,
): NeedItem[] {
  const out: NeedItem[] = []

  for (const s of f.seats) {
    if (seatState({ resolution: s.resolution }, s.firstLockAt, now) !== 'open') continue
    out.push({
      id: `need-crew-seat-${s.poolId}`,
      kind: 'crew_seat',
      pool_id: s.poolId,
      pool_name: s.poolName,
      entry_id: '',
      title: 'Your spot’s saved',
      subtitle: `${s.competition} · ${s.mode}`,
      deadline_at: s.firstLockAt,
      made: s.inPool,
      total: s.inPool + s.saved,
      cta: 'I’m in',
      link: { pathname: '/pool-preview/[id]', params: { id: s.poolId } },
      actions: [
        { id: 'decline', label: 'Not this one', style: 'secondary' },
        { id: 'take', label: 'I’m in', style: 'primary' },
      ],
      crew: { crew_id: s.crewId, name: s.crewName },
    })
  }

  for (const i of f.invites) {
    if (i.crewClosed) continue
    out.push({
      id: `need-crew-invite-${i.inviteId}`,
      kind: 'crew_invite',
      pool_id: '',
      pool_name: '',
      entry_id: '',
      title: i.inviter ? `${i.inviter} added you to ${i.crewName}` : `You’ve been added to ${i.crewName}`,
      subtitle: `${i.people} ${i.people === 1 ? 'person' : 'people'} · join once and you’re in`,
      deadline_at: null,
      made: 0,
      total: 1,
      cta: 'Join',
      link: null,
      actions: [
        { id: 'decline', label: 'No thanks', style: 'secondary' },
        { id: 'join', label: 'Join', style: 'primary' },
      ],
      crew: { crew_id: i.crewId, name: i.crewName, invite_id: i.inviteId, people: i.people },
    })
  }

  for (const s of f.saves) {
    if (!offersCrewSave(s)) continue
    out.push({
      id: `need-crew-save-${s.poolId}`,
      kind: 'crew_save',
      pool_id: s.poolId,
      pool_name: s.poolName,
      entry_id: '',
      title: 'Keep this group together?',
      subtitle: `Save these ${s.players} as a crew for next time`,
      deadline_at: null,
      made: 0,
      total: 1,
      cta: 'Save as crew',
      link: { pathname: '/pool/[id]', params: { id: s.poolId } },
      actions: [
        { id: 'dismiss', label: 'Not now', style: 'secondary' },
        { id: 'save', label: 'Save as crew', style: 'primary' },
      ],
      // The pool's name is the suggested crew name; the save sheet lets them change it.
      crew: { crew_id: null, name: s.poolName, people: s.players },
    })
  }

  return sortNeeds(out)
}

// ── Reader ──────────────────────────────────────────────────────────────────────────────────────

async function competitionNames(admin: Admin, pools: { league_season_id: string | null; tournament_id: string }[]) {
  const seasonIds = [...new Set(pools.map((p) => p.league_season_id).filter((x): x is string => !!x))]
  const tournamentIds = [...new Set(pools.filter((p) => !p.league_season_id).map((p) => p.tournament_id))]
  const [seasons, tournaments] = await Promise.all([
    seasonIds.length
      ? admin.from('league_seasons').select('season_id, competition_name, season_label').in('season_id', seasonIds)
      : Promise.resolve({ data: [] as { season_id: string; competition_name: string; season_label: string }[] }),
    tournamentIds.length
      ? admin.from('tournaments').select('tournament_id, name').in('tournament_id', tournamentIds)
      : Promise.resolve({ data: [] as { tournament_id: string; name: string }[] }),
  ])
  const s = new Map((seasons.data ?? []).map((x) => [x.season_id, `${x.competition_name} ${x.season_label}`.trim()]))
  const t = new Map((tournaments.data ?? []).map((x) => [x.tournament_id, x.name]))
  return (p: { league_season_id: string | null; tournament_id: string }) =>
    (p.league_season_id ? s.get(p.league_season_id) : t.get(p.tournament_id)) ?? ''
}

export async function readCrewNeeds(admin: Admin, userId: string, now: number): Promise<NeedItem[]> {
  // ── Seats ──
  const { data: seatRows } = await admin
    .from('crew_seats')
    .select('pool_id, crew_id, resolution')
    .eq('user_id', userId)
    .is('resolved_at', null)
  const seatPoolIds = (seatRows ?? []).map((s) => s.pool_id)

  // ── Invites ──
  const { data: inviteRows } = await admin
    .from('crew_invites')
    .select('invite_id, crew_id, invited_by')
    .eq('invitee_user_id', userId)
    .is('resolved_at', null)

  // ── Pools this person runs, for Keep this group together? ──
  const { data: adminRows } = await admin.from('pool_members').select('pool_id').eq('user_id', userId).eq('role', 'admin')
  const adminPoolIds = (adminRows ?? []).map((r) => r.pool_id)

  const poolIds = [...new Set([...seatPoolIds, ...adminPoolIds])]
  const { data: poolRows } = poolIds.length
    ? await admin
        .from('pools')
        .select('pool_id, pool_name, crew_id, archived_at, brand_slug, crew_prompt_dismissed_at, prediction_mode, league_mode, league_season_id, tournament_id')
        .in('pool_id', poolIds)
    : { data: [] as never[] }
  const pools = new Map((poolRows ?? []).map((p) => [p.pool_id, p]))
  const nameOf = await competitionNames(admin, poolRows ?? [])

  const crewIds = [...new Set([...(seatRows ?? []).map((s) => s.crew_id), ...(inviteRows ?? []).map((i) => i.crew_id)])]
  const { data: crewRows } = crewIds.length
    ? await admin.from('crews').select('crew_id, name, closed_at').in('crew_id', crewIds)
    : { data: [] as { crew_id: string; name: string; closed_at: string | null }[] }
  const crews = new Map((crewRows ?? []).map((c) => [c.crew_id, c]))

  const seats = await Promise.all(
    (seatRows ?? [])
      .filter((s) => pools.has(s.pool_id) && crews.has(s.crew_id))
      .map(async (s) => {
        const p = pools.get(s.pool_id)!
        const [{ data: lock }, { count: inPool }, { count: saved }] = await Promise.all([
          admin.rpc('pool_first_lock_at', { p_pool_id: s.pool_id }),
          admin.from('pool_members').select('member_id', { count: 'exact', head: true }).eq('pool_id', s.pool_id),
          admin.from('crew_seats').select('user_id', { count: 'exact', head: true }).eq('pool_id', s.pool_id).is('resolved_at', null),
        ])
        return {
          poolId: s.pool_id,
          poolName: p.pool_name,
          crewId: s.crew_id,
          crewName: crews.get(s.crew_id)!.name,
          competition: nameOf(p),
          mode: modeLabel(p.prediction_mode, p.league_mode),
          firstLockAt: (lock as string | null) ?? null,
          resolution: s.resolution as SeatFact['resolution'],
          inPool: inPool ?? 0,
          saved: saved ?? 0,
        }
      }),
  )

  const inviterIds = [...new Set((inviteRows ?? []).map((i) => i.invited_by).filter((x): x is string => !!x))]
  const { data: inviters } = inviterIds.length
    ? await admin.from('users').select('user_id, username, full_name').in('user_id', inviterIds)
    : { data: [] as { user_id: string; username: string; full_name: string | null }[] }
  const inviterName = new Map((inviters ?? []).map((u) => [u.user_id, u.full_name || u.username]))
  const invites = await Promise.all(
    (inviteRows ?? [])
      .filter((i) => crews.has(i.crew_id))
      .map(async (i) => {
        const { count } = await admin
          .from('crew_members')
          .select('user_id', { count: 'exact', head: true })
          .eq('crew_id', i.crew_id)
          .is('left_at', null)
        return {
          inviteId: i.invite_id,
          crewId: i.crew_id,
          crewName: crews.get(i.crew_id)!.name,
          crewClosed: !!crews.get(i.crew_id)!.closed_at,
          inviter: i.invited_by ? inviterName.get(i.invited_by) ?? null : null,
          people: count ?? 0,
        }
      }),
  )

  // Only pools that could still be offered are worth an RPC.
  const candidates = adminPoolIds
    .map((id) => pools.get(id))
    .filter((p): p is NonNullable<typeof p> => !!p && !p.crew_id && !p.archived_at && !p.brand_slug && !p.crew_prompt_dismissed_at)
  const saves = await Promise.all(
    candidates.map(async (p) => {
      const [{ data: fin }, { count: players }] = await Promise.all([
        admin.rpc('pool_finished_at', { p_pool_id: p.pool_id }),
        admin.from('pool_members').select('member_id', { count: 'exact', head: true }).eq('pool_id', p.pool_id).neq('role', 'spectator'),
      ])
      return {
        poolId: p.pool_id,
        poolName: p.pool_name,
        finishedAt: (fin as string | null) ?? null,
        crewId: p.crew_id,
        archivedAt: p.archived_at,
        brandSlug: p.brand_slug,
        dismissedAt: p.crew_prompt_dismissed_at,
        players: players ?? 0,
      }
    }),
  )

  return buildCrewNeeds({ seats, invites, saves }, now)
}
