import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  Text as RNText,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

export type GroupOption = {
  letter: string;
  matchCount: number;
};

export type GroupPickerSheetHandle = {
  open: () => void;
  close: () => void;
};

type Props = {
  groups: GroupOption[];
  onSelect: (letter: string) => void;
};

export const GroupPickerSheet = forwardRef<GroupPickerSheetHandle, Props>(function GroupPickerSheet(
  { groups, onSelect },
  ref,
) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);

  const screenHeight = Dimensions.get('window').height;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(screenHeight)).current;

  useImperativeHandle(ref, () => ({
    open: () => setVisible(true),
    close: () => animateOut(),
  }));

  function animateIn() {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }

  function animateOut() {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: screenHeight,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => setVisible(false));
  }

  useEffect(() => {
    if (visible) animateIn();
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSelect(letter: string) {
    onSelect(letter);
    animateOut();
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={animateOut}>
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          opacity: backdropOpacity,
        }}
      >
        <Pressable style={{ flex: 1 }} onPress={animateOut} />
      </Animated.View>

      <Animated.View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: theme.colors.surface,
          borderTopLeftRadius: theme.radii.xl,
          borderTopRightRadius: theme.radii.xl,
          transform: [{ translateY }],
          paddingBottom: insets.bottom + theme.spacing.sm,
          // Cap so a long group list scrolls instead of pushing under the
          // status bar; safe-area top inset is honored automatically because
          // `maxHeight` is computed off `screenHeight - insets.top`.
          maxHeight: screenHeight - insets.top - 12,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.md,
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.md,
            paddingBottom: theme.spacing.md,
          }}
        >
          <RNText
            style={{
              flex: 1,
              fontFamily: fontFamilies.bold,
              fontSize: 17,
              color: theme.colors.ink,
            }}
          >
            Select Group
          </RNText>
          <CloseButton onPress={animateOut} />
        </View>

        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingHorizontal: theme.spacing.lg }}>
          {groups.map((g, i) => (
            <View key={g.letter}>
              {i > 0 ? (
                <View
                  style={{
                    height: 0.5,
                    backgroundColor: withOpacity(theme.colors.silver, 0.5),
                  }}
                />
              ) : null}
              <Pressable
                onPress={() => handleSelect(g.letter)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingVertical: 16,
                  backgroundColor: pressed ? withOpacity(theme.colors.ink, 0.04) : 'transparent',
                })}
              >
                <RNText
                  style={{
                    flex: 1,
                    fontFamily: fontFamilies.semibold,
                    fontSize: 16,
                    color: theme.colors.ink,
                  }}
                >
                  Group {g.letter}
                </RNText>
                <RNText
                  style={{
                    fontFamily: fontFamilies.medium,
                    fontSize: 12,
                    color: theme.colors.slate,
                  }}
                >
                  {g.matchCount} matches
                </RNText>
                <Icon name="chevron.right" size={11} tint={theme.colors.silver} weight="semibold" />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
});

function CloseButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel="Close"
      accessibilityRole="button"
      style={({ pressed }) => ({
        width: 32,
        height: 32,
        borderRadius: theme.radii.pill,
        backgroundColor: withOpacity(theme.colors.ink, 0.06),
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Icon name="xmark" size={14} tint={theme.colors.ink} weight="semibold" />
    </Pressable>
  );
}
