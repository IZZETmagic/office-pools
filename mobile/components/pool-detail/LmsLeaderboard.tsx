import { Image, Platform, Text as RNText, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import type { LeagueLeaderboardEntry, LeagueLeaderboardMeta } from '@/lib/api';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// LAST MAN STANDING — who is left, and who has taken a round
// =============================================================
// This mode has no points. `total_points` is 0 for every entry in it and always
// will be, so a leaderboard with a score column would be a column of zeros: the
// exact shape of wrongness the Table-mode pass existed to remove. What people
// actually come here to read is whether they are still in.
//
// ## Two truths at once, and the season leads
//
// Ryan, 2026-09-03. A round is a few matchweeks; a season is a run of rounds.
// The season score is `rounds_won` and the round's question is binary. So the
// list is ordered rounds won first — done server-side in `compareLms` — and each
// row states its own round position. A two-time winner sitting top in a week
// they are out is correct, and the `OUT · MW6` chip is what stops it reading as
// a claim to still be alive.
//
// ⚠ In round one every `rounds_won` is 0, so the order collapses to pure
// survival: standing above out, and the out ordered by who lasted longer. That
// is the common case, and it is meant to look like the simple thing.
//
// ## No rank numbers
//
// Survival is binary — three survivors are equally alive, and numbering them
// #1/#2/#3 would invent a hierarchy the football has not produced and tell
// somebody they are last of the survivors when they are not. The eliminated do
// not get numbers either: the matchweek they went out in is the number that
// means something, and it is already on the row.
//
// ## The trophy is the whole memory of a round
//
// `league_lms_settle` opens the next round in the same transaction that closes
// one (087:266), so the instant a round is won everybody is back in and the
// survival column resets. Nothing else on this screen records that the round
// happened. That is why `rounds_won` is on the row and not tucked into a
// season summary somewhere.
//
// ## Nothing here decides anything
//
// Survival, elimination and round winners are all `league_lms_settle`'s. The
// ordering is the route's. This renders the record.
// =============================================================

type Props = {
  entries: LeagueLeaderboardEntry[];
  league: LeagueLeaderboardMeta;
  currentUserId: string | null;
};

export function LmsLeaderboard({ entries, league, currentUserId }: Props) {
  const theme = useTheme();
  const round = league.lms;

  if (entries.length === 0) {
    return (
      <View style={{ paddingVertical: theme.spacing.hero, paddingHorizontal: theme.spacing.xl, gap: theme.spacing.md }}>
        <Text variant="sectionHeader" align="center">
          No Entries Yet
        </Text>
        <Text variant="body" color="slate" align="center">
          The leaderboard fills up once people join and start picking.
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
      <RoundStrip round={round} />

      {entries.map((entry) => (
        <SurvivorRow
          key={entry.entry_id}
          entry={entry}
          isCurrentUser={entry.user_id === currentUserId}
        />
      ))}
    </View>
  );
}

/**
 * The round, and how many are left in it.
 *
 * ⚠ "of N" is the number IN THE ROUND, not the pool's membership. Someone who
 * joined after the round opened is not in it — counting them would make the
 * pool look like it had lost more people than it has.
 */
function RoundStrip({ round }: { round: LeagueLeaderboardMeta['lms'] }) {
  const theme = useTheme();

  if (!round) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: theme.spacing.xs }}>
        <Text variant="caption" color="slate" style={{ textTransform: 'none', letterSpacing: 0 }}>
          No round has opened yet
        </Text>
      </View>
    );
  }

  const isOver = round.last_matchweek !== null;

  return (
    <View
      style={{
        alignItems: 'center',
        gap: 2,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radii.md,
        backgroundColor: withOpacity(theme.colors.primary, 0.07),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name={isOver ? 'checkmark.seal.fill' : 'flame.fill'} color={isOver ? 'green' : 'primary'} size={12} />
        <Text variant="caption" color="ink" style={{ textTransform: 'none', letterSpacing: 0 }}>
          {isOver
            ? `Round ${round.round_number} is over`
            : `Round ${round.round_number} · ${round.standing} still standing of ${round.in_round}`}
        </Text>
      </View>
      <PickWeekNote round={round} />
    </View>
  );
}

/**
 * Which matchweek the crests on the rows belong to.
 *
 * ⚠ Without this the badges are ambiguous, and dangerously so. From Friday to
 * Monday the week being PLAYED and the week you can still PICK for are
 * different weeks — a crest with no caption reads as "the club playing for them
 * right now" whichever one it actually is. The row shows one club; this says
 * which question it answers.
 */
function PickWeekNote({ round }: { round: NonNullable<LeagueLeaderboardMeta['lms']> }) {
  if (round.pick_matchweek === null || round.last_matchweek !== null) return null;

  return (
    <Text variant="detail" color="slate" align="center" style={{ textTransform: 'none' }}>
      {round.pick_in_play
        ? `Backing these clubs in MW${round.pick_matchweek}, in play now`
        : `Backing these clubs in MW${round.pick_matchweek} — hidden until it locks`}
    </Text>
  );
}

function SurvivorRow({
  entry,
  isCurrentUser,
}: {
  entry: LeagueLeaderboardEntry;
  isCurrentUser: boolean;
}) {
  const theme = useTheme();
  const name = entry.entry_name?.trim() ? entry.entry_name : entry.full_name;
  const lms = entry.lms;
  const isStanding = !!lms?.in_round && lms.eliminated_matchweek === null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.md + 2,
        borderRadius: theme.radii.lg,
        // Matches LeaderboardRow and LeagueTableLeaderboard's current-user
        // treatment exactly, including the pre-blended Android hexes — see the
        // note there for why alpha over elevation reads as a double ring.
        backgroundColor: isCurrentUser
          ? Platform.OS === 'android'
            ? '#E2E6FA'
            : withOpacity(theme.colors.primary, 0.08)
          : theme.colors.surface,
        borderWidth: isCurrentUser ? (Platform.OS === 'android' ? 2 : theme.borders.accent) : 0,
        borderColor: isCurrentUser
          ? Platform.OS === 'android'
            ? '#B1BDF1'
            : withOpacity(theme.colors.primary, 0.25)
          : 'transparent',
        // Eliminated rows recede rather than disappear. They are still part of
        // the pool and still worth reading — the round happened to them too.
        opacity: isStanding ? 1 : 0.72,
        ...theme.shadows.card,
      }}
    >
      <StateDot lms={lms} />

      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="cardTitle" numberOfLines={1} style={{ flexShrink: 1 }}>
            {name}
          </Text>
          {isCurrentUser ? (
            <View
              style={{
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: theme.radii.pill,
                backgroundColor: withOpacity(theme.colors.primary, 0.15),
              }}
            >
              <RNText
                style={{
                  fontFamily: fontFamilies.bold,
                  fontSize: 9,
                  color: theme.colors.primary,
                  letterSpacing: 0.5,
                }}
              >
                YOU
              </RNText>
            </View>
          ) : null}
        </View>
        <Text variant="detail" color="slate" numberOfLines={1}>
          @{entry.username}
        </Text>
      </View>

      <RoundsWon count={lms?.rounds_won ?? 0} />
      <StateChip lms={lms} isCurrentUser={isCurrentUser} />
    </View>
  );
}

