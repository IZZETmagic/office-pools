import Link from 'next/link'
import { AuthLayout } from '@/components/ui/AuthLayout'

export default function EmailSentPage() {
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
          <h2 className="text-3xl font-bold text-neutral-900">Check your email</h2>
          <p className="mt-2 text-neutral-600">
            We&apos;ve sent a password reset link to your email address.
          </p>
        </div>

        {/* Instructions */}
        <div className="flex items-start gap-3 bg-primary-50 border border-primary-200 rounded-xl p-4 text-left">
          <svg className="w-5 h-5 text-primary-800 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <div>
            <p className="text-sm text-neutral-700 mb-2 leading-5">
              Click the link in the email to reset your password.
            </p>
            <p className="text-sm text-neutral-700 font-medium">
              Didn&apos;t receive the email?
            </p>
            <ul className="mt-1 text-sm text-neutral-600 list-disc list-inside">
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
