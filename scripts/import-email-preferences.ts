// =============================================================
// scripts/import-email-preferences.ts — N1, question 5 (2026-10-05)
// =============================================================
// Copies every Resend contact's TOPIC subscriptions into
// public.notification_preferences (channel 'email'), so the preferences page
// reads Postgres instead of asking Resend over the network on every load.
//
// SAFE BY DEFAULT — without --apply it writes nothing to the database.
//
//   npx tsx scripts/import-email-preferences.ts --snapshot <file>       # fetch, report, save
//   npx tsx scripts/import-email-preferences.ts --from <file> --apply   # apply a saved fetch
//   npx tsx scripts/import-email-preferences.ts --apply                 # fetch and apply
//
// ONLY OPT-OUTS ARE STORED. All six topics default to opt_in in Resend
// (verified 2026-10-05), so a missing row means subscribed.
//
// RE-RUN IT AFTER EVERY DEPLOY THAT TOUCHES THIS. Resend is always the newest
// truth for email: the preferences route writes Resend before Postgres, and a
// footer unsubscribe lands in Resend first. So --apply MIRRORS Resend — it
// writes every opt-out and removes any opt-out row for a topic the contact
// has since rejoined. A contact whose fetch failed is left untouched: an error
// is never read as "subscribed to everything".
//
// ⚠ NEWER WINS. A full fetch takes ~45 minutes, and once the webhook is live a
// member can change a topic in that window — after their contact was read.
// Each contact's fetch time is kept, and a row that changed after it is left
// alone, so the import can never overwrite a newer choice with a stale one.
//
// ⚠ The snapshot holds member email addresses. Keep it out of the repo — the
// default path is the OS temp directory — and delete it when you are done.
// ⚠ About 40 minutes for ~4,900 contacts: Resend allows 2 requests a second
// and has no bulk call for topic subscriptions.
// =============================================================

import { readFileSync, writeFileSync } from 'fs'
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

type Snapshot = {
  generatedAt: string
  contactsTotal: number
  failed: string[]
  /** Every contact fetched successfully, with the keys it has opted OUT of. */
  states: Array<{ email: string; optedOut: Key[]; fetchedAt?: string }>
}

const args = process.argv.slice(2)
const flag = (f: string) => args.includes(f)
const value = (f: string) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined)
const APPLY = flag('--apply')
const FROM = value('--from')
const SNAPSHOT = value('--snapshot') ?? join(tmpdir(), `email-prefs-snapshot-${Date.now()}.json`)

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

async function fetchSnapshot(): Promise<Snapshot> {
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
  console.log(`[import] ${contacts.length} contacts, ${idToKey.size} topics`)

  const states: Snapshot['states'] = []
  const failed: string[] = []
  // Pace by when each request STARTS, not by a pause after each reply — a pause
  // stacks on Resend's own latency and roughly doubles the run.
  let nextAt = Date.now()
  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i]
    const wait = nextAt - Date.now()
    if (wait > 0) await sleep(wait)
    nextAt = Date.now() + 510 // Resend: 2 requests a second
    try {
      const r = await resend<{ data: Array<{ id: string; subscription: string }> }>(`/contacts/${c.id}/topics`)
      const optedOut = r.data
        .filter((t) => t.subscription === 'opt_out' && idToKey.has(t.id))
        .map((t) => idToKey.get(t.id) as Key)
      states.push({ email: c.email, optedOut, fetchedAt: new Date().toISOString() })
    } catch (e) {
      failed.push(c.id)
      console.error(`[import] contact ${i + 1} failed: ${e instanceof Error ? e.message : String(e)}`)
    }
    if ((i + 1) % 200 === 0) console.log(`[import] ${i + 1}/${contacts.length} fetched, ${failed.length} failed`)
  }
  return { generatedAt: new Date().toISOString(), contactsTotal: contacts.length, failed, states }
}

function report(s: Snapshot) {
  const withOptOut = s.states.filter((x) => x.optedOut.length > 0)
  console.log(`\n[import] fetched ${s.states.length} of ${s.contactsTotal}; ${s.failed.length} failed`)
  console.log(`[import] contacts with at least one opt-out: ${withOptOut.length}`)
  for (const k of KEYS) console.log(`  ${k.padEnd(14)} ${s.states.filter((x) => x.optedOut.includes(k)).length} opted out`)
}

async function apply(s: Snapshot) {
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
  for (const st of s.states) {
    const userId = byEmail.get(st.email.toLowerCase())
    if (!userId) { unmatched++; continue }
    const at = st.fetchedAt ?? s.generatedAt
    for (const k of KEYS) {
      const cur = existing.get(`${userId}|${k}`)
      // Changed after this contact was read — that change is newer. Leave it.
      if (cur && Date.parse(cur.updated_at) > Date.parse(at)) { newerKept++; continue }
      if (st.optedOut.includes(k)) upserts.push({ user_id: userId, category: k, channel: 'email', enabled: false, updated_at: at })
      else if (cur && cur.enabled === false) rejoined.push({ user_id: userId, category: k })
    }
  }
  console.log(`[import] ${unmatched} contacts match no user (a changed or deleted address) — skipped`)
  console.log(`[import] ${newerKept} rows changed after their contact was read — kept, not overwritten`)
  console.log(`[import] ${upserts.length} opt-out rows to write, ${rejoined.length} to clear (rejoined since)`)

  if (!APPLY) {
    console.log('[import] DRY RUN — nothing written. Re-run with --apply to write.')
    return
  }
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
  const snap: Snapshot = FROM ? JSON.parse(readFileSync(FROM, 'utf8')) : await fetchSnapshot()
  if (!FROM) {
    writeFileSync(SNAPSHOT, JSON.stringify(snap))
    console.log(`[import] snapshot saved to ${SNAPSHOT} — it holds member addresses; delete it when done`)
  }
  report(snap)
  // Applying (or dry-running the apply) needs the table; a bare fetch does not.
  if (APPLY || FROM) await apply(snap)
}

main().catch((e) => {
  console.error('[import] FAILED:', e instanceof Error ? e.message : e)
  process.exit(1)
})