/** A colour before any words — the row's state readable at a glance down the list. */
function StateDot({ lms }: { lms: LeagueLeaderboardEntry['lms'] }) {
  const theme = useTheme();
  const color = !lms?.in_round
    ? theme.colors.slate
    : lms.eliminated_matchweek === null
      ? theme.colors.green
      : theme.colors.red;

  return (
    <View
      style={{
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: color,
      }}
    />
  );
}

/**
 * Rounds taken this season.
 *
 * ⚠ Rendered only when there is at least one. A "0×" beside every name in round
 * one would be a column of zeros with extra steps, and it is the thing this
 * screen exists to avoid.
 */
function RoundsWon({ count }: { count: number }) {
  const theme = useTheme();
  if (count < 1) return null;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <Icon name="trophy.fill" color="accent" size={13} />
      {count > 1 ? (
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 11,
            color: theme.colors.accent,
          }}
        >
          ×{count}
        </RNText>
      ) : null}
    </View>
  );
}

/**
 * What the row says about this round.
 *
 * ⚠ THREE STATES, NOT TWO. "Joined late" is NOT an elimination. Somebody who
 * came in after the round opened enters the next one — everybody already in it
 * has spent clubs, and a newcomer with a full twenty would have an advantage
 * nobody else had. Painting them the same red as the eliminated would accuse
 * them of losing a round they were never allowed to play.
 *
 * ⚠ THE ELIMINATED KEEP THEIR MATCHWEEK. Ryan, 3 Sep: knowing WHEN somebody
 * went out is the useful half — a name with no week is just a loser, a name with
 * MW2 is a story. It stays where "STILL IN" used to be for survivors.
 *
 * A survivor shows the club they are backing instead, which is the same
 * information told forwards: still in, and here is what is carrying you.
 */
