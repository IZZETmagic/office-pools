// =============================================================
// A deny-all table may only be read with the ADMIN client
// =============================================================
// Migration 050 closed four league tables to clients on purpose — RLS on, zero
// policies — and named them:
//
//     league_match_scores · league_entry_totals
//     league_fixture_state · league_score_events
//
// They are engine tables. Nothing signed in as a member may read them.
//
// ## Why this needs a test rather than care
//
// Getting it wrong is SILENT. RLS with no policy is not a 403 and not an error:
// PostgREST returns an empty array with `error: null`, so the read "succeeds",
// the map is empty, and the screen renders a confident zero. There is nothing
// in a log, nothing in a type, and nothing on the page that looks wrong — a
// duel says 0 – 0, a form column says "—", a badge simply never appears.
//
// It has happened four times, found on 2026-08-30 in one afternoon:
//
//   readLeagueFormByEntry        every league leaderboard's Form column had been
//                                empty since it shipped — while its own doc
//                                comment said it existed to end exactly that
//   the duel card's live score   rendered 0 – 0 for a matchweek where every
//                                member had scored
//   duel points on the pool page  DuelsTab silently recomputed w*3+d instead,
//                                the divergence ShowdownCardFacts warns about
//   LMS rounds_won               latent: SurvivorTab paints its badge only when
//                                the count is > 0, so it could never appear —
//                                while the POOLS CARD, which reads the same
//                                column on admin, would say "2 rounds won"
//
// Two of the surviving correct call sites carry comments describing the same
// bug being fixed once before. The pattern is not carelessness; it is that the
// failure gives no feedback. So it gets a guard.
//
// ⚠ THIS IS A TEXT SCAN, and it proves less than it looks. It checks the
// receiver of `.from(...)` is called something admin-ish. It cannot tell an
// admin-named variable that holds a user client, and it does not follow a
// client through a function parameter — `duels.ts` takes `admin` as an argument
// and this only sees the name. A green result means nothing obviously wrong,
// not that the clients are right.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve, join } from 'path'

/** Named in migration 050 as deny-all. Adding one here is not a style choice. */
const DENY_ALL = [
  'league_match_scores',
  'league_entry_totals',
  'league_fixture_state',
  'league_score_events',
] as const

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === '__tests__') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

const root = process.cwd()
// `scripts/` is excluded: those are operator tools that already run as
// service_role by construction, and they are not shipped.
const files = [...walk(resolve(root, 'app')), ...walk(resolve(root, 'lib'))]

/** The receiver of a `.from('table')` call — `admin` in `await admin.from(...)`. */
function receiversOf(src: string, table: string): string[] {
  const out: string[] = []
  // Tolerates the newline this codebase habitually puts before `.from`.
  const re = new RegExp(`([A-Za-z_$][\\w$]*)\\s*(?:\\(\\))?\\s*\\n?\\s*\\.from\\(\\s*['"\`]${table}['"\`]`, 'g')
  for (const m of src.matchAll(re)) out.push(m[1])
  return out
}

describe('deny-all league tables are never read with a user-scoped client', () => {
  it('finds the call sites at all — a rename must fail here, not pass silently', () => {
    const total = files.reduce((n, f) => {
      const src = readFileSync(f, 'utf8')
      return n + DENY_ALL.reduce((k, t) => k + receiversOf(src, t).length, 0)
    }, 0)
    expect(total).toBeGreaterThan(0)
  })

  for (const table of DENY_ALL) {
    it(`${table} is only reached through an admin client`, () => {
      const offenders: string[] = []
      for (const file of files) {
        const src = readFileSync(file, 'utf8')
        for (const receiver of receiversOf(src, table)) {
          // `admin`, `scoringAdmin`, `adminForTotals`, `createAdminClient()`…
          if (!/admin/i.test(receiver)) {
            offenders.push(`${file.replace(root + '/', '')} — ${receiver}.from('${table}')`)
          }
        }
      }
      expect(offenders, offenders.join('\n')).toEqual([])
    })
  }

  it('the deny-all list still matches what migration 050 says it closed', () => {
    // If 050's list and this one drift, the guard is protecting the wrong set —
    // and a table quietly given a policy later should be REMOVED from here on
    // purpose, not left to make this test lie.
    const m050 = readFileSync(resolve(root, 'lib/migrations/050_l1_league_schema.sql'), 'utf8')
    const claim = m050.slice(m050.indexOf('deny-all (RLS on, zero policies) on exactly:'))
      .slice(0, 200)
    for (const t of DENY_ALL) expect(claim, `050 no longer names ${t}`).toContain(t)
  })
})
