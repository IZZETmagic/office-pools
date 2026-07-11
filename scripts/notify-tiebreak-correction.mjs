// One-off comms for the knockout tie-break scoring fix (2026-07-11).
//   • Email 1: 1:1 reply to Eliel (the ticket reporter) — transactional.
//   • Email 2: heads-up to the ADMINS of the 78 affected full_tournament pools.
//     ADMINS ONLY (pool_members.role='admin') — NOT the ~1,415 regular players.
//
// Sign-off "The SortPool team" (per Ryan). From the verified sportpool.io sender.
// Sent as a one-time service notice WITHOUT RESEND_TOPIC_POOL_ACTIVITY (that topic
// id is not in this env; Ryan authorized proceeding without opt-out honoring).
//
// DRY RUN by default. Set SEND=1 to actually send. Idempotent via a marker file.
//   node scripts/notify-tiebreak-correction.mjs          # dry run
//   SEND=1 node scripts/notify-tiebreak-correction.mjs   # real send

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

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
const MARKER = resolve(process.cwd(), 'scripts/.notify-tiebreak-correction.sent')
const SCRATCH = '/private/tmp/claude-501/-Users-ryansousa-Documents-GitHub-office-pools/8bba7b8f-7cbf-447c-a920-10cb720a9369/scratchpad'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM = process.env.RESEND_FROM_EMAIL || 'Sport Pool <notifications@sportpool.io>'
const ELIEL_ENTRY = 'b24670d2-972d-46e0-8b75-319e67f37b5e'
const CHUNK = 50
const CHUNK_DELAY_MS = 700

