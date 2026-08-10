import { Wordmark } from './Wordmark'

type AuthLayoutProps = {
  children: React.ReactNode
  /** First line of the panel headline — the plain half. */
  headline: string
  /**
   * Optional second line, set in the brand blue. Optional on purpose: when
   * every page had one, all six opened with the same two-beat rhythm and the
   * shape did the writing. Most of them say more in one line.
   */
  accent?: string
  /** One supporting line under the headline. */
  sub: string
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
 * band, the same brand glow, and nothing else but words.
 *
 * The live board was here briefly and was wrong. A leaderboard that reorders
 * itself is a feature — putting it on the door makes the page look like the app
 * before anyone is in it, and asks a returning member to watch strangers score
 * points while they type their password. The panels worth copying (Figma,
 * mymind, Proton) are type on colour and nothing more. It also means auth no
 * longer ships a client component with a running timer.
 *
 * The words are passed in, because the two pages meet people in opposite
 * states. Signing in is a return — someone already has pools, and the panel
 * should say so. Signing up is a first meeting, and should read like an
 * invitation. One shared panel saying the same thing to both treated a member
 * of eight months and a total stranger identically.
 */
export function AuthLayout({ children, headline, accent, sub }: AuthLayoutProps) {
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

        {/* The type is the whole panel now, so it is set at display scale
            rather than the section-heading size it used beside the board. */}
        <div className="relative z-10 max-w-lg">
          <h2 className="text-4xl xl:text-5xl font-black tracking-tight text-ink text-balance leading-[1.06]">
            {headline}
            {accent && <span className="block text-primary-600">{accent}</span>}
          </h2>
          <p className="mt-5 text-lg text-muted max-w-md">{sub}</p>
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
