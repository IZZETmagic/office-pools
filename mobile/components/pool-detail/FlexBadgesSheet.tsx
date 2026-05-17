import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fontFamilies, useTheme, withOpacity } from '@/theme';

export type FlexBadgeOption = {
  key: string;
  emoji: string;
  label: string;
  description: string;
};

export type FlexBadgesSheetHandle = {
  open: () => void;
  close: () => void;
};

type Props = {
  options: FlexBadgeOption[];
  onPick: (key: string) => void;
};

export const FlexBadgesSheet = forwardRef<FlexBadgesSheetHandle, Props>(function FlexBadgesSheet(
  { options, onPick },
  ref,
) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet | null>(null);

  useImperativeHandle(ref, () => ({
    open: () => sheetRef.current?.expand(),
    close: () => sheetRef.current?.close(),
  }));

  const snapPoints = useMemo<(string | number)[]>(() => {
    const rowHeight = 64;
    const headerHeight = 56;
    const padding = 24 + insets.bottom;
    const height = headerHeight + rowHeight * options.length + padding;
    return [height];
  }, [options.length, insets.bottom]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.4} />
    ),
    [],
  );

  function handlePick(key: string) {
    sheetRef.current?.close();
    onPick(key);
  }

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      handleIndicatorStyle={{ backgroundColor: theme.colors.silver }}
      backgroundStyle={{ backgroundColor: theme.colors.surface }}
    >
      <BottomSheetView style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: insets.bottom + theme.spacing.md }}>
        <View style={{ paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.md }}>
          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 16,
              color: theme.colors.ink,
            }}
          >
            Flex which badge?
          </RNText>
          <RNText
            style={{
              fontFamily: fontFamilies.regular,
              fontSize: 13,
              color: theme.colors.slate,
              marginTop: 2,
            }}
          >
            Drop a flex card into the chat.
          </RNText>
        </View>
        <View style={{ gap: theme.spacing.xs }}>
          {options.map((opt, i) => (
            <Pressable
              key={opt.key}
              onPress={() => handlePick(opt.key)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
                paddingVertical: 12,
                paddingHorizontal: 12,
                borderRadius: 12,
                backgroundColor: pressed ? withOpacity(theme.colors.ink, 0.06) : 'transparent',
                borderTopWidth: i === 0 ? 0 : 0.5,
                borderTopColor: withOpacity(theme.colors.silver, 0.4),
              })}
            >
              <RNText style={{ fontSize: 22 }}>{opt.emoji}</RNText>
              <View style={{ flex: 1, gap: 2 }}>
                <RNText
                  numberOfLines={1}
                  style={{
                    fontFamily: fontFamilies.bold,
                    fontSize: 15,
                    color: theme.colors.ink,
                  }}
                >
                  {opt.label}
                </RNText>
                <RNText
                  numberOfLines={1}
                  style={{
                    fontFamily: fontFamilies.regular,
                    fontSize: 12,
                    color: theme.colors.slate,
                  }}
                >
                  {opt.description}
                </RNText>
              </View>
            </Pressable>
          ))}
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
});
