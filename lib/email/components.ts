// Email body components.
//
// Every helper emits an inline style carrying the LIGHT value plus a class from
// `cls` (see brand.ts). The inline style is the universal fallback; the class is what
// the shell's dark block overrides with `!important`. An element styled only inline
// cannot be re-coloured in dark mode — so body copy always goes through here rather
// than through a raw hex.
//
// Everything returns table/div HTML that survives Outlook's Word rendering engine:
// no flexbox, no grid, no shorthand background, no negative margins.

import {
  cls,
  color,
  emailColors,
  emailRadii,
  calloutText,
  calloutTokens,
  type CalloutVariant,
  FONT_STACK,
  type,
  weights,
} from './brand'

const FONT = `font-family:${FONT_STACK};`

/** A body paragraph. The workhorse — replaces every `<p style="color:#525252...">`. */
export function paragraph(html: string, opts?: { marginBottom?: number }): string {
  const mb = opts?.marginBottom ?? 12
  return `<p class="${cls.body}" style="${FONT}color:${color('body')};font-size:${type.body.size}px;line-height:${type.body.lineHeight}px;font-weight:${weights.regular};margin:0 0 ${mb}px;">${html}</p>`
}

/** A slightly larger opening line, for emails that want one. */
export function lead(html: string, opts?: { marginBottom?: number }): string {
  const mb = opts?.marginBottom ?? 16
  return `<p class="${cls.body}" style="${FONT}color:${color('body')};font-size:${type.cardTitle.size}px;line-height:${type.cardTitle.lineHeight}px;font-weight:${weights.semibold};margin:0 0 ${mb}px;">${html}</p>`
}

/** "Hi Ryan," — the standard greeting. */
export function greeting(name: string): string {
  return paragraph(`Hi ${name},`)
}

/** An unordered list of body-copy items. */
export function bulletList(items: string[], opts?: { marginBottom?: number }): string {
  if (items.length === 0) return ''
  const mb = opts?.marginBottom ?? 12
  const lis = items
    .map(
      (i) =>
        `<li style="margin:0 0 6px;padding:0;">${i}</li>`
    )
    .join('')
  return `<ul class="${cls.body}" style="${FONT}color:${color('body')};font-size:${type.body.size}px;line-height:${type.body.lineHeight}px;margin:0 0 ${mb}px;padding-left:22px;">${lis}</ul>`
}

/**
 * A semantic callout box. `variant` carries the meaning the legacy hex triples used to:
 * success (was green #f0fdf4/#166534), warning (amber #fef3c7/#92400e),
 * danger (red #fef2f2/#991b1b), info (blue #eff6ff/#1e40af), neutral (grey #f5f5f5).
 */