function StateChip({ lms, isCurrentUser }: { lms: LeagueLeaderboardEntry['lms']; isCurrentUser: boolean }) {
  const theme = useTheme();
  if (!lms) return null;

  if (!lms.in_round) return <Chip label="NEXT ROUND" color={theme.colors.slate} />;
  if (lms.eliminated_matchweek !== null) {
    return <Chip label={`OUT · MW${lms.eliminated_matchweek}`} color={theme.colors.red} />;
  }

  // Still in — the club is the chip.
  if (lms.pick) return <ClubChip club={lms.pick} />;

  // ⚠ Sealed is not "no pick". Their matchweek has not locked, so their club is
  // hidden from everybody but them (086 — otherwise the pool copies the best
  // player). The padlock says which of the two this is; a blank would let it be
  // read as a member who has not bothered.
  if (lms.pick_sealed) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: theme.radii.pill,
          backgroundColor: withOpacity(theme.colors.slate, 0.12),
        }}
      >
        <Icon name="lock.fill" color="slate" size={9} />
        <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 9, color: theme.colors.slate, letterSpacing: 0.5 }}>
          HIDDEN
        </RNText>
      </View>
    );
  }

  // Nothing picked, and nothing hiding it. On your own row that is a real nudge;
  // on somebody else's it is a fact the whole pool can already see.
  return <Chip label="NO PICK" color={isCurrentUser ? theme.colors.red : theme.colors.slate} />;
}

/**
 * The club carrying them this matchweek — the crest alone.
 *
 * Ryan, 3 Sep: no pill and no name. The green pill was saying "still in" a
 * second time; the dot at the head of the row already does that, and a badge
 * carries its own club faster than a name does to anyone who follows football.
 *
 * ⚠ `crest_url` is NULLABLE in the feed, so the name is the fallback and never
 * the other way round. Without it a club with no badge is a blank cell, which
 * reads as a member who has not picked — the one thing this chip must never be
 * confused with.
 */
function ClubChip({ club }: { club: { club_name: string; crest_url: string | null } }) {
  const theme = useTheme();

  if (!club.crest_url) {
    return (
      <RNText
        numberOfLines={1}
        style={{ fontFamily: fontFamilies.bold, fontSize: 10, color: theme.colors.ink, maxWidth: 92 }}
      >
        {club.club_name}
      </RNText>
    );
  }

  return (
    <Image
      source={{ uri: club.crest_url }}
      // 34 is the ceiling that keeps rows the height they are: the name and
      // handle beside it stack to 36 (cardTitle 20 + gap 3 + detail 13), and a
      // crest taller than that starts driving the row instead of sitting in it.
      style={{ width: 34, height: 34 }}
      resizeMode="contain"
      // The badge IS the label once the name is gone, so it has to be one to
      // anything that cannot see it.
      accessibilityLabel={club.club_name}
    />
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: theme.radii.pill,
        backgroundColor: withOpacity(color, 0.14),
      }}
    >
      <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 9, color, letterSpacing: 0.5 }}>
        {label}
      </RNText>
    </View>
  );
}
