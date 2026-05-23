import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Image, Pressable, Share, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text } from '@/components/ui';
import type { PoolDetailInfo } from '@/lib/usePoolDetail';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

const MODE_LABEL: Record<string, string> = {
  full_tournament: 'Full Tournament',
  progressive: 'Progressive',
  bracket_picker: 'Bracket',
};

const MODE_COLOR: Record<string, string> = {
  full_tournament: '#3B6EFF',
  progressive: '#059669',
  bracket_picker: '#D97706',
};

function brandHex(hex: string | null): string | null {
  if (!hex) return null;
  return hex.startsWith('#') ? hex : `#${hex}`;
}

/** Darken a hex color toward black by `amount` (0..1) for gradient depth. */
function shade(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 - amount))));
  return `#${[f(r), f(g), f(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

type PoolDetailHeaderProps = {
  pool: PoolDetailInfo;
};

export function PoolDetailHeader({ pool }: PoolDetailHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const modeLabel = pool.predictionMode ? MODE_LABEL[pool.predictionMode] ?? 'Pool' : 'Pool';
  const brandColor = brandHex(pool.brandColor);
  const isBranded = Boolean(pool.brandName && brandColor);
  const modeColor = pool.predictionMode
    ? MODE_COLOR[pool.predictionMode] ?? theme.colors.primary
    : theme.colors.primary;

  async function handleShare() {
    const url = `https://sportpool.io/join/${pool.poolCode}`;
    await Share.share({
      message: `Join "${pool.poolName}" on SportPool!\n\n${url}`,
      url,
    });
  }

  if (isBranded && brandColor) {
    return (
      <LinearGradient
        colors={[brandColor, shade(brandColor, 0.25)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          paddingHorizontal: theme.spacing.xl,
          paddingTop: insets.top + theme.spacing.md,
          paddingBottom: theme.spacing.lg,
          gap: theme.spacing.md,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: theme.radii.pill,
              backgroundColor: 'rgba(255,255,255,0.18)',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Icon name="chevron.left" tint="#FFFFFF" size={16} weight="semibold" />
          </Pressable>

          {pool.brandLogoUrl ? (
            <Image
              source={{ uri: pool.brandLogoUrl }}
              style={{
                width: 36,
                height: 36,
                borderRadius: theme.radii.sm,
                backgroundColor: 'rgba(255,255,255,0.15)',
              }}
              resizeMode="cover"
            />
          ) : pool.brandEmoji ? (
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: theme.radii.sm,
                backgroundColor: 'rgba(255,255,255,0.15)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <RNText style={{ fontSize: 20 }}>{pool.brandEmoji}</RNText>
            </View>
          ) : null}

          <View style={{ flex: 1, gap: 1 }}>
            <RNText
              numberOfLines={1}
              style={{
                fontFamily: fontFamilies.bold,
                fontSize: 10,
                color: 'rgba(255,255,255,0.85)',
                letterSpacing: 0.6,
                textTransform: 'uppercase',
              }}
            >
              {pool.brandName}
            </RNText>
            <RNText
              numberOfLines={1}
              style={{
                fontFamily: fontFamilies.black,
                fontSize: 18,
                lineHeight: 22,
                color: '#FFFFFF',
              }}
            >
              {pool.poolName}
            </RNText>
          </View>

          {pool.status === 'open' && (!pool.isPrivate || pool.isAdmin) ? (
            <Pressable
              onPress={handleShare}
              hitSlop={12}
              style={({ pressed }) => ({
                width: 36,
                height: 36,
                borderRadius: theme.radii.pill,
                backgroundColor: 'rgba(255,255,255,0.18)',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Icon name="square.and.arrow.up" tint="#FFFFFF" size={16} weight="semibold" />
            </Pressable>
          ) : null}
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            flexWrap: 'wrap',
            marginLeft: 36 + theme.spacing.sm,
          }}
        >
          {pool.isAdmin ? (
            <View
              style={{
                paddingHorizontal: theme.spacing.sm,
                paddingVertical: 3,
                borderRadius: theme.radii.pill,
                backgroundColor: 'rgba(255,255,255,0.2)',
              }}
            >
              <RNText
                style={{
                  fontFamily: fontFamilies.semibold,
                  fontSize: 10,
                  color: '#FFFFFF',
                  letterSpacing: 0.4,
                }}
              >
                ADMIN
              </RNText>
            </View>
          ) : null}
          <View
            style={{
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: 3,
              borderRadius: theme.radii.pill,
              backgroundColor: 'rgba(255,255,255,0.2)',
            }}
          >
            <RNText
              style={{
                fontFamily: fontFamilies.semibold,
                fontSize: 11,
                color: '#FFFFFF',
              }}
            >
              {modeLabel}
            </RNText>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="person.2.fill" tint="rgba(255,255,255,0.85)" size={11} />
            <RNText
              style={{
                fontFamily: fontFamilies.medium,
                fontSize: 12,
                color: 'rgba(255,255,255,0.85)',
              }}
            >
              {pool.memberCount} {pool.memberCount === 1 ? 'member' : 'members'}
            </RNText>
          </View>
          <RNText
            style={{
              marginLeft: 'auto',
              fontFamily: fontFamilies.semibold,
              fontSize: 9,
              color: 'rgba(255,255,255,0.55)',
              letterSpacing: 0.5,
            }}
          >
            POWERED BY SPORTPOOL
          </RNText>
        </View>
      </LinearGradient>
    );
  }

  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.xl,
        paddingTop: insets.top + theme.spacing.md,
        paddingBottom: theme.spacing.md,
        gap: theme.spacing.sm,
        backgroundColor: theme.colors.snow,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing.sm,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: theme.radii.pill,
            backgroundColor: withOpacity(theme.colors.ink, 0.06),
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Icon name="chevron.left" color="ink" size={16} weight="semibold" />
        </Pressable>
        {pool.status === 'open' && (!pool.isPrivate || pool.isAdmin) ? (
          <Pressable
            onPress={handleShare}
            hitSlop={12}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: theme.radii.pill,
              backgroundColor: withOpacity(theme.colors.ink, 0.06),
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Icon name="square.and.arrow.up" color="ink" size={16} weight="semibold" />
          </Pressable>
        ) : null}
      </View>

      <View style={{ gap: theme.spacing.xs }}>
        <Text variant="pageTitle" numberOfLines={2}>
          {pool.poolName}
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            flexWrap: 'wrap',
          }}
        >
          {pool.isAdmin ? (
            <View
              style={{
                paddingHorizontal: theme.spacing.sm,
                paddingVertical: 3,
                borderRadius: theme.radii.pill,
                backgroundColor: withOpacity(theme.colors.ink, 0.06),
              }}
            >
              <RNText
                style={{
                  fontFamily: fontFamilies.semibold,
                  fontSize: 10,
                  color: theme.colors.slate,
                  letterSpacing: 0.4,
                }}
              >
                ADMIN
              </RNText>
            </View>
          ) : null}
          <View
            style={{
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: 3,
              borderRadius: theme.radii.pill,
              backgroundColor: withOpacity(modeColor, 0.1),
            }}
          >
            <RNText
              style={{
                fontFamily: fontFamilies.semibold,
                fontSize: 11,
                color: modeColor,
              }}
            >
              {modeLabel}
            </RNText>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="person.2.fill" color="slate" size={11} />
            <Text variant="detail" color="slate">
              {pool.memberCount} {pool.memberCount === 1 ? 'member' : 'members'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}
