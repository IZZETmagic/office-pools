import { useMemo, useState, type ComponentType } from 'react';
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  Text as RNText,
  TextInput,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { ConfirmDialog, Icon, Text } from '@/components/ui';
import { router } from 'expo-router';

import { stopParticipating } from '@/lib/api';
import { useHomeData } from '@/lib/HomeDataProvider';
import { usePoolEntries } from '@/lib/usePoolEntries';
import type { PoolDetailInfo } from '@/lib/usePoolDetail';
import { supabase } from '@/lib/supabase';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// Lazy native-module loads so this screen doesn't crash on dev clients that
// haven't been rebuilt with the new native deps. Falls back to non-functional
// stubs that surface a one-line "rebuild needed" alert.
let Clipboard: typeof import('expo-clipboard') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Clipboard = require('expo-clipboard');
} catch {
  Clipboard = null;
}

let DateTimePicker: ComponentType<{
  value: Date;
  mode?: 'date' | 'time' | 'datetime' | 'countdown';
  display?: 'default' | 'spinner' | 'clock' | 'calendar' | 'compact' | 'inline';
  onChange?: (event: unknown, date?: Date) => void;
}> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  DateTimePicker = require('@react-native-community/datetimepicker').default;
} catch {
  DateTimePicker = null;
}

type Props = {
  pool: PoolDetailInfo;
  onSaved?: () => void;
  onOpenScoring?: () => void;
};

type EditableState = {
  name: string;
  description: string;
  status: string;
  isPrivate: boolean;
  maxEntries: number;
  maxParticipants: number;
  deadline: Date;
};

const JOIN_URL_BASE = 'https://sportpool.io/join/';

