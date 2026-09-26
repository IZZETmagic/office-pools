'use client'

// =============================================================
// The avatar card — the member's face, given the room to be the point
// =============================================================
// The avatar used to be a 96px circle inside a gradient hero, in the slot the initials block had
// always occupied. Ryan: *"I just want the avatar and the avatar editing to be more of a focus.
// Like having an avatar card."* So this is a banner, and the way in to the builder.
//
// ⭐⭐ THE EMPTY STATE IS THE PRIMARY STATE. Measured against production when this was written:
// ONE of 4,839 members had built an avatar. So for essentially everyone this card's job is not to
// show a face off — it is to invite them to make one. Designing around the filled state and
// bolting on a placeholder would have been designing for a single user, who is me.
//
// ⭐ THE CARD CARRIES THE AVATAR'S OWN GROUND COLOUR, and that is load-bearing, not decoration.
// The composed SVG paints its background edge to edge across a square `viewBox="0 0 2048 2048"`
// (compose.ts `paintCanvas`). This card is far WIDER than that square, so the square is sized to
// the card's HEIGHT and centred, leaving bare card either side. Because both colours come from
// the same `avatarBackgroundFor` call they are the same value, so the square's edges are
// invisible and the avatar reads as painted onto the card. `AvatarBuilder`'s HEAD_CROP note
// states the same rule for its tiles: "Change one and change the other."
//
// ⚠ Everyone gets a real colour, including the 4,838 who have never picked one — `avatarIndexFor`
// hashes from `user_id` when `avatarColour` is null, so the empty card is a coloured banner with
// initials on it, never a grey box.
// =============================================================

import Link from 'next/link'
import { MemberAvatar } from './MemberAvatar'
import { Icon } from '@/components/ui/Icon'
import { avatarBackgroundFor, avatarIndexFor } from '@/lib/design/avatarGradient'

/**
 * ⚠ SIZED TO THE CARD'S HEIGHT, NOT ITS WIDTH, and deliberately OVER 100%.
 *
 * At 100% the whole square fits the card and you get the full figure shrunk into a letterbox —
 * a tiny person adrift in a wide field of colour. Over 100% the square overflows the bottom and
 * the card shows a band off the top of the canvas instead.
 *
 * ⚠ 120%, MEASURED AGAINST THE REFERENCE, NOT PICKED. 120% shows the top ~83% of the canvas,
 * which is hair through mid-chest with the shirt reading — the framing in Ryan's reference. The
 * first attempt at 138% showed only 72% and cut at the neck, so the shirt never appeared and the
 * head filled the card. The canvas carries empty space above the hair (it starts around y250, an
 * eighth down), which is where the headroom above the figure comes from.
 *
 * ⚠ Overflow is only safe because the card clips it AND carries the same colour — see the header.
 */
const AVATAR_FILL = 'absolute left-1/2 -translate-x-1/2 top-0 h-[120%] w-auto'

export function AvatarCard({
  userId, avatarColour, avatarBuild, fullName, username, memberSince, initials,
}: {
  userId: string
  avatarColour: string | null
  avatarBuild: unknown
  fullName: string | null
  username: string
  /** Already formatted by the caller, which owns `formatMemberSince`. */
  memberSince: string
  initials: string
}) {
  const ground = avatarBackgroundFor(avatarIndexFor(userId, avatarColour))

  // ⚠ The LAYOUT decision, not the "can this deploy draw it" decision. A row that exists but
  // names an asset this bundle does not have still renders initials — that is MemberAvatar's
  // `fallback`, below. This only asks which of the two cards to build, and needs no bundle.
  const hasAvatar = avatarBuild != null

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6">
      {/* ⚠ 13/5 (2.6:1) on desktop is the reference's own proportion. Squarer on a phone,
          because at 375px a 2.6:1 banner is only 144px tall and the figure has nowhere to go. */}
      <div
        className="relative rounded-card overflow-hidden aspect-[16/9] sm:aspect-[13/5]"
        style={{ backgroundColor: ground }}
      >
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

        {/* ⚠ ABOVE the avatar in the stack (`z-10`): the square overflows under it. */}
        <Link
          href="/profile/avatar"
          aria-label={hasAvatar ? 'Edit your avatar' : 'Build your avatar'}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10 w-10 h-10 sm:w-12 sm:h-12 rounded-control
                     bg-black/15 hover:bg-black/25 border border-white/40 backdrop-blur-sm
                     flex items-center justify-center transition-colors"
        >
          <Icon name="pencil.line" size={20} weight="semibold" className="text-white" />
        </Link>

        {/* The call to action only exists on the empty card. Once you have a face the pencil is
            enough — a permanent "Build your avatar" button over your own avatar reads as though
            the app has not noticed you already did. */}
        {!hasAvatar && (
          <div className="absolute inset-x-0 bottom-0 z-10 flex justify-center pb-4 sm:pb-5">
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-control bg-surface
                             text-ink text-[13px] font-semibold shadow-card">
              Build your avatar
              <span aria-hidden="true">→</span>
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 sm:mt-5">
        <h2 className="text-xl sm:text-3xl font-bold text-ink truncate">
          {fullName || username}
        </h2>
        <p className="text-muted text-sm sm:text-base">@{username}</p>
        <p className="text-muted text-xs sm:text-sm mt-0.5">Member since {memberSince}</p>
      </div>
    </div>
  )
}

/** Today's initials treatment, kept for the empty card and for art still in flight. */
function InitialsMark({ initials }: { initials: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div className="w-20 h-20 sm:w-28 sm:h-28 rounded-pill bg-black/15 border-2 border-white/40
                      backdrop-blur-sm flex items-center justify-center
                      text-white text-2xl sm:text-4xl font-bold">
        {initials}
      </div>
    </div>
  )
}
