// Blocked members (158). Where a block is undone. Blocking happens from a
// message's long-press menu in Banter; this lists everyone you've blocked,
// across every pool, with an Unblock beside each.
//
// The people listed are never told they were blocked, and unblocking doesn't
// tell them either.

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SettingsHeader } from '@/components/settings';
import { Text, Pressable } from '@/components/ui';
import { fetchBlockedMembers, unblockMember, type BlockedMember } from '@/lib/moderation';
import { fontFamilies, useTheme } from '@/theme';

export default function BlockedMembersScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<BlockedMember[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setRows(await fetchBlockedMembers());
    } catch (err) {
      console.warn('[BlockedMembers] load failed', err);
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function handleUnblock(row: BlockedMember) {
    setBusyId(row.userId);
    try {
      await unblockMember(row.userId);
      setRows((prev) => (prev ?? []).filter((r) => r.userId !== row.userId));
    } catch {
      Alert.alert("Couldn't unblock", 'Please try again.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <SettingsHeader title="Blocked Members" />
      <ScrollView
        contentContainerStyle={{
          paddingTop: theme.spacing.md,
          paddingHorizontal: theme.spacing.xl,
          paddingBottom: theme.spacing.xxl + insets.bottom,
          gap: theme.spacing.md,
        }}
      >
        <Text variant="caption" style={{ color: theme.colors.slate }}>
          You don&apos;t see messages or get notifications from people you&apos;ve blocked, in any pool.
          They aren&apos;t told, and they aren&apos;t told if you unblock them.
        </Text>

        {rows === null ? (
          <View style={{ paddingVertical: theme.spacing.xxl, alignItems: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : rows.length === 0 ? (
          <View
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radii.lg,
              padding: theme.spacing.lg,
            }}
          >
            <Text variant="body" style={{ color: theme.colors.slate }}>
              You haven&apos;t blocked anyone.
            </Text>
          </View>
        ) : (
          rows.map((row) => (
            <View
              key={row.userId}
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
                  {row.fullName || row.username || 'Member'}
                </Text>
                {row.username ? (
                  <Text variant="caption" style={{ color: theme.colors.slate }}>
                    @{row.username}
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => void handleUnblock(row)}
                disabled={busyId === row.userId}
                accessibilityRole="button"
                style={({ pressed }) => ({
                  paddingHorizontal: theme.spacing.md,
                  paddingVertical: theme.spacing.sm,
                  borderRadius: theme.radii.md,
                  backgroundColor: theme.colors.mist,
                  opacity: busyId === row.userId ? 0.45 : pressed ? 0.7 : 1,
                })}
              >
                <Text variant="caption" style={{ color: theme.colors.ink, fontFamily: fontFamilies.semibold }}>
                  {busyId === row.userId ? 'Unblocking…' : 'Unblock'}
                </Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
