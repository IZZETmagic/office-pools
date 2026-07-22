/**
 * POST-TOURNAMENT FEEDBACK SURVEY — PRE-FLIGHT CHECK. READ-ONLY, sends nothing.
 *
 * Run this immediately before firing either survey send from the super-admin
 * Templates tab. It answers the two questions that can quietly ruin the send:
 *
 *   1. Who actually resolves? `lib/email/segments.ts` used to truncate at PostgREST's
 *      1,000-row cap, so the player survey resolved to 146 recipients out of 3,958
 *      and a dry run reported that number as if it were the whole audience.
 *   2. Are the Tally forms live? Both survey CTAs pointed at DRAFT forms that
 *      returned 404 — a send would have shipped ~4k dead links.
 *
 *   npx tsx scripts/preflight-feedback-survey.ts
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { querySegment } from '../lib/email/segments'

;(() => {
  const envPath = resolve(process.cwd(), '.env.local')
  const envContent = readFileSync(envPath, 'utf8')
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

// Keep in sync with the constants in lib/email/templates.ts.
const SURVEY_URLS = {
  'Pool admin survey': 'https://tally.so/r/Y59YEN',
  'Player survey': 'https://tally.so/r/RGjJKK',
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function exactCount(table: string, apply?: (q: any) => any): Promise<number> {
  const base = supabase.from(table).select('*', { count: 'exact', head: true })
  const { count, error } = await (apply ? apply(base) : base)
  if (error) throw new Error(`count(${table}) failed: ${error.message}`)
  return count ?? 0
}

async function main() {
  let failures = 0
  const fail = (msg: string) => {
    failures++
    console.log(`  ✗ ${msg}`)
  }
  const pass = (msg: string) => console.log(`  ✓ ${msg}`)

  console.log('\n=== Source tables (exact counts) ===')
  const [users, pools, submittedEntries] = await Promise.all([
    exactCount('users', (q) => q.not('email', 'is', null)),
    exactCount('pools'),
    exactCount('pool_entries', (q) => q.eq('has_submitted_predictions', true)),
  ])
  console.log(`  users with email      : ${users}`)
  console.log(`  pools                 : ${pools}`)
  console.log(`  submitted entries     : ${submittedEntries}`)

  console.log('\n=== Segments as the send route will resolve them ===')
  const [admins, players] = await Promise.all([
    querySegment(supabase, 'pool_admins'),
    querySegment(supabase, 'past_predictors_non_admin'),
  ])
  console.log(`  pool_admins               : ${admins.length}`)
  console.log(`  past_predictors_non_admin : ${players.length}`)
  console.log(`  total emails             : ${admins.length + players.length}`)

  console.log('\n=== Checks ===')

  // Truncation canary. Any segment landing on an exact multiple of the PostgREST page
  // size is the signature of a capped fetch, not a coincidence worth trusting.
  for (const [name, list] of [
    ['pool_admins', admins],
    ['past_predictors_non_admin', players],
  ] as const) {
    if (list.length > 0 && list.length % 1000 === 0) {
      fail(`${name} resolved to exactly ${list.length} — looks truncated, not complete`)
    } else {
      pass(`${name} count is not a page-size multiple (${list.length})`)
    }
  }

  // Nobody should get both surveys.
  const adminEmails = new Set(admins.map((u) => u.email.toLowerCase()))
  const overlap = players.filter((u) => adminEmails.has(u.email.toLowerCase()))
  if (overlap.length > 0) {
    fail(`${overlap.length} recipients would get BOTH surveys (e.g. ${overlap[0].email})`)
  } else {
    pass('no recipient appears in both segments')
  }

  // Duplicate addresses inside one segment = duplicate emails to the same person.
  for (const [name, list] of [
    ['pool_admins', admins],
    ['past_predictors_non_admin', players],
  ] as const) {
    const unique = new Set(list.map((u) => u.email.toLowerCase()))
    if (unique.size !== list.length) {
      fail(`${name} has ${list.length - unique.size} duplicate address(es)`)
    } else {
      pass(`${name} has no duplicate addresses`)
    }
  }

  // Every CTA in the emails points at these. A DRAFT Tally form 404s.
  console.log('\n=== Survey links ===')
  for (const [label, url] of Object.entries(SURVEY_URLS)) {
    try {
      const res = await fetch(url, { redirect: 'follow' })
      if (res.ok) {
        pass(`${label} is live (${res.status}) — ${url}`)
      } else {
        fail(`${label} returned ${res.status} — ${url} (form still DRAFT?)`)
      }
    } catch (err) {
      fail(`${label} unreachable — ${url} (${(err as Error).message})`)
    }
  }

  console.log(
    failures === 0
      ? '\nPRE-FLIGHT PASSED — safe to send.\n'
      : `\nPRE-FLIGHT FAILED — ${failures} problem(s). Do NOT send.\n`
  )
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
