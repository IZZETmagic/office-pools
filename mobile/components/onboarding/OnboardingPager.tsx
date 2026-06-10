// Horizontal paged pager for the pre-auth onboarding slides. Tracks the
// current page via a shared scroll offset so the dot indicator can
// interpolate width/opacity smoothly (rather than snapping on page change),
// matching the polish of the branded splash overlay.
//
// Renders bottom-anchored controls: animated dot indicator, primary CTA
// ("Next" / "Get started"), and skip — the parent supplies CTA labels and
// callbacks so this stays presentation-only.

import { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  Text as RNText,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import { fontFamilies, useTheme } from '@/theme';

import { OnboardingSlide } from './OnboardingSlide';
import type { OnboardingSlide as SlideData } from './slides';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList<SlideData>);

type Props = {
  slides: SlideData[];
  onFinish: () => void;
  onSkip: () => void;
  finishLabel?: string;
};

export function OnboardingPager({ slides, onFinish, onSkip, finishLabel = 'Get started' }: Props) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const scrollX = useSharedValue(0);
  const listRef = useRef<FlatList<SlideData>>(null);
  const [pageIndex, setPageIndex] = useState(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  // pagingEnabled snaps to whole pages, so onMomentumScrollEnd fires once
  // per page change with the final offset. Derive the page index from that
  // rather than from scrollX (which would re-render every frame).
  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / width);
      if (next !== pageIndex) setPageIndex(next);
    },
    [pageIndex, width],
  );

  const advance = useCallback(() => {
    if (pageIndex >= slides.length - 1) {
      onFinish();
      return;
    }
    listRef.current?.scrollToIndex({ index: pageIndex + 1, animated: true });
  }, [pageIndex, slides.length, onFinish]);

  const isLast = pageIndex === slides.length - 1;
  const primaryLabel = isLast ? finishLabel : 'Next';

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Wordmark is centered in the full row; Skip is absolutely
            positioned on the right so its presence/absence never shifts
            the wordmark, and its own padding never affects row height. */}
        <View
          style={{
            justifyContent: 'center',
            paddingHorizontal: theme.spacing.xl,
            paddingTop: theme.spacing.sm,
            height: 44,
          }}
        >
          <View style={{ alignItems: 'center' }}>
            <Wordmark />
          </View>
          {!isLast ? (
            <Pressable
              onPress={onSkip}
              hitSlop={12}
              style={({ pressed }) => ({
                position: 'absolute',
                right: theme.spacing.xl,
                top: 0,
                bottom: 0,
                justifyContent: 'center',
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text variant="cardTitle" color="slate">
                Skip
              </Text>
            </Pressable>
          ) : null}
        </View>

        <AnimatedFlatList
          ref={listRef}
          data={slides}
          keyExtractor={(item) => item.key}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onMomentumScrollEnd={onMomentumEnd}
          renderItem={({ item }) => <OnboardingSlide slide={item} />}
          style={{ flex: 1 }}
        />

        <SafeAreaView edges={['bottom']}>
          <View
            style={{
              paddingHorizontal: theme.spacing.xl,
              paddingTop: theme.spacing.lg,
              paddingBottom: theme.spacing.lg,
              gap: theme.spacing.xl,
            }}
          >
            <Dots count={slides.length} scrollX={scrollX} pageWidth={width} />
            <Button title={primaryLabel} size="lg" fullWidth onPress={advance} />
          </View>
        </SafeAreaView>
      </SafeAreaView>
    </View>
  );
}

// Two-tone wordmark — matches the splash overlay's "Sport" + "Pool" lockup,
// shrunk and recolored for the snow background. Keeps onboarding feeling
// like part of the app, not a generic intro flow.
function Wordmark() {
  const theme = useTheme();
  return (
    <RNText
      style={{
        fontFamily: fontFamilies.black,
        fontSize: 18,
        letterSpacing: 0.2,
      }}
    >
      <RNText style={{ color: theme.colors.ink }}>Sport</RNText>
      <RNText style={{ color: theme.colors.primary }}>Pool</RNText>
    </RNText>
  );
}

function Dots({
  count,
  scrollX,
  pageWidth,
}: {
  count: number;
  scrollX: SharedValue<number>;
  pageWidth: number;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'center',
        gap: theme.spacing.sm,
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Dot key={i} index={i} scrollX={scrollX} pageWidth={pageWidth} />
      ))}
    </View>
  );
}

function Dot({
  index,
  scrollX,
  pageWidth,
}: {
  index: number;
  scrollX: SharedValue<number>;
  pageWidth: number;
}) {
  const theme = useTheme();

  const style = useAnimatedStyle(() => {
    const input = [(index - 1) * pageWidth, index * pageWidth, (index + 1) * pageWidth];
    const widthVal = interpolate(scrollX.value, input, [8, 24, 8], Extrapolation.CLAMP);
    const opacity = interpolate(scrollX.value, input, [0.3, 1, 0.3], Extrapolation.CLAMP);
    return { width: widthVal, opacity };
  });

  return (
    <Animated.View
      style={[
        {
          height: 8,
          borderRadius: 4,
          backgroundColor: theme.colors.primary,
        },
        style,
      ]}
    />
  );
}

