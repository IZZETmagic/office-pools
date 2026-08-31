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
    members, settings, conductData,
    bonusScores, bpProvisionalScoring, tournamentAwards, entryStats, matchdayMVP,
    matchAccuracy,
  } = shared
  // Reassignable: a league pool replaces both with its own competition's rows.
  // getPoolData scopes these to `pool.tournament_id`, which for a league is the
  // placeholder row carrying 0 matches and 0 teams — so they arrive empty and
  // correct, rather than wrong, and the league branch below fills them.
  let matches = shared.matches
  let teams = shared.teams

  // ---- PER-USER derivations on top of shared data ------------------------
  const currentMember = membership
    ? members.find((m) => m.member_id === membership.member_id)
    : undefined
  const userEntries = currentMember?.entries || []
  const userEntryIds = userEntries.map((e) => e.entry_id)
  const defaultEntry = userEntries[0]

  // The viewer's own predictions for their default entry (small, per-user).
  // Explicitly typed: the league branch below replaces this with adapter
  // output, and inference from the World Cup select alone is too narrow.
  let userPredictions: ExistingPrediction[] | null
  ;({ data: userPredictions } = (defaultEntry
    ? await supabase
        .from('predictions')
        .select('match_id, predicted_home_score, predicted_away_score, predicted_home_pso, predicted_away_pso, predicted_winner_team_id, prediction_id')
        .eq('entry_id', defaultEntry.entry_id)
    : { data: [] }) as { data: ExistingPrediction[] | null })

  // Progressive pools: round states (+lazy seed) and the viewer's submissions.
  // Kept uncached because the seed performs an INSERT side-effect.
  let roundStates: PoolRoundState[] = []
  // Results-depth picks, keyed by fixture id. Empty for every Scores pool and
  // every World Cup pool; PoolDetail only reads it when league_depth='results'.
  let leagueOutcomeMap = new Map<string, 'home' | 'draw' | 'away'>()
  // The real league table, ingested from the feed (migration 075). Empty for
  // every World Cup pool — the tab only exists for a league.
  let leagueStandings: Awaited<ReturnType<typeof import('@/lib/league/read').readLeagueStandings>>['rows'] = []
  /** entry_id -> its last five score_types, oldest first. Empty for a World Cup pool. */
  let leagueForm: Map<string, string[]> = new Map()
  /** club_id -> who they play next, for the league table. */
  let leagueNextFixture: Map<string, import('@/lib/league/read').NextFixture> = new Map()
  let leagueStandingsAt: string | null = null
  let tableModeData: import('./PoolDetail').TableModeData | null = null
  let showdownData: import('./PoolDetail').ShowdownData | null = null
  let lmsData: import('./PoolDetail').LmsData | null = null
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

  // ---- LEAGUE ------------------------------------------------------------
  // Ryan's 2026-08-15 decision, applied: the front end is unchanged and points
  // at the new data. Everything below this block — PoolDetail, the prediction
  // flow, the tabs — is the same code the World Cup runs.
  //
  // Round state is DERIVED from `league_matchweeks` on every read rather than
  // seeded into `pool_round_states`. A league pool holds zero of those rows by
  // design: the table cannot express 38 matchweeks whose locks are per-week
  // facts of the fixture list, and seeding them is what the P0 fix removed.
  //
  // Submission state is derived from the picks themselves rather than read from
  // `entry_round_submissions`, for the same reason the write path never sets
  // `pool_entries.has_submitted_predictions`: that column is one of only two
  // doors by which a league entry can reach the World Cup scoring selectors.
  if (pool.league_season_id) {
    const { readLeaguePoolView, readLeaguePredictions, deriveRoundSubmissions, readLeagueStandings } =
      await import('@/lib/league/read')

    // --------------------------------------------------------- Showdown
    // The fixture list, the results and the duel table are the same rows —
    // `league_duels` holds unsettled duels from pool creation, which is what
    // lets the schedule be published in advance.
    if (pool.league_mode === 'showdown') {
      const { readPoolDuels } = await import('@/lib/league/duels')
      // ⚠ TOTALS VIA ADMIN. `league_entry_totals` is deny-all (migration 050),
      // so the user-scoped read this used to do returned zero rows and no
      // error — DuelsTab got an empty map and quietly recomputed duel points
      // itself, which is the divergence ShowdownCardFacts warns about.
      const { readEntryTotals } = await import('@/lib/league/duels')
      const { createAdminClient: adminForTotals } = await import('@/lib/supabase/server')
      const [{ duels, error: duelErr }, totalsRes] = await Promise.all([
        readPoolDuels(supabase, pool_id),
        readEntryTotals(adminForTotals(), pool_id),
      ])
      if (duelErr) console.error('[pool page] duels failed:', duelErr)
      if (totalsRes.error) console.error('[pool page] entry totals failed:', totalsRes.error)

      // Names for BOTH sides of every duel, so a rival is a person rather than
      // a uuid. Read from the members already loaded above.
      const entryNames = new Map<string, string>()
      // The person behind each entry, so a corner can carry a face rather than
      // two letters. Same rows the names come from — no extra read.
      const entryPeople = new Map<string, { user_id: string; full_name: string | null; username: string | null }>()
      for (const m of members) {
        for (const e of m.entries ?? []) {
          entryNames.set(e.entry_id, e.entry_name || m.users?.username || 'Entry')
          if (m.users?.user_id) {
            entryPeople.set(e.entry_id, {
              user_id: m.users.user_id,
              full_name: m.users.full_name ?? null,
              username: m.users.username ?? null,
            })
          }
        }
      }

      showdownData = {
        duels,
        entryNames,
        entryPeople,
        livePoints: new Map(),
        perFixture: new Map(),
        fixtures: [],
        totals: totalsRes.totals,
        ownEntryIds: (userEntries ?? []).map((e) => e.entry_id),
        openMatchweek: null,
        inPlayMatchweek: null,
        sealedMatchweek: null,
        sealedOpensAfter: null,
        sealedOpensAtLatest: null,
        duelPoints: new Map(
          [...totalsRes.totals].map(([entryId, t]) => [entryId, t.duelPoints]),
        ),
      }
    }

    // ------------------------------------------------ Last Man Standing
    if (pool.league_mode === 'last_man_standing') {
      const { readLmsState } = await import('@/lib/league/lms')
      const { readSeasonClubs } = await import('@/lib/league/table')
      // ⚠ ADMIN for the totals. `league_entry_totals` is deny-all (migration
      // 050), so the user-scoped read this used to do returned zero rows and no
      // error — `roundsWon` was always an empty map, and SurvivorTab only paints
      // its "N rounds won" badge when the count is > 0, so the badge could never
      // appear. Invisible today because nobody has won a round in a two-week-old
      // season; the moment somebody does, the POOLS CARD says "2 rounds won"
      // (it already reads this column on admin, poolCards.ts:440) while the
      // pool's own Survivor tab says nothing.
      const { readEntryTotals: readLmsTotals } = await import('@/lib/league/duels')
      const { createAdminClient: adminForLmsTotals } = await import('@/lib/supabase/server')
      const [state, { clubs, error: clubErr }, totalsRes] = await Promise.all([
        readLmsState(supabase, pool_id, userEntryIds),
        readSeasonClubs(supabase, pool.league_season_id),
        readLmsTotals(adminForLmsTotals(), pool_id),
      ])
      if (state.error) console.error('[pool page] lms state failed:', state.error)
      if (totalsRes.error) console.error('[pool page] lms totals failed:', totalsRes.error)
      if (clubErr) console.error('[pool page] season clubs failed:', clubErr)

      const entryNames = new Map<string, string>()
      for (const m of members) {
        for (const e of m.entries ?? []) {
          entryNames.set(e.entry_id, e.entry_name || m.users?.username || 'Entry')
        }
      }

      lmsData = {
        round: state.round,
        survivors: state.survivors,
        myPicks: state.myPicks,
        clubs,
        entryNames,
        entryId: defaultEntry?.entry_id ?? null,
        currentMatchweek: null,
        inPlayMatchweek: null,
        fixtures: new Map(),
        pickFixtures: new Map(),
        roundsWon: new Map(
          [...totalsRes.totals].map(([entryId, t]) => [entryId, t.roundsWon]),
        ),
      }
    }

    const standings = await readLeagueStandings(supabase, pool.league_season_id)
    if (standings.error) console.error('[pool page] league standings failed:', standings.error)
    leagueStandings = standings.rows
    leagueStandingsAt = standings.fetchedAt

    // The leaderboard's form dots. `entry_xp_state` — which feeds them for a
    // World Cup pool — is never written for a league entry (XP and badges are
    // BLOCKED, not skipped: app/api/cron/league-outbox/route.ts), so without
    // this every league member's form column was a permanent em-dash while
    // `league_match_scores` held exactly the rows it needed.
    const { readLeagueFormByEntry, readNextFixtureByClub } = await import('@/lib/league/read')
    const { createAdminClient: adminForForm } = await import('@/lib/supabase/server')
    const [formRes, nextRes] = await Promise.all([
      // ⚠ ADMIN. league_match_scores is deny-all (migration 050); the
      // user-scoped read this used to do returned zero rows with no error, so
      // the em-dash this function exists to remove was never removed.
      readLeagueFormByEntry(adminForForm(), pool_id),
      readNextFixtureByClub(supabase, pool.league_season_id),
    ])
    if (formRes.error) console.error('[pool page] league form failed:', formRes.error)
    leagueForm = formRes.form
    if (nextRes.error) console.error('[pool page] next fixtures failed:', nextRes.error)
    leagueNextFixture = nextRes.next

    // --------------------------------------------------------- Table mode
    // Assembled server-side, like everything else on this page. A Table pool
    // has no fixture picks at all, so this is its ONLY prediction surface.
    if (pool.league_mode === 'table') {
      const { readSeasonClubs, readTablePrediction, readTableBreakdown, seedOrder } =
        await import('@/lib/league/table')

      const lockAt = pool.league_table_lock_at

      // ONE SWITCH, TWO CONSEQUENCES — migration 110.
      //
      // The deadline passing both closes writes and opens every member's table
      // to every other member. `isRevealed` is a separate NAME because the two
      // consequences read differently at their call sites — a locked screen is
      // about you, a revealed table is about everyone — but they are one fact
      // and must stay derived from one expression.
      //
      // ⚠ Do not reintroduce a stamp. 104 tried it, to let an admin reopen a
      // passed deadline for somebody who forgot. 109 removed the reopen and 110
      // removed the stamp, which by then recorded only when we got round to
      // writing it down — it lagged the deadline by 15 minutes in production,
      // and the length of that lag depended on who next opened the app.
      const isLocked = lockAt ? new Date(lockAt) <= new Date() : false
      const isRevealed = isLocked

      // The bands come from the COMPETITION (migration 089), not from 4 and 3 —
      // those are Premier League numbers, and a league that relegates one club
      // would have had a screen shading three. An explicit pool setting still
      // wins, exactly as it does in the engine.
      const [{ clubs, error: clubErr }, settingsRes, bandsRes] = await Promise.all([
        readSeasonClubs(supabase, pool.league_season_id),
        supabase
          .from('league_pool_settings')
          // The PRICES as well as the band sizes. The Scoring Rules screen
          // quotes these back to the member, and quoting the shipped defaults
          // when a pool has moved a number would describe scoring nobody is
          // being charged. No row is the normal case (migration 079) — the
          // engine COALESCEs, and so does the fallback below.
          // ⚠ One literal, not a concatenation. postgrest-js infers the row
          // shape from the string, and a `'a, ' + 'b'` expression collapses it
          // to GenericStringError — every field access then fails to compile.
          .select('table_top_n, table_relegation_n, table_exact_points, table_step_penalty, table_champion_bonus, table_top_four_bonus, table_relegation_bonus, table_perfect_top_four_bonus, table_europa_bonus, table_conference_bonus')
          .eq('pool_id', pool_id)
          .maybeSingle(),
        supabase.rpc('league_default_bands', { p_season_id: pool.league_season_id }),
      ])
      if (bandsRes.error) console.error('[pool page] league bands failed:', bandsRes.error)
      const bands = (bandsRes.data ?? {}) as {
        top_n?: number; relegation_n?: number
        europa_from?: number | null; europa_to?: number | null
        conference_from?: number | null; conference_to?: number | null
      }
      if (clubErr) console.error('[pool page] season clubs failed:', clubErr)

      let savedOrder: string[] = []
      let savedAt: string | null = null
      let breakdown: Awaited<ReturnType<typeof readTableBreakdown>>['rows'] = []
      if (defaultEntry) {
        const [saved, bd] = await Promise.all([
          readTablePrediction(supabase, defaultEntry.entry_id),
          readTableBreakdown(supabase, defaultEntry.entry_id),
        ])
        if (saved.error) console.error('[pool page] table prediction failed:', saved.error)
        if (bd.error) console.error('[pool page] table breakdown failed:', bd.error)
        savedOrder = saved.order
        savedAt = saved.savedAt
        breakdown = bd.rows
      }

      tableModeData = {
        entryId: defaultEntry?.entry_id ?? null,
        clubs,
        savedOrder,
        savedAt,
        // ALPHABETICAL, always — and deliberately not the live table, which is
        // what decisions 12/17 used to say. A pool created in November would
        // otherwise open on a table that is already most of the way right,
        // while an August pool built the same prediction by hand. `seedOrder`
        // carries the full reasoning; note that it takes no standings, so this
        // cannot drift back by someone passing `leagueStandings` here again.
        seededOrder: seedOrder(clubs),
        breakdown,
        lockAt,
        topN: settingsRes.data?.table_top_n ?? bands.top_n ?? 4,
        relegationN: settingsRes.data?.table_relegation_n ?? bands.relegation_n ?? 3,
        // 'headline_only' scores the bands alone, so the Scoring Rules screen
        // must not promise per-place points this pool never awards.
        profile: pool.league_table_profile === 'headline_only' ? 'headline_only' : 'full_table',
        // Defaults mirror league_pool_settings' column defaults, which is what
        // league_score_table COALESCEs against (migration 080).
        prices: {
          exactPoints: settingsRes.data?.table_exact_points ?? 100,
          stepPenalty: settingsRes.data?.table_step_penalty ?? 20,
          championBonus: settingsRes.data?.table_champion_bonus ?? 500,
          topFourBonus: settingsRes.data?.table_top_four_bonus ?? 100,
          relegationBonus: settingsRes.data?.table_relegation_bonus ?? 100,
          perfectTopFourBonus: settingsRes.data?.table_perfect_top_four_bonus ?? 250,
          // Defaults mirror migration 093's COALESCE, which is the only place
          // that decides what a Europa hit is worth.
          europaBonus: settingsRes.data?.table_europa_bonus ?? 50,
          // Migration 113: half the Europa band, which is half the top band.
          conferenceBonus: settingsRes.data?.table_conference_bonus ?? 25,
        },
        // Bounds, not a count — and null is a real answer: a competition without
        // Europa places should not shade a band it does not have.
        europaFrom: bands.europa_from ?? null,
        europaTo: bands.europa_to ?? null,
        conferenceFrom: bands.conference_from ?? null,
        conferenceTo: bands.conference_to ?? null,
        isLocked,
        // Whether RIVALS' tables may be opened. The same fact as `isLocked`
        // since 110 — kept as its own field because the consumer asks a
        // different question of it.
        isRevealed,
        // Decision 11: joined after the deadline, so never had the chance.
        // Distinguished from "had the chance and skipped it" because the two
        // deserve different sentences.
        joinedAfterLock: isLocked && savedOrder.length === 0,
      }
    }

    const { view, error: leagueErr } = await readLeaguePoolView(supabase, {
      poolId: pool_id,
      seasonId: pool.league_season_id,
      tournamentId: pool.tournament_id,
    })
    if (leagueErr) {
      // Loud. A league pool rendering an empty fixture list is exactly the
      // silent-empty failure this codebase keeps producing.
      console.error('[pool page] league view failed:', leagueErr)
    }
    if (view) {
      matches = view.matches
      teams = view.teams
      roundStates = view.roundStates

      // Now the season has been read, so the two weeks can be named. They are
      // NOT the same week from Friday kickoff to Monday night: `openMatchweek`
      // is what you can still pick, `inPlayMatchweek` is what is being played.
      // Both come off the view rather than being parsed back out of `mw_N`.
      if (showdownData || lmsData) {
        const mw = view.openMatchweekNumber
        if (showdownData) {
          showdownData.openMatchweek = mw
          showdownData.inPlayMatchweek = view.inPlayMatchweekNumber
          // The sealed card's two facts. They cannot come off `duels` — the
          // rows for a sealed matchweek are not in the payload at all.
          showdownData.sealedMatchweek = view.sealedMatchweekNumber
          showdownData.sealedOpensAfter = view.sealedOpensAfterMatchweek
          showdownData.sealedOpensAtLatest = view.sealedOpensAtLatest

          // The RUNNING score of the duel being played. `league_duels` carries
          // accuracy only once the matchweek settles, so through the weekend it
          // has to come from the score rows themselves.
          const liveMw = view.inPlayMatchweekNumber ?? view.openMatchweekNumber
          if (liveMw !== null) {
            const { readMatchweekPoints } = await import('@/lib/league/duels')
            const { createAdminClient } = await import('@/lib/supabase/server')
            // ⚠ ADMIN, not `supabase`. league_match_scores is deny-all by
            // design (migration 050) and a user-scoped read returns zero rows
            // with no error — a silently 0–0 duel card.
            const live = await readMatchweekPoints(createAdminClient(), pool_id, liveMw)
            if (live.error) console.error('[pool page] live duel points failed:', live.error)
            showdownData.livePoints = live.points
            showdownData.perFixture = live.perFixture
            // ⚠ EVERY FIXTURE OF THE MATCHWEEK, not only the scored ones.
            // The breakdown used to list what had score rows — nine of ten —
            // while the verdict beside it said "1 game still to play". The
            // sentence referred to a fixture the list did not contain.
            //
            // `match_number` IS `league_fixtures.fixture_number`, which is what
            // the score rows are keyed on, so the two join without a lookup.
            showdownData.fixtures = view.matches
              .filter((mt) => mt.round_number === liveMw)
              .map((mt) => ({
                number: mt.match_number,
                label: `${mt.home_team?.country_name ?? 'Home'} v ${mt.away_team?.country_name ?? 'Away'}`,
                kickoffAt: mt.match_date,
                isCompleted: mt.is_completed,
                status: mt.status,
                liveMinute: mt.live_minute,
                livePeriod: mt.live_period,
                liveAdded: mt.live_added,
              }))
              .sort((a, b) => a.number - b.number)
          }
        }
        // LMS needs BOTH, for two different jobs. The pick is WRITTEN against
        // the open week — that is what a member can still change. The screen
        // NARRATES the week being played, because on a Saturday that is the club
        // they are watching. Handing it only the open one is what put next
        // week's pick under the words "This week".
        if (lmsData) {
          lmsData.currentMatchweek = mw
          lmsData.inPlayMatchweek = view.inPlayMatchweekNumber
        }

        // Who each club plays in the OPEN matchweek, so the picker can show the
        // fixture beside the crest. Loaded here rather than with the rest of
        // lmsData because the open matchweek is only known at this point.
        if (lmsData && mw !== null && pool.league_season_id) {
          const { readMatchweekFixtureByClub } = await import('@/lib/league/read')
          const { byClub, error: fxErr } = await readMatchweekFixtureByClub(
            supabase, pool.league_season_id, mw,
          )
          if (fxErr) console.error('[pool page] lms matchweek fixtures failed:', fxErr)
          lmsData.fixtures = byClub
        }

        // And the game behind every pick already made, each against its OWN
        // matchweek. Separate from the map above on purpose: that one answers
        // "who could I pick this week", this one answers "who did I back, and
        // what happened" — and the second must never be answered with the first
        // week's fixtures, which is precisely the bug migration 115 ends.
        if (lmsData && lmsData.myPicks.length > 0 && pool.league_season_id) {
          const { readLmsPickFixtures } = await import('@/lib/league/lms')
          const { byPick, error: pfErr } = await readLmsPickFixtures(
            supabase, pool.league_season_id, lmsData.myPicks,
          )
          if (pfErr) console.error('[pool page] lms pick fixtures failed:', pfErr)
          lmsData.pickFixtures = byPick
        }
      }

      if (defaultEntry) {
        const { predictions: leaguePicks, outcomes: leagueOutcomes, error: pickErr } = await readLeaguePredictions(
          supabase,
          defaultEntry.entry_id,
        )
        if (pickErr) console.error('[pool page] league predictions failed:', pickErr)
        userPredictions = leaguePicks
        leagueOutcomeMap = leagueOutcomes
        // Both kinds of pick count towards "this matchweek is submitted" — a
        // Results pool has no scorelines at all, so passing only `leaguePicks`
        // would leave every matchweek looking untouched.
        roundSubmissions = deriveRoundSubmissions(
          defaultEntry.entry_id, view.matches, leaguePicks, leagueOutcomes,
        )
      }
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

  // NOTE: the pool-wide predictions array is no longer fetched here at all. It
  // is loaded per tab from GET /api/pools/:id/bulk, which owns the reveal gate
  // that used to live at this spot — see the warning in that route. The gate did
  // not become optional; it moved to the only place that still produces the array.

  return (
    <PoolDetail
      pool={pool}
      bpProvisionalScoring={bpProvisionalScoring}
      tournamentAwards={tournamentAwards}
      members={members}
      matches={matches}
      settings={settings}
      userPredictions={(userPredictions || []) as ExistingPrediction[]}
      teams={teams}
      conductData={conductData}
      bonusScores={bonusScores}
      entryStats={entryStats}
      matchdayMVP={matchdayMVP}
      matchAccuracy={matchAccuracy}
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
      leagueDepth={pool.league_depth ?? null}
      leagueOutcomes={leagueOutcomeMap}
      leagueStandings={leagueStandings}
      leagueForm={leagueForm}
      leagueNextFixture={leagueNextFixture}
      leagueStandingsAt={leagueStandingsAt}
      leagueMode={pool.league_mode ?? null}
      tableModeData={tableModeData}
      showdownData={showdownData}
      lmsData={lmsData}
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
