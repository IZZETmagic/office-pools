import { Image, Platform, Pressable, Text as RNText, View } from 'react-native';

import { MemberAvatar } from '@/components/avatar/MemberAvatar';
import { CompetitionRail } from '@/components/CompetitionRail';
import { ProgressRing, Text } from '@/components/ui';
import { avatarBackgroundFor, avatarIndexFor, groundInkFor } from '@/lib/avatarGradient';
import { getCompetitionColor } from '@/lib/design/competition';
import type { PoolCardMember, PoolSummary } from '@/lib/useHomeData';
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
            <MemberAvatars members={pool.members} totalMembers={pool.memberCount} />
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

const STACK_SIZE = 24;
/** The gap-making ring drawn between overlapping heads, in the card's own surface colour. */
const RING_WIDTH = 1.5;

/**
 * The overlapping run of members at the foot of the card.
 *
 * ⭐⭐ THE COLOUR NOW COMES FROM THE MEMBER, NOT THE SLOT. This used to read
 * `AVATAR_GRADIENTS[i % 3]`, which coloured by POSITION — so a member's circle
 * changed colour whenever somebody joined or left ahead of them in join order,
 * and the same person wore different colours on two different cards. Both the
 * avatar's ground and the initials fallback now derive from `avatarIndexFor`,
 * which hashes the member's id, so a member has ONE colour everywhere.
 *
 * ⚠ That also makes this agree with the profile card and the web, which have
 * always derived the ground from the id.
 */
function MemberAvatars({ members, totalMembers }: { members: PoolCardMember[]; totalMembers: number }) {
  const theme = useTheme();
  // ⚠ DEFENSIVE, and the real fix is the CACHE_VERSION bump that discards any
  // payload written before `members` existed. This is the second line: a cold
  // start hydrates from disk inside a `useState` initialiser, so anything
  // undefined here is a white screen on launch rather than a missing row.
  const visible = (members ?? []).slice(0, 3);
  const overflow = Math.max(0, totalMembers - visible.length);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {visible.map((m, i) => {
        const index = avatarIndexFor(m.userId, m.avatarColour);
        const ground = avatarBackgroundFor(index);

        /**
         * ⚠ A LITERAL INK, NOT `theme.colors.ink`. The initials sit on the
         * member's ground, which is the SAME value in light and dark — so a
         * theme-aware colour is guaranteed to fail in one of them. Same reason
         * the profile card pins its ink. White failed on all 22 grounds when
         * this was measured; `groundInkFor` picks the one that passes.
         */
        const ink = groundInkFor(index);

        /**
         * The separating ring between overlapping heads.
         *
         * ⚠⚠ `borderRadius` IS LOAD-BEARING, NOT COSMETIC. Without it the border
         * is a SQUARE drawn around a round avatar, and because the stack overlaps
         * by 6px the neighbour's straight edge cuts a hard vertical line across
         * the face beside it. The old initials stack never showed this because the
         * border lived on the round gradient itself; moving it out to a wrapper is
         * what exposed it.
         *
         * ⚠ The radius is the avatar's own radius PLUS the border width: a border
         * on a wrap-content View sits OUTSIDE the 24px child, so the outer box is
         * 27px and half of that is 13.5.
         */
        const ring = {
          borderWidth: RING_WIDTH,
          borderColor: theme.colors.surface,
          borderRadius: STACK_SIZE / 2 + RING_WIDTH,
          marginLeft: i === 0 ? 0 : -6,
        } as const;

        return (
          <View key={m.userId} style={ring}>
            <MemberAvatar
              userId={m.userId}
              avatarBuild={m.avatarBuild}
              avatarColour={m.avatarColour}
              size={STACK_SIZE}
              fallback={
                <View
                  style={{
                    width: STACK_SIZE,
                    height: STACK_SIZE,
                    borderRadius: STACK_SIZE / 2,
                    backgroundColor: ground,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 9, color: ink }}>
                    {m.initials}
                  </RNText>
                </View>
              }
            />
          </View>
        );
      })}
      {overflow > 0 ? (
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
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
