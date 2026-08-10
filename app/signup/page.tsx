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
    /* A first meeting. The landing page's line, turned into an invitation:
       everyone has a view, now let's hear yours. */
    <AuthLayout
      headline="Everyone's got an opinion."
      accent="Let's hear yours."
      sub="Set a pool up in about a minute. Free, for as many people as you like."
    >
      <Suspense>
        <SignupForm />
      </Suspense>
    </AuthLayout>
  )
}
