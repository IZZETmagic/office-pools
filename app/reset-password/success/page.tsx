import Link from 'next/link'

export default function ResetSuccessPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center space-y-6">

        {/* Success icon */}
        <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <div>
          <h1 className="text-3xl font-bold text-gray-900">Password Reset Successful</h1>
          <p className="mt-2 text-gray-600">
            Your password has been successfully reset. You can now log in with your new password.
          </p>
        </div>

        <Link
          href="/login"
          className="inline-block px-8 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
        >
          Go to Login
        </Link>

      </div>
    </div>
  )
}
