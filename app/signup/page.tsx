'use client'

import { useState, useCallback } from 'react'
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
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')

  const router = useRouter()
  const supabase = createClient()

  const checkUsername = useCallback(async (value: string) => {
    if (value.length < 3) {
      setUsernameStatus('idle')
      return
    }
    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      setUsernameStatus('idle')
      return
    }
    setUsernameStatus('checking')
    const { data } = await supabase
      .from('users')
      .select('user_id')
      .eq('username', value)
      .single()
    setUsernameStatus(data ? 'taken' : 'available')
  }, [supabase])

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Validate username format
    if (!username || username.length < 3 || username.length > 20) {
      setError('Username must be 3-20 characters.')
      setLoading(false)
      return
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError('Username can only contain letters, numbers, and underscores.')
      setLoading(false)
      return
    }
    if (usernameStatus === 'taken') {
      setError('That username is already taken.')
      setLoading(false)
      return
    }

    // Double-check availability before creating auth user
    const { data: existing } = await supabase
      .from('users')
      .select('user_id')
      .eq('username', username)
      .single()

    if (existing) {
      setUsernameStatus('taken')
      setError('That username is already taken.')
      setLoading(false)
      return
    }

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
        // Check if it's a unique constraint violation
        if (profileError.code === '23505' && profileError.message?.includes('username')) {
          setError('That username was just taken. Please choose another.')
          setUsernameStatus('taken')
          setLoading(false)
          return
        }
        console.error('Profile update error:', profileError)
      }

      router.push('/dashboard')
    }
  }

  const usernameError = username.length > 0 && username.length < 3
    ? 'Username must be at least 3 characters'
    : username.length > 0 && !/^[a-zA-Z0-9_]*$/.test(username)
    ? 'Only letters, numbers, and underscores'
    : undefined

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

        <FormField
          label="Username"
          helperText="3-20 characters, letters, numbers, and underscores only"
          error={usernameError}
        >
          <div className="relative">
            <Input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value)
                setUsernameStatus('idle')
              }}
              onBlur={() => checkUsername(username)}
              required
              maxLength={20}
              placeholder="johnsmith"
              className={usernameStatus === 'taken' ? '!border-danger-500 !focus:ring-danger-500' : ''}
            />
            {usernameStatus === 'checking' && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500">Checking...</span>
            )}
            {usernameStatus === 'available' && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-success-600 font-medium">Available ✓</span>
            )}
            {usernameStatus === 'taken' && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-danger-600 font-medium">Taken</span>
            )}
          </div>
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

        <Button
          type="submit"
          fullWidth
          size="lg"
          loading={loading}
          loadingText="Creating account..."
          disabled={usernameStatus === 'taken' || usernameStatus === 'checking'}
        >
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
