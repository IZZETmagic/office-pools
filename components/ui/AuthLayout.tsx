import { Wordmark } from './Wordmark'
import { LiveBoard } from '@/app/LiveBoard'

type AuthLayoutProps = {
  children: React.ReactNode
}

/**
 * The split every sign-in page uses: brand and proof on one side, the form on
 * the other. What changed is what fills the brand half.
 *
 * It used to be a blue gradient carrying "Predict. Compete. Win.", three
 * generic feature bullets, and "FIFA World Cup 2026" — twice. That tournament
 * finished on 16 July, and the headline was retired from the landing page in
 * the same rebuild. Somebody arriving here from that page met a different
 * product making a stale promise.
 *
 * Now it continues the landing page instead of contradicting it: the same dark
 * band, the same sentence, and the board doing the arguing. Showing the product
 * beats listing its features, and this one is already built — see LiveBoard for
 * why it only ever renders the demo pool.
 */
export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* dark-scope: this panel is dark in EITHER colour mode. Without it the
          ramp inverts and every word would be #1B2340 navy on navy. */}
      <div className="dark-scope hidden lg:flex lg:w-1/2 bg-snow flex-col justify-between p-12 relative overflow-hidden">
        {/* The same brand glow the landing hero puts behind its board, so the
            two pages read as one surface rather than two dark rectangles. */}
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden
          style={{
            background:
              'radial-gradient(circle at 15% 10%, color-mix(in srgb, var(--primary-600) 26%, transparent), transparent 55%),' +
              'radial-gradient(circle at 85% 90%, color-mix(in srgb, var(--accent-400) 18%, transparent), transparent 55%)',
          }}
        />

        <div className="relative z-10">
          <Wordmark size={26} />
        </div>

        <div className="relative z-10 flex flex-col gap-8">
          <h2 className="text-3xl xl:text-4xl font-black tracking-tight text-ink text-balance leading-[1.08]">
            Everyone&apos;s got an opinion.
            <span className="block text-primary-600">One table settles it.</span>
          </h2>
          <LiveBoard />
        </div>

        <p className="relative z-10 t-detail text-muted">&copy; 2026 SportPool</p>
      </div>

      <div className="flex-1 flex flex-col bg-snow">
        {/* Mobile-only brand header. The dark panel is hidden at this width, so
            the wordmark has to appear somewhere. */}
        <div className="lg:hidden px-6 pt-6 pb-4">
          <Wordmark size={24} />
        </div>

        <div className="flex-1 flex items-center justify-center px-6 py-8 lg:py-12">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
    </div>
  )
}
