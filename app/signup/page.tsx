import { Suspense } from 'react'
import type { Metadata } from 'next'
import { SignupForm } from './SignupForm'
import { AuthLayout } from '@/components/ui/AuthLayout'

export const metadata: Metadata = {
  title: 'Sign Up',
  description: 'Create a free Sport Pool account and start your FIFA World Cup 2026 prediction pool in minutes.',
}

export default function SignupPage() {
  return (
    <AuthLayout>
      <Suspense>
        <SignupForm />
      </Suspense>
    </AuthLayout>
  )
}
