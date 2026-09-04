import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { withPerfLogging } from '@/lib/api-perf'
import { getShadowReadPools, readEntryScoring } from '@/lib/scoring/readSource'
import { readLeagueCardFacts, type LeagueCardPool } from '@/lib/league/poolCards'
import { isSingleDecision } from '@/lib/pools/card'
import { getLevelName } from '@/lib/levelNames'

// GET /api/users/:user_id/home-scoring
//
// Per-entry scoring aggregates for the RN home screen: recent form, accuracy
// counts and the current scoring streak.
//
// This route exists because the app CANNOT compute these itself. The shadow
// tables are RLS deny-all (0 policies), so a user-scoped PostgREST client
// reads nothing from them, and `readSource` is server-side TypeScript the app
// never executes. Duplicating source resolution in the client is exactly the
// divergence this programme keeps removing — so the resolution lives here and
// the app asks for the answer.
//
// It also returns DERIVED aggregates rather than rows. The hook it replaces
// pulled every scored match for every entry the user owns — thousands of rows
// — to produce a handful of small numbers. This returns one object per entry.
//
// The counting itself happens in Postgres (`entry_match_score_summary`, migration
// 037) rather than here, so those rows never leave the database at all: 287,098
// rows across all users collapses to 4,982, one per entry.

type FormResult = 'exact' | 'winner_gd' | 'winner' | 'miss'

type SummaryRow = {
  entry_id: string
  total_completed: number
  exact_count: number
  correct_count: number
  streak: number
  form: FormResult[] | null
}

export type EntryScoringSummary = {
  entry_id: string
  /** Newest-last, at most 5 — the form indicator dots. */
  form: FormResult[]
  total_completed: number
  exact_count: number
  correct_count: number
  /** Consecutive point-scoring matches counting back from the most recent. */
  streak: number
  /** Same source as the pool's own leaderboard — see the note on the route. */
  match_points: number
  bonus_points: number
  point_adjustment: number
  /** ⚠ The PICKING half in Showdown — add `duel_points` for the season total. */
  scored_total_points: number
  /**
   * Showdown's second currency (migration 121), 0 in every other mode.
   *
   * Sent so the phone's Home card can show the same number as the pool's own
   * Showdown board. Without it the card read 3,200 where the board read 5,200.
   */
  duel_points: number
  current_rank: number | null
  /**
   * The STORED XP level from `entry_xp_state`, never a client-side derivation —
   * and NULL for a league entry, matching the web pools page.
   *
   * ⚠ NULL is meaningful twice over. XP is World Cup machinery end to end:
   * `entry_xp_state` is written by World Cup scoring, so a league entry has no
   * row and a level would be 1 for everyone. The web card shows the matchweek
   * in that space instead; the phone must not invent a number where the web
   * deliberately shows none.
   */
  current_level: number | null
  /** Paired here so the name can never drift from the number. */
  level_name: string | null
}

/** An entry with no scored matches — bracket_picker entries are always this. */
function emptySummary(entryId: string): EntryScoringSummary {
  return {
    entry_id: entryId,
    form: [],
    total_completed: 0,
    exact_count: 0,
    correct_count: 0,
    streak: 0,
    match_points: 0,
    bonus_points: 0,
    point_adjustment: 0,
    scored_total_points: 0,
    duel_points: 0,
    current_rank: null,
    current_level: null,
    level_name: null,
  }
}

/**
 * Aggregates come back already computed — see migration 037 for the counting,
 * the streak rule and the ordering guarantee (form is newest-LAST).
 *
 * The RPC returns at most one row per requested entry, so unlike a raw
 * match_scores read this can never approach PostgREST's 1,000-row response cap.
 */
