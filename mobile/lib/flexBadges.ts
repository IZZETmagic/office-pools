// Shared helpers for the "flex a badge" flow in the banter chat.
// Both the standalone banter screen and the BanterSheet bottom sheet
// load earned badges from /entries/{id}/analytics and let the user
// drop one into the conversation.
//
// The two surfaces used to render a hardcoded 3-option list driven by
// leaderboard counters (Bullseye/Hot streak/Underdog) — that didn't
// reflect the actual badges shown in the Form tab. This module is the
// single source of truth so they stay aligned with `badge-icons.ts`.

import { Alert } from 'react-native';

import {
  fetchBracketAnalytics,
  fetchEntryAnalytics,
  fetchLeaderboard,
  type BadgeInfo,
} from './api';
import { badgeIcon } from '@/components/pool-detail/badge-icons';
import type { FlexBadgeOption } from '@/components/pool-detail/FlexBadgesSheet';

export type FlexBadgeContext = {
  entryId: string;
  earnedBadges: BadgeInfo[];
};

export async function loadFlexBadges(
  poolId: string,
  appUserId: string,
  predictionMode: string | null | undefined,
): Promise<FlexBadgeContext | null> {
  try {
    const lb = await fetchLeaderboard(poolId);
    const myEntry = (lb.entries ?? []).find((e) => e.user_id === appUserId);
    if (!myEntry) {
      Alert.alert('Not in this pool', "You don't have an entry to flex from.");
      return null;
    }
    // BP pools score via a different XP system and live on a separate
    // analytics endpoint. Routing here keeps the helper mode-aware so
    // the BanterSheet flex picker shows the user's real bp_* badges
    // instead of an always-empty full-mode response.
    const analytics =
      predictionMode === 'bracket_picker'
        ? await fetchBracketAnalytics(poolId, myEntry.entry_id)
        : await fetchEntryAnalytics(poolId, myEntry.entry_id);
    const earned = analytics.xp?.earned_badges ?? [];
    if (earned.length === 0) {
      Alert.alert('No badges to flex yet', "Keep going — you'll earn some soon!");
      return null;
    }
    return { entryId: myEntry.entry_id, earnedBadges: earned };
  } catch (err) {
    Alert.alert(
      "Couldn't load badges",
      err instanceof Error ? err.message : 'Unknown error',
    );
    return null;
  }
}

export function buildFlexBadgeOptions(earned: BadgeInfo[]): FlexBadgeOption[] {
  return earned.map((b) => ({
    key: b.id,
    emoji: badgeIcon(b.id).emoji,
    label: b.name,
    description: `+${b.xp_bonus} XP · ${b.rarity}`,
  }));
}

export function buildFlexBadgePayload(badge: BadgeInfo): {
  content: string;
  metadata: Record<string, unknown>;
} {
  const emoji = badgeIcon(badge.id).emoji;
  return {
    content: `${emoji} ${badge.name} — +${badge.xp_bonus} XP`,
    metadata: {
      badge_type: badge.id,
      badge_label: badge.name,
      badge_count: badge.xp_bonus,
      badge_description: badge.condition,
      badge_rarity: badge.rarity,
      badge_tier: badge.tier,
    },
  };
}