export function SettingsTab({ pool, onSaved, onOpenScoring }: Props) {
  const theme = useTheme();
  // Used after a successful pool delete to invalidate the home dashboard's
  // pool list so the deleted card disappears immediately when we navigate
  // back to the home tab.
  const { refresh: refreshHomeData } = useHomeData();
  // Drives the "Stop Participating" row's visibility. usePoolEntries
  // subscribes to pool_entries realtime for this user's member_id, so
  // the count updates live — the row disappears immediately when the
  // last entry is removed, with no manual refresh needed.
  const { entries: userEntries } = usePoolEntries(pool.poolId);
  const hasParticipation = userEntries.length > 0;

  const initial = useMemo<EditableState>(
    () => ({
      name: pool.poolName,
      description: pool.description ?? '',
      status: pool.status,
      isPrivate: pool.isPrivate,
      maxEntries: pool.maxEntriesPerUser,
      maxParticipants: pool.maxParticipants ?? 0,
      deadline: pool.predictionDeadline ? new Date(pool.predictionDeadline) : new Date(),
    }),
    [pool],
  );

  const [edit, setEdit] = useState<EditableState>(initial);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);
  const [copiedKey, setCopiedKey] = useState<'code' | 'link' | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  // Stop Participating uses two ConfirmDialog instances — one to ask,
  // one to acknowledge. `stopParticipatingBusy` keeps both the
  // destructive-confirm and any reopen-of-row gated while the API call
  // is in flight. `stopParticipatingSummary` carries the post-success
  // body text (carries the entry-count returned by the endpoint).
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [stopParticipatingBusy, setStopParticipatingBusy] = useState(false);
  const [stopParticipatingSummary, setStopParticipatingSummary] = useState<string | null>(
    null,
  );
  const [stopParticipatingError, setStopParticipatingError] = useState<string | null>(
    null,
  );

  const hasChanges =
    edit.name !== initial.name ||
    edit.description !== initial.description ||
    edit.status !== initial.status ||
    edit.isPrivate !== initial.isPrivate ||
    edit.maxEntries !== initial.maxEntries ||
    edit.maxParticipants !== initial.maxParticipants ||
    edit.deadline.getTime() !== initial.deadline.getTime();

  async function handleCopy(kind: 'code' | 'link') {
    if (!Clipboard) {
      Alert.alert(
        'Rebuild needed',
        'Copy uses a native module that ships in the next dev build.',
      );
      return;
    }
    const value = kind === 'code' ? pool.poolCode : `${JOIN_URL_BASE}${pool.poolCode}`;
    await Clipboard.setStringAsync(value);
    setCopiedKey(kind);
    setTimeout(() => setCopiedKey(null), 1800);
  }

  async function handleSave() {
    if (!hasChanges || saving) return;
    setSaving(true);
    try {
      const updates: Record<string, unknown> = {
        pool_name: edit.name.trim(),
        description: edit.description.trim() || null,
        status: edit.status,
        is_private: edit.isPrivate,
        max_entries_per_user: edit.maxEntries,
        max_participants: edit.maxParticipants > 0 ? edit.maxParticipants : null,
        prediction_deadline: edit.deadline.toISOString(),
      };
      const { error } = await supabase.from('pools').update(updates).eq('pool_id', pool.poolId);
      if (error) throw error;
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
      onSaved?.();
    } catch (err) {
      Alert.alert("Couldn't save", err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (deleteConfirmText !== pool.poolName) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('pools').delete().eq('pool_id', pool.poolId);
      if (error) throw error;
      setShowDeleteModal(false);
      setDeleteConfirmText('');
      // Refresh the home dashboard's pool list FIRST so by the time we
      // land on the home tab the deleted pool card is already gone.
      // Fire-and-forget — the navigation below doesn't wait for it.
      void refreshHomeData();
      // Replace (not push) so the now-defunct pool detail screen isn't
      // left in the back stack — trying to navigate back to a deleted
      // pool would 404 or show a stale shell.
      router.replace('/(tabs)');
    } catch (err) {
      Alert.alert("Couldn't delete", err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setDeleting(false);
    }
  }

  // "Stop Participating" — admin-only action that pulls the admin out of
  // the competition without removing them from the pool. They keep the
  // admin role, the settings tab, banter access, etc. Only their
  // pool_entries (and the cascading predictions / scores / bracket picks
  // — every child of pool_entries is ON DELETE CASCADE) get cleaned up,
  // so they no longer appear on the leaderboard. This is NOT a "leave"
  // event — no pool_membership_events row is written and no
  // pool_left / pool_removed activity card is generated.
  //
  // Routed through /api/pools/[pool_id]/stop-participating rather than a
  // direct client-side supabase.delete on pool_entries because three of
  // the cascade children (bonus_scores, match_scores, player_scores)
  // have RLS enabled with no user-facing DELETE policy. A client
  // cascade would get rejected by those children and roll back the
  // whole transaction — producing the original "Unknown error" Alert
  // (PostgrestError isn't a real Error subclass so `instanceof Error`
  // returned false and we fell through to the generic fallback). The
  // server endpoint uses the admin client to bypass RLS, same pattern
  // as /leave and /api/notifications/member-removed.
  // "Stop Participating" — admin-only action that pulls the admin out of
  // the competition without removing them from the pool. They keep the
  // admin role, the settings tab, banter access, etc. Only their
  // pool_entries (and the cascading predictions / scores / bracket picks
  // — every child of pool_entries is ON DELETE CASCADE) get cleaned up,
  // so they no longer appear on the leaderboard. This is NOT a "leave"
  // event — no pool_membership_events row is written and no
  // pool_left / pool_removed activity card is generated.
  //
  // Routed through /api/pools/[pool_id]/stop-participating rather than a
  // direct client-side supabase.delete on pool_entries because three of
  // the cascade children (bonus_scores, match_scores, player_scores)
  // have RLS enabled with no user-facing DELETE policy. A client
  // cascade would get rejected by those children and roll back the
  // whole transaction. The server endpoint uses the admin client to
  // bypass RLS, same pattern as /leave and /api/notifications/member-removed.
  async function performStopParticipating() {
    setStopParticipatingBusy(true);
    try {
      const result = await stopParticipating(pool.poolId);
      // Recalculate ranks so remaining members' ranks re-settle
      // without the now-deleted entries skewing the leaderboard. Same
      // fire-and-forget pattern web's handleLeavePool uses.
      void fetch(`/api/pools/${pool.poolId}/recalculate`, { method: 'POST' });
      // Refresh the home dashboard (your card's entry list shrinks)
      // and the in-screen pool detail (leaderboard re-renders without
      // your standings). usePoolEntries' realtime sub already removes
      // the row from the PredictionsTab + collapses the Stop
      // Participating row here; the refreshes below are
      // belt-and-suspenders for surfaces that don't subscribe directly.
      void refreshHomeData();
      onSaved?.();
      // Build the post-success summary. The count comes from the
      // endpoint so the user knows exactly what was removed.
      const count = result?.removed_entries ?? 0;
      setStopParticipatingSummary(
        count > 0
          ? `${count} ${count === 1 ? 'entry' : 'entries'} and the associated predictions and scores have been removed from ${pool.poolName}. You're still the admin.`
          : `You're still the admin of ${pool.poolName}.`,
      );
      setShowStopConfirm(false);
    } catch (err) {
      // Robust message extraction: PostgrestError-shaped errors don't
      // pass `instanceof Error` so we have to probe `.message` on a
      // plain object too. Without this the Alert previously read
      // "Unknown error", which is what hid the original RLS failure.
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            && typeof (err as { message: unknown }).message === 'string'
            ? (err as { message: string }).message
            : 'Unknown error';
      setShowStopConfirm(false);
      setStopParticipatingError(message);
    } finally {
      setStopParticipatingBusy(false);
    }
  }

  function handleArchive() {
    Alert.alert(
      'Archive Pool',
      "Members can still view results but no new predictions or changes will be allowed. You can reactivate later.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .from('pools')
                .update({ status: 'completed' })
                .eq('pool_id', pool.poolId);
              if (error) throw error;
              onSaved?.();
            } catch (err) {
              Alert.alert(
                "Couldn't archive",
                err instanceof Error ? err.message : 'Unknown error',
              );
            }
          },
        },
      ],
    );
  }

  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.md,
        paddingBottom: hasChanges || savedFlash ? 90 : theme.spacing.xxxl,
        gap: theme.spacing.lg,
      }}
    >
      {/* Share & Invite — QR is inline (not behind a modal) so an admin
          can hold the phone up and let someone scan immediately without
          an extra tap. Pool code sits directly under as the spoken /
          typed fallback. */}
      <Card>
        <Caption>Share & Invite</Caption>
        <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
          {/* White QR card — solid background per QR best practice
              (consistent contrast regardless of card theme). */}
          <View
            style={{
              padding: theme.spacing.md,
              borderRadius: theme.radii.lg,
              backgroundColor: '#FFFFFF',
              ...theme.shadows.card,
            }}
          >
            {/* QR foreground is intentionally hard-coded — `theme.colors.ink`
                flips to near-white in dark mode, which would render the
                code invisible against the (also white) QR background and
                break scanning. QR contrast must stay dark-on-light
                regardless of the user's system theme. */}
            <QRCode
              value={`${JOIN_URL_BASE}${pool.poolCode}`}
              size={180}
              color="#1B2340"
              backgroundColor="#FFFFFF"
            />
          </View>
          <View style={{ alignItems: 'center', gap: 2 }}>
            <RNText
              style={{
                fontFamily: fontFamilies.medium,
                fontSize: 13,
                color: theme.colors.slate,
              }}
            >
              Pool Code
            </RNText>
            <RNText
              style={{
                fontFamily: fontFamilies.bold,
                fontSize: 22,
                color: theme.colors.ink,
                fontVariant: ['tabular-nums'],
                letterSpacing: 2,
                textAlign: 'center',
                // Android's text-measurement doesn't include the trailing
                // letter-spacing in the Text node's content width — the
                // last glyph gets clipped. iOS measures correctly so the
                // fix is Android-only. paddingRight matches the
                // letterSpacing value to give the trailing space room.
                ...Platform.select({ android: { paddingRight: 2 }, default: {} }),
              }}
            >
              {pool.poolCode}
            </RNText>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <ShareButton
            label={copiedKey === 'code' ? 'Copied!' : 'Copy Code'}
            active={copiedKey === 'code'}
            icon={copiedKey === 'code' ? 'checkmark' : 'doc.on.doc'}
            onPress={() => handleCopy('code')}
          />
          <ShareButton
            label={copiedKey === 'link' ? 'Copied!' : 'Copy Link'}
            active={copiedKey === 'link'}
            icon={copiedKey === 'link' ? 'checkmark' : 'link'}
            onPress={() => handleCopy('link')}
          />
        </View>
      </Card>

      {/* Pool Info */}
      <Card>
        <Caption>Pool Info</Caption>
        <FieldRow label="Name">
          <TextInputBox
            value={edit.name}
            onChange={(v) => setEdit({ ...edit, name: v })}
            placeholder="Pool name"
          />
        </FieldRow>
        <FieldRow label="Description">
          <TextInputBox
            value={edit.description}
            onChange={(v) => setEdit({ ...edit, description: v })}
            placeholder="What's this pool about?"
            multiline
          />
        </FieldRow>
      </Card>

      {/* Status */}
      <Card>
        <Caption>Status</Caption>
        <SegmentedPicker
          value={edit.status}
          options={[
            { value: 'open', label: 'Open' },
            { value: 'closed', label: 'Closed' },
            { value: 'completed', label: 'Completed' },
          ]}
          onChange={(v) => setEdit({ ...edit, status: v })}
        />
        <RNText
          style={{
            fontFamily: fontFamilies.regular,
            fontSize: 12,
            color: theme.colors.slate,
          }}
        >
          {statusDescription(edit.status)}
        </RNText>
      </Card>

      {/* Visibility */}
      <Card>
        <Caption>Visibility</Caption>
        <SegmentedPicker
          value={edit.isPrivate ? 'private' : 'public'}
          options={[
            { value: 'public', label: 'Public' },
            { value: 'private', label: 'Private' },
          ]}
          onChange={(v) => setEdit({ ...edit, isPrivate: v === 'private' })}
        />
        <RNText
          style={{
            fontFamily: fontFamilies.regular,
            fontSize: 12,
            color: theme.colors.slate,
          }}
        >
          {edit.isPrivate
            ? 'Only people with the pool code can join.'
            : 'Anyone with the pool code can join.'}
        </RNText>
      </Card>

      {/* Prediction Entries */}
      <Card>
        <Caption>Prediction Entries</Caption>
        <RNText
          style={{
            fontFamily: fontFamilies.regular,
            fontSize: 12,
            color: theme.colors.slate,
          }}
        >
          Allow members to submit multiple prediction entries. Each is scored independently on the leaderboard.
        </RNText>
        <RNText
          style={{
            fontFamily: fontFamilies.medium,
            fontSize: 12,
            color: theme.colors.slate,
            marginTop: 4,
          }}
        >
          Max entries per member
        </RNText>
        <EntryCountPicker
          value={edit.maxEntries}
          onChange={(v) => setEdit({ ...edit, maxEntries: v })}
        />
        {edit.maxEntries > 1 ? (
          <InfoBox>
            Members can create up to {edit.maxEntries} entries (e.g. "Serious", "Fun"). Each appears as its own row on the leaderboard.
          </InfoBox>
        ) : null}
      </Card>

      {/* Max members */}
      <Card>
        <Caption>Max Members</Caption>
        <SettingsRow
          label="Cap on total members"
          subtitle={edit.maxParticipants === 0 ? 'No limit' : undefined}
        >
          <Stepper
            value={edit.maxParticipants}
            min={0}
            max={500}
            step={edit.maxParticipants < 20 ? 1 : 10}
            onChange={(v) => setEdit({ ...edit, maxParticipants: v })}
          />
        </SettingsRow>
      </Card>

      {/* Deadline */}
      <Card>
        <Caption>
          {pool.predictionMode === 'progressive' ? 'Group Stage Deadline' : 'Prediction Deadline'}
        </Caption>
        {pool.predictionMode === 'progressive' ? (
          <InfoBox>
            Round deadlines are managed separately. This deadline applies to the initial group stage.
          </InfoBox>
        ) : null}
        <Pressable
          onPress={() => {
            if (!DateTimePicker) {
              Alert.alert(
                'Rebuild needed',
                'Date picker uses a native module that ships in the next dev build.',
              );
              return;
            }
            setShowDeadlinePicker(true);
          }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: theme.spacing.sm,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text variant="body" color="slate">
            Locks at
          </Text>
          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 14,
              color: theme.colors.ink,
            }}
          >
            {formatDeadline(edit.deadline)}
          </RNText>
        </Pressable>
        {showDeadlinePicker && DateTimePicker ? (
          <DateTimePicker
            value={edit.deadline}
            mode="datetime"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={(_e: unknown, picked?: Date) => {
              if (Platform.OS !== 'ios') setShowDeadlinePicker(false);
              if (picked) setEdit({ ...edit, deadline: picked });
            }}
          />
        ) : null}
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: theme.spacing.xs,
            justifyContent: 'flex-end',
          }}
        >
          <QuickDeadlineButton
            label="Tournament Start"
            onPress={() => setEdit({ ...edit, deadline: TOURNAMENT_START })}
          />
          <QuickDeadlineButton
            label="1 Day Before"
            onPress={() => setEdit({ ...edit, deadline: addHours(TOURNAMENT_START, -24) })}
          />
          <QuickDeadlineButton
            label="1 Week Before"
            onPress={() => setEdit({ ...edit, deadline: addHours(TOURNAMENT_START, -168) })}
          />
        </View>
        <DeadlineCountdown deadline={pool.predictionDeadline} />
      </Card>

      {/* Scoring Configuration */}
      <ScoringConfigCard onPress={onOpenScoring} />

      {/* Danger Zone */}
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
        {/* Only surface "Stop Participating" while there are entries to
            remove — once `userEntries.length === 0` (either after the
            user just tapped this row, or because they were always an
            admin-only member with no entries), the action is a no-op
            and would confuse them. usePoolEntries' realtime sub keeps
            this gate accurate without a manual refresh. */}
        {hasParticipation ? (
          <DangerRow
            icon="person.crop.circle.badge.minus"
            title="Stop Participating"
            subtitle="Delete your entries; stay on as admin"
            color={theme.colors.amber}
            onPress={() => setShowStopConfirm(true)}
          />
        ) : null}
        <DangerRow
          icon="archivebox"
          title="Archive Pool"
          subtitle="Preserve data but prevent new activity"
          color={theme.colors.amber}
          onPress={handleArchive}
        />
        <DangerRow
          icon="trash"
          title="Delete Pool"
          subtitle="Permanently delete pool and all data"
          color={theme.colors.red}
          onPress={() => setShowDeleteModal(true)}
        />
      </Card>

      {hasChanges || savedFlash ? (
        <SaveBar saving={saving} flashSaved={savedFlash} onSave={handleSave} />
      ) : null}

      <DeleteConfirmModal
        visible={showDeleteModal}
        poolName={pool.poolName}
        confirmText={deleteConfirmText}
        onChangeText={setDeleteConfirmText}
        deleting={deleting}
        onCancel={() => {
          setShowDeleteModal(false);
          setDeleteConfirmText('');
        }}
        onConfirm={() => void handleDelete()}
      />

      {/* Destructive confirm — asks "really?" before clearing entries.
          Same floating-card chrome as the PromptDialog in PredictionsTab,
          via the shared ConfirmDialog primitive. */}
      <ConfirmDialog
        visible={showStopConfirm}
        title="Stop Participating"
        description={`Remove your entries from ${pool.poolName}? Your predictions, standings, and scores will be deleted, but you'll stay on as admin managing the pool.`}
        cancelLabel="Cancel"
        confirmLabel="Stop Participating"
        destructive
        busy={stopParticipatingBusy}
        onCancel={() => setShowStopConfirm(false)}
        onConfirm={() => void performStopParticipating()}
      />

      {/* Post-success acknowledgement — single-button dialog so the
          user has a clear "got it" moment. Tells them how many entries
          were removed and that they're still the admin. */}
      <ConfirmDialog
        visible={stopParticipatingSummary !== null}
        title="You're no longer participating"
        description={stopParticipatingSummary ?? ''}
        confirmLabel="OK"
        onConfirm={() => setStopParticipatingSummary(null)}
      />

      {/* Failure path — kept on the same primitive so error feedback
          uses the same visual language as the success path. */}
      <ConfirmDialog
        visible={stopParticipatingError !== null}
        title="Couldn't update participation"
        description={stopParticipatingError ?? ''}
        confirmLabel="OK"
        destructive
        onConfirm={() => setStopParticipatingError(null)}
      />
    </View>
  );
}

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

