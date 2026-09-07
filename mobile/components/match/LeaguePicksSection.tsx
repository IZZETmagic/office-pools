import { Image } from 'expo-image';
import { Text as RNText, View } from 'react-native';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { Text } from '@/components/ui';
import type { FixturePick, TablePick } from '@/lib/api';
import { pickLabel, tierLabel } from '@/lib/leaguePickLabel';
import { ordinal } from '@/lib/ordinal';
import type { LeagueSeasonTable } from '@/lib/useTournamentMatches';
import type { ResultsMatch } from '@/lib/useTournamentMatches';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// Your picks on a league fixture
// =============================================================
// This tab told every league member "Your picks are on the web" — honest about
// the app, and wrong about them. A stated v1 boundary held that league picks
// needed one `/api/pools/:id/league` call per pool per tap.
//
// ⚠ THAT WAS TWO BOUNDARIES AND ONLY ONE HELD. `league_predictions` carries its
// own `auth.uid()` policy, so the PICK was always one query away.
// `league_match_scores` is deny-all, so the POINTS genuinely needed a server —
// which is what `/api/users/:id/fixture-picks` is, one call for the whole
// fixture across every pool.
//
// ⚠⚠ THERE ARE TWO PICK SHAPES AND THE MODE STRING DOES NOT TELL YOU WHICH.
// A pool scoring exact scores stores a scoreline; a pool scoring outcomes
// stores 'home' | 'draw' | 'away' and NO scoreline at all. Both report
// `prediction_mode: 'league_pickem'`. Measured on production 2026-09-07, 70 of
// one member's 90 picks were the outcome shape — so a renderer that assumes a
// scoreline prints a dash for the majority of them. `pickLabel` below is the
// only place that decides, and it must stay the only place.
//
// ⚠ OTHER MEMBERS' PICKS ARE NOT HERE, and that is correctness rather than
// cost. League picks reveal per matchweek on `lock_at` and a Showdown duel is
// sealed until its reveal; a crowd breakdown would have to re-implement both
// gates, and getting it wrong leaks a rival's pick before kickoff.
// =============================================================

export function LeaguePicksSection({
  match,
  picks,
  tablePicks,
  table,
}: {
  match: ResultsMatch;
  picks: FixturePick[];
  tablePicks: TablePick[];
  /**
   * The live league table, for the "and they are Nth now" half.
   *
   * ⚠ ALREADY IN MEMORY — it rides the same `/api/users/:id/fixtures` payload
   * the Results tab pays for, so the comparison costs nothing. Null before a
   * season has a table.
   */
  table: LeagueSeasonTable | null;
}) {
  const theme = useTheme();
  const nothingAtAll = picks.length === 0 && tablePicks.length === 0;

  return (
    <View style={{ gap: 12 }}>
      <RNText
        style={{
          marginHorizontal: 20,
          fontFamily: fontFamilies.bold,
          fontSize: 16,
          color: theme.colors.ink,
        }}
      >
        Your Predictions
      </RNText>

      {nothingAtAll ? (
        <View
          style={{
            marginHorizontal: 20,
            paddingVertical: 28,
            paddingHorizontal: 20,
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radii.lg,
            alignItems: 'center',
            gap: 8,
            ...theme.shadows.card,
          }}
        >
          {/* ⚠ NOW THIS EMPTY STATE IS TRUE. It used to stand in for "the phone
              cannot read league picks"; it now means what it says — this member
              made no pick on this fixture. */}
          <Text variant="cardTitle" align="center">No pick on this match</Text>
          <Text variant="body" color="slate" align="center">
            {match.roundNumber !== null
              ? `You didn't predict this one in any of your pools.`
              : 'Join a pool and make your prediction for this match'}
          </Text>
        </View>
      ) : (
        <>
          {picks.map((pick) => <PickRow key={pick.entryId} match={match} pick={pick} />)}
          {/* ⚠ AFTER the per-fixture picks, because a table pool's answer is
              about the season rather than this game — it is context, not a
              prediction on the match in front of you. */}
          {tablePicks.map((tp) => (
            <TablePickCard key={tp.entryId} match={match} pick={tp} table={table} />
          ))}
        </>
      )}
    </View>
  );
}

/**
 * Where a table-mode entry placed these two clubs, against where they stand.
 *
 * ⚠ IT STATES NO SCORE, AND THAT IS DECISION 11. A league table is a FULL-TIME
 * table: a table pool settles once, at the end of the season. Printing "4 off"
 * beside a game in September would read as a running tally of something that
 * is not being tallied yet — so the card shows the two numbers and lets the
 * member draw the comparison.
 */
