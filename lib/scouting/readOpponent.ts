// =============================================================
// Reading the picks a dossier is allowed to be built from
// =============================================================
// `buildOpponentDossier` counts whatever it is handed. This is the only
// sanctioned way to fill its hands, and it exists because the filter below is
// the one part of scouting that is a security boundary rather than a display
// choice.
//
// ## ⚠⚠ A PICK IS READABLE ONLY ONCE ITS MATCHWEEK HAS LOCKED
//
// `lock_at <= now` is the whole rule, and it is applied to the MATCHWEEK, not
// to the fixture. Fixtures inside one matchweek kick off across four days; a
// per-fixture test would reveal Saturday's picks while Monday's are still live,
// which is a partial leak of the same week's card.
//
// ⚠ KEYED ON `lock_at`, NEVER ON A STATE STRING. The league surfaces derive
// state from time in several places and `read.ts` is explicit that nothing
// stores it — a dossier that trusted a status column would show live picks for
// as long as that column was stale.
//
// ⚠ AND IT IS ENFORCED HERE RATHER THAN IN THE COMPONENT. This runs with the
// admin client, which is exactly the shape the Last Man Standing note warns
// about: an admin-client reader re-implements every policy it bypasses or the
// seal is gone. The matchweek filter IS that re-implementation.
//
// ## ⚠⚠ BOTH PICK SHAPES ARE READ, BECAUSE A POOL ONLY EVER HAS ONE
//
// Migration 064 made `league_predictions` mutually exclusive per row: a Scores
// pool files a scoreline and leaves `predicted_outcome` null, a Results pool
// files an outcome and leaves both scores null, and
// `league_predictions_shape_ck` refuses a row with both or neither. Selecting
// only the scores therefore returns a full page of nulls for a Results pool —
// which reads as "predicted a draw" everywhere, not as "no data".
//
// Measured before this was fixed: on `Showdown Duels`, a Results-depth pool,
// every one of four entries reported 20 of 20 picks as draws, no club leans at
// all, and a verdict sentence that would have said they see draws everywhere.
//
// ## ⚠ THE CROWD IS PLATFORM-WIDE, NEVER POOL-SCOPED
//
// `readCrowdMajority` deliberately does not take a pool. A crowd figure computed
// inside one pool leaks that pool's picks through the back door of an
// aggregate — in a six-member pool an aggregate is not an aggregate — and the
// contrarian index is the one number that needs the comparison. Platform-wide is
// safe because n is large and nobody in it is identifiable.
// =============================================================

import type { createAdminClient } from '@/lib/supabase/server'

import type { LeagueDirection } from '@/lib/league/ownPicks'
import type { ClubRef, PickRow, ScoreType } from './opponent'

/** Same alias `entryAnalytics.ts` uses, so the two readers agree about it. */
type Admin = ReturnType<typeof createAdminClient>

/**
 * A season's fixtures is the natural ceiling on one entry's picks — 380 in a
 * twenty-club league — so this is not a page size, it is a tripwire.
 *
 * ⚠ POSTGREST TRUNCATES AN UNBOUNDED `.select()` AT 1,000 ROWS SILENTLY, and an
 * exact-1,000 count is a bug rather than a result. Asking for one more than any
 * real season can hold means a full page here is a signal that something has
 * gone wrong upstream, not a dossier quietly built on two thirds of a season.
 */
const MAX_PICKS = 800

type PredictionRow = {
  /** ⚠ Only selected by the LIFETIME read, which spans many entries. */
  entry_id?: string
  fixture_id: string
  /** ⚠ NULL IN A RESULTS POOL — migration 064's XOR. See `PickRow`. */
  predicted_home_score: number | null
  predicted_away_score: number | null
  predicted_outcome: LeagueDirection | null
  league_fixtures: {
    fixture_id: string
    kickoff_at: string
    home_goals: number | null
    away_goals: number | null
    matchweek_id: string
    home: { club_id: string; external_club_id: number; name: string; abbreviation: string; crest_url: string | null } | null
    away: { club_id: string; external_club_id: number; name: string; abbreviation: string; crest_url: string | null } | null
    league_matchweeks: { matchweek_number: number; lock_at: string | null } | null
  } | null
}

