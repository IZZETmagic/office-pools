'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Alert } from '@/components/ui/Alert'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'

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
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-accent-100 flex items-center justify-center px-4">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">

        <h1 className="text-3xl font-bold text-neutral-900 mb-2 text-center">
          Reset Password
        </h1>
        <p className="text-center text-neutral-600 mb-6">
          Enter your email and we'll send you a link to reset your password.
        </p>

        {error && (
          <Alert variant="error">{error}</Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
            />
          </FormField>

          <Button type="submit" fullWidth loading={loading} loadingText="Sending...">
            Send Reset Link
          </Button>
        </form>

        <p className="text-center text-neutral-600 mt-4">
          Remember your password?{' '}
          <Link href="/login" className="text-primary-600 hover:underline font-semibold">
            Back to Login
          </Link>
        </p>

      </div>
    </div>
  )
}
