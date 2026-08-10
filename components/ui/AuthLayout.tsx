import { Wordmark } from './Wordmark'

type AuthLayoutProps = {
  children: React.ReactNode
}

/**
 * One centred card on a quiet page. That is the whole layout.
 *
 * This started as a half-page brand panel — a blue gradient with a headline,
 * three feature bullets and "FIFA World Cup 2026" — then became a dark band
 * with the live board in it, then the same band with per-page copy. Each pass
 * fixed a real fault and none of them fixed the premise: an auth page was being
 * asked to sell something to someone who has already decided.
 *
 * There is nothing to sell here. People arrive either because they have an
 * account or because they just chose to make one, and in both cases the job is
 * to get out of the way. So: no panel, no headline, no proof, and no copy props
 * to argue over. Brand, form, done.
 *
 * The forms bring their own heading and their own footer links, so this supplies
 * only the chassis. Whatever a page needs to say, it says in its form.
 */
export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="relative min-h-screen bg-snow px-4 py-10 sm:py-16 flex items-center justify-center overflow-hidden">
      {/* A wash of brand colour behind the card, kept well below the level where
          it would compete with anything. It is the only decoration on the page,
          and the only thing tying it to the landing page's palette. */}
      <div
        className="absolute inset-0 pointer-events-none"
        aria-hidden
        style={{
          background:
            'radial-gradient(60rem 40rem at 50% -10%, color-mix(in srgb, var(--primary-600) 10%, transparent), transparent 70%),' +
            'radial-gradient(45rem 30rem at 85% 110%, color-mix(in srgb, var(--accent-400) 7%, transparent), transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-md">
        <div className="rounded-card bg-surface border border-border-subtle shadow-card-elevated p-7 sm:p-9">
          <div className="flex justify-center mb-7">
            <Wordmark size={26} />
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
