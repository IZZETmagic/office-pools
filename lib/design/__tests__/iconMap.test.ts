import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

// Drift guard for the SF-Symbol name maps.
//
// components/ui/Icon.tsx is a port of mobile/components/ui/Icon.tsx, and the whole point
// of keeping SF-Symbol-style names on both platforms is that an icon choice made on one
// surface is directly comparable on the other. If the two maps drift, that stops being
// true silently.
//
// Both files are parsed as TEXT rather than imported: the RN module pulls in react-native
// (not a root dependency) and the web module is TSX pulling in ESM-only Hugeicons, neither
// of which the node-environment test runner can load.

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')

const webSource = read('../../../components/ui/Icon.tsx')
const mobileSource = read('../../../mobile/components/ui/Icon.tsx')

/**
 * Pull the quoted keys out of a `const NAME: Record<string, IconConstant> = { ... }` block.
 * Returns null when the block is absent so a rename fails loudly instead of comparing [].
 */
function mapKeys(source: string, mapName: string): string[] | null {
  const start = source.indexOf(`const ${mapName}: Record<string, IconConstant> = {`)
  if (start === -1) return null
  const open = source.indexOf('{', start)

  let depth = 0
  let end = -1
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end === -1) return null

  const body = source.slice(open + 1, end)
  return [...body.matchAll(/^\s*'([^']+)':/gm)].map((m) => m[1])
}

describe('web and mobile icon maps agree', () => {
  const webKeys = mapKeys(webSource, 'ICON_MAP')
  const mobileKeys = mapKeys(mobileSource, 'ICON_MAP')

  it('both ICON_MAP blocks were found and parsed', () => {
    expect(webKeys, 'could not parse ICON_MAP from components/ui/Icon.tsx').not.toBeNull()
    expect(mobileKeys, 'could not parse ICON_MAP from mobile/…/Icon.tsx').not.toBeNull()
    expect(webKeys!.length).toBeGreaterThan(100)
  })

  it('the web map covers exactly the SF names the RN app maps', () => {
    // If this fails, one platform gained or lost an icon. Add it to the other rather than
    // relaxing the assertion — divergence here is how the two surfaces drift apart.
    expect([...webKeys!].sort()).toEqual([...mobileKeys!].sort())
  })

  it('has no duplicate keys on either side', () => {
    expect(new Set(webKeys!).size).toBe(webKeys!.length)
    expect(new Set(mobileKeys!).size).toBe(mobileKeys!.length)
  })

  it('keeps ICON_MAP alphabetised, as both files claim', () => {
    expect(webKeys).toEqual([...webKeys!].sort())
  })
})

describe('web Icon renderer', () => {
  it('uses the same stroke-width ladder as the RN app', () => {
    // The ladder is the only thing carrying icon "weight" across, since the free tier has
    // no fill variants — so it is worth pinning the exact numbers on both sides.
    for (const width of ['2.8', '2.5', '2.25', '1.75']) {
      expect(webSource).toContain(`return ${width}`)
      expect(mobileSource).toContain(`return ${width}`)
    }
  })

  it('resolves solid glyphs from the Pro package', () => {
    // @hugeicons-pro/* installs from Hugeicons' private registry via the root .npmrc,
    // which reads HUGEICONS_NPM_TOKEN. If this import is present, that variable must
    // also be set in the Vercel project or the build cannot install the package.
    expect(webSource).toContain("from '@hugeicons-pro/core-solid-rounded'")
  })

  it('the web solid map covers exactly the SF names the RN app fills', () => {
    const webSolid = mapKeys(webSource, 'SOLID_ICON_MAP')
    const mobileSolid = mapKeys(mobileSource, 'SOLID_ICON_MAP')
    expect(webSolid, 'could not parse SOLID_ICON_MAP from the web Icon').not.toBeNull()
    expect(mobileSolid, 'could not parse SOLID_ICON_MAP from the RN Icon').not.toBeNull()
    expect([...webSolid!].sort()).toEqual([...mobileSolid!].sort())
  })

  it('every solid name also has an outline fallback', () => {
    // `solid` is opt-in per call site, so a name present only in SOLID_ICON_MAP would
    // render the fallback Circle whenever a caller omitted the prop.
    const outline = mapKeys(webSource, 'ICON_MAP') ?? []
    for (const name of mapKeys(webSource, 'SOLID_ICON_MAP') ?? []) {
      expect(outline).toContain(name)
    }
  })
})
