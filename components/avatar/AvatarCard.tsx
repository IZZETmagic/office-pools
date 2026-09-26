'use client'

// =============================================================
// The avatar card — face, identity and the headline numbers, in one card
// =============================================================
// The avatar used to be a 96px circle inside a gradient hero, in the slot the initials block had
// always occupied. Ryan: *"I just want the avatar and the avatar editing to be more of a focus.
// Like having an avatar card."* Then, once it existed: *"can we condense this information with
// the avatar card?"* — because a centred figure on a 2,000px banner leaves a field of dead colour
// either side while the name and the stat tiles stack up underneath it.
//
// So the card absorbed both: the avatar holds the left, everything else uses the space it was
// wasting, and three stacked blocks became one.
//
// ⭐⭐ THE EMPTY STATE IS THE PRIMARY STATE. Measured against production when this was written:
// ONE of 4,839 members had built an avatar. So for essentially everyone this card's job is not to
// show a face off — it is to invite them to make one. Designing around the filled state and
// bolting on a placeholder would have been designing for a single user, who is me.
//
// ⭐ THE CARD CARRIES THE AVATAR'S OWN GROUND COLOUR, and that is load-bearing, not decoration.
// The composed SVG paints its background edge to edge across a square `viewBox="0 0 2048 2048"`
// (compose.ts `paintCanvas`). Its zone here is narrower than that square, so the square is sized
// to the zone's HEIGHT and centred, leaving bare card either side. Because both colours come from
// the same `avatarBackgroundFor` call they are the same value, so the square's edges are invisible
// and the avatar reads as painted onto the card. `AvatarBuilder`'s HEAD_CROP note states the same
// rule for its tiles: "Change one and change the other."
//
// ⚠ Everyone gets a real colour, including the 4,838 who have never picked one — `avatarIndexFor`
// hashes from `user_id` when `avatarColour` is null, so the empty card is a coloured banner with
// initials on it, never a grey box.
// =============================================================

import Link from 'next/link'
import { MemberAvatar } from './MemberAvatar'
import { Icon } from '@/components/ui/Icon'
import { formatNumber } from '@/lib/format'
import { avatarBackgroundFor, avatarIndexFor } from '@/lib/design/avatarGradient'

/**
 * ⚠⚠ EVERYTHING ON THIS CARD IS DARK, AND IT IS A LITERAL, NOT `text-ink`.
 *
 * Two separate reasons, both measured:
 *
 * 1. WHITE TEXT FAILS ON ALL TWENTY-TWO GROUNDS — 1.51:1 (powder) to 2.61:1 (rose), against
 *    WCAG's 4.5. Not one passes. White is the instinctive choice for a colour banner and it is
 *    wrong for every member. This same dark ink scores 5.90–10.19 on all 22. The old gradient
 *    hero DID use white, legitimately: it sat on primary-600/700, which is dark. These grounds
 *    are pale tints and the habit does not carry over.
 *
 * 2. IT CANNOT BE `text-ink`, which inverts to near-white under `html.dark`. The ground does NOT
 *    invert — it is the member's colour, the same value in both themes — so a theme-aware token
 *    on a theme-independent background is guaranteed to fail in one of the two. Anything painted
 *    on this card is pinned to the light palette on purpose.
 */
const ON_GROUND = 'text-[#1B2340]'
const ON_GROUND_SOFT = 'text-[#1B2340]/70'

/**
 * ⚠ SIZED TO THE ZONE'S HEIGHT, NOT ITS WIDTH, and deliberately OVER 100%.
 *
 * At 100% the whole square fits and you get the full figure shrunk into a letterbox. Over 100%
 * the square overflows the bottom and the zone shows a band off the top of the canvas instead.
 *
 * ⚠ 120%, MEASURED AGAINST RYAN'S REFERENCE, NOT PICKED. It shows the top ~83% of the canvas,
 * which is hair through mid-chest with the shirt reading. The first attempt at 138% showed 72%
 * and cut at the neck, so the shirt never appeared and the head filled the frame. The canvas
 * carries empty space above the hair (it starts around y250, an eighth down), which is where the
 * headroom above the figure comes from.
 *
 * ⚠ Overflow is only safe because the zone clips it AND carries the same colour — see the header.
 */
const AVATAR_FILL = 'absolute left-1/2 -translate-x-1/2 top-0 h-[120%] w-auto'

