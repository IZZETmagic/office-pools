// The Trophy Room — opened from the Profile hub.
//
// Two shelves:
//   · Podium finishes — 1st / 2nd / 3rd across finished pools (rules in
//     `podiumFinishes`, lib/profileHub.ts).
//   · Badges — the lifetime ledger, each saying which pool it came from.
//     Tapping one lists every time it was earned, newest first.
//
// ⚠ NO "STILL TO EARN" SHELF, DELIBERATELY. The only badge rules that exist
// (`BADGE_DEFINITIONS` in app/pools/[pool_id]/analytics/xpSystem.ts) are World
// Cup rules — "Predict all 104 matches", "…all 12 groups", "…the World Cup
// Final". Showing them as goals to a Premier League member would advertise
// badges nobody can earn this season. It comes back when badges are
// generalised per competition.

import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  Text as RNText,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { badgeIcon } from '@/components/pool-detail/badge-icons';
import { SectionWrapper, SettingsHeader } from '@/components/settings';
import { useHomeData } from '@/lib/HomeDataProvider';
import { ordinal } from '@/lib/ordinal';
import { badgeSource, formatBadgeName, type BadgeTally, type Podium } from '@/lib/profileHub';
import { useManualRefresh } from '@/lib/useManualRefresh';
import { usePodium } from '@/lib/usePodium';
import { useTrophies } from '@/lib/useTrophies';
import { Pressable } from '@/components/ui';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

export default function TrophyRoomScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { refresh: refreshHome } = useHomeData();
  const { badges, total, error, refresh } = useTrophies();
  const podium = usePodium();
  const [openId, setOpenId] = useState<string | null>(null);
  const { refreshing, onRefresh } = useManualRefresh(() => Promise.all([refresh(), refreshHome()]));

  const open = badges?.find((b) => b.id === openId) ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <SettingsHeader title="Trophy Room" />
      <ScrollView
        contentContainerStyle={{
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.xxl + insets.bottom,
          gap: theme.spacing.xl,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
        }
      >
        <SectionWrapper title="Podium finishes">
          {podium === null ? <Loading /> : <PodiumCard podium={podium} />}
        </SectionWrapper>

        <SectionWrapper title={total ? `Badges · ${total}` : 'Badges'}>
          {badges === null && !error ? (
            <Loading />
          ) : error ? (
            <Note text="Your badges couldn't load. Pull down to try again." />
          ) : badges && badges.length === 0 ? (
            <Note text="No badges yet. You earn them by making great predictions in your pools." />
          ) : (
            <View style={{ gap: theme.spacing.sm }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                {(badges ?? []).map((badge) => (
                  <BadgeTile
                    key={badge.id}
                    badge={badge}
                    selected={badge.id === openId}
                    onPress={() => setOpenId((cur) => (cur === badge.id ? null : badge.id))}
                  />
                ))}
              </View>
              {open ? <BadgeUnlocks badge={open} /> : null}
            </View>
          )}
        </SectionWrapper>
      </ScrollView>
    </View>
  );
}

