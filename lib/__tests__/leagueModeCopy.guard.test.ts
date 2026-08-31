// =============================================================
// No surface may describe a league pool out of POOL_MODE_INFO
// =============================================================
// `POOL_MODE_INFO` is keyed by the three BRACKET modes. A league pool's
// `prediction_mode` is `'league_pickem'`, which is not one of them — so every
// lookup of the shape
//
//     POOL_MODE_INFO[pool.prediction_mode] ?? POOL_MODE_INFO.full_tournament
//
// silently falls through and tells the reader their league pool is a Full
// Tournament: "a score for every match in the tournament, all in one sitting",
// "one deadline covers the whole tournament", "all 104 matches".
//
// The fallback itself is correct — an unrecognised mode should render something
// rather than crash. The bug is reaching it with a mode we ship, and it has now
// been found on two separate screens weeks apart:
//
//   PoolInfoTab   the members' view      (fixed when leagueModeInfo was written)
//   SettingsTab   the ADMIN's own view   (found 26 Aug, by Ryan, still wrong)
//
// Nothing fails when a third screen does it. The copy is confident, grammatical
// and wrong. So this test does not check one call site — it looks for the
// pattern anywhere, and requires that every file reaching POOL_MODE_INFO has
// asked whether the pool is a league first.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve, join } from 'path'
import { leagueModeInfo } from '../leagueModeInfo'

/** Every .tsx/.ts under app/ and components/, which is where copy lives. */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

const root = process.cwd()
const files = [...walk(resolve(root, 'app')), ...walk(resolve(root, 'components'))]

describe('league pools are never described from the bracket copy', () => {
  const consumers = files
    .map((f) => ({ path: f.replace(root + '/', ''), src: readFileSync(f, 'utf8') }))
    .filter(({ src }) => src.includes('POOL_MODE_INFO['))

  it('found the call sites (a rename must fail here, not pass silently)', () => {
    expect(consumers.length).toBeGreaterThan(0)
  })

  for (const { path, src } of consumers) {
    it(`${path} checks for a league before reaching POOL_MODE_INFO`, () => {
      // The check can be spelled a few ways; what matters is that leagueModeInfo
      // is the branch taken for a league pool in the SAME file.
      expect(
        src.includes('leagueModeInfo'),
        `${path} indexes POOL_MODE_INFO but never calls leagueModeInfo — a league ` +
          `pool there will fall through to "Full Tournament".`,
      ).toBe(true)
    })
  }

  it('both known surfaces resolve it the same way', () => {
    // Admin and member views of one pool describing it differently would be its
    // own bug, so they read the same helper with the same arguments.
    for (const path of [
      'app/pools/[pool_id]/PoolInfoTab.tsx',
      'app/pools/[pool_id]/admin/SettingsTab.tsx',
    ]) {
      const src = readFileSync(resolve(root, path), 'utf8')
      expect(src, path).toMatch(/leagueModeInfo\(\s*\n?\s*\(pool\.league_mode \?\? 'pickem'\)/)
      expect(src, path).toMatch(/\(pool\.league_depth \?\? null\)/)
    }
  })
})

// =============================================================
// The sealed draw's disclosure gate, as a test
// =============================================================
// Migration 116 hides the fixture list and opens it one matchweek at a time.
// That passes gate 1 only while the copy says what actually happens: the draw
// was made ONCE, at pool creation. The sentence that would fail the gate is a
// claim that the pairing happens each week — "you have been randomly paired" —
// because it describes a thing we do not do.
//
// The gate is a judgement call when a feature is designed. This is the half of
// it that can be mechanical, and it is worth having mechanical: the phrasing
// will be reached for by anyone writing this screen, precisely because it is
// the natural way to describe what the member experiences.
//
// ⚠ It reads what a MEMBER sees, not the source. The first draft of this test
// failed on its own warning comments — the files explain at length which
// sentence is forbidden, and that explanation has to quote it.
describe('the sealed draw is described honestly', () => {
  /** Source with `//` and block comments removed — copy only. */
  const prose = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, '')
       .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')

  const surfaces = [
    'lib/leagueModeInfo.ts',
    'app/pools/[pool_id]/LeagueScoringRulesTab.tsx',
    'app/pools/[pool_id]/LeagueHowToPlayTab.tsx',
    'app/pools/[pool_id]/DuelsTab.tsx',
  ].map((rel) => ({ rel, src: prose(readFileSync(resolve(root, rel), 'utf8')) }))

  it('no surface claims the pairing happens weekly or at random', () => {
    for (const { rel, src } of surfaces) {
      expect(src, `${rel} implies a weekly draw`).not.toMatch(/randomly paired/i)
      expect(src, `${rel} implies a weekly draw`).not.toMatch(/paired (each|every) (week|matchweek)/i)
      expect(src, `${rel} implies a random draw`).not.toMatch(/random(ly)? (draw|drawn|selected)/i)
    }
  })

  it('no surface still promises a published fixture list', () => {
    // The rows are not in the payload any more — a screen offering the season
    // fixture list would be promising something RLS withholds.
    for (const { rel, src } of surfaces) {
      expect(src, `${rel} still offers a published fixture list`)
        .not.toMatch(/fixture list is published/i)
      expect(src, `${rel} still offers the season fixture list`)
        .not.toMatch(/season fixture list/i)
    }
  })

  it('the member-facing explainer says when the draw was made and when it opens', () => {
    // The RENDERED string, not the source: the description is assembled from
    // concatenated literals, so a source regex breaks on where the lines wrap.
    for (const depth of ['results', 'scores'] as const) {
      const info = leagueModeInfo('showdown', depth)
      const all = [info.description, ...info.points].join(' ')
      expect(all, depth).toMatch(/drawn when the pool is created/i)
      // Migration 119: one duel at a time. The copy has to carry BOTH halves —
      // when the draw was made, and when each opponent opens — because the
      // second is the part a member would otherwise assume is a weekly draw.
      expect(all, depth).toMatch(/once the previous duel is decided/i)
      expect(all, depth).toMatch(/one duel at a time/i)
      // Migration 120's floor. A member who only ever hears the settle arm will
      // read a postponement week as the rule breaking, so both clauses ship.
      expect(all, depth).toMatch(/a day before you pick/i)
      expect(all, depth).not.toMatch(/published in advance/i)
      // The R1 rule, superseded. A surface still promising the opponent at
      // matchweek-open is describing behaviour the database no longer has.
      expect(all, depth).not.toMatch(/revealed when the matchweek opens/i)
    }
  })
})

