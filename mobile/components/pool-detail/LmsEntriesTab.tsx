import { router } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text as RNText, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import type { LmsMember, LmsPickCell, LmsState } from '@/lib/api';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// LAST MAN STANDING — the Predictions tab
// =============================================================
// Ryan, 3 Sep: *"a landing page as usual to allow to show the other members'
// predictions this MW and the previous historic picks, then the actual
// prediction wizard should be straightforward like the web app."* So this is the
// landing, and the picking is a route away — `pool/[id]/survivor/[entryId]`.
//
// ⚠ THE PICKER IS ON ITS OWN ROUTE FOR A LAYOUT REASON, not a navigational one.
// `LeagueTableEntriesTab` paid for this: anything rendered inside this tab sits
// in the pager's ScrollView, where a scrollable child cannot get a height —
// `flex: 1` collapses to content. On its own route it has the whole screen.
//
// ## The wall
//
// A row per member, a column per matchweek in the round, a crest in each cell.
// This mode's whole story is who backed what and when it went wrong, and that is
// a grid, not a list — you read down a column to see this week and across a row
// to see how somebody got here.
//
// ⚠ WHAT IS MISSING FROM `picks` IS NOT NOTHING. The server reads that table
// with the caller's own client so RLS decides what comes back (086: your own
// always, everyone else's only once the matchweek has LOCKED). So an empty cell
// is ambiguous by construction, and `locked_matchweeks` is the only thing that
// resolves it — sealed, or genuinely never picked. Rendering both as a blank
// would accuse half the pool of not turning up.
// =============================================================

const ROW_H = 44;
const NAME_W = 112;
const CELL_W = 52;

type Props = {
  poolId: string;
  state: LmsState | null;
  loading: boolean;
  error: string | null;
  currentUserId: string | null;
};

export function LmsEntriesTab({ poolId, state, loading, error, currentUserId }: Props) {
  const theme = useTheme();

  if (loading && !state) {
    return (
      <View style={{ paddingVertical: theme.spacing.hero, alignItems: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ paddingVertical: theme.spacing.xl, paddingHorizontal: theme.spacing.xl, gap: theme.spacing.sm }}>
        <Text variant="sectionHeader" align="center">
          Couldn&apos;t load the round
        </Text>
        <Text variant="body" color="slate" align="center">
          {error}
        </Text>
      </View>
    );
  }

  if (!state?.round) {
    return (
      <View style={{ paddingVertical: theme.spacing.hero, paddingHorizontal: theme.spacing.xl, gap: theme.spacing.md }}>
        <Text variant="sectionHeader" align="center">
          No round open yet
        </Text>
        <Text variant="body" color="slate" align="center">
          Picking starts when the first round opens.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, gap: theme.spacing.lg }}>
      <StatusCard poolId={poolId} state={state} />
      <PicksWall state={state} currentUserId={currentUserId} />
    </View>
  );
}

/**
 * Your own round, in one card, before anything about anyone else.
 *
 * ⚠ IN PLAY LEADS AND OPEN FOLLOWS, as two separately labelled decisions. They
 * can never be the same week — in play requires locked, open requires unlocked —
 * and collapsing them into one number is what once had a screen announcing next
 * weekend's club while this weekend decided who survived.
 */
