// Email design tokens — the single source of colour, radius and type for every
// email SportPool sends.
//
// These values MIRROR `mobile/theme/` (colors.ts, radii.ts, typography.ts). They are
// deliberately duplicated rather than imported: `mobile/**` is listed in `.vercelignore`,
// so the directory does not exist in the deployed bundle and any production import from
// `lib/` would fail the Vercel build. `brand.test.ts` imports the mobile palette and
// asserts every value below still matches — test files never ship, so the guard is free.
//
// Each token names the `palette` key it came from. If you change one here, change it
// there (or the drift test fails, which is the point).

export type Mode = 'light' | 'dark'

type ModeValues = { light: string; dark: string }

/**
 * Colour tokens, light and dark. Mapped 1:1 onto `palette` in mobile/theme/colors.ts
 * except where noted.
 */
export const emailColors = {
  /** Page background behind the card. palette.snow */
  page: { light: '#F7F8FC', dark: '#121520' },
  /** The card itself. palette.surface */
  surface: { light: '#FFFFFF', dark: '#1C2030' },
  /** Headings. palette.ink */
  heading: { light: '#1B2340', dark: '#E8EAF0' },
  /**
   * Body copy. Not a raw palette entry — a navy-tinted step between ink and slate that
   * reads better than ink at 14px. Dark side is the matching step down from ink.dark.
   */
  body: { light: '#3D4560', dark: '#C3CADB' },
  /** Footer, labels, de-emphasised copy. palette.slate */
  muted: { light: '#7B87A8', dark: '#8B97B8' },
  /** Borders and dividers. palette.mist */
  hairline: { light: '#EEF1F8', dark: '#232840' },
  /** Neutral fill for non-semantic callouts. palette.mist / palette.silver-dark */
  neutralBg: { light: '#EEF1F8', dark: '#232840' },

  /**
   * Header band. palette.midnight is #0B0F1A on both sides; email uses a hair lighter
   * so the wordmark does not sit on pure near-black in a dark client.
   */
  header: { light: '#0E1220', dark: '#0E1220' },

  /** CTA, links, "Pool" in the wordmark. palette.primary */
  primary: { light: '#3B6EFF', dark: '#5B8AFF' },
  /** Info callout fill. palette.primaryLight */
  primaryBg: { light: '#F7F9FF', dark: '#1A2440' },

  /** Champion gold — accent rules, trophy flourishes. palette.accent (mode-invariant) */
  accent: { light: '#F5C518', dark: '#F5C518' },
  /** palette.accentLight */
  accentBg: { light: '#FFF8E1', dark: '#2A2210' },

  /** Success. palette.green / palette.greenLight */
  success: { light: '#22C55E', dark: '#34D972' },
  successBg: { light: '#ECFDF5', dark: '#0F2A1A' },
  /** Warning. palette.amber / palette.amberLight */
  warning: { light: '#F59E0B', dark: '#FBBF24' },
  warningBg: { light: '#FFFBEB', dark: '#2A2210' },
  /** Danger / urgency. palette.red / palette.redLight */
  danger: { light: '#EF4444', dark: '#F87171' },
  dangerBg: { light: '#FEF2F2', dark: '#2A1010' },
} satisfies Record<string, ModeValues>

export type ColorToken = keyof typeof emailColors

/** Resolve one token for a mode. */
export function color(token: ColorToken, mode: Mode = 'light'): string {
  return emailColors[token][mode]
}

/**
 * Semantic callout variants. The legacy templates encoded these as ad-hoc
 * bg/border/text hex triples; they collapse to one name here.
 */
export const CALLOUT_VARIANTS = ['success', 'warning', 'danger', 'info', 'neutral'] as const
export type CalloutVariant = (typeof CALLOUT_VARIANTS)[number]

export const calloutTokens: Record<
  CalloutVariant,
  { bg: ColorToken; fg: ColorToken; border: ColorToken }