// =============================================================
// The display face stays scoped
// =============================================================
// `t-display` (Anton) is a SECOND typeface, added for Showdown's ceremony
// surfaces only — Ryan's call 2026-08-30, choosing a scoped face over a global
// one. Nunito is the app's voice and stays that way.
//
// This is here because the failure mode is not a bug, it is drift: a display
// face leaks one screen at a time, each use individually reasonable, until it
// is the app's face and nobody decided that. The allowlist is the decision, and
// widening it should be as deliberate as adding the font was.
describe('the Showdown display face does not leak', () => {
  // ⚠ WIDENED ONCE, 2026-08-31, and this is what widening it should look like:
  // a named surface with a reason, not a directory. `DuelRecapSheet` is the
  // one-time "how your duel went" ceremony — the same fight-night register as
  // the duel card, and the exact case the face was added for. Anything that is
  // not a ceremony surface still belongs in Nunito.
  const ALLOWED = [
    'app/pools/[pool_id]/DuelsTab.tsx',
    'app/pools/[pool_id]/DuelRecapSheet.tsx',
  ]

  it('only Showdown surfaces use t-display', () => {
    // Comments stripped: `app/layout.tsx` explains the scope rule in a JSDoc
    // block, and a guard that counts its own documentation as a violation
    // teaches people to stop writing the documentation.
    const stripped = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, '')
         .split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
    const users = files
      .map((f) => f.replace(root + '/', ''))
      .filter((rel) => /\bt-display\b/.test(stripped(readFileSync(resolve(root, rel), 'utf8'))))
    expect(users.sort()).toEqual(ALLOWED.sort())
  })

  it('the rule is written down where someone reaching for the font will meet it', () => {
    const css = readFileSync(resolve(root, 'app/globals.css'), 'utf8')
    expect(css).toMatch(/@utility t-display/)
    expect(css).toMatch(/Showdown ceremony surfaces ONLY/i)
    expect(css).toMatch(/NOT\s+headings, tab labels, buttons/i)
  })

  it('Nunito is still the body face', () => {
    // The scoped face must not have become the default by way of --font-sans.
    const css = readFileSync(resolve(root, 'app/globals.css'), 'utf8')
    expect(css).toMatch(/--font-sans:\s*var\(--font-nunito\)/)
    expect(css).not.toMatch(/--font-sans:\s*var\(--font-anton\)/)
  })
})
