// =============================================================
// LAST MAN STANDING — read the round, make the pick
// =============================================================
// One club a matchweek, to win. The two things this file exists to get right:
//
//   1. Which clubs you have ALREADY USED this round, because that is the rule
//      that makes the mode a game and the screen has to enforce it visibly
//      rather than letting the database refuse a tap after the fact.
//   2. Reading back after a write, because the lock is a silent-skip trigger
//      like every other prediction lock here.
// =============================================================

import type { SupabaseClient } from '@supabase/supabase-js'

export type LmsRound = {
  round_id: string
  round_number: number
  first_matchweek: number
  last_matchweek: number | null
}

export type LmsSurvivor = {
  entry_id: string
  eliminated_matchweek: number | null
  is_winner: boolean
}

export type LmsPick = {
  round_id: string
  entry_id: string
  matchweek_number: number
  club_id: string
  result: 'survived' | 'eliminated' | null
}

export type LmsState = {
  /** The round in progress, or null before one has opened. */
  round: LmsRound | null
  survivors: LmsSurvivor[]
  /** Every pick the viewer has made in the OPEN round. */
  myPicks: LmsPick[]
  /** Picks made by anyone, for matchweeks that have already locked. */
  revealedPicks: LmsPick[]
  error: string | null
}

export async function readLmsState(
  supabase: SupabaseClient,
  poolId: string,
  entryIds: string[],
): Promise<LmsState> {
  const empty: LmsState = { round: null, survivors: [], myPicks: [], revealedPicks: [], error: null }

  const { data: rounds, error: rErr } = await supabase
    .from('league_lms_rounds')
    .select('round_id, round_number, first_matchweek, last_matchweek')
    .eq('pool_id', poolId)
    .is('last_matchweek', null)
    .maybeSingle()
  if (rErr) return { ...empty, error: `league_lms_rounds: ${rErr.message}` }
  if (!rounds) return empty

  const round = rounds as LmsRound

  const [survivorsRes, picksRes] = await Promise.all([
    supabase
      .from('league_lms_survivors')
      .select('entry_id, eliminated_matchweek, is_winner')
      .eq('round_id', round.round_id),
    // RLS decides what comes back: the viewer's own picks always, and everyone
    // else's only once that matchweek has locked. One query, two policies —
    // the alternative is a client-side filter, which is not a gate.
    supabase
      .from('league_lms_picks')
      .select('round_id, entry_id, matchweek_number, club_id, result')
      .eq('round_id', round.round_id),
  ])
  if (survivorsRes.error) return { ...empty, round, error: `survivors: ${survivorsRes.error.message}` }
  if (picksRes.error) return { ...empty, round, error: `picks: ${picksRes.error.message}` }

  const own = new Set(entryIds)
  const all = (picksRes.data ?? []) as LmsPick[]

  return {
    round,
    survivors: (survivorsRes.data ?? []) as LmsSurvivor[],
    myPicks: all.filter((p) => own.has(p.entry_id)),
    revealedPicks: all.filter((p) => !own.has(p.entry_id)),
    error: null,
  }
}

export type LmsSaveResult = {
  saved: boolean
  /** The database refused it: locked, not the open matchweek, or already out. */
  refused: boolean
  error: string | null
}

/**
 * Choose a club for a matchweek. Replaces an earlier choice for the same
 * matchweek — changing your mind before the lock is allowed and expected.
 */
export async function saveLmsPick(
  supabase: SupabaseClient,
  args: { roundId: string; entryId: string; matchweekNumber: number; clubId: string },
): Promise<LmsSaveResult> {
  const { roundId, entryId, matchweekNumber, clubId } = args

  const { error } = await supabase.from('league_lms_picks').upsert(
    { round_id: roundId, entry_id: entryId, matchweek_number: matchweekNumber, club_id: clubId },
    { onConflict: 'round_id,entry_id,matchweek_number' },
  )
  if (error) {
    // The club-once-per-round rule surfaces as a unique violation. Translated
    // here because "duplicate key value violates constraint" is not a sentence
    // anybody should read.
    if (error.code === '23505') {
      return { saved: false, refused: false, error: 'You have already used that club in this round.' }
    }
    return { saved: false, refused: false, error: error.message }
  }

  // READ BACK. The lock trigger drops the write silently, so asking is the only
  // way to know — and a member who already had a pick and was refused an update
  // looks identical to one who succeeded if you only count rows.
  const { data, error: rErr } = await supabase
    .from('league_lms_picks')
    .select('club_id')
    .eq('round_id', roundId)
    .eq('entry_id', entryId)
    .eq('matchweek_number', matchweekNumber)
    .maybeSingle()
  if (rErr) return { saved: false, refused: false, error: rErr.message }

  const landed = (data as { club_id: string } | null)?.club_id === clubId
  return { saved: landed, refused: !landed, error: null }
}

/** Clubs this entry has already spent in the open round. */
export function usedClubIds(myPicks: LmsPick[]): Set<string> {
  return new Set(myPicks.map((p) => p.club_id))
}
