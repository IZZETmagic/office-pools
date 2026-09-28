// The Trophy Room — opened from the Profile hub.
//
// Phase 1 of the hub rebuild: the badge shelf that used to sit inline on the
// Profile tab, moved here whole, now saying which pool each badge came from.
// The podium of finishes lands in the next phase.

import { ActivityIndicator, Image, RefreshControl, ScrollView, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SectionWrapper, SettingsHeader } from '@/components/settings';
import { badgeIcon } from '@/components/pool-detail/badge-icons';
import { badgeSource, formatBadgeName } from '@/lib/profileHub';
import { useManualRefresh } from '@/lib/useManualRefresh';
import { useTrophies } from '@/lib/useTrophies';
import { fontFamilies, useTheme } from '@/theme';

export default function TrophyRoomScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { badges, total, error, refresh } = useTrophies();
  const { refreshing, onRefresh } = useManualRefresh(refresh);

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
        <SectionWrapper title={total ? `Badges · ${total}` : 'Badges'}>
          {badges === null && !error ? (
            <View style={{ padding: theme.spacing.xl, alignItems: 'center' }}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : error ? (
            <Note text="Your badges couldn't load. Pull down to try again." />
          ) : badges && badges.length === 0 ? (
            <Note text="No badges yet. You earn them by making great predictions in your pools." />
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
              {(badges ?? []).map((badge) => {
                const icon = badgeIcon(badge.id);
                return (
                  <View
                    key={badge.id}
                    style={{
                      width: '31.5%',
                      alignItems: 'center',
                      backgroundColor: theme.colors.surface,
                      borderRadius: theme.radii.md,
                      paddingVertical: theme.spacing.md,
                      paddingHorizontal: theme.spacing.sm,
                      gap: 2,
                    }}
                  >
                    {icon.png ? (
                      <Image source={icon.png} resizeMode="contain" style={{ width: 44, height: 44 }} />
                    ) : (
                      <RNText style={{ fontSize: 30 }}>{icon.emoji}</RNText>
                    )}
                    <RNText
                      numberOfLines={1}
                      style={{
                        marginTop: 4,
                        fontFamily: fontFamilies.bold,
                        fontSize: 11,
                        color: theme.colors.ink,
                        textAlign: 'center',
                      }}
                    >
                      {formatBadgeName(badge.id)}
                    </RNText>
                    <RNText
                      numberOfLines={1}
                      style={{
                        fontFamily: fontFamilies.medium,
                        fontSize: 9.5,
                        color: theme.colors.slate,
                        textAlign: 'center',
                      }}
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
                      <RNText style={{ color: '#fff', fontSize: 10, fontFamily: fontFamilies.bold }}>
                        {badge.count}×
                      </RNText>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </SectionWrapper>
      </ScrollView>
    </View>
  );
}

function Note({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg, padding: theme.spacing.xl }}>
      <RNText
        style={{
          fontFamily: fontFamilies.medium,
          fontSize: 13,
          color: theme.colors.slate,
          textAlign: 'center',
        }}
      >
        {text}
      </RNText>
    </View>
  );
}
