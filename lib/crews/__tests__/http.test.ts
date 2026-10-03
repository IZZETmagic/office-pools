// crewResponse — a store result as an HTTP response.

import { describe, it, expect } from 'vitest'
import { crewResponse, readBody } from '../http'

describe('crewResponse', () => {
  it('a success drops `ok` and returns the rest', async () => {
    const r = crewResponse({ ok: true, crewId: 'c1' })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ crewId: 'c1' })
  })
  it('a failure keeps its status, and its reason when there is one', async () => {
    const full = crewResponse({ ok: false, status: 409, error: 'This pool is full.', reason: 'pool_full' })
    expect(full.status).toBe(409)
    expect(await full.json()).toEqual({ error: 'This pool is full.', reason: 'pool_full' })
    const plain = crewResponse({ ok: false, status: 403, error: 'Nope.' })
    expect(await plain.json()).toEqual({ error: 'Nope.' })
  })
})

describe('readBody', () => {
  it('a missing or malformed body is {} — the route’s own checks answer 400', async () => {
    expect(await readBody(new Request('http://x', { method: 'POST', body: 'not json' }))).toEqual({})
    expect(await readBody(new Request('http://x', { method: 'POST', body: '"a string"' }))).toEqual({})
    expect(await readBody(new Request('http://x', { method: 'POST', body: '{"name":"A"}' }))).toEqual({ name: 'A' })
  })
})
