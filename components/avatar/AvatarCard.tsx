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
import { GROUND_INK_DARK, avatarBackgroundFor, avatarIndexFor, groundInkFor } from '@/lib/design/avatarGradient'

/**
 * ⭐ THE INK FOLLOWS THE GROUND. `groundInkFor` picks dark or light by measured WCAG contrast
 * against that member's own colour, so this card cannot be made unreadable by a palette change.
 *
 * ⚠ It resolves to DARK for all twenty-two colours today, and that is a measurement, not a
 * preference — white fails every one of them, including for the name. The reasoning, the figures
 * and the guard that holds them live on `groundInkFor` in `lib/design/avatarGradient.ts`.
 *
 * ⚠⚠ INLINE STYLE, NOT A TAILWIND CLASS. The value is decided at runtime from the member's
 * colour, and Tailwind generates its classes by scanning source text — `text-[${ink}]` produces
 * a class that was never built and the text silently inherits whatever it inherits.
 *
 * ⚠ Opacity, not a second colour, for the muted lines: a hand-picked "soft" ink would need its
 * own contrast proof against all 22, and 70% of a passing ink cannot introduce a new failure the
 * strong one does not already have.
 */

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
  const index = avatarIndexFor(userId, avatarColour)
  const ground = avatarBackgroundFor(index)
  const ink = groundInkFor(index)

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

            ⚠⚠ ON DESKTOP THESE THREE NUMBERS ARE ONE NUMBER: the card is h-[280px], the fill is
            120%, so the square renders 336px wide and the zone must be 336 to hold it. At the 280
            I first wrote it clipped 28px off EACH SIDE — measured — which ate the hair and both
            ears. Change the card height or the fill and this width changes with them.

            ⚠ The phone is safe by a different route: the zone is full width, so at 224px tall the
            square is 269 wide inside a 343 zone and there is room to spare. It only stays true
            while the zone is wider than 1.2 × its own height — a taller phone band would start
            clipping the ears with nothing to warn you. */}
        <div className="relative h-[224px] sm:h-full w-full sm:w-[336px] shrink-0 overflow-hidden">
          {hasAvatar ? (
            <MemberAvatar
              userId={userId}
              avatarColour={avatarColour}
              avatarBuild={avatarBuild}
              svgClassName="[&>svg]:h-full [&>svg]:w-auto [&>svg]:block"
              className={AVATAR_FILL}
              // While the 169 KB of art is in flight the card is already the right colour, so the
              // initials sit on the finished background and nothing jumps but the figure.
              fallback={<InitialsMark initials={initials} ink={ink} />}
            />
          ) : (
            <InitialsMark initials={initials} ink={ink} />
          )}
        </div>

        {/* ⭐ ON THE CARD ONLY FROM `sm` UP. On a phone the details sit BELOW the card instead —
            Ryan, on the stacked version: "the details need to now come out of the card and sit
            below the avatar card". Desktop has the width to put them beside the avatar and the
            card reads as one object; a phone has to stack them, and stacked inside a coloured
            card they were a block of text marooned in a field of colour. */}
        <div className="hidden sm:flex flex-1 min-w-0 flex-col justify-center gap-4 pr-6">
          <Details
            fullName={fullName}
            username={username}
            memberSince={memberSince}
            stats={stats}
            hasAvatar={hasAvatar}
            ink={ink}
          />
        </div>

        {/* ⚠⚠ THIS CHIP AND THE PILL ABOVE ARE ALWAYS DARK, NOT `ink`. They do not sit on the
            member's ground — they sit on a near-white chip ON that ground, so they need contrast
            against WHITE, not against the colour. The day `groundInkFor` returns light for some
            deep colour, `ink` here would paint white on white and the control would disappear.
            (Before the chip existed this was a white glyph on `bg-black/15`, which was invisible
            on the pale half of the palette — the same mistake one layer down.) */}
        <Link
          href="/profile/avatar"
          aria-label={hasAvatar ? 'Edit your avatar' : 'Build your avatar'}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10 w-10 h-10 rounded-control
                     bg-white/90 hover:bg-white shadow-card
                     flex items-center justify-center transition-colors"
        >
          {/* ⚠ `tint`, not `style` — Icon takes no style prop; it resolves `tint ?? cssVarFor(color)`
              and otherwise inherits currentColor. */}
          <Icon name="pencil.line" size={18} weight="semibold" tint={GROUND_INK_DARK} />
        </Link>
      </div>

      {/* The phone's copy, on the PAGE rather than on the card — see the note above. `ink`
          is deliberately not passed: off the coloured ground the house tokens are correct, and
          they are the ones that follow the theme. */}
      <div className="sm:hidden flex flex-col gap-4 mt-4">
        <Details
          fullName={fullName}
          username={username}
          memberSince={memberSince}
          stats={stats}
          hasAvatar={hasAvatar}
        />
      </div>
    </div>
  )
}

