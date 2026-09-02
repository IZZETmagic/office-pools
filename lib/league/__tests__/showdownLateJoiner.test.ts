// =============================================================
// Showdown has to survive somebody joining in October
// =============================================================
// Decision 10: a pool can begin mid-season and a straggler picks up at the next
// available matchweek. Pick'em needs nothing for that — every deadline is a
// kickoff. Showdown is the mode with state, because its fairness rests on a
// published round-robin and every join flips the rotation's parity.
//
// Migration 100 changes two things, and both are the kind that fail quietly:
//
//   · a bye was worth 0. Correct for a fixed roster — "the circle method
//     rotates it, so everyone sits out the same number of matchweeks" — and
//     wrong once joins restart the rotation, at which point byes land unevenly
//     and cost ~1.5 points each against expectation.
//
//   · a join redrew the LIVE matchweek, because 095 rebuilt from the first
//     matchweek not yet LOCKED, which is the one members are picking in. Their
//     picks survived; the opponent they were being measured against did not.
//
// The behaviour needs a database, and lives in scripts/verify-showdown. This is
// the always-on half: it reads the migration as text and proves the two rules
// are still expressed, because nothing else fails when they are not — a bye
// silently worth zero looks exactly like a bye worth a point until somebody
// checks the leaderboard against the fixtures.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')
const migration = read('lib/migrations/100_showdown_survives_a_late_joiner.sql')
/**
 * ⚠ 121 SUPERSEDES 100's VALUES. 100 established that a bye pays a tie rather
 * than nothing — "no opponent, so no defeat" — and that reasoning is untouched.
 * What changed on 2026-08-31 is the scale: 3/1/0 became 500/250/0, so the
 * literals must be asserted against the migration that writes them TODAY. 100
 * is still read above for the parts of the late-joiner behaviour it owns.
 */
const duelValues = read('lib/migrations/121_a_duel_is_worth_half_a_perfect_week.sql')
// ⚠ 117 REPLACED 100's generator. The bye scoring below is still 100's; every
// rule about WHICH matchweeks get drawn now lives in 117, and asserting those
// against 100 would be a test that passes while the live function does
// something else — the exact drift migration 055 is a warning about.
// 118 REPLACED 117's function in turn. Always the newest definition — the whole
// point of these assertions is that they describe what actually runs.
const generator = read('lib/migrations/118_the_draw_does_not_run_out_of_surprises.sql')
const seal = read('lib/migrations/116_the_draw_opens_one_week_at_a_time.sql')
/**
 * Just the executable body of a `$fn$ ... $fn$` function, with `--` comment
 * lines stripped.
 *
 * ⚠ A negative assertion has to run over this and not the raw file. These
 * migrations argue their case at length and the argument NAMES the thing it
 * rejects — 116's header explains why `matchweek_number <= open` is wrong, and
 * 117's COMMENT ON FUNCTION says "never MIN(matchweek_number)". Both would match
 * a `.not.toMatch` over the whole file, failing a migration that is correct.
 */
const body = (sql: string) => {
  const parts = sql.split('$fn$')
  return (parts.length > 1 ? parts[1] : sql)
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
}
const modeInfo = read('lib/leagueModeInfo.ts')
const rulesTab = read('app/pools/[pool_id]/LeagueScoringRulesTab.tsx')

/**
 * The same file with its JS/TS COMMENTARY removed, so a copy assertion sees
 * only what a member could see.
 *
 * ⚠ Written because a guard added here on 2026-08-31 failed on its own
 * documentation: `leagueModeInfo.ts` explains in a header comment which
 * sentence migration 121 retired, and quoting a retired sentence in order to
 * say it is retired is not the same as still telling somebody it is true. A
 * banned-phrase check that cannot tell those apart makes the file harder to
 * document than to get wrong.
 */