function StatusCard({ poolId, state }: { poolId: string; state: LmsState }) {
  const theme = useTheme();
  const me = state.members.find((m) => m.entry_id === state.my_entry_id) ?? null;
  const myPick = (mw: number | null) =>
    mw === null ? null : state.picks.find((p) => p.entry_id === state.my_entry_id && p.matchweek_number === mw) ?? null;

  const inPlayPick = myPick(state.in_play_matchweek);
  const openPick = myPick(state.open_matchweek);
  const fixtureFor = (clubId: string | undefined) =>
    clubId ? state.fixtures.find((f) => f.club_id === clubId) ?? null : null;

  const card = {
    padding: theme.spacing.md + 2,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.sm,
    ...theme.shadows.card,
  } as const;

  if (!me) {
    return (
      <View style={card}>
        <Text variant="cardTitle">You&apos;re not in this pool&apos;s round</Text>
        <Text variant="detail" color="slate">
          You can watch it play out below.
        </Text>
      </View>
    );
  }

  // ⚠ Not in the round is NOT out. They joined after it opened — everybody in it
  // has already spent clubs, and starting late with a full twenty would be an
  // advantage nobody else had.
  if (!me.in_round) {
    return (
      <View style={card}>
        <Text variant="cardTitle">You join the next round</Text>
        <Text variant="detail" color="slate">
          This one started before you did, and everyone in it has already spent clubs. You&apos;ll
          start the next one level with everybody else.
        </Text>
      </View>
    );
  }

  if (me.eliminated_matchweek !== null) {
    return (
      <View style={card}>
        <Text variant="cardTitle">You went out in matchweek {me.eliminated_matchweek}</Text>
        <Text variant="detail" color="slate">
          You&apos;re back in as soon as this round ends — everyone starts the next one level.
        </Text>
      </View>
    );
  }

  const canPick = state.open_matchweek !== null && state.my_entry_id !== null;

  return (
    <View style={card}>
      <View style={{ flexDirection: 'row', gap: theme.spacing.md }}>
        {state.in_play_matchweek !== null ? (
          <WeekBlock
            label={`MW${state.in_play_matchweek} — in play`}
            club={inPlayPick ? { name: inPlayPick.club_name, crest: inPlayPick.crest_url } : null}
            // No fixture line: `fixtures` is the OPEN week's, and narrating an
            // in-play pick with next week's opponent is exactly the bug 115 ends.
            sub={
              inPlayPick
                ? 'The result decides your week.'
                : 'No pick is an elimination once the week settles — we won’t choose for you.'
            }
            danger={!inPlayPick}
          />
        ) : null}

        {state.open_matchweek !== null ? (
          <WeekBlock
            label={`MW${state.open_matchweek} — next up`}
            club={openPick ? { name: openPick.club_name, crest: openPick.crest_url } : null}
            sub={
              openPick
                ? fixtureFor(openPick.club_id)
                  ? `${fixtureFor(openPick.club_id)!.is_home ? 'v ' : 'at '}${fixtureFor(openPick.club_id)!.opponent_name} — you can still change it.`
                  : 'You can still change it.'
                : 'No pick means you’re out — we won’t choose for you.'
            }
            danger={!openPick}
          />
        ) : null}

        {state.in_play_matchweek === null && state.open_matchweek === null ? (
          <WeekBlock
            label="No matchweek to pick"
            club={null}
            sub="The season has no matchweeks left to play."
            danger={false}
          />
        ) : null}
      </View>

      {canPick ? (
        <Pressable
          onPress={() => router.push(`/pool/${poolId}/survivor/${state.my_entry_id}`)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: theme.spacing.sm + 2,
            borderRadius: theme.radii.md,
            backgroundColor: openPick ? withOpacity(theme.colors.primary, 0.1) : theme.colors.primary,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 13,
              color: openPick ? theme.colors.primary : '#FFFFFF',
            }}
          >
            {openPick ? 'Change your club' : `Pick your club for MW${state.open_matchweek}`}
          </RNText>
          <Icon name="chevron.right" color={openPick ? 'primary' : 'ink'} size={11} />
        </Pressable>
      ) : null}
    </View>
  );
}

function WeekBlock({
  label,
  club,
  sub,
  danger,
}: {
  label: string;
  club: { name: string; crest: string | null } | null;
  sub: string;
  danger: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, gap: 3 }}>
      <Text variant="caption" color="slate">
        {label}
      </Text>
      {club ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {club.crest ? (
            <Image source={{ uri: club.crest }} style={{ width: 20, height: 20 }} resizeMode="contain" />
          ) : null}
          <Text variant="cardTitle" numberOfLines={1} style={{ flexShrink: 1 }}>
            {club.name}
          </Text>
        </View>
      ) : (
        <Text variant="cardTitle" color={danger ? 'red' : 'ink'}>
          {danger ? 'No pick yet' : '—'}
        </Text>
      )}
      <Text variant="detail" color="slate">
        {sub}
      </Text>
    </View>
  );
}

/** A member's cell in one matchweek, resolved to one of four states. */
type CellState =
  | { kind: 'pick'; pick: LmsPickCell }
  /** Their club is hidden from you — the week has not locked. */
  | { kind: 'sealed' }
  /** They were already out, or not in the round. Nothing was owed. */
  | { kind: 'gone' }
  /** Nothing picked, and nothing hiding it. */
  | { kind: 'none' };

