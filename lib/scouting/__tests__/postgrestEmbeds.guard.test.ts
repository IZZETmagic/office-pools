// =============================================================
// A PostgREST embed needs a foreign key to travel along
// =============================================================
// ⚠⚠ THIS EXISTS BECAUSE THE SCOUT SCREEN SHIPPED BROKEN FOR EXACTLY ONE
// REASON: the dossier route asked for `users(...)` embedded on `pool_entries`.
// Verbatim, against production:
//
//     Could not embed because more than one relationship was found
//     for 'pool_entries' and 'users'
//
// `pool_entries` reaches `users` by more than one path — `user_id` and
// `retired_by` — so PostgREST refuses to guess. It is AMBIGUITY, not absence,
// which is why a NAMED embed is still fine and this test allows one.
//
// It TYPECHECKS, it passes lint, and it fails only against a live database. And
// it failed inside the route's ownership guard, which reads its own error and
// returns 500 — so the whole screen died on a line that looked like every other
// `users(...)` embed in the codebase. Those all hang off `pool_members`, which
// reaches `users` exactly once. That is what made the pattern look safe.
//
// The rule is narrow and mechanical on purpose: a wide "check every embed
// against the schema" test would need the schema, and this one needs nothing.
// =============================================================

import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

import { describe, expect, it } from 'vitest'

const ROOTS = ['app/api', 'lib']
const SKIP = new Set(['node_modules', '.next', '__tests__'])

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of entries) {
    if (SKIP.has(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith('.ts') || full.endsWith('.tsx')) out.push(full)
  }
  return out
}

const FILES = ROOTS.flatMap((r) => walk(join(process.cwd(), r)))

describe('PostgREST embeds only travel along real foreign keys', () => {
  it('finds source files at all — a rename must fail here, not pass silently', () => {
    expect(FILES.length).toBeGreaterThan(50)
  })

  it('never embeds `users` on `pool_entries` without naming the key', () => {
    // Two paths reach `users` from here. Either name the constraint —
    // `users!pool_entries_user_id_fkey(...)` — or read the user separately on
    // `pool_entries.user_id`, which is what the dossier route does.
    const offenders: string[] = []

    for (const file of FILES) {
      const src = readFileSync(file, 'utf8')
      // Comments are stripped first, so the warning NAMING this mistake does
      // not read as the mistake.
      const withoutComments = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')

      // ⚠ ONLY THE SELECT IMMEDIATELY AFTER THE `.from`, not everything up to
      // the next one. A file that queries `pool_entries` and then, further
      // down, embeds users on `pool_members` — which is legal, that table HAS
      // the key — read as an offender when this scanned forward greedily.
      const chunks = withoutComments.split(/\.from\(\s*['"]pool_entries['"]\s*\)/).slice(1)
      for (const chunk of chunks) {
        const sel = chunk.match(/^[\s\S]{0,200}?\.select\(\s*(['"`])([\s\S]*?)\1/)
        // ⚠ `users!some_fkey(...)` IS LEGAL and must not be flagged — the `!`
        // is exactly the disambiguation the error asks for.
        if (sel && /\busers\s*\(/.test(sel[2])) {
          offenders.push(file.replace(process.cwd() + '/', ''))
        }
      }
    }

    expect(offenders).toEqual([])
  })
})