const toClub = (c: PredictionRow['league_fixtures'] extends null ? never
  : NonNullable<PredictionRow['league_fixtures']>['home']): ClubRef | null =>
  c
    ? {
        clubId: c.club_id,
        externalClubId: c.external_club_id,
        name: c.name,
        abbreviation: c.abbreviation,
        crestUrl: c.crest_url,
      }
    : null

/**
 * Every revealed pick by one entry, with the fixture and result beside it.
 *
 * @param entryId  the OPPONENT's entry. Passing the viewer's own entry is how
 *                 the self-scout is built; the reveal filter is applied either
 *                 way, deliberately — a member reading their own dossier over
 *                 live picks would see a different set of numbers to the one
 *                 their opponent sees, and the two would never reconcile.
 */
export async function readOpponentPicks(
  admin: Admin,
  entryId: string,
  now: Date = new Date(),
): Promise<PickRow[]> {
  const { data, error } = await admin
    .from('league_predictions')
    .select(`
      fixture_id,
      predicted_home_score,
      predicted_away_score,
      predicted_outcome,
      league_fixtures!inner (
        fixture_id, kickoff_at, home_goals, away_goals, matchweek_id,
        home:league_clubs!league_fixtures_home_club_id_fkey ( club_id, external_club_id, name, abbreviation, crest_url ),
        away:league_clubs!league_fixtures_away_club_id_fkey ( club_id, external_club_id, name, abbreviation, crest_url ),
        league_matchweeks!inner ( matchweek_number, lock_at )
      )
    `)
    .eq('entry_id', entryId)
    .limit(MAX_PICKS)

  // ⚠ THE ERROR IS READ. `const { data } = await …` hides a 400 and renders an
  // empty dossier forever, which here would read as "this person has never
  // picked anything" — a plausible sentence about a real member.
  if (error) throw new Error(`readOpponentPicks: ${error.message}`)
  const rows = (data ?? []) as unknown as PredictionRow[]

  if (rows.length >= MAX_PICKS) {
    throw new Error(
      `readOpponentPicks: hit the ${MAX_PICKS}-row ceiling for entry ${entryId}. ` +
        'A dossier built on a truncated page is wrong in a way that renders perfectly.',
    )
  }

  const cutoff = now.getTime()
  const revealed: PickRow[] = []

  for (const r of rows) {
    const f = r.league_fixtures
    const mw = f?.league_matchweeks
    const home = toClub(f?.home ?? null)
    const away = toClub(f?.away ?? null)
    if (!f || !mw || !home || !away) continue

    // ⚠⚠ THE SEAL. An unlocked matchweek has no readable picks, and a matchweek
    // with no `lock_at` has no fixtures (migration 050's own CHECK) so it cannot
    // have picks either — both are excluded by the same test.
    if (mw.lock_at === null || Date.parse(mw.lock_at) > cutoff) continue

    revealed.push({
      entry: entryId,
      fixtureId: f.fixture_id,
      matchweek: mw.matchweek_number,
      kickoffAt: f.kickoff_at,
      predictedHome: r.predicted_home_score,
      predictedAway: r.predicted_away_score,
      predictedOutcome: r.predicted_outcome,
      actualHome: f.home_goals,
      actualAway: f.away_goals,
      homeClub: home,
      awayClub: away,
      scoreType: null,
      points: null,
    })
  }

  return attachScores(admin, entryId, revealed)
}

/**
 * Fold `league_match_scores` onto the picks.
 *
 * ⚠ A SEPARATE READ RATHER THAN A JOIN, because the scores table is keyed
 * `(entry_id, fixture_id)` and embedding it through `league_predictions` has no
 * foreign key to travel along — PostgREST would need a view. Two bounded reads
 * beat inventing one.
 *
 * ⚠ AND AN UNSCORED PICK SURVIVES. A fixture that has not been played, or has
 * been played but not yet scored, keeps `scoreType: null` and still counts
 * towards tendency. Dropping it would shrink the sample the screen claims.
 */
