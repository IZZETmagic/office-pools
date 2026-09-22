// =============================================================
// The inlined jersey and the asset on disk must agree
// =============================================================
// `mobile/components/match/Jersey.tsx` carries a COPY of
// `assets/jersey-explore/jersey-outfield.svg`, because Metro has no SVG
// transformer configured — the same reason the old World Cup rail mark was
// inlined rather than bundled.
//
// A copy drifts. The failure is silent and ugly: the asset gets a nicer waist
// or a redrawn sleeve, nobody re-inlines it, and the pitch keeps rendering last
// month's shirt while the file everyone reads says otherwise.
// =============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const root = resolve(__dirname, '../../..')
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')

/** Comments out, whitespace collapsed — formatting is not a mismatch. */
const normalise = (s: string) =>
  s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .replace(/>\s+</g, '><')
    .trim()

describe('the jersey on the pitch is the jersey in the repo', () => {
  const asset = read('assets/jersey-explore/jersey-outfield.svg')
  const component = read('mobile/components/match/Jersey.tsx')

  it('inlines the asset’s geometry, byte for byte once normalised', () => {
    const fromAsset = asset.match(/<g transform=[\s\S]*<\/g>/)?.[0]
    const fromComponent = component.match(/const JERSEY_INNER = `([\s\S]*?)`/)?.[1]

    expect(fromAsset, 'could not find the <g> in the asset').toBeTruthy()
    expect(fromComponent, 'could not find JERSEY_INNER in Jersey.tsx').toBeTruthy()
    expect(normalise(fromComponent!)).toBe(normalise(fromAsset!))
  })

  it('⚠ keeps `currentColor`, which is what makes it recolourable', () => {
    // The fill is substituted per club at render time. A hardcoded hex here
    // would give every club in five leagues the same shirt.
    const inner = component.match(/const JERSEY_INNER = `([\s\S]*?)`/)?.[1] ?? ''
    expect(inner).toContain('currentColor')
    expect(inner, 'a literal fill crept in').not.toMatch(/fill="#[0-9a-f]{6}"/i)
  })

  it('⚠ carries no baked-in number — the number is live text', () => {
    // Recraft's original generation had "10" drawn into the shape. A <text> in
    // here would print 10 on every player on the pitch.
    const inner = component.match(/const JERSEY_INNER = `([\s\S]*?)`/)?.[1] ?? ''
    expect(inner).not.toContain('<text')
  })
})
