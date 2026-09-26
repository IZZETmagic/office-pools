/**
 * Byte parity between the THREE avatar compositors' two executable halves.
 *
 *     node scripts/verify-avatar-parity.mjs
 *
 * ⭐⭐⭐ WHY THIS EXISTS. `lib/avatar/compose.ts` and `assets/character-base/nano/compose.py`
 * are the same algorithm written twice, and `builder-template.html` is a third copy. Nothing
 * in the type system, the linter or the test suite compares the first two — the guard suite
 * greps the Python and the HTML for a few constants, which catches a renamed token and misses
 * everything else. This composes the same configs through both and diffs the BYTES.
 *
 * ⚠ IT HAD LIVED IN /tmp. For months the only copy of the check protecting three parallel
 * implementations was a scratch file, which meant it ran when someone remembered and was one
 * `rm -rf /tmp` from gone. Moved into the repo 2026-09-26, when `facialHairColour` became the
 * first new colour input since, and needed protecting on the day it was written.
 *
 * ⚠ A config the matrix does not cover is a config with NO parity guarantee. The two halves
 * only have to agree where they are compared, so every new input belongs here in BOTH states —
 * unset and set — on the day it lands. An optional field is the dangerous case: leave it out
 * and the suite goes on passing while proving nothing about it.
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = process.cwd()
const NANO = 'assets/character-base/nano'
const A = JSON.parse(readFileSync('public/avatar-assets.json', 'utf8'))
const { composeAvatar } = await import(join(ROOT, 'lib/avatar/compose.ts'))

const out = mkdtempSync(join(tmpdir(), 'avatar-parity-'))
const BG = ['#FFFFFF', '#1D4ED8', '#0E7490', '#581C87', '#BE123C', '#D97706', '#1F2937']
const NECK = ['085', '100', '125', '140']

const BASE = {
  shirt: '#1e76d6', skin: '#FFE0C4', hairColour: '#7A6A5C',
  eyes: null, mouth: null, expression: 'laughing',
  eyeColour: '#5B3A29', mouthColour: '#B3554E',
  facialHair: null, glasses: null, garment: null,
}

/** Every case: a label, the extra config, and the extra argv it must produce. */
const CASES = [
  { label: 'plain', cfg: {}, args: [] },
  // ⭐ The facial-hair colour in BOTH states, because they are different code paths, not one
  // path with a different value: unset applies BEARD_LIFT and set is verbatim. A matrix that
  // only covered `unset` would prove nothing about the feature.
  {
    label: 'beard, colour unset (lifted)',
    cfg: { facialHair: 'fullbeard' },
    args: ['--facial-hair', `${NANO}/facialhair/assets/fullbeard.asset.svg`],
  },
  {
    label: 'beard, colour set (verbatim)',
    cfg: { facialHair: 'fullbeard', facialHairColour: '#8E8E93' },
    args: ['--facial-hair', `${NANO}/facialhair/assets/fullbeard.asset.svg`,
           '--facial-hair-colour', '#8E8E93'],
  },
  // ⚠ Stubble is derived differently again — a shadow floored against the SKIN — so it is the
  // case most likely to drift, and the one where an off-by-one in either half is invisible.
  {
    label: 'stubble, colour set',
    cfg: { facialHair: 'stubble', facialHairColour: '#B33A3A' },
    args: ['--facial-hair', `${NANO}/facialhair/assets/stubble.asset.svg`,
           '--facial-hair-colour', '#B33A3A'],
  },
]

let n = 0
const bad = []

for (const neck of NECK) {
  for (const g of BG) {
    for (const hair of [null, 'f09-midwavy']) {
      for (const c of CASES) {
        const cfg = { ...BASE, ...c.cfg, base: `base-neck-${neck}`, hair, background: g }
        const dst = join(out, `${neck}-${g.slice(1)}-${hair ? 'h' : 'b'}-${n}.svg`)
        const args = [
          `${NANO}/bases/base-neck-${neck}.svg`, dst,
          '--expression', `${NANO}/expressions/assets/laughing.asset.svg`,
          '--shirt', BASE.shirt, '--skin', BASE.skin, '--hair-colour', BASE.hairColour,
          '--eye-colour', BASE.eyeColour, '--mouth-colour', BASE.mouthColour, '--bg', g,
          ...c.args,
        ]
        if (hair) args.push('--hair', `${NANO}/hair/assets/hair-${hair}.asset.svg`)
        execFileSync('uv', ['run', `${NANO}/compose.py`, ...args])
        const py = readFileSync(dst, 'utf8')
        const ts = composeAvatar(cfg, A)
        n += 1
        if (py !== ts) {
          bad.push(`${c.label}  neck ${neck}  bg ${g}  ${hair ?? 'bald'}`)
          if (bad.length === 1) {
            writeFileSync(join(out, 'mismatch-py.svg'), py)
            writeFileSync(join(out, 'mismatch-ts.svg'), ts)
          }
        }
      }
    }
  }
}

for (const b of bad) console.log(`MISMATCH  ${b}`)
if (bad.length) console.log(`\nfirst mismatch written to ${out}/mismatch-{py,ts}.svg`)
console.log(`${n - bad.length}/${n} byte-identical`)
process.exit(bad.length ? 1 : 0)
