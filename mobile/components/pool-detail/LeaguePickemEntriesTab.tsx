import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text as RNText, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import type { LeagueLeaderboardEntry } from '@/lib/api';
import {
  fixturesForWeek,
  initialWeek,
  pickedCount,
  stepWeek,
  weekState,
  type WeekState,
} from '@/lib/pickemWeek';
import { useLeaguePool, useLeaguePoolPicks } from '@/lib/useLeaguePool';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// THE PREDICTIONS TAB FOR A PICK'EM POOL — a matchweek, then its entries
// =============================================================
// Ryan, 2026-09-03: *"there should still be a landing page there with your
// entries, and then once it's locked for that match week, you can see everybody
// else's entries as well."* So this is `LeagueTableEntriesTab`'s shape — own
// entries first, then everyone's behind a lock — with the one thing Table never
// needed: a WEEK.
//
// ## ⚠ Why the week switcher is not a convenience
//
// Table mode asks for one prediction and reveals it once, on one deadline. This
// mode asks for ten picks a week, thirty-eight times, and **every week reveals
// on its own clock**. A screen showing only the open week would leave the other
// thirty-seven unreachable — including the two that already hold every member's
// picks in production today. The reveal is per-matchweek, so the navigation has
// to be too.
//
// ## ⚠⚠ WHAT MAY BE SHOWN IS DECIDED BY THE SERVER, NOT HERE
//
// `/bulk` runs `computeReveal` + `gatePoolPredictions` and strips other members'
// unlocked picks BEFORE they cross the wire. This screen asks for them only for
// a week it believes is locked, but that belief is a display decision — if the
// two ever disagree the server wins and the list comes back short. Filtering
// here instead would ship every unlocked pick to the phone and merely hide it,
// which is the exact bug the member-predictions feature was designed not to have.
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
  const [week, setWeek] = useState<number | null>(null);
  const current = week ?? initialWeek(matchweeks, season?.openMatchweekNumber ?? null, now);

  const mw = matchweeks.find((m) => m.number === current);
  const state = weekState(mw, season?.openMatchweekNumber ?? null, now);

  // ⚠ Only asked for once a week is genuinely locked — see the header. This is
  // what keeps a phone off a payload that reaches ~3,800 rows by May.
  const picks = useLeaguePoolPicks(poolId, state === 'locked');

  const weekFixtures = useMemo(
    () => (current === null ? [] : fixturesForWeek(season?.matches ?? [], current)),
    [season, current],
  );

  /**
   * Which fixtures each entry has picked, for THIS week.
   *
   * ⚠ Both shapes are merged, because a pool is one depth or the other and the
   * screen should not have to know which: Scores picks arrive in `predictions`,
   * Results taps in `outcomes`, and the two are mutually exclusive per pool.
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
    // Your own picks come from the league contract rather than `/bulk`, because
    // they are readable at any time and `/bulk` is not fetched for an open week.
    for (const e of league.data?.you.entries ?? []) {
      for (const p of e.predictions) add(e.entry_id, p.fixture_id);
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

  if (league.isPending) {
    return (
      <View style={{ paddingVertical: theme.spacing.hero, alignItems: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (league.isError || current === null) {
    return (
      <View style={{ paddingVertical: theme.spacing.hero, paddingHorizontal: theme.spacing.xl, gap: theme.spacing.md }}>
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
      <WeekSwitcher
        week={current}
        state={state}
        lockAt={mw?.lock_at ?? null}
        fixtureCount={weekFixtures.length}
        onPrev={() => {
          const p = stepWeek(matchweeks, current, -1);
          if (p !== null) setWeek(p);
        }}
        onNext={() => {
          const n = stepWeek(matchweeks, current, 1);
          if (n !== null) setWeek(n);
        }}
        hasPrev={stepWeek(matchweeks, current, -1) !== null}
        hasNext={stepWeek(matchweeks, current, 1) !== null}
      />

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
              onPress={() => router.navigate(`/pool/${poolId}/pickem/${e.entry_id}?mw=${current}`)}
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
                  onPress={() =>
                    router.navigate(
                      `/pool/${poolId}/pickem/${e.entry_id}?mw=${current}&name=${encodeURIComponent(
                        e.entry_name?.trim() ? e.entry_name : e.full_name,
                      )}`,
                    )
                  }
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
 * ‹ Matchweek 3 › — and what may be done with it.
 *
 * ⚠ The chip says what the WEEK is, not what the member has done. "Picks open"
 * and "Locked" are facts about the pool; a personal progress count belongs on
 * the card, where it is about one entry.
 */
function WeekSwitcher({
  week,
  state,
  lockAt,
  fixtureCount,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: {
  week: number;
  state: WeekState;
  lockAt: string | null;
  fixtureCount: number;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Arrow icon="chevron.left" onPress={onPrev} enabled={hasPrev} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text variant="cardTitle" numberOfLines={1}>
            Matchweek {week}
          </Text>
          <Text variant="detail" color="slate">
            {fixtureCount} {fixtureCount === 1 ? 'fixture' : 'fixtures'}
          </Text>
        </View>
        <Arrow icon="chevron.right" onPress={onNext} enabled={hasNext} />
      </View>
      <View style={{ alignItems: 'center' }}>
        <WeekChip state={state} lockAt={lockAt} />
      </View>
    </View>
  );
}

function Arrow({ icon, onPress, enabled }: { icon: string; onPress: () => void; enabled: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surface,
        opacity: !enabled ? 0.3 : pressed ? 0.7 : 1,
        ...theme.shadows.card,
      })}
    >
      <Icon name={icon as never} color="slate" size={13} />
    </Pressable>
  );
}

function WeekChip({ state, lockAt }: { state: WeekState; lockAt: string | null }) {
  const theme = useTheme();
  const spec =
    state === 'open'
      ? { label: lockAt ? `Picks close ${shortWhen(lockAt)}` : 'Picks open', fg: theme.colors.green, icon: 'lock.open' }
      : state === 'locked'
        ? { label: 'Locked — everyone’s picks are in', fg: theme.colors.slate, icon: 'lock' }
        : { label: 'Not open yet', fg: theme.colors.slate, icon: 'clock' };
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: theme.radii.pill,
        backgroundColor: withOpacity(spec.fg, 0.12),
      }}
    >
      <Icon name={spec.icon as never} color={state === 'open' ? 'green' : 'slate'} size={10} />
      <RNText style={{ fontFamily: fontFamilies.semibold, fontSize: 11, color: spec.fg }}>
        {spec.label}
      </RNText>
    </View>
  );
}

function LockedNote({ state, lockAt, count }: { state: WeekState; lockAt: string | null; count: number }) {
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
  // ⚠ Your own card opens the picker on an open week and a read-back on a
  // locked one; a rival's only ever opens once the week has locked. A card that
  // cannot lead anywhere does not pretend to.
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
 * "7 of 10" — and nothing at all when the number would be a lie.
 *
 * ⚠ A rival's count is only knowable once the week has locked, because until
 * then their picks are not on this device. Rendering "0 of 10" for them would
 * accuse everyone in the pool of not turning up, which is the confident-zero
 * shape this whole surface keeps having to design around.
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
        {/* Past tense once the week is shut — "to pick" on a locked week is
            offering something that is no longer possible. */}
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
