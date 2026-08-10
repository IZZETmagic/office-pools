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
    /* A return, not an introduction. They already have pools; the panel says
       what they're coming back to rather than pitching the product again. */
    <AuthLayout
      headline="Welcome back."
      accent="Your pools kept playing."
      sub="Results have been landing while you were away — the table will have moved."
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  )
}