function PicksWall({ state, currentUserId }: { state: LmsState; currentUserId: string | null }) {
  const theme = useTheme();

  const locked = useMemo(() => new Set(state.locked_matchweeks), [state.locked_matchweeks]);
  const byCell = useMemo(() => {
    const m = new Map<string, LmsPickCell>();
    for (const p of state.picks) m.set(`${p.entry_id}:${p.matchweek_number}`, p);
    return m;
  }, [state.picks]);

  // Same order as the leaderboard, and for the same reason: standing above out,
  // then whoever lasted longer. Two screens disagreeing about who is doing well
  // is worse than either ordering.
  const members = useMemo(
    () =>
      [...state.members].sort((a, b) => {
        const g = (m: LmsMember) => (!m.in_round ? 2 : m.eliminated_matchweek === null ? 0 : 1);
        if (g(a) !== g(b)) return g(a) - g(b);
        if ((a.eliminated_matchweek ?? 0) !== (b.eliminated_matchweek ?? 0)) {
          return (b.eliminated_matchweek ?? 0) - (a.eliminated_matchweek ?? 0);
        }
        return a.display_name.localeCompare(b.display_name);
      }),
    [state.members],
  );

  const cellFor = (member: LmsMember, mw: number): CellState => {
    const pick = byCell.get(`${member.entry_id}:${mw}`);
    if (pick) return { kind: 'pick', pick };
    if (!member.in_round) return { kind: 'gone' };
    // Out already: no pick was owed for a week they never played.
    if (member.eliminated_matchweek !== null && mw > member.eliminated_matchweek) return { kind: 'gone' };
    if (!locked.has(mw)) return { kind: 'sealed' };
    return { kind: 'none' };
  };

  if (state.matchweeks.length === 0) {
    return (
      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="caption" color="slate">
          Everyone&apos;s picks
        </Text>
        <Text variant="detail" color="slate">
          Nothing to show until the round&apos;s first matchweek opens.
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: theme.spacing.xs }}>
      <Text variant="caption" color="slate">
        Everyone&apos;s picks — round {state.round?.round_number}
      </Text>

      <View
        style={{
          flexDirection: 'row',
          borderRadius: theme.radii.lg,
          backgroundColor: theme.colors.surface,
          overflow: 'hidden',
          ...theme.shadows.card,
        }}
      >
        {/* Names stay put; only the weeks scroll. A member's row has to stay
            findable when a round is six weeks long. */}
        <View style={{ width: NAME_W, borderRightWidth: 1, borderRightColor: withOpacity(theme.colors.slate, 0.15) }}>
          <View style={{ height: ROW_H * 0.7, justifyContent: 'center', paddingLeft: theme.spacing.md }} />
          {members.map((m) => (
            <View
              key={m.entry_id}
              style={{
                height: ROW_H,
                justifyContent: 'center',
                paddingLeft: theme.spacing.md,
                paddingRight: 6,
                backgroundColor:
                  m.user_id === currentUserId ? withOpacity(theme.colors.primary, 0.06) : 'transparent',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    backgroundColor: !m.in_round
                      ? theme.colors.slate
                      : m.eliminated_matchweek === null
                        ? theme.colors.green
                        : theme.colors.red,
                  }}
                />
                <RNText
                  numberOfLines={1}
                  style={{
                    fontFamily: fontFamilies.bold,
                    fontSize: 11,
                    color: m.eliminated_matchweek === null ? theme.colors.ink : theme.colors.slate,
                    flexShrink: 1,
                  }}
                >
                  {m.display_name}
                </RNText>
                {m.rounds_won > 0 ? <Icon name="trophy.fill" color="accent" size={9} /> : null}
              </View>
            </View>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={{ flexDirection: 'row', height: ROW_H * 0.7 }}>
              {state.matchweeks.map((mw) => (
                <View key={mw} style={{ width: CELL_W, alignItems: 'center', justifyContent: 'center' }}>
                  <RNText
                    style={{
                      fontFamily: fontFamilies.bold,
                      fontSize: 9,
                      letterSpacing: 0.5,
                      color: mw === state.in_play_matchweek ? theme.colors.primary : theme.colors.slate,
                    }}
                  >
                    MW{mw}
                  </RNText>
                </View>
              ))}
            </View>

            {members.map((m) => (
              <View
                key={m.entry_id}
                style={{
                  flexDirection: 'row',
                  height: ROW_H,
                  backgroundColor:
                    m.user_id === currentUserId ? withOpacity(theme.colors.primary, 0.06) : 'transparent',
                }}
              >
                {state.matchweeks.map((mw) => (
                  <WallCell key={mw} cell={cellFor(m, mw)} />
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      <Text variant="detail" color="slate">
        Clubs stay hidden until their matchweek locks — otherwise the pool could copy the best player.
      </Text>
    </View>
  );
}

function WallCell({ cell }: { cell: CellState }) {
  const theme = useTheme();

  const base = {
    width: CELL_W,
    height: ROW_H,
    alignItems: 'center',
    justifyContent: 'center',
  } as const;

  if (cell.kind === 'sealed') {
    return (
      <View style={base}>
        <Icon name="lock.fill" color="slate" size={11} />
      </View>
    );
  }

  if (cell.kind === 'gone') {
    return (
      <View style={base}>
        <RNText style={{ color: withOpacity(theme.colors.slate, 0.45), fontSize: 13 }}>·</RNText>
      </View>
    );
  }

  // ⚠ A locked week with no pick is a real, costly fact — it is how you go out
  // without being beaten — so it is marked rather than left blank.
  if (cell.kind === 'none') {
    return (
      <View style={base}>
        <Icon name="xmark" color="slate" size={10} />
      </View>
    );
  }

  const { pick } = cell;
  const tint =
    pick.result === 'survived'
      ? theme.colors.green
      : pick.result === 'eliminated'
        ? theme.colors.red
        : null;

  return (
    <View style={base}>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tint ? withOpacity(tint, 0.14) : 'transparent',
        }}
      >
        {pick.crest_url ? (
          <Image
            source={{ uri: pick.crest_url }}
            style={{ width: 24, height: 24 }}
            resizeMode="contain"
            accessibilityLabel={pick.club_name}
          />
        ) : (
          // ⚠ `crest_url` is nullable in the feed. An abbreviation beats a blank,
          // which would read as a cell where nobody picked.
          <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 9, color: theme.colors.ink }}>
            {pick.club_name.slice(0, 3).toUpperCase()}
          </RNText>
        )}
      </View>
    </View>
  );
}
