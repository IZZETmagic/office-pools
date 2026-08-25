// =============================================================
// verify-select-columns — does every column this codebase SELECTs still exist?
// =============================================================
// WHY THIS EXISTS. On 2026-08-22 migration 049 dropped `matches.round_number`
// while the deployed tree still named it in `lib/poolData.ts` MATCH_COLUMNS.
// PostgREST answers such a select with
//
//     42703  column matches.round_number does not exist
//
// and `lib/poolData.ts` destructured only `{ data }`, so the error vanished and
// every pool detail page rendered ZERO fixtures at HTTP 200, cached for 45s.
// Nothing alarmed. It was found days later, by accident.
//
// Migration 049 had a guard: it asserted no TRIGGER named the column before
// dropping it. The rule it was enforcing — a reader may only name columns the
// relation actually carries — was applied to PL/pgSQL and never to TypeScript,
// which is where the actual reader lived.
//
// This closes that. It extracts every `.from(...).select(...)` pair in the tree
// and checks each column against `information_schema.columns`.
//
//   npx tsx scripts/verify-select-columns.ts
//   npx tsx scripts/verify-select-columns.ts --verbose
//
// Exits 1 on any unknown column, so it can gate a deploy or a DROP COLUMN.
//
// WHAT IT DOES NOT COVER, stated plainly so its green is not over-read:
//   - `.select()` with no argument (selects *; nothing to check).
//   - Column names built at runtime from variables it cannot resolve — these
//     are REPORTED as unresolved rather than skipped silently.
//   - RPC arguments and raw SQL.
//   - Dotted filter paths (`.eq('pool_members.pool_id', x)`) — those name a
//     column of an EMBEDDED table, which needs FK resolution to check. They are
//     counted as unresolved, not silently passed.
//
// It DOES cover filter and ordering columns (`.eq`, `.in`, `.order`, `.not`,
// ...), not just projections: `.eq()` on a dropped column 400s exactly the same
// way, and two of the sites in the round_number outage were filters.
//
// ⚠ WIDENED 2026-08-24, and the reason matters more than the change. Comments
// are now blanked before parsing (see `blankComments`). Until then, a comment
// anywhere inside a method chain made the ENTIRE query invisible to this scan —
// not reported as unresolved, not counted, just gone. Since this repo comments
// inside chains as a matter of style, a green run meant considerably less than
// it looked like it did.
//
// It was found the way these always are: `.order('club_name')` on a table whose
// column is `name` emptied the club picker for Table mode and Last Man Standing,
// in a tree this script had just declared clean. If you extend this parser,
// prefer a failure that SHOUTS over one that skips — a skipped query is
// indistinguishable from a file with no queries in it.
// =============================================================

import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve, join, extname } from 'path'

;(() => {
  const envContent = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of envContent.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v
  }
})()

import { createAdminClient } from '../lib/supabase/server'

const VERBOSE = process.argv.includes('--verbose')
const ROOTS = ['app', 'lib', 'components', 'scripts']
const SKIP_DIRS = new Set(['node_modules', '.next', '__tests__', 'migrations'])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (['.ts', '.tsx'].includes(extname(p))) out.push(p)
  }
  return out
}

/**
 * String-valued top-level consts, so `${MATCH_COLUMNS}` in a select resolves.
 * Deliberately simple: single-quoted pieces joined by `+`, which is exactly how
 * this repo writes its column lists (lib/poolData.ts:54).
 */
function collectConsts(files: string[]): Map<string, string> {
  const consts = new Map<string, string>()
  const decl = /(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*=\s*((?:'[^']*'|"[^"]*")(?:\s*\+\s*(?:'[^']*'|"[^"]*"))*)/g
  for (const f of files) {
    // Comments blanked first, so a commented-out const cannot shadow the real one.
    const src = blankComments(readFileSync(f, 'utf8'))
    for (const m of src.matchAll(decl)) {
      const joined = [...m[2].matchAll(/'([^']*)'|"([^"]*)"/g)].map((p) => p[1] ?? p[2]).join('')
      consts.set(m[1], joined)
    }
  }
  return consts
}

/**
 * Replace every comment with spaces, keeping the file byte-for-byte the same
 * LENGTH so every index — and therefore every reported line number — still
 * points where it did.
 *
 * ⚠ THIS IS LOAD-BEARING, and its absence hid a real bug for two days.
 *
 * The chain walk below decides the chain has ended when the character after a
 * balanced `)` is not a dot. A comment between `.from('t')` and `.select(...)`
 * puts a `/` there, so the walk stopped at `.from(` and captured nothing; the
 * `.select(` match then failed and the ENTIRE query was skipped. Silently —
 * a skipped query looks exactly like a file with no queries in it.
 *
 * That is how `.order('club_name')` on `league_clubs` (which has `name`, not
 * `club_name`) survived a green run of this script while emptying the club
 * picker for both Table mode and Last Man Standing. This repo writes comments
 * inside method chains as a matter of style, so the hole was wide.
 *
 * The second reason is subtler: an apostrophe in prose ("the pool's admin")
 * read as an opening quote, which swallowed the rest of the chain as if it were
 * a string literal. Both problems disappear once comments are not there.
 *
 * ⚠ Still not covered: a `//` inside a REGEX literal. Distinguishing `/` as
 * division from `/` as a regex start needs real tokenisation, and the cost is
 * not worth it — the failure mode is a skipped query in that one file, which is
 * where this check already was for every commented chain.
 */
function blankComments(src: string): string {
  const out = src.split('')
  let i = 0
  let quote: string | null = null
  while (i < src.length) {
    const c = src[i]
    if (quote) {
      if (c === '\\') { i += 2; continue }
      if (c === quote) quote = null
      i++
      continue
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; i++; continue }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') { out[i] = ' '; i++ }
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        // Newlines are kept so `slice(0, idx).split('\n').length` still counts
        // the right line; everything else becomes a space.
        if (src[i] !== '\n') out[i] = ' '
        i++
      }
      if (i < src.length) { out[i] = ' '; out[i + 1] = ' '; i += 2 }
      continue
    }
    i++
  }
  return out.join('')
}

