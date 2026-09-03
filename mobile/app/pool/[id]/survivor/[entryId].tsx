import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text as RNText, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text } from '@/components/ui';
import { fetchLmsState, saveLmsPick, type LmsState } from '@/lib/api';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// PICK ONE CLUB TO WIN — the Last Man Standing wizard
// =============================================================
// Ryan, 3 Sep: *"straightforward like the web app."* So it is the web's grid:
// every club in the season, the game it plays this week beside it, and the ones
// you have already spent greyed out with the matchweek they went in.
//
// ⚠ ITS OWN ROUTE, like the table picker, and for the layout reason recorded
// there: a scrollable picker inside the pool's tab pager cannot get a height.
//
// ## The three reasons a club cannot be tapped, all of them stated
//
//   already used     one club per round — what you have left IS the game
//   no fixture       a club that is not playing cannot be backed. It would be a
//                    free pass: you cannot be beaten by a match nobody played.
//   you are out      the round is over for you until the next one opens
//
// ⚠ Greyed AND labelled, never just greyed. A dimmed tile with no reason reads
// as a loading state, and the reason is the whole strategy surface.
//
// ## Nothing here decides anything
//
// The write goes to `/lms-pick`, which reads back after writing because the
// matchweek lock is a silent-skip trigger — an upsert it refuses still returns
// success. Survival, elimination and round winners are all `league_lms_settle`'s.
// =============================================================

export default function SurvivorPickScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id, entryId } = useLocalSearchParams<{ id: string; entryId: string }>();

  const query = useQuery({
    queryKey: ['lms', id],
    queryFn: () => fetchLmsState(id),
  });

  return (
    // `edges={[]}` plus an explicit paddingTop — see the table picker: the top
    // edge inset does not apply inside a fullScreenModal, and the header drew
    // under the status bar.
    <SafeAreaView edges={[]} style={{ flex: 1, backgroundColor: theme.colors.snow, paddingTop: insets.top }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          paddingHorizontal: theme.spacing.xl,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.sm,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: theme.radii.pill,
            backgroundColor: withOpacity(theme.colors.ink, 0.06),
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Icon name="chevron.left" color="ink" size={16} weight="semibold" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="cardTitle" numberOfLines={1}>
            Pick one to win
          </Text>
        </View>
      </View>

      <Content query={query} poolId={id} entryId={entryId} />
    </SafeAreaView>
  );
}