export function AvatarCard({
  userId, avatarColour, avatarBuild, fullName, username, memberSince, initials, stats,
}: {
  userId: string
  avatarColour: string | null
  avatarBuild: unknown
  fullName: string | null
  username: string
  /** Already formatted by the caller, which owns `formatMemberSince`. */
  memberSince: string
  initials: string
  /** The headline numbers, in display order. Formatted here, not by the caller. */
  stats: { label: string; value: number }[]
}) {
  const ground = avatarBackgroundFor(avatarIndexFor(userId, avatarColour))

  // ⚠ The LAYOUT decision, not the "can this deploy draw it" decision. A row that exists but
  // names an asset this bundle does not have still renders initials — that is MemberAvatar's
  // `fallback`, below. This only asks which of the two cards to build, and needs no bundle.
  const hasAvatar = avatarBuild != null

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6">
      <div
        className="relative rounded-card overflow-hidden flex flex-col sm:flex-row sm:h-[280px]"
        style={{ backgroundColor: ground }}
      >
        {/* ⚠ The avatar zone needs a DEFINITE height for `h-[120%]` to resolve against — hence
            a fixed band on mobile and `h-full` inside a fixed-height card on desktop. A card
            sized only by its content would collapse the percentage and the avatar would vanish.

            ⚠⚠ THESE THREE NUMBERS ARE ONE NUMBER: the card is h-[280px], the fill is 120%, so
            the square renders 336px wide and the zone must be 336 to hold it. At the 280 I first
            wrote it clipped 28px off EACH SIDE — measured — which ate the hair and both ears.
            Change the card height or the fill and this width changes with them. */}
        <div className="relative h-[168px] sm:h-full w-full sm:w-[336px] shrink-0 overflow-hidden">
          {hasAvatar ? (
            <MemberAvatar
              userId={userId}
              avatarColour={avatarColour}
              avatarBuild={avatarBuild}
              svgClassName="[&>svg]:h-full [&>svg]:w-auto [&>svg]:block"
              className={AVATAR_FILL}
              // While the 169 KB of art is in flight the card is already the right colour, so the
              // initials sit on the finished background and nothing jumps but the figure.
              fallback={<InitialsMark initials={initials} />}
            />
          ) : (
            <InitialsMark initials={initials} />
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-center gap-4 px-5 pb-5 sm:px-0 sm:pb-0 sm:pr-6">
          <div className="min-w-0">
            <h2 className={`text-2xl sm:text-3xl font-bold truncate ${ON_GROUND}`}>
              {fullName || username}
            </h2>
            <p className={`text-sm sm:text-base truncate ${ON_GROUND}/80`}>@{username}</p>
            <p className={`text-xs sm:text-sm mt-0.5 ${ON_GROUND_SOFT}`}>Member since {memberSince}</p>
          </div>

          {/* ⚠ No card chrome on these. They used to be three separate tiles in their own row
              below; giving them borders and a surface again would just rebuild the stack this
              card exists to collapse. On the ground they are numbers, not boxes. */}
          <div className="flex items-center gap-5 sm:gap-8">
            {stats.map((s) => (
              <div key={s.label} className="min-w-0">
                <p className={`t-num text-xl sm:text-2xl ${ON_GROUND}`}>{formatNumber(s.value)}</p>
                <p className={`text-[11px] sm:text-xs truncate ${ON_GROUND_SOFT}`}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* The call to action only exists on the empty card. Once you have a face the pencil is
              enough — a permanent "Build your avatar" button over your own avatar reads as though
              the app has not noticed you already did. */}
          {!hasAvatar && (
            <Link
              href="/profile/avatar"
              className={`inline-flex self-start items-center gap-2 px-4 py-2 rounded-control
                          bg-white/90 hover:bg-white text-[13px] font-semibold transition-colors ${ON_GROUND}`}
            >
              Build your avatar
              <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>

        {/* ⚠ A WHITE CHIP WITH A DARK GLYPH, for the same reason the text is dark — a white icon
            on `bg-black/15` was invisible on the pale half of the palette. White at 90% is
            near-white on any of the 22, so the dark glyph always reads. */}
        <Link
          href="/profile/avatar"
          aria-label={hasAvatar ? 'Edit your avatar' : 'Build your avatar'}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10 w-10 h-10 rounded-control
                     bg-white/90 hover:bg-white shadow-card
                     flex items-center justify-center transition-colors"
        >
          <Icon name="pencil.line" size={18} weight="semibold" className={ON_GROUND} />
        </Link>
      </div>
    </div>
  )
}

/** Today's initials treatment, kept for the empty card and for art still in flight. */
function InitialsMark({ initials }: { initials: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className={`w-20 h-20 sm:w-24 sm:h-24 rounded-pill bg-white/35 border-2 border-white/60
                       flex items-center justify-center text-3xl font-bold ${ON_GROUND}`}>
        {initials}
      </div>
    </div>
  )
}
