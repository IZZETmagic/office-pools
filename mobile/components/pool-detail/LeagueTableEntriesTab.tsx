import { router } from 'expo-router';
import { Platform, Pressable, Text as RNText, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import type { LeagueLeaderboardEntry } from '@/lib/api';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// THE PREDICTIONS TAB FOR A TABLE POOL — entries, not a picker
// =============================================================
// Ryan, 2026-09-03: set this up the way the World Cup does it. A card per entry;
// tap it to go into the wizard; everyone else's appear here once the deadline
// passes. So this mirrors `PredictionsTab` — own entries first, then
// "Everyone's tables" with the same lock copy — and the picking itself lives on
// its own route, exactly as `BracketPickerWizard` does.
//
// ⚠ THAT MOVE IS ALSO WHAT FIXES THE LAYOUT. A picker rendered inside this tab
// sits in the pager's ScrollView, where its own `ScrollViewContainer` cannot get
// a height (`flex: 1` collapses to content). On its own route it has the whole
// screen, which is where the wizard has always got its height from.
//
// ## One entry, and that is not a special case
//
// A league pool is one entry per member — forced at creation and in both
// Settings screens. So this list is almost always one card. It is still a list:
// the WC shape is what Ryan asked for, and "Add Entry" is simply never offered
// rather than the whole surface being different.
// =============================================================

type Props = {
  poolId: string;
  entries: LeagueLeaderboardEntry[];
  currentUserId: string | null;
  /** Has the table deadline passed? Gates everyone else's tables entirely. */
  isLocked: boolean;
  /** For the empty state — a member with no entry cannot pick from here. */
  lockAt: string | null;
};

export function LeagueTableEntriesTab({
  poolId,
  entries,
  currentUserId,
  isLocked,
  lockAt,
}: Props) {
  const theme = useTheme();

  const mine = entries.filter((e) => e.user_id === currentUserId);
  const others = entries.filter((e) => e.user_id !== currentUserId);

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
          <Text variant="cardTitle" align="center">No entry in this pool</Text>
          <Text variant="body" color="slate" align="center">
            You are looking at this pool without playing in it.
          </Text>
        </View>
      ) : (
        <>
          <Text variant="cardTitle">Your table</Text>
          {mine.map((entry) => (
            <EntryCard
              key={entry.entry_id}
              entry={entry}
              isOwn
              isLocked={isLocked}
              lockAt={lockAt}
              onPress={() => router.navigate(`/pool/${poolId}/table/${entry.entry_id}`)}
            />
          ))}
        </>
      )}

      {/*
        Everyone else's, on exactly the World Cup's terms: the section is always
        present so the promise is visible before it pays out, and the rows are
        inert until the deadline.

        ⚠ The lock is enforced in the DATABASE — RLS on
        `league_table_predictions` (078, tightened by 104) refuses a rival's rows
        until `league_table_lock_at` has passed, for admins too. This only
        decides what a member is offered.
      */}
      {others.length > 0 ? (
        <View style={{ gap: theme.spacing.md, paddingTop: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Text variant="cardTitle">Everyone&apos;s tables</Text>
            {!isLocked ? <Icon name="lock.fill" color="slate" size={13} /> : null}
          </View>
          {!isLocked ? (
            <Text variant="detail" color="slate">
              Everyone&apos;s tables unlock when picking closes. Until then the only one you can see
              is your own — including if you run the pool.
            </Text>
          ) : null}
          {others.map((entry) => (
            <EntryCard
              key={entry.entry_id}
              entry={entry}
              isOwn={false}
              isLocked={isLocked}
              lockAt={lockAt}
              onPress={
                isLocked
                  ? () =>
                      router.navigate(
                        `/pool/${poolId}/table/${entry.entry_id}?viewAs=member&owner=${encodeURIComponent(
                          entry.entry_name?.trim() ? entry.entry_name : entry.full_name,
                        )}`,
                      )
                  : undefined
              }
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function EntryCard({
  entry,
  isOwn,
  isLocked,
  lockAt,
  onPress,
}: {
  entry: LeagueLeaderboardEntry;
  isOwn: boolean;
  isLocked: boolean;
  lockAt: string | null;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const name = entry.entry_name?.trim() ? entry.entry_name : entry.full_name;
  const disabled = !onPress;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
        borderRadius: theme.radii.lg,
        backgroundColor: theme.colors.surface,
        opacity: disabled ? 0.55 : pressed ? 0.85 : 1,
        ...theme.shadows.card,
      })}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: withOpacity(theme.colors.primary, 0.12),
        }}
      >
        <Icon name={disabled ? 'lock.fill' : 'list.number'} color="primary" size={16} />
      </View>

      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="cardTitle" numberOfLines={1}>{name}</Text>
        <Status entry={entry} isOwn={isOwn} isLocked={isLocked} lockAt={lockAt} />
      </View>

      {/* ⚠ Only once the table is scoring. Before the deadline everybody is on
          zero, and printing it reads as a result rather than as "not yet". */}
      {isLocked && entry.has_filed ? (
        <RNText
          style={{
            fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
            fontSize: 16,
            fontWeight: '900',
            color: theme.colors.primary,
          }}
        >
          {entry.total_points.toLocaleString()}
        </RNText>
      ) : null}

      {!disabled ? <Icon name="chevron.right" color="slate" size={11} /> : null}
    </Pressable>
  );
}

/**
 * ⚠ FOUR STATES, and collapsing any two of them loses something a member needs.
 * "Not filled in" before the deadline is a to-do; after it, it is a season
 * scoring nothing through a choice nobody can now change — Decision 11's point
 * that never getting the chance and skipping it deserve different sentences.
 */
function Status({
  entry,
  isOwn,
  isLocked,
  lockAt,
}: {
  entry: LeagueLeaderboardEntry;
  isOwn: boolean;
  isLocked: boolean;
  lockAt: string | null;
}) {
  if (!entry.has_filed) {
    return (
      <Text variant="detail" color={isLocked ? 'slate' : 'red'}>
        {isLocked
          ? isOwn ? 'You didn’t predict the table' : 'No table filed'
          : lockAt ? `Not filled in — closes ${formatWhen(lockAt)}` : 'Not filled in'}
      </Text>
    );
  }
  if (!isLocked) {
    return (
      <Text variant="detail" color="slate">
        {isOwn
          ? lockAt
            ? `Filled in — you can still change it until ${formatWhen(lockAt)}`
            : 'Filled in'
          : 'Filled in'}
      </Text>
    );
  }
  return (
    <Text variant="detail" color="slate">
      {isOwn ? 'Your finishing order' : 'Tap to see their table'}
    </Text>
  );
}

/** Device-local, like every other instant in the app. */
function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'soon';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}
