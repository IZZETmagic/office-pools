import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// =============================================================
// Showdown has a weekly picking record, and must be asked for it
// =============================================================
// Decision 9: Showdown is a LAYER over Pick'em, not a peer engine. Its members
// pick the same fixtures, score into the same `league_match_scores`, and
// `league_score_duels` reads nothing but the sum of that column. So a Showdown
// member has exactly the same weekly form and correct count a Pick'em member
// does.
//
// ## Why this needs a guard rather than a comment
//
// The gate was `pool.league_mode === 'pickem'` and the failure was SILENT,
// because the block it gates is nullable. A Showdown pool got `pickem: null`,
// every consumer defaulted it (`?? []`, `?? 0`), and the Tale of the Tape
// rendered an empty form row and an opponent with zero correct picks. No error,
// no empty state, no missing field — two real numbers reported as nothing, on a
// card whose entire job is comparing two members.
//
// It survived because `depth` on the line above ALREADY paired the two modes,
// so the file looked internally consistent to anyone reading it.
//
// ⚠ The three gates must stay ONE flag. Splitting them is how a pool gets its
// form read from the database and then dropped on the way out, which costs the
// query and shows nothing.

const SRC = readFileSync(
  resolve(__dirname, '../leaderboard.ts'),
  'utf8',
)

describe('the weekly-picks gate', () => {
  it('names both modes that have a weekly record', () => {
    expect(SRC).toMatch(
      /const hasWeeklyPicks =\s*pool\.league_mode === 'pickem' \|\| pool\.league_mode === 'showdown'/,
    )
  })

  it('does not reintroduce a pickem-only flag', () => {
    // The narrow flag is the bug. If a genuinely Pick'em-only branch is ever
    // needed, give it a name that says what it is FOR — this assertion exists
    // to make that a deliberate act rather than a revert.
    expect(SRC).not.toMatch(/const isPickem\b/)
  })

  it('gates the form read on it — not on the mode directly', () => {
    expect(SRC).toMatch(/hasWeeklyPicks \? readLeagueFormByEntry\(/)
  })

  it('gates the row block on the same flag', () => {
    expect(SRC).toMatch(/pickem: hasWeeklyPicks/)
  })

  it('gates depth on the same flag, so the three cannot drift apart', () => {
    // `depth` was already right and the other two were not; keeping all three
    // on one flag is what stops that happening again in either direction.
    expect(SRC).toMatch(/const depth: 'results' \| 'scores' \| null =\s*\n?\s*hasWeeklyPicks/)
  })

  it('still leaves Table and LMS without one', () => {
    // Neither has a per-matchweek picking record; a form strip for them would
    // be five dots invented out of nothing.
    expect(SRC).not.toMatch(/hasWeeklyPicks[^\n]*'table'/)
    expect(SRC).not.toMatch(/hasWeeklyPicks[^\n]*'last_man_standing'/)
  })
})
