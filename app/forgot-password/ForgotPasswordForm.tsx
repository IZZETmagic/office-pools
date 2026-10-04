'use client'

import { useEffect, useState } from 'react'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Alert } from '@/components/ui/Alert'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'
import {
  RESEND_COOLDOWN_SECONDS,
  RESET_CODE_LENGTH,
  formatResetCode,
  looksLikeEmail,
  normalizeResetCode,
  resetErrorMessage,
} from '@/lib/passwordReset'

/**
 * Emails the reset code. ⚠ NOT THROUGH THE SITE'S OWN CLIENT: @supabase/ssr is
 * PKCE, which ties a reset to a verifier stored in this browser — built for the
 * link this flow no longer sends. A plain (implicit) request is exactly what the
 * app sends, and verifying its code is proven on production by
 * scripts/verify-password-reset.ts. Nothing is stored, under a key of its own,
 * so it never touches the signed-in session.
 */
function requestResetCode(email: string) {
  const client = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        flowType: 'implicit',
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'sp-reset-request',
      },
    }
  )
  return client.auth.resetPasswordForEmail(email.trim())
}

/**
 * Forgot password, in two steps on one page: email, then the code from the
 * email. The address stays in this component's state — never the URL, which
 * analytics records (how the crew-invite token leaked).
 */
export function ForgotPasswordForm() {
  // Set by /auth/confirm when a link from an older reset email could not be verified.
  const linkInvalid = useSearchParams().get('error') === 'link_invalid'
  const router = useRouter()

  const [step, setStep] = useState<'email' | 'code'>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const sendCode = async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!looksLikeEmail(email) || loading) return
    setLoading(true)
    setError(null)
    setNotice(null)
    const { error } = await requestResetCode(email)
    setLoading(false)
    if (error) {
      setError(resetErrorMessage(error))
      return
    }
    setCooldown(RESEND_COOLDOWN_SECONDS)
    setCode('')
    if (step === 'code') setNotice('We sent a new code. Use the newest one.')
    setStep('code')
  }

  const verify = async (value: string) => {
    if (loading || value.length !== RESET_CODE_LENGTH) return
    setLoading(true)
    setError(null)
    setNotice(null)
    const { error } = await createClient().auth.verifyOtp({
      email: email.trim(),
      token: value,
      type: 'recovery',
    })
    if (error) {
      setLoading(false)
      setError(resetErrorMessage(error))
      setCode('')
      return
    }
    // The code signed them in (the session is in cookies now), so the next page
    // can save the new password.
    router.push('/reset-password')
  }

  const handleCodeChange = (raw: string) => {
    const next = normalizeResetCode(raw)
    setCode(next)
    // A full code submits itself — which is what a pasted or autofilled code looks like.
    if (next.length === RESET_CODE_LENGTH) void verify(next)
  }

  if (step === 'code') {
    return (
      <>
        <h2 className="text-xl font-black tracking-tight text-ink text-center">Check your email</h2>
        <p className="text-muted text-center mb-8">
          If there&apos;s a SportPool account for <span className="font-semibold text-ink">{email.trim()}</span>,
          we&apos;ve sent it a {RESET_CODE_LENGTH}-digit code.
        </p>

        {error ? <Alert variant="error">{error}</Alert> : notice ? <Alert variant="info">{notice}</Alert> : null}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void verify(code)
          }}
          className="space-y-5"
        >
          <FormField label="Code">
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              value={formatResetCode(code)}
              onChange={(e) => handleCodeChange(e.target.value)}
              maxLength={RESET_CODE_LENGTH + 4}
              placeholder={formatResetCode('0'.repeat(RESET_CODE_LENGTH))}
              aria-label={`${RESET_CODE_LENGTH}-digit code`}
              disabled={loading}
              className="text-center text-2xl font-bold tracking-[0.2em]"
            />
          </FormField>

          <Button
            type="submit"
            fullWidth
            size="lg"
            loading={loading}
            loadingText="Checking..."
            disabled={code.length !== RESET_CODE_LENGTH}
          >
            Continue
          </Button>
        </form>

        <div className="text-center mt-6 space-y-3">
          <button
            type="button"
            onClick={() => void sendCode()}
            disabled={cooldown > 0 || loading}
            className="font-semibold text-primary-600 hover:underline disabled:text-muted disabled:no-underline"
          >
            {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
          </button>
          <p>
            <button
              type="button"
              onClick={() => {
                setStep('email')
                setCode('')
                setError(null)
                setNotice(null)
              }}
              className="text-muted hover:underline"
            >
              Use a different email
            </button>
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      <h2 className="text-xl font-black tracking-tight text-ink text-center">Reset password</h2>
      <p className="text-muted text-center mb-8">
        Enter your email and we&apos;ll send you a {RESET_CODE_LENGTH}-digit code to reset your password.
      </p>

      {error && <Alert variant="error">{error}</Alert>}
      {!error && linkInvalid && (
        <Alert variant="warning">
          That link has expired or was already used. Enter your email and we&apos;ll send you a code.
        </Alert>
      )}

      <form onSubmit={sendCode} className="space-y-5">
        <FormField label="Email">
          <Input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
          />
        </FormField>

        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={loading}
          loadingText="Sending..."
          disabled={!looksLikeEmail(email)}
        >
          Send code
        </Button>
      </form>

      <p className="text-center text-muted mt-6">
        Remember your password?{' '}
        <Link href="/login" className="text-primary-600 hover:underline font-semibold">
          Back to login
        </Link>
      </p>
    </>
  )
}
