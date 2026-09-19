import { Image } from 'expo-image';

import { clubColorFromCrestUrl, clubIdFromCrestUrl } from '@/lib/design/clubColors';
import { Platform, Pressable, Text as RNText, View } from 'react-native';

import { getLiveClock, getMatchStatusBadge } from '@/lib/matchStatus';
import { displayTeamName } from '@/lib/teamNames';
import type { ResultsMatch } from '@/lib/useTournamentMatches';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type Props = {
  match: ResultsMatch;
  onPress: () => void;
};

const MONO_BOLD = Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace';

function parsedDate(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The kickoff time split into its clock and its day period, so the row can
 * stack them:
 *
 *     4:00
 *      PM
 *
 * ⚠ SPLIT ON THE LAST RUN OF WHITESPACE, NOT `' '`. iOS 17 changed
 * `toLocaleTimeString` to separate the period with U+202F NARROW NO-BREAK
 * SPACE, so `.split(' ')` finds nothing on a current phone and the row quietly
 * stops stacking. `\s` does cover U+202F (it is Unicode Zs), and the class is
 * spelled out anyway so a reader does not have to know that to trust it.
 *
 * ⚠ `period` IS NULLABLE, AND THAT IS NOT AN EDGE CASE. A 24-hour locale
 * formats "16:00" with no period at all, and a few locales lead with it
 * ("下午4:00"). Both fall through to a single line rather than rendering an
 * empty second one. Nothing here assumes the device is on a 12-hour clock.
 */
function matchTimeParts(iso: string): { clock: string; period: string | null } {
  const d = parsedDate(iso);
  if (!d) return { clock: '--:--', period: null };
  const text = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const split = /^(.*\S)[\s\u202F\u00A0]+(\S+)$/.exec(text);
  if (!split) return { clock: text, period: null };
  return { clock: split[1], period: split[2] };
}

/**
 * The label for one side of the row, at the narrowest this screen ever renders
 * a team.
 *
 * ⚠ `shortName` FIRST. It is the league adapter's `shortClubName` output — the
 * web's own rules, measured against real club names rather than guessed — and
 * without it this row was handed "Manchester City" for a slot that fits about
 * fourteen characters and ellipsed away the half that distinguishes it from
 * United. `displayTeamName` stays as the fallback: it is the World Cup's
 * country map, and it is still the only thing that knows about "Bosnia and
 * Herzegovina".
 */
function sideName(
  team: ResultsMatch['homeTeam'],
  placeholder: string | null,
  fallback: string,
): string {
  if (team?.shortName) return team.shortName;
  return displayTeamName(team?.countryName ?? placeholder ?? fallback);
}

function homeDisplayName(match: ResultsMatch): string {
  return sideName(match.homeTeam, match.homeTeamPlaceholder, 'Home');
}

function awayDisplayName(match: ResultsMatch): string {
  return sideName(match.awayTeam, match.awayTeamPlaceholder, 'Away');
}

/**
 * THE TEAM MARK — a national flag, or a club's colour.
 *
 * ⚠ TWO KINDS OF THING ARRIVE IN `flagUrl`, AND ONLY ONE IS STILL DRAWN.
 * `/api/users/:id/fixtures` maps a club's `crest_url` into `flag_url` (the
 * shaping that route exists for), so this one field carries both a World Cup
 * flag and a Premier League badge.
 *
 * The badges came out on 2026-09-19 — they were the provider's artwork
 * (drafts/2026-09-13_ip_exposure_audit.md §5). The flags did not: a national
 * flag is public domain, ours came from flagcdn, and the World Cup surfaces
 * should be unchanged if one is ever opened again.
 *
 * ⚠ THE URL ITSELF TELLS THEM APART, and no extra field was needed for it.
 * `clubIdFromCrestUrl` matches the provider's numeric last segment
 * (`…/teams/42.png`); a flag is `…/gb.png`, which has no number, so it returns
 * null. Club → bar, flag → image, one branch.
 *
 * ⚠ THE BOX STAYS 26 SQUARE either way, because the row's alignment is built on
 * it — every mark on the same x down the list. The bar is 4×24 centred in that
 * box, the same bar the Pick'em control and the score row draw.
 */
function TeamMark({ url, size = 26 }: { url: string | null | undefined; size?: number }) {
  const theme = useTheme();
  const colour = clubColorFromCrestUrl(url);

  // A club: its colour, not its crest.
  if (colour) {
    return (
      <View style={{ width: size, alignItems: 'center' }}>
        <View style={{ width: 4, height: 24, borderRadius: 999, backgroundColor: colour }} />
      </View>
    );
  }

  // ⚠ A CLUB WE HAVE NO COLOUR FOR LANDS HERE TOO, not just a flag — and it
  // must not fall through to drawing the crest again. `clubIdFromCrestUrl`
  // returning an id is the test for "this is a club".
  if (url && clubIdFromCrestUrl(url) !== null) {
    return (
      <View style={{ width: size, alignItems: 'center' }}>
        <View
          style={{
            width: 4,
            height: 24,
            borderRadius: 999,
            backgroundColor: withOpacity(theme.colors.slate, 0.35),
          }}
        />
      </View>
    );
  }

  if (!url) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: 3,
          backgroundColor: theme.colors.mist,
        }}
      />
    );
  }

  // A national flag — public domain, and still drawn.
  return (
    <Image
      source={{ uri: url }}
      style={{ width: size, height: size }}
      contentFit="contain"
      cachePolicy="memory-disk"
    />
  );
}

