import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { withoutBlockersOf } from '../blocks'

/** The smallest stand-in for `admin.from('user_blocks').select().eq().in()`. */
function fakeAdmin(result: { data: { blocker_id: string }[] | null; error: unknown }) {
  const calls: Record<string, unknown> = {}
  const chain = {
    select: (cols: string) => { calls.select = cols; return chain },
    eq: (col: string, val: string) => { calls.eq = [col, val]; return chain },
    in: (col: string, vals: string[]) => { calls.in = [col, vals]; return Promise.resolve(result) },
  }
  return { client: { from: (t: string) => { calls.from = t; return chain } } as never, calls }
}

describe('withoutBlockersOf', () => {
  it('drops exactly the recipients who blocked the sender', async () => {
    const { client, calls } = fakeAdmin({ data: [{ blocker_id: 'b' }], error: null })
    expect(await withoutBlockersOf(client, 'sender', ['a', 'b', 'c'])).toEqual(['a', 'c'])
    expect(calls).toMatchObject({ from: 'user_blocks', eq: ['blocked_id', 'sender'], in: ['blocker_id', ['a', 'b', 'c']] })
  })

  it('returns everyone when nobody blocked the sender', async () => {
    const { client } = fakeAdmin({ data: [], error: null })
    expect(await withoutBlockersOf(client, 'sender', ['a', 'b'])).toEqual(['a', 'b'])
  })

  it('fails OPEN on a lookup error rather than silencing every push', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client } = fakeAdmin({ data: null, error: { message: 'boom' } })
    expect(await withoutBlockersOf(client, 'sender', ['a'])).toEqual(['a'])
    spy.mockRestore()
  })

  it('does not query for an empty list', async () => {
    const { client, calls } = fakeAdmin({ data: [], error: null })
    expect(await withoutBlockersOf(client, 'sender', [])).toEqual([])
    expect(calls.from).toBeUndefined()
  })
})
