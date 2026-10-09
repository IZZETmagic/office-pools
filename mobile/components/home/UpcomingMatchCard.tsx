import { Image, Platform, Pressable, Text as RNText, View } from 'react-native';

import { ClubBar, Text } from '@/components/ui';
import {
  clubColorFromCrestUrl,
  clubIdFromCrestUrl,
  fixturePalette,
} from '@/lib/design/clubColors';
import type { ResultsMatch } from '@/lib/useTournamentMatches';
import { hapticCardTap } from '@/lib/haptics';
import { fontFamilies, useTheme } from '@/theme';

type UpcomingMatchCardProps = {
  match: ResultsMatch;
  onPress?: () => void;
};

/**
 * ⚠ THE FIXTURE IS STACKED, NOT MIRRORED (Ryan, 2026-09-19).
 *
 * It used to be `crest·CODE  vs  crest·CODE` across the left of the card. Two
 * things were wrong with that once the crests came out
 * (drafts/2026-09-13_ip_exposure_audit.md §5): a three-letter code with no
 * badge beside it is the least legible thing the app could show a casual
 * member, and the mirrored layout spent its width on a "vs" that a stacked pair
 * states by position.
 *
 * Home above, away below, each with its colour bar on the left of its NAME. The
 * card reads top-to-bottom like a fixture list rather than left-to-right like a
 * scoreboard, which is what the right-hand column (date over venue) already did.
 */
export function UpcomingMatchCard({ match, onPress }: UpcomingMatchCardProps) {
  const theme = useTheme();
  const hasScore = match.homeScoreFt !== null && match.awayScoreFt !== null;

  // ⚠ THE AWAY SIDE CHANGES KIT, as it does on every surface that shows two
  // clubs at once. Stacked one above the other, two blues are if anything
  // worse than side by side — there is no gap between them to read across.
  //
  // ⚠ BOTH CLUBS KNOWN OR NEITHER IS COLOURED. `fixturePalette` returns the
  // app's own pair when either side is missing, which would take a known club's
  // colour away because its opponent is from outside the five leagues.
  const known =
    clubColorFromCrestUrl(match.homeTeam?.flagUrl) !== null &&
    clubColorFromCrestUrl(match.awayTeam?.flagUrl) !== null;
  const palette = fixturePalette(match.homeTeam?.flagUrl, match.awayTeam?.flagUrl, {
    home: theme.colors.primary,
    away: theme.colors.accent,
  });
  const colors = known && palette.usingClubColors ? palette : null;

  return (
    <Pressable
      onPress={() => {
        hapticCardTap();
        onPress?.();
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.lg,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.md + 2,
        borderRadius: theme.radii.md,
        backgroundColor: theme.colors.surface,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {/* ⚠ THE RIGHT-HAND COLUMN IS UNTOUCHED — Ryan, 2026-09-19. Its flex,
          its gap and the row's spacing are exactly what they were when the
          fixture was mirrored; only the left side changed. */}
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <TeamLine
          team={match.homeTeam}
          placeholder={match.homeTeamPlaceholder}
          score={hasScore ? match.homeScoreFt : null}
          colour={colors?.home}
        />
        <TeamLine
          team={match.awayTeam}
          placeholder={match.awayTeamPlaceholder}
          score={hasScore ? match.awayScoreFt : null}
          colour={colors?.away}
        />
      </View>

      <View style={{ flex: 1, alignItems: 'flex-end', gap: 2 }}>
        <Text
          style={{
            fontFamily: fontFamilies.semibold,
            fontSize: 13,
            color: theme.colors.ink,
          }}
        >
          {formatDate(match.matchDate)}
        </Text>
        {match.venue ? (
          <Text
            numberOfLines={1}
            style={{
              fontFamily: fontFamilies.medium,
              fontSize: 11,
              color: theme.colors.slate,
            }}
          >
            {match.venue}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * One club on its own line: colour bar, name, and its score if the match is done.
 *
 * ⚠ `shortName`, NOT `countryName`. The contract carries `shortClubName`'s
 * output — "Man United", "Nott'm Forest" — and the full name is the fallback.
 * On this card the difference is "Borussia Mönchengladbach" at 24 characters
 * against "M'gladbach", and the column is shared with a venue.
 */
function TeamLine({
  team,
  placeholder,
  score,
  colour,
}: {
  team: ResultsMatch['homeTeam'];
  placeholder: string | null;
  score: number | null;
  /** The fixture's verdict for this side — see `UpcomingMatchCard`. */
  colour?: string;
}) {
  const theme = useTheme();
  const name = team?.shortName?.trim() || team?.countryName?.trim() || placeholder || 'TBD';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <TeamMark url={team?.flagUrl} colour={colour} />
      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          fontFamily: fontFamilies.semibold,
          fontSize: 14,
          color: theme.colors.ink,
        }}
      >
        {name}
      </Text>
      {score !== null ? (
        <RNText
          style={{
            fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
            fontSize: 14,
            color: theme.colors.ink,
          }}
        >
          {score}
        </RNText>
      ) : null}
    </View>
  );
}

/**
 * ⚠ CLUB → BAR, FLAG → FLAG. `flagUrl` carries both, the same as it does on
 * `MatchResultRow` — and the branch is the same one: a club's URL ends in the
 * provider's numeric id, a national flag's does not. Flags are public domain
 * and still drawn; crests are not and are gone.
 */
function TeamMark({ url, colour }: { url: string | null | undefined; colour?: string }) {
  const isClub = url ? clubIdFromCrestUrl(url) !== null : false;

  if (isClub) return <ClubBar url={url} colour={colour} height={20} />;

  if (url) {
    // A national flag — 3:2, and the only mark still drawn here.
    return <Image source={{ uri: url }} style={{ width: 18, height: 12 }} resizeMode="contain" />;
  }

  // ⚠ THE SLOT SURVIVES AN UNKNOWN TEAM, so a placeholder fixture does not
  // shift its name left of every other row on the card.
  return <View style={{ width: 6, height: 20 }} />;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
  const monthDay = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const time = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${weekday}, ${monthDay} · ${time}`;
}
