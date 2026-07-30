/**
 * POST-TOURNAMENT FEEDBACK FOLLOW-UP — TRANCHED SENDER.
 *
 * Sends the two follow-up emails (admin + player) to the same segments as the surveys,
 * split into N tranches spread over ~an hour. Tranching smooths (a) Resend load and
 * (b) the mail-scanner edge-request spike a single 4k blast causes.
 *
 * SAFE BY DEFAULT: dry run unless `--run` is passed. A durable JSONL ledger records every
 * accepted send so a re-run NEVER double-sends and can resume after an interruption.
 *
 *   npx tsx scripts/send-followup-tranches.ts                 # dry run: schedule + samples
 *   npx tsx scripts/send-followup-tranches.ts --run           # SEND, 6 tranches / 10 min
 *   npx tsx scripts/send-followup-tranches.ts --run --tranches=6 --interval-min=10
 *   npx tsx scripts/send-followup-tranches.ts --run --only=admin
 */
import { readFileSync, appendFileSync, existsSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { querySegment } from '../lib/email/segments'
import { poolAdminFollowupTemplate, playerFollowupTemplate } from '../lib/email/templates'

;(() => {
  const envContent = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of envContent.split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const i = t.indexOf('='); if (i === -1) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v
  }
})()

// --- args ---
const args = process.argv.slice(2)
const RUN = args.includes('--run')
const TRANCHES = Number((args.find((a) => a.startsWith('--tranches=')) || '').split('=')[1] || 6)
const INTERVAL_MIN = Number((args.find((a) => a.startsWith('--interval-min=')) || '').split('=')[1] || 10)
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || 'all'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'
const FROM = process.env.RESEND_FROM_EMAIL || 'SportPool <notifications@sportpool.io>'
const LEDGER = resolve(process.cwd(), 'scripts/.followup_send_ledger.jsonl')
const BATCH = 100
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const resend = new Resend(process.env.RESEND_API_KEY!)

function firstNameOf(fullName?: string | null, username?: string | null): string {
  if (fullName) { const f = fullName.trim().split(/\s+/)[0]; if (f) return f }
  return username || 'there'
}

type Kind = 'admin' | 'player'
type Recipient = { email: string; firstName: string; kind: Kind }

function render(r: Recipient): { subject: string; html: string } {
  const fn = r.kind === 'admin' ? poolAdminFollowupTemplate : playerFollowupTemplate
  return fn({ firstName: r.firstName, dashboardUrl: `${APP_URL}/dashboard` })
}

function loadLedgerKeys(): Set<string> {
  const seen = new Set<string>()
  if (!existsSync(LEDGER)) return seen
  for (const line of readFileSync(LEDGER, 'utf8').split('\n')) {
    if (!line.trim()) continue
    try { const o = JSON.parse(line); if (o.status === 'accepted') seen.add(`${o.kind}:${o.email.toLowerCase()}`) } catch { /* skip */ }
  }
  return seen
}

async function buildRecipients(): Promise<Recipient[]> {
  const out: Recipient[] = []
  if (ONLY === 'all' || ONLY === 'admin') {
    for (const u of await querySegment(sb, 'pool_admins'))
      out.push({ email: u.email, firstName: firstNameOf(u.full_name, u.username), kind: 'admin' })
  }
  if (ONLY === 'all' || ONLY === 'player') {
    for (const u of await querySegment(sb, 'past_predictors_non_admin'))
      out.push({ email: u.email, firstName: firstNameOf(u.full_name, u.username), kind: 'player' })
  }
  // stable order → deterministic tranche assignment
  out.sort((a, b) => (a.kind + a.email).localeCompare(b.kind + b.email))
  return out
}

// Round-robin so each tranche gets a proportional mix of admin + player.
function splitTranches(recips: Recipient[], n: number): Recipient[][] {
  const t: Recipient[][] = Array.from({ length: n }, () => [])
  const admins = recips.filter((r) => r.kind === 'admin')
  const players = recips.filter((r) => r.kind === 'player')
  admins.forEach((r, i) => t[i % n].push(r))
  players.forEach((r, i) => t[i % n].push(r))
  return t
}

