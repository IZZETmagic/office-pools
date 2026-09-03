import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text as RNText,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TableBreakdownList } from './TableBreakdownList';
import { Icon, Text } from '@/components/ui';
import { fetchTablePrediction } from '@/lib/api';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// SOMEBODY ELSE'S TABLE, AND HOW IT IS SCORING
// =============================================================
// Table mode had no transparency on the phone: you could see your own ordering
// and the leaderboard total, and nothing in between. In a mode whose entire
// content is one ordered list, "you are 4th with 820" with no way to see why is
// the product asking to be trusted rather than showing its work.
//
// ## Who may see what is decided in the DATABASE
//
// RLS on `league_table_predictions` (078, tightened by 104): your own always,
// everybody else's only once `league_table_lock_at` has passed — and since 104
// that lock check is on the ADMIN policy too, so an admin who also plays cannot
// read rivals' tables while the window is open. Verified against
// `pg_policies` on 2026-09-03 rather than taken from the web component's
// comment, which predates 104 and still says the admin policy has no lock.
//
// This screen refuses before the lock as well. Not because RLS would allow it —
// it would not — but because a sheet that opens and then reports nothing is a
// worse answer than one that says why. RLS protects the data; this protects the
// explanation.
//
// ## It computes nothing
//
// Per-club points, deltas and the total come from `/table-prediction`, the same
// call the table screen makes, rendered by the same `TableBreakdownList`. Two
// copies of a scoring breakdown is how the screen a member checks and the screen
// they compare against start disagreeing.
// =============================================================

export type TableEntrySheetTarget = {
  entryId: string;
  /** Shown in the title, and as the first column heading on a rival's table. */
  displayName: string;
  isOwnEntry: boolean;
};

type Props = {
  poolId: string;
  /** Null closes the sheet. Set it to open on that entry. */
  target: TableEntrySheetTarget | null;
  /** Has the pool's table deadline passed? Gates a rival's table entirely. */
  isLocked: boolean;
  onClose: () => void;
};

