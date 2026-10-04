// verify-password-reset — the reset email's two halves, against the REAL auth server.
//
//   npx tsx scripts/verify-password-reset.ts                      # sportpool.io
//   npx tsx scripts/verify-password-reset.ts --base=https://dev.sportpool.io
//   npx tsx scripts/verify-password-reset.ts --app-only            # the code half; needs no deploy
//
// The reset email carries a CODE that the website and the app both type in (verifyOtp type
// 'recovery'). /auth/confirm (the LINK older emails carried) is walked too while it exists.
// Both are walked here as test10@test.com — a dev account
// with no pools, never a real person — using `auth.admin.generateLink`, which builds the token WITHOUT SENDING ANY EMAIL. That is
// the point: nothing reaches an inbox, so this can run as often as needed.
//
// ⚠ WHAT THIS CANNOT REACH: a reset started from the web form. The browser client is PKCE, so that
// email's token is the PKCE kind, and only a real inbox sees it. That case is checked by hand.
//
// ⚠ Run AFTER /auth/confirm is deployed to --base. Before, check 1 gets a 404.

import { existsSync, readFileSync } from 'fs'
import { execSync } from 'child_process'
import { dirname, resolve } from 'path'

;(() => {
  let path = resolve(process.cwd(), '.env.local')
  if (!existsSync(path)) {
    try {
      const common = execSync('git rev-parse --git-common-dir', { encoding: 'utf8' }).trim()
      path = resolve(dirname(resolve(common)), '.env.local')
    } catch {
      /* fall through */
    }
  }
  if (!existsSync(path)) {
    console.error('\n  This script needs .env.local (service-role credentials).\n')
    process.exit(1)
  }
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) continue
    const i = t.indexOf('=')
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v
  }
})()

import { createClient } from '@supabase/supabase-js'
import { RESET_CODE_LENGTH } from '../lib/passwordReset'

const BASE = (process.argv.find((a) => a.startsWith('--base='))?.slice('--base='.length) ?? 'https://sportpool.io').replace(/\/$/, '')
const APP_ONLY = process.argv.includes('--app-only')
// ⚠ NOT test_user_01…09: those are `users` rows with NO auth account behind them, so
// generateLink answers "User with this email not found". Nor AppleTestUser — App Review signs in
// with it. A reset token never changes the password, and every session made here is revoked.
const TEST_EMAIL = 'test10@test.com'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const anon = () =>
  createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

let failures = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (!ok) failures++
  console.log(`  ${ok ? '✓' : '✗'} ${label}${!ok && detail !== undefined ? `\n      ${JSON.stringify(detail)}` : ''}`)
}

async function recoveryToken(email: string) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email })
  if (error || !data.properties) throw new Error(`generateLink failed: ${error?.message}`)
  return {
    hash: data.properties.hashed_token,
    code: data.properties.email_otp,
    // With no redirectTo, the auth server fills in the project's Site URL — the same value the
    // template's {{ .SiteURL }} prints at the front of the reset link.
    siteUrl: new URL(data.properties.action_link).searchParams.get('redirect_to'),
  }
}

async function confirm(query: string) {
  const res = await fetch(`${BASE}/auth/confirm?${query}`, { redirect: 'manual' })
  const location = res.headers.get('location') ?? ''
  const cookies = res.headers.getSetCookie?.() ?? []
  return { status: res.status, path: location ? new URL(location, BASE).pathname + new URL(location, BASE).search : '', cookies }
}

/**
 * The session /auth/confirm wrote is in an `sb-<ref>-auth-token` cookie (possibly chunked `.0`,
 * `.1`…, value prefixed `base64-`). Revoke it so the check leaves no live session behind.
 */
async function revokeCookieSession(cookies: string[]) {
  const parts = cookies
    .map((c) => c.split(';')[0])
    .filter((c) => /^sb-[^=]+-auth-token(\.\d+)?=/.test(c))
    .sort()
    .map((c) => c.slice(c.indexOf('=') + 1))
  if (parts.length === 0) return false
  let raw = decodeURIComponent(parts.join(''))
  if (raw.startsWith('base64-')) raw = Buffer.from(raw.slice('base64-'.length), 'base64url').toString('utf8')
  const accessToken = (JSON.parse(raw) as { access_token?: string }).access_token
  if (!accessToken) return false
  const { error } = await admin.auth.admin.signOut(accessToken)
  return !error
}

async function main() {
  console.log(`\nverify-password-reset → ${BASE}\n`)

  const email = TEST_EMAIL

  if (!APP_ONLY) await webLink(email)
  await appCode(email)

  console.log(failures === 0 ? '\nAll checks passed.\n' : `\n${failures} check(s) FAILED.\n`)
  process.exit(failures === 0 ? 0 : 1)
}

async function webLink(email: string) {
  console.log('Web link (/auth/confirm)')
  const first = await recoveryToken(email)
  const ok = await confirm(`token_hash=${encodeURIComponent(first.hash)}&type=recovery`)
  check('a fresh reset link lands on /reset-password', ok.status === 307 && ok.path === '/reset-password', ok)
  check('…signed in: it sets the session cookie', ok.cookies.some((c) => /^sb-[^=]+-auth-token/.test(c)), ok.cookies.length)
  check('…and that session is revoked again', await revokeCookieSession(ok.cookies))

  const again = await confirm(`token_hash=${encodeURIComponent(first.hash)}&type=recovery`)
  check('the same link a second time → "expired or already used"', again.path === '/forgot-password?error=link_invalid', again)

  const wrongType = await confirm(`token_hash=${encodeURIComponent(first.hash)}&type=signup`)
  check('a type other than recovery is refused', wrongType.path === '/forgot-password?error=link_invalid', wrongType)

  const noHash = await confirm('type=recovery')
  check('a link with no token is refused', noHash.path === '/forgot-password?error=link_invalid', noHash)
}

async function appCode(email: string) {
  console.log('\nApp code (verifyOtp)')
  const second = await recoveryToken(email)
  check(
    `the code is ${RESET_CODE_LENGTH} digits, as the code boxes and the email template expect (Auth → Email OTP Length)`,
    new RegExp(`^\\d{${RESET_CODE_LENGTH}}$`).test(second.code),
    second.code.length,
  )
  // ⚠ Information, not a check: the Site URL is saved as bare `sportpool.io` (no scheme), so
  // `{{ .SiteURL }}/auth/confirm` would print a broken link. The template spells out
  // https://sportpool.io instead, and this line shows whether that is still necessary.
  console.log(`  · Site URL (template's {{ .SiteURL }}): ${second.siteUrl}`)
  const client = anon()
  const wrong = await client.auth.verifyOtp({ email, token: '000000', type: 'recovery' })
  check('a wrong code is refused as otp_expired', wrong.error?.code === 'otp_expired', wrong.error)

  const right = await client.auth.verifyOtp({ email, token: second.code, type: 'recovery' })
  check('the emailed code signs in', !!right.data.session && !right.error, right.error)
  if (right.data.session) {
    const { error: outErr } = await client.auth.signOut()
    check('…and that session is signed out again', !outErr, outErr)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
