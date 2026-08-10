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
    /* A first meeting, so it sells the fun rather than the mechanism. The
       arguing IS the product — the banter is what people turn up for — and
       naming it is warmer than another line about setting up a pool.

       Not the landing page's "everyone's got an opinion" again: it works as a
       headline to a crowd and lands as a brush-off when aimed at one person. */
    <AuthLayout
      headline={"The best bit"}
      accent={"is the arguing."}
      sub={"Make a pool, send one link, and let your group work out who actually knows their football."}
    >
      <Suspense>
        <SignupForm />
      </Suspense>
    </AuthLayout>
  )
}
