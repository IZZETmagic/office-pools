// =============================================================
// A league pool's depth is read one way round, everywhere
// =============================================================
// `pools.league_depth` is `'results'`, `'scores'`, or **NULL** — and NULL is the
// case that keeps biting. A pool created before migration 077 carries NULL, and
// the engine reads NULL as **Scores**, deliberately and byte for byte (066).
//
// So the only safe way to derive the pair is:
//
//     const results = depth === 'results'      ✅ NULL → Scores, agrees with 066
//     const scores  = depth === 'scores'       ❌ NULL → Results, disagrees
//
// The wrong polarity has shipped three times on web — `lib/leagueModeInfo.ts`,
// `LeagueHowToPlayTab.tsx` and `LeagueScoringRulesTab.tsx` — and the 2026-08-28
// audit called it a **deploy blocker** for one reason: it does not fail. Members
// are TOLD they are playing one game and SCORED at the other, with no error
// anywhere. Two production pools carry NULL depth right now.
//
// ⚠ THIS COVERS `mobile/` TOO, and that is the point of writing it today. The
// first RN league screen has just landed, and a new surface deriving the pair
// afresh is exactly how this reached three files on web.
//
// ## What it does NOT claim
//
// It is a source scan. It cannot tell you the copy is right, only that nothing
// derives the pair from the losing side of the comparison. A file that reads
// `depth !== 'results'` to mean Scores is correct and passes; one that reads
// `depth === 'scores'` to mean Scores is wrong for NULL and fails.
// =============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve, join } from 'path'

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try { entries = readdirSync(dir) } catch { return out }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.next' || name === '__tests__') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

const root = process.cwd()
const files = [
  ...walk(resolve(root, 'app')),
  ...walk(resolve(root, 'lib')),
  ...walk(resolve(root, 'components')),
  ...walk(resolve(root, 'mobile/app')),
  ...walk(resolve(root, 'mobile/lib')),
  ...walk(resolve(root, 'mobile/components')),
]

/** Strip comments — this file, and the migrations, discuss the wrong form. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '')
}

describe('league depth is derived from the winning side of the comparison', () => {
  it('finds depth comparisons at all — a rename must fail here, not pass silently', () => {
    const n = files.reduce(
      (acc, f) => acc + (/league_depth|\bdepth\b\s*===/.test(code(readFileSync(f, 'utf8'))) ? 1 : 0),
      0,
    )
    expect(n, 'no depth comparisons found — has the column been renamed?').toBeGreaterThan(0)
  })

  it("nothing derives Scores from `=== 'scores'` — NULL would read as Results", () => {
    // ⚠ ONE NAMED EXEMPTION, and it is not the same thing. The create route
    // normalises an incoming REQUEST — `league_depth === 'scores' ? 'scores' :
    // 'results'` — where the fallback is explicit and Results is Decision 9's
    // pre-selected recommendation. It never reads a STORED depth, so NULL never
    // reaches it. Named rather than pattern-matched: an exemption you can read
    // is worth more than a heuristic that might quietly cover a real one.
    const EXEMPT = ['app/api/pools/create/route.ts']

    const offenders: string[] = []
    for (const f of files) {
      if (EXEMPT.some((e) => f.endsWith(e))) continue
      const src = code(readFileSync(f, 'utf8'))
      // `x === 'scores'` assigned or returned is the losing form. Comparing the
      // other way (`!== 'results'`) is fine and common.
      for (const m of src.matchAll(/(\w+)\s*===\s*['"]scores['"]/g)) {
        offenders.push(`${f.replace(root + '/', '')} — ${m[0]}`)
      }
    }
    expect(
      offenders,
      'Derive the pair as `depth === \'results\'`. NULL means Scores (migration 066), so ' +
      '`=== \'scores\'` makes a NULL-depth pool describe itself as the wrong game:\n' +
      offenders.join('\n'),
    ).toEqual([])
  })
})
