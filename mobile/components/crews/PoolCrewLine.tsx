// A pool's crew, on the pool screens (decision 5, 2026-10-02).
//
//   PoolCrewCard   — Info tab, everyone: "Part of Bermuda Office", and before the first lock
//                    "9 in · 3 spots saved". A COUNT — never whose: watching a named list of who
//                    hasn't turned up is exactly what the held seat exists to prevent.
//   PoolSpotsSaved — Members tab (admin-only already): who is still pending, by name. The server
//                    sends the names to the pool's admin only (lib/crews/read.readPoolCrew).
//
// Both render NOTHING for a pool with no crew, or when the API can't answer — so every existing
// pool looks exactly as it did.

import { router } from 'expo-router';
import { Pressable, Text as RNText, View } from 'react-native';

import { Icon } from '@/components/ui';
import { personName } from '@/lib/crews';
import { usePoolCrew } from '@/lib/useCrews';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

import { CrewFace } from './CrewFace';

export function PoolCrewCard({ poolId }: { poolId: string }) {
  const theme = useTheme();
  const { data } = usePoolCrew(poolId);
  if (!data?.crew) return null;
  const crew = data.crew;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/profile/crews/[id]', params: { id: crew.crewId } })}
      accessibilityRole="button"
      style={({ pressed }) => ({
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.lg,
        gap: 4,
        opacity: pressed ? 0.7 : 1,
        ...theme.shadows.card,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Icon name="person.3.fill" size={14} tint={theme.colors.primary} />
        <RNText numberOfLines={1} style={{ flex: 1, fontFamily: fontFamilies.bold, fontSize: 14.5, color: theme.colors.ink }}>
          Part of {crew.name}
        </RNText>
        <Icon name="chevron.right" tint={theme.colors.slate} size={11} weight="semibold" />
      </View>
      {data.saved > 0 ? (
        <RNText style={{ fontFamily: fontFamilies.semibold, fontSize: 13, color: theme.colors.slate }}>
          <RNText style={{ fontFamily: fontFamilies.black, color: theme.colors.green }}>{data.inPool} in</RNText> ·{' '}
          {data.saved} {data.saved === 1 ? 'spot' : 'spots'} saved until picks lock
        </RNText>
      ) : null}
    </Pressable>
  );
}

export function PoolSpotsSaved({ poolId }: { poolId: string }) {
  const theme = useTheme();
  const { data } = usePoolCrew(poolId);
  const pending = data?.pending;
  if (!data?.crew || !pending || pending.length === 0) return null;
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.lg,
        gap: 10,
        ...theme.shadows.card,
      }}
    >
      <RNText style={{ fontFamily: fontFamilies.black, fontSize: 9.5, letterSpacing: 0.6, color: theme.colors.slate }}>
        SPOTS SAVED · {pending.length}
      </RNText>
      {pending.map((p, i) => (
        <View key={p.userId}>
          {i > 0 ? <View style={{ height: 0.5, marginBottom: 10, backgroundColor: withOpacity(theme.colors.silver, 0.6) }} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <CrewFace person={p} size={28} />
            <RNText numberOfLines={1} style={{ flex: 1, fontFamily: fontFamilies.bold, fontSize: 14, color: theme.colors.ink }}>
              {personName(p)}
            </RNText>
            <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 12, color: theme.colors.slate }}>Waiting</RNText>
          </View>
        </View>
      ))}
      <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 11.5, lineHeight: 16, color: theme.colors.slate }}>
        Only the pool’s admins see these names. We send the one reminder — nobody has to chase.
      </RNText>
    </View>
  );
}
