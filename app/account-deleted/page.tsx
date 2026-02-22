import Link from 'next/link'

export default function AccountDeletedPage() {
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
          <h1 className="text-3xl font-bold text-neutral-900">Account Deleted</h1>
          <p className="mt-2 text-neutral-600">
            Your account and all associated data have been permanently deleted. We're sorry to see you go.
          </p>
        </div>

        <Link
          href="/"
          className="inline-block px-8 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-semibold"
        >
          Return to Home
        </Link>

      </div>
    </div>
  )
}