function Divider() {
  const theme = useTheme();
  return (
    <View
      style={{
        height: 0.5,
        backgroundColor: withOpacity(theme.colors.silver, 0.5),
        marginVertical: 4,
      }}
    />
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
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
      {children}
    </View>
  );
}

function SettingsRow({
  label,
  subtitle,
  children,
}: {
  label: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: 4,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <RNText
          style={{ fontFamily: fontFamilies.semibold, fontSize: 14, color: theme.colors.ink }}
        >
          {label}
        </RNText>
        {subtitle ? (
          <RNText
            style={{
              fontFamily: fontFamilies.regular,
              fontSize: 11,
              color: theme.colors.slate,
            }}
          >
            {subtitle}
          </RNText>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function TextInputBox({
  value,
  onChange,
  placeholder,
  multiline,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  multiline?: boolean;
}) {
  const theme = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={theme.colors.slate}
      multiline={multiline}
      style={{
        fontFamily: fontFamilies.regular,
        fontSize: 14,
        color: theme.colors.ink,
        backgroundColor: theme.colors.mist,
        borderRadius: theme.radii.sm,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: multiline ? theme.spacing.sm : 10,
        minHeight: multiline ? 60 : undefined,
        textAlignVertical: multiline ? 'top' : 'auto',
      }}
    />
  );
}

function Stepper({
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
      }}
    >
      <StepperButton
        disabled={value <= min}
        onPress={() => onChange(Math.max(min, value - step))}
        icon="minus"
      />
      <RNText
        style={{
          minWidth: 40,
          textAlign: 'center',
          fontFamily: fontFamilies.bold,
          fontSize: 16,
          color: theme.colors.ink,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value === 0 ? '∞' : value}
      </RNText>
      <StepperButton
        disabled={value >= max}
        onPress={() => onChange(Math.min(max, value + step))}
        icon="plus"
      />
    </View>
  );
}

function StepperButton({
  disabled,
  onPress,
  icon,
}: {
  disabled: boolean;
  onPress: () => void;
  icon: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: withOpacity(theme.colors.ink, 0.06),
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.3 : pressed ? 0.7 : 1,
      })}
    >
      <Icon name={icon} tint={theme.colors.ink} size={14} weight="bold" />
    </Pressable>
  );
}