function TablePickCard({
  match,
  pick,
  table,
}: {
  match: ResultsMatch;
  pick: TablePick;
  table: LeagueSeasonTable | null;
}) {
  const theme = useTheme();
  const rankOf = (clubId: string | null) =>
    clubId ? table?.standings.find((r) => r.club_id === clubId)?.rank ?? null : null;

  return (
    <View
      style={{
        marginHorizontal: 20,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        ...theme.shadows.card,
        overflow: 'hidden',
      }}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
        <RNText
          numberOfLines={1}
          style={{ fontFamily: fontFamilies.bold, fontSize: 14, color: theme.colors.ink }}
        >
          {pick.poolName}
        </RNText>
        <Text variant="detail" color="slate" numberOfLines={1}>
          {pick.entryName} · where you had them finishing
        </Text>
      </View>

      <ClubPositionRow
        team={match.homeTeam}
        picked={pick.homePosition}
        now={rankOf(match.homeTeamId)}
      />
      <ClubPositionRow
        team={match.awayTeam}
        picked={pick.awayPosition}
        now={rankOf(match.awayTeamId)}
      />
      <View style={{ height: 6 }} />
    </View>
  );
}

function ClubPositionRow({
  team,
  picked,
  now,
}: {
  team: ResultsMatch['homeTeam'];
  picked: number | null;
  now: number | null;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 10,
      }}
    >
      {/* ⚠ A crest is not a flag — square box, `contain`. */}
      {team?.flagUrl ? (
        <Image
          source={{ uri: team.flagUrl }}
          style={{ width: 20, height: 20 }}
          contentFit="contain"
          cachePolicy="memory-disk"
        />
      ) : (
        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.mist }} />
      )}
      <RNText
        numberOfLines={1}
        style={{ flex: 1, fontFamily: fontFamilies.semibold, fontSize: 13, color: theme.colors.ink }}
      >
        {team?.shortName ?? team?.countryName ?? 'TBD'}
      </RNText>

      <View style={{ alignItems: 'flex-end' }}>
        <RNText
          style={{
            fontFamily: MONO_BOLD,
            fontSize: 14,
            color: theme.colors.ink,
            fontVariant: ['tabular-nums'],
          }}
        >
          {/* ⚠ A club the filed table omits reads "—", not 0th. */}
          {picked === null ? '—' : ordinal(picked)}
        </RNText>
        {now !== null ? (
          <Text variant="detail" color="slate">{`now ${ordinal(now)}`}</Text>
        ) : null}
      </View>
    </View>
  );
}

function PickRow({ match, pick }: { match: ResultsMatch; pick: FixturePick }) {
  const theme = useTheme();
  const tier = tierColour(pick.scoreType, theme);

  return (
    <View
      style={{
        marginHorizontal: 20,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        ...theme.shadows.card,
        overflow: 'hidden',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        // The tier as a stripe rather than a full tint, so a row of misses does
        // not read as an error state.
        borderLeftWidth: 3,
        borderLeftColor: tier ?? 'transparent',
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <RNText
          numberOfLines={1}
          style={{ fontFamily: fontFamilies.bold, fontSize: 14, color: theme.colors.ink }}
        >
          {pick.poolName}
        </RNText>
        <Text variant="detail" color="slate" numberOfLines={1}>{pick.entryName}</Text>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 3 }}>
        <RNText
          style={{
            fontFamily: MONO_BOLD,
            fontSize: 15,
            color: theme.colors.ink,
            fontVariant: ['tabular-nums'],
          }}
        >
          {pickLabel(pick, match)}
        </RNText>
        {pick.points !== null ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: theme.radii.pill,
              backgroundColor: withOpacity(tier ?? theme.colors.slate, 0.12),
            }}
          >
            <RNText
              style={{ fontFamily: fontFamilies.bold, fontSize: 10, color: tier ?? theme.colors.slate }}
            >
              {tierLabel(pick.scoreType)}
            </RNText>
            <RNText
              style={{
                fontFamily: MONO_BOLD,
                fontSize: 10,
                color: tier ?? theme.colors.slate,
                fontVariant: ['tabular-nums'],
              }}
            >
              {pick.points}
            </RNText>
          </View>
        ) : (
          /* ⚠ NOT SCORED IS NOT ZERO. Printing "0" here would tell a member
             their correct pick earned nothing, on a game not yet settled. */
          <Text variant="detail" color="slate">Not scored yet</Text>
        )}
      </View>
    </View>
  );
}

/**
 * ⚠ THE SAME FOUR TOKENS THE REST OF THE APP ALREADY USES for these tiers —
 * `tierExact`, `tierWinnerGd`, `tierWinner`, `tierMiss` — so a pick shaded
 * "exact" here is the colour it is everywhere else.
 */
function tierColour(scoreType: string | null, theme: ReturnType<typeof useTheme>): string | null {
  switch (scoreType) {
    case 'exact': return theme.colors.tierExact;
    case 'winner_gd': return theme.colors.tierWinnerGd;
    case 'winner': return theme.colors.tierWinner;
    case 'miss': return theme.colors.tierMiss;
    default: return null;
  }
}
