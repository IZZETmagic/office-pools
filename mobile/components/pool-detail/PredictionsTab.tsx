import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text as RNText, View } from 'react-native';

import { ActionMenu, Button, ConfirmDialog, Icon, PromptDialog, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useMemberRoster } from '@/lib/useMemberRoster';
import { usePoolEntries, type PoolEntry } from '@/lib/usePoolEntries';
import { usePoolRounds, roundLabel } from '@/lib/usePoolRounds';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type Props = {
  poolId: string;
  maxEntriesPerUser: number;
  predictionMode?: string | null;
  /** Pool deadline (ISO). Drives when the "Everyone's predictions" section
   *  unlocks for non-progressive pools. */
  predictionDeadline?: string | null;
  /**
   * Caller's admin status in this pool. Drives the client-side
   * delete-gate: non-admins can't delete their last entry (server
   * also enforces, but hiding the option keeps the UI honest).
   */
  isAdmin: boolean;
};

const ROUND_ORDER = [
  'group',
  'round_32',
  'round_16',
  'quarter_final',
  'semi_final',
  'third_place',
  'final',
];

export function PredictionsTab({ poolId, maxEntriesPerUser, predictionMode, predictionDeadline, isAdmin }: Props) {
  const theme = useTheme();
  const { entries, loading, error, refresh, addEntry, renameEntry, removeEntry, username } = usePoolEntries(poolId);
  const [adding, setAdding] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  // Per-entry edit/delete flow. Single source of truth (the entry the
  // user just kebab-tapped) drives all three follow-up dialogs.
  const [actionsFor, setActionsFor] = useState<PoolEntry | null>(null);
  const [renameFor, setRenameFor] = useState<PoolEntry | null>(null);
  const [deleteFor, setDeleteFor] = useState<PoolEntry | null>(null);
  const [entryActionBusy, setEntryActionBusy] = useState(false);
  const [entryActionError, setEntryActionError] = useState<string | null>(null);
  const isProgressive = predictionMode === 'progressive';
  const { data: roundsData } = usePoolRounds(isProgressive ? poolId : undefined);
  const [roundSubsByEntry, setRoundSubsByEntry] = useState<Map<string, Set<string>>>(new Map());

  // Refresh whenever the screen regains focus — covers the case where the
  // user submits predictions inside the entry wizard and comes back here.
  const initialFocus = useRef(true);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useFocusEffect(
    useCallback(() => {
      if (initialFocus.current) {
        initialFocus.current = false;
        return;
      }
      // 'refresh' so re-entering the screen doesn't blank the tab
      // to a full-screen spinner while the entries re-fetch.
      void refreshRef.current('refresh');
    }, []),
  );

  const activeRoundKey = useMemo<string | null>(() => {
    if (!isProgressive) return null;
    const rounds = roundsData?.rounds ?? [];
    const sorted = [...rounds].sort(
      (a, b) => ROUND_ORDER.indexOf(a.round_key) - ROUND_ORDER.indexOf(b.round_key),
    );
    const active = sorted.find((r) => r.state === 'open' || r.state === 'in_progress');
    return active?.round_key ?? null;
  }, [isProgressive, roundsData]);

  useEffect(() => {
    if (!isProgressive || entries.length === 0) {
      setRoundSubsByEntry(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const ids = entries.map((e) => e.entryId);
      const { data, error: err } = await supabase
        .from('entry_round_submissions')
        .select('entry_id, round_key, has_submitted')
        .in('entry_id', ids);
      if (cancelled) return;
      if (err) {
        console.warn('[PredictionsTab] round submissions fetch', err);
        return;
      }
      const map = new Map<string, Set<string>>();
      for (const r of (data ?? []) as Array<{
        entry_id: string;
        round_key: string;
        has_submitted: boolean;
      }>) {
        if (!r.has_submitted) continue;
        const set = map.get(r.entry_id) ?? new Set<string>();
        set.add(r.round_key);
        map.set(r.entry_id, set);
      }
      setRoundSubsByEntry(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [isProgressive, entries]);

  // "Everyone's predictions" — every OTHER entry in the pool, flattened and
  // labelled by owner. Entry metadata (names) is pool-public; the actual picks
  // are gated server-side and only fetched when a row is opened after lock.
  const roster = useMemberRoster(poolId);
  const myEntryIds = useMemo(() => new Set(entries.map((e) => e.entryId)), [entries]);
  const otherEntries = useMemo(() => {
    const list: { entryId: string; entryName: string; ownerName: string; points: number }[] = [];
    for (const m of roster.members) {
      for (const e of m.entries) {
        if (myEntryIds.has(e.entryId)) continue;
        list.push({ entryId: e.entryId, entryName: e.entryName, ownerName: m.fullName, points: e.scoredTotalPoints });
      }
    }
    list.sort((a, b) => b.points - a.points || a.ownerName.localeCompare(b.ownerName));
    return list;
  }, [roster.members, myEntryIds]);

  // Section unlocks once picks are locked pool-wide: past the deadline
  // (full_tournament / bracket_picker) or any round locked (progressive).
  const everyoneRevealed = useMemo(() => {
    if (isProgressive) {
      return (roundsData?.rounds ?? []).some(
        (r) => r.state === 'locked' || r.state === 'in_progress' || r.state === 'completed',
      );
    }
    if (!predictionDeadline) return false;
    const t = new Date(predictionDeadline).getTime();
    return !Number.isNaN(t) && Date.now() >= t;
  }, [isProgressive, roundsData, predictionDeadline]);

  // Cross-platform Add Entry flow. Uses the in-app PromptDialog
  // (centered floating modal with a TextInput) so iOS and Android get
  // the same look and confirmation step — previously iOS used
  // Alert.prompt which is iOS-only, and Android fell back to a
  // confirmation Alert with no naming capability.
  const addDefaultName = `${username} ${entries.length + 1}`;

  async function handleAddSubmit(name: string) {
    setShowAddDialog(false);
    setAdding(true);
    const result = await addEntry(name);
    setAdding(false);
    if (result.error) {
      Alert.alert("Couldn't add entry", result.error);
    }
  }

  // Per-entry rename / delete handlers. The action menu chains into a
  // PromptDialog (rename) or ConfirmDialog (delete) — we close the
  // menu first, then open the next dialog one tick later so the fade
  // animations don't stack.
  function openActionsFor(entry: PoolEntry) {
    setActionsFor(entry);
  }
  function pickRename() {
    const target = actionsFor;
    if (!target) return;
    setActionsFor(null);
    setRenameFor(target);
  }
  function pickDelete() {
    const target = actionsFor;
    if (!target) return;
    setActionsFor(null);
    setDeleteFor(target);
  }
  async function handleRenameSubmit(name: string) {
    const target = renameFor;
    if (!target) return;
    setEntryActionBusy(true);
    const result = await renameEntry(target.entryId, name);
    setEntryActionBusy(false);
    if (result.error) {
      setRenameFor(null);
      setEntryActionError(result.error);
      return;
    }
    setRenameFor(null);
  }
  async function performDelete() {
    const target = deleteFor;
    if (!target) return;
    setEntryActionBusy(true);
    const result = await removeEntry(target.entryId);
    setEntryActionBusy(false);
    if (result.error) {
      setDeleteFor(null);
      setEntryActionError(result.error);
      return;
    }
    setDeleteFor(null);
  }

  // Client-side delete-gate. Admins can always delete (matches Stop
  // Participating semantics — they can empty out their entries while
  // keeping the admin role). Non-admins must keep at least one entry
  // — when they only have one we hide the Delete option entirely. The
  // server endpoint enforces the same rule as a backstop.
  const canDelete = isAdmin || entries.length > 1;

  if (loading) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: theme.spacing.xxxl }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View
        style={{
          alignItems: 'center',
          paddingVertical: theme.spacing.xxxl,
          paddingHorizontal: theme.spacing.xl,
          gap: theme.spacing.md,
        }}
      >
        <Text variant="body" color="slate" align="center">
          {error}
        </Text>
        <Button title="Try Again" onPress={() => refresh()} variant="secondary" />
      </View>
    );
  }

  const canAdd = entries.length < maxEntriesPerUser;

  return (
    <View style={{ paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md, gap: theme.spacing.lg }}>
      {entries.length === 0 ? (
        <View
          style={{
            alignItems: 'center',
            gap: theme.spacing.md,
            paddingVertical: theme.spacing.xxl,
          }}
        >
          <Icon name="pencil.line" color="primary" size={40} />
          <Text variant="cardTitle" align="center">
            No entries yet
          </Text>
          <Text variant="body" color="slate" align="center">
            Add an entry to start making predictions.
          </Text>
        </View>
      ) : null}
      {entries.map((entry) => {
        const progressiveStatus = isProgressive && activeRoundKey
          ? {
              submitted: roundSubsByEntry.get(entry.entryId)?.has(activeRoundKey) ?? false,
              roundLabel: roundLabel(activeRoundKey),
            }
          : null;
        return (
          <EntryRow
            key={entry.entryId}
            entry={entry}
            progressiveStatus={progressiveStatus}
            onPress={() => router.navigate(`/pool/${poolId}/entry/${entry.entryId}`)}
            onActions={() => openActionsFor(entry)}
          />
        );
      })}

      <View style={{ gap: theme.spacing.xs, paddingTop: theme.spacing.sm }}>
        {canAdd ? (
          <Pressable
            onPress={() => setShowAddDialog(true)}
            disabled={adding}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: theme.spacing.xs,
              padding: theme.spacing.md,
              borderRadius: theme.radii.md,
              backgroundColor: withOpacity(theme.colors.primary, 0.08),
              opacity: adding ? 0.5 : pressed ? 0.7 : 1,
            })}
          >
            <Icon name="plus.circle.fill" color="primary" size={16} />
            <RNText
              style={{
                fontFamily: fontFamilies.bold,
                fontSize: 14,
                color: theme.colors.primary,
              }}
            >
              Add Entry
            </RNText>
          </Pressable>
        ) : null}
        <Text variant="detail" color="slate" align="center">
          {entries.length} of {maxEntriesPerUser} entries used
        </Text>
      </View>

      {otherEntries.length > 0 ? (
        <View style={{ gap: theme.spacing.md, paddingTop: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Text variant="cardTitle">Everyone&apos;s predictions</Text>
            {!everyoneRevealed ? <Icon name="lock.fill" color="slate" size={13} /> : null}
          </View>
          {!everyoneRevealed ? (
            <Text variant="detail" color="slate">
              Everyone&apos;s picks unlock when predictions close. Check back after the deadline.
            </Text>
          ) : null}
          {otherEntries.map((e) => (
            <MemberEntryRow
              key={e.entryId}
              ownerName={e.ownerName}
              entryName={e.entryName}
              points={e.points}
              locked={!everyoneRevealed}
              onPress={
                everyoneRevealed
                  ? () =>
                      router.navigate(
                        `/pool/${poolId}/entry/${e.entryId}?viewAs=member&owner=${encodeURIComponent(e.ownerName)}`,
                      )
                  : undefined
              }
            />
          ))}
        </View>
      ) : null}

      <PromptDialog
        visible={showAddDialog}
        title="Add Entry"
        description="Pick a name for this entry. You can keep the suggestion or change it."
        defaultValue={addDefaultName}
        placeholder={addDefaultName}
        confirmLabel="Add"
        busy={adding}
        maxLength={40}
        onCancel={() => setShowAddDialog(false)}
        onSubmit={(name) => {
          void handleAddSubmit(name || addDefaultName);
        }}
      />

      {/* Per-entry action picker. Opens when the user taps the kebab
          on a row. Rename always shows; Delete is hidden when this
          would empty out a non-admin's entry list. */}
      <ActionMenu
        visible={actionsFor !== null}
        title={actionsFor?.entryName ?? ''}
        items={[
          {
            key: 'rename',
            label: 'Rename',
            description: 'Change the entry name',
            onPress: pickRename,
          },
          ...(canDelete
            ? [
                {
                  key: 'delete',
                  label: 'Delete Entry',
                  description: isAdmin && entries.length === 1
                    ? "Removes all your predictions and standings. You'll stay on as admin."
                    : 'Removes this entry and its predictions',
                  destructive: true,
                  onPress: pickDelete,
                },
              ]
            : []),
        ]}
        onCancel={() => setActionsFor(null)}
      />

      <PromptDialog
        visible={renameFor !== null}
        title="Rename Entry"
        description="Pick a new name for this entry."
        defaultValue={renameFor?.entryName ?? ''}
        confirmLabel="Save"
        busy={entryActionBusy}
        maxLength={40}
        onCancel={() => setRenameFor(null)}
        onSubmit={(name) => void handleRenameSubmit(name)}
      />

      <ConfirmDialog
        visible={deleteFor !== null}
        title="Delete Entry"
        description={
          deleteFor
            ? isAdmin && entries.length === 1
              ? `Delete ${deleteFor.entryName}? This is your only entry — your predictions, standings, and scores will be removed, but you'll stay on as admin managing the pool.`
              : `Delete ${deleteFor.entryName}? Its predictions and scores will be removed permanently. The pool keeps running.`
            : ''
        }
        cancelLabel="Cancel"
        confirmLabel="Delete"
        destructive
        busy={entryActionBusy}
        onCancel={() => setDeleteFor(null)}
        onConfirm={() => void performDelete()}
      />

      <ConfirmDialog
        visible={entryActionError !== null}
        title="Couldn't update entry"
        description={entryActionError ?? ''}
        confirmLabel="OK"
        destructive
        onConfirm={() => setEntryActionError(null)}
      />
    </View>
  );
}

