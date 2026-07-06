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

function matchTime(iso: string): string {
  const d = parsedDate(iso);
  if (!d) return '--:--';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function homeDisplayName(match: ResultsMatch): string {
  return displayTeamName(match.homeTeam?.countryName ?? match.homeTeamPlaceholder ?? 'Home');
}

function awayDisplayName(match: ResultsMatch): string {
  return displayTeamName(match.awayTeam?.countryName ?? match.awayTeamPlaceholder ?? 'Away');
}

function FlagView({ url, size = 26 }: { url: string | null | undefined; size?: number }) {
  const theme = useTheme();
  const width = size;
  const height = Math.round(size * 0.67);
  if (!url) {
    return (
      <View
        style={{
          width,
          height,
          borderRadius: 3,
          backgroundColor: theme.colors.mist,
        }}
      />
    );
  }
  return (
    <Image
      source={{ uri: url }}
      style={{ width, height, borderRadius: 3 }}
      contentFit="cover"
      cachePolicy="memory-disk"
    />
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
      <FlagView url={match.homeTeam?.flagUrl} />

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
            <RNText
              style={{
                fontFamily: fontFamilies.medium,
                fontSize: 12,
                color: theme.colors.slate,
              }}
            >
              {matchTime(match.matchDate)}
            </RNText>
          </View>
        ) : (
          <RNText
            style={{
              fontFamily: fontFamilies.medium,
              fontSize: 12,
              color: theme.colors.slate,
            }}
          >
            {matchTime(match.matchDate)}
          </RNText>
        )}
      </View>

      {/* Away name — fixed width, left-aligned toward the score */}
      <FlagView url={match.awayTeam?.flagUrl} />
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
