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

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const router = useRouter()
  const supabase = createClient()

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    if (authData.user) {
      const { error: profileError } = await supabase
        .from('users')
        .update({
          username,
          full_name: fullName,
        })
        .eq('auth_user_id', authData.user.id)

      if (profileError) {
        console.error('Profile update error:', profileError)
      }

      router.push('/dashboard')
    }
  }

  return (
    <AuthLayout>
      <h2 className="text-3xl font-bold text-neutral-900 mb-2">Create account</h2>
      <p className="text-neutral-500 mb-8">Get started with your prediction pool</p>

      {error && <Alert variant="error">{error}</Alert>}

      <form onSubmit={handleSignup} className="space-y-5">
        <FormField label="Full Name">
          <Input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            placeholder="John Smith"
          />
        </FormField>

        <FormField label="Username">
          <Input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            placeholder="johnsmith"
          />
        </FormField>

        <FormField label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
          />
        </FormField>

        <FormField label="Password" helperText="At least 6 characters">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            placeholder="••••••••"
          />
        </FormField>

        <Button type="submit" fullWidth size="lg" loading={loading} loadingText="Creating account...">
          Sign Up
        </Button>
      </form>

      <p className="text-center text-neutral-600 mt-6">
        Already have an account?{' '}
        <Link href="/login" className="text-primary-600 hover:underline font-semibold">
          Sign in
        </Link>
      </p>

      <p className="text-center mt-3">
        <Link href="/" className="text-sm text-neutral-500 hover:underline">
          &larr; Back to home
        </Link>
      </p>
    </AuthLayout>
  )
}
