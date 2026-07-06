import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text as RNText,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AdjustPointsSheet,
  type AdjustPointsSheetHandle,
} from '@/components/pool-detail/AdjustPointsSheet';
import { Icon, Text } from '@/components/ui';
import { deleteEntry, notifyMemberRemoved } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { useMemberDetail, type MemberDetail, type MemberEntry } from '@/lib/useMemberDetail';
import { usePoolDetail } from '@/lib/usePoolDetail';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

export default function MemberDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id, memberId } = useLocalSearchParams<{ id: string; memberId: string }>();
  const { member, loading, refresh } = useMemberDetail(memberId);
  const { data: poolData } = usePoolDetail(id);
  const currentUserIsAdmin = poolData?.pool.isAdmin ?? false;
  const [busy, setBusy] = useState(false);
  const [unlockedEntryIds, setUnlockedEntryIds] = useState<Set<string>>(new Set());
  const adjustSheetRef = useRef<AdjustPointsSheetHandle>(null);

  function handleUnlockEntry(entry: MemberEntry) {
    if (!member) return;
    Alert.alert(
      'Unlock Entry',
      `Unlock ${entry.entryName} so ${member.fullName} can edit their predictions again?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unlock',
          style: 'destructive',
          onPress: async () => {
            // Optimistic update — hide the Unlock button right away.
            setUnlockedEntryIds((prev) => {
              const next = new Set(prev);
              next.add(entry.entryId);
              return next;
            });
            try {
              const { error } = await supabase
                .from('pool_entries')
                .update({
                  has_submitted_predictions: false,
                  predictions_submitted_at: null,
                })
                .eq('entry_id', entry.entryId);
              if (error) throw error;
              await refresh();
            } catch (err) {
              setUnlockedEntryIds((prev) => {
                const next = new Set(prev);
                next.delete(entry.entryId);
                return next;
              });
              Alert.alert(
                "Couldn't unlock entry",
                err instanceof Error ? err.message : 'Unknown error',
              );
            }
          },
        },
      ],
    );
  }

  function handleDeleteEntry(entry: MemberEntry) {
    if (!member || !id) return;
    const isLast = member.entries.length <= 1;
    if (!member.isAdmin && isLast) {
      // Mirrors the server-side guard — non-admins must keep ≥1 entry.
      // The UI hides the button in this case; this is a defensive
      // fallback if state races us.
      Alert.alert(
        "Can't delete last entry",
        `Players need at least one entry. To take ${member.fullName} out of the pool, use Remove Member.`,
      );
      return;
    }
    Alert.alert(
      'Delete entry',
      `Delete "${entry.entryName}"? This removes the entry, its predictions, and its scores. This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await deleteEntry(id, entry.entryId);
              await refresh();
            } catch (err) {
              Alert.alert(
                "Couldn't delete entry",
                err instanceof Error ? err.message : 'Unknown error',
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  async function handleToggleRole() {
    if (!member) return;
    const nextRole = member.isAdmin ? 'player' : 'admin';
    setBusy(true);
    try {
      const { error } = await supabase
        .from('pool_members')
        .update({ role: nextRole })
        .eq('member_id', member.memberId);
      if (error) throw error;
      await refresh();
    } catch (err) {
      Alert.alert(
        "Couldn't update role",
        err instanceof Error ? err.message : 'Unknown error',
      );
    } finally {
      setBusy(false);
    }
  }

  function handleRemove() {
    if (!member) return;
    Alert.alert(
      'Remove Member',
      `Remove ${member.fullName} from the pool? Their predictions will be deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const { error } = await supabase
                .from('pool_members')
                .delete()
                .eq('member_id', member.memberId);
              if (error) throw error;
              // Best-effort: tell the server to email + push the removed
              // user. Fire-and-forget so a slow / failing notification
              // doesn't block the admin's UI return — the actual removal
              // is the source of truth and is already committed.
              if (id) {
                void notifyMemberRemoved(id, member.userId).catch((err) => {
                  console.warn('[notifyMemberRemoved]', err);
                });
              }
              router.back();
            } catch (err) {
              Alert.alert(
                "Couldn't remove member",
                err instanceof Error ? err.message : 'Unknown error',
              );
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  if (loading && !member) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
        <Header insetTop={insets.top} title="" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </View>
    );
  }

  if (!member) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
        <Header insetTop={insets.top} title="Member" />
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.xl,
          }}
        >
          <Text variant="cardTitle" align="center">
            Member not found
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <Header insetTop={insets.top} title={member.fullName} />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.xxxl,
          gap: theme.spacing.lg,
        }}
      >
        <ProfileCard member={member} />
        <DetailsCard member={member} />
        {member.entries.length > 0 ? (
          <EntriesCard
            entries={member.entries}
            poolId={id}
            currentUserIsAdmin={currentUserIsAdmin}
            targetIsAdmin={member.isAdmin}
            unlockedEntryIds={unlockedEntryIds}
            onAdjustPoints={(entry) =>
              adjustSheetRef.current?.open({
                entryId: entry.entryId,
                entryName: entry.entryName,
                currentAdjustment: entry.pointAdjustment,
              })
            }
            onUnlockEntry={handleUnlockEntry}
            onDeleteEntry={handleDeleteEntry}
          />
        ) : null}
        {currentUserIsAdmin && poolData?.pool.currentUserId !== member.userId ? (
          <AdminActionsCard
            member={member}
            busy={busy}
            onToggleRole={handleToggleRole}
            onRemove={handleRemove}
          />
        ) : null}
      </ScrollView>

      <AdjustPointsSheet
        ref={adjustSheetRef}
        poolId={id}
        adminUserId={poolData?.pool.currentUserId ?? null}
        onAdjusted={() => {
          void refresh();
        }}
      />
    </View>
  );
}

function Header({ insetTop, title }: { insetTop: number; title: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        paddingTop: insetTop + theme.spacing.sm,
        paddingBottom: theme.spacing.sm,
        backgroundColor: theme.colors.snow,
      }}
    >
      <Pressable
        onPress={() => router.back()}
        hitSlop={12}
        style={({ pressed }) => ({
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: withOpacity(theme.colors.ink, 0.06),
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Icon name="chevron.left" size={16} tint={theme.colors.ink} weight="semibold" />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text variant="cardTitle" numberOfLines={1}>
          {title}
        </Text>
      </View>
    </View>
  );
}

function ProfileCard({ member }: { member: MemberDetail }) {
  const theme = useTheme();
  const initial = (member.fullName || member.username || '?').slice(0, 1).toUpperCase();
  const bg = member.isAdmin
    ? withOpacity(theme.colors.slate, 0.15)
    : withOpacity(theme.colors.primary, 0.12);
  const fg = member.isAdmin ? theme.colors.slate : theme.colors.primary;
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        ...theme.shadows.card,
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 22,
            color: fg,
          }}
        >
          {initial}
        </RNText>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="sectionHeader" numberOfLines={1}>
            {member.fullName}
          </Text>
          {member.isAdmin ? (
            <View
              style={{
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: theme.radii.pill,
                backgroundColor: withOpacity(theme.colors.slate, 0.15),
              }}
            >
              <RNText
                style={{
                  fontFamily: fontFamilies.bold,
                  fontSize: 9,
                  color: theme.colors.slate,
                  letterSpacing: 0.5,
                }}
              >
                ADMIN
              </RNText>
            </View>
          ) : null}
        </View>
        <RNText
          style={{
            fontFamily: fontFamilies.medium,
            fontSize: 13,
            color: theme.colors.slate,
          }}
          numberOfLines={1}
        >
          @{member.username}
        </RNText>
      </View>
    </View>
  );
}

function DetailsCard({ member }: { member: MemberDetail }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.lg,
        gap: 10,
        ...theme.shadows.card,
      }}
    >
      <SectionTitle title="Details" />
      <InfoRow label="Role" value={member.isAdmin ? 'Admin' : 'Player'} />
      <InfoRow label="Joined" value={formatShortDate(member.joinedAt)} />
      <InfoRow label="Entries" value={`${member.entries.length}`} />
    </View>
  );
}

function EntriesCard({
  entries,
  poolId,
  currentUserIsAdmin,
  targetIsAdmin,
  unlockedEntryIds,
  onAdjustPoints,
  onUnlockEntry,
  onDeleteEntry,
}: {
  entries: MemberEntry[];
  poolId: string;
  currentUserIsAdmin: boolean;
  targetIsAdmin: boolean;
  unlockedEntryIds: Set<string>;
  onAdjustPoints: (entry: MemberEntry) => void;
  onUnlockEntry: (entry: MemberEntry) => void;
  onDeleteEntry: (entry: MemberEntry) => void;
}) {
  const theme = useTheme();
  // Hide the Delete button on a non-admin's sole entry — players must
  // keep at least one. Pool admins can be emptied to zero.
  const canDeleteAny = targetIsAdmin || entries.length > 1;
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.lg,
        gap: 10,
        ...theme.shadows.card,
      }}
    >
      <SectionTitle title="Entries" />
      {entries.map((entry, i) => (
        <View key={entry.entryId}>
          {i > 0 ? (
            <View
              style={{
                height: 0.5,
                backgroundColor: withOpacity(theme.colors.silver, 0.5),
                marginVertical: 8,
              }}
            />
          ) : null}
          <EntryRow
            entry={entry}
            poolId={poolId}
            currentUserIsAdmin={currentUserIsAdmin}
            canDelete={canDeleteAny}
            optimisticallyUnlocked={unlockedEntryIds.has(entry.entryId)}
            onAdjustPoints={() => onAdjustPoints(entry)}
            onUnlock={() => onUnlockEntry(entry)}
            onDelete={() => onDeleteEntry(entry)}
          />
        </View>
      ))}
    </View>
  );
}

function EntryRow({
  entry,
  poolId,
  currentUserIsAdmin,
  canDelete,
  optimisticallyUnlocked,
  onAdjustPoints,
  onUnlock,
  onDelete,
}: {
  entry: MemberEntry;
  poolId: string;
  currentUserIsAdmin: boolean;
  canDelete: boolean;
  optimisticallyUnlocked: boolean;
  onAdjustPoints: () => void;
  onUnlock: () => void;
  onDelete: () => void;
}) {
  const theme = useTheme();
  const effectivelySubmitted = entry.hasSubmittedPredictions && !optimisticallyUnlocked;

  function viewAsAdmin() {
    router.push(`/pool/${poolId}/entry/${entry.entryId}?viewAs=admin`);
  }

  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <RNText
          style={{
            flex: 1,
            fontFamily: fontFamilies.semibold,
            fontSize: 14,
            color: theme.colors.ink,
          }}
          numberOfLines={1}
        >
          {entry.entryName}
        </RNText>
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 14,
            color: theme.colors.ink,
            fontVariant: ['tabular-nums'],
          }}
        >
          {entry.totalPoints.toLocaleString()} pts
        </RNText>
        <StatusPill
          label={effectivelySubmitted ? 'Submitted' : 'Pending'}
          color={effectivelySubmitted ? theme.colors.green : theme.colors.silver}
        />
      </View>
      {effectivelySubmitted && entry.predictionsSubmittedAt ? (
        <RNText
          style={{
            fontFamily: fontFamilies.regular,
            fontSize: 11,
            color: theme.colors.slate,
            textAlign: 'right',
          }}
        >
          Submitted {formatShortDate(entry.predictionsSubmittedAt)}
        </RNText>
      ) : null}
      {currentUserIsAdmin ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: theme.spacing.xs,
            marginTop: 4,
          }}
        >
          <AdminEntryAction
            label="View"
            iconIos="eye.fill"
            iconEmoji="👁"
            color={theme.colors.primary}
            onPress={viewAsAdmin}
          />
          <AdminEntryAction
            label="Adjust points"
            iconIos="plus.forwardslash.minus"
            iconEmoji="±"
            color={theme.colors.amber}
            onPress={onAdjustPoints}
          />
          {effectivelySubmitted ? (
            <AdminEntryAction
              label="Unlock"
              iconIos="lock.open.fill"
              iconEmoji="🔓"
              color={theme.colors.red}
              onPress={onUnlock}
            />
          ) : null}
          {canDelete ? (
            <AdminEntryAction
              label="Delete"
              iconIos="trash.fill"
              iconEmoji="🗑️"
              color={theme.colors.red}
              onPress={onDelete}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function AdminEntryAction({
  label,
  iconIos,
  iconEmoji,
  color,
  onPress,
}: {
  label: string;
  iconIos: string;
  iconEmoji: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 8,
        borderRadius: 12,
        backgroundColor: withOpacity(color, 0.08),
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon name={iconIos} size={12} tint={color} weight="semibold" />
      <RNText
        style={{
          fontFamily: fontFamilies.semibold,
          fontSize: 12,
          color,
        }}
      >
        {label}
      </RNText>
    </Pressable>
  );
}

function StatusPill({ label, color }: { label: string; color: string }) {
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
        backgroundColor: withOpacity(color, 0.15),
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 10,
          color,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </RNText>
    </View>
  );
}

function AdminActionsCard({
  member,
  busy,
  onToggleRole,
  onRemove,
}: {
  member: MemberDetail;
  busy: boolean;
  onToggleRole: () => void;
  onRemove: () => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.lg,
        gap: 10,
        ...theme.shadows.card,
      }}
    >
      <SectionTitle title="Admin Actions" />
      <ActionRow
        title={member.isAdmin ? 'Demote to Player' : 'Make Admin'}
        subtitle={
          member.isAdmin
            ? "Remove admin privileges. They'll still keep their entries."
            : 'Grant admin tools for managing the pool.'
        }
        iosIcon={member.isAdmin ? 'person.crop.circle.badge.minus' : 'person.crop.circle.badge.plus'}
        emoji={member.isAdmin ? '👤' : '👑'}
        color={member.isAdmin ? theme.colors.slate : theme.colors.primary}
        onPress={onToggleRole}
        disabled={busy}
      />
      <ActionRow
        title="Remove Member"
        subtitle="Deletes their entries and predictions. Cannot be undone."
        iosIcon="person.crop.circle.badge.xmark"
        emoji="🗑️"
        color={theme.colors.red}
        onPress={onRemove}
        disabled={busy}
      />
    </View>
  );
}

function ActionRow({
  title,
  subtitle,
  iosIcon,
  emoji,
  color,
  onPress,
  disabled,
}: {
  title: string;
  subtitle: string;
  iosIcon: string;
  emoji: string;
  color: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      <Icon name={iosIcon} size={18} tint={color} weight="semibold" />
      <View style={{ flex: 1, gap: 2 }}>
        <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 14, color }}>{title}</RNText>
        <RNText
          style={{
            fontFamily: fontFamilies.regular,
            fontSize: 11,
            color: theme.colors.slate,
          }}
        >
          {subtitle}
        </RNText>
      </View>
      <Icon name="chevron.right" size={11} tint={theme.colors.slate} weight="semibold" />
    </Pressable>
  );
}

function SectionTitle({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <Text variant="sectionHeader">{title}</Text>
      <View
        style={{
          height: 0.5,
          backgroundColor: withOpacity(theme.colors.silver, 0.6),
        }}
      />
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 4,
      }}
    >
      <Text variant="body" color="slate" style={{ flex: 1 }}>
        {label}
      </Text>
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 14,
          color: theme.colors.ink,
        }}
      >
        {value}
      </RNText>
    </View>
  );
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}
