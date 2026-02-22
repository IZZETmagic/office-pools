'use client' // This tells Next.js this is a client-side component (needed for forms and interactivity)

import { useState } from 'react' // useState lets us track form field values
import { createClient } from '@/lib/supabase/client' // Our Supabase connection
import { useRouter } from 'next/navigation' // Lets us redirect the user after login
import Link from 'next/link' // Used for navigation links (like "Don't have an account?")
import { Alert } from '@/components/ui/Alert'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'

export default function LoginPage() {

  // =====================
  // FORM FIELD VALUES
  // Each useState tracks what the user is typing in each field
  // =====================
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // =====================
  // UI STATE
  // Controls loading spinner and error messages
  // =====================
  const [loading, setLoading] = useState(false) // True while waiting for Supabase response
  const [error, setError] = useState<string | null>(null) // Holds any error message to show the user

  const router = useRouter() // Used to redirect to dashboard after login
  const supabase = createClient() // Create our Supabase client connection

  // =====================
  // HANDLE FORM SUBMISSION
  // Runs when the user clicks "Sign In"
  // =====================
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault() // Stops the page from refreshing on form submit
    setLoading(true) // Show loading state on button
    setError(null) // Clear any previous errors

    // Send email and password to Supabase to check against auth records
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      // Login failed - show the error message and stop loading
      setError(error.message)
      setLoading(false)
    } else {
      // Update last_login timestamp in public users table
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase
          .from('users')
          .update({ last_login: new Date().toISOString() })
          .eq('auth_user_id', user.id)
      }

      // Login succeeded! Redirect to dashboard
      router.push('/dashboard')
      router.refresh() // Forces Next.js to re-check auth state
    }
  }

  // =====================
  // PAGE LAYOUT
  // =====================
  return (
    // Full screen blue gradient background
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-accent-100 flex items-center justify-center px-4">

      {/* White card container */}
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">

        {/* Page title */}
        <h1 className="text-3xl font-bold text-neutral-900 mb-6 text-center">
          Sign In
        </h1>

        {/* Error message - only shows if there is an error */}
        {error && (
          <Alert variant="error">{error}</Alert>
        )}

        {/* Login form */}
        <form onSubmit={handleLogin} className="space-y-4">

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
          <FormField label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </FormField>

          {/* Forgot password link */}
          <div className="text-right">
            <Link href="/forgot-password" className="text-sm text-primary-600 hover:underline">
              Forgot password?
            </Link>
          </div>

          {/* Submit button - shows "Signing in..." while loading */}
          <Button type="submit" fullWidth loading={loading} loadingText="Signing in...">
            Sign In
          </Button>
        </form>

        {/* Link to signup page for new users */}
        <p className="text-center text-neutral-600 mt-4">
          Don't have an account?{' '}
          <Link href="/signup" className="text-primary-600 hover:underline font-semibold">
            Sign up
          </Link>
        </p>

        {/* Back to landing page */}
        <p className="text-center mt-3">
          <Link href="/" className="text-sm text-neutral-500 hover:underline">
            ← Back to home
          </Link>
        </p>

      </div>
    </div>
  )
}