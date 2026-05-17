// One-off: send the Road To Glory follow-up email to Ryan's inboxes for review

import { readFileSync } from 'fs'
import { resolve } from 'path'

const envPath = resolve(process.cwd(), '.env.local')
const envContent = readFileSync(envPath, 'utf8')
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const eqIndex = trimmed.indexOf('=')
  if (eqIndex === -1) continue
  const key = trimmed.slice(0, eqIndex).trim()
  let value = trimmed.slice(eqIndex + 1).trim()
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  if (!process.env[key]) process.env[key] = value
}

import { sendEmail } from '../lib/email/send'

async function main() {
  const html = readFileSync(resolve(process.cwd(), 'office-pools-followup-email.html'), 'utf8')
  const recipients = ['Ryansousa93@gmail.com', 'ryansousa93@outlook.com']

  const result = await sendEmail({
    to: recipients,
    subject: 'Reminder: The Road To Glory — One Month To Go',
    html,
    reply_to: 'ryansousa93@gmail.com',
  })

  console.log(JSON.stringify({ recipients, result }, null, 2))
  if (!result.success) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
