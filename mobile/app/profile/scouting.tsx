// Your Scouting Report — opened from the Profile hub.
//
// How you pick, across every league pool you've played in: club bias, your
// tendencies against what actually happened, and how often you go against the
// crowd. The pool facts (standing, accuracy, form) stay in each pool's own
// dossier — "how someone picks is a lifetime trait, how they are doing is a
// pool fact".
//
// ⚠ NEEDS `/api/me/scouting` ON THE SERVER THE APP POINTS AT. Deploy the API
// before any OTA that ships this screen, or it opens onto "couldn't load".

import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SelfScoutReport } from '@/components/scouting/Dossier';
import { MemberSubject, ScoutHeader } from '@/components/scouting/kit';
import { SettingsHeader } from '@/components/settings';
import { Text } from '@/components/ui';
import { useHomeData } from '@/lib/HomeDataProvider';
import { useManualRefresh } from '@/lib/useManualRefresh';
import { useSelfScout } from '@/lib/useSelfScout';
import { fontFamilies, useTheme } from '@/theme';

export default function SelfScoutScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { data: home } = useHomeData();
  const { data, loading, error, refresh } = useSelfScout();
  const { refreshing, onRefresh } = useManualRefresh(refresh);

  const lifetime = data?.dossier.lifetime;
  const detail = lifetime
    ? `All time · ${lifetime.pools} league pool${lifetime.pools === 1 ? '' : 's'}` +
      (lifetime.competitions > 1 ? ` · ${lifetime.competitions} competitions` : '')
    : null;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <SettingsHeader title="Scouting Report" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: theme.spacing.xxl + insets.bottom, gap: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
        }
      >
        <ScoutHeader detail={detail}>
          <MemberSubject name={home?.fullName ?? 'You'} userId={data?.user_id ?? home?.appUserId} />
        </ScoutHeader>

        {loading && !data ? (
          <View style={{ paddingTop: 48, alignItems: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : error && !data ? (
          <Pressable
            onPress={() => void refresh()}
            style={{ marginHorizontal: 20, paddingVertical: 28, alignItems: 'center', gap: 8 }}
          >
            <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 15, color: theme.colors.ink }}>
              {"Couldn't load your scouting report"}
            </RNText>
            <Text variant="detail" color="slate">
              Tap to try again
            </Text>
          </Pressable>
        ) : data ? (
          // ⚠ No horizontal padding here — ScoutCard carries its own 20pt margin.
          <SelfScoutReport dossier={data.dossier} />
        ) : null}
      </ScrollView>
    </View>
  );
}
