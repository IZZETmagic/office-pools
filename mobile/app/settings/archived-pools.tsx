// Archived pools (migration 040). Filed under Settings on purpose: an archived
// pool is the exception, not something anyone should be browsing daily.
//
// Every member sees this, not just admins — a pool vanishing for fourteen
// people with no explanation is exactly what the archive replaced. Only an
// admin gets Restore (Ryan's call 2026-07-30).

import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SettingsHeader } from '@/components/settings';
import { Icon, Text } from '@/components/ui';
import { restorePool } from '@/lib/api';
import { useHomeData } from '@/lib/HomeDataProvider';
import { useArchivedPools, type ArchivedPoolRow } from '@/lib/useArchivedPools';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

export default function ArchivedPoolsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { refresh: refreshHomeData } = useHomeData();
  const { rows, loading, reload } = useArchivedPools();
  const [restoringId, setRestoringId] = useState<string | null>(null);

  async function handleRestore(row: ArchivedPoolRow) {
    setRestoringId(row.poolId);
    try {
      await restorePool(row.poolId);
      void refreshHomeData();
      await reload();
    } catch (err) {
      Alert.alert("Couldn't restore", err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <SettingsHeader title="Archived Pools" />
      <ScrollView
        contentContainerStyle={{
          paddingTop: theme.spacing.md,
          paddingHorizontal: theme.spacing.xl,
          paddingBottom: theme.spacing.xxl + insets.bottom,
          gap: theme.spacing.md,
        }}
      >
        {loading ? (
          <View style={{ paddingVertical: theme.spacing.xxl, alignItems: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : rows && rows.length > 0 ? (
          <>
            <Text variant="caption" style={{ color: theme.colors.slate }}>
              Everything in these is kept, but they&apos;re read-only and don&apos;t count toward your
              trophies or stats until an admin restores them.
            </Text>

            {rows.map((row) => (
              <ArchivedPoolCard
                key={row.poolId}
                row={row}
                restoring={restoringId === row.poolId}
                onRestore={() => void handleRestore(row)}
              />
            ))}
          </>
        ) : (
          <EmptyState />
        )}
      </ScrollView>
    </View>
  );
}

function ArchivedPoolCard({
  row,
  restoring,
  onRestore,
}: {
  row: ArchivedPoolRow;
  restoring: boolean;
  onRestore: () => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.md,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.lg,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text variant="body" numberOfLines={1} style={{ fontFamily: fontFamilies.semibold }}>
          {row.poolName}
        </Text>
        <Text variant="caption" style={{ color: theme.colors.slate }}>
          Archived
          {row.archivedByName ? ` by ${row.archivedByName}` : ''} on{' '}
          {new Date(row.archivedAt).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </Text>
      </View>

      {row.role === 'admin' ? (
        <Pressable
          onPress={onRestore}
          disabled={restoring}
          style={({ pressed }) => ({
            paddingHorizontal: theme.spacing.md,
            paddingVertical: theme.spacing.sm,
            borderRadius: theme.radii.md,
            backgroundColor: theme.colors.primary,
            opacity: restoring ? 0.45 : pressed ? 0.7 : 1,
          })}
        >
          <Text variant="caption" style={{ color: '#fff', fontFamily: fontFamilies.semibold }}>
            {restoring ? 'Restoring…' : 'Restore'}
          </Text>
        </Pressable>
      ) : (
        <Text variant="caption" style={{ color: theme.colors.slate }}>
          Admin can restore
        </Text>
      )}
    </View>
  );
}

// As an inline profile section this rendered nothing when empty. As its own
// page it needs to say why it's empty — a blank screen reads as a failure.
function EmptyState() {
  const theme = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.xxl,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
      }}
    >
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: withOpacity(theme.colors.primary, 0.08),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon
          name="archivebox.fill"
          tint={withOpacity(theme.colors.primary, 0.4)}
          size={26}
          weight="regular"
        />
      </View>
      <Text variant="body" style={{ fontFamily: fontFamilies.bold }}>
        Nothing archived
      </Text>
      <Text
        variant="caption"
        style={{
          color: theme.colors.slate,
          textAlign: 'center',
          paddingHorizontal: theme.spacing.xxl,
        }}
      >
        When an admin archives a pool it moves here. Everything in it is kept, and an admin can
        restore it at any time.
      </Text>
    </View>
  );
}
