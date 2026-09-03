import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Platform, Pressable, Text as RNText, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import type { LeagueLeaderboardEntry } from '@/lib/api';
import {
  defaultWeek,
  fixturesForWeek,
  pickedCount,
  weekState,
  type WeekState,
} from '@/lib/pickemWeek';
import { useLeaguePool, useLeaguePoolPicks } from '@/lib/useLeaguePool';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// THE PREDICTIONS TAB FOR A PICK'EM POOL — entries, and only entries
// =============================================================
// Ryan, 2026-09-03: *"on the predictions tab it should just be your entries
// listed and the other members there once predictions lock for that match
// week."* So this is `LeagueTableEntriesTab`'s shape unchanged: own entries
// first, everybody else's behind the lock.
//
// ## ⚠ THE WEEK SWITCHER MOVED OUT, deliberately
//
// It lived here for one commit and Ryan moved it into the wizard. The tab is
// about WHO — a list of entries — and the wizard is about WHICH WEEK. Mixing the
// two put a navigation control above a list it only partly governed: stepping to
// matchweek 30 changed the count on every card while the cards themselves still
// answered "whose picks are these", a question the week has no bearing on.
//
// What stays is a STATIC caption naming the week these counts describe. Without
// it "7/10" is a number with no denominator anybody can see. It is a label, not
// a control — the season is browsed inside the wizard.
//
// ## ⚠⚠ WHAT MAY BE SHOWN IS DECIDED BY THE SERVER, NOT HERE
//
// `/bulk` runs `computeReveal` + `gatePoolPredictions` and strips other members'
// unlocked picks BEFORE they cross the wire. This screen asks for them only for
// a week it believes is locked, but that belief is a display decision — if the
// two disagree the server wins and the list comes back short. Filtering here
// instead would ship every unlocked pick to the phone and merely hide it, which
// is the bug the member-predictions feature was designed not to have.
//
// ⚠ And "locked" is the CLOCK, never a state string — see `pickemWeek.ts`.
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

  const season = league.data?.season;
  const matchweeks = useMemo(() => season?.matchweeks ?? [], [season]);

  // The week this list describes. ⚠ The SAME function the wizard opens on, so
  // the two can never disagree about which week a card's count refers to.
  const current = defaultWeek(
    matchweeks,
    season?.openMatchweekNumber ?? null,
    season?.inPlayMatchweekNumber ?? null,
    now,
  );
  const mw = matchweeks.find((m) => m.number === current);
  const state = weekState(mw, season?.openMatchweekNumber ?? null, now);

  // ⚠ Only asked for once the week is genuinely locked — the payload is every
  // revealed pick in the pool and reaches ~3,800 rows by May.
  const picks = useLeaguePoolPicks(poolId, state === 'locked');

  const weekFixtures = useMemo(
    () => (current === null ? [] : fixturesForWeek(season?.matches ?? [], current)),
    [season, current],
  );

  /**
   * Which fixtures each entry has picked, for THIS week.
   *
   * ⚠ Both shapes are merged, because a pool is one depth or the other and this
   * list should not have to know which: Scores picks arrive in `predictions`
   * keyed `match_id`, Results taps in `outcomes` keyed by fixture id.
   */
  const pickedByEntry = useMemo(() => {
    const ids = new Set(weekFixtures.map((f) => f.match_id));
    const map = new Map<string, Set<string>>();
    const add = (entryId: string, matchId: string) => {
      if (!ids.has(matchId)) return;
      const s = map.get(entryId) ?? new Set<string>();
      s.add(matchId);
      map.set(entryId, s);
    };
    for (const p of picks.data?.predictions ?? []) add(p.entry_id, p.match_id);
    for (const o of picks.data?.outcomes ?? []) add(o.entry_id, o.match_id);
    // Your own come from the league contract rather than `/bulk`, because they
    // are readable at any time and `/bulk` is not fetched for an open week.
    for (const e of league.data?.you.entries ?? []) {
      // ⚠ `match_id`, NOT `fixture_id` — the contract renames the column on the
      // way out. Reading the wrong one is `undefined`: no error, no empty array
      // to notice, and it showed 0/10 over ten saved scorelines.
      for (const p of e.predictions) add(e.entry_id, p.match_id);
      for (const fixtureId of Object.keys(e.outcomes)) add(e.entry_id, fixtureId);
    }
    return map;
  }, [picks.data, league.data, weekFixtures]);

  const ownEntryIds = useMemo(
    () => new Set((league.data?.you.entries ?? []).map((e) => e.entry_id)),
    [league.data],
  );

  const mine = entries.filter((e) => ownEntryIds.has(e.entry_id));
  const others = entries.filter((e) => !ownEntryIds.has(e.entry_id));

  // ⚠ No `mw` param. The wizard resolves its own default so the two screens
  // cannot drift apart, and pinning a week here would freeze the wizard on
  // whatever this tab happened to be showing when it was tapped.
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

  if (league.isError || current === null) {
    return (
      <View
        style={{
          paddingVertical: theme.spacing.hero,
          paddingHorizontal: theme.spacing.xl,
          gap: theme.spacing.md,
        }}
      >
        <Text variant="sectionHeader" align="center">
          Matchweeks unavailable
        </Text>
        <Text variant="body" color="slate" align="center">
          {league.error instanceof Error ? league.error.message : 'The season could not be loaded.'}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md,
        gap: theme.spacing.lg,
      }}
    >
      <WeekCaption week={current} state={state} lockAt={mw?.lock_at ?? null} />

      {mine.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <SectionLabel>Your picks</SectionLabel>
          {mine.map((e) => (
            <EntryCard
              key={e.entry_id}
              entry={e}
              isOwn
              state={state}
              total={weekFixtures.length}
              picked={pickedCount(weekFixtures, (id) => pickedByEntry.get(e.entry_id)?.has(id) ?? false)}
              onPress={() => open(e)}
            />
          ))}
        </View>
      ) : null}

      {others.length > 0 ? (
        <View style={{ gap: theme.spacing.sm }}>
          <SectionLabel>
            {state === 'locked' ? "Everyone's picks" : `Everyone else · ${others.length}`}
          </SectionLabel>

          {state === 'locked' ? (
            picks.isPending ? (
              <View style={{ paddingVertical: theme.spacing.xl, alignItems: 'center' }}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : (
              others.map((e) => (
                <EntryCard
                  key={e.entry_id}
                  entry={e}
                  isOwn={false}
                  state={state}
                  total={weekFixtures.length}
                  picked={pickedCount(weekFixtures, (id) => pickedByEntry.get(e.entry_id)?.has(id) ?? false)}
                  onPress={() => open(e)}
                />
              ))
            )
          ) : (
            /* ⚠ The reason, not just a locked door. A member who cannot see the
               others should be told the rule protects them too — nobody can see
               theirs either — because the alternative reading is that everyone
               else is hidden from them specifically. */
            <LockedNote state={state} lockAt={mw?.lock_at ?? null} count={others.length} />
          )}
        </View>
      ) : null}
    </View>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="caption" color="slate" style={{ letterSpacing: 0.6 }}>
      {children}
    </Text>
  );
}

