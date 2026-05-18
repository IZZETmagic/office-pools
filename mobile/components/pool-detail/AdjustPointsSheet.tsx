import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text as RNText,
  TextInput,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

export type AdjustPointsSheetHandle = {
  open: (target: {
    entryId: string;
    entryName: string;
    currentAdjustment: number;
  }) => void;
  close: () => void;
};

type Props = {
  poolId: string;
  adminUserId: string | null;
  /** Called after a successful adjustment so the caller can refresh data. */
  onAdjusted?: () => void;
};

export const AdjustPointsSheet = forwardRef<AdjustPointsSheetHandle, Props>(
  function AdjustPointsSheet({ poolId, adminUserId, onAdjusted }, ref) {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const [visible, setVisible] = useState(false);
    const [target, setTarget] = useState<{
      entryId: string;
      entryName: string;
      currentAdjustment: number;
    } | null>(null);
    const [delta, setDelta] = useState('');
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const screenHeight = Dimensions.get('window').height;
    const backdropOpacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(screenHeight)).current;

    useImperativeHandle(ref, () => ({
      open: (t) => {
        setTarget(t);
        setDelta('');
        setReason('');
        setError(null);
        setVisible(true);
      },
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

    async function handleSave() {
      if (!target || !adminUserId) return;
      const amount = parseInt(delta, 10);
      if (Number.isNaN(amount) || amount === 0) {
        setError('Enter a non-zero point amount.');
        return;
      }
      const trimmedReason = reason.trim();
      if (trimmedReason.length === 0) {
        setError('A reason is required.');
        return;
      }

      setSaving(true);
      setError(null);
      try {
        // 1. Insert the ledger row.
        const { error: insertErr } = await supabase
          .from('point_adjustments')
          .insert({
            entry_id: target.entryId,
            pool_id: poolId,
            amount,
            reason: trimmedReason,
            created_by: adminUserId,
          });
        if (insertErr) throw insertErr;

        // 2. Recompute the running total from the ledger.
        const { data: ledger, error: fetchErr } = await supabase
          .from('point_adjustments')
          .select('amount')
          .eq('entry_id', target.entryId);
        if (fetchErr) throw fetchErr;
        const total = (ledger ?? []).reduce(
          (s: number, r: { amount: number }) => s + r.amount,
          0,
        );

        // 3. Mirror the running total + reason onto the entry row.
        const { error: updateErr } = await supabase
          .from('pool_entries')
          .update({
            point_adjustment: total,
            adjustment_reason: trimmedReason,
          })
          .eq('entry_id', target.entryId);
        if (updateErr) throw updateErr;

        // 4. Re-rank the pool. Best-effort; surface error if it fails.
        const { error: rpcErr } = await supabase.rpc('lite_recalc_entry', {
          p_entry_id: target.entryId,
          p_pool_id: poolId,
        });
        if (rpcErr) {
          // Don't block — the adjustment landed, just the rank may be stale.
          console.warn('[AdjustPointsSheet] lite_recalc_entry failed', rpcErr);
        }

        onAdjusted?.();
        animateOut();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed');
      } finally {
        setSaving(false);
      }
    }

    if (!target) {
      return (
        <Modal
          visible={visible}
          transparent
          animationType="none"
          onRequestClose={animateOut}
        />
      );
    }

    const newTotalAdj = (() => {
      const parsed = parseInt(delta, 10);
      if (Number.isNaN(parsed)) return target.currentAdjustment;
      return target.currentAdjustment + parsed;
    })();
    const positive = (parseInt(delta, 10) || 0) > 0;
    const negative = (parseInt(delta, 10) || 0) < 0;

    return (
      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={animateOut}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <Animated.View
            style={{
              ...StyleSheet.absoluteFillObject,
              backgroundColor: '#000000',
              opacity: backdropOpacity.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 0.4],
              }),
            }}
          >
            <Pressable style={{ flex: 1 }} onPress={animateOut} />
          </Animated.View>
          <Animated.View
            style={{
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: theme.radii.xl,
              borderTopRightRadius: theme.radii.xl,
              paddingTop: theme.spacing.md,
              paddingHorizontal: theme.spacing.lg,
              paddingBottom: insets.bottom + theme.spacing.lg,
              gap: theme.spacing.md,
              transform: [{ translateY }],
            }}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <View style={{ flex: 1 }}>
                <RNText
                  style={{
                    fontFamily: fontFamilies.bold,
                    fontSize: 18,
                    color: theme.colors.ink,
                  }}
                >
                  Adjust Points
                </RNText>
                <RNText
                  style={{
                    fontFamily: fontFamilies.regular,
                    fontSize: 12,
                    color: theme.colors.slate,
                    marginTop: 2,
                  }}
                  numberOfLines={1}
                >
                  {target.entryName} · current adj.{' '}
                  {target.currentAdjustment >= 0 ? '+' : ''}
                  {target.currentAdjustment}
                </RNText>
              </View>
              <Pressable
                onPress={animateOut}
                hitSlop={theme.spacing.md}
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
                <Icon name="xmark" size={12} tint={theme.colors.ink} weight="semibold" />
              </Pressable>
            </View>

            {/* Delta input */}
            <View style={{ gap: theme.spacing.xs }}>
              <RNText
                style={{
                  fontFamily: fontFamilies.semibold,
                  fontSize: 11,
                  letterSpacing: 0.6,
                  color: theme.colors.slate,
                  textTransform: 'uppercase',
                }}
              >
                Points change
              </RNText>
              <TextInput
                value={delta}
                onChangeText={(t) => {
                  // Allow optional leading minus and digits only.
                  const cleaned = t.replace(/[^0-9-]/g, '').replace(/(?!^)-/g, '');
                  setDelta(cleaned);
                }}
                keyboardType="numbers-and-punctuation"
                placeholder="e.g. -50 or 25"
                placeholderTextColor={theme.colors.silver}
                style={{
                  fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
                  fontSize: 24,
                  fontWeight: '800',
                  color: positive
                    ? theme.colors.green
                    : negative
                      ? theme.colors.red
                      : theme.colors.ink,
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.md,
                  borderRadius: theme.radii.md,
                  backgroundColor: theme.colors.mist,
                  borderWidth: theme.borders.standard,
                  borderColor: positive
                    ? withOpacity(theme.colors.green, 0.4)
                    : negative
                      ? withOpacity(theme.colors.red, 0.4)
                      : withOpacity(theme.colors.silver, 0.5),
                }}
              />
              <RNText
                style={{
                  fontFamily: fontFamilies.regular,
                  fontSize: 11,
                  color: theme.colors.slate,
                }}
              >
                Positive numbers add, negative numbers deduct. New total
                adjustment will be{' '}
                <RNText style={{ fontFamily: fontFamilies.semibold, color: theme.colors.ink }}>
                  {newTotalAdj >= 0 ? '+' : ''}
                  {newTotalAdj}
                </RNText>
                .
              </RNText>
            </View>

            {/* Reason input */}
            <View style={{ gap: theme.spacing.xs }}>
              <RNText
                style={{
                  fontFamily: fontFamilies.semibold,
                  fontSize: 11,
                  letterSpacing: 0.6,
                  color: theme.colors.slate,
                  textTransform: 'uppercase',
                }}
              >
                Reason (required)
              </RNText>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="e.g. Late entry penalty, weekly bonus award…"
                placeholderTextColor={theme.colors.silver}
                multiline
                style={{
                  fontFamily: fontFamilies.regular,
                  fontSize: 14,
                  color: theme.colors.ink,
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.sm + theme.spacing.xxs,
                  borderRadius: theme.radii.md,
                  backgroundColor: theme.colors.mist,
                  borderWidth: theme.borders.standard,
                  borderColor: withOpacity(theme.colors.silver, 0.5),
                  minHeight: 80,
                  textAlignVertical: 'top',
                }}
              />
            </View>

            {/* Error */}
            {error ? (
              <RNText
                style={{
                  fontFamily: fontFamilies.semibold,
                  fontSize: 12,
                  color: theme.colors.red,
                }}
              >
                {error}
              </RNText>
            ) : null}

            {/* Save */}
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: theme.spacing.xs,
                paddingVertical: theme.spacing.md,
                borderRadius: theme.radii.md,
                backgroundColor: theme.colors.primary,
                opacity: saving ? 0.6 : pressed ? 0.85 : 1,
                ...theme.shadows.card,
              })}
            >
              {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
              <RNText
                style={{
                  fontFamily: fontFamilies.bold,
                  fontSize: 15,
                  color: '#FFFFFF',
                  letterSpacing: 0.2,
                }}
              >
                {saving ? 'Saving…' : 'Apply adjustment'}
              </RNText>
            </Pressable>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>
    );
  },
);
