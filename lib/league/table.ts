// =============================================================
// TABLE MODE — read and write one entry's finishing order
// =============================================================
// Plan §3. Table mode asks for one decision — where all twenty clubs finish —
// and then gives the member a season of watching it. Everything here serves
// that single write and the comparison that follows it.
//
// ## The write is atomic in a way fixture picks are not
//
// A matchweek of picks is twenty independent decisions; half of them saving is
// a real, reportable state. An ordering is ONE decision. If the lock refuses
// it, it refuses all of it, and telling a member "14 of your 20 clubs saved"
// would be describing a state that cannot exist. So `saveTablePrediction`
// reports `locked` rather than a per-club rejection list.
//
// ## Nothing here computes points
//
// The per-club arithmetic lives in `league_table_breakdown` (migration 081) and
// is read, never reproduced. See that migration's header for why.
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

export type SeasonClub = {
  club_id: string
  club_name: string
  crest_url: string | null
  short_name: string | null
}

export type TableBreakdownRow = {
  club_id: string
  club_name: string
  crest_url: string | null
  predicted_position: number
  /** NULL until the club has a standings row — i.e. before a ball is kicked. */
  actual_position: number | null
  delta: number | null
  points: number | null
  champion_hit: boolean
  top_hit: boolean
  releg_hit: boolean
  /** In the band the feed marks Europa. False when the competition has none. */
  europa_hit: boolean
  /** True once the season-end snapshot exists; until then the score is provisional. */
  is_final: boolean
}

export type TableSaveResult = {
  /** How many club rows the entry now holds. */
  stored: number
  /**
   * The database silently refused the write — the pool's table deadline has
   * passed. Silent because the gate is a BEFORE trigger that RETURN NULLs, the
   * house pattern for prediction locks; this flag is how a member finds out.
   */
  locked: boolean
  error: string | null
}

/** Every club in the competition, for the picking screen. */
export async function readSeasonClubs(
  supabase: SupabaseClient,
  seasonId: string,
): Promise<{ clubs: SeasonClub[]; error: string | null }> {
  const { data, error } = await supabase
    .from('league_clubs')
    // `league_clubs` names the column `name`; every other league read aliases it
    // the same way rather than renaming the column out from under the World Cup
    // shapes that also use it.
    .select('club_id, club_name:name, crest_url, short_name')
    .eq('season_id', seasonId)
    // ⚠ Order by the REAL column, never the alias. The `club_name:name` above
    // renames the column in the RESPONSE; `order` travels as a query parameter
    // and PostgREST resolves it against the table, so ordering by `club_name`
    // 400s with "column league_clubs.club_name does not exist" — and a 400
    // fails the whole select, not just the sort.
    //
    // That was not cosmetic: readSeasonClubs is the club list for BOTH Table
    // mode and Last Man Standing, so it emptied the picking screen of two of
    // the four league modes — nothing to drag, nothing to choose.
    .order('name', { ascending: true })
  if (error) return { clubs: [], error: error.message }
  return { clubs: (data ?? []) as SeasonClub[], error: null }
}

/** This entry's current ordering, as club_id -> position. Empty if unpicked. */
export async function readTablePrediction(
  supabase: SupabaseClient,
  entryId: string,
): Promise<{ order: string[]; error: string | null }> {
  const { data, error } = await supabase
    .from('league_table_predictions')
    .select('club_id, predicted_position')
    .eq('entry_id', entryId)
    .order('predicted_position')
  if (error) return { order: [], error: error.message }
  return {
    order: ((data ?? []) as Array<{ club_id: string }>).map((r) => r.club_id),
    error: null,
  }
}

/** Predicted vs actual, with the points each club is currently worth. */
export async function readTableBreakdown(
  supabase: SupabaseClient,
  entryId: string,
): Promise<{ rows: TableBreakdownRow[]; error: string | null }> {
  const { data, error } = await supabase.rpc('league_table_breakdown', { p_entry_id: entryId })
  if (error) return { rows: [], error: error.message }
  return { rows: (data ?? []) as TableBreakdownRow[], error: null }
}

/**
 * Write the ordering. `clubIdsInOrder[0]` finishes first.
 *
 * The unique constraint on (entry_id, predicted_position) is DEFERRABLE
 * INITIALLY DEFERRED precisely so this can be one upsert: mid-statement two
 * clubs genuinely do share a position, and only the state at COMMIT has to be
 * a valid ordering.
 */
export async function saveTablePrediction(
  supabase: SupabaseClient,
  entryId: string,
  clubIdsInOrder: string[],
): Promise<TableSaveResult> {
  if (clubIdsInOrder.length === 0) {
    return { stored: 0, locked: false, error: 'an empty ordering is not a prediction' }
  }
  const unique = new Set(clubIdsInOrder)
  if (unique.size !== clubIdsInOrder.length) {
    // Caught here rather than at the constraint because the constraint would
    // report a position collision, which is true but describes the symptom.
    return { stored: 0, locked: false, error: 'the same club appears twice in the ordering' }
  }

  const now = new Date().toISOString()
  const { error: upErr } = await supabase.from('league_table_predictions').upsert(
    clubIdsInOrder.map((clubId, i) => ({
      entry_id: entryId,
      club_id: clubId,
      predicted_position: i + 1,
      updated_at: now,
    })),
    { onConflict: 'entry_id,club_id' },
  )
  if (upErr) return { stored: 0, locked: false, error: upErr.message }

  // READ BACK. The lock trigger drops rows silently, so asking is the only way
  // to know what landed. Compared by POSITION, not by row count: a member who
  // already had an ordering and edits it after the lock keeps all twenty rows,
  // and counting them would report success.
  const { data: after, error: rErr } = await supabase
    .from('league_table_predictions')
    .select('club_id, predicted_position')
    .eq('entry_id', entryId)
  if (rErr) return { stored: 0, locked: false, error: rErr.message }

  const stored = new Map(
    ((after ?? []) as Array<{ club_id: string; predicted_position: number }>)
      .map((r) => [r.club_id, r.predicted_position]),
  )
  const landed = clubIdsInOrder.every((clubId, i) => stored.get(clubId) === i + 1)

  return { stored: stored.size, locked: !landed, error: null }
}

/**
 * What the picking screen starts from — decision 12, as revised by decision 17.
 *
 * The live table if there is one, so the lazy path is one tap rather than
 * twenty drags; alphabetical before a ball has been kicked. There is no
 * last-season order to fall back on: `league_seasons` holds exactly one row,
 * and three promoted clubs would have no prior position even if it held two.
 *
 * Clubs missing from the standings are appended in name order rather than
 * dropped — a table prediction with eighteen clubs in it is not a prediction.
 */
export function seedOrder(clubs: SeasonClub[], standingsRankByClub: Map<string, number>): string[] {
  const alphabetical = [...clubs].sort((a, b) => a.club_name.localeCompare(b.club_name))
  if (standingsRankByClub.size === 0) return alphabetical.map((c) => c.club_id)

  const ranked = alphabetical.filter((c) => standingsRankByClub.has(c.club_id))
  const unranked = alphabetical.filter((c) => !standingsRankByClub.has(c.club_id))
  ranked.sort((a, b) => standingsRankByClub.get(a.club_id)! - standingsRankByClub.get(b.club_id)!)
  return [...ranked, ...unranked].map((c) => c.club_id)
}
