// =============================================================
// LEAGUE WRITE PATH — saving picks into league_predictions
// =============================================================
// The counterpart to lib/league/read.ts. Same principle: the existing
// prediction flow is unchanged, and this is where its save call lands for a
// league pool.
//
// ⚠ THE LOAD-BEARING CONSTRAINT of the vertical slice
// (drafts/2026-08-22_league_vertical_slice.md §2): this path must NEVER write
// `pool_entries.has_submitted_predictions` or `.point_adjustment`. Those two
// columns are the only doors by which a league entry can enter the World Cup
// scoring selectors — everything else is contained structurally, because league
// picks live here rather than in `predictions`. The World Cup save path writes
// both (via save_predictions_batch); this one deliberately writes neither, and
// submission state is derived from the picks instead (see deriveRoundSubmissions).
//
// ⚠ THE LOCK IS A SILENT-SKIP TRIGGER. `enforce_league_prediction_before_lock`
// is a BEFORE INSERT OR UPDATE FOR EACH ROW trigger that `RETURN NULL`s once a
// matchweek has locked or its fixture has completed. A dropped row is NOT an
// error: the statement succeeds and the row simply is not there. So this reads
// back what actually landed and reports the difference, rather than assuming
// the upsert did what it was asked. That is the whole reason this function
// returns `rejected`.
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

export type LeaguePick = {
  /** `league_fixtures.fixture_id`. Named matchId by the shared flow. */
  matchId: string
  homeScore: number
  awayScore: number
}

export type LeagueSaveResult = {
  /** Picks the database actually holds for this entry after the write. */
  predicted: number
  /** Picks accepted by this call. */
  accepted: number
  /**
   * Picks the database silently refused — the matchweek locked, or the fixture
   * completed, between the member opening the screen and pressing save.
   */
  rejected: LeaguePick[]
  error: string | null
}

/** Scores outside this range are refused by CHECK constraints; catch them first. */
const MIN_SCORE = 0
const MAX_SCORE = 20

/**
 * Save one entry's picks for a league pool.
 *
 * Every fixture is verified to belong to this pool's season before anything is
 * written. Without that check a crafted request could file a pick against
 * another competition's fixture: `league_predictions` has an FK to
 * `league_fixtures` but nothing ties that fixture to the entry's pool, and the
 * trigger that would (`assert_league_prediction_pool`) is deferred to the full
 * L4.
 */
export async function saveLeaguePredictions(
  supabase: SupabaseClient,
  args: { entryId: string; seasonId: string; picks: LeaguePick[] },
): Promise<LeagueSaveResult> {
  const { entryId, seasonId, picks } = args

  if (picks.length === 0) {
    const { count, error } = await supabase
      .from('league_predictions')
      .select('*', { count: 'exact', head: true })
      .eq('entry_id', entryId)
    if (error) return { predicted: 0, accepted: 0, rejected: [], error: error.message }
    return { predicted: count ?? 0, accepted: 0, rejected: [], error: null }
  }

  for (const p of picks) {
    if (
      !Number.isInteger(p.homeScore) || !Number.isInteger(p.awayScore) ||
      p.homeScore < MIN_SCORE || p.homeScore > MAX_SCORE ||
      p.awayScore < MIN_SCORE || p.awayScore > MAX_SCORE
    ) {
      return {
        predicted: 0, accepted: 0, rejected: [],
        error: `A score must be a whole number between ${MIN_SCORE} and ${MAX_SCORE}.`,
      }
    }
  }

  // Every fixture must belong to THIS pool's season. `.in()` with a non-empty
  // list; an empty list would return zero rows at HTTP 200 and read as
  // "none of them are valid", which is the correct answer here anyway.
  const ids = [...new Set(picks.map((p) => p.matchId))]
  const { data: valid, error: vErr } = await supabase
    .from('league_fixtures')
    .select('fixture_id')
    .eq('season_id', seasonId)
    .in('fixture_id', ids)
  if (vErr) return { predicted: 0, accepted: 0, rejected: [], error: vErr.message }

  const validIds = new Set((valid ?? []).map((f) => (f as { fixture_id: string }).fixture_id))
  const foreign = ids.filter((id) => !validIds.has(id))
  if (foreign.length > 0) {
    return {
      predicted: 0, accepted: 0, rejected: [],
      error: `${foreign.length} fixture(s) do not belong to this competition.`,
    }
  }

  const { error: upErr } = await supabase
    .from('league_predictions')
    .upsert(
      picks.map((p) => ({
        entry_id: entryId,
        fixture_id: p.matchId,
        predicted_home_score: p.homeScore,
        predicted_away_score: p.awayScore,
        updated_at: new Date().toISOString(),
      })),
      // The real UNIQUE (entry_id, fixture_id). A bare 'fixture_id' would 42P10;
      // omitting the target entirely would arbitrate on the primary key and
      // insert duplicates.
      { onConflict: 'entry_id,fixture_id' },
    )
  if (upErr) return { predicted: 0, accepted: 0, rejected: [], error: upErr.message }

  // READ BACK. The lock trigger drops rows silently, so the only way to know
  // what was saved is to ask. Compared per fixture AND per value: a pick that
  // existed before and was refused an update looks identical to one that
  // succeeded if you only count rows.
  const { data: after, error: rErr } = await supabase
    .from('league_predictions')
    .select('fixture_id, predicted_home_score, predicted_away_score')
    .eq('entry_id', entryId)
    .in('fixture_id', ids)
  if (rErr) return { predicted: 0, accepted: 0, rejected: [], error: rErr.message }

  const stored = new Map(
    ((after ?? []) as Array<{ fixture_id: string; predicted_home_score: number; predicted_away_score: number }>)
      .map((r) => [r.fixture_id, r]),
  )
  const rejected = picks.filter((p) => {
    const s = stored.get(p.matchId)
    return !s || s.predicted_home_score !== p.homeScore || s.predicted_away_score !== p.awayScore
  })

  const { count, error: cErr } = await supabase
    .from('league_predictions')
    .select('*', { count: 'exact', head: true })
    .eq('entry_id', entryId)
  if (cErr) return { predicted: 0, accepted: picks.length - rejected.length, rejected, error: cErr.message }

  return {
    predicted: count ?? 0,
    accepted: picks.length - rejected.length,
    rejected,
    error: null,
  }
}
