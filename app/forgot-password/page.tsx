'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Alert } from '@/components/ui/Alert'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'
import { AuthLayout } from '@/components/ui/AuthLayout'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/forgot-password/sent')
    }
  }

  return (
    <AuthLayout>
      <h2 className="text-xl font-black tracking-tight text-ink text-center">Reset password</h2>
      <p className="text-muted text-center mb-8">
        Enter your email and we&apos;ll send you a link to reset your password.
      </p>

      {error && <Alert variant="error">{error}</Alert>}

      <form onSubmit={handleSubmit} className="space-y-5">
        <FormField label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
          />
        </FormField>

        <Button type="submit" fullWidth size="lg" loading={loading} loadingText="Sending...">
          Send Reset Link
        </Button>
      </form>

      <p className="text-center text-muted mt-6">
        Remember your password?{' '}
        <Link href="/login" className="text-primary-600 hover:underline font-semibold">
          Back to login
        </Link>
      </p>
    </AuthLayout>
  )
}