function EntryRow({
  entry,
  progressiveStatus,
  onPress,
  onActions,
}: {
  entry: PoolEntry;
  progressiveStatus: { submitted: boolean; roundLabel: string } | null;
  onPress: () => void;
  /** Fires when the user taps the kebab. Distinct from row tap (which opens the wizard). */
  onActions: () => void;
}) {
  const theme = useTheme();
  const isSubmitted = progressiveStatus
    ? progressiveStatus.submitted
    : entry.hasSubmittedPredictions;
  const statusBg = isSubmitted
    ? withOpacity(theme.colors.green, 0.12)
    : withOpacity(theme.colors.amber, 0.12);
  const statusFg = isSubmitted ? theme.colors.green : theme.colors.amber;
  const statusLabel = progressiveStatus
    ? `${isSubmitted ? 'Submitted' : 'In Progress'} · ${progressiveStatus.roundLabel}`
    : isSubmitted
      ? 'Submitted'
      : 'In Progress';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
        borderRadius: theme.radii.lg,
        backgroundColor: theme.colors.surface,
        opacity: pressed ? 0.85 : 1,
        ...theme.shadows.card,
      })}
    >
      <View style={{ flex: 1, gap: theme.spacing.xs }}>
        <Text variant="cardTitle" numberOfLines={1}>
          {entry.entryName}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: 2,
              borderRadius: theme.radii.pill,
              backgroundColor: statusBg,
            }}
          >
            <Icon
              name={isSubmitted ? 'checkmark.circle.fill' : 'clock.fill'}
              color={isSubmitted ? 'green' : 'amber'}
              size={10}
            />
            <RNText
              style={{
                fontFamily: fontFamilies.bold,
                fontSize: 10,
                color: statusFg,
                letterSpacing: 0.3,
              }}
            >
              {statusLabel}
            </RNText>
          </View>
          <Text variant="detail" color="slate">
            {entry.totalPoints} pts
          </Text>
        </View>
      </View>
      {/* Kebab — separate tap target from the row itself. The row's
          onPress opens the prediction wizard; the kebab opens the
          rename/delete action menu. Generous hitSlop so the small
          icon is comfortable to tap. */}
      <Pressable
        onPress={(e) => {
          // Stop the row's Pressable from also firing — we don't
          // want a single tap to both open the wizard AND the menu.
          e.stopPropagation();
          onActions();
        }}
        hitSlop={10}
        style={({ pressed }) => ({
          padding: 6,
          borderRadius: theme.radii.sm,
          opacity: pressed ? 0.5 : 1,
        })}
      >
        <Icon name="ellipsis" color="slate" size={16} weight="semibold" />
      </Pressable>
      <Icon name="chevron.right" color="slate" size={12} weight="semibold" />
    </Pressable>
  );
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// A single "Everyone's predictions" row — one entry, labelled by its owner.
// Tappable only once the section is revealed (post-lock); before that it's a
// muted, non-interactive teaser so members know the feature exists.
function MemberEntryRow({
  ownerName,
  entryName,
  points,
  locked,
  onPress,
}: {
  ownerName: string;
  entryName: string;
  points: number;
  locked: boolean;
  onPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
        borderRadius: theme.radii.lg,
        backgroundColor: theme.colors.surface,
        opacity: locked ? 0.6 : pressed ? 0.85 : 1,
        ...theme.shadows.card,
      })}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: theme.radii.pill,
          backgroundColor: withOpacity(theme.colors.primary, 0.12),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 12, color: theme.colors.primary }}>
          {initialsOf(ownerName)}
        </RNText>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="cardTitle" numberOfLines={1}>
          {entryName}
        </Text>
        <Text variant="detail" color="slate" numberOfLines={1}>
          {ownerName} · {points} pts
        </Text>
      </View>
      <Icon
        name={locked ? 'lock.fill' : 'chevron.right'}
        color="slate"
        size={locked ? 13 : 12}
        weight="semibold"
      />
    </Pressable>
  );
}
