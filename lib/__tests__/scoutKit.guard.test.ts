import { readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve } from 'path'

import { describe, expect, it } from 'vitest'

// =============================================================
// The scout kit is the only place in scouting that knows a colour
// =============================================================
// ## ⚠⚠ THIS EXISTS BECAUSE ONE COLOUR CAME TO MEAN FIVE THINGS
//
// Scouting shipped across three surfaces written separately, and every colour
// choice was locally reasonable. Counted across `MatchScoutSheet`, `ScoutingTab`
// and `Dossier` before the kit:
//
//   gold   — the drought line, signature figures, the AWAY CLUB in the crowd
//            bar, the reality mark on a comparison, the exact-score count
//   green  — a win, the HOME CLUB's wins in the pairing bar, every player
//            rating pill regardless of the rating, "and right"
//   red    — a loss, the AWAY CLUB's wins in the pairing bar, the blind spot,
//            missed picks, and the crowd card's PRIVACY NOTE
//
// So the home club was green in one bar and blue in the next, and the feature's
// best reassurance — "never your own pool" — read as an error state because it
// sat on the same red as a defeat.
//
// None of that was catchable by review, because no single file was wrong. It is
// only visible across files, which is what a guard test is for.
//
// ## ⚠ WHAT IT DOES NOT CLAIM
//
// It does not check that the right tone was chosen — `finding` on a figure that
// is not the finding still passes. It checks that the DECISION was made in the
// kit, where there is one of it, rather than in fifteen call sites.
//
// ⚠ COMMENTS ARE STRIPPED BEFORE SCANNING. Three guards in this repo have failed
// on their own documentation, and a ban on `theme.colors.green` cannot tell a
// rule from a note explaining the rule. A guard that punishes explanation just
// gets the explanation deleted.
// =============================================================

const SCOUTING = resolve(process.cwd(), 'mobile/components/scouting')
const KIT = join(SCOUTING, 'kit')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(full)) out.push(full)
  }
  return out
}

/** Source with block and line comments removed. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n')
}

const all = walk(SCOUTING)
const inKit = all.filter((f) => f.startsWith(KIT))
const outsideKit = all.filter((f) => !f.startsWith(KIT))

/** The four colours that carry a meaning the grammar assigns. */
const LOADED = /theme\.colors\.(green|red|accent|amber)\b/

describe('the scout kit is found at all', () => {
  // ⚠ ANTI-VACUITY. Every assertion below passes trivially against an empty
  // list, so a moved or renamed tree must fail HERE rather than quietly
  // reporting a clean sweep of nothing.
  it('finds both halves of the tree', () => {
    expect(inKit.length, 'no kit files — has components/scouting/kit moved?').toBeGreaterThan(8)
    expect(
      outsideKit.length,
      'no scouting files outside the kit — has the tree moved?',
    ).toBeGreaterThan(3)
  })

  it('the kit really is where the colours live', () => {
    // The positive half: if this stops matching, the grammar has been deleted
    // rather than obeyed, and the ban below would pass for the wrong reason.
    const tone = readFileSync(join(KIT, 'tone.ts'), 'utf8')
    expect(tone, 'kit/tone.ts no longer maps tones to theme colours').toMatch(LOADED)
  })
})

describe('no scouting file outside the kit picks its own colour', () => {
  it('none reaches for green, red, accent or amber', () => {
    const offenders = outsideKit.filter((f) => LOADED.test(code(readFileSync(f, 'utf8'))))
    expect(
      offenders.map((f) => f.replace(`${process.cwd()}/`, '')),
      'these files choose a colour the kit should have chosen — pass a ScoutTone instead',
    ).toEqual([])
  })
})

describe('no kit component is defined twice', () => {
  // ⚠ `Card` WAS DEFINED THREE TIMES, IDENTICALLY — in `MatchScoutSheet`,
  // `Dossier` and `ScoutingTab`, each a private `function Card()` with the same
  // surface, radius, shadow and header padding. `Segment` twice. The label/value
  // row twice with CONTRADICTORY argument order: `Line` rendered label → note →
  // value and `Row` rendered label → value → note, and `Row`'s own comment
  // argued the second was correct.
  const KIT_NAMES = [
    'ScoutCard',
    'ScoutRow',
    'SplitBar',
    'FormStrip',
    'ScoreChip',
    'VenueSplit',
    'Finding',
    'Caveat',
    'StatTiles',
    'Comparison',
    'ScoutFootnote',
    'ScoutHeader',
    'Crest',
    'Lean',
    'PeopleCard',
  ]

  it('each kit name is declared exactly once across all of scouting', () => {
    const dupes: string[] = []
    for (const name of KIT_NAMES) {
      const decl = new RegExp(`function\\s+${name}\\s*\\(`, 'g')
      const sites = all.filter((f) => decl.test(code(readFileSync(f, 'utf8'))))
      if (sites.length > 1) {
        dupes.push(`${name}: ${sites.map((f) => f.split('/').pop()).join(', ')}`)
      }
    }
    expect(dupes, 'a kit component has grown a second implementation').toEqual([])
  })

  it('⚠ the private Card / Line / Segment copies are gone for good', () => {
    // Named individually because these are the three that actually shipped
    // duplicated, and a generic rule would not say which one came back.
    // ⚠ OUTSIDE THE KIT ONLY. `SplitBar` legitimately has a private `Segment`;
    // the rule is that a primitive lives in ONE place, not that the name is
    // forbidden everywhere.
    const banned = /function\s+(Card|Line|Segment|Tally|Strip|Meeting|Drought|Tile|Blurb)\s*\(/
    const offenders = outsideKit.filter((f) => banned.test(code(readFileSync(f, 'utf8'))))
    expect(
      offenders.map((f) => f.replace(`${process.cwd()}/`, '')),
      'a private copy of a kit primitive is back — use the kit',
    ).toEqual([])
  })
})
