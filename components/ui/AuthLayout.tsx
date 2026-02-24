type AuthLayoutProps = {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">

      {/* Left side — branding panel (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary-700 via-primary-600 to-primary-800 dark:from-[oklch(0.22_0.08_262)] dark:via-[oklch(0.18_0.06_264)] dark:to-[oklch(0.15_0.05_265)] text-white flex-col justify-between p-12 relative overflow-hidden">

        {/* Decorative background shapes */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="absolute -top-20 -left-20 w-72 h-72 bg-white/5 rounded-full" />
          <div className="absolute top-1/3 -right-16 w-56 h-56 bg-white/5 rounded-full" />
          <div className="absolute -bottom-12 left-1/4 w-40 h-40 bg-white/5 rounded-full" />
        </div>

        {/* Top — brand */}
        <div className="relative z-10 grid grid-cols-[auto_1fr] gap-x-3 items-start">
          <span className="text-4xl row-span-2">&#9917;</span>
          <h1 className="text-3xl font-bold tracking-tight">Sport Pool</h1>
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

          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-white/10 text-xl">&#127942;</span>
              <span className="text-primary-100 dark:text-white/60">Predict match scores &amp; climb the leaderboard</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-white/10 text-xl">&#128202;</span>
              <span className="text-primary-100 dark:text-white/60">Track your stats and accuracy over time</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-white/10 text-xl">&#128101;</span>
              <span className="text-primary-100 dark:text-white/60">Create or join pools with friends &amp; family</span>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="relative z-10 text-primary-300 dark:text-white/40 text-sm">
          &copy; 2026 Sport Pool
        </div>
      </div>

      {/* Right side — form content */}
      <div className="flex-1 flex flex-col bg-surface-secondary">

        {/* Mobile-only brand header + tagline — pinned to top */}
        <div className="lg:hidden px-6 pt-6 pb-4 grid grid-cols-[auto_1fr] gap-x-2 items-start">
          <span className="text-3xl row-span-2">&#9917;</span>
          <h1 className="text-2xl font-bold text-neutral-900">Sport Pool</h1>
          <p className="text-neutral-500 text-sm">FIFA World Cup 2026</p>
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