async function attachScores(
  admin: Admin,
  entryId: string,
  picks: PickRow[],
): Promise<PickRow[]> {
  if (picks.length === 0) return picks

  const { data, error } = await admin
    .from('league_match_scores')
    .select('fixture_id, score_type, total_points')
    .eq('entry_id', entryId)
    .limit(MAX_PICKS)

  if (error) throw new Error(`readOpponentPicks/scores: ${error.message}`)

  const byFixture = new Map<string, { score_type: ScoreType; total_points: number }>()
  for (const s of (data ?? []) as { fixture_id: string; score_type: ScoreType; total_points: number }[]) {
    byFixture.set(s.fixture_id, s)
  }

  return picks.map((p) => {
    const s = byFixture.get(p.fixtureId)
    return s ? { ...p, scoreType: s.score_type, points: s.total_points } : p
  })
}

/**
 * How the whole platform picked each of these fixtures.
 *
 * ⚠ NO POOL FILTER, AND THAT IS THE POINT. See the header.
 *
 * ⚠ FIXTURES ARE PASSED IN RATHER THAN DERIVED. The caller already knows which
 * fixtures the dossier covers, and asking the database for "every prediction"
 * is the unbounded read this codebase keeps producing.
 *
 * @returns fixture id -> the majority call, or absent where there is no majority
 *          or too few picks to have one. ⚠ A null VALUE means the crowd picked a
 *          DRAW; an absent key means there is no crowd answer. The two are
 *          different and `buildOpponentDossier` reads them differently.
 */
export async function readCrowdMajority(
  admin: Admin,
  fixtureIds: string[],
): Promise<Map<string, 'home' | 'away' | null>> {
  const out = new Map<string, 'home' | 'away' | null>()
  if (fixtureIds.length === 0) return out

  // A fixture's picks across the platform can run to thousands, so this counts
  // in the database rather than pulling rows. `league_crowd_majority` is the
  // one function behind it; see migration 142.
  const { data, error } = await admin.rpc('league_crowd_majority', {
    p_fixture_ids: fixtureIds,
  })

  if (error) throw new Error(`readCrowdMajority: ${error.message}`)

  for (const r of (data ?? []) as { fixture_id: string; majority: string | null }[]) {
    out.set(r.fixture_id, r.majority === 'home' || r.majority === 'away' ? r.majority : null)
  }
  return out
}

/** The three-way split behind one fixture, as COUNTS. */
export type CrowdSplit = {
  fixtureId: string
  picks: number
  home: number
  draw: number
  away: number
  majority: 'home' | 'away' | null
  /**
   * The most-picked scoreline, over the picks that HAVE one.
   *
   * ⚠ ITS DENOMINATOR IS `scorePicks`, NOT `picks`. A Results pool files an
   * outcome and no scoreline, so on a platform carrying both depths the two
   * differ — and dividing by the wrong one would overstate how settled the
   * crowd is on a line.
   *
   * ⚠ NULL WHEN NOBODY FILED ONE, which is every fixture if the only pools
   * picking it are Results-depth.
   */
  topScore: string | null
  topScorePicks: number
  scorePicks: number
}

/**
 * How the platform called one fixture, in full.
 *
 * ⚠ THE SAME FUNCTION AS `readCrowdMajority`, ON PURPOSE. Both read
 * `league_crowd_majority`, which decides in one place which matchweeks have
 * locked. A second query shaped "just for the bar" could scan a different set —
 * the two would disagree about a matchweek that locked between them, and the
 * disagreement would be a leak rather than a rounding error.
 *
 * ⚠ COUNTS, NOT PERCENTAGES. Three shares rounded independently total 99 or
 * 101; the caller divides and owns the rounding.
 */
export async function readCrowdSplit(
  admin: Admin,
  fixtureIds: string[],
): Promise<Map<string, CrowdSplit>> {
  const out = new Map<string, CrowdSplit>()
  if (fixtureIds.length === 0) return out

  const { data, error } = await admin.rpc('league_crowd_majority', {
    p_fixture_ids: fixtureIds,
  })

  if (error) throw new Error(`readCrowdSplit: ${error.message}`)

  for (const r of (data ?? []) as {
    fixture_id: string
    majority: string | null
    picks: number
    home_picks: number
    draw_picks: number
    away_picks: number
    top_score: string | null
    top_score_picks: number
    score_picks: number
  }[]) {
    out.set(r.fixture_id, {
      fixtureId: r.fixture_id,
      picks: r.picks,
      home: r.home_picks,
      draw: r.draw_picks,
      away: r.away_picks,
      majority: r.majority === 'home' || r.majority === 'away' ? r.majority : null,
      topScore: r.top_score,
      topScorePicks: r.top_score_picks,
      scorePicks: r.score_picks,
    })
  }
  return out
}