function ShareButton({
  label,
  active,
  icon,
  onPress,
}: {
  label: string;
  active: boolean;
  icon: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const color = active ? theme.colors.green : theme.colors.primary;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: theme.radii.sm,
        backgroundColor: active
          ? withOpacity(theme.colors.green, 0.12)
          : withOpacity(theme.colors.primary, 0.12),
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon name={icon} tint={color} size={12} weight="semibold" />
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 13,
          color,
        }}
      >
        {label}
      </RNText>
    </Pressable>
  );
}

function SaveBar({
  saving,
  flashSaved,
  onSave,
}: {
  saving: boolean;
  flashSaved: boolean;
  onSave: () => void;
}) {
  const theme = useTheme();
  const color = flashSaved ? theme.colors.green : theme.colors.primary;
  return (
    <View
      style={{
        position: 'absolute',
        left: theme.spacing.lg,
        right: theme.spacing.lg,
        bottom: theme.spacing.md,
      }}
    >
      <Pressable
        onPress={onSave}
        disabled={saving || flashSaved}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spacing.sm,
          paddingVertical: 14,
          borderRadius: theme.radii.md,
          backgroundColor: withOpacity(color, 0.2),
          borderWidth: 1,
          borderColor: withOpacity(color, 0.3),
          opacity: pressed ? 0.85 : 1,
        })}
      >
        {flashSaved ? (
          <Icon name="checkmark" tint={color} size={14} weight="bold" />
        ) : null}
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 14,
            color,
          }}
        >
          {flashSaved ? 'Saved' : saving ? 'Saving…' : 'Save Changes'}
        </RNText>
      </Pressable>
    </View>
  );
}

