// =============================================================
// seed-showdown-test-members — seven `ux-` throwaways in Ryan's Showdown pool
// =============================================================
// Ryan, 2026-10-08: seven new members in "Prem 2026/27 Showdown" (DDWRW6SU),
// with faces and picks for the open matchweek. This script does the accounts
// and the joins. The faces are `seed-ux-avatars.ts` and the picks are
// `seed-league-ux-picks.ts`, both of which select by the `ux-` email — so the
// three steps share one filter and none of them can reach a real member.
//
// ⚠⚠ THIS POOL HAS REAL PEOPLE IN IT — Ryan plus three friends. Nothing here
// touches an account that is not one of the seven below, and the pool is never
// added to `seed-league-ux-pools.ts`: that script's teardown deletes EVERY
// membership in its pools.
//
// ------------------------------------------------------------------
// WHY NOT THE JOIN ROUTE
// ------------------------------------------------------------------
// `joinPool` queues a `pool_welcome` (email + push) to the joiner and a
// `member_joined` to the admin. Seven welcomes to made-up mailboxes would
// bounce against the sending reputation, and Ryan would get seven pushes for
// a seed. So the rows are written directly, as `seed-league-ux-pools.ts` does,
// and the one step of a join that matters to Showdown — regenerating the
// fixture list — is called by hand afterwards.
//
// ------------------------------------------------------------------
// WHAT IT CHANGES ON THE POOL
// ------------------------------------------------------------------
//   * The tier cap. The pool is free (10 members); 4 + 7 is 11. Ryan's call
//     (2026-10-08): lift it the way the scratch pools do — `tier_enforced_from`
//     to null. The old value is printed so it can be put back.
//   * The draw. Every UNDRAWN matchweek is rebuilt for 11 entries, so the open
//     week's pairings change for everybody, and 11 is odd, so someone has a bye
//     each week. A week already revealed (`drawn_at`) is never touched.
//
// Email is switched OFF for the seven in every category, so a matchweek
// recap does not go to an address that does not exist. Push needs no switch —
// they have no device.
//
// Idempotent: an account, a membership or an entry that exists is left alone.
//
//   npx tsx scripts/seed-showdown-test-members.ts            # dry run
//   npx tsx scripts/seed-showdown-test-members.ts --apply
// =============================================================

import { readFileSync } from 'fs'
import { dirname, resolve } from 'path'

;(() => {
  // Walk up for `.env.local` — a git worktree has no env file of its own.
  let dir = process.cwd()
  for (;;) {
    try {
      const envContent = readFileSync(resolve(dir, '.env.local'), 'utf8')
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
      return
    } catch {
      const up = dirname(dir)
      if (up === dir) throw new Error('no .env.local in this directory or any above it')
      dir = up
    }
  }
})()

import { createAdminClient } from '../lib/supabase/server'
import { regenerateDuelSchedule } from '../lib/league/duels'

const admin = createAdminClient()
const APPLY = process.argv.includes('--apply')
const TEST_PASSWORD = process.env.UX_TEST_PASSWORD ?? 'SportPoolUX!2026'

/** By id AND code, so a typo in either refuses to run rather than seeding the wrong pool. */
const POOL_ID = '93c4115a-43da-47b7-9c99-463bbd95c053'
const POOL_CODE = 'DDWRW6SU'

/**
 * ⚠ The face comes from a hash of the EMAIL (`seed-ux-avatars.ts`), not the name, so two
 * handles were renamed after their faces were drawn: `chloeb` drew a full beard and is
 * Charlie, `zoem` drew a soul patch and is Zac. The handle is only ever the address.
 */
const TESTERS = [
  { handle: 'liamg',  username: 'Liam G',    full: 'Liam Gallagher' },
  { handle: 'chloeb', username: 'Charlie B', full: 'Charlie Byrne' },
  { handle: 'ravis',  username: 'Ravi S',    full: 'Ravi Shah' },
  { handle: 'norak',  username: 'Nora K',    full: 'Nora Kelly' },
  { handle: 'felixw', username: 'Felix W',   full: 'Felix Weber' },
  { handle: 'zoem',   username: 'Zac M',     full: 'Zac Mitchell' },
  { handle: 'omarh',  username: 'Omar H',    full: 'Omar Haddad' },
] as const

