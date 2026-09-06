// =============================================================
// The mobile copy of the competition palette must equal the web's
// =============================================================
// `mobile/lib/design/competition.ts` and `mobile/lib/design/oklch.ts` are hand
// copies of `lib/design/competitionColor.ts`, `competitionMark.ts`,
// `getPoolStripe()` in `poolMode.ts`, and `oklch.ts` — because mobile is a
// separate npm project with its own lockfile and cannot import them. Gate R1 in
// drafts/2026-09-02_rn_league_modes_and_cards_plan.md exists to end that.
//
// ## Why this is a test and not care
//
// A copy with nothing checking it is how `DUEL_WIN` came to be written three
// different ways INSIDE one codebase. Across a package boundary, with no
// compiler spanning both sides, drift is not a risk but a schedule — and the
// failure is invisible: a stripe one shade off, or a competition that has a
// mark on the web and a blank rail on the phone. Nothing errors.
//
// ⚠ IT COMPARES TEXT, not behaviour. It proves the two tables agree; it cannot
// prove the rail renders. The mask in the World Cup's SVG in particular is only
// provable on a device.
// =============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

describe('the mobile competition palette mirrors the web', () => {
  it('agrees on every colour, id, scalar and mark', () => {
    const root = process.cwd()
    const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

    const failures: string[] = []
    const fail = (m: string) => failures.push(m)

    const web = read('lib/design/competitionColor.ts')
    const webMark = read('lib/design/competitionMark.ts')
    const webTokens = read('lib/design/tokens.ts')
    const webMode = read('lib/design/poolMode.ts')
    const rn = read('mobile/lib/design/competition.ts')

    /** `key: value,` pairs out of a named object literal. */
    function entries(src: string, decl: string): Record<string, string> {
      const start = src.indexOf(decl)
      if (start === -1) return {}
      const open = src.indexOf('{', start)
      let depth = 0
      let end = open
      for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break } }
      }
      const body = src.slice(open + 1, end)
      const out: Record<string, string> = {}
      for (const m of body.matchAll(/(?:\[([^\]]+)\]|(\w+))\s*:\s*'([^']+)'|(\w+)\s*:\s*(\d+)/g)) {
        const key = (m[1] ?? m[2] ?? m[4] ?? '').trim()
        const val = m[3] ?? m[5] ?? ''
        if (key) out[key] = val
      }
      return out
    }

    // ---- LEAGUE_ID ----
    const webIds = entries(web, 'export const LEAGUE_ID')
    const rnIds = entries(rn, 'export const LEAGUE_ID')
    for (const [k, v] of Object.entries(webIds)) {
      if (rnIds[k] !== v) fail(`LEAGUE_ID.${k}: web ${v}, mobile ${rnIds[k] ?? '(missing)'}`)
    }
    for (const k of Object.keys(rnIds)) if (!(k in webIds)) fail(`LEAGUE_ID.${k} exists on mobile only`)

    // ---- COMPETITION_COLOR ----
    const webColor = entries(web, 'export const COMPETITION_COLOR')
    const rnColor = entries(rn, 'export const COMPETITION_COLOR')
    for (const [k, v] of Object.entries(webColor)) {
      if (rnColor[k]?.toUpperCase() !== v.toUpperCase()) {
        fail(`COMPETITION_COLOR[${k}]: web ${v}, mobile ${rnColor[k] ?? '(missing)'}`)
      }
    }
    for (const k of Object.keys(rnColor)) if (!(k in webColor)) fail(`COMPETITION_COLOR[${k}] exists on mobile only`)

    // ---- scalars ----
    const scalar = (src: string, name: string) =>
      src.match(new RegExp(`${name}\\s*=\\s*'?([^'\\n;]+)'?`))?.[1]?.trim().replace(/['"]/g, '')
    const pairs: Array<[string, string | undefined, string | undefined]> = [
      ['UNTHEMED_COMPETITION', scalar(web, 'UNTHEMED_COMPETITION'), scalar(rn, 'UNTHEMED_COMPETITION')],
      ['STRIPE_TOP_LIFT', scalar(webTokens, 'STRIPE_TOP_LIFT'), scalar(rn, 'STRIPE_TOP_LIFT')],
    ]
    for (const [name, a, b] of pairs) {
      if (!a) fail(`${name}: not found on the web side`)
      else if (a !== b) fail(`${name}: web ${a}, mobile ${b ?? '(missing)'}`)
    }

    // ---- the stripe is still [lifted, brand] on both sides ----
    if (!/adjustLightness\(brand,\s*STRIPE_TOP_LIFT\),\s*brand/.test(webMode)) {
      fail('getPoolStripe on the web no longer returns [adjustLightness(brand, LIFT), brand]')
    }
    if (!/adjustLightness\(brand,\s*STRIPE_TOP_LIFT\),\s*brand/.test(rn)) {
      fail('getPoolStripe on mobile no longer returns [adjustLightness(brand, LIFT), brand]')
    }

    // ---- the OKLab maths, below each banner ----
    const strip = (s: string) => s.slice(s.indexOf('export type Oklab')).replace(/\s+/g, ' ').trim()
    if (strip(read('lib/design/oklch.ts')) !== strip(read('mobile/lib/design/oklch.ts'))) {
      fail('oklch.ts: the mobile copy has diverged from lib/design/oklch.ts below the banner')
    }

    // ---- every web mark exists on mobile, as a file or as inlined markup ----
    const railSrc = read('mobile/components/CompetitionRail.tsx')

    function setBody(src: string, decl: string): string[] {
      const m = src.match(new RegExp(`${decl}[^[]*\\[([^\\]]*)\\]`))
      if (!m) return []
      return m[1]
        .split(',')
        .map((s) => s.trim().replace('LEAGUE_ID.', ''))
        .filter(Boolean)
    }

    const marked = setBody(webMark, 'const MARKED = new Set<number>')
    const svgOnWeb = new Set(setBody(webMark, 'const SVG_MARKS = new Set<number>'))
    if (marked.length === 0) fail('could not read MARKED out of lib/design/competitionMark.ts')

    /** Comments out, whitespace collapsed — so formatting is not a mismatch. */
    const normalizeSvg = (s: string) =>
      s.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ').replace(/>\s+</g, '><').trim()

    for (const name of marked) {
      const id = webIds[name]
      if (!id) { fail(`MARKED lists ${name}, which has no LEAGUE_ID`); continue }

      if (svgOnWeb.has(name)) {
        // Inlined into the component rather than bundled: Metro has no SVG
        // transformer, so the markup is a copy and this is what keeps it honest.
        const inlined = railSrc.match(/<svg[\s\S]*?<\/svg>/)?.[0]
        const source = read(`public/competitions/${id}.svg`)
        if (!inlined) fail(`${name} (${id}) is an SVG mark but CompetitionRail.tsx inlines no <svg>`)
        else if (normalizeSvg(inlined) !== normalizeSvg(source)) {
          fail(`${name} (${id}): the SVG inlined in CompetitionRail.tsx has drifted from public/competitions/${id}.svg`)
        }
        continue
      }

      const p = `mobile/assets/competitions/${id}.png`
      if (!existsSync(resolve(root, p))) fail(`mark for ${name} (${id}) is on the web but ${p} is missing`)
      else if (!rn.includes(`${id}.png`)) fail(`${p} exists but competition.ts never requires it`)
    }


    expect(failures, `\n  · ${failures.join('\n  · ')}\n`).toEqual([])
  })
})

