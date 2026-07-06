import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Image, Platform, Pressable, Text as RNText, View } from 'react-native';

import { MatchStatusBadge } from '@/components/MatchStatusBadge';
import { getMatchStatusBadge } from '@/lib/matchStatus';
import { formatStageLabel } from '@/lib/stage';
import type { MatchSummary } from '@/lib/useHomeData';
import { useTheme, withOpacity } from '@/theme';

type NextKickoffCardProps = {
  match: MatchSummary;
  matchesToday: number;
  onPress?: () => void;
};

export function NextKickoffCard({ match, matchesToday, onPress }: NextKickoffCardProps) {
  const theme = useTheme();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const kickoff = new Date(match.matchDate).getTime();
  const diffMs = Math.max(0, kickoff - now);
  const under24h = diffMs < 24 * 60 * 60 * 1000;

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
  const seconds = Math.floor((diffMs / 1000) % 60);

  const friendlyDate = new Date(match.matchDate).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const badge = getMatchStatusBadge(match);

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
            width: 140,
            height: 140,
            borderRadius: 70,
            backgroundColor: withOpacity(theme.colors.primary, 0.06),
            shadowColor: theme.colors.primary,
            shadowOpacity: 0.5,
            shadowRadius: 45,
            shadowOffset: { width: 0, height: 0 },
            top: -20,
            right: -60,
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 100,
            height: 100,
            borderRadius: 50,
            backgroundColor: withOpacity(theme.colors.accent, 0.05),
            shadowColor: theme.colors.accent,
            shadowOpacity: 0.4,
            shadowRadius: 40,
            shadowOffset: { width: 0, height: 0 },
            bottom: -30,
            left: -50,
          }}
        />

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <RNText
            style={{
              fontFamily: 'Nunito_900Black',
              fontSize: 11,
              color: 'rgba(255,255,255,0.5)',
              letterSpacing: 1.5,
              textTransform: 'uppercase',
            }}
          >
            Next Kickoff
          </RNText>
          {match.stage ? (
            <RNText
              style={{
                fontFamily: 'Nunito_700Bold',
                fontSize: 11,
                color: 'rgba(255,255,255,0.4)',
                letterSpacing: 0.5,
                textTransform: 'uppercase',
              }}
            >
              {formatStageLabel(match.stage)}
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

          <View style={{ alignItems: 'center', gap: 4 }}>
            {badge?.hidesCountdown ? (
              <MatchStatusBadge match={match} />
            ) : (
              <>
                {badge ? <MatchStatusBadge match={match} style={{ marginBottom: 2 }} /> : null}
                <Countdown
                  parts={
                    under24h
                      ? [
                          { value: hours, label: 'H' },
                          { value: minutes, label: 'M' },
                          { value: seconds, label: 'S' },
                        ]
                      : [
                          { value: days, label: 'D' },
                          { value: hours, label: 'H' },
                        ]
                  }
                />
              </>
            )}
            <RNText
              style={{
                fontFamily: 'Nunito_500Medium',
                fontSize: 10,
                color: 'rgba(255,255,255,0.4)',
              }}
            >
              {friendlyDate}
            </RNText>
          </View>

          <TeamColumn
            flag={match.awayTeam?.flagUrl ?? null}
            code={match.awayTeam?.countryCode ?? match.awayTeamPlaceholder ?? '?'}
          />
        </View>

        {under24h && matchesToday > 1 ? (
          <RNText
            style={{
              fontFamily: 'Nunito_600SemiBold',
              fontSize: 11,
              color: withOpacity(theme.colors.accent, 0.8),
              textAlign: 'center',
            }}
          >
            {matchesToday - 1} more match{matchesToday - 1 === 1 ? '' : 'es'} today
          </RNText>
        ) : null}

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

function Countdown({ parts }: { parts: Array<{ value: number; label: string }> }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
      {parts.map((part, i) => (
        <View key={part.label} style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          <RNText
            style={{
              fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
              fontSize: 22,
              fontWeight: '900',
              color: '#FFFFFF',
              lineHeight: 26,
            }}
          >
            {String(part.value).padStart(2, '0')}
          </RNText>
          <RNText
            style={{
              fontFamily: 'Nunito_700Bold',
              fontSize: 10,
              color: 'rgba(255,255,255,0.4)',
              marginLeft: 1,
              marginBottom: 4,
            }}
          >
            {part.label}
          </RNText>
          {i < parts.length - 1 ? (
            <RNText
              style={{
                fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
                fontSize: 20,
                color: 'rgba(255,255,255,0.3)',
                marginHorizontal: 2,
              }}
            >
              :
            </RNText>
          ) : null}
        </View>
      ))}
    </View>
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
          fontSize: 12,
          color: 'rgba(255,255,255,0.7)',
          letterSpacing: 0.5,
        }}
      >
        {code}
      </RNText>
    </View>
  );
}