function PodiumCard({ podium }: { podium: Podium }) {
  const theme = useTheme();
  const steps: { rank: 1 | 2 | 3; count: number; height: number; medal: string; ground: string }[] = [
    { rank: 2, count: podium.second, height: 40, medal: '#A7B0C4', ground: theme.colors.mist },
    { rank: 1, count: podium.first, height: 60, medal: theme.colors.accent, ground: theme.colors.accentLight },
    { rank: 3, count: podium.third, height: 28, medal: theme.colors.bronze, ground: theme.colors.mist },
  ];

  return (
    <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, padding: theme.spacing.md, gap: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm }}>
        {steps.map((s) => (
          <View key={s.rank} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <View
              style={{
                width: s.rank === 1 ? 46 : 38,
                height: s.rank === 1 ? 46 : 38,
                borderRadius: 23,
                backgroundColor: s.medal,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <RNText style={{ fontFamily: fontFamilies.black, fontSize: 15, color: '#fff' }}>{s.rank}</RNText>
            </View>
            <View
              style={{
                alignSelf: 'stretch',
                height: s.height,
                backgroundColor: s.ground,
                borderTopLeftRadius: 8,
                borderTopRightRadius: 8,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <RNText style={{ fontFamily: fontFamilies.black, fontSize: 15, color: theme.colors.ink }}>
                ×{s.count}
              </RNText>
            </View>
          </View>
        ))}
      </View>

      {podium.finishes.length === 0 ? (
        <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 12, color: theme.colors.slate, textAlign: 'center' }}>
          Finish in the top three of a pool and it lands here when the pool ends.
        </RNText>
      ) : (
        <View style={{ gap: 8 }}>
          {podium.finishes.map((f) => (
            <View key={f.poolId} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: f.rank === 1 ? theme.colors.accent : f.rank === 2 ? '#A7B0C4' : theme.colors.bronze,
                }}
              />
              <RNText numberOfLines={1} style={{ flex: 1, fontFamily: fontFamilies.bold, fontSize: 13, color: theme.colors.ink }}>
                {f.poolName}
              </RNText>
              <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 12, color: theme.colors.slate }}>
                {ordinal(f.rank)} of {f.field}
              </RNText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function BadgeTile({ badge, selected, onPress }: { badge: BadgeTally; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  const icon = badgeIcon(badge.id);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded: selected }}
      accessibilityLabel={`${formatBadgeName(badge.id)}, earned ${badge.count} times`}
      style={({ pressed }) => ({
        width: '31.5%',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.md,
        borderWidth: 1.5,
        borderColor: selected ? theme.colors.primary : 'transparent',
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.sm,
        gap: 2,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {icon.png ? (
        <Image source={icon.png} resizeMode="contain" style={{ width: 44, height: 44 }} />
      ) : (
        <RNText style={{ fontSize: 30 }}>{icon.emoji}</RNText>
      )}
      <RNText
        numberOfLines={1}
        style={{ marginTop: 4, fontFamily: fontFamilies.bold, fontSize: 11, color: theme.colors.ink, textAlign: 'center' }}
      >
        {formatBadgeName(badge.id)}
      </RNText>
      <RNText
        numberOfLines={1}
        style={{ fontFamily: fontFamilies.medium, fontSize: 9.5, color: theme.colors.slate, textAlign: 'center' }}
      >
        {badgeSource(badge)}
      </RNText>
      <View
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          backgroundColor: theme.colors.primary,
          borderRadius: theme.radii.pill,
          paddingHorizontal: 5,
          paddingVertical: 1,
        }}
      >
        <RNText style={{ color: '#fff', fontSize: 10, fontFamily: fontFamilies.bold }}>{badge.count}×</RNText>
      </View>
    </Pressable>
  );
}

/** Every time the open badge was earned — pool and date, newest first. */
function BadgeUnlocks({ badge }: { badge: BadgeTally }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.md,
        gap: 8,
        borderWidth: 1,
        borderColor: withOpacity(theme.colors.primary, 0.25),
      }}
    >
      <RNText style={{ fontFamily: fontFamilies.black, fontSize: 14, color: theme.colors.ink }}>
        {formatBadgeName(badge.id)} · earned {badge.count === 1 ? 'once' : `${badge.count} times`}
      </RNText>
      {badge.unlocks.map((u, i) => (
        <View key={`${u.poolId}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <RNText numberOfLines={1} style={{ flex: 1, fontFamily: fontFamilies.semibold, fontSize: 12.5, color: theme.colors.ink }}>
            {u.poolName ?? 'A pool'}
          </RNText>
          <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 11.5, color: theme.colors.slate }}>
            {formatUnlockDate(u.unlockedAt)}
          </RNText>
        </View>
      ))}
    </View>
  );
}

function formatUnlockDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

function Loading() {
  const theme = useTheme();
  return (
    <View style={{ padding: theme.spacing.xl, alignItems: 'center' }}>
      <ActivityIndicator color={theme.colors.primary} />
    </View>
  );
}

function Note({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, padding: theme.spacing.xl }}>
      <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 13, color: theme.colors.slate, textAlign: 'center' }}>
        {text}
      </RNText>
    </View>
  );
}
