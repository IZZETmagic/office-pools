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
    /* A return. Warm and short, and deliberately saying nothing about what
       they missed — an earlier draft opened with "your pools kept playing" and
       "the table will have moved", which greets someone by telling them they've
       fallen behind. No bad feelings is the product's whole purpose; the door
       is a poor place to break it. The wink at the end is as far as it goes. */
    <AuthLayout
      headline={"There you are."}
      sub={"Everything is where you left it. Well — nearly everything."}
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  )
}
