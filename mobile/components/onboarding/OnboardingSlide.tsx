// Renders a single onboarding slide. Layout is intentionally shared across
// all three pre-auth slides so swapping content stays a pure data edit —
// only the OnboardingSlide data (slides.ts) changes when copy/icons move.
//
// The hero icon sits in a tinted circular halo above an eyebrow + title +
// body. When a slide carries `cards`, they stack underneath as compact
// rows. Empty `cards` collapses cleanly to a centered hero block.

import { HugeiconsIcon } from '@hugeicons/react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, Text as RNText, useWindowDimensions, View } from 'react-native';

import { Text } from '@/components/ui';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

import type { OnboardingCard, OnboardingSlide as OnboardingSlideData } from './slides';

type Props = {
  slide: OnboardingSlideData;
};

export function OnboardingSlide({ slide }: Props) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const accent = theme.colors[slide.accentColor];

  return (
    <ScrollView
      style={{ width }}
      contentContainerStyle={{
        paddingHorizontal: theme.spacing.xl,
        paddingTop: theme.spacing.xxl,
        paddingBottom: theme.spacing.xl,
        gap: theme.spacing.xxl,
      }}
      showsVerticalScrollIndicator={false}
      // Lock to vertical only — horizontal pan belongs to the parent pager.
      // Without this the slide intercepts horizontal flicks near its edges.
      directionalLockEnabled
    >
      <View style={{ alignItems: 'center', gap: theme.spacing.lg }}>
        <LinearGradient
          colors={[withOpacity(accent, 0.32), withOpacity(accent, 0.06)]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            width: 128,
            height: 128,
            borderRadius: 64,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: withOpacity(accent, 0.18),
          }}
        >
          <HugeiconsIcon
            icon={slide.heroIcon}
            size={60}
            color={accent}
            strokeWidth={2}
          />
        </LinearGradient>

        {slide.eyebrow ? (
          <Text variant="caption" color={slide.accentColor} align="center">
            {slide.eyebrow}
          </Text>
        ) : null}

        <EmphasisTitle title={slide.title} accent={accent} />

        <Text variant="body" color="slate" align="center">
          {slide.body}
        </Text>
      </View>

      {slide.cards && slide.cards.length > 0 ? (
        <View style={{ gap: theme.spacing.md }}>
          {slide.cards.map((card, i) => (
            <CardRow key={i} card={card} accent={accent} />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

// Splits "Office pools shouldn't be *a second job*." into alternating
// normal/emphasis runs and paints the emphasis runs in the slide accent.
// Unpaired asterisks render literally — no crash on bad data.
function EmphasisTitle({ title, accent }: { title: string; accent: string }) {
  const theme = useTheme();
  const segments = title.split(/(\*[^*]+\*)/g).filter(Boolean);
  return (
    <RNText
      style={{
        fontFamily: fontFamilies.black,
        fontSize: 26,
        lineHeight: 32,
        color: theme.colors.ink,
        textAlign: 'center',
      }}
    >
      {segments.map((seg, i) => {
        const emphasized = seg.startsWith('*') && seg.endsWith('*') && seg.length > 2;
        return (
          <RNText key={i} style={emphasized ? { color: accent } : undefined}>
            {emphasized ? seg.slice(1, -1) : seg}
          </RNText>
        );
      })}
    </RNText>
  );
}

function CardRow({ card, accent }: { card: OnboardingCard; accent: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.lg,
        padding: theme.spacing.lg,
        borderRadius: theme.radii.md,
        backgroundColor: theme.colors.surface,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: withOpacity(accent, 0.12),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <HugeiconsIcon icon={card.icon} size={22} color={accent} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, gap: theme.spacing.xxs }}>
        <Text variant="cardTitle" color="ink">
          {card.title}
        </Text>
        <Text variant="body" color="slate">
          {card.body}
        </Text>
      </View>
    </View>
  );
}
