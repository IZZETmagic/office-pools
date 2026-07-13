// Renders a badge's medallion artwork (web-optimized PNGs in /public/badges,
// resized from mobile/assets/badge-previews-v4) with a graceful emoji fallback
// for any badge id that doesn't have art yet. Shared by the profile Trophy Case
// and the pool analytics badge grid so web badges match the mobile medallions
// instead of showing bare emoji.

// Badge ids that have a medallion in /public/badges/<id>.png (23: 12
// full/progressive + 11 bracket-picker). Keep in sync with public/badges.
const MEDALLION_IDS = new Set([
  'dark_horse', 'globe_trotter', 'grand_finale', 'ice_breaker', 'legend',
  'lightning_rod', 'on_fire', 'oracle', 'sharpshooter', 'showtime',
  'stadium_regular', 'top_dog',
  'bp_architect', 'bp_bracket_prophet', 'bp_cartographer', 'bp_final_four',
  'bp_full_bracket', 'bp_group_guardian', 'bp_perfect_bracket', 'bp_quick_draw',
  'bp_sniper', 'bp_upset_specialist', 'bp_world_map',
])

export function hasBadgeMedallion(id: string): boolean {
  return MEDALLION_IDS.has(id)
}

export function BadgeMedallion({
  id,
  emoji,
  size = 40,
  className = '',
}: {
  id: string
  emoji: string
  size?: number
  className?: string
}) {
  if (MEDALLION_IDS.has(id)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/badges/${id}.png`}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className={`inline-block object-contain ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      className={`inline-flex items-center justify-center leading-none ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.72) }}
    >
      {emoji}
    </span>
  )
}
