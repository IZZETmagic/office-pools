import { Image } from 'expo-image';
import { Platform, Pressable, Text as RNText, View } from 'react-native';

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
  return match.homeTeam?.countryName ?? match.homeTeamPlaceholder ?? 'Home';
}

function awayDisplayName(match: ResultsMatch): string {
  return match.awayTeam?.countryName ?? match.awayTeamPlaceholder ?? 'Away';
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

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: pressed ? withOpacity(theme.colors.ink, 0.04) : 'transparent',
      })}
    >
      {/* Home: name then flag, right-aligned */}
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 8,
        }}
      >
        <RNText
          numberOfLines={1}
          style={{
            fontFamily: fontFamilies.medium,
            fontSize: 14,
            color: theme.colors.ink,
            flexShrink: 1,
            textAlign: 'right',
          }}
        >
          {homeDisplayName(match)}
        </RNText>
        <FlagView url={match.homeTeam?.flagUrl} />
      </View>

      {/* Center: time / score / LIVE */}
      <View style={{ width: 74, alignItems: 'center' }}>
        {isLive ? (
          <View style={{ alignItems: 'center', gap: 3 }}>
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 2.5,
                  backgroundColor: theme.colors.red,
                }}
              />
              <RNText
                style={{
                  fontFamily: fontFamilies.bold,
                  fontSize: 9,
                  color: theme.colors.red,
                  letterSpacing: 0.3,
                }}
              >
                LIVE
              </RNText>
            </View>
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

      {/* Away: flag then name, left-aligned */}
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <FlagView url={match.awayTeam?.flagUrl} />
        <RNText
          numberOfLines={1}
          style={{
            fontFamily: fontFamilies.medium,
            fontSize: 14,
            color: theme.colors.ink,
            flexShrink: 1,
          }}
        >
          {awayDisplayName(match)}
        </RNText>
      </View>
    </Pressable>
  );
}