async function sendTranche(idx: number, recips: Recipient[]): Promise<{ sent: number; failed: number }> {
  let sent = 0, failed = 0
  for (let i = 0; i < recips.length; i += BATCH) {
    const chunk = recips.slice(i, i + BATCH)
    const payload = chunk.map((r) => {
      const { subject, html } = render(r)
      return { from: FROM, to: [r.email], subject, html, tags: [{ name: 'category', value: `followup_${r.kind}` }] }
    })
    try {
      const { error } = await resend.batch.send(payload)
      if (error) throw error
      chunk.forEach((r) => appendFileSync(LEDGER, JSON.stringify({ kind: r.kind, email: r.email, tranche: idx, status: 'accepted', at: new Date().toISOString() }) + '\n'))
      sent += chunk.length
    } catch (e) {
      // Batch failed — fall back to individual sends so one bad address doesn't sink the chunk.
      for (const r of chunk) {
        try {
          const { subject, html } = render(r)
          const { error } = await resend.emails.send({ from: FROM, to: [r.email], subject, html, tags: [{ name: 'category', value: `followup_${r.kind}` }] })
          if (error) throw error
          appendFileSync(LEDGER, JSON.stringify({ kind: r.kind, email: r.email, tranche: idx, status: 'accepted', at: new Date().toISOString() }) + '\n')
          sent++
        } catch (err) {
          appendFileSync(LEDGER, JSON.stringify({ kind: r.kind, email: r.email, tranche: idx, status: 'failed', error: String((err as Error)?.message || err), at: new Date().toISOString() }) + '\n')
          failed++
        }
      }
    }
    await sleep(150) // stay well under Resend's 10 req/s
  }
  return { sent, failed }
}

async function main() {
  const all = await buildRecipients()
  const seen = loadLedgerKeys()
  const pending = all.filter((r) => !seen.has(`${r.kind}:${r.email.toLowerCase()}`))
  const tranches = splitTranches(pending, TRANCHES)

  const nAdmin = pending.filter((r) => r.kind === 'admin').length
  const nPlayer = pending.filter((r) => r.kind === 'player').length
  console.log(`\n=== Follow-up tranched send ${RUN ? '(LIVE)' : '(DRY RUN — nothing sent)'} ===`)
  console.log(`audience: ${nAdmin} admin + ${nPlayer} player = ${pending.length} pending`)
  if (seen.size) console.log(`ledger: ${seen.size} already sent (skipped)`)
  console.log(`plan: ${TRANCHES} tranches, ${INTERVAL_MIN} min apart → finishes ~${(TRANCHES - 1) * INTERVAL_MIN} min from start`)
  tranches.forEach((t, i) => {
    const a = t.filter((r) => r.kind === 'admin').length
    const p = t.filter((r) => r.kind === 'player').length
    console.log(`  tranche ${i + 1}  (t+${i * INTERVAL_MIN}m):  ${a} admin + ${p} player = ${t.length}`)
  })

  if (!RUN) {
    // render one of each so the exact HTML is inspectable
    const sampleA = all.find((r) => r.kind === 'admin')
    const sampleP = all.find((r) => r.kind === 'player')
    const dir = process.env.PREVIEW_DIR
    if (dir && sampleA && sampleP) {
      writeFileSync(`${dir}/followup_admin.html`, render(sampleA).html)
      writeFileSync(`${dir}/followup_player.html`, render(sampleP).html)
      console.log(`\nrendered samples for ${sampleA.firstName} (admin) / ${sampleP.firstName} (player) → ${dir}`)
    }
    console.log('\nDRY RUN complete. Re-run with --run to send.\n')
    return
  }

  console.log(`\nledger: ${LEDGER}\nstarting live send...\n`)
  let totalSent = 0, totalFailed = 0
  for (let i = 0; i < tranches.length; i++) {
    if (tranches[i].length === 0) continue
    const { sent, failed } = await sendTranche(i + 1, tranches[i])
    totalSent += sent; totalFailed += failed
    console.log(`[${new Date().toISOString()}] tranche ${i + 1}/${tranches.length} done: sent=${sent} failed=${failed}  (running: ${totalSent} sent / ${totalFailed} failed)`)
    if (i < tranches.length - 1) await sleep(INTERVAL_MIN * 60 * 1000)
  }
  console.log(`\nALL TRANCHES COMPLETE: ${totalSent} sent, ${totalFailed} failed. Ledger: ${LEDGER}`)
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1) })