/**
 * The pool card's MODE half, which the competition half above says nothing about.
 *
 * `mobile/lib/design/poolMode.ts` is a hand copy of `lib/design/poolMode.ts`
 * plus `modeIdentityColor` from `lib/design/tokens.ts`, for the same reason
 * `competition.ts` is: mobile is a separate npm project and cannot import them.
 *
 * ⚠ THE PILL IS THE ONLY PLACE THE MODE IS COLOURED on either platform, now
 * that the rail carries the competition — so a drift here is not a shade being
 * slightly off, it is Showdown and Last Man Standing becoming indistinguishable
 * on one platform and not the other. The names matter for the same reason: the
 * pill is the only place a league pool is told apart from another league pool.
 */
describe('the mobile mode-identity palette mirrors the web', () => {
  it('agrees on every mode colour, name and pill scalar', () => {
    const root = process.cwd()
    const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

    const failures: string[] = []
    const fail = (m: string) => failures.push(m)

    const webTokens = read('lib/design/tokens.ts')
    const webMode = read('lib/design/poolMode.ts')
    const webCss = read('app/globals.css')
    const rn = read('mobile/lib/design/poolMode.ts')

    /** `key: 'value',` pairs out of a named object literal. */
    function strEntries(src: string, decl: string): Record<string, string> {
      const start = src.indexOf(decl)
      if (start === -1) return {}
      const open = src.indexOf('{', start)
      let depth = 0
      let end = open
      for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break } }
      }
      const out: Record<string, string> = {}
      for (const m of src.slice(open + 1, end).matchAll(/(\w+)\s*:\s*'([^']*)'/g)) out[m[1]] = m[2]
      return out
    }

    // ---- modeIdentityColor: all seven, both sides ----
    const webIdentity = strEntries(webTokens, 'export const modeIdentityColor')
    const rnIdentity = strEntries(rn, 'export const modeIdentityColor')
    if (Object.keys(webIdentity).length === 0) fail('could not read modeIdentityColor out of lib/design/tokens.ts')
    for (const [k, v] of Object.entries(webIdentity)) {
      if (rnIdentity[k]?.toUpperCase() !== v.toUpperCase()) {
        fail(`modeIdentityColor.${k}: web ${v}, mobile ${rnIdentity[k] ?? '(missing)'}`)
      }
    }
    for (const k of Object.keys(rnIdentity)) {
      if (!(k in webIdentity)) fail(`modeIdentityColor.${k} exists on mobile only`)
    }

    // ---- the four league games, and the short label each wears on the pill ----
    const leagueList = (src: string) =>
      src.match(/LEAGUE_MODES\s*=\s*\[([^\]]*)\]/)?.[1]
        .split(',').map((x) => x.trim().replace(/['"]/g, '')).filter(Boolean) ?? []
    const webLeague = leagueList(webMode)
    const rnLeague = leagueList(rn)
    if (webLeague.length === 0) fail('could not read LEAGUE_MODES out of lib/design/poolMode.ts')
    if (webLeague.join('|') !== rnLeague.join('|')) {
      fail(`LEAGUE_MODES: web [${webLeague.join(', ')}], mobile [${rnLeague.join(', ')}]`)
    }

    const webNames = strEntries(webMode, 'const LEAGUE_NAME')
    const rnNames = strEntries(rn, 'const LEAGUE_NAME')
    for (const [k, v] of Object.entries(webNames)) {
      if (rnNames[k] !== v) fail(`LEAGUE_NAME.${k}: web "${v}", mobile "${rnNames[k] ?? '(missing)'}"`)
    }

    // ---- the pill's treatment: ink lightness here, tint out of globals.css ----
    const num = (src: string, name: string) =>
      src.match(new RegExp(`${name}\\s*=\\s*([\\d.]+)`))?.[1]
    for (const name of ['INK_L_LIGHT', 'INK_L_DARK']) {
      const a = num(webMode, name)
      const b = num(rn, name)
      if (!a) fail(`${name}: not found on the web side`)
      else if (a !== b) fail(`${name}: web ${a}, mobile ${b ?? '(missing)'}`)
    }

    // `.mode-pill` sets the tint as a percentage; mobile passes a 0–1 alpha to
    // withOpacity, so the comparison is on the same scale rather than the same
    // literal.
    const cssTint = (selector: string) =>
      webCss.match(new RegExp(`${selector}\\s*\\{[^}]*var\\(--mode-base\\)\\s*([\\d.]+)%`))?.[1]
    const tints: Array<[string, string | undefined, string | undefined]> = [
      ['TINT_LIGHT', cssTint('\\.mode-pill'), num(rn, 'TINT_LIGHT')],
      ['TINT_DARK', cssTint('html\\.dark \\.mode-pill'), num(rn, 'TINT_DARK')],
    ]
    for (const [name, pct, alpha] of tints) {
      if (!pct) fail(`${name}: could not read the tint percentage out of app/globals.css`)
      else if (alpha === undefined) fail(`${name}: missing on mobile`)
      else if (Math.abs(Number(pct) / 100 - Number(alpha)) > 1e-9) {
        fail(`${name}: web ${pct}%, mobile ${alpha} (= ${Number(alpha) * 100}%)`)
      }
    }

    expect(failures, `\n  · ${failures.join('\n  · ')}\n`).toEqual([])
  })
})
