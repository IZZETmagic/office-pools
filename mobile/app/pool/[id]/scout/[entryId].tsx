import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { Dossier } from '@/components/scouting/Dossier';
import { useDossier } from '@/lib/useDossier';
import { fontFamilies, useTheme } from '@/theme';

// =============================================================
// Scout — one member's dossier
// =============================================================
// Reached from the duel and from the leaderboard. It is a SCREEN rather than a
// section inside either, because the same report serves three callers — your
// opponent, another member, and yourself — and inlining it three times is three
// copies of a card with forty numbers in it.
//
// ⚠ IT DOES NOT REVEAL A SEALED OPPONENT. The caller arrives holding an entry
// id it already had; nothing here answers "who am I playing". The Duels surface
// owns that gate and this screen is downstream of it.
// =============================================================

export default function ScoutScreen() {
  const { id, entryId } = useLocalSearchParams<{ id: string; entryId: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { data, loading, error, refresh } = useDossier(id, entryId);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingHorizontal: 16,
          paddingBottom: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          backgroundColor: theme.colors.snow,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Icon name="chevron.left" size={22} color="ink" />
        </Pressable>
        <RNText
          style={{ fontFamily: fontFamilies.black, fontSize: 20, color: theme.colors.ink }}
        >
          Scout
        </RNText>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingTop: 8, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={{ paddingTop: 64, alignItems: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : error ? (
          // ⚠ A STATED FAILURE WITH A WAY OUT, not an empty scroll view. The
          // most likely cause is a dossier for somebody with nothing revealed
          // yet, and a blank screen makes that look like a broken build.
          <Pressable
            onPress={() => void refresh()}
            style={{ marginHorizontal: 20, paddingVertical: 32, alignItems: 'center', gap: 8 }}
          >
            <RNText
              style={{ fontFamily: fontFamilies.bold, fontSize: 15, color: theme.colors.ink }}
            >
              Could not load the scout report
            </RNText>
            <RNText
              style={{ fontFamily: fontFamilies.medium, fontSize: 13, color: theme.colors.slate }}
            >
              Tap to try again
            </RNText>
          </Pressable>
        ) : data ? (
          <Dossier dossier={data.dossier} name={data.entry_name} isSelf={data.is_self} />
        ) : null}
      </ScrollView>
    </View>
  );
}
