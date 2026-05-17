import { LinearGradient } from 'expo-linear-gradient';
import { Image, Platform, Pressable, Text as RNText, View } from 'react-native';

import type { MatchSummary } from '@/lib/useHomeData';
import { useTheme, withOpacity } from '@/theme';

type LiveMatchCardProps = {
  match: MatchSummary;
  onPress?: () => void;
};

export function LiveMatchCard({ match, onPress }: LiveMatchCardProps) {
  const theme = useTheme();

  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
      <LinearGradient
        colors={['#0F0F1A', '#1A1830']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: theme.radii.lg,
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
          overflow: 'hidden',
        }}
      >
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 120,
            height: 120,
            borderRadius: 60,
            backgroundColor: withOpacity('#EF4444', 0.08),
            shadowColor: '#EF4444',
            shadowOpacity: 0.6,
            shadowRadius: 40,
            shadowOffset: { width: 0, height: 0 },
            top: -30,
            left: -100,
          }}
        />

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: theme.colors.red,
              }}
            />
            <RNText
              style={{
                fontFamily: 'Nunito_900Black',
                fontSize: 11,
                color: '#FFFFFF',
                letterSpacing: 1,
              }}
            >
              LIVE
            </RNText>
          </View>
          {match.stage ? (
            <RNText
              style={{
                fontFamily: 'Nunito_700Bold',
                fontSize: 11,
                color: 'rgba(255,255,255,0.5)',
                letterSpacing: 0.5,
                textTransform: 'uppercase',
              }}
            >
              {match.stage}
            </RNText>
          ) : null}
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <TeamColumn
            flag={match.homeTeam?.flagUrl ?? null}
            code={match.homeTeam?.countryCode ?? match.homeTeamPlaceholder ?? '?'}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <ScoreNumber value={match.homeScore} />
            <RNText
              style={{
                fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
                fontSize: 24,
                color: 'rgba(255,255,255,0.4)',
              }}
            >
              –
            </RNText>
            <ScoreNumber value={match.awayScore} />
          </View>
          <TeamColumn
            flag={match.awayTeam?.flagUrl ?? null}
            code={match.awayTeam?.countryCode ?? match.awayTeamPlaceholder ?? '?'}
          />
        </View>

        {match.venue ? (
          <RNText
            style={{
              fontFamily: 'Nunito_500Medium',
              fontSize: 11,
              color: 'rgba(255,255,255,0.35)',
              textAlign: 'center',
            }}
          >
            {match.venue}
          </RNText>
        ) : null}
      </LinearGradient>
    </Pressable>
  );
}

function TeamColumn({ flag, code }: { flag: string | null; code: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 4, width: 56 }}>
      {flag ? (
        <Image
          source={{ uri: flag }}
          style={{ width: 36, height: 26, borderRadius: 2 }}
          resizeMode="cover"
        />
      ) : (
        <View
          style={{
            width: 36,
            height: 26,
            borderRadius: 2,
            backgroundColor: 'rgba(255,255,255,0.1)',
          }}
        />
      )}
      <RNText
        style={{
          fontFamily: 'Nunito_700Bold',
          fontSize: 11,
          color: 'rgba(255,255,255,0.7)',
          letterSpacing: 0.5,
        }}
      >
        {code}
      </RNText>
    </View>
  );
}

function ScoreNumber({ value }: { value: number | null }) {
  return (
    <RNText
      style={{
        fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
        fontSize: 32,
        fontWeight: '900',
        color: '#FFFFFF',
        lineHeight: 36,
        minWidth: 24,
        textAlign: 'center',
      }}
    >
      {value ?? 0}
    </RNText>
  );
}
