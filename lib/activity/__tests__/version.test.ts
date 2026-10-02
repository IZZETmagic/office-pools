import { describe, it, expect } from 'vitest'
import { activityApiVersion } from '../version'

describe('activityApiVersion', () => {
  it('treats a missing version as v1 — an older OTA', () => {
    expect(activityApiVersion(null)).toBe(1)
  })

  it('reads the versions builds send today', () => {
    expect(activityApiVersion('1')).toBe(1)
    expect(activityApiVersion('2')).toBe(2)
  })

  it('keeps a future version — v3 must not fall back to v1', () => {
    expect(activityApiVersion('3')).toBe(3)
    expect(activityApiVersion('3') >= 2).toBe(true)
  })

  it('falls back to v1 for anything that is not a whole version', () => {
    for (const raw of ['', 'abc', '2.5', '-2', '0', 'NaN', 'Infinity']) {
      expect(activityApiVersion(raw)).toBe(1)
    }
  })
})