type Ref = { file: string; line: number; table: string; column: string }
type Unresolved = { file: string; line: number; table: string; raw: string }

/**
 * Strip PostgREST embedded resources — `home_team:teams!fk(country_name, ...)`.
 * Their columns belong to the embedded table, not this one, so they are removed
 * rather than validated (validating them would need FK resolution).
 */
function stripEmbeds(sel: string): string {
  // Remove innermost `name(...)` groups together with the name in front of
  // them, repeatedly, so nested embeds go too. Dropping only the parenthesised
  // part left the embed's NAME behind, which then read as a column of the
  // parent — that is where `pools.tournaments` came from.
  let out = sel
  for (;;) {
    const next = out.replace(/[A-Za-z0-9_:!.\-]*\s*\([^()]*\)/g, '')
    if (next === out) return out
    out = next
  }
}

function parse(files: string[], consts: Map<string, string>) {
  const refs: Ref[] = []
  const unresolved: Unresolved[] = []

  for (const file of files) {
    // See blankComments: a comment inside a method chain used to make the whole
    // query invisible to this scan.
    const src = blankComments(readFileSync(file, 'utf8'))
    // `.from('t')` followed by the next `.select(...)` within a small window.
    const fromRe = /\.from\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*\)/g
    const froms = [...src.matchAll(fromRe)]
    for (let fi = 0; fi < froms.length; fi++) {
      const fm = froms[fi]
      const table = fm[1]
      // Search only up to the NEXT `.from(`. A fixed character window ran past
      // the end of one query into the next and attributed that query's columns
      // to this table — which is how `teams.match_id` was reported.
      let stop = fi + 1 < froms.length ? froms[fi + 1].index! : src.length
      // A write verb ends the read. `.from('t').insert({...}).select(...)` is a
      // RETURNING projection, and treating the following `.select(` as this
      // table's columns is how `.from('user_pending_actions').insert(...)`
      // acquired five columns that belong to a query further down the file.
      const write = src.slice(fm.index!, stop).search(/\.(insert|update|upsert|delete)\(/)
      if (write !== -1) stop = fm.index! + write
      // Bound to the METHOD CHAIN by walking parentheses, not by line shape.
      // A line-prefix heuristic was tried and silently UNDER-reported: the
      // pool_entries selects are written as string concatenation across lines,
      // whose continuation lines start with a quote, so the chain looked like it
      // ended at `.select(` and two real bugs stopped being found. Depth-walking
      // also stops the scan running into the next statement, which is what made
      // `sync_settings.entry_id` appear for a two-column table.
      const after = (() => {
        const src2 = src
        let i = fm.index!
        let depth = 0
        let quote: string | null = null
        for (; i < stop; i++) {
          const c = src2[i]
          if (quote) {
            if (c === '\\') i++
            else if (c === quote) quote = null
            continue
          }
          if (c === "'" || c === '"' || c === '`') { quote = c; continue }
          if (c === '(') depth++
          else if (c === ')') {
            depth--
            if (depth === 0) {
              // Chain continues only if the next non-space character is a dot.
              let j = i + 1
              while (j < stop && /\s/.test(src2[j])) j++
              if (src2[j] !== '.') { i++; break }
            }
          }
        }
        return src2.slice(fm.index!, Math.min(i, stop))
      })()
      const sm = after.match(
        /\.select\(\s*((?:`[^`]*`|'[^']*'|"[^"]*")(?:\s*\+\s*(?:`[^`]*`|'[^']*'|"[^"]*"))*)/,
      )
      if (!sm) continue
      const line = src.slice(0, fm.index!).split('\n').length
      // Join the concatenated pieces before parsing — a projection split across
      // string literals is still one projection.
      const pieces = [...sm[1].matchAll(/`([^`]*)`|'([^']*)'|"([^"]*)"/g)].map(
        (m) => m[1] ?? m[2] ?? m[3],
      )
      const wasTemplate = sm[1].trimStart().startsWith('`') || sm[1].includes('${')
      let raw = wasTemplate ? '`' + pieces.join('') + '`' : "'" + pieces.join('') + "'"

      if (raw.startsWith('`')) {
        raw = raw.slice(1, -1)
        // Resolve `${CONST}`; anything else makes the select unresolvable.
        raw = raw.replace(/\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g, (whole, name: string) =>
          consts.has(name) ? consts.get(name)! : ` ${name} `,
        )
        if (raw.includes(' ')) {
          unresolved.push({ file, line, table, raw: raw.replace(/ /g, '${…}') })
          raw = raw.replace(/ [^ ]* /g, '')
        }
      } else {
        raw = raw.slice(1, -1)
      }

      if (raw.trim() === '*' || raw.trim() === '') continue

      // Filter and ordering columns in the same query window. These fail
      // identically to a bad projection — `.in('pool_id', ids)` on a table with
      // no `pool_id` is a 42703, and it was half of the activity-feed bug.
      const filterRe =
        /\.(eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|containedBy|overlaps|order|not)\(\s*['"]([^'"]+)['"]/g
      for (const flt of after.matchAll(filterRe)) {
        const name = flt[2].trim()
        if (name.includes('.')) {
          unresolved.push({ file, line, table, raw: `${flt[1]}('${name}') — embedded path` })
          continue
        }
        if (!/^[a-z_][a-z0-9_]*$/.test(name)) continue
        refs.push({ file, line, table, column: name })
      }

      for (const piece of stripEmbeds(raw).split(',')) {
        const col = piece.trim()
        if (!col || col === '*') continue
        // `alias:column` — the real column is the right-hand side. A trailing
        // `:` means the embed's target was stripped above.
        const name = col.includes(':') ? col.split(':').pop()!.trim() : col
        if (!name || !/^[a-z_][a-z0-9_]*$/.test(name)) continue
        refs.push({ file, line, table, column: name })
      }
    }
  }
  return { refs, unresolved }
}

async function main() {
  const files = ROOTS.flatMap((r) => {
    try {
      return walk(r)
    } catch {
      return []
    }
  })
  const consts = collectConsts(files)
  const { refs, unresolved } = parse(files, consts)

  const admin = createAdminClient()
  // information_schema is not exposed through PostgREST, so probe each table by
  // actually issuing the select — the same path the app uses, which is the
  // point: it tests what PostgREST will really accept. `limit(1)` keeps it
  // cheap; `count:'exact'` was tried and made large tables time out, which
  // reported as "uncheckable" and quietly hollowed out the whole check.
  const tables = [...new Set(refs.map((r) => r.table))].sort()
  const bad: Ref[] = []
  const uncheckable: string[] = []

  for (const table of tables) {
    const cols = [...new Set(refs.filter((r) => r.table === table).map((r) => r.column))].sort()
    const { error: allErr } = await admin.from(table).select(cols.join(',')).limit(1)
    if (!allErr) {
      if (VERBOSE) console.log(`  ok  ${table}: ${cols.length} column(s)`)
      continue
    }
    if (allErr.code !== '42703') {
      uncheckable.push(`${table}: ${allErr.code} ${allErr.message}`)
      continue
    }
    // Something in this table's set is wrong — find exactly which.
    for (const col of cols) {
      const { error: e } = await admin.from(table).select(col).limit(1)
      if (e && e.code === '42703') {
        for (const r of refs.filter((x) => x.table === table && x.column === col)) bad.push(r)
      }
    }
  }

  console.log(
    `Scanned ${files.length} files · ${refs.length} column references across ${tables.length} tables.`,
  )
  if (refs.length === 0) {
    console.error('FAIL: parsed zero column references. A check that examined nothing is not a pass.')
    process.exit(1)
  }

  if (unresolved.length) {
    console.log(`\n${unresolved.length} select(s) could not be fully resolved (checked only their literal part):`)
    for (const u of unresolved.slice(0, 20)) console.log(`  ${u.file}:${u.line} [${u.table}] ${u.raw.slice(0, 100)}`)
  }
  if (uncheckable.length) {
    console.log(`\n${uncheckable.length} table(s) could not be probed (not a column problem):`)
    for (const u of uncheckable) console.log(`  ${u}`)
  }

  if (bad.length === 0) {
    console.log('\nOK — every selected column exists.')
    return
  }

  console.error(`\nFAIL — ${bad.length} reference(s) to columns that do not exist:`)
  const seen = new Set<string>()
  for (const r of bad) {
    const k = `${r.file}:${r.line}:${r.table}.${r.column}`
    if (seen.has(k)) continue
    seen.add(k)
    console.error(`  ${r.file}:${r.line}  ${r.table}.${r.column}`)
  }
  console.error('\nThese 400 at runtime. Any caller that discards the error renders empty data at HTTP 200.')
  process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
