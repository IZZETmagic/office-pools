// My Crews — opened from the Profile hub.
//
// The groups you play with. ⭐ GROUPS, NEVER PEOPLE: each card is a crew — its faces, how long it
// has been going, what it's doing now — and there is no page of individual contacts anywhere. A
// crew is joined by playing in one of its pools, or by saying yes when its captain adds you
// (Ryan, 2026-10-02: no friends list). "New crew" is the only door that starts one from nothing.
//
// Reads GET /api/crews (lib/crews/read.listMyCrews on the web side). ⚠ The crew tables are
// deny-all, so this must go through the API — a direct PostgREST read would return [] silently.

import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Notice } from '@/components/crews/bits';
import { CrewFaceStack } from '@/components/crews/CrewFace';
import { SettingsHeader } from '@/components/settings';
import { Icon, PromptDialog } from '@/components/ui';
import { createCrew } from '@/lib/api';
import { crewStatusText, crewSummary, leaderText, meText, type CrewCard } from '@/lib/crews';
import { useHomeData } from '@/lib/HomeDataProvider';
import { useManualRefresh } from '@/lib/useManualRefresh';
import { invalidateCrews, useMyCrews } from '@/lib/useCrews';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

export default function MyCrewsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { data: crews, isLoading, error, refetch } = useMyCrews();
  const { refreshing, onRefresh } = useManualRefresh(async () => {
    await refetch();
  });
  const [naming, setNaming] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  async function create(name: string) {
    setCreating(true);
    setCreateError(null);
    try {
      const { crewId } = await createCrew(name);
      setNaming(false);
      invalidateCrews(queryClient);
      router.push({ pathname: '/profile/crews/[id]', params: { id: crewId } });
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Could not create the crew.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <SettingsHeader title="My Crews" />
      <ScrollView
        contentContainerStyle={{
          paddingTop: theme.spacing.md,
          paddingHorizontal: theme.spacing.xl,
          paddingBottom: theme.spacing.xxl + insets.bottom,
          gap: theme.spacing.lg,
        }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
      >
        <Pressable
          onPress={() => {
            setCreateError(null);
            setNaming(true);
          }}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            borderRadius: theme.radii.lg,
            borderWidth: 1.5,
            borderStyle: 'dashed',
            borderColor: withOpacity(theme.colors.primary, 0.5),
            paddingVertical: theme.spacing.md + 2,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Icon name="plus" size={14} tint={theme.colors.primary} weight="semibold" />
          <RNText style={{ fontFamily: fontFamilies.black, fontSize: 14, color: theme.colors.primary }}>New crew</RNText>
        </Pressable>

        {isLoading ? (
          <View style={{ padding: theme.spacing.xl, alignItems: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : error ? (
          <Notice
            text="We couldn’t load your crews just now. Pull down to try again."
            action="Try again"
            onAction={() => void refetch()}
          />
        ) : !crews || crews.length === 0 ? (
          <Notice text="No crews yet. When a pool you run finishes, you’ll be offered to keep its group together — or start one here with New crew." />
        ) : (
          <View style={{ gap: theme.spacing.sm }}>
            {crews.map((c) => (
              <CrewCardRow key={c.crewId} crew={c} />
            ))}
          </View>
        )}

        <View
          style={{
            backgroundColor: theme.colors.mist,
            borderRadius: theme.radii.md,
            padding: theme.spacing.lg,
            flexDirection: 'row',
            gap: theme.spacing.sm,
          }}
        >
          <Icon name="person.3.fill" size={14} tint={theme.colors.slate} />
          <RNText style={{ flex: 1, fontFamily: fontFamilies.medium, fontSize: 12.5, lineHeight: 18, color: theme.colors.ink }}>
            A crew is a group you play with. You’re in one because you played in its pools, or because you said yes when
            its captain added you. Each new season you get a saved spot — use it or don’t. We’ll remind you once. Leave
            anytime.
          </RNText>
        </View>
      </ScrollView>

      <PromptDialog
        visible={naming}
        title="Name your crew"
        description={createError ?? 'You’ll be its captain. Add people next — by username or email.'}
        placeholder="e.g. Sunday League"
        confirmLabel="Create"
        maxLength={60}
        busy={creating}
        onCancel={() => setNaming(false)}
        onSubmit={(name) => {
          if (name.trim()) void create(name.trim());
        }}
      />
    </View>
  );
}

function CrewCardRow({ crew }: { crew: CrewCard }) {
  const theme = useTheme();
  const { data: home } = useHomeData();
  const viewerId = home?.appUserId ?? null;
  const tone =
    crew.status.kind === 'seat'
      ? { bg: theme.colors.primaryLight, ink: theme.colors.primary }
      : crew.status.kind === 'live'
        ? { bg: theme.colors.greenLight, ink: theme.colors.green }
        : { bg: theme.colors.mist, ink: theme.colors.slate };
  const leader = leaderText(crew, viewerId);
  const me = meText(crew);

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/profile/crews/[id]', params: { id: crew.crewId } })}
      accessibilityRole="button"
      style={({ pressed }) => ({
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.lg,
        gap: theme.spacing.md,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <CrewFaceStack people={crew.faces} total={crew.people} />
        <View style={{ flex: 1, gap: 1 }}>
          <RNText numberOfLines={1} style={{ fontFamily: fontFamilies.black, fontSize: 17, color: theme.colors.ink }}>
            {crew.name}
          </RNText>
          <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 12, color: theme.colors.slate }}>{crewSummary(crew)}</RNText>
        </View>
        <Icon name="chevron.right" tint={theme.colors.slate} size={11} weight="semibold" />
      </View>
      <View
        style={{
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: tone.bg,
          borderRadius: theme.radii.pill,
          paddingHorizontal: 10,
          paddingVertical: 5,
        }}
      >
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone.ink }} />
        <RNText numberOfLines={1} style={{ flexShrink: 1, fontFamily: fontFamilies.bold, fontSize: 12, color: tone.ink }}>
          {crewStatusText(crew.status)}
        </RNText>
      </View>
      {leader || me ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: theme.spacing.lg, rowGap: 4 }}>
          {leader ? <Stat icon="trophy.fill" tint={theme.colors.amber} text={leader} /> : null}
          {me ? <Stat icon="person.crop.circle" tint={theme.colors.slate} text={me} /> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

function Stat({ icon, tint, text }: { icon: string; tint: string; text: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Icon name={icon} size={12} tint={tint} />
      <RNText style={{ fontFamily: fontFamilies.semibold, fontSize: 12, color: theme.colors.ink }}>{text}</RNText>
    </View>
  );
}
