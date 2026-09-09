// =============================================================
// Both or neither
// =============================================================
// On 2026-09-09 the line-up backfill printed this and moved on:
//
//   1 failure(s):
//     1575143: lineup insert: TypeError: fetch failed
//
// The DELETE had committed. The INSERT never reached the database. A Bundesliga
// fixture was left with zero line-up rows — emptier than before the run started
// — because a DELETE call and an INSERT call over HTTP have no transaction
// between them, and something has to hold them together.
//
// Migration 140 moved every one of those pairs into a plpgsql function, whose
// body IS a transaction. The behavioural tests live beside the arms they belong
// to; this file guards the shape, because the failure mode is one line of
// perfectly reasonable-looking code away at all times, and it is silent. A
// reviewer seeing `.from('match_events').delete()` has no reason to flinch.
//
// ⚠ SOURCE-TEXT, ON PURPOSE. There is no runtime seam that can tell you nobody
// ever writes a bare delete — only that nobody did on the paths a test drove.
// =============================================================

import { readFileSync } from 'fs'
import { join } from 'path'

import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..', '..', '..')

/** Every file that replaces a fixture's rows. */
const WRITERS = [
  'lib/integrations/apiFootball/syncLeagueFixtures.ts',
  'scripts/backfill-match-events.ts',
  'scripts/backfill-match-lineups-stats.ts',
]

/** The three tables whose rows are replaced wholesale. */
const REPLACED = ['match_events', 'match_lineups', 'match_team_stats', 'match_player_stats']

const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')

describe('the replace-all writes are atomic', () => {
  it.each(WRITERS)('⚠⚠ %s issues no bare delete against a replaced table', (file) => {
    const src = read(file)
    for (const table of REPLACED) {
      // `.from('match_events')` ... `.delete()` — allowing for the chain being
      // broken across lines, which is how it was written before.
      const chained = new RegExp(`from\\(['"]${table}['"]\\)[\\s\\S]{0,120}?\\.delete\\(`)
      expect(chained.test(src), `${file} deletes from ${table} directly`).toBe(false)
    }
  })

  it.each(WRITERS)('⚠ %s issues no bare insert into a replaced table either', (file) => {
    // An insert on its own is the other half of the same bug: it means somebody
    // has reintroduced a delete somewhere to pair it with.
    const src = read(file)
    for (const table of REPLACED) {
      const chained = new RegExp(`from\\(['"]${table}['"]\\)[\\s\\S]{0,120}?\\.insert\\(`)
      expect(chained.test(src), `${file} inserts into ${table} directly`).toBe(false)
    }
  })

  it('every writer goes through the migration-140 functions', () => {
    // The positive half: absence of a delete would also be satisfied by a file
    // that writes nothing at all.
    expect(read(WRITERS[0])).toContain("rpc('replace_match_events'")
    expect(read(WRITERS[0])).toContain("rpc('replace_match_lineups'")
    expect(read(WRITERS[0])).toContain("rpc('replace_match_team_stats'")
    expect(read(WRITERS[0])).toContain("rpc('replace_match_player_stats'")
    expect(read(WRITERS[1])).toContain("rpc('replace_match_events'")
    expect(read(WRITERS[2])).toContain("rpc('replace_match_lineups'")
    expect(read(WRITERS[2])).toContain("rpc('replace_match_team_stats'")
  })

  it('⚠ reading a replaced table is still allowed — this guards writes only', () => {
    // 7b5 selects `match_lineups` to find out which line-ups it already holds,
    // and must keep being able to. A guard that banned the table outright would
    // be quietly deleted the first time it got in someone's way.
    expect(read(WRITERS[0])).toContain("from('match_lineups')")
  })
})

describe('migration 140 says what it must', () => {
  const sql = read('lib/migrations/140_both_or_neither.sql')
  // ⚠ The file EXPLAINS why it is not SECURITY DEFINER, in prose, so a naive
  // grep matches its own reasoning and fails. Strip the comments first — this
  // caught itself on the first run.
  const code = sql
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n')

  it('defines all three functions', () => {
    for (const fn of ['replace_match_events', 'replace_match_lineups', 'replace_match_team_stats']) {
      expect(sql).toContain(`CREATE OR REPLACE FUNCTION ${fn}(p_fixture_id uuid, p_rows jsonb)`)
    }
  })

  it('⚠⚠ is NOT security definer', () => {
    // These write to three deny-all tables. A definer function would hand every
    // signed-in user a write path and quietly undo 136 and 139's RLS. The only
    // caller is the service role, which bypasses RLS without any help.
    expect(code).not.toMatch(/SECURITY\s+DEFINER/i)
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION replace_match_events(uuid, jsonb) TO service_role')
    // ⚠ NAMING anon AND authenticated IS THE POINT. `FROM PUBLIC` alone reads
    // like it covers them and does not: on Supabase both hold EXECUTE through
    // ALTER DEFAULT PRIVILEGES, a direct grant. The first apply of 140 got this
    // wrong and its own VERIFY block caught it.
    expect(sql).toContain(
      'REVOKE ALL ON FUNCTION replace_match_events(uuid, jsonb) FROM PUBLIC, anon, authenticated',
    )
    for (const fn of ['replace_match_events', 'replace_match_lineups', 'replace_match_team_stats']) {
      expect(code).toContain(`REVOKE ALL ON FUNCTION ${fn}(uuid, jsonb) FROM PUBLIC, anon, authenticated`)
    }
  })

  it('⚠ pins search_path on every function', () => {
    // A function with a mutable search_path is a Supabase advisor finding and a
    // real hijack surface once anything is SECURITY DEFINER.
    expect(code.match(/SET search_path = public, pg_temp/g)).toHaveLength(3)
  })

  it('⚠ stamps fixture_id from the PARAMETER, never from the payload', () => {
    // Otherwise a caller could delete fixture A's rows and insert fixture B's,
    // and the function would look like it worked.
    expect(code.match(/SELECT p_fixture_id,/g)).toHaveLength(3)
  })

  it('⚠ an empty set clears the TIMELINE but not line-ups or statistics', () => {
    // A VAR-disallowed goal is removed from the payload, so for events an empty
    // set is a real instruction. A stat never vanishes as a correction and a
    // line-up is empty for the whole hour before it publishes, so for those two
    // an empty set must leave what we hold alone.
    const guards = code.match(/IF jsonb_array_length\(p_rows\) = 0 THEN/g)
    expect(guards).toHaveLength(2)
    const events = code.slice(
      code.indexOf('FUNCTION replace_match_events'),
      code.indexOf('FUNCTION replace_match_lineups'),
    )
    expect(events).not.toContain('jsonb_array_length(p_rows) = 0')
  })

  it('carries the apply-before-deploy warning', () => {
    // A missing function is a 404 on every write. 136 and 139 both say this.
    expect(sql).toContain('APPLY THIS BEFORE DEPLOYING THE CODE THAT NAMES IT')
  })
})
