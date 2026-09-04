import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// =============================================================
// The Showdown duel band is dark in BOTH app themes
// =============================================================
// Ryan's call, 2026-09-03: the band is built out of additive light — two
// coloured throws from the edges and a ring on each avatar in that member's own
// colour — and additive light needs somewhere dark to land. In light mode the
// same values read as smudges, so the band resolves the DARK palette whatever
// the device is set to.
//
// ## Why this needs a guard rather than a comment
//
// The failure is SILENT and it already happened once. Every colour written out
// explicitly moved to `BAND` in one pass, and the pool name and both usernames
// still disappeared in light mode — because they carried no colour at all and
// were taking `Text`'s default, which resolves `ink` through `useTheme()`. There
// is no error, no warning and no missing prop: just near-black text on a
// near-black band, visible only to somebody who switches themes and looks.
//
// So the rule is structural: nothing inside that file may reach the device
// theme for a COLOUR. `BandText` defaults to the band's ink, and this fails if
// anything goes round it.
//
// ⚠ Spacing, radii and typography are theme-independent and stay on
// `useTheme()`. This is about colour only.
//
// ⚠ COMMENTS ARE STRIPPED BEFORE SCANNING. Three guards in this repo have failed
// on their own documentation — a ban on `theme.colors.` cannot tell a rule from
// a note explaining the rule. A guard that punishes explanation just gets the
// explanation deleted.
// =============================================================

const HEADER = 'mobile/components/pool-detail/ShowdownDuelHeader.tsx'
const source = readFileSync(resolve(process.cwd(), HEADER), 'utf8')

/** Source with block and line comments removed. */
const code = source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n')

describe('the duel band never reaches the device theme for a colour', () => {
  it('the file was found and still looks like the band', () => {
    expect(code, `${HEADER} no longer defines BAND — was it renamed?`).toMatch(
      /const BAND = resolveColors\('dark'\)/,
    )
  })

  it('no colour comes from useTheme()', () => {
    // `theme.spacing` / `theme.radii` are fine and deliberately not matched.
    expect(code, 'a colour is being resolved from the device theme').not.toMatch(
      /theme\.colors\./,
    )
  })

  it('every Text is a BandText', () => {
    // ⚠ The bug that started this. A bare `<Text>` with no colour prop inherits
    // `ink` from the DEVICE theme and turns invisible on the band in light mode.
    const bare = [...code.matchAll(/<Text[\s>]/g)]
    expect(
      bare.length,
      'found a bare <Text> — use <BandText>, which defaults to the band palette',
    ).toBe(1) // the one inside BandText's own definition
    expect(code).toMatch(/function BandText\(/)
    expect(code, 'BandText must default the colour, or it guarantees nothing').toMatch(
      /color: BAND\.ink/,
    )
  })

  it('no Text carries a theme colour TOKEN', () => {
    // `color="slate"` looks explicit and is not — `Text` resolves the token
    // through `useTheme()` exactly like the default does.
    expect(code, 'a color token resolves through the device theme; use style + BAND').not.toMatch(
      /<BandText[^>]*\scolor="/,
    )
  })

  it('icons are tinted, not tokened', () => {
    // Same trap one component over: `Icon`'s `color` is a token resolved from
    // `useTheme()`; `tint` takes a raw value.
    expect(code, "Icon color= resolves through the device theme; use tint=").not.toMatch(
      /<Icon[^>]*\scolor="/,
    )
  })
})
