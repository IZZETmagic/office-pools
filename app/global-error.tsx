'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">Something went wrong</h1>
          <p className="text-neutral-600 mb-6">
            An unexpected error occurred. Please try again.
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={reset}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition"
            >
              Try again
            </button>
            <a
              href="/dashboard"
              className="px-4 py-2 bg-neutral-200 text-neutral-700 rounded-lg font-medium hover:bg-neutral-300 transition"
            >
              Go to Dashboard
            </a>
          </div>
        </div>
      </body>
    </html>
  )
}