export function callout(
  variant: CalloutVariant,
  innerHtml: string,
  opts?: { align?: 'left' | 'center'; marginBottom?: number }
): string {
  const t = calloutTokens[variant]
  const align = opts?.align ?? 'left'
  const mb = opts?.marginBottom ?? 16
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 ${mb}px;">
      <tr><td class="${cls.callout(variant)}" style="background:${emailColors[t.bg].light};border:1px solid ${emailColors[t.border].light};border-radius:${emailRadii.sm}px;padding:16px 18px;text-align:${align};">${innerHtml}</td></tr>
    </table>`
}

/** Copy inside a callout — higher contrast than the bare semantic hue. */
export function calloutLine(
  variant: CalloutVariant,
  html: string,
  opts?: { bold?: boolean; size?: number; marginBottom?: number }
): string {
  const weight = opts?.bold ? weights.bold : weights.regular
  const size = opts?.size ?? type.body.size
  const mb = opts?.marginBottom ?? 0
  return `<p class="${cls.calloutText(variant)}" style="${FONT}color:${calloutText[variant].light};font-size:${size}px;line-height:${Math.round(size * 1.5)}px;font-weight:${weight};margin:0 0 ${mb}px;">${html}</p>`
}

/** A bulleted list inside a callout, in that callout's text colour. */
export function calloutList(variant: CalloutVariant, items: string[]): string {
  if (items.length === 0) return ''
  const lis = items.map((i) => `<li style="margin:0 0 4px;padding:0;">${i}</li>`).join('')
  return `<ul class="${cls.calloutText(variant)}" style="${FONT}color:${calloutText[variant].light};font-size:${type.small.size}px;line-height:${type.small.lineHeight}px;margin:0;padding-left:20px;">${lis}</ul>`
}

/**
 * The big centred figure — a rank, a countdown, a points total. `label` sits above it,
 * `sub` below.
 */
export function statBlock(params: {
  label: string
  value: string
  sub?: string
  variant?: CalloutVariant
}): string {
  const { label, value, sub, variant = 'info' } = params
  const t = calloutTokens[variant]
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
      <tr><td class="${cls.callout(variant)}" style="background:${emailColors[t.bg].light};border:1px solid ${emailColors[t.border].light};border-radius:${emailRadii.sm}px;padding:20px 18px;text-align:center;">
        <p class="${cls.calloutText(variant)}" style="${FONT}color:${calloutText[variant].light};font-size:${type.caption.size}px;line-height:${type.caption.lineHeight}px;font-weight:${weights.bold};letter-spacing:1.2px;text-transform:uppercase;margin:0 0 6px;">${label}</p>
        <p class="${cls.calloutText(variant)}" style="${FONT}color:${calloutText[variant].light};font-size:${type.stat.size}px;line-height:${type.stat.lineHeight}px;font-weight:${weights.black};margin:0;">${value}</p>
        ${sub ? `<p class="${cls.calloutText(variant)}" style="${FONT}color:${calloutText[variant].light};font-size:${type.small.size}px;line-height:${type.small.lineHeight}px;margin:6px 0 0;">${sub}</p>` : ''}
      </td></tr>
    </table>`
}

/** A monospace-ish inline chip, used for pool codes inside a sentence. */
export function codeChip(text: string): string {
  return `<span class="${cls.chip}" style="${FONT}background:${color('neutralBg')};color:${color('body')};font-weight:${weights.bold};font-size:13px;padding:3px 8px;border-radius:${emailRadii.xs}px;letter-spacing:0.5px;">${text}</span>`
}

/**
 * Label/value rows — points adjustments, per-pool deadline summaries.
 *
 * `valueVariant` tints the value semantically (urgency, gain/loss). It must be a variant
 * rather than a hex: a raw colour has no dark counterpart, so in dark mode it would fall
 * back to plain body copy and the signal would silently disappear.
 */
export function dataRows(
  rows: {
    label: string
    value: string
    emphasis?: boolean
    valueVariant?: CalloutVariant
  }[]
): string {
  const body = rows
    .map((r) => {
      const valueClass = r.valueVariant ? cls.calloutText(r.valueVariant) : cls.heading
      const valueColor = r.valueVariant ? calloutText[r.valueVariant].light : color('heading')
      return `<tr>
        <td class="${cls.muted}" style="${FONT}color:${color('muted')};font-size:${type.small.size}px;padding:5px 0;text-align:left;">${r.label}</td>
        <td class="${valueClass}" style="${FONT}color:${valueColor};font-size:${type.small.size}px;font-weight:${r.emphasis ? weights.black : weights.bold};padding:5px 0;text-align:right;">${r.value}</td>
      </tr>`
    })
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;">${body}</table>`
}