/**
 * Which week these counts are about — a LABEL, not a control.
 *
 * ⚠ The switcher lives in the wizard now. This exists only so "7/10" has a
 * visible denominator; the moment it becomes tappable it is the thing Ryan
 * asked to move.
 */
function WeekCaption({
  week,
  state,
  lockAt,
}: {
  week: number;
  state: WeekState;
  lockAt: string | null;
}) {
  const theme = useTheme();
  const sub =
    state === 'open'
      ? lockAt
        ? `Picks close ${shortWhen(lockAt)}`
        : 'Picks open'
      : state === 'locked'
        ? 'Locked — everyone’s picks are in'
        : 'Not open yet';
  const tone = state === 'open' ? theme.colors.green : theme.colors.slate;
  return (
    <View style={{ alignItems: 'center', gap: 3 }}>
      <Text variant="cardTitle">Matchweek {week}</Text>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: theme.radii.pill,
          backgroundColor: withOpacity(tone, 0.12),
        }}
      >
        <Icon
          name={(state === 'open' ? 'lock.open' : state === 'locked' ? 'lock' : 'clock') as never}
          color={state === 'open' ? 'green' : 'slate'}
          size={10}
        />
        <RNText style={{ fontFamily: fontFamilies.semibold, fontSize: 11, color: tone }}>
          {sub}
        </RNText>
      </View>
    </View>
  );
}