// =============================================================
// The same picks, across every league pool the member is in
// =============================================================
// ## ⚠⚠ WHY THIS EXISTS: THE COLD START IS PER-CLUB, NOT PER-PICK
//
// A new pool's dossier feels empty for a month, and the obvious reading — "not
// enough picks yet" — is wrong. By matchweek three an entry already has ~30
// picks, which is plenty for a hit rate, a goals-per-prediction and a draw rate.
//
// What is thin is the PER-CLUB count. Each club plays exactly once a matchweek,
// so at matchweek three you have seen Arsenal three times, and the design note's
// own example — "backs Arsenal 9 of 9" — needs matchweek nine. Club bias is the
// card lifetime exists for; the rest of the dossier never needed it.
//
// ## ⚠⚠ A NAIVE UNION DOUBLE-COUNTS, AND BADLY
//
// A member in two Premier League pools picks the SAME FIXTURE TWICE. Measured in
// production: 766 `league_predictions` rows resolve to 310 distinct
// `(user, fixture)` pairs — 59.5% of rows would be counted a second time,
// inflating every denominator about 2.5×. "Backs Arsenal 8 of 8" would become
// "16 of 16": the same judgement, presented as twice the evidence.
//
// So this dedupes on the fixture, and where the two pools DISAGREE it drops the
// fixture entirely and counts the drop. Averaging them, or preferring one pool,
// would invent a considered ambivalence the member never had.
// =============================================================

/**
 * How many rows a single page may hold.
 *
 * ⚠⚠ THIS IS POSTGREST'S OWN CEILING, NOT A CHOICE. An unbounded `.select()`
 * truncates at 1,000 silently and a larger explicit `.limit()` does not lift a
 * server-side `db-max-rows`. A lifetime span can exceed that legitimately — five
 * competitions of ~380 fixtures is ~1,900 available picks in ONE season year —
 * so this pages with `.range()` rather than asking for more in one breath.
 */
const PAGE = 1000

/**
 * The ceiling across all pages.
 *
 * ⚠ A TRIPWIRE, NOT A PAGE SIZE — the same call `MAX_PICKS` makes for one entry.
 * A dossier built on a truncated history is wrong in a way that renders
 * perfectly, so hitting this throws rather than returning what it has.
 */
const MAX_LIFETIME_PICKS = 8000

/** What a lifetime read found, beside the picks themselves. */
export type LifetimeSpan = {
  picks: PickRow[]
  pools: number
  /**
   * How many distinct competitions those pools span.
   *
   * ## ⚠⚠ IT DECIDES WHETHER "THE LEAGUE" IS A LIE
   *
   * A member can be in a Premier League pool and an 18-club league pool at once,
   * and their lifetime baseline is then measured across both. The arithmetic
   * stays right — it is computed over exactly the fixtures in their pick set —
   * but the SENTENCE has to widen with it, or the card claims the Premier League
   * averages something it does not. The screen reads this to choose between
   * "the league averages 2.8" and "your leagues average 2.8".
   *
   * ⚠ READ, NOT INFERRED. Counting distinct clubs and dividing by a squad size
   * would be a guess, and a guess in a sentence that makes a factual claim about
   * a named league is not worth the round trip it saves.
   */
  competitions: number
  /** Fixtures picked two different ways in two pools, counted in neither. */
  droppedConflicts: number
}

