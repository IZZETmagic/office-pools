import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PoolDetail } from './PoolDetail'
import { getPoolData, fetchAllPages } from '@/lib/poolData'
import type {
  ExistingPrediction,
  PoolRoundState,
  EntryRoundSubmission,
  BPGroupRanking,
  BPThirdPlaceRanking,
  BPKnockoutPick,
} from './types'

// Force dynamic rendering — the PAGE stays per-user (auth, membership, the
// viewer's own picks). The heavy SHARED per-pool data is fetched via
// getPoolData(), which is cached (behind sync_settings.pool_cache_enabled) so
// we don't re-query the database for every viewer on every Realtime refresh.
// See SCALE_PLAN.md Phase 1a.
export const dynamic = 'force-dynamic'

export default async function PoolPage({
  params,
}: {
  params: Promise<{ pool_id: string }>
}) {
  const { pool_id } = await params
  const supabase = await createClient()

  // ---- PER-USER (never cached) -------------------------------------------
  // STEP 1: Get authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // STEP 2: Look up user_id
  const { data: userData } = await supabase
    .from('users')
    .select('user_id, is_super_admin')
    .eq('auth_user_id', user.id)
    .single()
  if (!userData) redirect('/dashboard')

  // STEP 3: Membership (super admins can bypass)
  const { data: membership } = await supabase
    .from('pool_members')
    .select('member_id, role, has_seen_how_to_play')
    .eq('pool_id', pool_id)
    .eq('user_id', userData.user_id)
    .single()

  const isSuperAdminViewing = !membership && userData.is_super_admin === true
  if (!membership && !isSuperAdminViewing) redirect('/dashboard')
  const isAdmin = isSuperAdminViewing ? true : membership!.role === 'admin'

  // ---- SHARED PER-POOL (cacheable) ---------------------------------------
  const shared = await getPoolData(pool_id)
  const pool = shared.pool
  if (!pool) redirect('/dashboard')

  const {
    members, matches, settings, teams, allPredictions, conductData, matchScores,
    bonusScores, bpProvisionalScoring,
  } = shared

  // ---- PER-USER derivations on top of shared data ------------------------
  const currentMember = membership
    ? members.find((m) => m.member_id === membership.member_id)
    : undefined
  const userEntries = currentMember?.entries || []
  const userEntryIds = userEntries.map((e) => e.entry_id)
  const defaultEntry = userEntries[0]

  // The viewer's own predictions for their default entry (small, per-user).
  const { data: userPredictions } = defaultEntry
    ? await supabase
        .from('predictions')
        .select('match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id, prediction_id')
        .eq('entry_id', defaultEntry.entry_id)
    : { data: [] }

  // Progressive pools: round states (+lazy seed) and the viewer's submissions.
  // Kept uncached because the seed performs an INSERT side-effect.
  let roundStates: PoolRoundState[] = []
  let roundSubmissions: EntryRoundSubmission[] = []
  if (pool.prediction_mode === 'progressive') {
    const [roundStatesRes, roundSubsRes] = await Promise.all([
      supabase.from('pool_round_states').select('*').eq('pool_id', pool_id).order('created_at', { ascending: true }),
      userEntryIds.length > 0
        ? supabase.from('entry_round_submissions').select('*').in('entry_id', userEntryIds)
        : Promise.resolve({ data: [] }),
    ])
    roundStates = (roundStatesRes.data || []) as PoolRoundState[]
    roundSubmissions = (roundSubsRes.data || []) as EntryRoundSubmission[]

    if (roundStates.length === 0) {
      const roundKeys = ['group', 'round_32', 'round_16', 'quarter_final', 'semi_final', 'third_place', 'final']
      const now = new Date().toISOString()
      const seedRows = roundKeys.map((key) => ({
        pool_id: pool_id,
        round_key: key,
        state: key === 'group' ? 'open' : 'locked',
        deadline: key === 'group' && pool.prediction_deadline ? pool.prediction_deadline : null,
        opened_at: key === 'group' ? now : null,
      }))
      const { createAdminClient } = await import('@/lib/supabase/server')
      const { data: seeded } = await createAdminClient()
        .from('pool_round_states')
        .insert(seedRows)
        .select('*')
      if (seeded) roundStates = seeded as PoolRoundState[]
    }
  }

  // Bracket_picker data — fetched PER-VIEWER with the user (RLS) client, NOT
  // from the shared cache. RLS scopes a non-admin member to their OWN picks, so
  // each viewer sees exactly what they see today (admins see all). This is why
  // it is deliberately excluded from getPoolData. Mirrors the original page.tsx.
  const allEntryIds = members.flatMap((m) => m.entries || []).map((e) => e.entry_id)
  let bpGroupRankings: BPGroupRanking[] = []
  let bpThirdPlaceRankings: BPThirdPlaceRanking[] = []
  let bpKnockoutPicks: BPKnockoutPick[] = []
  let allBPGroupRankings: BPGroupRanking[] = []
  let allBPThirdPlaceRankings: BPThirdPlaceRanking[] = []
  let allBPKnockoutPicks: BPKnockoutPick[] = []
  const bpEntryProgressMap: Record<string, number> = {}
  if (pool.prediction_mode === 'bracket_picker') {
    if (defaultEntry) {
      const [grRes, tpRes, kpRes] = await Promise.all([
        supabase.from('bracket_picker_group_rankings').select('*').eq('entry_id', defaultEntry.entry_id),
        supabase.from('bracket_picker_third_place_rankings').select('*').eq('entry_id', defaultEntry.entry_id),
        supabase.from('bracket_picker_knockout_picks').select('*').eq('entry_id', defaultEntry.entry_id),
      ])
      bpGroupRankings = (grRes.data ?? []) as BPGroupRanking[]
      bpThirdPlaceRankings = (tpRes.data ?? []) as BPThirdPlaceRanking[]
      bpKnockoutPicks = (kpRes.data ?? []) as BPKnockoutPick[]
    }
    if (allEntryIds.length > 0) {
      // PAGINATED — large bracket pools exceed PostgREST's 1000-row cap, which
      // truncated this fetch and gave ADMIN viewers (who can read all entries)
      // wrong provisional standings. Non-admins are RLS-scoped to their own
      // picks (well under 1000), so they are unaffected. Stored/official scores
      // were already correct (the sweep paginates); this fixes the live overlay.
      ;[allBPGroupRankings, allBPThirdPlaceRankings, allBPKnockoutPicks] = await Promise.all([
        fetchAllPages<BPGroupRanking>('bp_group_all', (from, to) =>
          supabase.from('bracket_picker_group_rankings').select('*').in('entry_id', allEntryIds).order('entry_id', { ascending: true }).range(from, to)),
        fetchAllPages<BPThirdPlaceRanking>('bp_third_all', (from, to) =>
          supabase.from('bracket_picker_third_place_rankings').select('*').in('entry_id', allEntryIds).order('entry_id', { ascending: true }).range(from, to)),
        fetchAllPages<BPKnockoutPick>('bp_knockout_all', (from, to) =>
          supabase.from('bracket_picker_knockout_picks').select('*').in('entry_id', allEntryIds).order('entry_id', { ascending: true }).range(from, to)),
      ])
      for (const row of [...allBPGroupRankings, ...allBPThirdPlaceRankings, ...allBPKnockoutPicks]) {
        if (userEntryIds.includes(row.entry_id)) {
          bpEntryProgressMap[row.entry_id] = (bpEntryProgressMap[row.entry_id] || 0) + 1
        }
      }
    }
  }

  // Deadline + lazy auto-submit (per-request side-effect, unchanged).
  const isPastDeadline = pool.prediction_deadline
    ? new Date(pool.prediction_deadline) < new Date()
    : false
  if (isPastDeadline) {
    import('@/lib/auto-submit').then(({ autoSubmitDraftEntries }) => {
      autoSubmitDraftEntries(pool_id).catch(() => {})
    })
  }

  const psoEnabled = settings?.pso_enabled ?? true

  return (
    <PoolDetail
      pool={pool}
      bpProvisionalScoring={bpProvisionalScoring}
      members={members}
      matches={matches}
      settings={settings}
      userPredictions={(userPredictions || []) as ExistingPrediction[]}
      allPredictions={allPredictions}
      teams={teams}
      conductData={conductData}
      matchScores={matchScores}
      bonusScores={bonusScores}
      memberId={membership?.member_id ?? null}
      currentUserId={userData.user_id}
      isAdmin={isAdmin}
      isPastDeadline={isPastDeadline}
      psoEnabled={psoEnabled}
      userEntries={userEntries}
      isSuperAdmin={userData.is_super_admin ?? false}
      isSuperAdminViewing={isSuperAdminViewing}
      hasSeenHowToPlay={membership?.has_seen_how_to_play ?? true}
      roundStates={roundStates}
      roundSubmissions={roundSubmissions}
      bpGroupRankings={bpGroupRankings}
      bpThirdPlaceRankings={bpThirdPlaceRankings}
      bpKnockoutPicks={bpKnockoutPicks}
      bpEntryProgressMap={bpEntryProgressMap}
      allBPGroupRankings={allBPGroupRankings}
      allBPThirdPlaceRankings={allBPThirdPlaceRankings}
      allBPKnockoutPicks={allBPKnockoutPicks}
    />
  )
}
