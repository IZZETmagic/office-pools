/**
 * Sends every email template to ONE hard-coded inbox as a real Resend send, so the
 * branding can be judged in an actual mail client rather than a browser iframe.
 *
 * This is the only way to answer the questions the local preview cannot:
 * does Gmail keep the Nunito @import, and what does its force-invert do to the
 * dark-mode rules it ignores?
 *
 *   npx tsx scripts/send-email-previews.ts                  # dry run — lists what would send
 *   npx tsx scripts/send-email-previews.ts --run            # SEND all
 *   npx tsx scripts/send-email-previews.ts --run --only=Results
 *
 * SAFETY — this script must never be able to reach a real member:
 *  - The recipient is a hard-coded constant. There is no --to flag, and the script
 *    never touches Supabase, never resolves a segment, and never reads a user table.
 *  - Dry run by default; sending requires --run.
 *  - Subjects are prefixed so a preview can never be mistaken for the real thing.
 *
 * Bodies are built from scripts/email-samples.ts — the same list the browser preview
 * renders, so the inbox and the preview cannot disagree.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildSamples } from './email-samples'

// --- env ---------------------------------------------------------------------------

;(() => {
  const envContent = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of envContent.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (!process.env[k]) process.env[k] = v
  }
})()

// Hard-coded on purpose — see SAFETY above. Changing this is a code change, reviewed
// like any other, not a flag someone can fat-finger on the command line.
const RECIPIENT = 'ryansousa93@gmail.com'

const SUBJECT_PREFIX = 'SportPool preview'

// Resend's default limit is 2 requests/second. 600ms keeps us under it with headroom;
// a preview run is not worth a 429 halfway through.
const THROTTLE_MS = 600

// --- args --------------------------------------------------------------------------

const argv = process.argv.slice(2)
const DO_SEND = argv.includes('--run')
const onlyArg = argv.find((a) => a.startsWith('--only='))
const ONLY = onlyArg ? onlyArg.slice('--only='.length).toLowerCase() : null

async function main() {
  const all = buildSamples()
  const samples = ONLY ? all.filter((s) => s.group.toLowerCase() === ONLY) : all

  if (samples.length === 0) {
    console.error(
      `No templates matched --only=${ONLY}. Groups: ${[...new Set(all.map((s) => s.group))].join(', ')}`
    )
    process.exit(1)
  }

  const width = String(samples.length).length

  console.log(`\n  Recipient : ${RECIPIENT}`)
  console.log(`  From      : ${process.env.RESEND_FROM_EMAIL || 'Sport Pool <notifications@sportpool.io>'}`)
  console.log(`  Templates : ${samples.length}${ONLY ? ` (group "${ONLY}")` : ''}`)
  console.log(`  Mode      : ${DO_SEND ? 'SEND' : 'DRY RUN (pass --run to send)'}\n`)

  if (!DO_SEND) {
    samples.forEach((s, i) => {
      const n = String(i + 1).padStart(width, '0')
      console.log(`  ${n}. [${s.group}] ${s.label}`)
      console.log(`      ${subjectFor(n, s.subject)}`)
    })
    console.log(`\n  Dry run — nothing sent. Re-run with --run to send.\n`)
    return
  }

  // Imported lazily so a dry run never even constructs a Resend client.
  const { sendEmail } = await import('../lib/email/send')

  let sent = 0
  const failures: { label: string; error: unknown }[] = []

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]
    const n = String(i + 1).padStart(width, '0')
    const subject = subjectFor(n, s.subject)

    const result = await sendEmail({
      to: RECIPIENT,
      subject,
      html: s.html,
      text: `${s.label} — preview. This is a rendering test, not a real notification.`,
      tags: [{ name: 'category', value: 'template-preview' }],
    })

    if (result.success) {
      sent++
      console.log(`  ✓ ${n}/${samples.length}  ${s.label}`)
    } else {
      failures.push({ label: s.label, error: result.error })
      console.log(`  ✗ ${n}/${samples.length}  ${s.label} — ${JSON.stringify(result.error)}`)
    }

    if (i < samples.length - 1) await sleep(THROTTLE_MS)
  }

  console.log(`\n  Sent ${sent}/${samples.length} to ${RECIPIENT}`)
  if (failures.length > 0) {
    console.log(`  FAILED (${failures.length}):`)
    for (const f of failures) console.log(`    - ${f.label}`)
    process.exitCode = 1
  }
  console.log('')
}

/** Numbered so the inbox sorts in template order and Gmail can't thread them together. */
function subjectFor(n: string, subject: string): string {
  return `[${SUBJECT_PREFIX} ${n}] ${subject}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
