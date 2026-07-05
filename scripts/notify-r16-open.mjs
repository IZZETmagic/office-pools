// One-off: "Round of 16 is now open" email to members of the 194 progressive
// pools bulk-opened on 2026-07-04 (deadline 2pm ADT / 17:00 UTC, first R16 kickoff).
//
// Faithful reproduction of lib/email/templates.ts roundOpenTemplate + baseTemplate,
// with the deadline pinned to America/Halifax so it reads "2:00 PM ADT" regardless
// of machine timezone. Targets EXACTLY the 194 pools opened by this operation
// (round_16 / state=open / deadline=17:00Z / opened_by=Ryan), so the 64 pools that
// admins opened themselves are NOT re-emailed.
//
// DRY RUN by default. Set SEND=1 to actually send. Requires RESEND_TOPIC_POOL_ACTIVITY
// for the real send so Resend honors "Pool Activity" email opt-outs.
//
//   node scripts/notify-r16-open.mjs           # dry run: stats + sample HTML
//   SEND=1 node scripts/notify-r16-open.mjs     # real send

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

// ---- load .env.local (same loader style as scripts/send-followup-email.ts) ----
const envPath = resolve(process.cwd(), '.env.local')
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const t = line.trim()
  if (!t || t.startsWith('#')) continue
  const i = t.indexOf('=')
  if (i === -1) continue
  const k = t.slice(0, i).trim()
  let v = t.slice(i + 1).trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!process.env[k]) process.env[k] = v
}

const SEND = process.env.SEND === '1'
const FORCE = process.env.FORCE === '1'
const MARKER = resolve(process.cwd(), 'scripts/.notify-r16-open.sent')

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM = process.env.RESEND_FROM_EMAIL || 'Sport Pool <notifications@sportpool.io>'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'
const TOPIC_ID = process.env.RESEND_TOPIC_POOL_ACTIVITY || null

// ---- constants for THIS send ----
const DEADLINE = '2026-07-04T17:00:00Z'          // 2:00 PM ADT, first R16 kickoff
const OPENED_BY = '059bda58-a237-4dec-91d5-4dfdaa62b72d' // IZZETmagic / Ryan
const ROUND_KEY = 'round_16'
const ROUND_NAME = 'Round of 16'
const CHUNK = 100
const CHUNK_DELAY_MS = 700

if (!SUPABASE_URL || !SERVICE_ROLE) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
if (!RESEND_API_KEY) { console.error('Missing RESEND_API_KEY'); process.exit(1) }

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } })
const resend = new Resend(RESEND_API_KEY)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ================= templates (verbatim from lib/email/templates.ts) =================
function baseTemplate({ preheader, heading, body, ctaText, ctaUrl }) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <span style="display:none;max-height:0;overflow:hidden;">${preheader}</span>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#16a34a,#15803d);padding:24px 32px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.025em;">Sport Pool</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#171717;font-size:18px;font-weight:600;">${heading}</h2>
          ${body}
          ${ctaText && ctaUrl ? `
          <div style="text-align:center;margin:24px 0;">
            <a href="${ctaUrl}" style="display:inline-block;padding:12px 32px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">${ctaText}</a>
          </div>` : ''}
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #e5e5e5;text-align:center;">
          <p style="margin:0;color:#a3a3a3;font-size:12px;line-height:1.5;">
            <a href="${APP_URL}" style="color:#a3a3a3;text-decoration:none;">Sport Pool</a> &middot;
            <a href="${APP_URL}/profile?tab=settings" style="color:#a3a3a3;text-decoration:none;">Notification Settings</a> &middot;
            <a href="${APP_URL}/profile?tab=settings" style="color:#a3a3a3;text-decoration:none;">Unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

function roundOpenTemplate({ userName, poolName, roundName, deadline, matchCount, poolUrl }) {
  const deadlineFormatted = new Date(deadline).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    timeZone: 'America/Halifax', // pin to ADT -> "Sat, Jul 4, 2:00 PM ADT"
  })
  return {
    subject: `${roundName} predictions now open - ${poolName}`,
    html: baseTemplate({
      preheader: `${roundName} is ready! Make your predictions for ${matchCount} matches.`,
      heading: `${roundName} Predictions Open!`,
      body: `
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Hi ${userName},</p>
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">The <strong>${roundName}</strong> is now open for predictions in <strong>${poolName}</strong>!</p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="color:#166534;margin:0 0 8px;font-size:14px;font-weight:600;">${matchCount} matches to predict</p>
          <p style="color:#166534;margin:0;font-size:13px;">Deadline: ${deadlineFormatted}</p>
        </div>
        <p style="color:#525252;line-height:1.6;margin:0;">Head over to the pool and make your predictions before the deadline!</p>
      `,
      ctaText: 'Make Predictions',
      ctaUrl: poolUrl,
    }),
  }
}
// ====================================================================================