/**
 * Name, handle, member-since and the headline numbers — rendered twice, once on the card at
 * `sm` and up, once on the page below it on a phone.
 *
 * ⚠⚠ THE DUPLICATION IS DELIBERATE AND IT IS A DOM MOVE, NOT A RESTYLE. The block changes its
 * PARENT between breakpoints — inside the coloured card on desktop, a sibling of it on mobile —
 * and no amount of CSS moves a node between two containers. Rendering it in both places and
 * hiding one with `hidden` is the honest version; `display:none` also takes the hidden copy out
 * of the accessibility tree, so only one name is ever announced.
 *
 * ⭐ `ink` IS THE WHOLE DIFFERENCE. On the card the text sits on the member's colour, which does
 * not change with the theme, so it takes the derived ink. Off the card it sits on the page, so
 * it takes `text-ink`/`text-muted`, which DO change with the theme. Passing the derived ink to
 * the page copy would paint near-black text on a dark page.
 */
function Details({
  fullName, username, memberSince, stats, hasAvatar, ink,
}: {
  fullName: string | null
  username: string
  memberSince: string
  stats: { label: string; value: number }[]
  hasAvatar: boolean
  /** Set only for the copy that sits on the coloured card. */
  ink?: string
}) {
  const strong = ink ? { color: ink } : undefined
  const soft = ink ? { color: ink, opacity: 0.7 } : undefined
  const strongClass = ink ? '' : 'text-ink'
  const softClass = ink ? '' : 'text-muted'

  return (
    <>
      <div className="min-w-0">
        <h2 className={`text-2xl sm:text-3xl font-bold truncate ${strongClass}`} style={strong}>
          {fullName || username}
        </h2>
        <p
          className={`text-sm sm:text-base truncate ${softClass}`}
          style={ink ? { color: ink, opacity: 0.8 } : undefined}
        >
          @{username}
        </p>
        <p className={`text-xs sm:text-sm mt-0.5 ${softClass}`} style={soft}>
          Member since {memberSince}
        </p>
      </div>

      {/* ⚠ No card chrome on these. They used to be three separate tiles in their own row; giving
          them borders and a surface again would rebuild the stack this card exists to collapse. */}
      <div className="flex items-center gap-6 sm:gap-8">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <p className={`t-num text-xl sm:text-2xl ${strongClass}`} style={strong}>
              {formatNumber(s.value)}
            </p>
            <p className={`text-[11px] sm:text-xs truncate ${softClass}`} style={soft}>
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* The call to action only exists on the empty card. Once you have a face the pencil is
          enough — a permanent "Build your avatar" button over your own avatar reads as though
          the app has not noticed you already did. */}
      {!hasAvatar && (
        <Link
          href="/profile/avatar"
          className={
            ink
              // On the ground: a near-white chip, so its label is pinned dark like the pencil.
              ? 'inline-flex self-start items-center gap-2 px-4 py-2 rounded-control bg-white/90 hover:bg-white text-[13px] font-semibold transition-colors'
              // On the page: the house primary, which already handles both themes.
              : 'inline-flex self-start items-center gap-2 px-4 py-2 rounded-control bg-primary-600 text-white text-[13px] font-semibold transition-opacity hover:opacity-90'
          }
          style={ink ? { color: GROUND_INK_DARK } : undefined}
        >
          Build your avatar
          <span aria-hidden="true">→</span>
        </Link>
      )}
    </>
  )
}

/** Today's initials treatment, kept for the empty card and for art still in flight. */
function InitialsMark({ initials, ink }: { initials: string; ink: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center">
      <div
        className="w-20 h-20 sm:w-24 sm:h-24 rounded-pill bg-white/35 border-2 border-white/60
                   flex items-center justify-center text-3xl font-bold"
        style={{ color: ink }}
      >
        {initials}
      </div>
    </div>
  )
}
