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
 * to argue over. Brand, form, done — floating on a soft halo of brand colour.
 *
 * The forms bring their own heading and their own footer links, so this supplies
 * only the chassis. Whatever a page needs to say, it says in its form.
 */
export function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="relative min-h-screen bg-snow px-4 py-10 sm:py-16 flex items-center justify-center overflow-hidden">
      <div className="relative w-full max-w-md">
        {/* The glow belongs to the card, not the page. Anchored to the top of
            the viewport it was just a wash somewhere above; centred behind the
            card and bled well past its edges, it reads as the card's own aura —
            which is what makes it look lifted rather than laid on.

            closest-side keeps the falloff tied to the element as it grows, so
            the halo stays proportional on the taller signup form instead of
            being sized for the short login one. */}
        <div
          className="absolute -inset-24 sm:-inset-32 pointer-events-none"
          aria-hidden
          style={{
            background:
              'radial-gradient(closest-side, color-mix(in srgb, var(--primary-600) 22%, transparent), transparent),' +
              'radial-gradient(closest-side at 70% 80%, color-mix(in srgb, var(--accent-400) 12%, transparent), transparent)',
          }}
        />

        {/* Shadow stays at the system's card-elevated. These are deliberately
            almost invisible — the separation comes from the snow/surface step
            and now the halo, not from deepening the shadow. */}
        <div className="relative rounded-card bg-surface border border-border-subtle shadow-card-elevated p-7 sm:p-9">
          <div className="flex justify-center mb-7">
            <Wordmark size={26} />
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
