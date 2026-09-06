import { LinearGradient } from 'expo-linear-gradient';
import { Image, Platform, Pressable, Text as RNText, View } from 'react-native';

import { CompetitionRail } from '@/components/CompetitionRail';
import { ProgressRing, Text } from '@/components/ui';
import { getCompetitionColor } from '@/lib/design/competition';
import type { PoolSummary } from '@/lib/useHomeData';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type PoolCardProps = {
  pool: PoolSummary;
  onPress?: () => void;
};

// ⚠ THE MODE GRADIENT IS GONE, and it was not merely plainer than what
// replaced it. This card's left bar used to be coloured by `prediction_mode`
// off a three-entry table — the World Cup's modes — so a league pool fell
// through to `full_tournament` and EVERY Premier League card rendered in the
// World Cup's blue. The bar now carries the competition (CompetitionRail),
// which is the same move the web made on 2026-08-29.
//
// The card therefore no longer shows the mode at all: web freed the stripe by
// putting the mode on a pill, and this card has no pill. Accepted knowingly —
// Ryan, 2026-09-02 — on the grounds that the signal was already wrong for
// league pools and the mode is named on the pool detail. Revisit when the rest
// of the card is wired in.

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
  // The progress ring's colour. A branded pool keeps its own brand — that is
  // the whole point of branding it — and everything else takes the
  // competition's, so the ring and the rail agree.
  const accent = isBranded && brandColor ? brandColor : getCompetitionColor(pool.externalLeagueId);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        // ⚠ 244 IS 220 PLUS THE RAIL, not a round number picked by eye. The
        // competition rail is 30px where the mode bar it replaced was 5, so the
        // content lost 25px of width; one `spacing.xl` gives 24 of them back and
        // the card's interior is the size it was tuned at. Ryan's call after
        // seeing 220 with the rail on a phone, 2026-09-02.
        //
        // The peek is what constrains the other end: the home scroller pads 24
        // each side with a 12 gap, so the next card shows `screen - width - 36`
        // — 113px on a 393pt phone, still most of a card, so the row still
        // reads as scrollable. Much past ~280 and that stops being true.
        width: 244,
        height: 180,
        borderRadius: theme.radii.lg,
        backgroundColor: isBranded && brandColor ? withOpacity(brandColor, 0.05) : theme.colors.surface,
        overflow: 'hidden',
        flexDirection: 'row',
        opacity: pressed ? 0.85 : 1,
        ...theme.shadows.card,
      })}
    >
      {/* A branded pool shows its banner instead of the rail, as the web card
          does — two competing identities on one card is one too many. */}
      {!isBranded ? (
        <CompetitionRail externalLeagueId={pool.externalLeagueId} size="compact" />
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
              <ProgressRing
                completed={pool.predictionsCompleted}
                total={pool.predictionsTotal}
                singleDecision={pool.isSingleDecision}
                accent={accent}
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
