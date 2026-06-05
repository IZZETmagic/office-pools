// Single source of truth for badge icon mapping. Both `FormTab` and
// `BadgeDetailSheet` import from here so the icon shown on a badge chip
// in the form tab matches the icon shown when that badge's detail sheet
// is opened.
//
// Badge IDs are canonical and defined in
// `app/pools/[pool_id]/analytics/xpSystem.ts > BADGE_DEFINITIONS`. When
// adding a badge there, add its icon mapping here too.

import type { ImageSourcePropType } from 'react-native';

export type BadgeIconSpec = {
  /** SF Symbol name used on iOS via `expo-symbols`. */
  ios: string;
  /** Emoji fallback / cross-platform glyph. */
  emoji: string;
  /**
   * Pre-rendered PNG medallion. When present, earned-state UIs render this
   * image instead of the SF Symbol chip. Unearned states still use the lock
   * icon. Only the 12 full/progressive badges have artwork today; bracket
   * picker badges (bp_*) fall through to the SF Symbol path.
   */
  png?: ImageSourcePropType;
};

const BADGE_ICONS: Record<string, BadgeIconSpec> = {
  sharpshooter: {
    ios: 'scope',
    emoji: '🎯',
    png: require('../../assets/badge-previews-v4/sharpshooter.png'),
  },
  oracle: {
    ios: 'eye.fill',
    emoji: '👁️',
    png: require('../../assets/badge-previews-v4/oracle.png'),
  },
  dark_horse: {
    ios: 'hare.fill',
    emoji: '🐎',
    png: require('../../assets/badge-previews-v4/dark_horse.png'),
  },
  ice_breaker: {
    ios: 'snowflake',
    emoji: '❄️',
    png: require('../../assets/badge-previews-v4/ice_breaker.png'),
  },
  on_fire: {
    ios: 'flame.fill',
    emoji: '🔥',
    png: require('../../assets/badge-previews-v4/on_fire.png'),
  },
  top_dog: {
    ios: 'crown.fill',
    emoji: '👑',
    png: require('../../assets/badge-previews-v4/top_dog.png'),
  },
  globe_trotter: {
    ios: 'globe',
    emoji: '🌍',
    png: require('../../assets/badge-previews-v4/globe_trotter.png'),
  },
  lightning_rod: {
    ios: 'bolt.fill',
    emoji: '⚡',
    png: require('../../assets/badge-previews-v4/lightning_rod.png'),
  },
  stadium_regular: {
    ios: 'building.columns.fill',
    emoji: '🏟️',
    png: require('../../assets/badge-previews-v4/stadium_regular.png'),
  },
  showtime: {
    ios: 'sparkles',
    emoji: '✨',
    png: require('../../assets/badge-previews-v4/showtime.png'),
  },
  grand_finale: {
    ios: 'trophy.fill',
    emoji: '🏆',
    png: require('../../assets/badge-previews-v4/grand_finale.png'),
  },
  legend: {
    ios: 'star.fill',
    emoji: '⭐',
    png: require('../../assets/badge-previews-v4/legend.png'),
  },
  // Bracket-picker mode badges (BPFormTab). Names match
  // `bracketPickerXpSystem.ts > BP_BADGE_DEFINITIONS`.
  bp_cartographer: {
    ios: 'map.fill',
    emoji: '🗺️',
    png: require('../../assets/badge-previews-v4/bp_cartographer.png'),
  },
  bp_world_map: {
    ios: 'globe',
    emoji: '🌍',
    png: require('../../assets/badge-previews-v4/bp_world_map.png'),
  },
  bp_bracket_prophet: {
    ios: 'eye.fill',
    emoji: '🔮',
    png: require('../../assets/badge-previews-v4/bp_bracket_prophet.png'),
  },
  bp_architect: {
    ios: 'building.2.fill',
    emoji: '🏗️',
    png: require('../../assets/badge-previews-v4/bp_architect.png'),
  },
  bp_sniper: {
    ios: 'scope',
    emoji: '🎯',
    png: require('../../assets/badge-previews-v4/bp_sniper.png'),
  },
  bp_final_four: {
    ios: 'trophy.fill',
    emoji: '🏆',
    png: require('../../assets/badge-previews-v4/bp_final_four.png'),
  },
  bp_perfect_bracket: {
    ios: 'star.fill',
    emoji: '⭐',
    png: require('../../assets/badge-previews-v4/bp_perfect_bracket.png'),
  },
  bp_upset_specialist: {
    ios: 'exclamationmark.triangle.fill',
    emoji: '😮',
    png: require('../../assets/badge-previews-v4/bp_upset_specialist.png'),
  },
  bp_group_guardian: {
    ios: 'shield.fill',
    emoji: '🛡️',
    png: require('../../assets/badge-previews-v4/bp_group_guardian.png'),
  },
  bp_quick_draw: {
    ios: 'bolt.fill',
    emoji: '⚡',
    png: require('../../assets/badge-previews-v4/bp_quick_draw.png'),
  },
  bp_full_bracket: {
    ios: 'checklist',
    emoji: '📋',
    png: require('../../assets/badge-previews-v4/bp_full_bracket.png'),
  },
};

const BADGE_ICON_FALLBACK: BadgeIconSpec = { ios: 'star.fill', emoji: '⭐' };

export function badgeIcon(id: string): BadgeIconSpec {
  return BADGE_ICONS[id] ?? BADGE_ICON_FALLBACK;
}

// Name → id reverse lookup. The badge_earned activity feed metadata
// carries `badge_name` but not the canonical id (see
// `mobile/lib/useActivity.ts > BadgeEarnedMeta`), so the Activity tab
// can't reach the PNG via badgeIcon(id). Until the server-side activity
// row carries `badge_id` directly, this table lets the ActivityCard
// resolve the medallion by display name.
//
// Names are canonical and defined alongside the IDs in
// `app/pools/[pool_id]/analytics/xpSystem.ts > BADGE_DEFINITIONS` and
// `bracketPickerXpSystem.ts > BP_BADGE_DEFINITIONS`. Keep this in sync.
const BADGE_ID_BY_NAME: Record<string, string> = {
  Sharpshooter: 'sharpshooter',
  Oracle: 'oracle',
  'Dark Horse': 'dark_horse',
  'Ice Breaker': 'ice_breaker',
  'On Fire': 'on_fire',
  'Top Dog': 'top_dog',
  'Globe Trotter': 'globe_trotter',
  'Lightning Rod': 'lightning_rod',
  'Stadium Regular': 'stadium_regular',
  Showtime: 'showtime',
  'Grand Finale': 'grand_finale',
  Legend: 'legend',
  Cartographer: 'bp_cartographer',
  'World Map': 'bp_world_map',
  'Bracket Prophet': 'bp_bracket_prophet',
  Architect: 'bp_architect',
  Sniper: 'bp_sniper',
  'Final Four': 'bp_final_four',
  'Perfect Bracket': 'bp_perfect_bracket',
  'Upset Specialist': 'bp_upset_specialist',
  'Group Guardian': 'bp_group_guardian',
  'Quick Draw': 'bp_quick_draw',
  'Full Bracket': 'bp_full_bracket',
};

export function badgeIconByName(name: string): BadgeIconSpec | null {
  const id = BADGE_ID_BY_NAME[name];
  return id ? BADGE_ICONS[id] ?? null : null;
}
