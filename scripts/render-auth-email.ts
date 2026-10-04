// render-auth-email — print a Supabase auth email for pasting into the dashboard.
//
//   npx tsx scripts/render-auth-email.ts reset-password            # writes .preview-emails/auth-reset-password.html
//   npx tsx scripts/render-auth-email.ts reset-password --copy     # …and puts the HTML on the clipboard (macOS)
//
// The templates live in lib/email/supabaseAuthTemplates.ts; Supabase only ever sees the
// pasted copy, so after changing one, re-render it and paste it over the dashboard's Source
// (Authentication → Emails → the template → Source).

import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { SUPABASE_AUTH_TEMPLATES } from '../lib/email/supabaseAuthTemplates'

const name = process.argv[2] as keyof typeof SUPABASE_AUTH_TEMPLATES | undefined
if (!name || !(name in SUPABASE_AUTH_TEMPLATES)) {
  console.error(`\n  Which template? One of: ${Object.keys(SUPABASE_AUTH_TEMPLATES).join(', ')}\n`)
  process.exit(1)
}

const { subject, html } = SUPABASE_AUTH_TEMPLATES[name]()
const dir = join(process.cwd(), '.preview-emails')
mkdirSync(dir, { recursive: true })
const out = join(dir, `auth-${name}.html`)
writeFileSync(out, html)

console.log(`\n  Subject: ${subject}`)
console.log(`  HTML:    ${out} (${html.length.toLocaleString()} chars)`)
if (process.argv.includes('--copy')) {
  execSync('pbcopy', { input: html })
  console.log('  Copied the HTML to the clipboard.')
}
console.log()
