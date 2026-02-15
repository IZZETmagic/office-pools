'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Alert } from '@/components/ui/Alert'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'
import { Button } from '@/components/ui/Button'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const router = useRouter()
  const supabase = createClient()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setLoading(true)

    const { error } = await supabase.auth.updateUser({
      password: password,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/reset-password/success')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">

        <h1 className="text-3xl font-bold text-gray-900 mb-2 text-center">
          Set New Password
        </h1>
        <p className="text-center text-gray-600 mb-6">
          Enter your new password below.
        </p>

        {error && (
          <Alert variant="error">{error}</Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="New Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter new password"
              minLength={8}
            />
          </FormField>

          <FormField label="Confirm Password">
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="Confirm new password"
              minLength={8}
            />
          </FormField>

          {/* Password requirements */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Password requirements:</p>
            <ul className="text-sm text-gray-600 space-y-1">
              <li className={password.length >= 8 ? 'text-green-600' : ''}>
                {password.length >= 8 ? '\u2713' : '\u2022'} At least 8 characters
              </li>
              <li>{'\u2022'} Mix of letters and numbers recommended</li>
            </ul>
          </div>

          <Button
            type="submit"
            fullWidth
            loading={loading}
            loadingText="Resetting Password..."
            disabled={password.length < 8}
          >
            Reset Password
          </Button>
        </form>

      </div>
    </div>
  )
}