function Content({
  query,
  poolId,
  entryId,
}: {
  query: ReturnType<typeof useQuery<LmsState>>;
  poolId: string;
  entryId: string;
}) {
  const theme = useTheme();
  const qc = useQueryClient();
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (clubId: string) => {
      const s = query.data!;
      return saveLmsPick(poolId, {
        roundId: s.round!.round_id,
        entryId,
        matchweekNumber: s.open_matchweek!,
        clubId,
      });
    },
    onMutate: (clubId) => {
      setPending(clubId);
      setMessage(null);
    },
    onSuccess: async () => {
      setMessage({ kind: 'ok', text: 'Saved. You can change it until the matchweek locks.' });
      // ⚠ Refetch rather than patch the cache. The used-clubs rule and the wall
      // both derive from this response, and a local edit would have to reproduce
      // the server's reveal logic to keep them honest — which is how a screen
      // starts disagreeing with the database.
      await qc.invalidateQueries({ queryKey: ['lms', poolId] });
      await qc.invalidateQueries({ queryKey: ['pool-detail', poolId] });
    },
    onError: (e) =>
      setMessage({ kind: 'error', text: e instanceof Error ? e.message : 'That pick could not be saved.' }),
    onSettled: () => setPending(null),
  });

  if (query.isPending) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }
  if (query.isError || !query.data) {
    return (
      <Centered>
        <Text variant="body" color="red" align="center">
          {query.error instanceof Error ? query.error.message : 'That round could not be loaded.'}
        </Text>
      </Centered>
    );
  }

  const state = query.data;
  const me = state.members.find((m) => m.entry_id === entryId) ?? null;

  if (!state.round || state.open_matchweek === null) {
    return (
      <Centered>
        <Text variant="sectionHeader" align="center">
          Nothing to pick
        </Text>
        <Text variant="body" color="slate" align="center">
          The season has no matchweek open right now.
        </Text>
      </Centered>
    );
  }

  // ⚠ Out is not the same as "not in this round", and the two deserve different
  // sentences — one of them is nobody's fault and the other is the game.
  if (me && !me.in_round) {
    return (
      <Centered>
        <Text variant="sectionHeader" align="center">
          You join the next round
        </Text>
        <Text variant="body" color="slate" align="center">
          This round started before you did, and everyone in it has already spent clubs.
        </Text>
      </Centered>
    );
  }
  if (me?.eliminated_matchweek != null) {
    return (
      <Centered>
        <Text variant="sectionHeader" align="center">
          You went out in matchweek {me.eliminated_matchweek}
        </Text>
        <Text variant="body" color="slate" align="center">
          You&apos;re back in as soon as this round ends — everyone starts the next one level.
        </Text>
      </Centered>
    );
  }

  const fixtureFor = (clubId: string) => state.fixtures.find((f) => f.club_id === clubId) ?? null;
  const currentPick =
    state.picks.find((p) => p.entry_id === entryId && p.matchweek_number === state.open_matchweek) ?? null;

  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.sm,
        paddingBottom: theme.spacing.hero,
        gap: theme.spacing.md,
      }}
    >
      <Text variant="caption" color="slate">
        Matchweek {state.open_matchweek} — round {state.round.round_number}
      </Text>

      {message ? (
        <Text variant="body" color={message.kind === 'ok' ? 'green' : 'red'}>
          {message.text}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {state.clubs.map((club) => {
          const fixture = fixtureFor(club.club_id);
          const spent = club.used_in_matchweek !== null && club.club_id !== currentPick?.club_id;
          const notPlaying = fixture === null;
          const selected = currentPick?.club_id === club.club_id;
          const disabled = spent || notPlaying || save.isPending;

          return (
            <Pressable
              key={club.club_id}
              disabled={disabled}
              onPress={() => save.mutate(club.club_id)}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              style={({ pressed }) => ({
                // Two per row, gap accounted for.
                width: '48.5%',
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
                padding: theme.spacing.sm + 2,
                borderRadius: theme.radii.md,
                borderWidth: selected ? 2 : 1,
                borderColor: selected ? theme.colors.primary : withOpacity(theme.colors.slate, 0.2),
                backgroundColor: selected
                  ? withOpacity(theme.colors.primary, 0.08)
                  : theme.colors.surface,
                opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
              })}
            >
              {club.crest_url ? (
                <Image source={{ uri: club.crest_url }} style={{ width: 26, height: 26 }} resizeMode="contain" />
              ) : null}
              <View style={{ flex: 1, minWidth: 0 }}>
                <RNText
                  numberOfLines={1}
                  style={{ fontFamily: fontFamilies.bold, fontSize: 12, color: theme.colors.ink }}
                >
                  {club.club_name}
                </RNText>
                {/* WHO THEY PLAY. The whole decision is "can this club win THIS
                    week", and home or away is named rather than implied by order
                    — a good side away at a rival is a different bet. */}
                <RNText
                  numberOfLines={1}
                  style={{
                    fontFamily: fontFamilies.regular,
                    fontSize: 10,
                    color: notPlaying ? withOpacity(theme.colors.slate, 0.8) : theme.colors.slate,
                  }}
                >
                  {notPlaying
                    ? 'not playing this week'
                    : `${fixture!.is_home ? 'v ' : 'at '}${fixture!.opponent_name}`}
                </RNText>
                {spent ? (
                  <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 9, color: theme.colors.slate }}>
                    used in MW{club.used_in_matchweek}
                  </RNText>
                ) : null}
              </View>
              {pending === club.club_id ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : selected ? (
                <Icon name="checkmark.circle.fill" color="primary" size={14} />
              ) : null}
            </Pressable>
          );
        })}
      </View>

      <Text variant="detail" color="slate">
        One club per round — once you&apos;ve used them, they&apos;re gone until the next round. Clubs
        with no game this matchweek can&apos;t be picked.
      </Text>
    </ScrollView>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.xl,
      }}
    >
      {children}
    </View>
  );
}
