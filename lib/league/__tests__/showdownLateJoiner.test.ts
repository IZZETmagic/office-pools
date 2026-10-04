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
// ⚠ The generator has been replaced four times (100 → 117 → 118 → 143 → 164).
// Every rule about WHICH matchweeks get drawn, and in what order, is asserted
// against the NEWEST definition — the whole point of these assertions is that
// they describe what actually runs, and a test pinned to a superseded file
// passes while the live function does something else (055's warning).
const generator = read('lib/migrations/164_the_draw_waits_for_the_pool.sql')
/** 116 still owns the GRANT on `league_duel_is_revealed` (CREATE OR REPLACE keeps it). */
const seal = read('lib/migrations/116_the_draw_opens_one_week_at_a_time.sql')
/** 164 owns the policy, the predicate's body and the reveal clock. */
const draw = generator
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
/** One function's executable body out of a migration that defines several. */
const fnBody = (sql: string, name: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  if (start === -1) throw new Error(`${name} is not defined in this migration`)
  const rest = sql.slice(start)
  return body(rest.slice(0, rest.indexOf('$fn$;') + 5))
}
const generatorBody = fnBody(generator, 'league_generate_duel_schedule')
const revealsAt = fnBody(draw, 'league_duel_reveals_at')
const isRevealed = fnBody(draw, 'league_duel_is_revealed')
/** 165 replaced 164's membership pair: the stored start is the answer. */
const keepsStart = read('lib/migrations/165_a_pool_keeps_the_start_it_was_given.sql')
const playsMatchweek = fnBody(keepsStart, 'league_showdown_plays_matchweek')
const firstMatchweek = fnBody(keepsStart, 'league_showdown_first_matchweek')
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

describe('a join redraws everything not yet drawn, and nothing that has been', () => {
  it('the redraw line is league_duel_is_revealed — for the DELETE and the loop alike', () => {
    // 117's title promised one line and 100's `v_open_has_duels` kept two: a week
    // froze when it became the OPEN week, days before anybody could see it, and
    // everyone who joined in between was shut out (KevC, 2026-10-04).
    expect(generatorBody).toMatch(/AND NOT league_duel_is_revealed\(p_pool_id, d\.matchweek_number\)/)
    expect(generatorBody).toMatch(/AND NOT league_duel_is_revealed\(p_pool_id, m\.matchweek_number\)/)
    expect(generatorBody).not.toMatch(/v_open_has_duels/)
  })

  it('a stamped duel is never deleted', () => {
    expect(generatorBody).toMatch(/AND d\.drawn_at IS NULL/)
  })

  it('still never rewrites a settled duel, or a locked week', () => {
    expect(generatorBody).toMatch(/d\.settled_at IS NULL/)
    expect(generatorBody).toMatch(/m\.lock_at IS NULL OR m\.lock_at > now\(\)/)
  })

  it('⚠ there is ONE delete, and it runs before the fewer-than-two return', () => {
    // 143's short-roster branch deleted EVERY unsettled duel, revealed or not, so
    // the second-to-last member leaving erased a duel the other was mid-way
    // through. A drawn duel with a departed opponent stays; 134 settles it.
    expect(generatorBody.match(/DELETE FROM league_duels/g)?.length).toBe(1)
    expect(generatorBody.indexOf('DELETE FROM league_duels'))
      .toBeLessThan(generatorBody.indexOf("'fewer than two entries'"))
  })

  it('still orders the roster by created_at, so the circle is stable', () => {
    expect(generatorBody).toMatch(/ORDER BY pe\.created_at, pe\.entry_id/)
  })

  it('only schedules weeks this pool duels in', () => {
    expect(generatorBody).toMatch(/league_showdown_plays_matchweek\(p_pool_id, m\.matchweek_number\)/)
  })
})

describe('the reveal line and the redraw line are the same line', () => {
  it('the generator never counts by matchweek number', () => {
    // Migration 103's lesson: the rule existed four times and the copies drifted
    // the moment 101 changed one.
    expect(generatorBody).not.toMatch(/MIN\(matchweek_number\)/)
    expect(generatorBody).toMatch(/ORDER BY m\.lock_at NULLS LAST/)
  })

  it('the reveal clock finds the previous matchweek in lock time, never number', () => {
    // Rounds are played out of numerical order — minimum gap −121 days across
    // three real seasons (101).
    expect(revealsAt).toMatch(/\(prev\.lock_at, prev\.matchweek_number\) < \(m\.lock_at, m\.matchweek_number\)/)
  })
})

