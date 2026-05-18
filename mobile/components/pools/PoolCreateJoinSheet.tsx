// Bottom sheet that opens from the "+" button in the Home and Pools tab
// headers. Two affordances — Create a new pool or Join one with a code —
// each rendered as an icon + label + description row. Replaces the
// `Alert.alert` that used to fire on plus-tap (native modal, no design
// system) with our themed gorhom sheet.
//
// Mounted at the screen root (alongside ScrollViews), opened via ref +
// imperative `open()` — same pattern as `FlexBadgesSheet` and
// `PoolsFilterSheet`.

import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { router } from 'expo-router';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text } from '@/components/ui';
import { useTheme, withOpacity } from '@/theme';

export type PoolCreateJoinSheetHandle = {
  open: () => void;
  close: () => void;
};

type ActionKey = 'create' | 'join';

type Action = {
  key: ActionKey;
  icon: string;
  label: string;
  description: string;
};

const ACTIONS: Action[] = [
  {
    key: 'create',
    icon: 'plus.circle.fill',
    label: 'Create a Pool',
    description: 'Spin up a new pool for your friends',
  },
  {
    key: 'join',
    icon: 'person.badge.plus',
    label: 'Join with Code',
    description: 'Enter a code to join an existing pool',
  },
];

type Props = {
  /**
   * Called when the user picks "Join with Code". Parent screen should
   * close this sheet (handled inside) and open its JoinPoolSheet. We
   * coordinate from the parent so both sheets can mount at the screen
   * root and the gorhom animations sequence cleanly.
   */
  onJoinPress?: () => void;
};

export const PoolCreateJoinSheet = forwardRef<PoolCreateJoinSheetHandle, Props>(
  function PoolCreateJoinSheet({ onJoinPress }, ref) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet | null>(null);

  useImperativeHandle(ref, () => ({
    open: () => sheetRef.current?.expand(),
    close: () => sheetRef.current?.close(),
  }));

  // Fixed-content sheet — two known rows, so we can compute the snap
  // height up front instead of measuring at runtime. Matches the
  // FlexBadgesSheet sizing approach.
  const snapPoints = useMemo<(string | number)[]>(() => {
    const rowHeight = 72;
    const headerHeight = 72;
    const padding = theme.spacing.xl + insets.bottom;
    const height = headerHeight + rowHeight * ACTIONS.length + padding;
    return [height];
  }, [insets.bottom, theme.spacing.xl]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.4} />
    ),
    [],
  );

  function handlePick(action: Action) {
    sheetRef.current?.close();
    if (action.key === 'create') {
      // Create flow stays a full-screen route (multi-step wizard).
      router.navigate('/create-pool');
    } else {
      // Join flow opens a sibling JoinPoolSheet held by the parent.
      onJoinPress?.();
    }
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
          <Text variant="cardTitle">Add a pool</Text>
          <Text variant="body" color="slate" style={{ marginTop: theme.spacing.xxs }}>
            Start a new pool or join one with a code.
          </Text>
        </View>
        <View style={{ gap: theme.spacing.xs }}>
          {ACTIONS.map((action, i) => (
            <Pressable
              key={action.key}
              onPress={() => handlePick(action)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
                paddingVertical: theme.spacing.md,
                paddingHorizontal: theme.spacing.md,
                borderRadius: theme.radii.sm,
                backgroundColor: pressed
                  ? withOpacity(theme.colors.ink, 0.06)
                  : 'transparent',
                borderTopWidth: i === 0 ? 0 : theme.borders.thin,
                borderTopColor: withOpacity(theme.colors.silver, 0.4),
              })}
            >
              {/* Circular tinted icon swatch — same visual rhythm as the
                  rest of the app's primary-action affordances. */}
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: theme.radii.pill,
                  backgroundColor: withOpacity(theme.colors.primary, 0.12),
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name={action.icon} color="primary" size={20} weight="semibold" />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="cardTitle">{action.label}</Text>
                <Text variant="body" color="slate">
                  {action.description}
                </Text>
              </View>
              <Icon name="chevron.right" color="slate" size={14} weight="semibold" />
            </Pressable>
          ))}
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
});
