// Port of ios/OfficePools/Views/Activity/ActivityView.swift.
// Profile button intentionally omitted — profile UI is a separate task.

import { useRef } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActivityCard } from '@/components/activity';
import {
  JoinPoolSheet,
  type JoinPoolSheetHandle,
  PoolCreateJoinSheet,
  type PoolCreateJoinSheetHandle,
  PoolsHeader,
} from '@/components/pools';
import { Button, Icon, Text } from '@/components/ui';
import { useSharedActivity } from '@/lib/ActivityProvider';
import { useManualRefresh } from '@/lib/useManualRefresh';
import { fontFamilies, useTheme } from '@/theme';

export default function ActivityScreen() {
  const theme = useTheme();
  const { items, loading, error, refresh } = useSharedActivity();
  // Pull-to-refresh: spinner bound to real user gesture only.
  const { refreshing, onRefresh } = useManualRefresh(refresh);
  // Create / Join pool sheets — opened by the "+" button in the header.
  // Same pattern as the Home and Pools tabs so the user can create or
  // join a pool from any primary tab.
  const createJoinSheetRef = useRef<PoolCreateJoinSheetHandle | null>(null);
  const joinPoolSheetRef = useRef<JoinPoolSheetHandle | null>(null);

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={{ flex: 1, backgroundColor: theme.colors.snow }}
    >
      <PoolsHeader
        titlePrefix="Your"
        titleAccent="Feed"
        subtitle="Don't miss a beat"
        onMenuPress={() => createJoinSheetRef.current?.open()}
      />

      {loading && items.length === 0 ? (
        <SkeletonState />
      ) : error && items.length === 0 ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: theme.spacing.xl,
            paddingTop: theme.spacing.sm,
            paddingBottom: theme.spacing.xxxl,
            gap: theme.spacing.sm + 2,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
            />
          }
        >
          {items.map((item) => (
            <ActivityCard key={item.activityId} item={item} />
          ))}
        </ScrollView>
      )}

      <PoolCreateJoinSheet
        ref={createJoinSheetRef}
        onJoinPress={() => {
          setTimeout(() => joinPoolSheetRef.current?.open(), 250);
        }}
      />
      <JoinPoolSheet ref={joinPoolSheetRef} />
    </SafeAreaView>
  );
}

function SkeletonState() {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={theme.colors.primary} />
    </View>
  );
}

function EmptyState() {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: theme.spacing.xxl,
        gap: theme.spacing.md,
      }}
    >
      <Icon name="bell.slash" tint={theme.colors.mist} size={40} weight="regular" />
      <Text variant="cardTitle">No Activity Yet</Text>
      <RNText
        style={{
          fontFamily: fontFamilies.regular,
          fontSize: 14,
          color: theme.colors.slate,
          textAlign: 'center',
          paddingHorizontal: theme.spacing.xxl,
        }}
      >
        Your feed will light up as you play — predictions, rank changes, badges, and more.
      </RNText>
    </View>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: theme.spacing.xxl,
        gap: theme.spacing.md,
      }}
    >
      <Icon name="exclamationmark.triangle" tint={theme.colors.mist} size={40} weight="regular" />
      <Text variant="cardTitle">Unable to Load</Text>
      <RNText
        style={{
          fontFamily: fontFamilies.regular,
          fontSize: 14,
          color: theme.colors.slate,
          textAlign: 'center',
          paddingHorizontal: theme.spacing.xxl,
        }}
      >
        {message}
      </RNText>
      <Button title="Try Again" onPress={onRetry} />
    </View>
  );
}
