import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/Button'

export async function PublicNav() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <nav className="sticky top-0 z-50 bg-surface/95 backdrop-blur-sm border-b border-neutral-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="text-xl font-bold text-neutral-900">
            ⚽ Sport Pool
          </Link>
          <div className="flex items-center gap-3">
            {user ? (
              <Button href="/dashboard" size="sm">
                Back to Dashboard
              </Button>
            ) : (
              <>
                <Button href="/login" variant="outline" size="sm">
                  Log In
                </Button>
                <Button href="/signup" size="sm">
                  Sign Up
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </nav>
  )
}
