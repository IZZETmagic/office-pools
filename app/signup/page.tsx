import { Suspense } from 'react'
import { SignupForm } from './SignupForm'
import { AuthLayout } from '@/components/ui/AuthLayout'

export default function SignupPage() {
  return (
    <AuthLayout>
      <Suspense>
        <SignupForm />
      </Suspense>
    </AuthLayout>
  )
}
