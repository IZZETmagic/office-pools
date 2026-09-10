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
// ## ⚠ THE CROWD IS PLATFORM-WIDE, NEVER POOL-SCOPED
//
// `readCrowdMajority` deliberately does not take a pool. A crowd figure computed
// inside one pool leaks that pool's picks through the back door of an
// aggregate — in a six-member pool an aggregate is not an aggregate — and the
// contrarian index is the one number that needs the comparison. Platform-wide is
// safe because n is large and nobody in it is identifiable.
// =============================================================

import type { createAdminClient } from '@/lib/supabase/server'

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
  fixture_id: string
  predicted_home_score: number
  predicted_away_score: number
  league_fixtures: {
    fixture_id: string
    kickoff_at: string
    home_goals: number | null
    away_goals: number | null
    matchweek_id: string
    home: { club_id: string; name: string; abbreviation: string; crest_url: string | null } | null
    away: { club_id: string; name: string; abbreviation: string; crest_url: string | null } | null
    league_matchweeks: { matchweek_number: number; lock_at: string | null } | null
  } | null
}

const toClub = (c: PredictionRow['league_fixtures'] extends null ? never
  : NonNullable<PredictionRow['league_fixtures']>['home']): ClubRef | null =>
  c
    ? {
        clubId: c.club_id,
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
      league_fixtures!inner (
        fixture_id, kickoff_at, home_goals, away_goals, matchweek_id,
        home:league_clubs!league_fixtures_home_club_id_fkey ( club_id, name, abbreviation, crest_url ),
        away:league_clubs!league_fixtures_away_club_id_fkey ( club_id, name, abbreviation, crest_url ),
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
  }[]) {
    out.set(r.fixture_id, {
      fixtureId: r.fixture_id,
      picks: r.picks,
      home: r.home_picks,
      draw: r.draw_picks,
      away: r.away_picks,
      majority: r.majority === 'home' || r.majority === 'away' ? r.majority : null,
    })
  }
  return out
}
