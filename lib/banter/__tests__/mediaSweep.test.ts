import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { sweepBanterMedia } from '../mediaSweep'

type Row = { path: string; attempts: number }

/** A stand-in for the admin client's queue table and Storage bucket. */
function fakeAdmin(queue: Row[], storage: Set<string>, opts: { removeError?: string } = {}) {
  const updates: { path: string; attempts: number; last_error: string }[] = []
  const client = {
    from: (table: string) => {
      expect(table).toBe('banter_media_deletions')
      return {
        select: () => ({
          order: () => ({
            limit: (n: number) => Promise.resolve({ data: queue.slice(0, n), error: null }),
          }),
        }),
        update: (vals: { attempts: number; last_error: string }) => ({
          eq: (_col: string, path: string) => {
            updates.push({ path, ...vals })
            return Promise.resolve({ error: null })
          },
        }),
        delete: () => ({
          in: (_col: string, paths: string[]) => {
            for (const p of paths) queue.splice(queue.findIndex(r => r.path === p), 1)
            return Promise.resolve({ error: null })
          },
        }),
      }
    },
    storage: {
      from: (bucket: string) => {
        expect(bucket).toBe('banter-media')
        return {
          remove: (paths: string[]) => {
            if (opts.removeError) return Promise.resolve({ data: null, error: { message: opts.removeError } })
            const gone = paths.filter(p => storage.delete(p))
            return Promise.resolve({ data: gone.map(name => ({ name })), error: null })
          },
        }
      },
    },
  }
  return { client: client as never, updates }
}

describe('sweepBanterMedia', () => {
  it('removes queued files and clears their rows', async () => {
    const queue = [{ path: 'p/u/a.jpg', attempts: 0 }, { path: 'p/u/b.jpg', attempts: 0 }]
    const storage = new Set(['p/u/a.jpg', 'p/u/b.jpg', 'p/u/keep.jpg'])
    const { client } = fakeAdmin(queue, storage)
    expect(await sweepBanterMedia(client)).toEqual({ removed: 2, cleared: 2, failed: 0 })
    expect(queue).toEqual([])
    expect([...storage]).toEqual(['p/u/keep.jpg'])
  })

  it('clears a path whose file is already gone — that is the outcome we wanted', async () => {
    const queue = [{ path: 'p/u/missing.jpg', attempts: 0 }]
    const { client } = fakeAdmin(queue, new Set())
    expect(await sweepBanterMedia(client)).toEqual({ removed: 0, cleared: 1, failed: 0 })
    expect(queue).toEqual([])
  })

  it('keeps rows on a Storage error and records the attempt for the next run', async () => {
    const queue = [{ path: 'p/u/a.jpg', attempts: 2 }]
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client, updates } = fakeAdmin(queue, new Set(['p/u/a.jpg']), { removeError: 'storage down' })
    expect(await sweepBanterMedia(client)).toEqual({ removed: 0, cleared: 0, failed: 1 })
    expect(queue).toHaveLength(1)
    expect(updates).toEqual([{ path: 'p/u/a.jpg', attempts: 3, last_error: 'storage down' }])
    spy.mockRestore()
  })

  it('does nothing on an empty queue', async () => {
    const { client } = fakeAdmin([], new Set())
    expect(await sweepBanterMedia(client)).toEqual({ removed: 0, cleared: 0, failed: 0 })
  })
})