// World Cup 2026 kickoff (matches iOS Settings tab tournamentStartDate).
const TOURNAMENT_START = new Date('2026-06-11T13:00:00');

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 3600 * 1000);
}

function statusDescription(status: string): string {
  switch (status) {
    case 'open':
      return 'Pool is open and accepting new members.';
    case 'closed':
      return 'Pool is closed to new members.';
    case 'completed':
      return 'Tournament is over. No new activity allowed.';
    default:
      return '';
  }
}

function SegmentedPicker<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: theme.colors.mist,
        borderRadius: theme.radii.md,
        padding: 3,
        gap: 3,
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: 8,
              borderRadius: theme.radii.md - 3,
              backgroundColor: active ? theme.colors.surface : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.8 : 1,
              shadowColor: '#000',
              shadowOpacity: active ? 0.08 : 0,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 1 },
            })}
          >
            <RNText
              style={{
                fontFamily: active ? fontFamilies.bold : fontFamilies.medium,
                fontSize: 13,
                color: active ? theme.colors.ink : theme.colors.slate,
              }}
            >
              {opt.label}
            </RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

function EntryCountPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        borderRadius: theme.radii.md,
        overflow: 'hidden',
      }}
    >
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
        const active = n === value;
        return (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            style={({ pressed }) => ({
              flex: 1,
              paddingVertical: 10,
              backgroundColor: active ? theme.colors.primary : theme.colors.mist,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <RNText
              style={{
                fontFamily: active ? fontFamilies.bold : fontFamilies.regular,
                fontSize: 13,
                color: active ? '#FFFFFF' : theme.colors.ink,
                fontVariant: ['tabular-nums'],
              }}
            >
              {n}
            </RNText>
          </Pressable>
        );
      })}
    </View>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        padding: 10,
        borderRadius: theme.radii.sm,
        backgroundColor: withOpacity(theme.colors.primary, 0.08),
      }}
    >
      <Icon name="info.circle.fill" tint={theme.colors.primary} size={14} weight="semibold" />
      <RNText
        style={{
          flex: 1,
          fontFamily: fontFamilies.regular,
          fontSize: 12,
          lineHeight: 17,
          color: theme.colors.slate,
        }}
      >
        {children}
      </RNText>
    </View>
  );
}

