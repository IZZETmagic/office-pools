import Link from 'next/link'
import { AuthLayout } from '@/components/ui/AuthLayout'

export default function ResetSuccessPage() {
  return (
    <AuthLayout>
      <div className="text-center space-y-6">

        {/* Success icon */}
        <div className="mx-auto w-16 h-16 bg-success-100 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <div>
          <h2 className="text-3xl font-bold text-neutral-900">Password reset successful</h2>
          <p className="mt-2 text-neutral-600">
            Your password has been successfully reset. You can now log in with your new password.
          </p>
        </div>

        <Link
          href="/login"
          className="inline-block px-8 py-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition font-semibold"
        >
          Go to Login
        </Link>

      </div>
    </AuthLayout>
  )
}