const emailFor = (handle: string) => `ux-${handle}@sportpool.app`

/** Every category migration 168's CHECK allows. A missing row means ENABLED. */
const EMAIL_CATEGORIES = [
  'POOL_ACTIVITY', 'PREDICTIONS', 'MATCH_RESULTS', 'LEADERBOARD', 'ADMIN', 'COMMUNITY', 'GAMIFICATION',
] as const

// ------------------------------------------------------------------ plumbing

let failures = 0
const note = (s: string) => console.log(`    ${s}`)
const ok = (s: string) => console.log(`    ✓ ${s}`)
const bad = (s: string) => { failures++; console.log(`    ✗ ${s}`) }
const head = (s: string) => console.log(`\n${'─'.repeat(74)}\n  ${s}\n${'─'.repeat(74)}`)

// ------------------------------------------------------------------ steps

async function checkPool() {
  head('0. The pool')
  const { data, error } = await admin
    .from('pools')
    .select('pool_id, pool_name, pool_code, league_mode, tier, tier_enforced_from')
    .eq('pool_id', POOL_ID)
    .maybeSingle()
  if (error || !data) throw new Error(`pool ${POOL_ID}: ${error?.message ?? 'not found'}`)
  const p = data as { pool_name: string; pool_code: string; league_mode: string | null; tier: string; tier_enforced_from: string | null }
  if (p.pool_code !== POOL_CODE) throw new Error(`pool ${POOL_ID} has code ${p.pool_code}, expected ${POOL_CODE}`)
  if (p.league_mode !== 'showdown') throw new Error(`pool ${POOL_CODE} is ${p.league_mode}, not showdown`)
  note(`${p.pool_name} (${p.pool_code}) — tier ${p.tier}, cap enforced from ${p.tier_enforced_from ?? 'never'}`)
  return p
}

async function ensureAccounts(): Promise<Map<string, string>> {
  head('1. Seven test accounts')
  const ids = new Map<string, string>()

  for (const t of TESTERS) {
    const email = emailFor(t.handle)
    const { data: existing } = await admin.from('users').select('user_id').eq('email', email).maybeSingle()
    if (existing) {
      ids.set(t.handle, (existing as { user_id: string }).user_id)
      note(`· ${t.username.padEnd(8)} already exists`)
      continue
    }
    if (!APPLY) { note(`would create ${email} (${t.username})`); continue }

    // `email_confirm: true` so nothing is ever sent to this address.
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password: TEST_PASSWORD,
      email_confirm: true,
      user_metadata: { username: t.username, full_name: t.full },
    })
    if (error || !created?.user) { bad(`create ${email}: ${error?.message}`); continue }

    // The auth trigger mirrors the account into public.users — read it back
    // rather than assume, and set the names the trigger may not have.
    const { data: mirrored } = await admin
      .from('users').select('user_id').eq('auth_user_id', created.user.id).maybeSingle()
    if (!mirrored) { bad(`${email}: no public.users row after create`); continue }
    const uid = (mirrored as { user_id: string }).user_id
    const { error: uErr } = await admin.from('users').update({ username: t.username, full_name: t.full }).eq('user_id', uid)
    if (uErr) { bad(`${email}: name: ${uErr.message}`); continue }
    ids.set(t.handle, uid)
    ok(`${t.username.padEnd(8)} ${email}`)
  }
  return ids
}

async function emailOff(ids: Map<string, string>) {
  head('2. Email off for all seven')
  if (!APPLY) { note(`would write ${EMAIL_CATEGORIES.length} opt-outs for each account`); return }
  const rows = [...ids.values()].flatMap((user_id) =>
    EMAIL_CATEGORIES.map((category) => ({ user_id, category, channel: 'email', enabled: false })))
  if (rows.length === 0) return
  const { error } = await admin.from('notification_preferences').upsert(rows, { onConflict: 'user_id,category,channel' })
  if (error) bad(`opt-outs: ${error.message}`)
  else ok(`${rows.length} opt-outs (${ids.size} accounts × ${EMAIL_CATEGORIES.length} categories)`)
}