/**
 * Every revealed pick this user has made, in every league pool, deduped.
 *
 * ## ⚠⚠ THE SEAL IS THE SAME SEAL AND IT MUST NOT BE DROPPED HERE
 *
 * `lock_at <= now`, applied to the MATCHWEEK. It generalises correctly across
 * competitions — different leagues lock at different times and the join carries
 * each fixture's own matchweek — but it is a SECURITY BOUNDARY re-implementing
 * RLS the admin client bypasses, not a display choice. Widening the query from
 * one entry to one user does not weaken the reason it exists.
 *
 * ⚠ RETIRED ENTRIES ARE INCLUDED, DELIBERATELY. A retired entry's revealed picks
 * are still things this member did, and a history that silently omitted a pool
 * they left would be a lie by omission. Stated because the repo rule is that
 * `retired_at` filters must not be widened casually — this is the opposite, a
 * deliberate NON-widening.
 *
 * ⚠ LEAGUE POOLS ONLY. World Cup picks live in `predictions`, a different table
 * with a different shape; a cross-schema union is not worth building for a
 * competition that closed in July.
 */
export async function readLifetimePicks(
  admin: Admin,
  userId: string,
  now: Date = new Date(),
): Promise<LifetimeSpan> {
  // ---- every entry this user owns ----------------------------------------
  const { data: entryRows, error: entryErr } = await admin
    .from('pool_entries')
    .select('entry_id, pool_id')
    .eq('user_id', userId)
    .limit(PAGE)

  if (entryErr) throw new Error(`readLifetimePicks/entries: ${entryErr.message}`)

  const entries = (entryRows ?? []) as { entry_id: string; pool_id: string }[]
  if (entries.length === 0) {
    return { picks: [], pools: 0, competitions: 0, droppedConflicts: 0 }
  }

  const entryIds = entries.map((e) => e.entry_id)
  const poolIds = [...new Set(entries.map((e) => e.pool_id))]
  const pools = poolIds.length

  // ---- which competitions those pools are in ------------------------------
  //
  // ⚠ A PLAIN READ, NOT A POSTGREST EMBED. `pool_entries` reaching `users` by
  // two paths is what killed this route once already — the embed 400s and the
  // guard above it reads its own error and 500s the whole screen. A separate
  // read needs no constraint name to stay correct.
  //
  // ⚠ A NULL `league_season_id` IS A WORLD CUP POOL and is simply not counted.
  // Its picks live in `predictions`, a different table, so it contributes no
  // rows to this read either.
  const { data: poolRows, error: poolErr } = await admin
    .from('pools')
    .select('pool_id, league_season_id')
    .in('pool_id', poolIds)
    .limit(PAGE)

  if (poolErr) throw new Error(`readLifetimePicks/pools: ${poolErr.message}`)

  const competitions = new Set(
    ((poolRows ?? []) as { league_season_id: string | null }[])
      .map((r) => r.league_season_id)
      .filter((id): id is string => !!id),
  ).size

  // ---- their picks, paged -------------------------------------------------
  const rows: PredictionRow[] = []
  for (let from = 0; from < MAX_LIFETIME_PICKS; from += PAGE) {
    const { data, error } = await admin
      .from('league_predictions')
      .select(`
        entry_id,
        fixture_id,
        predicted_home_score,
        predicted_away_score,
        predicted_outcome,
        league_fixtures!inner (
          fixture_id, kickoff_at, home_goals, away_goals, matchweek_id,
          home:league_clubs!league_fixtures_home_club_id_fkey ( club_id, external_club_id, name, abbreviation, crest_url ),
          away:league_clubs!league_fixtures_away_club_id_fkey ( club_id, external_club_id, name, abbreviation, crest_url ),
          league_matchweeks!inner ( matchweek_number, lock_at )
        )
      `)
      .in('entry_id', entryIds)
      // ⚠ A STABLE ORDER IS WHAT MAKES PAGING CORRECT. Without it PostgREST may
      // return rows in a different order per page and a fixture can be skipped
      // and another repeated — which would look like a real pick pattern.
      .order('fixture_id', { ascending: true })
      .range(from, from + PAGE - 1)

    // ⚠ THE ERROR IS READ. `const { data } = await …` hides a 400 and yields an
    // empty history forever — "this person has never picked anything" is a
    // plausible sentence about a real member, which is what makes it dangerous.
    if (error) throw new Error(`readLifetimePicks: ${error.message}`)

    const page = (data ?? []) as unknown as PredictionRow[]
    rows.push(...page)
    if (page.length < PAGE) break
  }

  if (rows.length >= MAX_LIFETIME_PICKS) {
    throw new Error(
      `readLifetimePicks: hit the ${MAX_LIFETIME_PICKS}-row ceiling for user ${userId}. ` +
        'A dossier built on a truncated history is wrong in a way that renders perfectly.',
    )
  }

  // ---- the seal, then the dedupe -----------------------------------------
  const cutoff = now.getTime()

  // ⚠ KEYED ON THE FIXTURE, because the user is already fixed. Two entries of
  // the same user on one fixture are the SAME JUDGEMENT made twice, not two
  // observations.
  const byFixture = new Map<string, PickRow>()
  const conflicted = new Set<string>()

  for (const r of rows) {
    const f = r.league_fixtures
    const mw = f?.league_matchweeks
    const home = toClub(f?.home ?? null)
    const away = toClub(f?.away ?? null)
    if (!f || !mw || !home || !away) continue

    // ⚠⚠ THE SEAL — see the function header. An unlocked matchweek has no
    // readable picks, and a matchweek with no `lock_at` has no fixtures
    // (migration 050's own CHECK) so it cannot have picks either.
    if (mw.lock_at === null || Date.parse(mw.lock_at) > cutoff) continue

    const pick: PickRow = {
      entry: r.entry_id ?? '',
      fixtureId: f.fixture_id,
      matchweek: mw.matchweek_number,
      kickoffAt: f.kickoff_at,
      predictedHome: r.predicted_home_score,
      predictedAway: r.predicted_away_score,
      predictedOutcome: r.predicted_outcome,
      actualHome: f.home_goals,
      actualAway: f.away_goals,
      homeClub: home,
      awayClub: away,
      scoreType: null,
      points: null,
    }

    const seen = byFixture.get(f.fixture_id)
    if (!seen) {
      byFixture.set(f.fixture_id, pick)
      continue
    }

    // ⚠⚠ DISAGREEMENT DROPS THE FIXTURE. Backing Liverpool in one pool and
    // against them in another is two different judgements, and there is no
    // honest way to collapse them: keeping one silently prefers a pool, and
    // counting both reports an ambivalence as if it were two convictions.
    if (!samePick(seen, pick)) conflicted.add(f.fixture_id)
  }

  for (const id of conflicted) byFixture.delete(id)

  return {
    picks: [...byFixture.values()],
    pools,
    competitions,
    droppedConflicts: conflicted.size,
  }
}