> = {
  success: { bg: 'successBg', fg: 'success', border: 'success' },
  warning: { bg: 'warningBg', fg: 'warning', border: 'warning' },
  danger: { bg: 'dangerBg', fg: 'danger', border: 'danger' },
  info: { bg: 'primaryBg', fg: 'primary', border: 'primary' },
  neutral: { bg: 'neutralBg', fg: 'body', border: 'hairline' },
}

/**
 * Callout text needs more contrast than the bare semantic hue gives on a pale fill,
 * so the *copy* inside a callout uses these darker/lighter steps while the border and
 * any icon/figure use the hue itself.
 */
export const calloutText: Record<CalloutVariant, ModeValues> = {
  success: { light: '#137A42', dark: '#7CE8A6' },
  warning: { light: '#96601B', dark: '#FBD87A' },
  danger: { light: '#B01D1D', dark: '#FCA5A5' },
  info: { light: '#2C4FBF', dark: '#A9C1FF' },
  neutral: { light: emailColors.body.light, dark: emailColors.body.dark },
}

/** Corner radii, px. Mirrors mobile/theme/radii.ts — the RN app leans on md/lg for cards. */
export const emailRadii = {
  xs: 6,
  sm: 12,
  md: 18,
  lg: 24,
  pill: 999,
} as const

/**
 * Nunito with a system fallback. Gmail strips the @import so most recipients see the
 * fallback stack; the weights below are chosen to degrade sensibly when it does.
 * Mirrors mobile/theme/typography.ts fontFamilies.
 */
export const FONT_STACK =
  "'Nunito',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"

/** Weight scale matching mobile/theme/typography.ts (black/bold/semibold/medium/regular). */
export const weights = {
  black: 900,
  bold: 700,
  semibold: 600,
  medium: 500,
  regular: 400,
} as const

/** Type scale, adapted from mobile/theme/typography.ts for email's larger reading distance. */
export const type = {
  wordmark: { size: 26, lineHeight: 30, weight: weights.black },
  heading: { size: 20, lineHeight: 26, weight: weights.black },
  stat: { size: 28, lineHeight: 34, weight: weights.black },
  cardTitle: { size: 16, lineHeight: 22, weight: weights.bold },
  body: { size: 15, lineHeight: 24, weight: weights.regular },
  small: { size: 13, lineHeight: 20, weight: weights.regular },
  caption: { size: 11, lineHeight: 16, weight: weights.bold },
} as const

/** Spacing, px. Mirrors mobile/theme/spacing.ts. */
export const emailSpacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const

/**
 * Class names used as dark-mode hooks.
 *
 * Every colour-bearing element carries BOTH an inline light style (the universal
 * fallback — some clients drop <style> entirely) and one of these classes. Inline styles
 * beat stylesheet rules, so the dark block re-declares each class with `!important`.
 * An element styled only inline cannot be re-coloured in dark mode at all — which is
 * why body copy goes through the helpers in `components.ts` rather than raw hex.
 */
export const cls = {
  page: 'sp-page',
  card: 'sp-card',
  header: 'sp-header',
  heading: 'sp-heading',
  body: 'sp-body',
  muted: 'sp-muted',
  hairline: 'sp-hairline',
  cta: 'sp-cta',
  link: 'sp-link',
  wordmarkPool: 'sp-wm-pool',
  chip: 'sp-chip',
  quote: 'sp-quote',
  statValue: 'sp-stat-value',
  statLabel: 'sp-stat-label',
  /** Per-variant callout classes, e.g. sp-callout-success. */
  callout: (v: CalloutVariant) => `sp-callout-${v}`,
  calloutText: (v: CalloutVariant) => `sp-callout-text-${v}`,
} as const

/**
 * The <style> block for the shell: light declarations, then the same selectors
 * re-declared for dark.
 *
 * Dark is delivered three ways because no single hook covers the field:
 *  - `@media (prefers-color-scheme: dark)` — Apple Mail, iOS Mail, Outlook macOS/iOS.
 *  - `[data-ogsc]` / `[data-ogsb]` — Outlook.com injects these when it force-darkens.
 *  - Nothing at all for Gmail (web/Android/iOS) and Outlook for Windows: they ignore
 *    prefers-color-scheme and run their own partial invert over the inline light styles.
 *    That is not something we can hook, so light stays the source of truth there.
 */
