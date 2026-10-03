// Cross-platform action sheet matching our design system.
//
// Why not ActionSheetIOS? It's iOS-only — on Android the call either
// silently no-ops or has to be replaced with a hand-rolled cycle hack
// (see the pre-fix PoolsFilterBar). This component renders identically
// on both platforms using a transparent Modal + theme tokens, with an
// optional active-value highlight, optional destructive styling, and
// safe-area-aware bottom padding for Android gesture nav.
//
// ⚠ THE DIM FADES; ONLY THE SHEET SLIDES (Ryan, 2026-10-02: "the background
// darkening is awkward"). It used the Modal's own slide animation, which moves the
// Modal's WHOLE content — so the dark backdrop rose up the screen as a slab
// behind the sheet instead of the screen dimming in place, unlike every gorhom
// sheet in the app (`BottomSheetBackdrop` fades). Now the Modal itself doesn't
// animate: the dim's opacity and the sheet's position are driven separately,
// on the native driver (core Animated, not Reanimated — see
// gotcha_reanimated_ios_commit_pause), and closing plays it backwards before
// the Modal goes.
//
// Usage:
//   <ActionSheet
//     visible={open}
//     onClose={() => setOpen(false)}
//     title="Sort by"
//     selectedValue={sort}
//     options={[
//       { label: 'Smart (Default)', value: 'smart' },
//       { label: 'Newest', value: 'newest' },
//       ...
//     ]}
//     onSelect={(v) => { setOpen(false); setSort(v); }}
//   />

import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from './Icon';
import { Text } from './Text';
import { SHEET_RADIUS } from './sheetChrome';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

export type ActionSheetOption<T extends string> = {
  /** Human-readable label rendered as the row title. */
  label: string;
  /** Stable value passed back to `onSelect`. */
  value: T;
  /** Optional small icon name (Icon component) shown on the left. */
  icon?: string;
  /** Renders the row in the brand red color to telegraph a dangerous action. */
  destructive?: boolean;
  /** Greys the row and disables press. */
  disabled?: boolean;
};

type ActionSheetProps<T extends string> = {
  visible: boolean;
  onClose: () => void;
  onSelect: (value: T) => void;
  options: Array<ActionSheetOption<T>>;
  /** Optional bold title above the option list. */
  title?: string;
  /** If set, the matching option renders with a checkmark + accent color. */
  selectedValue?: T;
  /** Override the cancel button text. */
  cancelLabel?: string;
};

