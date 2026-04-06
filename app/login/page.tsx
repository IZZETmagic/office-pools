import { Suspense } from 'react'
import type { Metadata } from 'next'
import { LoginForm } from './LoginForm'
import { AuthLayout } from '@/components/ui/AuthLayout'

export const metadata: Metadata = {
  title: 'Log In',
  description: 'Log in to your Sport Pool account to manage your FIFA World Cup 2026 prediction pools.',
}

export default function LoginPage() {
  return (
    <AuthLayout>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  )
}