function QuickDeadlineButton({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: theme.radii.pill,
        backgroundColor: withOpacity(theme.colors.primary, 0.1),
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.semibold,
          fontSize: 11,
          color: theme.colors.primary,
        }}
      >
        {label}
      </RNText>
    </Pressable>
  );
}

function DeadlineCountdown({ deadline }: { deadline: string | null }) {
  const theme = useTheme();
  if (!deadline) return null;
  const date = new Date(deadline);
  const now = Date.now();
  const diffMs = date.getTime() - now;
  const passed = diffMs < 0;
  const absHours = Math.abs(diffMs) / 3600000;
  const absDays = Math.floor(absHours / 24);
  const remainHours = Math.floor(absHours - absDays * 24);
  const text = passed
    ? `Deadline passed ${absDays > 0 ? `${absDays}d ago` : `${remainHours}h ago`}`
    : absDays > 0
      ? `${absDays}d ${remainHours}h until lock`
      : `${remainHours}h until lock`;
  const color = passed ? theme.colors.red : theme.colors.green;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 6,
        paddingTop: 4,
      }}
    >
      <Icon
        name={passed ? 'exclamationmark.circle.fill' : 'clock.fill'}
        tint={color}
        size={11}
        weight="semibold"
      />
      <RNText
        style={{
          fontFamily: fontFamilies.semibold,
          fontSize: 12,
          color,
        }}
      >
        {text}
      </RNText>
    </View>
  );
}