export function ActionSheet<T extends string>({
  visible,
  onClose,
  onSelect,
  options,
  title,
  selectedValue,
  cancelLabel = 'Cancel',
}: ActionSheetProps<T>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  // 0 = closed, 1 = open. Drives the dim (opacity) and the sheet (translateY) together.
  const progress = useRef(new Animated.Value(0)).current;
  // The Modal stays up while the close plays out, then goes.
  const [shown, setShown] = useState(visible);
  if (visible && !shown) setShown(true);

  useEffect(() => {
    if (visible) {
      Animated.timing(progress, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(progress, {
        toValue: 0,
        duration: 200,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setShown(false);
      });
    }
  }, [visible, progress]);

  // From just below the screen's bottom edge — a fixed distance, so nothing depends on measuring
  // the sheet first (a measured height arriving mid-animation would make it jump).
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [windowHeight, 0] });

  return (
    <Modal
      visible={shown}
      animationType="none"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Flex-column layout: backdrop takes the remaining space ABOVE the
          sheet (flex: 1), sheet sits below with intrinsic height. The two
          are non-overlapping siblings so there's no z-order ambiguity and
          taps on either reach the correct Pressable on every platform.
          The previous absolute-positioned overlap pattern dropped option
          touches on Android inside transparent Modals — flex layout
          sidesteps the whole class of issues. */}
      <View style={{ flex: 1 }}>
        {/* The dim: the whole screen, fading in place. Behind everything and
            pointerEvents="none", so it never takes a touch — the transparent
            Pressable below is still the tap-to-close target, and the flex
            layout the note above depends on is unchanged. Full-screen rather
            than only above the sheet, so no undimmed band shows beneath the
            sheet while it is still sliding up. */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)', opacity: progress }]}
        />
        <Pressable onPress={onClose} style={{ flex: 1 }} accessibilityLabel={cancelLabel} />
        <Animated.View
          style={{
            transform: [{ translateY }],
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: SHEET_RADIUS,
            borderTopRightRadius: SHEET_RADIUS,
            // ⚠ A SQUIRCLE, LIKE EVERY OTHER iOS SURFACE — see `sheetChrome`.
            borderCurve: 'continuous' as const,
            // ⚠ AND THE CLIP, so no opaque child can square off the bottom of the
            // curve — the step `sheetChrome` describes.
            overflow: 'hidden',
            paddingTop: theme.spacing.md,
            paddingBottom: Math.max(insets.bottom, theme.spacing.md),
            // Subtle top shadow so the sheet feels lifted from the backdrop
            // on both platforms. iOS uses shadowColor, Android elevation.
            ...Platform.select({
              ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -2 },
                shadowOpacity: 0.1,
                shadowRadius: 12,
              },
              android: {
                elevation: 16,
              },
              default: {},
            }),
          }}
        >
          {/* iOS-style grabber handle — same on Android because it reads as
              a universal "this sheet is draggable / dismissable" signal even
              though our implementation isn't gesture-driven. */}
          <View
            style={{
              alignSelf: 'center',
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: withOpacity(theme.colors.silver, 0.6),
              marginBottom: theme.spacing.md,
            }}
          />

          {title ? (
            <View
              style={{
                paddingHorizontal: theme.spacing.xl,
                paddingBottom: theme.spacing.md,
                borderBottomWidth: 0.5,
                borderBottomColor: withOpacity(theme.colors.silver, 0.4),
              }}
            >
              <Text variant="detail" color="slate" align="center">
                {title}
              </Text>
            </View>
          ) : null}

          {options.map((option, index) => {
            const isSelected = selectedValue === option.value;
            const labelColor = option.destructive
              ? theme.colors.red
              : option.disabled
                ? withOpacity(theme.colors.slate, 0.4)
                : isSelected
                  ? theme.colors.primary
                  : theme.colors.ink;
            return (
              <Pressable
                key={option.value}
                disabled={option.disabled}
                onPress={() => {
                  if (option.disabled) return;
                  onSelect(option.value);
                }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.md,
                  paddingHorizontal: theme.spacing.xl,
                  paddingVertical: theme.spacing.md + 2,
                  backgroundColor: pressed
                    ? withOpacity(theme.colors.silver, 0.15)
                    : 'transparent',
                  // Hairline divider between rows — last row no divider.
                  borderBottomWidth: index < options.length - 1 ? 0.5 : 0,
                  borderBottomColor: withOpacity(theme.colors.silver, 0.3),
                })}
              >
                {option.icon ? (
                  <Icon
                    name={option.icon}
                    size={18}
                    tint={labelColor}
                    weight={isSelected ? 'semibold' : 'regular'}
                  />
                ) : null}
                <Text
                  style={{
                    flex: 1,
                    fontFamily: isSelected ? fontFamilies.bold : fontFamilies.medium,
                    fontSize: 16,
                    color: labelColor,
                  }}
                >
                  {option.label}
                </Text>
                {isSelected ? (
                  <Icon
                    name="checkmark.circle.fill"
                    size={20}
                    tint={theme.colors.primary}
                  />
                ) : null}
              </Pressable>
            );
          })}

          {/* Cancel button — visually separated by an 8pt spacer + bg
              difference so it reads as the dismissal action, matching the
              iOS Human Interface Guidelines for action sheets and giving
              Android users an obvious tap-to-close (since the swipe-down
              gesture iOS users rely on isn't available here). */}
          <View style={{ height: theme.spacing.sm }} />
          <Pressable
            onPress={onClose}
            style={({ pressed }) => ({
              marginHorizontal: theme.spacing.lg,
              marginTop: theme.spacing.xs,
              paddingVertical: theme.spacing.md + 2,
              borderRadius: theme.radii.md,
              backgroundColor: pressed
                ? withOpacity(theme.colors.silver, 0.3)
                : withOpacity(theme.colors.silver, 0.15),
              alignItems: 'center',
            })}
          >
            <Text
              style={{
                fontFamily: fontFamilies.bold,
                fontSize: 16,
                color: theme.colors.ink,
              }}
            >
              {cancelLabel}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}
