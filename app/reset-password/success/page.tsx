import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { AuthLayout } from '@/components/ui/AuthLayout'

export default function ResetSuccessPage() {
  return (
    <AuthLayout>
      <div className="text-center space-y-6">

        {/* Success icon */}
        <div className="mx-auto w-16 h-16 bg-success-100 rounded-full flex items-center justify-center">
          <Icon name="checkmark" size={32} className="text-success-600" />
        </div>

        <div>
          <h2 className="text-xl font-black tracking-tight text-ink text-center">Password reset successful</h2>
          <p className="mt-2 text-muted">
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
