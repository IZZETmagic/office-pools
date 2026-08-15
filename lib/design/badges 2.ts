/**
 * Badge rarity colours.
 *
 * Mirrors `useRarityColor` in mobile/components/pool-detail/FormTab.tsx:
 *
 *   Common     slate
 *   Uncommon   green
 *   Rare       primary
 *   Very Rare  #1281E2
 *   Legendary  accent (gold)
 *
 * The web copy had Very Rare on gold and Legendary on amber — the two top
 * rarities were both wrong and effectively swapped, so a Legendary badge looked
 * less prestigious on web than in the app.
 */

export type BadgeRarity = 'Common' | 'Uncommon' | 'Rare' | 'Very Rare' | 'Legendary'

const RARITY_VAR: Record<string, string> = {
  Common: 'var(--sp-slate)',
  Uncommon: 'var(--success-600)',
  Rare: 'var(--primary-600)',
  'Very Rare': 'var(--sp-rarity-vrare)',
  Legendary: 'var(--accent-400)',
}

/** CSS colour for a rarity — for tints, icon fills and inline styles. */
export function rarityColor(rarity: string): string {
  return RARITY_VAR[rarity] ?? RARITY_VAR.Common
}

/**
 * Composite the rarity over the surface at low alpha — the app's tint recipe,
 * used for the badge medallion well.
 */
export function rarityTint(rarity: string, percent = 15): string {
  return `color-mix(in srgb, ${rarityColor(rarity)} ${percent}%, transparent)`
}
