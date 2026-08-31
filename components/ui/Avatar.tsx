// =============================================================
// THE AVATAR — one circle, and the stack the pool card wants
// =============================================================
// The web has painted this circle in three places already (the banter message
// row, the online strip, the reactors modal) and each built its own markup —
// which is why one of them still uses a flat `bg-mist` where the other two use
// the gradient. This is the shared one, written when the pool card became the
// fourth.
//
// ⚠ THE COLOUR IS HASHED FROM user_id, not from position in the list. RN's home
// card rotates three gradients by index, so its first avatar is always purple
// whoever it belongs to; RN's BanterSheet hashes the id into ten, and
// lib/design/avatarGradient.ts is the web mirror of THAT. Hashing is the one to
// keep: the pools list and the pool's chat are one click apart, and a person
// who is teal in the chat and purple on the card reads as two people.
// =============================================================

import { avatarGradient } from '@/lib/design/avatarGradient'
import { getInitials } from '@/lib/design/initials'

/** The least a row needs to be drawn as a face. */
export type AvatarPerson = {
  user_id: string
  full_name?: string | null
  username?: string | null
}

export function personName(p: AvatarPerson): string {
  return p.full_name?.trim() || p.username?.trim() || 'Unknown'
}

/**
 * ⚠ `size` is inline rather than a Tailwind class on purpose — the three
 * existing avatars are 36px, 32px and 24px, and the font and the ring both key
 * off it. A `size` union would need a class map per dimension to say the same
 * thing.
 */
export function Avatar({
  person,
  size = 24,
  fontSize,
  ring = false,
  className = '',
}: {
  person: AvatarPerson
  /** Diameter in px. */
  /**
   * Pixels, or any CSS length.
   *
   * ⚠ A STRING IS FOR CONTAINERS THAT CHANGE SIZE. `'100%'` lets the avatar
   * fill a box whose own dimensions interpolate — the Showdown band's faces
   * shrink on scroll via a `calc()` on a custom property, and a number here
   * would pin the circle at its full size inside a shrinking parent, which
   * clips it off-centre rather than scaling it. Pair it with `fontSize`, since
   * initials cannot be derived from a length that is not a number.
   */
  size?: number | string
  /** Overrides the initials' size. Required when `size` is not a number. */
  fontSize?: number | string
  /**
   * The surface-coloured ring a stack needs to separate its overlaps.
   *
   * ⚠ 1.5px, not 2. A Tailwind ring is an OUTSET shadow, so it widens the
   * neighbour that covers this one — at `ring-2` the last letter of a
   * two-letter initial disappeared under the next circle. 1.5 is also what RN's
   * card and OnlineMembersStrip both already use.
   */
  ring?: boolean
  className?: string
}) {
  return (
    <div
      className={`rounded-pill shrink-0 flex items-center justify-center font-bold text-white leading-none ${
        ring ? 'ring-[1.5px] ring-surface' : ''
      } ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: fontSize ?? (typeof size === 'number' ? Math.round(size * 0.38) : undefined),
        backgroundImage: avatarGradient(person.user_id),
      }}
    >
      {getInitials(person.full_name, person.username)}
    </div>
  )
}

/**
 * Overlapping faces plus "+N", as RN's home PoolCard draws them.
 *
 * `total` is the pool's real member count, which is NOT `people.length` — the
 * servers fetch three rows and the count separately, so the overflow is the
 * only thing on the card that knows about the other 189.
 *
 * The circles are aria-hidden and the group carries one label: nine tab stops
 * reading "R" "AS" "MJ" is worse than one saying who is in the pool.
 */
export type AvatarStackParts = {
  visible: AvatarPerson[]
  /** How many members the stack did NOT draw. Never negative. */
  overflow: number
  /** The group's one accessible name. */
  label: string
}

/**
 * What the stack draws, as arithmetic — the only part of it worth a test in a
 * node environment (see the note in vitest.config.ts: no rendering here).
 *
 * ⚠ `Math.max(0, …)` is load-bearing. `total` and `people` come from ONE query
 * but they are not the same read: the count is of the whole table and the rows
 * are a `.limit(3)` slice, so a member leaving between the two would otherwise
 * paint "+-1" on the card.
 */
export function avatarStackParts(
  people: AvatarPerson[],
  total: number | undefined,
  max: number,
): AvatarStackParts {
  const visible = people.slice(0, max)
  const overflow = Math.max(0, (total ?? people.length) - visible.length)
  const names = visible.map(personName)
  const label = overflow > 0 ? `${names.join(', ')} and ${overflow} more` : names.join(', ')
  return { visible, overflow, label }
}

export function AvatarStack({
  people,
  total,
  size = 24,
  max = 3,
  className = '',
}: {
  people: AvatarPerson[]
  /** Members in the pool. Defaults to what was passed when there is no count. */
  total?: number
  size?: number
  max?: number
  className?: string
}) {
  const { visible, overflow, label } = avatarStackParts(people, total, max)
  if (visible.length === 0) return null

  return (
    <div
      className={`flex items-center shrink-0 ${className}`}
      role="img"
      aria-label={`Members: ${label}`}
      title={label}
    >
      {visible.map((person, i) => (
        <div key={person.user_id} aria-hidden style={{ marginLeft: i === 0 ? 0 : -size / 4 }}>
          <Avatar person={person} size={size} ring />
        </div>
      ))}
      {overflow > 0 && (
        <span
          aria-hidden
          className="ml-1 font-bold text-muted leading-none"
          style={{ fontSize: Math.round(size * 0.42) }}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
