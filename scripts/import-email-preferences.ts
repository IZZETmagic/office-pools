// =============================================================
// scripts/import-email-preferences.ts — N1, question 5 (2026-10-05)
// =============================================================
// Copies every Resend contact's TOPIC subscriptions into
// public.notification_preferences (channel 'email'), so the preferences page
// reads Postgres instead of asking Resend over the network on every load.
//
// SAFE BY DEFAULT — without --apply it writes nothing to the database.
//
//   npx tsx scripts/import-email-preferences.ts --limit 1000           # fetch the next 1,000
//   npx tsx scripts/import-email-preferences.ts --limit 0 --apply      # apply, once all are in
//   npx tsx scripts/import-email-preferences.ts --fresh --limit 1000   # start a NEW pass
//
// ⭐ RESUMABLE. Each contact is saved to a progress file the moment it is
// fetched, and a run skips every contact already saved — so a run that is
// stopped loses nothing, and the next one carries on. --limit caps a run so it
// finishes cleanly. (The first version saved only at the very end, and lost
// 3,400 fetched contacts when its run hit a time limit.) --apply refuses while
// any contact is still unfetched, unless --allow-partial.
//
// ONLY OPT-OUTS ARE STORED. All six topics default to opt_in in Resend
// (verified 2026-10-05), so a missing row means subscribed.
//
// RE-RUN AFTER EVERY DEPLOY THAT TOUCHES THIS — with --fresh, so every
// contact is read again rather than resumed from an old pass. Resend is always
// the newest truth for email: the preferences route writes Resend before
// Postgres, and a footer unsubscribe lands in Resend first. So --apply MIRRORS
// Resend: it writes every opt-out and removes any opt-out row for a topic the
// contact has since rejoined. A contact whose fetch failed is never saved, so
// an error is never read as "subscribed to everything".
//
// ⚠ NEWER WINS. A full pass takes ~40 minutes, and once the webhook is live a
// member can change a topic in that window — after their contact was read.
// Each contact's fetch time is kept, and a row that changed after it is left
// alone, so the import can never overwrite a newer choice with a stale one.
//
// ⚠ The progress file holds member email addresses. Keep it out of the repo —
// the default path is the OS temp directory — and delete it when you are done.
// ⚠ ~40 minutes for ~4,900 contacts: Resend allows 2 requests a second and
// has no bulk call for topic subscriptions.
// =============================================================

