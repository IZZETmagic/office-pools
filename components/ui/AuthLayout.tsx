import { Icon } from './Icon'
import { Wordmark } from './Wordmark'

type AuthLayoutProps = {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">

      {/* Left side — branding panel (hidden on mobile).
          The dark gradient used to be three inline oklch literals. It now uses the
          low steps of the primary ramp, which in dark mode ARE the dark navies
          (#223056 → #1A2440 → #16203A) because the ramp inverts. */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary-700 via-primary-600 to-primary-800 dark:from-primary-200 dark:via-primary-100 dark:to-primary-50 text-white flex-col justify-between p-12 relative overflow-hidden">

        {/* Decorative background shapes */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="absolute -top-20 -left-20 w-72 h-72 bg-white/5 rounded-full" />
          <div className="absolute top-1/3 -right-16 w-56 h-56 bg-white/5 rounded-full" />
          <div className="absolute -bottom-12 left-1/4 w-40 h-40 bg-white/5 rounded-full" />
        </div>

        {/* Top — brand */}
        <div className="relative z-10">
          <Wordmark size={30} mono />
          <p className="text-primary-200 dark:text-white/50 text-lg">FIFA World Cup 2026</p>
        </div>

        {/* Center — tagline and feature highlights */}
        <div className="relative z-10 space-y-8">
          <h2 className="text-4xl font-bold leading-tight">
            Predict. Compete.<br />Win.
          </h2>
          <p className="text-primary-200 dark:text-white/50 text-lg max-w-md">
            Join your friends and compete to see who knows the beautiful game best.
          </p>

          {/* Icon tiles, replacing the emoji — the app uses Hugeicons glyphs here and
              emoji render differently on every platform. */}
          <div className="space-y-4">
            {[
              { icon: 'trophy.fill', label: 'Predict match scores & climb the leaderboard' },
              { icon: 'chart.bar.fill', label: 'Track your stats and accuracy over time' },
              { icon: 'person.3.fill', label: 'Create or join pools with friends & family' },
            ].map(({ icon, label }) => (
              <div key={icon} className="flex items-center gap-3">
                <span className="flex items-center justify-center w-10 h-10 rounded-control bg-white/10 shrink-0">
                  <Icon name={icon} size={20} weight="semibold" tint="#FFFFFF" />
                </span>
                <span className="text-primary-100 dark:text-white/60">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom */}
        <div className="relative z-10 text-primary-300 dark:text-white/40 text-sm">
          &copy; 2026 SportPool
        </div>
      </div>

      {/* Right side — form content */}
      <div className="flex-1 flex flex-col bg-surface-secondary">

        {/* Mobile-only brand header + tagline — pinned to top.
            Uses the real wordmark; the dark panel above cannot, because "Pool" is
            set in the brand blue and would disappear into a blue background. */}
        <div className="lg:hidden px-6 pt-6 pb-4">
          <Wordmark size={24} />
          <p className="t-body text-muted">FIFA World Cup 2026</p>
        </div>

        <div className="flex-1 flex items-center justify-center px-6 py-8 lg:py-12">
          <div className="w-full max-w-md">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