function LockedNote({
  state,
  lockAt,
  count,
}: {
  state: WeekState;
  lockAt: string | null;
  count: number;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        padding: theme.spacing.lg,
        borderRadius: theme.radii.lg,
        backgroundColor: theme.colors.surface,
        gap: 6,
        ...theme.shadows.card,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name="eye.slash" color="slate" size={12} />
        <Text variant="cardTitle">
          {count} {count === 1 ? 'other entry' : 'other entries'}, hidden
        </Text>
      </View>
      <Text variant="detail" color="slate">
        {state === 'open'
          ? `Nobody can see anybody's picks while the week is open — including yours.${
              lockAt ? ` They all appear ${shortWhen(lockAt)}.` : ''
            }`
          : 'This matchweek has not opened yet, so there is nothing to show.'}
      </Text>
    </View>
  );
}

function EntryCard({
  entry,
  isOwn,
  state,
  picked,
  total,
  onPress,
}: {
  entry: LeagueLeaderboardEntry;
  isOwn: boolean;
  state: WeekState;
  picked: number;
  total: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  const name = entry.entry_name?.trim() ? entry.entry_name : entry.full_name;
  // ⚠ Your own card always opens — the wizard is where the season is browsed, so
  // it has to be reachable even on a week you cannot pick in. A rival's opens
  // only once the week has locked; before that there is nothing to show.
  const openable = isOwn || state === 'locked';

  return (
    <Pressable
      onPress={openable ? onPress : undefined}
      disabled={!openable}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.md + 2,
        borderRadius: theme.radii.lg,
        backgroundColor: isOwn
          ? Platform.OS === 'android'
            ? '#E2E6FA'
            : withOpacity(theme.colors.primary, 0.08)
          : theme.colors.surface,
        borderWidth: isOwn ? (Platform.OS === 'android' ? 2 : theme.borders.accent) : 0,
        borderColor: isOwn
          ? Platform.OS === 'android'
            ? '#B1BDF1'
            : withOpacity(theme.colors.primary, 0.25)
          : 'transparent',
        opacity: pressed ? 0.85 : 1,
        ...theme.shadows.card,
      })}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <Text variant="cardTitle" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="detail" color="slate" numberOfLines={1}>
          @{entry.username}
        </Text>
      </View>

      <PickProgress picked={picked} total={total} state={state} isOwn={isOwn} />

      {openable ? <Icon name="chevron.right" color="slate" size={11} /> : null}
    </Pressable>
  );
}

/**
 * "7/10" — and nothing at all when the number would be a lie.
 *
 * ⚠ A rival's count is only knowable once the week has locked, because until
 * then their picks are not on this device. Rendering "0/10" for them would
 * accuse everyone in the pool of not turning up, which is the confident-zero
 * shape this surface keeps having to design around.
 */
function PickProgress({
  picked,
  total,
  state,
  isOwn,
}: {
  picked: number;
  total: number;
  state: WeekState;
  isOwn: boolean;
}) {
  const theme = useTheme();
  if (total === 0) return null;
  if (!isOwn && state !== 'locked') return null;

  const complete = picked === total;
  const none = picked === 0;
  return (
    <View style={{ alignItems: 'flex-end', gap: 2 }}>
      <RNText
        style={{
          fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
          fontSize: 14,
          fontWeight: '800',
          color: complete ? theme.colors.green : none ? theme.colors.slate : theme.colors.ink,
        }}
      >
        {picked}/{total}
      </RNText>
      <Text variant="detail" color="slate">
        {/* Past tense once the week is shut — "to pick" on a locked week offers
            something that is no longer possible. */}
        {state === 'locked' ? (none ? 'no picks' : 'picked') : complete ? 'all picked' : 'picked'}
      </Text>
    </View>
  );
}

/** A short, device-local "when" — the same shape the rest of the app uses. */
function shortWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}