async function liftCap(pool: { tier: string; tier_enforced_from: string | null }, ids: Map<string, string>) {
  head('3. The member cap')
  if (pool.tier_enforced_from === null) { note('already uncapped'); return }

  const { data: cap } = await admin.rpc('pool_tier_member_cap', { p_tier: pool.tier })
  const { count } = await admin.from('pool_members').select('member_id', { count: 'exact', head: true }).eq('pool_id', POOL_ID)
  const { data: already } = await admin.from('pool_members').select('user_id').eq('pool_id', POOL_ID).in('user_id', [...ids.values()])
  const joining = TESTERS.length - (already?.length ?? 0)
  const after = (count ?? 0) + joining
  if (cap === null || after <= (cap as number)) { note(`${after} members fits the ${pool.tier} cap of ${cap}`); return }

  if (!APPLY) { note(`would lift the cap: ${after} members > ${pool.tier} cap of ${cap}`); return }
  const { error } = await admin.from('pools').update({ tier_enforced_from: null }).eq('pool_id', POOL_ID)
  if (error) { bad(`lift cap: ${error.message}`); return }
  ok(`cap lifted (${after} > ${cap}). To restore: tier_enforced_from = '${pool.tier_enforced_from}'`)
}

async function join(ids: Map<string, string>) {
  head('4. Joining — directly, so no notices are queued')
  for (const t of TESTERS) {
    const userId = ids.get(t.handle)
    if (!userId) { if (APPLY) bad(`${t.username}: no account`); else note(`would join ${t.username}`); continue }

    let memberId: string | null = null
    const { data: m } = await admin.from('pool_members')
      .select('member_id').eq('pool_id', POOL_ID).eq('user_id', userId).maybeSingle()
    if (m) memberId = (m as { member_id: string }).member_id
    else {
      if (!APPLY) { note(`would join ${t.username}`); continue }
      const { data: created, error } = await admin.from('pool_members')
        .insert({ pool_id: POOL_ID, user_id: userId, role: 'player' })
        .select('member_id').single()
      if (error || !created) { bad(`join ${t.username}: ${error?.message}`); continue }
      memberId = (created as { member_id: string }).member_id
    }

    const { data: e } = await admin.from('pool_entries')
      .select('entry_id').eq('member_id', memberId).is('retired_at', null).limit(1).maybeSingle()
    if (e) { note(`· ${t.username.padEnd(8)} already in`); continue }
    if (!APPLY) { note(`would create ${t.username}'s entry`); continue }
    const { error: eErr } = await admin.from('pool_entries')
      .insert({ member_id: memberId, entry_name: t.username, entry_number: 1 })
    if (eErr) { bad(`entry for ${t.username}: ${eErr.message}`); continue }
    ok(`${t.username.padEnd(8)} joined`)
  }
}

async function redraw() {
  head('5. The fixture list')
  if (!APPLY) { note('would regenerate every undrawn matchweek'); return }
  const sched = await regenerateDuelSchedule(admin, POOL_ID)
  if (sched.error) { bad(`duel schedule: ${sched.error}`); return }
  ok(`regenerated: ${JSON.stringify(sched)}`)
}

async function main() {
  console.log(`\n${'='.repeat(74)}`)
  console.log(`  Seven test members for ${POOL_CODE}`)
  console.log(`  ${APPLY ? 'APPLY — this writes to production' : 'DRY RUN — nothing is written. Add --apply.'}`)
  console.log('='.repeat(74))

  const pool = await checkPool()
  const ids = await ensureAccounts()
  await emailOff(ids)
  await liftCap(pool, ids)
  await join(ids)
  await redraw()

  console.log(`\n${failures === 0 ? '✓ done' : `✗ ${failures} problem(s)`}`)
  if (APPLY && failures === 0) {
    console.log('  next: npx tsx scripts/seed-ux-avatars.ts --apply')
    console.log('        npx tsx scripts/seed-league-ux-picks.ts --apply')
  }
  console.log()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
