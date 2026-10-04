# Password reset in the app — plan

**Status:** ✅ approved 2026-10-04, being built · approach **(b)** chosen in chat

## Decisions (Ryan, 2026-10-04)

- **"Not now" on the new-password screen leaves them signed in.** It does not sign them out: the
  code already proved the inbox. (The plan originally had "Cancel = sign out".)
- **The admin "Reset password" fix (1d) is in this change.**
- **I do the dashboard steps.** Not yet possible: the built-in browser isn't signed in to
  Supabase, Chrome isn't connected, and there's no Management API token.

## Step 0 findings: read from a generated token, no dashboard needed

`scripts/verify-password-reset.ts --app-only`, 2026-10-04:

- **Email OTP length is 8, not 6.** The app's code box is now 8 (`RESET_CODE_LENGTH`), and the
  script fails if the two ever drift apart.
- **Site URL is saved as `sportpool.io`, with no scheme.** `{{ .SiteURL }}/auth/confirm` would print
  a broken link, so the template spells out `https://sportpool.io`. Fixing the Site URL itself is a
  separate call for Ryan, since other flows fall back to it.
- **The app's code path works on production:** a wrong code is refused (`otp_expired`), the right
  code signs in, and the session is revoked afterwards.
- Still needs the dashboard: a backup of the current template, the OTP expiry, and the SMTP setting.

## Goal

Someone who has forgotten their password can get back into the **app** without leaving it.
Today the app's "Forgot password?" is a pop-up sending them to the website, and it names the wrong
domain (`officepools.app`; production is `sportpool.io`).

While we're in here we fix the web reset link, so it works whichever browser or device opens it.
One email template serves both, so this is one piece of work.

## What we found

| Fact | Where |
|---|---|
| App "Forgot password?" is an `Alert` pointing at `officepools.app` | `mobile/app/(auth)/sign-in.tsx:27` |
| Web sends a PKCE link back through `/auth/callback?next=/reset-password` | `app/forgot-password/page.tsx:26`, `app/auth/callback/route.ts` |
| `@supabase/ssr` (web) is PKCE: the link only completes in the browser holding the verifier cookie | `lib/supabase/client.ts` |
| App has no universal links or App Links, just the `officepools://` scheme (`officepools-dev://` in dev) | `mobile/app.json`, `mobile/app.config.js` |
| The installed supabase-js supports `verifyOtp({ email, token, type: 'recovery' })` and fires `PASSWORD_RECOVERY` | `mobile/node_modules/@supabase/auth-js` |
| The app's root gate sends any session out of `(auth)`, to notifications or tabs | `mobile/app/_layout.tsx:208-239` |
| `/auth/*` is already exempt from the tester gate, and the proxy never redirects it | `lib/testerGate.ts`, `lib/supabase/middleware.ts` |
| Reset demand: **169** accounts have ever requested a reset, **14** in the last 90 days, last one 2026-09-11 | `auth.users.recovery_sent_at` |
| I can't read the live email template or auth settings from here (no Management API token) | — |

## How it works for the person

**App.** Sign in → *Forgot password?* → enter email → *"If there's a SportPool account for
x@y.com, we've sent it an 8-digit code"* → type the code (iOS offers it from Mail) → choose a new
password → in the app, signed in.

**Web.** Same email, but they tap the button. It goes to `sportpool.io/auth/confirm`, which signs
them in on the server and lands them on `/reset-password`. It no longer matters which browser asked.

**The email** carries both: a button for the web and the code for the app.

---

## Work

### 0 · Supabase dashboard: read before changing anything *(Ryan, or me with a token)*

Copy these into this file before anything changes, so we can roll back:

1. The current **Reset password** template: subject and full HTML.
2. **Site URL** (Auth → URL Configuration). It should be `https://sportpool.io`. If it isn't,
   hardcode `https://sportpool.io` in the new template rather than changing the Site URL, which
   other flows read.
3. **Email OTP length** (6 by default, up to 10). This sets the app's code box.
4. **Email OTP expiration** (default 3600s). The email copy should only state an expiry if we know it.
5. **SMTP** (custom/Resend or built-in) and the email rate limit. Built-in SMTP allows only a
   handful of emails an hour project-wide.

