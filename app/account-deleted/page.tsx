import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'

export default function AccountDeletedPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-accent-100 flex items-center justify-center px-4">
      <div className="bg-surface p-8 rounded-xl shadow-lg max-w-md w-full text-center space-y-6 dark:shadow-none dark:border dark:border-border-default">

        {/* Success icon */}
        <div className="mx-auto w-16 h-16 bg-success-100 rounded-full flex items-center justify-center">
          <Icon name="checkmark" size={32} className="text-success-600" />
        </div>

        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Account Deleted</h1>
          <p className="mt-2 text-neutral-600">
            Your account and all associated data have been permanently deleted. We're sorry to see you go.
          </p>
        </div>

        <Link
          href="/"
          className="inline-block px-8 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition font-semibold"
        >
          Return to Home
        </Link>

      </div>
    </div>
  )
}
