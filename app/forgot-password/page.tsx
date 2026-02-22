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
      redirectTo: `${window.location.origin}/reset-password`,
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
      <h2 className="text-3xl font-bold text-neutral-900 mb-2">Reset password</h2>
      <p className="text-neutral-500 mb-8">
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

      <p className="text-center text-neutral-600 mt-6">
        Remember your password?{' '}
        <Link href="/login" className="text-primary-600 hover:underline font-semibold">
          Back to login
        </Link>
      </p>
    </AuthLayout>
  )
}
