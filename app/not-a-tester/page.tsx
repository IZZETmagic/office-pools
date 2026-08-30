import Link from 'next/link'
import { Icon } from '@/components/ui/Icon'

export const metadata = {
  title: 'Invited testers only',
  robots: { index: false, follow: false },
}

export default function NotATesterPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 to-accent-100 flex items-center justify-center px-4">
      <div className="bg-surface p-8 rounded-xl shadow-lg max-w-md w-full text-center space-y-6 dark:shadow-none dark:border dark:border-border-default">

        <div className="mx-auto w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center">
          <Icon name="lock" size={32} className="text-primary-600" />
        </div>

        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Testers only, for now</h1>
          <p className="mt-2 text-neutral-600">
            This is a preview build of SportPool, open to a small group of invited
            testers while we get the new season ready. Your account is signed in,
            it just isn&apos;t on the list yet.
          </p>
          <p className="mt-4 text-neutral-600">
            Want in? Reply to your invite, or{' '}
            <Link href="/contact" className="text-primary-600 hover:underline font-medium">
              get in touch
            </Link>
            .
          </p>
        </div>

        <div className="space-y-3">
          <a
            href="https://sportpool.io"
            className="block px-8 py-2 bg-primary-600 text-white rounded-xl hover:bg-primary-700 transition font-semibold"
          >
            Go to SportPool
          </a>
          <form method="post" action="/auth/signout">
            <button
              type="submit"
              className="w-full px-8 py-2 text-neutral-600 hover:text-neutral-900 transition font-medium"
            >
              Sign out
            </button>
          </form>
        </div>

      </div>
    </div>
  )
}
