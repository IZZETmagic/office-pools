// Bottom-sheet replacement for the previous full-screen join-pool route.
// Opened from the "+" menu (PoolCreateJoinSheet → "Join with Code") and
// from the EmptyPools state. Uses the @gorhom/bottom-sheet pattern so
// the chrome matches FlexBadgesSheet / PoolsFilterSheet / PoolCreateJoinSheet.

import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetTextInput,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { router } from 'expo-router';
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text } from '@/components/ui';
import { joinPool } from '@/lib/api';
import { useHomeData } from '@/lib/HomeDataProvider';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type Tab = 'code' | 'qr';

export type JoinPoolSheetHandle = {
  open: () => void;
  close: () => void;
};

export const JoinPoolSheet = forwardRef<JoinPoolSheetHandle>(function JoinPoolSheet(_, ref) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet | null>(null);
  const [tab, setTab] = useState<Tab>('code');
  const [poolCode, setPoolCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Used after a successful join so the new pool shows up on the Home
  // and Pools tab cards immediately — same pattern as create-pool.
  const { refresh: refreshHomeData } = useHomeData();

  // Reset local state every time the sheet opens so the previous attempt's
  // input / error doesn't leak across opens.
  useImperativeHandle(ref, () => ({
    open: () => {
      setTab('code');
      setPoolCode('');
      setError(null);
      setLoading(false);
      sheetRef.current?.expand();
    },
    close: () => sheetRef.current?.close(),
  }));

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.4} />
    ),
    [],
  );

  async function handleSubmit() {
    const trimmed = poolCode.trim().toUpperCase();
    if (!trimmed) return;
    setError(null);
    setLoading(true);
    try {
      const joined = await joinPool(trimmed);
      sheetRef.current?.close();
      // Refresh the Home / Pools dashboards so the new pool card appears
      // immediately when the user lands on those tabs later.
      void refreshHomeData();
      // Land the user on the pool's leaderboard (default tab on
      // app/pool/[id].tsx). navigate() so they can swipe back to where
      // they came from (Home or Pools tab) — the join sheet has already
      // closed so there's no flicker.
      router.navigate(`/pool/${joined.pool_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join pool');
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = poolCode.trim().length > 0 && !loading;

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      // Dynamic sizing — sheet height tracks BottomSheetView's content
      // height instead of a hardcoded snap point. Avoids the dead-space
      // problem where the static estimate over-allocated whitespace below
      // the Cancel link.
      enableDynamicSizing
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      // Sheet shifts up as the keyboard appears so the input stays visible.
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      handleIndicatorStyle={{ backgroundColor: theme.colors.silver }}
      backgroundStyle={{ backgroundColor: theme.colors.surface }}
    >
      <BottomSheetView
        style={{
          paddingHorizontal: theme.spacing.xl,
          paddingTop: theme.spacing.sm,
          paddingBottom: insets.bottom + theme.spacing.md,
          gap: theme.spacing.lg,
        }}
      >
        {/* Hero icon + title + subtitle — preserves the visual identity
            of the original full-screen join-pool. */}
        <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: theme.radii.xl,
              backgroundColor: withOpacity(theme.colors.primary, 0.1),
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="person.badge.plus" color="primary" size={26} weight="semibold" />
          </View>
          <Text variant="cardTitle" align="center">
            Join a Pool
          </Text>
          <Text variant="body" color="slate" align="center">
            Enter a code or scan a QR to join
          </Text>
        </View>

        <SegmentedTabs tab={tab} onChange={setTab} />

        {tab === 'code' ? (
          <View style={{ gap: theme.spacing.md }}>
            {error ? (
              <View
                style={{
                  padding: theme.spacing.md,
                  borderRadius: theme.radii.md,
                  backgroundColor: theme.colors.redLight,
                }}
              >
                <Text variant="body" color="red" align="center">
                  {error}
                </Text>
              </View>
            ) : null}

            <BottomSheetTextInput
              value={poolCode}
              onChangeText={(value) => {
                setPoolCode(value.toUpperCase());
                setError(null);
              }}
              placeholder="POOL CODE"
              placeholderTextColor={theme.colors.slate}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={12}
              style={{
                backgroundColor: theme.colors.mist,
                borderRadius: theme.radii.md,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.md,
                fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'RobotoMono_700Bold',
                fontSize: 22,
                letterSpacing: 4,
                textAlign: 'center',
                color: theme.colors.ink,
              }}
            />

            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: theme.spacing.sm,
                height: 52,
                borderRadius: theme.radii.md,
                backgroundColor: theme.colors.primary,
                opacity: !canSubmit ? 0.5 : pressed ? 0.85 : 1,
              })}
            >
              <Icon name="arrow.right.circle.fill" color="ink" tint="#FFFFFF" size={18} filled />
              <Text
                style={{
                  fontFamily: fontFamilies.bold,
                  fontSize: 16,
                  color: '#FFFFFF',
                  letterSpacing: 0.2,
                }}
              >
                {loading ? 'Joining…' : 'Join Pool'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View
            style={{
              alignItems: 'center',
              gap: theme.spacing.sm,
              paddingVertical: theme.spacing.xl,
            }}
          >
            <Icon name="qrcode.viewfinder" color="slate" size={40} />
            <Text variant="body" color="slate" align="center">
              QR scanning ships in the next update.
            </Text>
          </View>
        )}

        <Pressable
          onPress={() => sheetRef.current?.close()}
          hitSlop={8}
          style={({ pressed }) => ({
            alignSelf: 'center',
            paddingVertical: theme.spacing.sm,
            opacity: pressed ? 0.5 : 1,
          })}
        >
          <Text variant="body" color="slate">
            Cancel
          </Text>
        </Pressable>
      </BottomSheetView>
    </BottomSheet>
  );
});

function SegmentedTabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: theme.colors.mist,
        borderRadius: theme.radii.md,
        padding: theme.spacing.xs,
      }}
    >
      <SegmentButton
        active={tab === 'code'}
        onPress={() => onChange('code')}
        icon="keyboard"
        label="Pool Code"
      />
      <SegmentButton
        active={tab === 'qr'}
        onPress={() => onChange('qr')}
        icon="qrcode"
        label="Scan QR"
      />
    </View>
  );
}

function SegmentButton({
  active,
  onPress,
  icon,
  label,
}: {
  active: boolean;
  onPress: () => void;
  icon: string;
  label: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xs,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radii.sm,
        backgroundColor: active ? theme.colors.surface : 'transparent',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon name={icon} color={active ? 'primary' : 'slate'} size={14} weight="semibold" />
      <Text
        variant="body"
        color={active ? 'primary' : 'slate'}
        style={{ fontFamily: fontFamilies.bold }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
