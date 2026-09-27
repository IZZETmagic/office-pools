import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

// =============================================================
// The React Native copies of the avatar compositor have not drifted
// =============================================================
// ⚠⚠ THIS IS THE ONLY THING MAKING THE COPY SAFE. `mobile/lib/avatar/compose.ts` and
// `storedConfig.ts` are verbatim copies of the web files, and they exist because React Native
// cannot import from the repo root (no metro.config.js; `@/*` maps to `mobile/`) while the avatar
// EDITOR has to preview on every tap — /api/avatar/me measured 284–476ms warm, against 0.8ms to
// compose locally.
//
// ⭐ A COPY HELD IDENTICAL BY A TEST IS NOT A SECOND IMPLEMENTATION. `compose.py` and
// `builder-template.html` are genuine re-implementations in other languages, which is why
// `scripts/verify-avatar-parity.mjs` has to exercise 420 configurations against them to prove they
// AGREE. These two need no behavioural proof at all: they are the same source, and this asserts
// exactly that. Same pattern as `competitionMirror.guard.test.ts` uses for `oklch.ts`.
//
// ⚠ Compared FROM THE FIRST EXPORT so each mobile copy can carry its own banner explaining why it
// exists. Whitespace is normalised, because a formatter run on one side is not drift.
// =============================================================

const MIRRORS = [
  {
    web: 'lib/avatar/compose.ts',
    rn: 'mobile/lib/avatar/compose.ts',
    marker: 'export type AvatarAssets',
  },
  {
    web: 'lib/avatar/storedConfig.ts',
    rn: 'mobile/lib/avatar/storedConfig.ts',
    marker: 'export type StoredAvatarBuild',
  },
  {
    // ⭐ The three glyphs DERIVED from the avatar art. They are copied rather than re-derived on
    // the phone so there is one `scripts/derive-step-icons.py` and one answer — the script's
    // --check already pins the web copy to the assets, and this pins the phone to the web copy.
    web: 'components/avatar/stepIcons.ts',
    rn: 'mobile/lib/avatar/stepIcons.ts',
    marker: 'type IconSvgObject',
  },
]

function bodyFrom(path: string, marker: string): string {
  const src = readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')
  const i = src.indexOf(marker)
  if (i === -1) {
    throw new Error(
      `${path}: could not find the marker "${marker}". If the first export was renamed, this ` +
        'guard silently compares nothing — update the marker rather than deleting the case.',
    )
  }
  return src.slice(i).replace(/\s+/g, ' ').trim()
}

describe('the RN avatar compositor mirrors the web one', () => {
  for (const { web, rn, marker } of MIRRORS) {
    it(`${rn} is identical to ${web} below "${marker}"`, () => {
      expect(
        bodyFrom(rn, marker),
        `${rn} has diverged from ${web}. Edit the WEB file and re-copy — a change made only on ` +
          'the phone means the editor draws a different avatar from the card beside it.',
      ).toBe(bodyFrom(web, marker))
    })
  }

  it('the guard actually compares most of each file', () => {
    // ⚠⚠ THE POINT IS COVERAGE, NOT POSITION. A marker that drifted towards the END would leave
    // this suite green while comparing almost nothing — the failure mode worth pinning.
    //
    // ⚠ The first version of this asserted the marker sat in the first TENTH, and that was the
    // wrong measure: `storedConfig.ts` is a short file with a long header, so its marker is
    // legitimately 33% in while still leaving two thirds of the file compared. A fraction of the
    // file's LENGTH punishes small files for being well documented. What matters is how much
    // lands in the comparison.
    for (const { web, marker } of MIRRORS) {
      const src = readFileSync(new URL(`../../../${web}`, import.meta.url), 'utf8')
      const covered = (src.length - src.indexOf(marker)) / src.length
      expect(covered, `${web}: the guard would only compare ${(covered * 100).toFixed(0)}% of it`)
        .toBeGreaterThan(0.5)
    }
  })
})
