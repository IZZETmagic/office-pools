/**
 * Podium colour for a rank chip: gold / silver / bronze, everyone else neutral.
 *
 * The app has two copies of this and they disagree on 2nd place —
 * `mobile/app/pool/[id]/breakdown.tsx` returns `silver`, while
 * `mobile/components/pool-detail/leaderboard-shared.tsx` returns `slate`.
 *
 * We follow the leaderboard's `slate`, deliberately. The chip prints white
 * text on this colour, and white on silver (#D4DAE8) is about 1.5:1 — not
 * readable. Slate is ~3.5:1, which is legible at the chip's 18px/900. Porting
 * the breakdown's `silver` would have carried an unreadable second place onto
 * the web, so this is a divergence from the screen being mirrored, not drift.
 */

export type RankTone = { bg: string; label: string }

const PODIUM: Record<number, RankTone> = {
  1: { bg: 'bg-gold', label: 'gold' },
  2: { bg: 'bg-muted', label: 'slate' },
  3: { bg: 'bg-bronze', label: 'bronze' },
}

const OFF_PODIUM: RankTone = { bg: 'bg-muted', label: 'slate' }

export function rankChipTone(rank: number | null | undefined): RankTone {
  if (!rank) return OFF_PODIUM
  return PODIUM[rank] ?? OFF_PODIUM
}

/**
 * RN shrinks the numeral as the rank gets longer so the chip keeps its width.
 * Mirrors the `digits >= 3 ? 15 : digits === 2 ? 17 : 18` ladder in RankChip.
 */
export function rankChipTextClass(rank: number | null | undefined): string {
  const digits = rank ? String(rank).length : 1
  if (digits >= 3) return 'text-[15px]'
  if (digits === 2) return 'text-[17px]'
  return 'text-[18px]'
}