export function darkModeStyles(): string {
  const dark = (t: ColorToken) => emailColors[t].dark
  const light = (t: ColorToken) => emailColors[t].light

  const calloutRules = (mode: Mode) =>
    CALLOUT_VARIANTS.map((v) => {
      const t = calloutTokens[v]
      return `.${cls.callout(v)}{background:${emailColors[t.bg][mode]}!important;border-color:${emailColors[t.border][mode]}!important;}
    .${cls.calloutText(v)}{color:${calloutText[v][mode]}!important;}`
    }).join('\n    ')

  const darkBlock = `
    .${cls.page}{background:${dark('page')}!important;}
    .${cls.card}{background:${dark('surface')}!important;border-color:${dark('hairline')}!important;}
    .${cls.heading}{color:${dark('heading')}!important;}
    .${cls.body}{color:${dark('body')}!important;}
    .${cls.muted}{color:${dark('muted')}!important;}
    .${cls.link}{color:${dark('muted')}!important;}
    .${cls.hairline}{border-color:${dark('hairline')}!important;}
    .${cls.cta}{background:${dark('primary')}!important;color:#0B0F1A!important;}
    .${cls.wordmarkPool}{color:${dark('primary')}!important;}
    .${cls.chip}{background:${dark('neutralBg')}!important;color:${dark('body')}!important;}
    .${cls.quote}{background:${dark('neutralBg')}!important;border-left-color:${dark('primary')}!important;}
    .${cls.statValue}{color:${dark('heading')}!important;}
    .${cls.statLabel}{color:${dark('muted')}!important;}
    ${calloutRules('dark')}`

  return `
    body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
    table{border-collapse:collapse;}
    img{border:0;line-height:100%;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
    a{text-decoration:none;}
    .${cls.page}{background:${light('page')};}
    .${cls.card}{background:${light('surface')};border-color:${light('hairline')};}
    .${cls.heading}{color:${light('heading')};}
    .${cls.body}{color:${light('body')};}
    .${cls.muted}{color:${light('muted')};}
    .${cls.link}{color:${light('muted')};}
    .${cls.cta}{background:${light('primary')};color:#FFFFFF;}
    ${calloutRules('light')}
    @media only screen and (max-width:600px){
      .sp-container{width:100%!important;border-radius:0!important;}
      .sp-pad{padding-left:24px!important;padding-right:24px!important;}
      .sp-stack{display:block!important;width:100%!important;}
    }
    @media (prefers-color-scheme:dark){${darkBlock}
    }
    [data-ogsc] .${cls.page}{background:${dark('page')}!important;}
    [data-ogsc] .${cls.card}{background:${dark('surface')}!important;border-color:${dark('hairline')}!important;}
    [data-ogsc] .${cls.heading}{color:${dark('heading')}!important;}
    [data-ogsc] .${cls.body}{color:${dark('body')}!important;}
    [data-ogsc] .${cls.muted}{color:${dark('muted')}!important;}
    [data-ogsc] .${cls.link}{color:${dark('muted')}!important;}
    [data-ogsc] .${cls.cta}{background:${dark('primary')}!important;color:#0B0F1A!important;}
    [data-ogsc] .${cls.wordmarkPool}{color:${dark('primary')}!important;}
    [data-ogsc] .${cls.chip}{background:${dark('neutralBg')}!important;color:${dark('body')}!important;}
    [data-ogsc] .${cls.quote}{background:${dark('neutralBg')}!important;border-left-color:${dark('primary')}!important;}
    [data-ogsc] .${cls.statValue}{color:${dark('heading')}!important;}
    [data-ogsc] .${cls.statLabel}{color:${dark('muted')}!important;}
    ${CALLOUT_VARIANTS.map((v) => {
      const t = calloutTokens[v]
      return `[data-ogsc] .${cls.callout(v)}{background:${emailColors[t.bg].dark}!important;border-color:${emailColors[t.border].dark}!important;}
    [data-ogsc] .${cls.calloutText(v)}{color:${calloutText[v].dark}!important;}`
    }).join('\n    ')}`
}