/**
 * Are two picks on one fixture the same judgement?
 *
 * ⚠ BOTH SHAPES, BECAUSE A POOL ONLY EVER HAS ONE. Migration 064 made
 * `league_predictions` mutually exclusive per row: a Scores pool files a
 * scoreline with `predicted_outcome` null, a Results pool files the outcome with
 * both scores null. So the same member in a Scores pool and a Results pool files
 * two DIFFERENT-SHAPED rows for one fixture, and neither is wrong.
 *
 * ⚠ A SHAPE MISMATCH IS NOT A CONFLICT — it is the same opinion recorded at two
 * depths. 2–1 and "home win" agree; 2–1 and "away win" do not. Treating the
 * shape difference as a disagreement would drop nearly every fixture for anybody
 * who plays both depths, which is the common case.
 */
export function samePick(a: PickRow, b: PickRow): boolean {
  const dir = (p: PickRow): 'home' | 'draw' | 'away' | null => {
    if (p.predictedOutcome) return p.predictedOutcome as 'home' | 'draw' | 'away'
    if (p.predictedHome == null || p.predictedAway == null) return null
    if (p.predictedHome > p.predictedAway) return 'home'
    if (p.predictedHome < p.predictedAway) return 'away'
    return 'draw'
  }

  // Where both filed a scoreline, the scoreline is the judgement.
  const aHasScore = a.predictedHome != null && a.predictedAway != null
  const bHasScore = b.predictedHome != null && b.predictedAway != null
  if (aHasScore && bHasScore) {
    return a.predictedHome === b.predictedHome && a.predictedAway === b.predictedAway
  }

  // Otherwise compare at the shallower depth they have in common.
  const da = dir(a)
  const db = dir(b)
  return da != null && db != null && da === db
}
