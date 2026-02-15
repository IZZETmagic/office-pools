'use client' // This tells Next.js this is a client-side component (needed for forms and interactivity)

import { useState } from 'react' // useState lets us track form field values
import { createClient } from '@/lib/supabase/client' // Our Supabase connection
import { useRouter } from 'next/navigation' // Lets us redirect the user after signup
import Link from 'next/link' // Used for navigation links
import { Alert } from '@/components/ui/Alert'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'

export default function SignupPage() {

  // =====================
  // FORM FIELD VALUES
  // =====================
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')

  // =====================
  // UI STATE
  // =====================
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const router = useRouter()
  const supabase = createClient()

  // =====================
  // HANDLE FORM SUBMISSION
  // =====================
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // STEP 1: Create the auth account (trigger will auto-create the profile)
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // STEP 2: Update the profile with username and full name
    if (authData.user) {
      const { error: profileError } = await supabase
        .from('users')
        .update({
          username,
          full_name: fullName,
        })
        .eq('auth_user_id', authData.user.id)

      if (profileError) {
        // Non-critical error - profile was created, just couldn't update name/username
        console.error('Profile update error:', profileError)
      }

      // Redirect to dashboard regardless
      router.push('/dashboard')
    }
  }

  // =====================
  // PAGE LAYOUT
  // =====================
  return (
    // Full screen blue gradient background
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">

      {/* White card container */}
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">

        {/* Page title */}
        <h1 className="text-3xl font-bold text-gray-900 mb-6 text-center">
          Create Account
        </h1>

        {/* Error message - only shows if there is an error */}
        {error && (
          <Alert variant="error">{error}</Alert>
        )}

        {/* Signup form */}
        <form onSubmit={handleSignup} className="space-y-4">

          {/* Full Name field */}
          <FormField label="Full Name">
            <Input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              placeholder="John Smith"
            />
          </FormField>

          {/* Username field */}
          <FormField label="Username">
            <Input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="johnsmith"
            />
          </FormField>

          {/* Email field */}
          <FormField label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
            />
          </FormField>

          {/* Password field */}
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

          {/* Submit button */}
          <Button type="submit" fullWidth loading={loading} loadingText="Creating account...">
            Sign Up
          </Button>
        </form>

        {/* Link to login page for existing users */}
        <p className="text-center text-gray-600 mt-4">
          Already have an account?{' '}
          <Link href="/login" className="text-blue-600 hover:underline font-semibold">
            Sign in
          </Link>
        </p>

        {/* Back to landing page */}
        <p className="text-center mt-3">
          <Link href="/" className="text-sm text-gray-500 hover:underline">
            ← Back to home
          </Link>
        </p>

      </div>
    </div>
  )
}