describe('a pool\'s first draw is its own (164)', () => {
  it('the first duel week opens 24 hours before its FIRST KICKOFF', () => {
    // Ryan, 2026-10-04: "24 hours before the first matchweek kickoff for that
    // pool. Remember pools can be started at different matchweeks." Kickoff,
    // not lock_at — the lock is an hour earlier (101).
    expect(revealsAt).toMatch(/WHEN m\.matchweek_number = public\.league_showdown_first_matchweek\(p_pool_id\)\s+THEN m\.first_kickoff_at - interval '24 hours'/)
  })

  it('⚠ no -infinity base case — that opened every new pool at the second join', () => {
    expect(revealsAt).not.toMatch(/infinity/)
  })

  it('a week the pool does not duel in has no reveal at all', () => {
    expect(revealsAt).toMatch(/WHEN NOT public\.league_showdown_plays_matchweek\(p_pool_id, p_matchweek_number\)\s+THEN NULL/)
  })

  it('later weeks hold 24 hours — 129\'s decision, never 137\'s throwaway', () => {
    // 138 was never applied: production ran 6h46m58s from 2026-09-07 until 164.
    expect(revealsAt).toMatch(/prev\.ranks_snapshot_at \+ interval '24 hours'/)
    expect(revealsAt).not.toMatch(/46 minutes/)
  })

  it('⚠ membership is the STORED start — never re-derived from a fixture list that moves', () => {
    // 165: 164 compared created_at with the CURRENT first kickoff, so a kickoff
    // corrected earlier made a pool's first week vanish while its provisional
    // rows stayed scoreable. The stored start wins; created_at is only the
    // fallback for a pool that has none.
    expect(playsMatchweek).toMatch(/COALESCE\(\s*p\.league_start_matchweek,/)
    expect(playsMatchweek).not.toMatch(/first_kickoff_at/)
    expect(playsMatchweek).not.toMatch(/now\(\)/)
    expect(firstMatchweek).toMatch(/WHEN p\.league_start_matchweek IS NOT NULL THEN/)
    expect(firstMatchweek).toMatch(/'-infinity'::timestamptz/)
  })

  it('⚠ the backfill stamps under the OLD rule, before the clock is replaced', () => {
    // 24h is later than 6h47m. Switching first would re-seal duels people had
    // already watched — 138's warning, in the direction it warned about.
    expect(draw.indexOf('UPDATE public.league_duels d'))
      .toBeLessThan(draw.indexOf('CREATE OR REPLACE FUNCTION public.league_duel_reveals_at('))
  })

  it('the create route resolves a Showdown start in SQL, never with its own 24h', () => {
    const route = read('app/api/pools/create/route.ts')
    expect(route).toMatch(/rpc\(\s*'league_showdown_first_matchweek_for'/)
    expect(prose(route)).not.toMatch(/24\s*\*\s*(60|3600)/)
  })

  it('the stamp is scheduled every minute', () => {
    expect(draw).toMatch(/'league-duel-draw-stamp',\s*'\* \* \* \* \*'/)
  })
})

describe('the draw is sealed until it is drawn, and stays open once it is', () => {
  it('the policy reads the row\'s stamp, then the predicate — membership first', () => {
    expect(draw).toMatch(/CREATE POLICY "Members see duels once they are drawn"/)
    expect(draw).toMatch(/league_duels\.drawn_at IS NOT NULL\s+OR league_duel_is_revealed\(league_duels\.pool_id, league_duels\.matchweek_number\)/)
    expect(draw).toMatch(/DROP POLICY IF EXISTS "Members see duels up to the open matchweek"/)
  })

  it('a stamped duel is revealed whatever the clock later says', () => {
    // A kickoff moved later by the sync (105) used to re-seal a duel people had
    // watched. The stamp half of the predicate is what makes a reveal permanent.
    expect(isRevealed).toMatch(/d\.drawn_at IS NOT NULL/)
    expect(isRevealed).toMatch(/league_duel_reveals_at\(p_pool_id, p_matchweek_number\) <= now\(\)/)
  })

  it('the helper is SECURITY DEFINER, because league_open_matchweek is not public', () => {
    // 102 revoked it from anon. A policy calling it directly would raise
    // permission denied rather than returning zero rows, and Postgres does not
    // promise to evaluate the membership EXISTS first. 116 granted it; 164's
    // CREATE OR REPLACE keeps that grant.
    const fn164 = draw.slice(draw.indexOf('CREATE OR REPLACE FUNCTION public.league_duel_is_revealed('))
    expect(fn164.slice(0, fn164.indexOf('$fn$'))).toMatch(/SECURITY DEFINER/)
    const fn = seal.slice(seal.indexOf('CREATE OR REPLACE FUNCTION public.league_duel_is_revealed'))
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

describe('the round order: fewest meetings first, then a per-pass hash', () => {
  it('never random() — a regeneration must not redraw a future nobody has seen', () => {
    // Under a sealed draw a member cannot audit this from the outside, which
    // makes it more dangerous rather than less.
    expect(generatorBody).not.toMatch(/random\(\)/)
  })

  it('meetings decide first, then "not last week again", then the hash', () => {
    expect(generatorBody).toMatch(/ORDER BY l\.s,\s+l\.repeats_last_week,\s+md5\(p_pool_id::text \|\| ':' \|\| l\.lvl::text \|\| ':' \|\| l\.r::text\)/)
  })

  it('history is re-read inside the loop, so this call\'s own weeks count', () => {
    expect(generatorBody.indexOf('WITH met AS')).toBeGreaterThan(generatorBody.indexOf('LOOP'))
  })

  it('⚠ the tie-break is NOT "longest since last met" — that replays pass one forever', () => {
    // 118's whole point: a pass that repeats the previous pass's order is
    // derivable by anyone who watched the first one.
    expect(generatorBody).not.toMatch(/ORDER BY[^;]*last_met/i)
  })

  it('no calendar arithmetic is left — a cycle starts where the roster does', () => {
    expect(generatorBody).not.toMatch(/v_pos|v_cycle|v_slot/)
  })
})
