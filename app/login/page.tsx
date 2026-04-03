import { Suspense } from 'react'
import { LoginForm } from './LoginForm'
import { AuthLayout } from '@/components/ui/AuthLayout'

export default function LoginPage() {
  return (
    <AuthLayout>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  )
}
