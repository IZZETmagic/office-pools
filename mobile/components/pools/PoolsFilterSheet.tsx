// Single-select bottom sheet used by `PoolsFilterBar` for the four filter
// axes (status, type, predictions, sort). Replaces the per-platform
// behavior the chips used to have: iOS opened ActionSheetIOS (an iOS-only
// API) and Android cycled through options on every tap — a confusing UX
// for anything beyond a binary toggle.
//
// API mirrors `FlexBadgesSheet` so anyone familiar with one understands
// the other: forwardRef + `open({ title, options, selectedValue, onPick })`.
// The same instance handles all four pickers — the parent re-passes a
// fresh config every time it calls `.open(...)`.

import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

export type FilterOption = {
  label: string;
  value: string;
};

export type FilterSheetConfig = {
  title: string;
  options: FilterOption[];
  selectedValue: string;
  onPick: (value: string) => void;
};

export type PoolsFilterSheetHandle = {
  open: (config: FilterSheetConfig) => void;
  close: () => void;
};

export const PoolsFilterSheet = forwardRef<PoolsFilterSheetHandle>(function PoolsFilterSheet(
  _,
  ref,
) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet | null>(null);
  // Local config state — parent passes a fresh config each time it calls
  // `open(...)`, the sheet remembers it until the next open call. Avoids
  // forcing the parent to keep separate state for "which sheet is active".
  const [config, setConfig] = useState<FilterSheetConfig | null>(null);

  useImperativeHandle(ref, () => ({
    open: (next: FilterSheetConfig) => {
      setConfig(next);
      sheetRef.current?.expand();
    },
    close: () => sheetRef.current?.close(),
  }));

  // Compute height from the active config's option count so each picker
  // is sized exactly to fit — same approach as FlexBadgesSheet. Falls back
  // to a sensible default when no config is set (sheet is closed).
  const snapPoints = useMemo<(string | number)[]>(() => {
    const rowHeight = 52;
    const headerHeight = 56;
    const padding = 24 + insets.bottom;
    const count = config?.options.length ?? 4;
    const height = headerHeight + rowHeight * count + padding;
    return [height];
  }, [config?.options.length, insets.bottom]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.4} />
    ),
    [],
  );

  function handlePick(value: string) {
    sheetRef.current?.close();
    config?.onPick(value);
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
      <BottomSheetView
        style={{
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.md,
        }}
      >
        <View style={{ paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.md }}>
          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 16,
              color: theme.colors.ink,
            }}
          >
            {config?.title ?? ''}
          </RNText>
        </View>
        <View style={{ gap: theme.spacing.xs }}>
          {config?.options.map((opt, i) => {
            const isSelected = opt.value === config.selectedValue;
            return (
              <Pressable
                key={opt.value}
                onPress={() => handlePick(opt.value)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.md,
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  backgroundColor: pressed
                    ? withOpacity(theme.colors.ink, 0.06)
                    : 'transparent',
                  borderTopWidth: i === 0 ? 0 : 0.5,
                  borderTopColor: withOpacity(theme.colors.silver, 0.4),
                })}
              >
                <RNText
                  style={{
                    flex: 1,
                    fontFamily: isSelected ? fontFamilies.bold : fontFamilies.medium,
                    fontSize: 15,
                    color: isSelected ? theme.colors.primary : theme.colors.ink,
                  }}
                >
                  {opt.label}
                </RNText>
                {isSelected ? (
                  <Icon name="checkmark.circle.fill" color="primary" size={18} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
});
