// =============================================================
// The phone READS a level, it does not derive one
// =============================================================
// `mobile/lib/levels.ts` held a private points → level table and
// `PoolListItem` called it as `getLevel(pool.totalPoints)`. That was wrong
// three times over, and none of the three failed loudly:
//
//  1. WRONG INPUT. It read `scored_total_points`. The product's level is XP —
//     `entry_xp_state.current_level` — which counts badges and streaks, not
//     points. The two numbers are unrelated.
//  2. WRONG NAMES. Its table said Level 2 = "Beginner", Level 5 =
//     "Competitor". The real table (`lib/levelNames.ts`) says "Matchday Fan"
//     and "Stadium Regular". The same member read a different level AND a
//     different name depending on which device they opened.
//  3. WRONG ON LEAGUES. It ran for every pool. XP is World Cup machinery end
//     to end, so the web card shows the matchweek there and no level at all —
//     the phone invented one for a Premier League pool.
//
// The level now arrives from `/api/users/:id/home-scoring`, read out of
// `entry_xp_state`. This guard is a source scan: it asserts the phone has no
// second definition of the mapping to drift from the real one.
// =============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve, join } from 'path'
import { LEVEL_NAMES } from '../levelNames'

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try { entries = readdirSync(dir) } catch { return out }
  for (const name of entries) {
    if (name === 'node_modules' || name === '__tests__') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

const root = process.cwd()
const mobileFiles = [
  ...walk(resolve(root, 'mobile/app')),
  ...walk(resolve(root, 'mobile/lib')),
  ...walk(resolve(root, 'mobile/components')),
]

/** Strip comments — this rule is discussed in prose in several of these files. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '')
}

describe('mobile reads its level rather than deriving one', () => {
  it('scans a mobile tree that actually exists', () => {
    // Without this, a moved directory turns every assertion below into a
    // vacuous pass over an empty file list.
    expect(mobileFiles.length, 'no mobile sources found — has the tree moved?')
      .toBeGreaterThan(20)
  })

  it('no level-name table lives on the phone', () => {
    // The names are the tell. A local threshold table has to spell at least a
    // couple of them out, and any file that does is a second source of truth.
    const names = Object.values(LEVEL_NAMES)
    const offenders: string[] = []
    for (const f of mobileFiles) {
      const src = code(readFileSync(f, 'utf8'))
      const hits = names.filter((n) => src.includes(`'${n}'`) || src.includes(`"${n}"`))
      if (hits.length >= 2) {
        offenders.push(`${f.replace(root + '/', '')} — ${hits.join(', ')}`)
      }
    }
    expect(
      offenders,
      'A level table on the phone will drift from lib/levelNames.ts. Read ' +
      '`current_level` + `level_name` from /api/users/:id/home-scoring instead:\n' +
      offenders.join('\n'),
    ).toEqual([])
  })

  it('no level is derived from a points total', () => {
    const offenders: string[] = []
    for (const f of mobileFiles) {
      const src = code(readFileSync(f, 'utf8'))
      for (const m of src.matchAll(/getLevel\s*\(|[lL]evel\w*\s*\(\s*\w*[Pp]oints/g)) {
        offenders.push(`${f.replace(root + '/', '')} — ${m[0]}`)
      }
    }
    expect(
      offenders,
      'Points are not XP. Deriving a level from a points total is the exact bug ' +
      'this closed — the level is read, not computed:\n' + offenders.join('\n'),
    ).toEqual([])
  })
})
