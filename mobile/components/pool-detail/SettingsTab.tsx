import { SymbolView } from 'expo-symbols';
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

import { Text } from '@/components/ui';
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
      onSaved?.();
    } catch (err) {
      Alert.alert("Couldn't delete", err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setDeleting(false);
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
      {/* Share & Invite */}
      <Card>
        <Caption>Share & Invite</Caption>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ gap: 4 }}>
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
            iosIcon={copiedKey === 'code' ? 'checkmark' : 'doc.on.doc'}
            emoji={copiedKey === 'code' ? '✓' : '📋'}
            onPress={() => handleCopy('code')}
          />
          <ShareButton
            label={copiedKey === 'link' ? 'Copied!' : 'Copy Link'}
            active={copiedKey === 'link'}
            iosIcon={copiedKey === 'link' ? 'checkmark' : 'link'}
            emoji={copiedKey === 'link' ? '✓' : '🔗'}
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
        <DangerRow
          iosIcon="archivebox"
          emoji="📦"
          title="Archive Pool"
          subtitle="Preserve data but prevent new activity"
          color={theme.colors.amber}
          onPress={handleArchive}
        />
        <DangerRow
          iosIcon="trash"
          emoji="🗑️"
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
        iosIcon="minus"
        emoji="−"
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
        iosIcon="plus"
        emoji="+"
      />
    </View>
  );
}

function StepperButton({
  disabled,
  onPress,
  iosIcon,
  emoji,
}: {
  disabled: boolean;
  onPress: () => void;
  iosIcon: string;
  emoji: string;
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
      {Platform.OS === 'ios' ? (
        <SymbolView
          name={iosIcon as never}
          size={14}
          tintColor={theme.colors.ink}
          weight="bold"
          resizeMode="scaleAspectFit"
        />
      ) : (
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 18,
            color: theme.colors.ink,
            lineHeight: 18,
          }}
        >
          {emoji}
        </RNText>
      )}
    </Pressable>
  );
}

function ShareButton({
  label,
  active,
  iosIcon,
  emoji,
  onPress,
}: {
  label: string;
  active: boolean;
  iosIcon: string;
  emoji: string;
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
      {Platform.OS === 'ios' ? (
        <SymbolView
          name={iosIcon as never}
          size={12}
          tintColor={color}
          weight="semibold"
          resizeMode="scaleAspectFit"
        />
      ) : (
        <RNText style={{ fontSize: 12, color }}>{emoji}</RNText>
      )}
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
        {flashSaved && Platform.OS === 'ios' ? (
          <SymbolView
            name="checkmark"
            size={14}
            tintColor={color}
            weight="bold"
            resizeMode="scaleAspectFit"
          />
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
      {Platform.OS === 'ios' ? (
        <SymbolView
          name="info.circle.fill"
          size={14}
          tintColor={theme.colors.primary}
          weight="semibold"
          resizeMode="scaleAspectFit"
        />
      ) : (
        <RNText style={{ fontSize: 14, color: theme.colors.primary }}>ⓘ</RNText>
      )}
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
      {Platform.OS === 'ios' ? (
        <SymbolView
          name={passed ? 'exclamationmark.circle.fill' : 'clock.fill'}
          size={11}
          tintColor={color}
          weight="semibold"
          resizeMode="scaleAspectFit"
        />
      ) : null}
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
  iosIcon,
  emoji,
  title,
  subtitle,
  color,
  onPress,
}: {
  iosIcon: string;
  emoji: string;
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
      {Platform.OS === 'ios' ? (
        <SymbolView
          name={iosIcon as never}
          size={16}
          tintColor={color}
          weight="semibold"
          resizeMode="scaleAspectFit"
        />
      ) : (
        <RNText style={{ fontSize: 16, color }}>{emoji}</RNText>
      )}
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
      {Platform.OS === 'ios' ? (
        <SymbolView
          name="chevron.right"
          size={11}
          tintColor={theme.colors.slate}
          weight="semibold"
          resizeMode="scaleAspectFit"
        />
      ) : (
        <RNText style={{ fontSize: 14, color: theme.colors.slate }}>›</RNText>
      )}
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
        {Platform.OS === 'ios' ? (
          <SymbolView
            name="slider.horizontal.3"
            size={18}
            tintColor={theme.colors.primary}
            weight="semibold"
            resizeMode="scaleAspectFit"
          />
        ) : (
          <RNText style={{ fontSize: 18, color: theme.colors.primary }}>🎛️</RNText>
        )}
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
        {Platform.OS === 'ios' ? (
          <SymbolView
            name="chevron.right"
            size={11}
            tintColor={theme.colors.slate}
            weight="semibold"
            resizeMode="scaleAspectFit"
          />
        ) : (
          <RNText style={{ fontSize: 14, color: theme.colors.slate }}>›</RNText>
        )}
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
