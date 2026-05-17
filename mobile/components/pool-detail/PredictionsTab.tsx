import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, Text as RNText, View } from 'react-native';

import { Button, Icon, Text } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { usePoolEntries, type PoolEntry } from '@/lib/usePoolEntries';
import { usePoolRounds, roundLabel } from '@/lib/usePoolRounds';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type Props = {
  poolId: string;
  maxEntriesPerUser: number;
  predictionMode?: string | null;
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

export function PredictionsTab({ poolId, maxEntriesPerUser, predictionMode }: Props) {
  const theme = useTheme();
  const { entries, loading, error, refresh, addEntry, username } = usePoolEntries(poolId);
  const [adding, setAdding] = useState(false);
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
      refreshRef.current();
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

  function handleAdd() {
    Alert.prompt(
      'Add Entry',
      'Name this entry',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Add',
          onPress: async (raw?: string) => {
            const name = raw ?? '';
            setAdding(true);
            const result = await addEntry(name);
            setAdding(false);
            if (result.error) {
              Alert.alert("Couldn't add entry", result.error);
            }
          },
        },
      ],
      'plain-text',
      `${username} ${entries.length + 1}`,
    );
  }

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
        <Button title="Try Again" onPress={refresh} variant="secondary" />
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
          />
        );
      })}

      <View style={{ gap: theme.spacing.xs, paddingTop: theme.spacing.sm }}>
        {canAdd ? (
          <Pressable
            onPress={handleAdd}
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
    </View>
  );
}

function EntryRow({
  entry,
  progressiveStatus,
  onPress,
}: {
  entry: PoolEntry;
  progressiveStatus: { submitted: boolean; roundLabel: string } | null;
  onPress: () => void;
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
      <Icon name="chevron.right" color="slate" size={12} weight="semibold" />
    </Pressable>
  );
}