async function main() {
  if (SEND && !FORCE && existsSync(MARKER)) {
    console.error(`Refusing to send: ${MARKER} exists (already sent). Set FORCE=1 to override.`)
    process.exit(1)
  }

  // 1) Exactly the 194 pools opened by this operation
  const { data: poolRows, error: poolErr } = await supabase
    .from('pool_round_states')
    .select('pool_id, pools!inner(pool_id, pool_name, tournament_id, prediction_mode)')
    .eq('round_key', ROUND_KEY)
    .eq('state', 'open')
    .eq('deadline', DEADLINE)
    .eq('opened_by', OPENED_BY)
    .eq('pools.prediction_mode', 'progressive')
  if (poolErr) throw poolErr
  const pools = (poolRows || []).map((r) => r.pools).filter(Boolean)
  console.log(`Target pools: ${pools.length}`)

  // 2) match count per tournament (round_16 matches)
  const matchCountByT = new Map()
  for (const tId of new Set(pools.map((p) => p.tournament_id))) {
    const { count } = await supabase
      .from('matches')
      .select('*', { count: 'exact', head: true })
      .eq('tournament_id', tId)
      .in('stage', ['round_16'])
    matchCountByT.set(tId, count ?? 0)
  }

  // 3) build per-pool, per-member emails
  const emails = []
  const distinctUsers = new Set()
  let poolsWithMembers = 0
  for (const pool of pools) {
    const { data: members, error: memErr } = await supabase
      .from('pool_members')
      .select('user_id, users(email, full_name, username)')
      .eq('pool_id', pool.pool_id)
    if (memErr) throw memErr
    const withEmail = (members || []).filter((m) => m.users?.email)
    if (withEmail.length) poolsWithMembers++
    const matchCount = matchCountByT.get(pool.tournament_id) ?? 0
    const poolUrl = `${APP_URL}/pools/${pool.pool_id}?tab=predictions`
    for (const m of withEmail) {
      distinctUsers.add(m.user_id)
      const { subject, html } = roundOpenTemplate({
        userName: m.users.full_name || m.users.username || 'there',
        poolName: pool.pool_name,
        roundName: ROUND_NAME,
        deadline: DEADLINE,
        matchCount,
        poolUrl,
      })
      emails.push({
        from: FROM,
        to: [m.users.email],
        subject,
        html,
        text: subject,
        ...(TOPIC_ID ? { topicId: TOPIC_ID } : {}),
        tags: [{ name: 'category', value: 'round_open' }],
      })
    }
  }

  console.log(`Pools with emailable members: ${poolsWithMembers}`)
  console.log(`Distinct recipients: ${distinctUsers.size}`)
  console.log(`Total emails (per-pool membership): ${emails.length}`)
  console.log(`Topic id present: ${TOPIC_ID ? 'yes' : 'NO (topic opt-outs will NOT be honored)'}`)
  console.log(`From: ${FROM}`)

  // sample preview
  if (emails.length) {
    const sample = emails[0]
    const previewPath = '/private/tmp/claude-501/-Users-ryansousa-Documents-GitHub-office-pools/e4efab04-889e-4341-a295-878dc1ba113c/scratchpad/r16-open-sample.html'
    try { writeFileSync(previewPath, sample.html) ; console.log(`Sample subject: ${sample.subject}`); console.log(`Sample HTML written: ${previewPath}`) } catch {}
  }

  if (!SEND) {
    console.log('\nDRY RUN — nothing sent. Re-run with SEND=1 to send.')
    return
  }
  if (!TOPIC_ID) {
    console.error('\nRefusing to SEND without RESEND_TOPIC_POOL_ACTIVITY (opt-outs would be ignored). Set it and retry.')
    process.exit(1)
  }

  // 4) send in chunks of 100
  let ok = 0, fail = 0
  for (let i = 0; i < emails.length; i += CHUNK) {
    const batch = emails.slice(i, i + CHUNK)
    try {
      const { error } = await resend.batch.send(batch.map(({ from, to, subject, html, text, topicId, tags }) => ({ from, to, subject, html, text, ...(topicId ? { topicId } : {}), tags })))
      if (error) { console.error(`Batch ${i / CHUNK} error:`, error); fail += batch.length }
      else ok += batch.length
    } catch (e) {
      console.error(`Batch ${i / CHUNK} threw:`, e?.message || e); fail += batch.length
    }
    console.log(`Progress: ${Math.min(i + CHUNK, emails.length)}/${emails.length} (ok=${ok} fail=${fail})`)
    if (i + CHUNK < emails.length) await sleep(CHUNK_DELAY_MS)
  }

  console.log(`\nDONE. Sent ok=${ok}, fail=${fail}, total=${emails.length}`)
  try { writeFileSync(MARKER, JSON.stringify({ at: new Date().toISOString(), ok, fail, total: emails.length })) } catch {}
}

main().catch((e) => { console.error(e); process.exit(1) })
