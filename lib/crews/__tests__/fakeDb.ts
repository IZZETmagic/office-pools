// An in-memory stand-in for the admin client, just wide enough for lib/crews/store.ts.
//
// Supports the PostgREST builder calls the store and readers make — select (incl. count/head),
// insert, update, delete; eq / neq / is / in / gte / ilike (exact, case-insensitive, wildcards escaped) /
// order / limit; single /
// maybeSingle / await — plus rpc() answered from a table of canned values.
//
// It also enforces the one rule the store's write ORDER depends on: 154's partial unique index of
// one active captain per crew. A promotion attempted before the old captain's row is closed fails
// here exactly as it would in Postgres, so the tests prove the ordering, not just the outcome.

type Row = Record<string, unknown>

let seq = 0
const id = (p: string) => `${p}-${++seq}`

const DEFAULTS: Record<string, () => Row> = {
  crews: () => ({ crew_id: id('crew'), created_at: new Date().toISOString(), closed_at: null, created_from_pool_id: null }),
  crew_members: () => ({ joined_at: new Date().toISOString(), left_at: null, left_reason: null, joined_via_pool_id: null }),
  crew_invites: () => ({ invite_id: id('inv'), created_at: new Date().toISOString(), resolved_at: null, resolution: null, invitee_user_id: null, invitee_email: null }),
  crew_seats: () => ({ held_at: new Date().toISOString(), resolved_at: null, resolution: null }),
}

function violatesOneCaptain(rows: Row[]): boolean {
  const seen = new Set<unknown>()
  for (const r of rows) {
    if (r.role === 'captain' && r.left_at === null) {
      if (seen.has(r.crew_id)) return true
      seen.add(r.crew_id)
    }
  }
  return false
}

export function fakeDb(seed: Record<string, Row[]>, rpcAnswers: Record<string, unknown> = {}) {
  const tables: Record<string, Row[]> = {}
  for (const [k, v] of Object.entries(seed)) tables[k] = v.map((r) => ({ ...r }))
  const rpcCalls: Array<{ fn: string; args: unknown }> = []

  function from(table: string) {
    tables[table] ??= []
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let payload: Row | Row[] | null = null
    let head = false
    let limit: number | null = null
    let sort: { col: string; asc: boolean } | null = null
    const filters: Array<(r: Row) => boolean> = []

    const run = (): { data: unknown; error: { message: string } | null; count?: number } => {
      const rows = tables[table]
      const match = rows.filter((r) => filters.every((f) => f(r)))
      if (op === 'insert') {
        const added = (payload as Row[]).map((r) => ({ ...(DEFAULTS[table]?.() ?? {}), ...r }))
        const next = [...rows, ...added]
        if (table === 'crew_members' && violatesOneCaptain(next)) return { data: null, error: { message: 'duplicate key: crew_members_one_captain' } }
        tables[table] = next
        return { data: added, error: null }
      }
      if (op === 'update') {
        const before = rows.map((r) => ({ ...r }))
        for (const r of match) Object.assign(r, payload)
        if (table === 'crew_members' && violatesOneCaptain(rows)) {
          tables[table] = before
          return { data: null, error: { message: 'duplicate key: crew_members_one_captain' } }
        }
        return { data: match, error: null }
      }
      if (op === 'delete') {
        tables[table] = rows.filter((r) => !match.includes(r))
        if (table === 'crews') {
          const gone = new Set(match.map((r) => r.crew_id))
          for (const t of ['crew_members', 'crew_invites', 'crew_seats']) {
            tables[t] = (tables[t] ?? []).filter((r) => !gone.has(r.crew_id))
          }
        }
        return { data: match, error: null }
      }
      const sorted = sort
        ? [...match].sort((x, y) => {
            const a = String(x[sort!.col] ?? ''), b = String(y[sort!.col] ?? '')
            return sort!.asc ? a.localeCompare(b) : b.localeCompare(a)
          })
        : match
      const out = (limit === null ? sorted : sorted.slice(0, limit)).map((r) => ({ ...r }))
      return head ? { data: null, error: null, count: match.length } : { data: out, error: null, count: match.length }
    }

    const b: Record<string, unknown> = {}
    b.select = (_cols?: string, opts?: { head?: boolean }) => {
      if (opts?.head) head = true
      return b
    }
    b.insert = (rows: Row | Row[]) => {
      op = 'insert'
      payload = Array.isArray(rows) ? rows : [rows]
      return b
    }
    b.update = (patch: Row) => {
      op = 'update'
      payload = patch
      return b
    }
    b.delete = () => {
      op = 'delete'
      return b
    }
    b.eq = (c: string, v: unknown) => (filters.push((r) => r[c] === v), b)
    b.neq = (c: string, v: unknown) => (filters.push((r) => r[c] !== v), b)
    b.is = (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b)
    b.in = (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), b)
    b.gte = (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), b)
    b.ilike = (c: string, v: string) => {
      const exact = v.replace(/\\([\\%_])/g, '$1').toLowerCase()
      filters.push((r) => String(r[c] ?? '').toLowerCase() === exact)
      return b
    }
    b.limit = (n: number) => ((limit = n), b)
    b.order = (col: string, opts?: { ascending?: boolean }) => ((sort = { col, asc: opts?.ascending !== false }), b)
    b.single = () => {
      const r = run()
      if (r.error) return Promise.resolve({ data: null, error: r.error })
      const rows = r.data as Row[]
      return Promise.resolve(rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: `expected 1 row, got ${rows.length}` } })
    }
    b.maybeSingle = () => {
      const r = run()
      if (r.error) return Promise.resolve({ data: null, error: r.error })
      const rows = r.data as Row[]
      return Promise.resolve(rows.length <= 1 ? { data: rows[0] ?? null, error: null } : { data: null, error: { message: 'more than one row' } })
    }
    b.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej)
    return b
  }

  const client = {
    from,
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args })
      const answer = rpcAnswers[fn]
      const data = typeof answer === 'function' ? (answer as (a: Record<string, unknown>) => unknown)(args) : answer ?? null
      return Promise.resolve({ data, error: null })
    },
  }

  return { client: client as never, tables, rpcCalls }
}