/**
 * Kickoff time, clock over period. Two `Text`s rather than one with a `\n`
 * because they take different sizes, and an explicit `lineHeight` on each so
 * the pair stacks to 25px — still under the 26px team mark beside it, which is
 * what keeps the row exactly as tall as it was before the time wrapped.
 */
function KickoffTime({ iso }: { iso: string }) {
  const theme = useTheme();
  const { clock, period } = matchTimeParts(iso);
  return (
    <View style={{ alignItems: 'center' }}>
      <RNText
        style={{
          fontFamily: fontFamilies.medium,
          fontSize: 13,
          lineHeight: 15,
          color: theme.colors.slate,
          fontVariant: ['tabular-nums'],
        }}
      >
        {clock}
      </RNText>
      {period ? (
        <RNText
          style={{
            fontFamily: fontFamilies.medium,
            fontSize: 10,
            lineHeight: 10,
            letterSpacing: 0.4,
            color: theme.colors.slate,
          }}
        >
          {period}
        </RNText>
      ) : null}
    </View>
  );
}

export function MatchResultRow({ match, onPress }: Props) {
  const theme = useTheme();
  const isLive = match.status === 'live';
  const isFinished = match.status === 'completed';
  const badge = getMatchStatusBadge(match);
  const statusColor = badge ? (badge.tone === 'red' ? theme.colors.red : theme.colors.amber) : null;
  const liveClock = isLive ? getLiveClock(match) : null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        paddingHorizontal: 14,
        paddingVertical: 16,
        backgroundColor: pressed ? withOpacity(theme.colors.ink, 0.04) : 'transparent',
      })}
    >
      {/* Match status — absolutely positioned so it's fully separate from the
          teams/score row below and can never shift them off-centre. */}
      <View
        style={{
          position: 'absolute',
          left: 14,
          top: 0,
          bottom: 0,
          justifyContent: 'center',
        }}
      >
        {isLive ? (
          liveClock ? (
            <RNText
              style={{
                fontFamily: MONO_BOLD,
                fontSize: 12,
                color: theme.colors.red,
                fontVariant: ['tabular-nums'],
              }}
            >
              {liveClock}
            </RNText>
          ) : (
            <View
              style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.red }}
            />
          )
        ) : isFinished ? (
          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 11,
              color: theme.colors.slate,
              letterSpacing: 0.3,
            }}
          >
            FT
          </RNText>
        ) : null}
      </View>

      {/* Home name — takes its share of whatever the screen has, right-aligned
          toward the score.

          ⚠ `flex: 1` ON BOTH SIDES, not a fixed width. It used to be 84px on
          every phone, which spent 24pt of a 390pt screen on nothing and clipped
          names that would have fit. Equal flex is what keeps the score centred
          — the property the old fixed width was there to guarantee — so this
          keeps that guarantee and stops leaving the slack unused.

          ⚠ `minWidth: 0` is load-bearing. A flex child's default minimum is its
          content, so without it a long name refuses to shrink, pushes the row
          wide and truncates the OPPOSITE side instead. */}
      <RNText
        numberOfLines={1}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: 'right',
          fontFamily: fontFamilies.medium,
          fontSize: 14,
          color: theme.colors.ink,
        }}
      >
        {homeDisplayName(match)}
      </RNText>
      <TeamMark url={match.homeTeam?.flagUrl} />

      {/* Center: score / time / status badge */}
      <View style={{ width: 58, alignItems: 'center' }}>
        {badge?.hidesCountdown ? (
          <RNText
            numberOfLines={1}
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 9,
              letterSpacing: 0.3,
              textTransform: 'uppercase',
              color: statusColor ?? theme.colors.slate,
            }}
          >
            {badge.label}
          </RNText>
        ) : isLive ? (
          <View style={{ flexDirection: 'row', gap: 3 }}>
            <RNText
              style={{
                fontFamily: MONO_BOLD,
                fontSize: 15,
                color: theme.colors.ink,
                fontVariant: ['tabular-nums'],
              }}
            >
              {match.homeScoreFt ?? 0}
            </RNText>
            <RNText
              style={{
                fontFamily: MONO_BOLD,
                fontSize: 15,
                color: theme.colors.slate,
              }}
            >
              -
            </RNText>
            <RNText
              style={{
                fontFamily: MONO_BOLD,
                fontSize: 15,
                color: theme.colors.ink,
                fontVariant: ['tabular-nums'],
              }}
            >
              {match.awayScoreFt ?? 0}
            </RNText>
          </View>
        ) : isFinished ? (
          <View style={{ alignItems: 'center', gap: 2 }}>
            <View style={{ flexDirection: 'row', gap: 3 }}>
              <RNText
                style={{
                  fontFamily: MONO_BOLD,
                  fontSize: 15,
                  color: theme.colors.ink,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {match.homeScoreFt ?? 0}
              </RNText>
              <RNText
                style={{
                  fontFamily: MONO_BOLD,
                  fontSize: 15,
                  color: theme.colors.slate,
                }}
              >
                -
              </RNText>
              <RNText
                style={{
                  fontFamily: MONO_BOLD,
                  fontSize: 15,
                  color: theme.colors.ink,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {match.awayScoreFt ?? 0}
              </RNText>
            </View>
            {match.homeScorePso !== null && match.awayScorePso !== null ? (
              <RNText
                style={{
                  fontFamily: fontFamilies.medium,
                  fontSize: 9,
                  color: theme.colors.primary,
                }}
              >
                ({match.homeScorePso}-{match.awayScorePso} PSO)
              </RNText>
            ) : null}
          </View>
        ) : badge ? (
          <View style={{ alignItems: 'center', gap: 2 }}>
            <RNText
              numberOfLines={1}
              style={{
                fontFamily: fontFamilies.bold,
                fontSize: 9,
                letterSpacing: 0.3,
                textTransform: 'uppercase',
                color: statusColor ?? theme.colors.slate,
              }}
            >
              {badge.label}
            </RNText>
            <KickoffTime iso={match.matchDate} />
          </View>
        ) : (
          <KickoffTime iso={match.matchDate} />
        )}
      </View>

      {/* Away name — the mirror of the home side above; see its note on why
          this is `flex: 1` and not a fixed width. */}
      <TeamMark url={match.awayTeam?.flagUrl} />
      <RNText
        numberOfLines={1}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: 'left',
          fontFamily: fontFamilies.medium,
          fontSize: 14,
          color: theme.colors.ink,
        }}
      >
        {awayDisplayName(match)}
      </RNText>
    </Pressable>
  );
}