### 1 · Web: a link that works anywhere

**1a. New `app/auth/confirm/route.ts`** (Supabase's documented pattern for SSR apps):

- `GET ?token_hash=…&type=…` → `supabase.auth.verifyOtp({ token_hash, type })` on the server client,
  which writes the session cookies.
- **Only `type=recovery` is accepted**, and the destination comes from the type
  (`recovery → /reset-password`). It **never** reads a `next` from the URL, so it can't be an open
  redirect (see "Noticed" below).
- Any failure (missing, expired or already used) → `/forgot-password?error=link_invalid`.
- The redirect never carries the token on.
- The type→destination map is a small pure function in `lib/`, so it can be unit-tested.

**1b. `/forgot-password`** shows a banner when `?error=link_invalid`: *"That link has expired or
was already used. Enter your email and we'll send a new one."*

**1c. Keep `/auth/callback` unchanged.** Reset emails already sitting in inboxes still point at it
and keep working until they expire.

**1d. Admin "Reset password" action (found while planning).** `app/api/admin/users/[id]/actions/route.ts:52`
calls `auth.admin.generateLink`. That **builds a link without sending it**, then logs *"Sent password
reset to …"*. The user receives nothing. It has been clicked twice. Fix: call
`resetPasswordForEmail(email)`, which sends the real (new) template. About 5 lines. **Included
unless you say otherwise.**

### 2 · Email template *(dashboard, after step 1 is live)*

Restyle to match whatever step 0 shows; the content is:

```html
<h2>Reset your password</h2>
<p>We got a request to reset the password on your SportPool account.</p>
<p><a href="https://sportpool.io/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Reset password</a></p>
<p>Resetting in the SportPool app? Enter this code instead:</p>
<p style="font-size:28px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
<p>The link and the code can be used once. If you didn't ask to reset your password,
you can ignore this email and nothing will change.</p>
```

The subject stays as it is now, with no code in it, so the code doesn't show on a lock screen.

⚠ **This switches every reset email at once, including ones sent from dev.sportpool.io.** Those will
now land on `sportpool.io`. Preview already shares the production database, so a dev tester resets
their real account either way.

### 3 · App

**3a. `mobile/lib/passwordReset.ts`**: pure, no `react-native` imports, so vitest can reach it.
- `normalizeResetCode(input)`: digits only (pasting `123 456` works), capped at the code length.
- `resetErrorMessage(error)`: maps Supabase error codes to our copy:
  - `otp_expired` → *"That code didn't work. Check it, or send a new one."*
  - `over_email_send_rate_limit` / `over_request_rate_limit` → *"Wait a moment before asking for another code."*
  - `weak_password` → the server's reason.
  - network/timeout → *"Couldn't reach SportPool. Check your connection."*
- `validateNewPassword(pw, confirm)`: at least 8 characters, and both fields match. It's the same
  rule as `ChangePasswordModal`, which switches to this function so the two can't drift. The
  shared part is the rule, not the form, because the two screens are styled differently.

**3b. `mobile/lib/auth.tsx`** gains a `recovering` flag and four actions:
- `requestPasswordReset(email)` → `resetPasswordForEmail(email)`.
- `verifyResetCode(email, code)` → sets `recovering = true` **before** calling `verifyOtp`, so no
  frame can see the new session without the flag. It clears the flag on failure, and updates
  `users.last_login` on success, as `signIn` does.
- `completePasswordReset(pw)` → `updateUser({ password })` → clears the flag. `same_password` also
  counts as success: they evidently know it, so let them in.
- `skipPasswordReset()` → clears the flag; they stay signed in (Ryan's call).
- If the session ever goes to `null` (sign-out or failed refresh), clear the flag. Otherwise the
  next sign-in would wrongly land on "choose a new password".

**3c. `mobile/app/_layout.tsx`**: one new branch in the gate, **between step 2 (no session) and
step 3 (notifications)**:

> 2b) Signed in by a reset code with no new password saved yet → hold on `(auth)/new-password`.

Without it, verifying the code would carry them straight on. For someone on a new phone that's
the notifications screen, and then the app, with a password they still don't know. The gate does
the navigation, so the code screen never has to.

**3d. Three screens in `mobile/app/(auth)/`**, styled like `sign-in.tsx` (same `Input`, `Button`,
`KeyboardAvoidingView` pattern):

| Screen | Contents |
|---|---|
| `forgot-password.tsx` | Email, prefilled from what they typed on sign-in · **Send code** · Back to sign in |
| `reset-code.tsx` | *"If there's a SportPool account for {email}, we've sent it a {n}-digit code."* · code box (`number-pad`, `textContentType="oneTimeCode"`, `autoComplete="one-time-code"`), submits when full · **Send a new code** with a 60s countdown · Use a different email |
| `new-password.tsx` | New + confirm · "At least 8 characters" · **Save password** · **Not now** (stays signed in) |

**3e. `sign-in.tsx`**: "Forgot password?" pushes `forgot-password` with the typed email. The
`Alert` goes.

No native changes and no new packages, so this ships as an OTA.

### 4 · Checks

- **vitest:** `mobile/lib/__tests__/passwordReset.test.ts` (the three pure functions); a guard test
  that the `recovering` branch in `_layout.tsx` sits after the `!session` branch and before the
  `notificationsPrompted` branch; a test for the web type→destination map.
- **Static:** `npx tsc --noEmit` from `mobile/`; full, unfiltered web `tsc` (the 3 known FormData
  errors are the baseline); `npm run lint`.
- **`scripts/verify-password-reset.ts`**, run against production with a test account
  (`@test.com`). `generateLink` sends **no email**, which here is the point:
  1. Web link: `GET sportpool.io/auth/confirm?token_hash=…&type=recovery` → 307 to `/reset-password`
     with an `sb-` cookie set.
  2. Same token again → 307 to `/forgot-password?error=link_invalid`.
  3. App code: a fresh `generateLink` → anon client `verifyOtp({ email, token, type: 'recovery' })`
     → session → sign out.
- **On a real inbox (Ryan, his own account):** the script can't cover a reset *started from the
  web form*, which is PKCE-initiated. So: request it on sportpool.io in one browser, open the link
  in another. Then do the app path on the phone over Metro (no simulator runs here).

---

## Release order (each ⏸ is a separate go from you)

1. **Step 0 readings** → written into this file.
2. Build 1a–1d → checks → commit → ⏸ **push master** → verify the deploy by behaviour:
   `/auth/confirm` goes **404 → 307** (to `/forgot-password?error=link_invalid`).
3. `verify-password-reset.ts` checks 1 and 2 pass on production.
4. ⏸ **Swap the template** → your web test on your own inbox → script check 3.
5. App (3a–3e). It can be written during 2–4 but only tested after 4 → checks → you try it on your
   phone over Metro.
6. ⏸ **OTA**: `eas channel:view production` for the live runtime first, then `git status` clean,
   publish **per platform**, and both `Commit` lines with no `*`.

The order matters: if the template changed before `/auth/confirm` was live, every reset link would 404.

## Risks and rollback

- **The template is global and instant.** Rollback = paste the step-0 copy back. `/auth/callback`
  stays, so the old template still works.
- **Email link scanners** (e.g. Outlook Safe Links) can use up a link before the person clicks it.
  That's true today and not made worse. App users have the code; web users get a clear "request a
  new one". A scanner-proof web link (a page with a confirm button) is a possible follow-up.
- **App killed between code and new password:** they're signed in on relaunch without having set a
  password, same as closing the web reset tab. The flag is in memory only, so they're never stuck
  on a screen.
- **Older app builds** (not on the live runtime) keep the old pop-up.

## Noticed while planning (not in scope)

- `/auth/callback` puts `next` straight into the redirect (`${origin}${next}`), so
  `next=@evil.com` becomes `https://sportpool.io@evil.com`. It only fires after a successful code
  exchange, so it's hard to use. The fix is to accept `next` only if it starts with a single `/`.
  The new route avoids the problem by never reading `next`.

## Questions for Ryan

1. ~~Dashboard?~~ Answered: **I do it.** Blocked until a dashboard session (or a token) is available.
2. ~~Cancel signs them out?~~ Answered: **"Not now" leaves them signed in.**
3. ~~Admin fix?~~ Answered: **yes, in this change.**
