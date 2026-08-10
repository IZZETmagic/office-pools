import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'
import { AuthLayout } from '@/components/ui/AuthLayout'

export default function EmailSentPage() {
  return (
    <AuthLayout>
      <div className="text-center space-y-6">

        {/* Success icon */}
        <div className="mx-auto w-16 h-16 bg-success-100 rounded-full flex items-center justify-center">
          <Icon name="checkmark" size={32} className="text-success-600" />
        </div>

        <div>
          <h2 className="text-xl font-black tracking-tight text-ink text-center">Check your email</h2>
          <p className="mt-2 text-muted">
            We&apos;ve sent a password reset link to your email address.
          </p>
        </div>

        {/* Instructions */}
        <div className="flex items-start gap-3 bg-primary-50 border border-primary-200 rounded-xl p-4 text-left dark:bg-primary-900/20 dark:border-primary-800">
          <Icon name="info.circle.fill" size={20} className="text-primary-800 dark:text-primary-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-muted mb-2 leading-5">
              Click the link in the email to reset your password.
            </p>
            <p className="text-sm text-muted font-medium">
              Didn&apos;t receive the email?
            </p>
            <ul className="mt-1 text-sm text-muted list-disc list-inside">
              <li>Check your spam folder</li>
              <li>Make sure you entered the correct email</li>
            </ul>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/forgot-password"
            className="px-6 py-2 border-2 border-primary-600 text-primary-600 rounded-xl hover:bg-primary-50 transition font-semibold text-center"
          >
            Resend Email
          </Link>
          <Link
            href="/login"
            className="px-6 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition font-semibold text-center"
          >
            Back to Login
          </Link>
        </div>

      </div>
    </AuthLayout>
  )
}
