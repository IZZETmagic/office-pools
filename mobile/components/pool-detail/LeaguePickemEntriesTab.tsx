import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import type { LeagueLeaderboardEntry } from '@/lib/api';
import { InitialsAvatar } from './leaderboard-shared';
import { lastLockedWeek } from '@/lib/pickemWeek';
import { useLeaguePool } from '@/lib/useLeaguePool';
import { useTheme } from '@/theme';

// =============================================================
// THE PREDICTIONS TAB FOR A PICK'EM POOL — a door, and nothing else
// =============================================================
// Ryan, 2026-09-03: *"the predictions landing page should not have a matchweek
// on it. It is just a simple way to get into your predictions, and once into
// your predictions you will automatically be presented with the current active
// or in-play predictions."*
//
// ## ⚠ THE MATCHWEEK IS GONE FROM HERE ENTIRELY — twice now
//
// First the switcher moved to the wizard; now the caption and the per-week
// counts go too. The reason they kept creeping back is worth writing down: a
// count like "7/10" is inherently matchweek-scoped, so the moment this screen
// shows one it has to say WHICH week, and then it needs a way to change it, and
// then it is the wizard again with a worse layout. **A list of entries has no
// week.** The wizard owns the season; this owns the door.
//
// ⚠ It no longer fetches `/bulk` at all. The counts were the only thing that
// needed every pick in the pool, so the tab dropped a payload that reaches
// ~3,800 rows by May. It reads the league contract only — which the wizard
// fetches anyway, so React Query serves the next screen from cache.
//
// ## ⚠ A RIVAL'S PICKS STOP AT THE LAST LOCK
//
// Ryan, same message: *"for other member predictions, these should be readonly
// and only ever up to the most recent lock date."* So a rival card opens only
// once SOMETHING has locked, and the wizard it opens is both defaulted and
// BOUNDED to that week — see `lastLockedWeek`. Past it lies the week they can
// still change, and that is the one thing this mode cannot show.
//
// The server enforces it regardless: `/bulk` strips unlocked picks before they
// cross the wire. This decides what a member is OFFERED, never what they get.
// =============================================================

type Props = {
  poolId: string;
  /** Everybody in the pool, from the leaderboard — the same source Table uses. */
  entries: LeagueLeaderboardEntry[];
};

