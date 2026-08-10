'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Alert } from '@/components/ui/Alert'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') || '/dashboard'
  const supabase = createClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase
          .from('users')
          .update({ last_login: new Date().toISOString() })
          .eq('auth_user_id', user.id)
      }
      router.push(redirectTo)
      router.refresh()
    }
  }

  return (
    <>
      {/* Plain and functional: the panel beside it carries the warm line, and
          two "Welcome back"s on one screen is one too many. */}
      <h2 className="text-xl font-black tracking-tight text-ink text-center">Log in</h2>
      <p className="text-muted text-center mb-8">Pick up where you left off.</p>

      {error && <Alert variant="error">{error}</Alert>}

      <form onSubmit={handleLogin} className="space-y-5">
        <FormField label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
          />
        </FormField>

        <FormField label="Password">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
          />
        </FormField>

        <div className="text-right">
          <Link href="/forgot-password" className="text-sm text-primary-600 hover:underline">
            Forgot password?
          </Link>
        </div>

        <Button type="submit" fullWidth size="lg" loading={loading} loadingText="Signing in...">
          Sign In
        </Button>
      </form>

      <p className="text-center text-muted mt-6">
        Don&apos;t have an account?{' '}
        <Link href={redirectTo !== '/dashboard' ? `/signup?redirectTo=${encodeURIComponent(redirectTo)}` : '/signup'} className="text-primary-600 hover:underline font-semibold">
          Sign up
        </Link>
      </p>

      <p className="text-center mt-3">
        <Link href="/" className="text-sm text-muted hover:underline">
          &larr; Back to home
        </Link>
      </p>
    </>
  )
}
