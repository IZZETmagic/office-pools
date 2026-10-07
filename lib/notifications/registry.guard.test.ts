// =============================================================
// The code's copy of the notification registry must equal the database's
// =============================================================
// public.notification_types is seeded and changed only by migrations, between
// "-- registry rows: begin" and "-- registry rows: end". lib/notifications/
// registry.ts is the copy code reads. This test replays every migration's rows
// in order (a later row for the same kind replaces the earlier one, as the
// upsert does) and fails unless both sides list exactly the same kinds with
// the same switch and status.
//
// ## Why this is the gate, not a tidiness check
//
// The registry exists so that no kind of notification can exist without a
// plain sentence saying how it works. The database refuses a row without one.
// This test closes the other door: a kind added in code cannot pass until a
// migration registers it — with its sentence.
//
// ⚠ IT READS TEXT. A row line in a registry block that does not parse FAILS,
// rather than being skipped — a skipped line would be a kind with no check.
// =============================================================

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'fs'
import { resolve } from 'path'
import { GAME_MODES, NOTIFICATION_TYPES } from './registry'

type SqlRow = {
  key: string
  category: string
  modes: string[] | null
  channels: string[]
  transactional: boolean
  expires: string
  window: string | null
  status: string
  sentence: string
  file: string
}

const ROW =
  /^\s*\('([a-z][a-z0-9_]*)',\s*'([A-Z_]+)',\s*(null|'\{[a-z_,]*\}'),\s*'\{([a-z_,]*)\}',\s*(true|false),\s*'([a-z_]+)',\s*(null|'[^']*'),\s*'([a-z]+)',\s*'((?:[^']|'')*)'\)\s*,?\s*$/

function registryFromMigrations(): { rows: Map<string, SqlRow>; unparsed: string[] } {
  const dir = resolve(process.cwd(), 'lib/migrations')
  // Lettered files (025b_…) are migrations too — a registry row in one must not be skipped.
  const order = (f: string) => {
    const m = /^(\d+)([a-z]?)_/.exec(f)
    return m ? parseInt(m[1], 10) * 100 + (m[2] ? m[2].charCodeAt(0) - 96 : 0) : Infinity
  }
  const files = readdirSync(dir)
    .filter((f) => /^\d+[a-z]?_.*\.sql$/.test(f))
    .sort((a, b) => order(a) - order(b))
  const rows = new Map<string, SqlRow>()
  const unparsed: string[] = []
  for (const file of files) {
    const lines = readFileSync(resolve(dir, file), 'utf8').split('\n')
    let inBlock = false
    for (const line of lines) {
      if (line.includes('-- registry rows: begin')) { inBlock = true; continue }
      if (line.includes('-- registry rows: end')) { inBlock = false; continue }
      if (!inBlock || line.trim() === '' || line.trim().startsWith('--')) continue
      const m = ROW.exec(line)
      if (!m) { unparsed.push(`${file}: ${line.trim().slice(0, 80)}`); continue }
      const [, key, category, modes, channels, transactional, expires, window, status, sentence] = m
      rows.set(key, {
        key,
        category,
        modes: modes === 'null' ? null : modes.slice(2, -2).split(',').filter(Boolean),
        channels: channels.split(',').filter(Boolean),
        transactional: transactional === 'true',
        expires,
        window: window === 'null' ? null : window.slice(1, -1),
        status,
        sentence: sentence.replace(/''/g, "'"),
        file,
      })
    }
  }
  return { rows, unparsed }
}

describe('the notification registry: code and database agree', () => {
  const { rows, unparsed } = registryFromMigrations()

  it('finds the registry, and every row in it parses', () => {
    expect(rows.size).toBeGreaterThan(0)
    expect(unparsed).toEqual([])
  })

  it('lists exactly the same kinds on both sides', () => {
    const inCode = Object.keys(NOTIFICATION_TYPES).sort()
    const inDb = [...rows.keys()].sort()
    expect({ missingFromDatabase: inCode.filter((k) => !rows.has(k)), missingFromCode: inDb.filter((k) => !inCode.includes(k)) })
      .toEqual({ missingFromDatabase: [], missingFromCode: [] })
  })

  it('gives every kind the same switch, status and always-delivered flag on both sides', () => {
    const disagreements: string[] = []
    for (const [key, spec] of Object.entries(NOTIFICATION_TYPES)) {
      const row = rows.get(key)
      if (!row) continue
      if (row.category !== spec.category) disagreements.push(`${key}: category ${spec.category} in code, ${row.category} in ${row.file}`)
      if (row.status !== spec.status) disagreements.push(`${key}: status ${spec.status} in code, ${row.status} in ${row.file}`)
      // An always-delivered kind skips the switch at send time — the code's copy decides that, so it must not drift.
      const transactional = 'transactional' in spec && spec.transactional === true
      if (row.transactional !== transactional) disagreements.push(`${key}: transactional ${transactional} in code, ${row.transactional} in ${row.file}`)
    }
    expect(disagreements).toEqual([])
  })
})

describe('every registered kind passes what the database will enforce', () => {
  const { rows } = registryFromMigrations()

  it('has a sentence a member can read', () => {
    const bad = [...rows.values()].filter((r) => r.sentence.trim().length < 20 || r.sentence.trim().length > 200)
    expect(bad.map((r) => r.key)).toEqual([])
  })

  it('names only known modes and channels, and never emails an Achievements notice', () => {
    const problems: string[] = []
    for (const r of rows.values()) {
      for (const m of r.modes ?? []) if (!(GAME_MODES as readonly string[]).includes(m)) problems.push(`${r.key}: mode ${m}`)
      for (const c of r.channels) if (!['email', 'push', 'inapp'].includes(c)) problems.push(`${r.key}: channel ${c}`)
      if (r.category === 'GAMIFICATION' && r.channels.includes('email')) problems.push(`${r.key}: Achievements has no email switch`)
      if (r.category === 'NEWS' && r.channels.includes('push')) problems.push(`${r.key}: News from SportPool has no push switch`)
      if ((r.expires === 'after_window') !== (r.window !== null)) problems.push(`${r.key}: expiry window does not match ${r.expires}`)
    }
    expect(problems).toEqual([])
  })
})
