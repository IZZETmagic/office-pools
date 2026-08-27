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
