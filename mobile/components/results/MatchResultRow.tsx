import { Image } from 'expo-image';
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

function homeDisplayName(match: ResultsMatch): string {
  return displayTeamName(match.homeTeam?.countryName ?? match.homeTeamPlaceholder ?? 'Home');
}

function awayDisplayName(match: ResultsMatch): string {
  return displayTeamName(match.awayTeam?.countryName ?? match.awayTeamPlaceholder ?? 'Away');
}

/**
 * THE TEAM MARK — a national flag OR a club crest, both arriving in `flagUrl`.
 *
 * ⚠ SQUARE, AND `contain`. This box used to be 3:2 with `contentFit="cover"`,
 * which is a flag's own aspect ratio: right for the World Cup, and wrong for
 * everything played since. `/api/users/:id/fixtures` maps a club's `crest_url`
 * into `flag_url` (the shaping that route exists for), and a crest is NOT 3:2 —
 * so a 26×17 box cropping to fill sliced the top and bottom off every Premier
 * League badge on the phone. Nothing errored; the badge just arrived beheaded.
 *
 * ⚠ AND DO NOT ASSUME THE CREST IS SQUARE EITHER. Most are (the feed serves
 * 150×150), but Liverpool's is 78×150 — PORTRAIT. Under the old box that one
 * lost about two thirds of its height: the wings clipped, the "L.F.C." gone.
 * Any fit that reasons from an assumed ratio has the same bug waiting in it,
 * which is why this is `contain` rather than a smarter crop.
 *
 * `contain` in a square box fits every mark without a branch: a square crest
 * fills it, a portrait one fits its height, and a 3:2 flag letterboxes inside
 * at exactly the width it drew before — so the World Cup surfaces are unchanged
 * if one is ever opened again. It is also the treatment the web already settled
 * on: `object-contain` on a square, `MatchweekResultsForm.tsx:260`.
 *
 * ⚠ The row grows by the difference (17 → 26 here). That is the fix, not a
 * side effect: a mark that is not 3:2 needs a box that is not 3:2, and cropping
 * it to keep the row short is the bug.
 */
function TeamMark({ url, size = 26 }: { url: string | null | undefined; size?: number }) {
  const theme = useTheme();
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

      {/* Home name — fixed width, right-aligned toward the score */}
      <RNText
        numberOfLines={1}
        style={{
          width: 84,
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

      {/* Away name — fixed width, left-aligned toward the score */}
      <TeamMark url={match.awayTeam?.flagUrl} />
      <RNText
        numberOfLines={1}
        style={{
          width: 84,
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