const POOL_IDS = ['001fa132-1e4a-4d0c-b1bb-bcde88de532a','014b455a-c28f-40c2-b70e-29930013e182','0189ba21-29ee-484f-9c23-9ec093b30dc5','0364927a-5410-421d-b92f-d52138c7f6da','06868f6d-538e-4a34-be23-e2486e2b56de','07857e91-6a5d-48be-a74c-28736a8b1caf','0be390da-4626-4b6e-bcba-357c7e80d80c','0d160df8-7939-4c26-a634-7e0af3e94147','0e8501a9-8d6b-445b-af91-299ffda8d606','100fb78e-da6c-420c-b074-378c51df282a','114f1763-15ae-4eec-8bc4-7672d017856e','16484851-168d-4417-9305-7d3c7bce5b5c','17dd9355-2b28-4a66-a3b8-20cc09ac3782','1e26cc83-7a48-4dc9-9f3c-05b42152d4d4','20227dbe-8726-434a-8f4e-a3a9905d5e96','24693867-0347-49b2-b367-450f2bb06263','2ec7c2c0-1d18-40a0-b5c0-a65f869f9bf9','2fac4e92-f4eb-46da-8352-459ae3393d99','318471bb-a680-46fe-a99c-52ea08d4b876','31b1f3ce-a219-4dbe-af93-c03b193161e0','35f598f4-71c6-412e-bf54-42fe27e04607','3638c8ae-b262-4c97-9963-8eb87a984d1e','379f6401-d661-422c-b36c-3db50916e3fe','42819d50-bd49-458e-96ac-5c34028274ec','44376019-046e-4177-8596-638a2515c2ce','46cac8bf-7c4d-4aea-8bb1-99e9c8d2c574','4830d097-0924-407e-bef5-4ecc873eefc9','49980484-9ddf-4ebe-b840-675ae3317165','49c2aafb-e017-4930-b0c8-35b4c2fb4303','4ed0d3b6-850a-4ef6-887a-edeccc50a774','57ff1ffc-5c04-47ef-872b-df2705b9f07c','5a3ef543-7780-41fe-85a2-b9e6093625c3','5b7760f9-eb25-431d-9a9c-02a578ee1da8','5dc8b4f0-56d6-4b32-9c0e-14c13b25c9b1','5e67fee7-fa1c-4cb7-bdd8-e321891d07b1','61a1d3bc-c2f1-42c5-85ec-1ded347eb55d','6a492efd-d10a-4cb8-a986-71f9f33e546e','6b263a12-fba1-478f-bd0f-0e717feb9d66','6f1ca4d8-7c29-47ab-929b-cb183686f92d','74929a7a-2128-44e8-9b51-26b90efdb017','7569c8c9-79f4-4675-a789-d164e5b8c2d0','81f59f3c-c8c9-4646-a446-88b9f9fad37f','8435d1eb-08a1-4c3b-a99e-f4963e541d26','84b7b242-b3ad-4474-ae3f-35bddaee0e39','87c1a249-fe91-461a-bec2-99547e993c29','888f1eed-420d-4ee8-8fbb-137b7749e5b7','8c523058-878a-4589-8a1d-608324c98695','8f7f3167-995d-4115-805d-0f4aed5d09ee','9005f846-3039-43f9-85c2-da1992d536f1','916cff43-247a-4425-8902-32b5d3879838','99f79ce7-569b-4e79-8df5-54e7683f68a8','99fea4a8-7f03-4f38-958a-53ae182f9daa','a0330701-13e1-4a1a-a6eb-e3476f4bee91','a108d305-69a7-4dc9-b553-717705121e71','a361a1fa-f976-494a-9c74-a77efec23beb','b0b789e4-9a90-485d-9498-5228778032c4','b248054b-c139-423b-af09-73a9a7dca307','b2a3b9c2-655d-4c3a-b99d-5a3b2bebe911','b91bb512-7ee7-4132-92db-28c75b8bf1ba','bc613a08-cd8b-4c07-82eb-ce2b8d2de629','c7a7e871-eac4-430d-b562-19b0cf1fc77f','c843e1b5-2d77-49cd-8753-3fbc4a04aa43','c8a88e80-88dd-4496-bb20-533570c7ca6d','cc6f39b9-14b1-459b-af58-09076db6ed7a','cd8f11a8-d51a-4c2c-8bcc-de0d1e7eca8c','d166d281-c998-48ce-b728-e667ec174051','d1ff5a5a-ef4a-463a-935b-67ff4de6b3d6','d5dea1ee-420e-4f0b-a563-6113d53cda9d','e1bff037-90be-4fba-9d37-50d4a53f2999','f0904f38-3845-4f9e-b602-b77485bf58f8','f259b81d-7007-4d63-9606-8d4c4228a43c','f5f57dcd-1021-4f03-a73e-5d8a819eb5d9','f632bf57-eac4-454d-98e7-7be56f03c29b','f7c21be4-edc8-4bd5-ae76-f83cc1a45c61','fa7e1014-539f-45a2-bc77-fa38603ec920','fd673f36-8574-486d-9b0b-dedf96a77cc8','fddeccca-d0dc-4905-8bfb-6e7a6c552ef6','fef5260a-0b25-4c22-8adf-8445ff2f3bfa']

if (!SUPABASE_URL || !SERVICE_ROLE) { console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }
if (!RESEND_API_KEY) { console.error('Missing RESEND_API_KEY'); process.exit(1) }

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } })
const resend = new Resend(RESEND_API_KEY)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const firstName = (full, uname) => {
  const t = (full || uname || '').trim().split(/\s+/)[0] || 'there'
  return t.charAt(0).toUpperCase() + t.slice(1)
}