export function TableEntrySheet({ poolId, target, isLocked, onClose }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const screenHeight = Dimensions.get('window').height;

  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(screenHeight)).current;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (target) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(backdropOpacity, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.timing(translateY, { toValue: screenHeight, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  // ⚠ Nothing is fetched for a rival before the lock. The request would very
  // likely be refused by RLS, and an empty result reads as "they predicted
  // nothing" rather than "not yet".
  const mayView = !!target && (target.isOwnEntry || isLocked);

  const query = useQuery({
    // Same key the tab uses, so opening your own from here is a cache hit.
    queryKey: ['table-prediction', poolId, target?.entryId ?? null],
    queryFn: () => fetchTablePrediction(poolId, target!.entryId),
    enabled: mayView,
  });

  if (!mounted || !target) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          opacity: backdropOpacity,
        }}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
      </Animated.View>

      <Animated.View
        style={{
          position: 'absolute',
          left: 0, right: 0, bottom: 0,
          backgroundColor: theme.colors.snow,
          borderTopLeftRadius: theme.radii.xl,
          borderTopRightRadius: theme.radii.xl,
          transform: [{ translateY }],
          paddingBottom: insets.bottom + theme.spacing.sm,
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
          <RNText style={{ flex: 1, fontFamily: fontFamilies.bold, fontSize: 17, color: theme.colors.ink }}>
            {target.isOwnEntry ? 'Your table' : `${target.displayName}’s table`}
          </RNText>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={({ pressed }) => ({
              width: 32, height: 32, borderRadius: 16,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: withOpacity(theme.colors.ink, pressed ? 0.12 : 0.06),
            })}
          >
            <Icon name="xmark" color="slate" size={13} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: theme.spacing.lg,
            paddingBottom: theme.spacing.xl,
          }}
        >
          <Body
            mayView={mayView}
            displayName={target.displayName}
            isOwnEntry={target.isOwnEntry}
            query={query}
          />
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

function Body({
  mayView,
  displayName,
  isOwnEntry,
  query,
}: {
  mayView: boolean;
  displayName: string;
  isOwnEntry: boolean;
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof fetchTablePrediction>>>>;
}) {
  const theme = useTheme();

  if (!mayView) {
    return (
      <Empty
        icon="lock.fill"
        title="Hidden until the deadline"
        caption="Everyone’s table opens up the moment picking closes. Until then the only one you can see is your own — including if you run the pool."
      />
    );
  }
  if (query.isPending) {
    return (
      <View style={{ paddingVertical: theme.spacing.xxxl, alignItems: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }
  if (query.isError) {
    return (
      <Text variant="body" color="red" align="center" style={{ paddingVertical: theme.spacing.xl }}>
        {query.error instanceof Error ? query.error.message : 'That table could not be loaded.'}
      </Text>
    );
  }

  const { breakdown, settings, summary } = query.data;
  if (breakdown.length === 0) {
    return (
      <Empty
        icon="lock.fill"
        title={isOwnEntry ? 'You didn’t predict the table' : `${displayName} didn’t predict the table`}
        caption="It scores nothing, and everything else in the pool counts as normal."
      />
    );
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing.md,
          padding: theme.spacing.lg,
          borderRadius: theme.radii.lg,
          backgroundColor: theme.colors.surface,
          ...theme.shadows.card,
        }}
      >
        <View style={{ flexShrink: 1 }}>
          <RNText
            style={{
              fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
              fontSize: 24,
              fontWeight: '900',
              color: theme.colors.primary,
            }}
          >
            {summary.total.toLocaleString()}
          </RNText>
          <Text variant="detail" color="slate">
            points from this table · {summary.exact} exactly right
          </Text>
        </View>
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: theme.radii.pill,
            backgroundColor: withOpacity(
              summary.isFinal ? theme.colors.green : theme.colors.slate,
              0.15,
            ),
          }}
        >
          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 10,
              letterSpacing: 0.4,
              color: summary.isFinal ? theme.colors.green : theme.colors.slate,
            }}
          >
            {summary.isFinal ? 'Final' : 'Provisional'}
          </RNText>
        </View>
      </View>

      {/* ⚠ Without this the sheet contradicts the leaderboard. The per-club
          points below are only the POSITIONAL half; the band bonuses are the
          rest, and they are most of a good table's score. */}
      {summary.lines.length > 0 ? (
        <View
          style={{
            borderRadius: theme.radii.lg,
            backgroundColor: theme.colors.surface,
            overflow: 'hidden',
            ...theme.shadows.card,
          }}
        >
          <View style={{ paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm, backgroundColor: theme.colors.mist }}>
            <Text variant="caption" color="slate">How the total is made up</Text>
          </View>
          <Line label="Points from where each club was put" points={summary.positional} />
          {summary.lines.map((l) => (
            <Line key={l.label} label={l.label} points={l.points} />
          ))}
        </View>
      ) : null}

      <TableBreakdownList rows={breakdown} settings={settings} summary={summary} />
    </View>
  );
}

function Line({ label, points }: { label: string; points: number }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.md,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        borderTopWidth: 1,
        borderTopColor: theme.colors.mist,
      }}
    >
      <Text variant="body" color="slate" style={{ flexShrink: 1 }}>{label}</Text>
      <RNText
        style={{
          fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
          fontSize: 13,
          fontWeight: '700',
          color: theme.colors.ink,
        }}
      >
        +{points.toLocaleString()}
      </RNText>
    </View>
  );
}

function Empty({ icon, title, caption }: { icon: string; title: string; caption: string }) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: theme.spacing.sm, paddingVertical: theme.spacing.hero }}>
      <Icon name={icon as never} color="silver" size={30} />
      <Text variant="cardTitle" align="center">{title}</Text>
      <Text variant="detail" color="slate" align="center" style={{ maxWidth: 280 }}>
        {caption}
      </Text>
    </View>
  );
}
