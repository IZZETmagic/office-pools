// Expo's push receipts (lib/push/receipts.ts), N4 step 3. Pinned: only rows at least 15 minutes
// old are asked about; every answer marks its row; DeviceNotRegistered removes that token and no
// other answer does; a receipt Expo has not produced yet leaves the row to be asked again; past
// Expo's 24 hours a row is marked 'unavailable' without asking; tokens go before rows are marked,
// so a failure part-way loses nothing; and an Expo failure changes nothing.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkPushReceipts, RECEIPT_DELAY_MS, type ExpoReceipt } from '../receipts'

const NOW = Date.parse('2026-10-10T12:00:00Z')
const MIN = 60_000
const at = (minutesAgo: number) => new Date(NOW - minutesAgo * MIN).toISOString()

type Row = { delivery_id: number; created_at: string; provider_id: string; push_token_id: string | null }

function world(rows: Row[], opts: { removeError?: string; markError?: string } = {}) {
  const seen = { lte: null as string | null, filters: [] as string[], removed: [] as string[], marks: [] as unknown[] }
  const tokens = new Set(rows.map((r) => r.push_token_id).filter(Boolean))
  const admin = {
    from(table: string) {
      if (table === 'notification_deliveries') {
        const q = {
          select: () => q,
          eq: (c: string, v: unknown) => { seen.filters.push(`${c}=${v}`); return q },
          is: (c: string, v: unknown) => { seen.filters.push(`${c} is ${v}`); return q },
          not: (c: string, op: string, v: unknown) => { seen.filters.push(`${c} not ${op} ${v}`); return q },
          lte: (_c: string, v: string) => { seen.lte = v; return q },
          order: () => q,
          limit: () => q,
          then: (resolve: (r: unknown) => unknown) => resolve({ data: rows, error: null }),
        }
        return q
      }
      if (table === 'push_tokens') {
        let ids: string[] = []
        const q = {
          delete: () => q,
          in: (_c: string, v: string[]) => { ids = v; return q },
          select: () => q,
          then: (resolve: (r: unknown) => unknown) => {
            if (opts.removeError) return resolve({ data: null, error: { message: opts.removeError } })
            const gone = ids.filter((id) => tokens.delete(id))
            seen.removed.push(...gone)
            return resolve({ data: gone.map((id) => ({ id })), error: null })
          },
        }
        return q
      }
      throw new Error(`unexpected table ${table}`)
    },
    rpc: async (fn: string, args: { p_marks: unknown[] }) => {
      expect(fn).toBe('notification_deliveries_mark_receipts')
      if (opts.markError) return { data: null, error: { message: opts.markError } }
      seen.marks.push(...args.p_marks)
      return { data: args.p_marks.length, error: null }
    },
  }
  return { admin: admin as never, seen }
}

const receipts = (answers: Record<string, ExpoReceipt>) => ({ fetchReceipts: vi.fn(async () => answers) })
const gone: ExpoReceipt = { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } }

let log: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  log = vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('what is asked about', () => {
  it('only Expo rows the provider took, not yet checked, at least 15 minutes old', async () => {
    const w = world([])
    const deps = receipts({})
    await checkPushReceipts(w.admin, NOW, deps)
    expect(w.seen.filters).toEqual(['provider=expo', 'status=sent', 'receipt_checked_at is null', 'provider_id not is null'])
    expect(w.seen.lte).toBe(new Date(NOW - RECEIPT_DELAY_MS).toISOString())
    expect(deps.fetchReceipts).not.toHaveBeenCalled()
  })
})

describe('the answers', () => {
  it('ok is marked ok, and nothing is removed', async () => {
    const w = world([{ delivery_id: 1, created_at: at(20), provider_id: 'tk1', push_token_id: 'tok-1' }])
    const s = await checkPushReceipts(w.admin, NOW, receipts({ tk1: { status: 'ok' } }))
    expect(w.seen.marks).toEqual([{ created_at: at(20), delivery_id: 1, receipt_status: 'ok' }])
    expect(w.seen.removed).toEqual([])
    expect(s).toMatchObject({ checked: 1, okReceipts: 1, tokensRemoved: 0 })
  })

  it('DeviceNotRegistered removes that token, and marks the row', async () => {
    const w = world([
      { delivery_id: 1, created_at: at(20), provider_id: 'tk1', push_token_id: 'tok-1' },
      { delivery_id: 2, created_at: at(20), provider_id: 'tk2', push_token_id: 'tok-2' },
    ])
    const s = await checkPushReceipts(w.admin, NOW, receipts({ tk1: gone, tk2: { status: 'ok' } }))
    expect(w.seen.removed).toEqual(['tok-1'])
    expect(w.seen.marks).toContainEqual({ created_at: at(20), delivery_id: 1, receipt_status: 'DeviceNotRegistered' })
    expect(s).toMatchObject({ checked: 2, okReceipts: 1, errors: { DeviceNotRegistered: 1 }, tokensRemoved: 1 })
  })

  it('any other error is marked but removes nothing — and a credentials fault is shouted', async () => {
    const w = world([{ delivery_id: 1, created_at: at(20), provider_id: 'tk1', push_token_id: 'tok-1' }])
    const s = await checkPushReceipts(w.admin, NOW, receipts({ tk1: { status: 'error', details: { error: 'InvalidCredentials' } } }))
    expect(w.seen.removed).toEqual([])
    expect(s.errors).toEqual({ InvalidCredentials: 1 })
    expect(log).toHaveBeenCalledWith(expect.stringContaining('every Android push is failing'))
  })

  it('no receipt yet: the row is left to be asked again', async () => {
    const w = world([{ delivery_id: 1, created_at: at(16), provider_id: 'tk1', push_token_id: 'tok-1' }])
    const s = await checkPushReceipts(w.admin, NOW, receipts({}))
    expect(w.seen.marks).toEqual([])
    expect(s).toMatchObject({ checked: 0, notReady: 1 })
  })

  it('past Expo\'s 24 hours: marked unavailable, without asking', async () => {
    const w = world([{ delivery_id: 1, created_at: at(24 * 60 + 1), provider_id: 'tk-old', push_token_id: 'tok-1' }])
    const deps = receipts({ 'tk-old': gone })
    const s = await checkPushReceipts(w.admin, NOW, deps)
    expect(deps.fetchReceipts).not.toHaveBeenCalled()
    expect(w.seen.removed).toEqual([])
    expect(w.seen.marks).toEqual([{ created_at: at(24 * 60 + 1), delivery_id: 1, receipt_status: 'unavailable' }])
    expect(s.unavailable).toBe(1)
  })
})

describe('failures change nothing that matters', () => {
  it('if a token cannot be removed, no row is marked — all of it is asked again next run', async () => {
    const w = world([{ delivery_id: 1, created_at: at(20), provider_id: 'tk1', push_token_id: 'tok-1' }], { removeError: 'timeout' })
    await expect(checkPushReceipts(w.admin, NOW, receipts({ tk1: gone }))).rejects.toThrow('could not remove gone tokens: timeout')
    expect(w.seen.marks).toEqual([])
  })

  it('if Expo fails, nothing is removed or marked', async () => {
    const w = world([{ delivery_id: 1, created_at: at(20), provider_id: 'tk1', push_token_id: 'tok-1' }])
    const deps = { fetchReceipts: vi.fn(async () => { throw new Error('Expo getReceipts: HTTP 503') }) }
    await expect(checkPushReceipts(w.admin, NOW, deps)).rejects.toThrow('HTTP 503')
    expect(w.seen.removed).toEqual([])
    expect(w.seen.marks).toEqual([])
  })
})