/** A neutral panel — grouping without a semantic colour. */
export function panel(innerHtml: string, opts?: { marginBottom?: number }): string {
  const mb = opts?.marginBottom ?? 16
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 ${mb}px;">
      <tr><td class="${cls.callout('neutral')}" style="background:${color('neutralBg')};border:1px solid ${color('hairline')};border-radius:${emailRadii.sm}px;padding:16px 18px;">${innerHtml}</td></tr>
    </table>`
}

/** A quoted excerpt with a primary-coloured left rule — the banter mention. */
export function quoteBlock(text: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
      <tr><td class="${cls.quote}" style="background:${color('neutralBg')};border-left:3px solid ${color('primary')};border-radius:0 ${emailRadii.sm}px ${emailRadii.sm}px 0;padding:14px 18px;">
        <p class="${cls.body}" style="${FONT}color:${color('body')};font-size:${type.body.size}px;line-height:${type.body.lineHeight}px;margin:0;">${text}</p>
      </td></tr>
    </table>`
}

/** A secondary CTA used inside a list item, smaller than the shell's primary button. */
export function secondaryButton(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px auto 0;">
      <tr><td class="${cls.cta}" style="background:${color('primary')};border-radius:${emailRadii.sm}px;">
        <a href="${url}" class="${cls.cta}" style="display:inline-block;${FONT}color:#FFFFFF;font-weight:${weights.bold};font-size:13px;line-height:16px;padding:10px 22px;border-radius:${emailRadii.sm}px;">${text}</a>
      </td></tr>
    </table>`
}

/** A section label above a table or list. */
export function sectionLabel(text: string): string {
  return `<p class="${cls.muted}" style="${FONT}color:${color('muted')};font-size:${type.caption.size}px;line-height:${type.caption.lineHeight}px;font-weight:${weights.bold};letter-spacing:1.2px;text-transform:uppercase;margin:0 0 8px;">${text}</p>`
}

/**
 * A leaderboard-style table: rank, name, value. Used by the weekly recap and by
 * match results (where `rank` is omitted).
 */
export function standingsTable(
  rows: {
    rank?: string
    name: string
    value: string
    /** Semantic tint for the value. A variant, not a hex — see dataRows. */
    valueVariant?: CalloutVariant
    note?: string
  }[]
): string {
  if (rows.length === 0) return ''
  const body = rows
    .map((r) => {
      const valueClass = r.valueVariant ? cls.calloutText(r.valueVariant) : cls.heading
      const valueColor = r.valueVariant ? calloutText[r.valueVariant].light : color('heading')
      return `<tr>
        ${r.rank !== undefined ? `<td class="${cls.muted}" style="${FONT}color:${color('muted')};font-size:${type.small.size}px;font-weight:${weights.bold};padding:9px 10px 9px 0;border-bottom:1px solid ${color('hairline')};width:36px;">${r.rank}</td>` : ''}
        <td class="${cls.body}" style="${FONT}color:${color('body')};font-size:${type.small.size}px;padding:9px 10px 9px 0;border-bottom:1px solid ${color('hairline')};">${r.name}${r.note ? ` <span class="${cls.muted}" style="color:${color('muted')};">${r.note}</span>` : ''}</td>
        <td class="${valueClass}" style="${FONT}color:${valueColor};font-size:${type.small.size}px;font-weight:${weights.bold};padding:9px 0;border-bottom:1px solid ${color('hairline')};text-align:right;white-space:nowrap;">${r.value}</td>
      </tr>`
    })
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 16px;">${body}</table>`
}

/** A centred scoreline — "Brazil 2 - 1 Argentina". */
export function scoreline(text: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
      <tr><td class="${cls.callout('neutral')}" style="background:${color('neutralBg')};border:1px solid ${color('hairline')};border-radius:${emailRadii.sm}px;padding:20px 18px;text-align:center;">
        <p class="${cls.heading}" style="${FONT}color:${color('heading')};font-size:20px;line-height:26px;font-weight:${weights.black};margin:0;">${text}</p>
      </td></tr>
    </table>`
}

/** A thin gold rule — the accent flourish from the RN app. */
export function accentRule(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
      <tr><td style="background:${color('accent')};height:3px;line-height:3px;font-size:0;border-radius:${emailRadii.pill}px;width:44px;">&nbsp;</td></tr>
    </table>`
}
