// Read-only "About this pool" tab visible to all members. The home for
// non-admin self-leave; admins also land here for the same Leave Pool
// action (distinct from the admin-only "Stop Participating" in Settings
// — Leave severs the pool_members row entirely and triggers a
// pool_left activity card, Stop Participating just deletes pool_entries
// while preserving admin role).
//
// Sole-admin guard: client-side disable + tooltip when the user is the
// only admin in the pool. Server-side check in /api/pools/[id]/leave
// is still authoritative and surfaces as a ConfirmDialog error if
// somehow bypassed (e.g. another admin demoted between client-render
// and request).

import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';

import { ConfirmDialog, Icon, Text } from '@/components/ui';
import { leavePool } from '@/lib/api';
import { useHomeData } from '@/lib/HomeDataProvider';
import { useMemberRoster } from '@/lib/useMemberRoster';
import type { PoolDetailInfo } from '@/lib/usePoolDetail';
import { fontFamilies, useTheme } from '@/theme';

const MODE_LABEL: Record<string, string> = {
  full_tournament: 'Full Tournament',
  progressive: 'Progressive',
  bracket_picker: 'Bracket Picker',
};

type Props = {
  pool: PoolDetailInfo;
};

export function PoolInfoTab({ pool }: Props) {
  const theme = useTheme();
  const { refresh: refreshHomeData } = useHomeData();

  // Used to compute admin count for the sole-admin gate. useMemberRoster
  // already has a realtime sub on pool_members so the count stays
  // accurate live — if another admin gets demoted while you're sitting
  // here, the Leave Pool row flips to disabled within a frame.
  const { members } = useMemberRoster(pool.poolId);
  const adminCount = members.filter((m) => m.role === 'admin').length;
  const isSoleAdmin = pool.isAdmin && adminCount <= 1;

  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  // Server endpoint enforces the sole-admin rule too; this client gate
  // is purely UX (avoid surfacing a button the user can't use). If the
  // server rejects for any reason, the error surfaces in the same
  // ConfirmDialog chrome.
  async function performLeave() {
    setLeaveBusy(true);
    try {
      await leavePool(pool.poolId);
      // Recalculate so remaining members' ranks settle after the
      // leaver's entries cascade out. Fire-and-forget; the redirect
      // doesn't wait on it.
      void fetch(`/api/pools/${pool.poolId}/recalculate`, { method: 'POST' });
      // Refresh dashboard FIRST so the pool card is already gone by
      // the time we land on the tabs root. Same pattern handleDelete
      // in SettingsTab uses.
      void refreshHomeData();
      router.replace('/(tabs)');
      // No need to close the confirm dialog or surface a success
      // toast — the user is navigated away. The pool_left activity
      // card (fired by the server endpoint via pool_membership_events)
      // is the durable record of the action on their activity feed.
    } catch (err) {
      // PostgrestError-shaped errors don't pass instanceof Error, so
      // probe for .message on a plain object too. Matches the
      // hardened extractor in handleStopParticipating.
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            && typeof (err as { message: unknown }).message === 'string'
            ? (err as { message: string }).message
            : 'Unknown error';
      setShowLeaveConfirm(false);
      setLeaveError(message);
    } finally {
      setLeaveBusy(false);
    }
  }

  // Mode + deadline display helpers
  const modeLabel = pool.predictionMode
    ? MODE_LABEL[pool.predictionMode] ?? pool.predictionMode
    : '—';
  const deadlineLabel = pool.predictionDeadline
    ? formatDeadline(pool.predictionDeadline)
    : 'Not set';

  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.md,
        paddingBottom: theme.spacing.xxxl,
        gap: theme.spacing.lg,
      }}
    >
      <Card>
        <Caption>About</Caption>
        <View style={{ gap: theme.spacing.md }}>
          <Field label="Pool Name" value={pool.poolName} />
          {pool.description ? (
            <Field label="Description" value={pool.description} multiline />
          ) : null}
          <Field label="Prediction Mode" value={modeLabel} />
          <Field
            label="Max Entries per User"
            value={String(pool.maxEntriesPerUser)}
          />
          <Field label="Prediction Deadline" value={deadlineLabel} />
        </View>
      </Card>

      <Card>
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 11,
            color: theme.colors.red,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}
        >
          Danger Zone
        </RNText>
        <LeaveRow
          disabled={isSoleAdmin}
          disabledReason={
            isSoleAdmin
              ? 'Promote another admin or delete the pool to leave'
              : null
          }
          onPress={() => setShowLeaveConfirm(true)}
        />
      </Card>

      <ConfirmDialog
        visible={showLeaveConfirm}
        title="Leave Pool"
        description={`Leave ${pool.poolName}? Your entries, predictions, and standings will be removed, and a "Left ${pool.poolName}" entry will be added to your activity feed.`}
        cancelLabel="Cancel"
        confirmLabel="Leave Pool"
        destructive
        busy={leaveBusy}
        onCancel={() => setShowLeaveConfirm(false)}
        onConfirm={() => void performLeave()}
      />

      <ConfirmDialog
        visible={leaveError !== null}
        title="Couldn't leave pool"
        description={leaveError ?? ''}
        confirmLabel="OK"
        destructive
        onConfirm={() => setLeaveError(null)}
      />
    </View>
  );
}

// --- Helpers ----------------------------------------------------------

function Card({ children }: { children: React.ReactNode }) {
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
      {children}
    </View>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <RNText
      style={{
        fontFamily: fontFamilies.bold,
        fontSize: 11,
        color: theme.colors.slate,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </RNText>
  );
}

function Field({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <RNText
        style={{
          fontFamily: fontFamilies.medium,
          fontSize: 12,
          color: theme.colors.slate,
        }}
      >
        {label}
      </RNText>
      <RNText
        style={{
          fontFamily: fontFamilies.semibold,
          fontSize: 15,
          color: theme.colors.ink,
          lineHeight: multiline ? 21 : undefined,
        }}
      >
        {value}
      </RNText>
    </View>
  );
}

// Leave row variant of DangerRow with built-in disabled state for the
// sole-admin case. Inlined here (rather than extending the SettingsTab
// DangerRow with a disabled prop) to keep both surfaces independent —
// changes here won't ripple into Stop Participating / Archive / Delete.
function LeaveRow({
  disabled,
  disabledReason,
  onPress,
}: {
  disabled: boolean;
  disabledReason: string | null;
  onPress: () => void;
}) {
  const theme = useTheme();
  const tint = disabled ? theme.colors.slate : theme.colors.red;
  const subtitle = disabled && disabledReason
    ? disabledReason
    : 'Remove yourself from this pool entirely';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        opacity: disabled ? 0.55 : pressed ? 0.7 : 1,
      })}
    >
      <Icon
        name="rectangle.portrait.and.arrow.right"
        tint={tint}
        size={16}
        weight="semibold"
      />
      <View style={{ flex: 1, gap: 2 }}>
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 14,
            color: tint,
          }}
        >
          Leave Pool
        </RNText>
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
      {!disabled ? (
        <Icon name="chevron.right" tint={theme.colors.slate} size={11} weight="semibold" />
      ) : null}
    </Pressable>
  );
}

function formatDeadline(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Localised long-form so the user can verify their timezone matches
  // expectations. e.g. "Jun 11, 2026 at 8:00 PM".
  const date = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${date} at ${time}`;
}