function shell(bodyHtml) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;"><tr><td align="center">
<table width="100%" style="max-width:560px;background:#fff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08);"><tr><td style="padding:32px;color:#374151;font-size:15px;line-height:1.6;">
${bodyHtml}
<p style="margin:24px 0 0;color:#374151;">— The SortPool team</p>
</td></tr></table></td></tr></table></body></html>`
}

function elielEmail(name) {
  const hi = firstName(name)
  const p = (t) => `<p style="margin:0 0 14px;">${t}</p>`
  const html = shell(
    p(`Hi ${esc(hi)},`) +
    p(`Following up on the scoring issue you flagged — you were exactly right, and it turned out to be a real engine bug, not a one-off.`) +
    p(`When your predicted group finished in a tight tie, the standings the app <em>showed</em> didn't match how the scoring engine broke that tie behind the scenes, so your correct Round of 16 pick (Mexico&ndash;England) was scored as a miss. We'd given you a temporary manual credit to make you whole while we fixed the root cause.`) +
    p(`That fix is now live. Your pick scores correctly on its own, and we've removed the temporary credit — so your total is unchanged, but it's now <strong>earned properly</strong> and won't slip again. The standings you see and the way picks are scored now use the same logic, aligned to the official FIFA World Cup tiebreakers.`) +
    p(`Nothing you need to do. Thanks for taking the time to report it — it made the game fairer for everyone.`)
  )
  const text = `Hi ${hi},\n\nFollowing up on the scoring issue you flagged — you were exactly right, and it turned out to be a real engine bug, not a one-off.\n\nWhen your predicted group finished in a tight tie, the standings the app showed didn't match how the scoring engine broke that tie behind the scenes, so your correct Round of 16 pick (Mexico-England) was scored as a miss. We'd given you a temporary manual credit to make you whole while we fixed the root cause.\n\nThat fix is now live. Your pick scores correctly on its own, and we've removed the temporary credit — so your total is unchanged, but it's now earned properly and won't slip again. The standings you see and the way picks are scored now use the same logic, aligned to the official FIFA World Cup tiebreakers.\n\nNothing you need to do. Thanks for taking the time to report it — it made the game fairer for everyone.\n\n— The SortPool team`
  return { subject: 'Closing the loop on your Mexico–England pick', html, text }
}

function adminEmail(name, poolNames) {
  const hi = firstName(name)
  const label = poolNames.length === 1 ? `<strong>${esc(poolNames[0])}</strong>` : `your pools (${poolNames.map((n) => `<strong>${esc(n)}</strong>`).join(', ')})`
  const labelText = poolNames.length === 1 ? poolNames[0] : `your pools (${poolNames.join(', ')})`
  const p = (t) => `<p style="margin:0 0 14px;">${t}</p>`
  const html = shell(
    p(`Hi ${esc(hi)},`) +
    p(`A quick heads-up before your members ask: we've fixed a scoring bug and recalculated the completed rounds in ${label}. Wanted you to hear it from us first.`) +
    p(`<strong>What was wrong.</strong> In pools where members predict every match up front, a tied predicted group could be ranked one way on screen but scored a different way underneath — so a correct knockout pick could be scored as a miss. We also corrected the group tiebreakers to the official FIFA World Cup order (overall goal difference before head-to-head).`) +
    p(`<strong>What changed.</strong> We re-scored the completed rounds with the corrected logic. <strong>Predictions themselves were not touched — only how they're scored.</strong> This is a genuine correction, so some members' points and ranks shift in both directions: many move up, and some move down where the old logic had credited a pick it shouldn't have. Rounds still to come are unaffected.`) +
    p(`<strong>What you don't need to do.</strong> Nothing — it's already applied. If a member asks, you're welcome to forward this note.`) +
    p(`Thanks for running your pool.`)
  )
  const text = `Hi ${hi},\n\nA quick heads-up before your members ask: we've fixed a scoring bug and recalculated the completed rounds in ${labelText}. Wanted you to hear it from us first.\n\nWhat was wrong. In pools where members predict every match up front, a tied predicted group could be ranked one way on screen but scored a different way underneath — so a correct knockout pick could be scored as a miss. We also corrected the group tiebreakers to the official FIFA World Cup order (overall goal difference before head-to-head).\n\nWhat changed. We re-scored the completed rounds with the corrected logic. Predictions themselves were not touched — only how they're scored. This is a genuine correction, so some members' points and ranks shift in both directions: many move up, and some move down where the old logic had credited a pick it shouldn't have. Rounds still to come are unaffected.\n\nWhat you don't need to do. Nothing — it's already applied. If a member asks, you're welcome to forward this note.\n\nThanks for running your pool.\n\n— The SortPool team`
  return { subject: 'Heads-up: a scoring correction has been applied to your pool', html, text }
}