function DangerRow({
  icon,
  title,
  subtitle,
  color,
  onPress,
}: {
  icon: string;
  title: string;
  subtitle: string;
  color: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon name={icon} tint={color} size={16} weight="semibold" />
      <View style={{ flex: 1, gap: 2 }}>
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 14,
            color,
          }}
        >
          {title}
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
      <Icon name="chevron.right" tint={theme.colors.slate} size={11} weight="semibold" />
    </Pressable>
  );
}

function ScoringConfigCard({ onPress }: { onPress?: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.lg,
        opacity: pressed && onPress ? 0.85 : 1,
        ...theme.shadows.card,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <Icon name="slider.horizontal.3" tint={theme.colors.primary} size={18} weight="semibold" />
        <View style={{ flex: 1, gap: 2 }}>
          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 15,
              color: theme.colors.ink,
            }}
          >
            Scoring Configuration
          </RNText>
          <RNText
            style={{
              fontFamily: fontFamilies.regular,
              fontSize: 12,
              color: theme.colors.slate,
            }}
          >
            View point values for matches and bonuses
          </RNText>
        </View>
        <Icon name="chevron.right" tint={theme.colors.slate} size={11} weight="semibold" />
      </View>
    </Pressable>
  );
}

function DeleteConfirmModal({
  visible,
  poolName,
  confirmText,
  onChangeText,
  deleting,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  poolName: string;
  confirmText: string;
  onChangeText: (v: string) => void;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const theme = useTheme();
  const matched = confirmText === poolName;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.45)',
          justifyContent: 'center',
          padding: theme.spacing.xl,
        }}
      >
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radii.lg,
            padding: theme.spacing.lg,
            gap: theme.spacing.md,
          }}
        >
          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 17,
              color: theme.colors.ink,
            }}
          >
            Delete Pool?
          </RNText>
          <RNText
            style={{
              fontFamily: fontFamilies.regular,
              fontSize: 13,
              lineHeight: 18,
              color: theme.colors.slate,
            }}
          >
            Type{' '}
            <RNText style={{ fontFamily: fontFamilies.bold, color: theme.colors.ink }}>
              {poolName}
            </RNText>{' '}
            to confirm. This will permanently delete the pool, all predictions, and all member data. This cannot be undone.
          </RNText>
          <TextInput
            value={confirmText}
            onChangeText={onChangeText}
            placeholder={poolName}
            placeholderTextColor={theme.colors.slate}
            autoCapitalize="none"
            autoCorrect={false}
            style={{
              fontFamily: fontFamilies.regular,
              fontSize: 14,
              color: theme.colors.ink,
              backgroundColor: theme.colors.mist,
              borderRadius: theme.radii.sm,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: 10,
            }}
          />
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Pressable
              onPress={onCancel}
              disabled={deleting}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                borderRadius: theme.radii.md,
                backgroundColor: withOpacity(theme.colors.ink, 0.06),
                alignItems: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <RNText
                style={{
                  fontFamily: fontFamilies.bold,
                  fontSize: 14,
                  color: theme.colors.ink,
                }}
              >
                Cancel
              </RNText>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={!matched || deleting}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                borderRadius: theme.radii.md,
                backgroundColor: matched
                  ? withOpacity(theme.colors.red, 0.15)
                  : withOpacity(theme.colors.red, 0.06),
                borderWidth: 1,
                borderColor: matched
                  ? withOpacity(theme.colors.red, 0.4)
                  : 'transparent',
                alignItems: 'center',
                opacity: !matched || deleting ? 0.45 : pressed ? 0.7 : 1,
              })}
            >
              <RNText
                style={{
                  fontFamily: fontFamilies.bold,
                  fontSize: 14,
                  color: theme.colors.red,
                }}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </RNText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function formatDeadline(d: Date): string {
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