export function LeaguePickemEntriesTab({ poolId, entries }: Props) {
  const theme = useTheme();
  const league = useLeaguePool(poolId);
  const now = Date.now();

  // The only thing this screen needs to know about time: has anything locked?
  // Not WHICH week — that question belongs to the wizard.
  const lastLocked = lastLockedWeek(league.data?.season.matchweeks ?? [], now);
  const revealed = lastLocked !== null;

  const ownEntryIds = useMemo(
    () => new Set((league.data?.you.entries ?? []).map((e) => e.entry_id)),
    [league.data],
  );
  const mine = entries.filter((e) => ownEntryIds.has(e.entry_id));
  const others = entries.filter((e) => !ownEntryIds.has(e.entry_id));

  // ⚠ No `mw`. The wizard resolves the week itself — for your own entry the
  // active one, for a rival the last that locked — so the two screens cannot
  // drift and a member who left on matchweek 12 does not return to it.
  const open = (entry: LeagueLeaderboardEntry) =>
    router.navigate(
      `/pool/${poolId}/pickem/${entry.entry_id}?name=${encodeURIComponent(
        entry.entry_name?.trim() ? entry.entry_name : entry.full_name,
      )}`,
    );

  if (league.isPending) {
    return (
      <View style={{ paddingVertical: theme.spacing.hero, alignItems: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (league.isError) {
    return (
      <View
        style={{
          paddingVertical: theme.spacing.hero,
          paddingHorizontal: theme.spacing.xl,
          gap: theme.spacing.md,
        }}
      >
        <Text variant="sectionHeader" align="center">
          Predictions unavailable
        </Text>
        <Text variant="body" color="slate" align="center">
          {league.error instanceof Error ? league.error.message : 'This pool could not be loaded.'}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        gap: theme.spacing.md,
      }}
    >
      {mine.length === 0 ? (
        <View style={{ alignItems: 'center', gap: theme.spacing.md, paddingVertical: theme.spacing.xxl }}>
          <Icon name="pencil.line" color="primary" size={40} />
          <Text variant="cardTitle" align="center">
            No entry in this pool
          </Text>
          <Text variant="body" color="slate" align="center">
            You are looking at this pool without playing in it.
          </Text>
        </View>
      ) : (
        /* ⚠ NO HEADING. Ryan, 2026-09-03: *"'Your Picks' doesn't need to be
           there either — it's just gonna be the top, and the list underneath is
           gonna be everyone's picks."* So yours is identified by POSITION and by
           your own face on it, not by a label above it and not by a tint. One
           heading on the screen, and it belongs to the list that needs one. */
        mine.map((entry) => (
          <EntryCard key={entry.entry_id} entry={entry} openable onPress={() => open(entry)} />
        ))
      )}

      {/*
        Everyone else's, on the same terms Table mode uses: the section is
        always present so the promise is visible before it pays out, and the
        rows are inert until something has locked.
      */}
      {others.length > 0 ? (
        <View style={{ gap: theme.spacing.md, paddingTop: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Text variant="cardTitle">Everyone&apos;s picks</Text>
            {!revealed ? <Icon name="lock.fill" color="slate" size={13} /> : null}
          </View>
          {/* ⚠ ONLY when the rows are inert. Ryan removed the revealed-state
              explainer on 2026-09-03 — once the cards open, the behaviour
              explains itself and the sentence was restating the obvious.
              This one survives because a greyed card with no reason reads as a
              loading state rather than a rule, which is the note the survivor
              picker also carries: greyed AND labelled, never just greyed. */}
          {!revealed ? (
            <Text variant="detail" color="slate">
              Everyone&apos;s picks unlock as each matchweek closes. Until the first one does, the
              only picks you can see are your own — including if you run the pool.
            </Text>
          ) : null}
          {others.map((entry) => (
            <EntryCard
              key={entry.entry_id}
              entry={entry}
              openable={revealed}
              onPress={revealed ? () => open(entry) : undefined}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/**
 * A name and a way in. No progress, no week, no score.
 *
 * ⚠ Every one of those was tried and removed: each is matchweek-scoped, so
 * showing one drags the whole week-selection problem back onto a screen whose
 * job is to list people.
 */
function EntryCard({
  entry,
  openable,
  onPress,
}: {
  entry: LeagueLeaderboardEntry;
  openable: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const name = entry.entry_name?.trim() ? entry.entry_name : entry.full_name;

  return (
    <Pressable
      onPress={onPress}
      disabled={!openable}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.md + 2,
        borderRadius: theme.radii.lg,
        // ⚠ NO current-user tint, unlike `LeaderboardRow`. Ryan, 2026-09-03:
        // *"it doesn't need to be blue or highlighted, it's already under that
        // title."* He is right and the distinction is worth keeping straight —
        // the leaderboard mixes everyone into one ranked list, so a highlight is
        // the only thing that finds you in it. Here the heading above already
        // separates yours from theirs, and tinting it says the same thing twice.
        backgroundColor: theme.colors.surface,
        opacity: !openable ? 0.55 : pressed ? 0.85 : 1,
        ...theme.shadows.card,
      })}
    >
      {/* ⚠ Initials, not a photo, and not for want of trying: the product
          stores no avatar on any table. This is the same mark the World Cup
          predictions list uses, from the same function. */}
      <InitialsAvatar name={entry.full_name} />

      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="cardTitle" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="detail" color="slate" numberOfLines={1}>
          @{entry.username}
        </Text>
      </View>

      {openable ? (
        <Icon name="chevron.right" color="slate" size={11} />
      ) : (
        <Icon name="lock.fill" color="slate" size={11} />
      )}
    </Pressable>
  );
}
