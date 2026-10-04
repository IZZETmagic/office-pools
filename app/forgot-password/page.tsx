import { Suspense } from 'react'
import { ForgotPasswordForm } from './ForgotPasswordForm'
import { AuthLayout } from '@/components/ui/AuthLayout'

export default function ForgotPasswordPage() {
  return (
    <AuthLayout>
      <Suspense>
        <ForgotPasswordForm />
      </Suspense>
    </AuthLayout>
  )
}
