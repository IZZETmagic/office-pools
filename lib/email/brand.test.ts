import { describe, expect, it } from 'vitest'

import { palette } from '@/mobile/theme/colors'
import { radii } from '@/mobile/theme/radii'
import { spacing } from '@/mobile/theme/spacing'
import { fontFamilies } from '@/mobile/theme/typography'

import {
  CALLOUT_VARIANTS,
  calloutTokens,
  darkModeStyles,
  emailColors,
  emailRadii,
  emailSpacing,
  FONT_STACK,
  cls,
} from './brand'
import { brandedTemplate, supportTemplate } from './templates'

// Drift guard for lib/email/brand.ts.
//
// The email tokens are a hand-written MIRROR of mobile/theme rather than an import,
// because `mobile/**` is in .vercelignore and does not exist in the deployed bundle —
// a production import from lib/ would break the Vercel build. This test can import it
// because test files never ship.
//
// If this fails, the RN palette moved and email did not follow. Update brand.ts, do not
// relax the assertion.

describe('email tokens mirror mobile/theme', () => {
  it.each([
    ['page', 'snow'],
    ['surface', 'surface'],
    ['heading', 'ink'],
    ['muted', 'slate'],
    ['hairline', 'mist'],
    ['primary', 'primary'],
    ['primaryBg', 'primaryLight'],
    ['accent', 'accent'],
    ['accentBg', 'accentLight'],
    ['success', 'green'],
    ['successBg', 'greenLight'],
    ['warning', 'amber'],
    ['warningBg', 'amberLight'],
    ['danger', 'red'],
    ['dangerBg', 'redLight'],
  ] as const)('%s matches palette.%s in both modes', (emailToken, paletteToken) => {
    expect(emailColors[emailToken].light).toBe(palette[paletteToken].light)
    expect(emailColors[emailToken].dark).toBe(palette[paletteToken].dark)
  })

  it('neutralBg tracks mist, which the RN app uses for the same job', () => {
    expect(emailColors.neutralBg.light).toBe(palette.mist.light)
    expect(emailColors.neutralBg.dark).toBe(palette.mist.dark)
  })

  it('radii mirror mobile/theme/radii', () => {
    expect(emailRadii.xs).toBe(radii.xs)
    expect(emailRadii.sm).toBe(radii.sm)
    expect(emailRadii.md).toBe(radii.md)
    expect(emailRadii.lg).toBe(radii.lg)
    expect(emailRadii.pill).toBe(radii.pill)
  })

  it('spacing mirrors mobile/theme/spacing', () => {
    for (const key of ['xxs', 'xs', 'sm', 'md', 'lg', 'xl', 'xxl'] as const) {
      expect(emailSpacing[key]).toBe(spacing[key])
    }
  })

  it('uses the same typeface family as the RN app', () => {
    // RN loads Nunito_900Black etc.; email can only name the family.
    expect(fontFamilies.black.startsWith('Nunito')).toBe(true)
    expect(FONT_STACK.startsWith("'Nunito'")).toBe(true)
  })

  // The body-copy tokens are deliberately NOT raw palette entries — they are a
  // navy-tinted step between ink and slate. Pinned so a careless edit is visible.
  it('body copy sits between ink and slate, not on either', () => {
    expect(emailColors.body.light).toBe('#3D4560')
    expect(emailColors.body.dark).toBe('#C3CADB')
    expect(emailColors.body.light).not.toBe(palette.ink.light)
    expect(emailColors.body.light).not.toBe(palette.slate.light)
  })
})

describe('footer modes', () => {
  const args = { preheader: 'p', heading: 'h', body: '<p>b</p>' }

  it('subscription mail carries an unsubscribe link', () => {
    expect(brandedTemplate(args)).toContain('Unsubscribe')
  })

  it('support replies carry a reply prompt and NO unsubscribe', () => {
    // A human reply is not a subscription. This was previously enforced by a regex
    // over the rendered HTML, which would silently no-op if the footer markup moved.
    const html = supportTemplate(args)
    expect(html).not.toContain('Unsubscribe')
    expect(html).not.toContain('Notification Settings')
    expect(html).toContain('Just reply to this email')
  })

  it('internal ops mail has no subscription footer at all', () => {
    const html = brandedTemplate({ ...args, footer: 'none' })
    expect(html).not.toContain('Unsubscribe')
    expect(html).not.toContain('Notification Settings')
  })

  it('broadcasts can substitute the Resend unsubscribe merge tag', () => {
    const html = brandedTemplate({ ...args, unsubscribeUrl: '{{{RESEND_UNSUBSCRIBE_URL}}}' })
    expect(html).toContain('href="{{{RESEND_UNSUBSCRIBE_URL}}}"')
  })
})

describe('dark mode stylesheet', () => {
  const css = darkModeStyles()

  it('ships all three dark delivery mechanisms', () => {
    expect(css).toContain('@media (prefers-color-scheme:dark)')
    expect(css).toContain('[data-ogsc]')
    expect(css).toContain('@media only screen and (max-width:600px)')
  })

  it('declares every callout variant in both modes', () => {
    for (const v of CALLOUT_VARIANTS) {
      const light = emailColors[calloutTokens[v].bg].light
      const dark = emailColors[calloutTokens[v].bg].dark
      expect(css).toContain(`.${cls.callout(v)}{background:${light}`)
      expect(css).toContain(`.${cls.callout(v)}{background:${dark}!important`)
    }
  })

  it('overrides dark rules with !important so they beat the inline light styles', () => {
    // Inline styles outrank stylesheet rules; without !important the dark block is inert.
    const darkBlock = css.slice(css.indexOf('@media (prefers-color-scheme:dark)'))
    const declarations = darkBlock.match(/\{[^{}]*\}/g) ?? []
    expect(declarations.length).toBeGreaterThan(0)
    for (const d of declarations) {
      if (d.trim() === '{}') continue
      expect(d).toContain('!important')
    }
  })
})