async function fetchSummaries(
  admin: ReturnType<typeof createAdminClient>,
  entryIds: string[],
  source: 'shadow' | 'prod',
): Promise<SummaryRow[]> {
  if (entryIds.length === 0) return []
  const { data, error } = await admin.rpc('entry_match_score_summary', {
    p_entry_ids: entryIds,
    p_source: source,
  })
  // Surfaced, not swallowed: a discarded error here is exactly how this screen's
  // form and accuracy silently rendered empty for everyone before this route.
  if (error) throw new Error(`entry_match_score_summary(${source}): ${error.message}`)
  return (data ?? []) as SummaryRow[]
}

/**
 * Has anything in this pool been scored yet — the gate the Rank tile sits behind.
 *
 * ## Why the server answers this and not the phone
 *
 * The rule is *"has ANYONE in this pool scored"*, and the phone only ever holds
 * its own entries. A member sitting last in a pool where everybody else has
 * points would compute `false` from what it has and hide a rank that is real.
 * It is also the same rule the web card uses (app/dashboard/page.tsx), so
 * answering it once here is what keeps the two surfaces agreeing.
 *
 * ## Two sources, because a league is scored by its own engine
 *
 * A World Cup pool's points are on `pool_entries.scored_total_points`; a
 * league's are in `league_entry_totals.total_points`, which is deny-all and
 * needs the admin client. It stays a `> 0` gate rather than `final_rank != null`
 * because the league engine ranks every entry from the moment the pool exists,
 * all of them on zero — so a rank exists long before it means anything.
 *
 * ⚠ COUNTS, NOT ROWS, and that is deliberate. The web does this as one
 * unbounded `.select()` per source, which returns a row per scoring entry — 67
 * for the account this was measured on, but PostgREST truncates at 1,000 with
 * no error, and a member of several large pools would silently gate a scored
 * pool to "not started". `head: true` returns a number and cannot truncate.
 * The web version should follow.
 */
async function readHasScoringByPool(
  admin: ReturnType<typeof createAdminClient>,
  poolIds: string[],
  leaguePools: Set<string>,
): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>()
  await Promise.all(
    poolIds.map(async (poolId) => {
      if (leaguePools.has(poolId)) {
        const { count, error } = await admin
          .from('league_entry_totals')
          .select('entry_id', { count: 'exact', head: true })
          .eq('pool_id', poolId)
          .gt('total_points', 0)
        if (error) console.error(`[home-scoring] league gate ${poolId}:`, error.message)
        out.set(poolId, (count ?? 0) > 0)
        return
      }
      const { count, error } = await admin
        .from('pool_entries')
        .select('entry_id, pool_members!inner(pool_id)', { count: 'exact', head: true })
        .eq('pool_members.pool_id', poolId)
        .gt('scored_total_points', 0)
      if (error) console.error(`[home-scoring] gate ${poolId}:`, error.message)
      out.set(poolId, (count ?? 0) > 0)
    }),
  )
  return out
}

