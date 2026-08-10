import { Suspense } from 'react'
import type { Metadata } from 'next'
import { LoginForm } from './LoginForm'
import { AuthLayout } from '@/components/ui/AuthLayout'

export const metadata: Metadata = {
  title: 'Log In',
  description: 'Log in to your SportPool account to manage your prediction pools.',
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