const prose = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments, JSX {/* */} included
    .replace(/^\s*\/\/.*$/gm, '')       // whole-line // comments
    // ⚠ AND JOIN CONCATENATED LITERALS. `leagueModeInfo.ts` writes every
    // description as `'…' + '…'` wrapped at 100 columns, so a sentence a member
    // reads as one line is split in the source wherever the wrap happened to
    // fall. A phrase check without this passes or fails on where the line broke,
    // which is worse than not checking — it would go green again the next time
    // somebody reflowed the paragraph.
    .replace(/'\s*\+\s*\n?\s*'/g, '')
const modeInfoProse = prose(modeInfo)
const rulesTabProse = prose(rulesTab)

describe('a bye is worth a tie, never nothing', () => {
  it('the settle function pays a bye exactly what it pays a tie', () => {
    // The RULE, not the number: 100 set it at 1 and 121 at 250, and what has to
    // survive a revaluation is that the two stay equal. A bye drifting below a
    // tie would tax a member for a fixture that did not exist.
    const m = duelValues.match(
      /points_a = CASE WHEN acc\.b IS NULL THEN (\d+)[\s\S]*?WHEN acc\.a = acc\.b THEN (\d+)/,
    )
    expect(m, 'could not parse the points_a CASE out of 121').not.toBeNull()
    expect(m![1]).toBe(m![2])
  })

  it('and never pays the absent side anything', () => {
    // entry_b is the padding. It is nobody, so it scores NULL, not a point.
    expect(duelValues).toMatch(/points_b = CASE WHEN acc\.b IS NULL THEN NULL/)
  })

  it('a loss is still zero — the bye is not just "everything scores"', () => {
    const settle = duelValues.slice(duelValues.indexOf('points_a = CASE'))
    expect(settle).toMatch(/WHEN acc\.a > acc\.b THEN \d+/)
    expect(settle).toMatch(/ELSE 0 END/)
  })
})

describe('a join never redraws the matchweek people are picking in', () => {
  it('the live matchweek is skipped when it already has a draw', () => {
    expect(generator).toMatch(/v_open_has_duels/)
    expect(generator).toMatch(/NOT \(v_open_has_duels AND m\.matchweek_id = v_open_id\)/)
  })

  it('⚠ but a FIRST generation still gets the live matchweek', () => {
    // The two cases are separated by whether duels already exist. Without that,
    // a pool created mid-season would skip the very matchweek its members can
    // pick in, and sit out a week for no reason.
    const guard = generator.slice(generator.indexOf('SELECT EXISTS ('))
    expect(guard).toMatch(/FROM league_duels d/)
    expect(guard).toMatch(/m\.matchweek_id = v_open_id/)
  })

  it('still never rewrites a settled duel', () => {
    // The rule 095 established and neither 100 nor 117 may lose: a result is a
    // result. 117 gets it twice over — a settled matchweek is fully played, so
    // its lock is in the past and the predicate excludes it anyway.
    expect(generator).toMatch(/d\.settled_at IS NULL/)
    expect(generator).toMatch(/m\.lock_at IS NULL OR m\.lock_at > now\(\)/)
  })

  it('still orders the roster by created_at, so existing pairs do not reshuffle', () => {
    expect(generator).toMatch(/ORDER BY pe\.created_at, pe\.entry_id/)
  })
})

describe('the reveal line and the redraw line are the same line', () => {
  it('the generator calls league_open_matchweek instead of counting by number', () => {
    // Migration 103's lesson: the rule existed four times and the copies drifted
    // the moment 101 changed one. 100 was the copy 103 missed.
    expect(generator).toMatch(/v_open_id\s*:=\s*league_open_matchweek\(v_season\)/)
    expect(body(generator)).not.toMatch(/MIN\(matchweek_number\)/)
  })

  it('both sides measure in lock time, never matchweek number', () => {
    // Rounds are played out of numerical order — minimum gap −121 days across
    // three real seasons (101). A number comparison seals a matchweek being
    // played and reveals one that is weeks away.
    expect(seal).toMatch(/m\.lock_at <= COALESCE/)
    expect(body(seal)).not.toMatch(/matchweek_number <=/)
    expect(generator).toMatch(/ORDER BY m\.lock_at NULLS LAST/)
  })
})

