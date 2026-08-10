import { Suspense } from 'react'
import type { Metadata } from 'next'
import { SignupForm } from './SignupForm'
import { AuthLayout } from '@/components/ui/AuthLayout'

export const metadata: Metadata = {
  title: 'Sign Up',
  description: 'Create a free SportPool account and start a prediction pool for your group in minutes.',
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
