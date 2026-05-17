import { Image, Platform, Pressable, Text as RNText, View } from 'react-native';

import { Text } from '@/components/ui';
import type { MatchSummary } from '@/lib/useHomeData';
import { fontFamilies, useTheme } from '@/theme';

type UpcomingMatchCardProps = {
  match: MatchSummary;
  onPress?: () => void;
};

export function UpcomingMatchCard({ match, onPress }: UpcomingMatchCardProps) {
  const theme = useTheme();
  const hasScore = match.homeScore !== null && match.awayScore !== null;

  return (
    <Pressable
      onPress={onPress}
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
      <TeamSlot team={match.homeTeam} placeholder={match.homeTeamPlaceholder} />

      <View style={{ width: 48, alignItems: 'center' }}>
        {hasScore ? (
          <RNText
            style={{
              fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
              fontSize: 20,
              color: theme.colors.ink,
            }}
          >
            {match.homeScore} - {match.awayScore}
          </RNText>
        ) : (
          <Text variant="body" color="slate">
            vs
          </Text>
        )}
      </View>

      <TeamSlot team={match.awayTeam} placeholder={match.awayTeamPlaceholder} />

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

function TeamSlot({
  team,
  placeholder,
}: {
  team: MatchSummary['homeTeam'];
  placeholder: string | null;
}) {
  const theme = useTheme();
  return (
    <View style={{ width: 48, alignItems: 'center', gap: 4 }}>
      {team?.flagUrl ? (
        <Image
          source={{ uri: team.flagUrl }}
          style={{ width: 32, height: 22, borderRadius: 3 }}
          resizeMode="cover"
        />
      ) : (
        <View
          style={{
            width: 32,
            height: 22,
            borderRadius: 3,
            backgroundColor: theme.colors.mist,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <RNText
            style={{
              fontFamily: 'Nunito_700Bold',
              fontSize: 9,
              color: theme.colors.slate,
            }}
          >
            {(team?.countryCode ?? placeholder ?? '??').slice(0, 2).toUpperCase()}
          </RNText>
        </View>
      )}
      <Text variant="caption" color="ink">
        {team?.countryCode ?? placeholder ?? 'TBD'}
      </Text>
    </View>
  );
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
