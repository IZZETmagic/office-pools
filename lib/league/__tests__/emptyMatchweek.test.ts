// =============================================================
// A matchweek with no games must be a non-event, not a trap
// =============================================================
// Re-homing's floor empties about one matchweek a season — measured, in all
// three seasons replayed in rehome.test.ts. Before migration 106 that was a
// season-ending bug in two different modes, and neither would have gone red:
//
//   · `league_snapshot_matchweek_ranks` refused to settle a matchweek with no
//     fixtures. Showdown and Last Man Standing both settle off
//     `ranks_snapshot_at` going non-NULL, so the whole season would sit behind
//     it, permanently — the same stall 094 was written to fix.
//
//   · `league_lms_settle` reads a missing pick as elimination. An empty
//     matchweek never opens, so NOBODY has a pick, so EVERYBODY goes out in the
//     same statement. That already happened in production once (097).
//
// Showdown needed no change and that is asserted too, because "we checked and
// it was already right" is worth exactly as much as the fix until someone
// writes it down.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')
const m106 = read('lib/migrations/106_the_rehomed_fixture_lands.sql')
const m100 = read('lib/migrations/100_showdown_survives_a_late_joiner.sql')

function fn(src: string, name: string): string {
  const i = src.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`)
  expect(i, `${name} is not defined here`).toBeGreaterThan(-1)
  return src.slice(i, src.indexOf('\n$fn$;', i))
}

describe('the snapshot no longer refuses an empty matchweek', () => {
  const snap = fn(m106, 'league_snapshot_matchweek_ranks')

  it('⚠ the zero-fixture short circuit is gone', () => {
    expect(snap).not.toMatch(/COALESCE\(v_fixtures, 0\) = 0 THEN\s*\n\s*RETURN 0;/)
    expect(snap).toMatch(/IF v_season IS NULL OR v_done IS NOT NULL THEN/)
  })

  it('but it still waits for the window to close', () => {
    // 0 < 0 is false, so without this an empty matchweek would settle the
    // instant it was asked — months early, taking every duel with it.
    expect(snap).toMatch(/IF v_completed < v_fixtures OR v_fixtures = 0 THEN/)
  })

  it('and everything else 094 decided is untouched', () => {
    expect(snap).toMatch(/s\.fixture_id IS NULL OR s\.is_completed IS NOT TRUE/)
    expect(snap).toMatch(/v_closed := \(v_playable = 0\)/)
    expect(snap).toMatch(/'matchweek_completed'/)
  })
})

describe('Last Man Standing eliminates nobody in a week with no games', () => {
  const lms = fn(m106, 'league_lms_settle')

  it('counts the matchweek’s fixtures and skips when there are none', () => {
    expect(lms).toMatch(/INTO v_played/)
    expect(lms).toMatch(/IF v_played = 0 THEN\s*\n\s*RETURN jsonb_build_object\('skipped'/)
  })

  it('⚠ and skips BEFORE the judging, not after', () => {
    // After the UPDATE it would be a comment, not a guard.
    const guard = lms.indexOf('IF v_played = 0 THEN')
    const judge = lms.indexOf('no pick is elimination')
    expect(guard).toBeGreaterThan(-1)
    expect(judge).toBeGreaterThan(guard)
  })

  it('still keeps 097’s guard, which is a different week entirely', () => {
    // "Precedes the round" and "had no games" are both weeks nobody could pick
    // in, and they arrive by different routes.
    expect(lms).toMatch(/IF p_matchweek < v_first THEN/)
  })

  it('and a played week still eliminates a missing pick', () => {
    // The generosity is scoped to weeks with no fixtures. If it ever widened,
    // Last Man Standing would stop having a way to lose.
    expect(lms).toMatch(/WHEN pk\.club_id IS NULL THEN false/)
  })
})

describe('Showdown needed nothing, and here is why', () => {
  it('a week with no games sums to zero rather than NULL, so it is a draw', () => {
    // COALESCE(…, 0) on both sides ⇒ acc.a = acc.b ⇒ one point each. If either
    // COALESCE were dropped, the same week would read as a BYE and pay one side
    // a point for an opponent who was there all along.
    const duels = fn(m100, 'league_score_duels')
    expect(duels.match(/COALESCE\(\(SELECT SUM\(s\.total_points\)/g)).toHaveLength(2)
    expect(duels).toMatch(/WHEN acc\.a = acc\.b THEN 1/)
  })
})

describe('the write refuses what the planner should never ask for', () => {
  const apply = fn(m106, 'league_apply_rehome')

  it('both matchweeks must be unlocked, and they are separate checks', () => {
    expect(apply).toMatch(/\(dst\.lock_at IS NULL OR dst\.lock_at > p_now\)/)
    expect(apply).toMatch(/\(src\.lock_at IS NULL OR src\.lock_at > p_now\)/)
  })

  it('the destination must be in the same season', () => {
    // Without it a malformed payload files a fixture under another competition,
    // and nothing in the schema forbids it.
    expect(apply).toMatch(/AND dst\.season_id = p_season_id/)
  })

  it('a completed or manually-overridden fixture is refused in SQL as well', () => {
    expect(apply).toMatch(/AND NOT f\.is_completed/)
    expect(apply).toMatch(/AND NOT f\.manual_override/)
  })

  it('reports what MOVED, not what was asked', () => {
    expect(apply).toMatch(/RETURNING f\.fixture_id/)
    expect(apply).toMatch(/'moved', jsonb_array_length\(v_moved\)/)
  })

  it('⚠ never writes kickoff_at — 105 owns that, and this owns the round', () => {
    // Two functions writing one column is how a fixture ends up in a matchweek
    // whose window it does not sit in.
    const upd = apply.slice(apply.indexOf('UPDATE league_fixtures f'))
    expect(upd).not.toMatch(/kickoff_at\s*=/)
  })
})

describe('the sync only re-plans when something actually moved', () => {
  const sync = read('lib/integrations/apiFootball/syncLeagueFixtures.ts')

  it('gates on the APPLIED count, not the detected one', () => {
    // Detected-but-refused means a completed or overridden fixture, where
    // nothing changed and the whole-season read would be wasted.
    expect(sync).toMatch(/if \(result\.rescheduleApplied > 0\) \{/)
  })

  it('a re-home failure never fails the sync', () => {
    const block = sync.slice(sync.indexOf('7b2. re-home'), sync.indexOf('7c. standings'))
    expect(block).toMatch(/catch \(e\) \{/)
    expect(block).toMatch(/push\('league_rehome'/)
  })
})

describe('the runner does not plan from a truncated season', () => {
  const runner = read('lib/league/rehomeSeason.ts')

  it('⚠ treats a full page as a truncation, not a season', () => {
    // PostgREST silently caps a read. Planning on a partial fixture list would
    // "empty" matchweeks that are full, and the floor would then merge them.
    expect(runner).toMatch(/if \(fixtures\.length >= CAP\)/)
    expect(runner).toMatch(/read was truncated/)
  })

  it('checks both reads for an error instead of destructuring it away', () => {
    expect(runner).toMatch(/if \(mwRes\.error\) throw/)
    expect(runner).toMatch(/if \(fxRes\.error\) throw/)
  })
})