import { appendFileSync, existsSync, readFileSync, unlinkSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { tmpdir } from 'os'
import { createClient } from '@supabase/supabase-js'

;(() => {
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

const KEYS = ['POOL_ACTIVITY', 'PREDICTIONS', 'MATCH_RESULTS', 'LEADERBOARD', 'ADMIN', 'COMMUNITY'] as const
type Key = (typeof KEYS)[number]

// Mapped by NAME because only one topic id is in a local .env.local; every id
// that IS present is cross-checked against this below.
const NAME_TO_KEY: Record<string, Key> = {
  'Pool Activity': 'POOL_ACTIVITY',
  Predictions: 'PREDICTIONS',
  'Match Results': 'MATCH_RESULTS',
  'Leaderboard Updates': 'LEADERBOARD',
  'Admin Notifications': 'ADMIN',
  'Community Topic': 'COMMUNITY',
}

/** One fetched contact — one line of the progress file. */
type State = { id: string; email: string; optedOut: Key[]; fetchedAt: string }

const args = process.argv.slice(2)
const flag = (f: string) => args.includes(f)
const value = (f: string) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined)
const APPLY = flag('--apply')
const ALLOW_PARTIAL = flag('--allow-partial')
const FRESH = flag('--fresh')
const LIMIT = value('--limit') !== undefined ? Number(value('--limit')) : Infinity
const PROGRESS = value('--progress') ?? join(tmpdir(), 'sportpool-email-prefs-progress.ndjson')

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function resend<T>(path: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.resend.com${path}`, {
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
    })
    if (res.status === 429 && attempt < 5) {
      await sleep(2000 * (attempt + 1))
      continue
    }
    if (!res.ok) throw new Error(`${res.status} ${path.replace(/[^/]+\/topics$/, '…/topics')}`)
    return (await res.json()) as T
  }
}

/** Every saved contact. A line torn by a stopped run is skipped, not fatal. */
function loadProgress(): Map<string, State> {
  const done = new Map<string, State>()
  if (!existsSync(PROGRESS)) return done
  for (const line of readFileSync(PROGRESS, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try {
      const s = JSON.parse(line) as State
      if (s.id && s.email && Array.isArray(s.optedOut) && s.fetchedAt) done.set(s.id, s)
    } catch {
      // the last line of a run that was stopped mid-write — that contact is refetched
    }
  }
  return done
}

async function topicMap(): Promise<Map<string, Key>> {
  const topics = await resend<{ data: Array<{ id: string; name: string; default_subscription: string }> }>('/topics')
  const idToKey = new Map<string, Key>()
  for (const t of topics.data) {
    const key = NAME_TO_KEY[t.name]
    if (!key) throw new Error(`Resend topic "${t.name}" maps to no category — refusing to guess`)
    if (t.default_subscription !== 'opt_in') {
      throw new Error(`"${t.name}" defaults to ${t.default_subscription}; a missing row would then be wrong`)
    }
    const envId = process.env[`RESEND_TOPIC_${key}`]
    if (envId && envId !== t.id) throw new Error(`RESEND_TOPIC_${key} disagrees with Resend's "${t.name}"`)
    idToKey.set(t.id, key)
  }
  if (idToKey.size !== KEYS.length) throw new Error(`expected ${KEYS.length} topics, Resend has ${idToKey.size}`)
  return idToKey
}

async function allContacts(): Promise<Array<{ id: string; email: string }>> {
  const contacts: Array<{ id: string; email: string }> = []
  let after: string | undefined
  for (;;) {
    const page = await resend<{ data: Array<{ id: string; email: string }>; has_more: boolean }>(
      `/audiences/${process.env.RESEND_AUDIENCE_ID}/contacts${after ? `?after=${after}` : ''}`,
    )
    contacts.push(...page.data)
    if (!page.has_more || page.data.length === 0) break
    after = page.data[page.data.length - 1].id
  }
  return contacts
}

/** Fetch up to LIMIT contacts not yet saved, appending each the moment it lands. */
async function fetchMore(contacts: Array<{ id: string; email: string }>, done: Map<string, State>) {
  const todo = contacts.filter((c) => !done.has(c.id))
  const batch = todo.slice(0, Number.isFinite(LIMIT) ? LIMIT : todo.length)
  if (batch.length === 0) return 0
  const idToKey = await topicMap()
  console.log(`[import] fetching ${batch.length} of the ${todo.length} not yet saved`)

  let failed = 0
  // Pace by when each request STARTS, not by a pause after each reply — a pause
  // stacks on Resend's own latency and roughly doubles the run.
  let nextAt = Date.now()
  for (let i = 0; i < batch.length; i++) {
    const c = batch[i]
    const wait = nextAt - Date.now()
    if (wait > 0) await sleep(wait)
    nextAt = Date.now() + 510 // Resend: 2 requests a second
    try {
      const r = await resend<{ data: Array<{ id: string; subscription: string }> }>(`/contacts/${c.id}/topics`)
      const optedOut = r.data
        .filter((t) => t.subscription === 'opt_out' && idToKey.has(t.id))
        .map((t) => idToKey.get(t.id) as Key)
      const s: State = { id: c.id, email: c.email, optedOut, fetchedAt: new Date().toISOString() }
      appendFileSync(PROGRESS, JSON.stringify(s) + '\n')
      done.set(c.id, s)
    } catch (e) {
      failed++
      console.error(`[import] a contact failed (will retry next run): ${e instanceof Error ? e.message : String(e)}`)
    }
    if ((i + 1) % 200 === 0) console.log(`[import] ${i + 1}/${batch.length} this run, ${failed} failed`)
  }
  return failed
}

function report(contactsTotal: number, done: Map<string, State>) {
  const states = [...done.values()]
  console.log(`\n[import] saved ${states.length} of ${contactsTotal} contacts — ${contactsTotal - states.length} still to fetch`)
  console.log(`[import] contacts with at least one opt-out: ${states.filter((x) => x.optedOut.length > 0).length}`)
  for (const k of KEYS) console.log(`  ${k.padEnd(14)} ${states.filter((x) => x.optedOut.includes(k)).length} opted out`)
}

async function apply(states: State[]) {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

  // Every user, paged — PostgREST caps a select at 1,000 rows and says nothing.
  const byEmail = new Map<string, string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('users').select('user_id, email').range(from, from + 999)
    if (error) throw new Error(`users: ${error.message}`)
    for (const u of data ?? []) if (u.email) byEmail.set(u.email.toLowerCase(), u.user_id)
    if (!data || data.length < 1000) break
  }

  // Every stored email row, with its time — sparse, so one read. Paged anyway.
  const existing = new Map<string, { enabled: boolean; updated_at: string }>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('notification_preferences')
      .select('user_id, category, enabled, updated_at')
      .eq('channel', 'email')
      .range(from, from + 999)
    if (error) throw new Error(`notification_preferences: ${error.message}`)
    for (const r of data ?? []) existing.set(`${r.user_id}|${r.category}`, { enabled: r.enabled, updated_at: r.updated_at })
    if (!data || data.length < 1000) break
  }

  const upserts: Array<{ user_id: string; category: Key; channel: 'email'; enabled: false; updated_at: string }> = []
  const rejoined: Array<{ user_id: string; category: Key }> = []
  let unmatched = 0
  let newerKept = 0
  for (const st of states) {
    const userId = byEmail.get(st.email.toLowerCase())
    if (!userId) { unmatched++; continue }
    for (const k of KEYS) {
      const cur = existing.get(`${userId}|${k}`)
      // Changed after this contact was read — that change is newer. Leave it.
      if (cur && Date.parse(cur.updated_at) > Date.parse(st.fetchedAt)) { newerKept++; continue }
      if (st.optedOut.includes(k)) upserts.push({ user_id: userId, category: k, channel: 'email', enabled: false, updated_at: st.fetchedAt })
      else if (cur && cur.enabled === false) rejoined.push({ user_id: userId, category: k })
    }
  }
  console.log(`[import] ${unmatched} contacts match no user (a changed or deleted address) — skipped`)
  console.log(`[import] ${newerKept} rows changed after their contact was read — kept, not overwritten`)
  console.log(`[import] ${upserts.length} opt-out rows to write, ${rejoined.length} to clear (rejoined since)`)

  for (let i = 0; i < upserts.length; i += 500) {
    const { error } = await db
      .from('notification_preferences')
      .upsert(upserts.slice(i, i + 500), { onConflict: 'user_id,category,channel' })
    if (error) throw new Error(`upsert: ${error.message}`)
  }
  for (const r of rejoined) {
    const { error } = await db
      .from('notification_preferences')
      .delete()
      .eq('user_id', r.user_id).eq('category', r.category).eq('channel', 'email').eq('enabled', false)
    if (error) throw new Error(`clear: ${error.message}`)
  }
  console.log(`[import] APPLIED — ${upserts.length} written, ${rejoined.length} cleared`)
}

async function main() {
  if (FRESH && existsSync(PROGRESS)) {
    unlinkSync(PROGRESS)
    console.log('[import] --fresh: previous progress discarded, starting a new pass')
  }
  console.log(`[import] progress file: ${PROGRESS} — it holds member addresses; delete it when done`)
  const done = loadProgress()
  const contacts = await allContacts()
  const failed = await fetchMore(contacts, done)
  report(contacts.length, done)

  if (!APPLY) {
    console.log('[import] nothing written to the database. Re-run to fetch more, then --apply.')
    return
  }
  const remaining = contacts.filter((c) => !done.has(c.id)).length
  if ((remaining > 0 || failed > 0) && !ALLOW_PARTIAL) {
    throw new Error(`${remaining} contacts not yet fetched — finish the pass first, or pass --allow-partial`)
  }
  // Only contacts still in the audience: one removed since an earlier run is dropped.
  const live = new Set(contacts.map((c) => c.id))
  await apply([...done.values()].filter((s) => live.has(s.id)))
}

main().catch((e) => {
  console.error('[import] FAILED:', e instanceof Error ? e.message : e)
  process.exit(1)
})