describe('the draw is sealed until its matchweek opens', () => {
  it('the policy gates on league_duel_is_revealed, not just membership', () => {
    expect(seal).toMatch(/CREATE POLICY "Members see duels up to the open matchweek"/)
    expect(seal).toMatch(/AND league_duel_is_revealed\(league_duels\.pool_id, league_duels\.matchweek_number\)/)
    expect(seal).toMatch(/DROP POLICY IF EXISTS "Members can view their pool's duels"/)
  })

  it('a finished season still shows its own results', () => {
    // COALESCE(..., now()) is load-bearing: league_open_matchweek returns NULL
    // once every matchweek is done, and `lock_at <= NULL` is NULL — which would
    // hide every duel of a finished season, settled results included.
    expect(seal).toMatch(/COALESCE\(\s*\n?\s*\(SELECT o\.lock_at/)
    expect(seal).toMatch(/now\(\)\)/)
  })

  it('the helper is SECURITY DEFINER, because league_open_matchweek is not public', () => {
    // 102 revoked it from anon. A policy calling it directly would raise
    // permission denied rather than returning zero rows, and Postgres does not
    // promise to evaluate the membership EXISTS first.
    const fn = seal.slice(seal.indexOf('CREATE OR REPLACE FUNCTION public.league_duel_is_revealed'))
    expect(fn).toMatch(/SECURITY DEFINER/)
    expect(fn.slice(0, fn.indexOf('CREATE POLICY'))).toMatch(/GRANT\s+EXECUTE[\s\S]*?TO anon, authenticated, service_role/)
  })

  it('⚠ the service-role path is filtered in TypeScript, because RLS cannot see it', () => {
    // poolCards reads league_duels with a client that carries bypassrls. The
    // seal is only real on that path if it is applied there.
    const cards = read('lib/league/poolCards.ts')
    expect(cards).toMatch(/GATE B/)
    // The gate is ASKED, not mirrored.
    expect(cards).toMatch(/rpc\('league_duel_is_revealed'/)
    // And it is an allow-list: a row gets in by being settled or by being the
    // open week with the database's blessing. Anything else falls through.
    expect(cards).toMatch(/if \(!row\.settled_at && !\(isOpenWeek && openRevealed\.get\(p\.poolId\)\)\) continue/)
  })

  it('⚠ poolCards must never RE-DERIVE the reveal rule — it has drifted three times', () => {
    /*
     * This file used to hold the third copy of the rule, and like the other two
     * it rotted in place: it implemented migration 119 (*open the moment the
     * previous matchweek settles*) and stayed there through 123's 48h hold and
     * 129's 24h. The card named the next opponent while the pool page sealed
     * it, so the dashboard spoiled the walk-out before you could reach it.
     *
     * The tell, every time, is arithmetic on the matchweek timestamps. Nothing
     * in this module has any business computing WHEN a duel opens — one
     * function owns that (`league_duel_reveals_at`) and one predicate exposes
     * it. So the guard is not "does it call the RPC" (it might do both) but
     * "does it do the sum itself".
     */
    const cards = read('lib/league/poolCards.ts')
    // Strip comments — the note explaining the history legitimately mentions
    // both, and a guard that trips on its own documentation is useless.
    const code = cards
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

    expect(code, 'poolCards is deciding the reveal from ranks_snapshot_at again')
      .not.toMatch(/ranks_snapshot_at\s*!==\s*null/)
    expect(code, 'poolCards is re-deriving the 24h floor from lock_at again')
      .not.toMatch(/lock_at.*24\s*\*\s*3600/)
  })
})

describe('the copy matches the engine', () => {
  it('no longer promises everyone plays everyone the same number of times', () => {
    // True of a fixed roster, false the moment somebody joins in October —
    // a straggler necessarily gets fewer duels than the members from August.
    for (const [name, src] of [['leagueModeInfo', modeInfo], ['LeagueScoringRulesTab', rulesTab]] as const) {
      expect(src, name).not.toMatch(/everyone plays everyone the same number of times/)
    }
  })

  it('both surfaces say the duel points are ADDED, not ranked ahead', () => {
    expect(modeInfoProse).toMatch(/added to whatever your picks scored/)
    expect(rulesTabProse).toMatch(/There is one table/)
  })

  it('both surfaces disclose that a late joiner plays fewer duels', () => {
    // Ryan's call, 2026-08-31: state the cost rather than engineer round it.
    // At 3 points a short season was noise; at 500 it decides places, so the
    // disclosure gate needs it said out loud on the surfaces a member reads.
    for (const [name, src] of
      [['leagueModeInfo', modeInfoProse], ['LeagueScoringRulesTab', rulesTabProse]] as const) {
      expect(src, name).toMatch(/[Jj]oining after the season has started/)
      expect(src, name).toMatch(/fewer duels/)
    }
  })

  it('both surfaces tell the member a bye is not a defeat', () => {
    expect(modeInfo).toMatch(/no opponent, so there was no defeat/)
    expect(rulesTab).toMatch(/no opponent, so there was no defeat/)
    // The VALUE is imported from `duelPoints.ts` rather than typed into the
    // markup, so it cannot drift from the engine — `duelPoints.guard.test.ts`
    // holds that end. What this asserts is that the row is still shown at all.
    expect(rulesTab).toContain('<PointsRow label="No opponent this week" value={DUEL_BYE} />')
  })

  it('no surface still claims duel points merely BREAK TIES with the weekly score', () => {
    // Migration 121 changed the ranking from a cascade to a sum, so the old
    // sentence — "duel points decide the table; the weekly score is the
    // tiebreak" — now describes an ordering that does not exist.
    for (const [name, src] of
      [['leagueModeInfo', modeInfoProse], ['LeagueScoringRulesTab', rulesTabProse]] as const) {
      expect(src, name).not.toMatch(/[Dd]uel points decide the table/)
      expect(src, name).not.toMatch(/weekly score is the tiebreak/)
      expect(src, name).not.toMatch(/matchweek points are the tiebreak/)
    }
  })
})

describe('the round order is permuted per cycle, deterministically', () => {
  it('never random() — a regeneration must not redraw a future nobody has seen', () => {
    // Under a sealed draw a member cannot audit this from the outside, which
    // makes it more dangerous rather than less: random() would reshuffle the
    // whole remaining season every time somebody joined and nothing would show.
    expect(body(generator)).not.toMatch(/random\(\)/)
    expect(generator).toMatch(/md5\(p_pool_id::text \|\| ':' \|\| v_cycle::text/)
  })

  it('the seed is the pool and the cycle, so two pools differ and one pool does not', () => {
    expect(generator).toMatch(/array_agg\(r ORDER BY md5\(/)
    expect(generator).toMatch(/generate_series\(0, v_rounds - 1\)/)
  })

  it('the round is keyed on the matchweek\'s place in the SEASON, not the loop', () => {
    // 083 and 117 derived it from a counter starting at 0 on whichever matchweek
    // the regeneration happened to touch first, so a pool regenerated in
    // November replayed August's rotation.
    expect(generator).toMatch(/ROW_NUMBER\(\) OVER \(ORDER BY m\.lock_at NULLS LAST/)
    expect(generator).toMatch(/v_cycle := v_pos \/ v_rounds/)
    expect(generator).toMatch(/v_slot\s+:= v_pos % v_rounds/)
    expect(body(generator)).not.toMatch(/v_k/)
  })

  it('the permutation is applied, not merely computed', () => {
    expect(generator).toMatch(/v_r := v_perm\[v_slot \+ 1\]/)
  })
})