async function handleGET(
  _request: NextRequest,
  { params }: { params: Promise<{ user_id: string }> },
) {
  const { user_id } = await params

  const auth = await requireAuth()
  if (auth.error) return auth.error
  const { userData } = auth.data

  // Caller can only fetch their own summary (super admins may inspect any).
  if (userData.user_id !== user_id && !userData.is_super_admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Entries are resolved server-side from the authenticated user rather than
  // accepted from the client: the read below runs as the service role, so a
  // client-supplied entry list would be a way to read anyone's scores.
  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .from('pool_members')
    .select('pool_id, pool_entries(entry_id)')
    .eq('user_id', user_id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  type MemberRow = { pool_id: string; pool_entries?: Array<{ entry_id: string }> | null }
  const memberships = (rows ?? []) as MemberRow[]

  // Which of the user's pools are leagues — asked as a flat list of ids rather
  // than embedded in the membership select, because PostgREST types an embedded
  // relation as an array and the shape fight is not worth a join we can do as an
  // indexed lookup on ids we already hold.
  const poolIds = [...new Set(memberships.map((m) => m.pool_id))]
  const { data: leaguePoolRows, error: leagueErr } = await admin
    .from('pools')
    .select('pool_id, league_season_id, league_mode, league_table_lock_at')
    .in('pool_id', poolIds)
    .not('league_season_id', 'is', null)
    .returns<
      Array<{
        pool_id: string
        league_season_id: string | null
        league_mode: string | null
        league_table_lock_at: string | null
      }>
    >()
  if (leagueErr) {
    return NextResponse.json({ error: leagueErr.message }, { status: 500 })
  }
  const leaguePoolById = new Map((leaguePoolRows ?? []).map((r) => [r.pool_id, r]))
  const leaguePools = new Set(leaguePoolById.keys())

  const shadowPools = await getShadowReadPools(admin)
  const shadowIds: string[] = []
  const prodIds: string[] = []
  // ⚠ A THIRD BUCKET, and its absence was a bug rather than a gap. Every entry
  // used to be sorted into shadow or prod, so a league entry was read against
  // the World Cup's totals table, found nothing, and fell through to
  // `emptySummary()` — `current_rank: null`, points 0. Nothing errored, because
  // "no row for this entry" is a legitimate answer to the wrong question.
  //
  // `readEntryScoring` has had a real league arm since the vertical slice; this
  // route simply never reached it. Measured on production 2026-09-02: five
  // league entries whose `league_entry_totals.final_rank` read 1, 6, 2, 1 and 1
  // showed a dash on the phone, while `pool_entries.current_rank` — the
  // client's fallback — was NULL on all five.
  const leagueIds: string[] = []
  // Entries whose pool is a league — they get NO level, see `current_level`.
  const leagueEntryIds = new Set<string>()
  for (const m of memberships) {
    for (const e of m.pool_entries ?? []) {
      if (!e.entry_id) continue
      if (leaguePools.has(m.pool_id)) {
        leagueIds.push(e.entry_id)
        leagueEntryIds.add(e.entry_id)
        continue
      }
      ;(shadowPools.has(m.pool_id) ? shadowIds : prodIds).push(e.entry_id)
    }
  }

  // What `readLeagueCardFacts` needs, per league pool. `entryId` is the entry
  // whose progress the card describes — a member has exactly one in every
  // league pool the product can currently create, so "the first" and "the best"
  // are the same entry.
  const leagueCardPools: LeagueCardPool[] = []
  for (const m of memberships) {
    const row = leaguePoolById.get(m.pool_id)
    if (!row) continue
    leagueCardPools.push({
      poolId: m.pool_id,
      seasonId: row.league_season_id,
      leagueMode: row.league_mode,
      tableLockAt: row.league_table_lock_at,
      entryId: (m.pool_entries ?? [])[0]?.entry_id ?? null,
    })
  }

  const allIds = [...shadowIds, ...prodIds, ...leagueIds]
  if (allIds.length === 0) {
    return NextResponse.json({ entries: [] })
  }

  const [shadowSummaries, prodSummaries, shadowTotals, prodTotals, leagueTotals, scoringPools, cardFacts, levelRows] =
    await Promise.all([
      fetchSummaries(admin, shadowIds, 'shadow'),
      fetchSummaries(admin, prodIds, 'prod'),
      readEntryScoring(admin, shadowIds, 'shadow'),
      readEntryScoring(admin, prodIds, 'prod'),
      // ⚠ `league_entry_totals` is one of migration 050's deny-all tables, so
      // this MUST be the admin client. A user-scoped read returns [] with
      // error: null, which is how a rank that exists renders as a dash.
      //
      // No `fetchSummaries` counterpart: `entry_match_score_summary` takes
      // 'shadow' | 'prod' and counts `match_scores`. A league's form lives in
      // `league_match_scores` and needs `readLeagueFormByEntry`, which is a
      // separate piece of work — so a league entry's form stays empty here, as
      // it already was. Rank and points are what this fixes.
      readEntryScoring(admin, leagueIds, 'league'),
      readHasScoringByPool(admin, poolIds, leaguePools),
      // ⚠ THE UNIT IS THE OPEN MATCHWEEK, not the season — the same call the
      // web card makes, so the two cannot disagree about what "picked" means.
      // Over 380 fixtures "12 of 380" would be true and useless; the weekly
      // question is the one a member is asking. Table and Last Man Standing
      // come back as 1-of-1, because a table order is never half-done and an
      // LMS week is one club.
      readLeagueCardFacts(admin, leagueCardPools),
      // Two named columns, keyed by the entries already resolved above. The
      // level is READ, never derived — the phone used to run its own points →
      // level table, against `scored_total_points`, which is not XP at all.
      admin
        .from('entry_xp_state')
        .select('entry_id, current_level')
        .in('entry_id', allIds)
        .returns<Array<{ entry_id: string; current_level: number | null }>>(),
    ])

  // Seed every requested entry, then overlay. The RPC omits entries with no
  // scored matches rather than returning zero rows, so the seed is what makes a
  // missing row and an all-zero row mean the same thing.
  const byEntry = new Map<string, EntryScoringSummary>()
  for (const id of allIds) byEntry.set(id, emptySummary(id))

  for (const row of [...shadowSummaries, ...prodSummaries]) {
    const summary = byEntry.get(row.entry_id)
    if (!summary) continue
    summary.total_completed = row.total_completed
    summary.exact_count = row.exact_count
    summary.correct_count = row.correct_count
    summary.streak = row.streak
    summary.form = row.form ?? []
  }

  // Points and rank must follow the same source as the pool's leaderboard, or
  // the home card and the pool disagree for the same member. Bracket-picker
  // entries have no match_scores at all, so this is the ONLY scoring data they
  // carry — the form/accuracy half is legitimately empty for them.
  for (const [id, summary] of byEntry) {
    const totals = shadowTotals.get(id) ?? prodTotals.get(id) ?? leagueTotals.get(id)
    if (!totals) continue
    summary.match_points = totals.match_points
    summary.bonus_points = totals.bonus_points
    summary.point_adjustment = totals.point_adjustment
    summary.scored_total_points = totals.scored_total_points
    summary.duel_points = totals.duel_points
    summary.current_rank = totals.current_rank
  }

  // ⚠ A discarded PostgREST error here would silently blank every level, which
  // is the exact shape of bug that left form and accuracy empty for months.
  if (levelRows.error) {
    return NextResponse.json({ error: levelRows.error.message }, { status: 500 })
  }
  for (const row of levelRows.data ?? []) {
    const summary = byEntry.get(row.entry_id)
    if (!summary || leagueEntryIds.has(row.entry_id)) continue
    summary.current_level = row.current_level ?? 1
    summary.level_name = getLevelName(summary.current_level)
  }

  return NextResponse.json({
    entries: [...byEntry.values()],
    // The rank gate, per pool. See `readHasScoringByPool` — the phone cannot
    // answer this from what it holds, because it only ever sees its OWN entries.
    pools: [...scoringPools].map(([pool_id, has_scoring_started]) => {
      const facts = cardFacts.get(pool_id)
      const leagueMode = leaguePoolById.get(pool_id)?.league_mode ?? null
      return {
        pool_id,
        has_scoring_started,
        // ⚠ NULL FOR A WORLD CUP POOL, and null is not zero. The phone still
        // counts those itself from `predictions` against `matches`, which is
        // correct today; it falls back to that whenever these are null. A World
        // Cup pool sending 0/0 here would blank a ring that works.
        total_picks: facts ? facts.totalPicks : null,
        made_picks: facts ? facts.madePicks : null,
        has_submitted: facts ? facts.hasSubmitted : null,
        // Table and Last Man Standing are one decision, so the ring is a state
        // rather than a count — there is no "1" worth printing inside it.
        is_single_decision: facts ? isSingleDecision({ league_mode: leagueMode }) : null,
      }
    }),
  })
}

export const GET = withPerfLogging('users/home-scoring', handleGET)
