import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { palette as mobilePalette } from '@/mobile/theme/colors'
import { radii as mobileRadii } from '@/mobile/theme/radii'
import { spacing as mobileSpacing } from '@/mobile/theme/spacing'

import { palette, poolModeColor, poolModeGradient, radii, spacing, withOpacity } from '../tokens'

// Drift guard for the web design tokens.
//
// `lib/design/tokens.ts` and the token layer of `app/globals.css` are hand-written MIRRORS
// of mobile/theme rather than imports, because `mobile/**` is in .vercelignore and does not
// exist in the deployed bundle — a production import from web code would break the Vercel
// build while passing locally. This test can import it because test files never ship.
//
// If this fails, the RN palette moved and the web app did not follow. Update tokens.ts and
// globals.css; do not relax the assertion.

const globalsCss = readFileSync(new URL('../../../app/globals.css', import.meta.url), 'utf8')

describe('lib/design/tokens mirrors mobile/theme', () => {
  it('palette is a complete, exact mirror', () => {
    expect(palette).toEqual(mobilePalette)
  })

  it('covers every mobile colour token — a new RN token must be added here too', () => {
    expect(Object.keys(palette).sort()).toEqual(Object.keys(mobilePalette).sort())
  })

  it('radii mirror mobile/theme/radii', () => {
    expect(radii).toEqual(mobileRadii)
  })

  it('spacing mirrors mobile/theme/spacing', () => {
    expect(spacing).toEqual(mobileSpacing)
  })
})

describe('app/globals.css carries the same values', () => {
  // The anchors from the header comment in globals.css. These are the values every CTA,
  // badge and leaderboard row is built from, so they get asserted by name rather than by
  // "does this hex appear anywhere".
  it.each([
    ['--primary-600', 'primary'],
    ['--success-600', 'green'],
    ['--danger-600', 'red'],
    ['--accent-400', 'accent'],
  ] as const)('%s is palette.%s in both modes', (cssVar, token) => {
    expect(globalsCss).toContain(`${cssVar}: ${palette[token].light};`)
    expect(globalsCss).toContain(`${cssVar}: ${palette[token].dark};`)
  })

  it('--warning-500 is palette.amber in both modes', () => {
    // Amber anchors at 500 rather than 600 because Button's `warning` variant reads
    // bg-warning-500.
    expect(globalsCss).toContain(`--warning-500: ${palette.amber.light};`)
    expect(globalsCss).toContain(`--warning-500: ${palette.amber.dark};`)
  })

  it('the page sits on snow and text on ink, in both modes', () => {
    expect(globalsCss).toContain(`--background: ${palette.snow.light};`)
    expect(globalsCss).toContain(`--foreground: ${palette.ink.light};`)
    expect(globalsCss).toContain(`--background: ${palette.snow.dark};`)
    expect(globalsCss).toContain(`--foreground: ${palette.ink.dark};`)
  })

  it('surface and border tokens track the RN palette', () => {
    for (const [cssVar, token] of [
      ['--surface', 'surface'],
      ['--surface-secondary', 'snow'],
      ['--surface-tertiary', 'mist'],
      ['--border-default', 'silver'],
      ['--border-subtle', 'mist'],
    ] as const) {
      expect(globalsCss).toContain(`${cssVar}:`)
      expect(globalsCss).toContain(palette[token].light)
      expect(globalsCss).toContain(palette[token].dark)
    }
  })

  // The --sp-* block is meant to be an exhaustive mirror of the RN palette, so this is
  // asserted per-token rather than by spot-check: adding a token to
  // mobile/theme/colors.ts without adding it here fails the build.
  const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)

  it.each(Object.keys(palette) as (keyof typeof palette)[])(
    '--sp-%s is declared for both modes',
    (token) => {
      const cssVar = `--sp-${kebab(token)}`
      const declaration = new RegExp(`${cssVar}:\\s*(#[0-9A-Fa-f]{6});`, 'g')
      const declared = [...globalsCss.matchAll(declaration)].map((m) => m[1])

      expect(declared.length).toBeGreaterThan(0)

      // Compared as a set, so it holds for both shapes the file uses: a token with
      // distinct light/dark values declared in each block, and a mode-invariant one
      // declared once in :root (or restated in html.dark for local readability).
      expect(new Set(declared)).toEqual(new Set([palette[token].light, palette[token].dark]))
    },
  )

  it('carries the RN radii onto named shape tokens', () => {
    expect(globalsCss).toContain(`--radius-card:    ${radii.lg}px;`)
    expect(globalsCss).toContain(`--radius-control: ${radii.md}px;`)
    expect(globalsCss).toContain(`--radius-chip:    ${radii.sm}px;`)
    expect(globalsCss).toContain(`--radius-sheet:   ${radii.xl}px;`)
  })

  it('renders body text in Nunito, not the Arial the base layer used to pin', () => {
    expect(globalsCss).toContain('font-family: var(--font-nunito)')
    expect(globalsCss).not.toContain('font-family: Arial')
  })

  it('has no alternate palette left — theme-classic was retired', () => {
    expect(globalsCss).not.toContain('html.theme-classic')
  })

  it('declares slideInRight exactly once', () => {
    // It was previously declared twice with different transforms, and the second silently
    // won. Two declarations again would mean the duplicate crept back.
    const matches = globalsCss.match(/@keyframes slideInRight\b/g) ?? []
    expect(matches).toHaveLength(1)
  })
})

describe('helpers', () => {
  it('withOpacity matches the RN implementation', () => {
    expect(withOpacity('#3B6EFF', 0)).toBe('#3B6EFF00')
    expect(withOpacity('#3B6EFF', 1)).toBe('#3B6EFFff')
    expect(withOpacity('#3B6EFF', 0.12)).toBe('#3B6EFF1f')
  })

  it('clamps out-of-range opacity rather than emitting an invalid colour', () => {
    expect(withOpacity('#3B6EFF', -1)).toBe('#3B6EFF00')
    expect(withOpacity('#3B6EFF', 2)).toBe('#3B6EFFff')
  })

  it('pool mode gradients and flat colours cover the same three modes', () => {
    expect(Object.keys(poolModeGradient).sort()).toEqual(Object.keys(poolModeColor).sort())
  })

  it('the full_tournament stripe ends on the brand blue', () => {
    expect(poolModeGradient.full_tournament[1]).toBe(palette.primary.light)
  })
})
