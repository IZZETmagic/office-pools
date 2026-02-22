import Link from 'next/link'

export default function EmailSentPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-accent-100 flex items-center justify-center px-4">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center space-y-6">

        {/* Success icon */}
        <div className="mx-auto w-16 h-16 bg-success-100 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Check Your Email</h1>
          <p className="mt-2 text-neutral-600">
            We've sent a password reset link to your email address.
          </p>
        </div>

        {/* Instructions */}
        <div className="bg-primary-50 border border-primary-200 rounded-lg p-4 text-left">
          <p className="text-sm text-neutral-700 mb-2">
            Click the link in the email to reset your password.
          </p>
          <p className="text-sm text-neutral-700 font-medium">
            Didn't receive the email?
          </p>
          <ul className="mt-1 text-sm text-neutral-600 list-disc list-inside">
            <li>Check your spam folder</li>
            <li>Make sure you entered the correct email</li>
          </ul>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/forgot-password"
            className="px-6 py-2 border-2 border-primary-600 text-primary-600 rounded-lg hover:bg-primary-50 transition font-semibold text-center"
          >
            Resend Email
          </Link>
          <Link
            href="/login"
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-semibold text-center"
          >
            Back to Login
          </Link>
        </div>

      </div>
    </div>
  )
}
