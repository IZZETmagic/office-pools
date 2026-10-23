// =============================================================
// The small-face helpers are one text in two places
// =============================================================
// `mobile/` is a separate npm project and cannot import the web's lib, so the face crop and the
// once-per-person cache are COPIES. Both platforms draw the same member in Banter; a crop edited
// on one side only would show a different head on the phone than on the web, and nothing would
// error. So the copies are held identical, byte for byte — edit both.
// =============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

describe('the app and the web share the small-face helpers word for word', () => {
  it.each(['faceCrop.ts', 'faceCache.ts'])('%s', (file) => {
    expect(read(`mobile/lib/avatar/${file}`)).toBe(read(`lib/avatar/${file}`))
  })
})
