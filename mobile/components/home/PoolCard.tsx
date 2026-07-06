import { LinearGradient } from 'expo-linear-gradient';
import { Image, Platform, Pressable, Text as RNText, View } from 'react-native';

import { Text } from '@/components/ui';
import type { PoolSummary } from '@/lib/useHomeData';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type PoolCardProps = {
  pool: PoolSummary;
  onPress?: () => void;
};

const MODE_GRADIENT: Record<string, [string, string]> = {
  full_tournament: ['#667EEA', '#3B6EFF'],
  progressive: ['#34D399', '#059669'],
  bracket_picker: ['#FBBF24', '#D97706'],
};

const AVATAR_GRADIENTS: Array<[string, string]> = [
  ['#667EEA', '#764BA2'],
  ['#F093FB', '#F5576C'],
  ['#4FACFE', '#00F2FE'],
];

function brandHex(hex: string | null): string | null {
  if (!hex) return null;
  return hex.startsWith('#') ? hex : `#${hex}`;
}

export function PoolCard({ pool, onPress }: PoolCardProps) {
  const theme = useTheme();
  const brandColor = brandHex(pool.brandColor);
  const isBranded = Boolean(pool.brandName && brandColor);
  const modeGradient = pool.predictionMode
    ? MODE_GRADIENT[pool.predictionMode] ?? MODE_GRADIENT.full_tournament
    : MODE_GRADIENT.full;
  const accentGradient: [string, string] = isBranded && brandColor
    ? [brandColor, withOpacity(brandColor, 0.7)]
    : modeGradient;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        width: 220,
        height: 180,
        borderRadius: theme.radii.lg,
        backgroundColor: isBranded && brandColor ? withOpacity(brandColor, 0.05) : theme.colors.surface,
        overflow: 'hidden',
        flexDirection: 'row',
        opacity: pressed ? 0.85 : 1,
        ...theme.shadows.card,
      })}
    >
      {!isBranded ? (
        <LinearGradient
          colors={accentGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ width: 5, height: '100%' }}
        />
      ) : null}

      <View style={{ flex: 1 }}>
        {isBranded && brandColor ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: brandColor,
              paddingHorizontal: 10,
              paddingVertical: 8,
            }}
          >
            {pool.brandLogoUrl ? (
              <Image
                source={{ uri: pool.brandLogoUrl }}
                style={{ width: 16, height: 16, borderRadius: 3 }}
                resizeMode="cover"
              />
            ) : pool.brandEmoji ? (
              <RNText style={{ fontSize: 12 }}>{pool.brandEmoji}</RNText>
            ) : null}
            <RNText
              style={{
                fontFamily: 'Nunito_700Bold',
                fontSize: 11,
                color: '#FFFFFF',
                letterSpacing: 0.3,
              }}
              numberOfLines={1}
            >
              {pool.brandName}
            </RNText>
          </View>
        ) : null}

        <View style={{ flex: 1, padding: 12, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
            <Text variant="cardTitle" numberOfLines={2} style={{ flex: 1 }}>
              {pool.poolName}
            </Text>
            {pool.unreadBanterCount > 0 ? (
              <View
                style={{
                  minWidth: 20,
                  height: 18,
                  paddingHorizontal: 5,
                  borderRadius: 9,
                  backgroundColor: theme.colors.red,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 2,
                }}
              >
                <RNText
                  style={{
                    fontFamily: fontFamilies.bold,
                    fontSize: 10,
                    color: '#FFFFFF',
                  }}
                >
                  {pool.unreadBanterCount > 99 ? '99+' : pool.unreadBanterCount}
                </RNText>
              </View>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            {pool.hasScoringStarted && pool.currentRank !== null ? (
              <>
                <RNText
                  style={{
                    fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
                    fontSize: 32,
                    fontWeight: '900',
                    color: theme.colors.ink,
                    lineHeight: 36,
                  }}
                >
                  #{pool.currentRank}
                </RNText>
                <Text variant="body" color="slate">
                  of {pool.totalEntries.toLocaleString()}
                </Text>
              </>
            ) : (
              <RNText
                style={{
                  fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
                  fontSize: 32,
                  fontWeight: '900',
                  color: theme.colors.slate,
                  lineHeight: 36,
                }}
              >
                —
              </RNText>
            )}
          </View>

          <View style={{ flex: 1 }} />

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <MemberAvatars initials={pool.memberInitials} totalMembers={pool.memberCount} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ProgressCircle
                completed={pool.predictionsCompleted}
                total={pool.predictionsTotal}
                accent={accentGradient[1]}
              />
              <Text variant="caption" color="slate">
                {pool.totalPoints.toLocaleString()} pts
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function MemberAvatars({ initials, totalMembers }: { initials: string[]; totalMembers: number }) {
  const theme = useTheme();
  const visible = initials.slice(0, 3);
  const overflow = Math.max(0, totalMembers - visible.length);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {visible.map((init, i) => (
        <LinearGradient
          key={`${init}-${i}`}
          colors={AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1.5,
            borderColor: theme.colors.surface,
            marginLeft: i === 0 ? 0 : -6,
          }}
        >
          <RNText
            style={{
              fontFamily: 'Nunito_700Bold',
              fontSize: 9,
              color: '#FFFFFF',
            }}
          >
            {init}
          </RNText>
        </LinearGradient>
      ))}
      {overflow > 0 ? (
        <RNText
          style={{
            fontFamily: 'Nunito_700Bold',
            fontSize: 10,
            color: theme.colors.slate,
            marginLeft: 4,
          }}
        >
          +{overflow}
        </RNText>
      ) : null}
    </View>
  );
}

function ProgressCircle({
  completed,
  total,
  accent,
}: {
  completed: number;
  total: number;
  accent: string;
}) {
  const theme = useTheme();
  const isComplete = total > 0 && completed >= total;
  const isStarted = completed > 0;
  return (
    <View
      style={{
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: isComplete ? accent : isStarted ? withOpacity(accent, 0.6) : theme.colors.mist,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surface,
      }}
    >
      <RNText
        style={{
          fontFamily: 'Nunito_700Bold',
          fontSize: 8,
          color: theme.colors.ink,
        }}
      >
        {completed}
      </RNText>
    </View>
  );
}
