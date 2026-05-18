// Single source of truth for badge icon mapping. Both `FormTab` and
// `BadgeDetailSheet` import from here so the icon shown on a badge chip
// in the form tab matches the icon shown when that badge's detail sheet
// is opened.
//
// Badge IDs are canonical and defined in
// `app/pools/[pool_id]/analytics/xpSystem.ts > BADGE_DEFINITIONS`. When
// adding a badge there, add its icon mapping here too.

export type BadgeIconSpec = {
  /** SF Symbol name used on iOS via `expo-symbols`. */
  ios: string;
  /** Emoji fallback / cross-platform glyph. */
  emoji: string;
};

const BADGE_ICONS: Record<string, BadgeIconSpec> = {
  sharpshooter: { ios: 'scope', emoji: '🎯' },
  oracle: { ios: 'eye.fill', emoji: '👁️' },
  dark_horse: { ios: 'hare.fill', emoji: '🐎' },
  ice_breaker: { ios: 'snowflake', emoji: '❄️' },
  on_fire: { ios: 'flame.fill', emoji: '🔥' },
  top_dog: { ios: 'crown.fill', emoji: '👑' },
  globe_trotter: { ios: 'globe', emoji: '🌍' },
  lightning_rod: { ios: 'bolt.fill', emoji: '⚡' },
  stadium_regular: { ios: 'building.columns.fill', emoji: '🏟️' },
  showtime: { ios: 'sparkles', emoji: '✨' },
  grand_finale: { ios: 'trophy.fill', emoji: '🏆' },
  legend: { ios: 'star.fill', emoji: '⭐' },
};

const BADGE_ICON_FALLBACK: BadgeIconSpec = { ios: 'star.fill', emoji: '⭐' };

export function badgeIcon(id: string): BadgeIconSpec {
  return BADGE_ICONS[id] ?? BADGE_ICON_FALLBACK;
}
