// Port of ios/OfficePools/Views/Activity/ActivityView.swift.
// Profile button intentionally omitted — profile UI is a separate task.

import { ActivityIndicator, RefreshControl, ScrollView, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActivityCard } from '@/components/activity';
import { Button, Icon, Text } from '@/components/ui';
import { useActivity } from '@/lib/useActivity';
import { fontFamilies, useTheme } from '@/theme';

export default function ActivityScreen() {
  const theme = useTheme();
  const { items, loading, refreshing, error, refresh } = useActivity();

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={{ flex: 1, backgroundColor: theme.colors.snow }}
    >
      <Header />

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
              onRefresh={refresh}
              tintColor={theme.colors.primary}
            />
          }
        >
          {items.map((item) => (
            <ActivityCard key={item.activityId} item={item} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Header() {
  const theme = useTheme();
  const titleStyle = {
    fontFamily: fontFamilies.black,
    fontSize: 32,
    lineHeight: 36,
  } as const;
  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.xl,
        paddingTop: theme.spacing.xl,
        paddingBottom: theme.spacing.md,
        backgroundColor: theme.colors.snow,
      }}
    >
      <View style={{ flexDirection: 'row' }}>
        <RNText style={[titleStyle, { color: theme.colors.ink }]}>Your</RNText>
        <RNText style={[titleStyle, { color: theme.colors.primary }]}>Feed</RNText>
      </View>
      <Text variant="body" color="slate" style={{ fontFamily: fontFamilies.semibold }}>
        Don&apos;t miss a beat
      </Text>
    </View>
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