async function main() {
  if (SEND && !FORCE && existsSync(MARKER)) {
    console.error(`Refusing to send: ${MARKER} exists (already sent). Set FORCE=1 to override.`)
    process.exit(1)
  }

  // ---- Eliel (1:1) ----
  const { data: eliRows, error: eliErr } = await supabase
    .from('pool_entries').select('member_id, pool_members!inner(user_id, users(email, full_name, username))')
    .eq('entry_id', ELIEL_ENTRY).single()
  if (eliErr) throw eliErr
  const eliUser = eliRows?.pool_members?.users
  if (!eliUser?.email) throw new Error('Could not resolve Eliel email')
  const eliMsg = elielEmail(eliUser.full_name || eliUser.username)

  // ---- Admins of affected pools (role='admin'), grouped by email ----
  const { data: adminRows, error: admErr } = await supabase
    .from('pool_members')
    .select('user_id, role, pool_id, users(email, full_name, username), pools!inner(pool_name)')
    .eq('role', 'admin').in('pool_id', POOL_IDS)
  if (admErr) throw admErr
  const byEmail = new Map()
  for (const r of adminRows || []) {
    const email = r.users?.email
    if (!email) continue
    if (email === eliUser.email) continue // never double-send to Eliel (he's a player anyway)
    const g = byEmail.get(email) || { email, name: r.users.full_name || r.users.username, pools: new Set() }
    g.pools.add(r.pools?.pool_name || 'your pool')
    byEmail.set(email, g)
  }
  const admins = [...byEmail.values()].map((g) => ({ ...g, pools: [...g.pools] }))

  console.log(`From: ${FROM}`)
  console.log(`Eliel (1:1): ${eliUser.email}  subject="${eliMsg.subject}"`)
  console.log(`Admin recipients (role=admin, deduped by email): ${admins.length}`)
  console.log(`Total emails: ${admins.length + 1}`)

  // sample previews
  try {
    writeFileSync(`${SCRATCH}/email-eliel.html`, eliMsg.html)
    const a0 = admins[0] ? adminEmail(admins[0].name, admins[0].pools) : null
    if (a0) writeFileSync(`${SCRATCH}/email-admin-sample.html`, a0.html)
    console.log(`\n--- ELIEL (text) ---\n${eliMsg.text}\n`)
    if (a0) console.log(`--- ADMIN sample → ${admins[0].email} (text) ---\n${a0.text}\n`)
  } catch (e) { console.error('preview write failed', e?.message) }

  const multiPoolAdmins = admins.filter((a) => a.pools.length > 1)
  if (multiPoolAdmins.length) console.log(`Note: ${multiPoolAdmins.length} admin(s) run >1 affected pool — they get ONE email listing their pools.`)

  if (!SEND) {
    console.log('\nDRY RUN — nothing sent. Re-run with SEND=1 to send.')
    return
  }

  // ---- send Eliel first ----
  let ok = 0, fail = 0
  const errors = []
  try {
    const { error } = await resend.emails.send({ from: FROM, to: [eliUser.email], subject: eliMsg.subject, html: eliMsg.html, text: eliMsg.text, tags: [{ name: 'category', value: 'tiebreak_correction' }] })
    if (error) { fail++; errors.push(`eliel: ${JSON.stringify(error)}`) } else ok++
  } catch (e) { fail++; errors.push(`eliel: ${e?.message || e}`) }

  // ---- send admins in chunks ----
  const batch = admins.map((a) => { const m = adminEmail(a.name, a.pools); return { from: FROM, to: [a.email], subject: m.subject, html: m.html, text: m.text, tags: [{ name: 'category', value: 'tiebreak_correction' }] } })
  for (let i = 0; i < batch.length; i += CHUNK) {
    const slice = batch.slice(i, i + CHUNK)
    try {
      const { error } = await resend.batch.send(slice)
      if (error) { fail += slice.length; errors.push(`batch ${i / CHUNK}: ${JSON.stringify(error)}`) } else ok += slice.length
    } catch (e) { fail += slice.length; errors.push(`batch ${i / CHUNK}: ${e?.message || e}`) }
    console.log(`Progress: ${Math.min(i + CHUNK, batch.length)}/${batch.length} admins (ok=${ok} fail=${fail})`)
    if (i + CHUNK < batch.length) await sleep(CHUNK_DELAY_MS)
  }

  console.log(`\nDONE. ok=${ok} fail=${fail} total=${admins.length + 1}`)
  if (errors.length) console.log('errors:\n' + errors.join('\n'))
  try { writeFileSync(MARKER, JSON.stringify({ at: 'sent', ok, fail, total: admins.length + 1 })) } catch {}
}

main().catch((e) => { console.error(e); process.exit(1) })
