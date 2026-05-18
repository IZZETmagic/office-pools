import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text as RNText,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GroupCollapsibleSection, MatchPredictionRow, ThirdPlaceTable } from '@/components/pool-detail';
import { Icon, Text } from '@/components/ui';
import { submitRoundPredictions } from '@/lib/api';
import type { BracketResult } from '@/lib/bracket/bracketResolver';
import {
  GROUP_LETTERS,
  type Match,
  type ScoreEntry,
  type Team,
  isPredictionComplete,
} from '@/lib/bracket/tournament';
import {
  useEntryRoundSubmissions,
  type EntryRoundSubmission,
} from '@/lib/useEntryRoundSubmissions';
import { usePoolRounds, type PoolRound } from '@/lib/usePoolRounds';
import type { PredictionsData } from '@/lib/usePredictions';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type Props = {
  poolId: string;
  data: PredictionsData;
  predictions: Map<string, ScoreEntry>;
  bracket: BracketResult | null;
  updatePrediction: (matchId: string, patch: Partial<ScoreEntry>) => void;
  saving: boolean;
  /** Admin read-only view — disables all edits + submit. */
  readOnly?: boolean;
};

type RoundKey = 'group' | 'round_32' | 'round_16' | 'quarter_final' | 'semi_final' | 'third_place' | 'final';

const ROUND_KEYS: RoundKey[] = [
  'group',
  'round_32',
  'round_16',
  'quarter_final',
  'semi_final',
  'third_place',
  'final',
];

const ROUND_LABELS: Record<RoundKey, string> = {
  group: 'Group Stage',
  round_32: 'Round of 32',
  round_16: 'Round of 16',
  quarter_final: 'Quarter Finals',
  semi_final: 'Semi Finals',
  third_place: '3rd Place',
  final: 'Final',
};

const TAB_LABELS: Record<RoundKey, string> = {
  group: 'Groups',
  round_32: 'R32',
  round_16: 'R16',
  quarter_final: 'QF',
  semi_final: 'SF',
  third_place: '3rd',
  final: 'Final',
};

const ROUND_MATCH_STAGES: Record<RoundKey, string[]> = {
  group: ['group'],
  round_32: ['round_32'],
  round_16: ['round_16'],
  quarter_final: ['quarter_final'],
  semi_final: ['semi_final'],
  third_place: ['third_place'],
  final: ['final'],
};

export function ProgressivePredictionWizard({
  poolId,
  data,
  predictions,
  bracket,
  updatePrediction,
  saving,
  readOnly = false,
}: Props) {
  // No-op mutator + force-submitted state when the admin is viewing.
  const effectiveUpdatePrediction = readOnly
    ? (() => {
        /* read-only: drop edits silently */
      })
    : updatePrediction;
  const effectiveSubmitted =
    readOnly || data.entry.hasSubmittedPredictions;
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { data: roundsData, refresh: refreshRounds } = usePoolRounds(poolId);
  const { submissions, refresh: refreshSubmissions } = useEntryRoundSubmissions(
    data.entry.entryId,
  );

  const roundStateByKey = useMemo<Map<RoundKey, PoolRound>>(() => {
    const map = new Map<RoundKey, PoolRound>();
    for (const r of roundsData?.rounds ?? []) {
      if ((ROUND_KEYS as string[]).includes(r.round_key)) {
        map.set(r.round_key as RoundKey, r);
      }
    }
    return map;
  }, [roundsData]);

  const firstEditableRound = useMemo<RoundKey>(() => {
    for (const key of ROUND_KEYS) {
      const state = roundStateByKey.get(key)?.state;
      if (state === 'open' || state === 'in_progress') {
        const sub = submissions.get(key);
        if (!sub?.hasSubmitted) return key;
      }
    }
    // Fallback: first non-locked round, else group.
    for (const key of ROUND_KEYS) {
      const state = roundStateByKey.get(key)?.state;
      if (state && state !== 'locked') return key;
    }
    return 'group';
  }, [roundStateByKey, submissions]);

  const [currentRound, setCurrentRound] = useState<RoundKey>(firstEditableRound);
  const [submitting, setSubmitting] = useState(false);
  const [expandAllSignal, setExpandAllSignal] = useState(1);
  const [justSubmittedRound, setJustSubmittedRound] = useState<RoundKey | null>(null);

  // Auto-advance once the just-submitted round shows up in fresh submissions
  useEffect(() => {
    if (!justSubmittedRound) return;
    const sub = submissions.get(justSubmittedRound);
    if (!sub?.hasSubmitted) return;
    const idx = ROUND_KEYS.indexOf(justSubmittedRound);
    for (let i = idx + 1; i < ROUND_KEYS.length; i++) {
      const nextKey = ROUND_KEYS[i];
      const nextState = roundStateByKey.get(nextKey)?.state;
      const nextSub = submissions.get(nextKey);
      if (
        (nextState === 'open' || nextState === 'in_progress') &&
        !nextSub?.hasSubmitted
      ) {
        setCurrentRound(nextKey);
        break;
      }
    }
    setJustSubmittedRound(null);
  }, [justSubmittedRound, submissions, roundStateByKey]);

  // Re-anchor to first editable round when round states first load
  useEffect(() => {
    setCurrentRound(firstEditableRound);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundsData !== null && submissions.size >= 0]);

  const currentState = roundStateByKey.get(currentRound)?.state ?? 'locked';
  const currentSubmission = submissions.get(currentRound);
  const isSubmitted = currentSubmission?.hasSubmitted ?? false;
  const canEdit =
    !readOnly &&
    !effectiveSubmitted &&
    !isSubmitted &&
    (currentState === 'open' || currentState === 'in_progress');

  const stageMatches = useMemo<Match[]>(() => {
    const stages = ROUND_MATCH_STAGES[currentRound];
    return data.matches.filter((m) => stages.includes(m.stage));
  }, [data.matches, currentRound]);

  const roundComplete = useMemo(
    () => stageMatches.length > 0 && stageMatches.every((m) => isPredictionComplete(predictions.get(m.match_id))),
    [stageMatches, predictions],
  );

  function handleTabPress(key: RoundKey) {
    const state = roundStateByKey.get(key)?.state ?? 'locked';
    if (state === 'locked') return;
    setCurrentRound(key);
  }

  function handleSubmit() {
    if (!canEdit) return;
    if (!roundComplete) {
      Alert.alert('Not yet', 'Fill in every match before submitting this round.');
      return;
    }
    Alert.alert(
      `Submit ${ROUND_LABELS[currentRound]}?`,
      `Once submitted, your ${ROUND_LABELS[currentRound]} predictions cannot be changed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          style: 'destructive',
          onPress: async () => {
            setSubmitting(true);
            try {
              await submitRoundPredictions(poolId, data.entry.entryId, currentRound);
              await Promise.all([refreshSubmissions(), refreshRounds()]);
              setJustSubmittedRound(currentRound);
            } catch (err) {
              Alert.alert(
                "Couldn't submit",
                err instanceof Error ? err.message : 'Unknown error',
              );
            } finally {
              setSubmitting(false);
            }
          },
        },
      ],
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow, paddingTop: insets.top }}>
      <Header title={data.entry.entryName} />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.xxxl + 80,
          gap: theme.spacing.md,
        }}
        keyboardDismissMode="interactive"
      >
        <RoundTabs
          current={currentRound}
          roundStateByKey={roundStateByKey}
          submissions={submissions}
          onSelect={handleTabPress}
        />

        <RoundInfoBanner
          state={currentState}
          submission={currentSubmission}
          round={roundStateByKey.get(currentRound)}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 }}>
          <Text variant="sectionHeader">{ROUND_LABELS[currentRound]}</Text>
          {currentRound === 'group' && canEdit ? (
            <Pressable
              onPress={() => setExpandAllSignal((s) => s + 1)}
              hitSlop={6}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <RNText
                style={{
                  fontFamily: fontFamilies.semibold,
                  fontSize: 13,
                  color: theme.colors.primary,
                }}
              >
                {expandAllSignal % 2 === 1 ? 'Collapse All' : 'Expand All'}
              </RNText>
            </Pressable>
          ) : null}
        </View>

        {currentRound === 'group' ? (
          <GroupStageContent
            matches={stageMatches}
            allMatches={data.matches}
            teams={data.teams}
            predictions={predictions}
            onChange={effectiveUpdatePrediction}
            disabled={!canEdit}
            expandSignal={expandAllSignal}
          />
        ) : (
          <KnockoutStageContent
            matches={stageMatches}
            predictions={predictions}
            bracket={bracket}
            onChange={effectiveUpdatePrediction}
            disabled={!canEdit}
            isFinalsRound={currentRound === 'final' || currentRound === 'third_place'}
          />
        )}
      </ScrollView>

      <SubmitBar
        roundLabel={ROUND_LABELS[currentRound]}
        canEdit={canEdit}
        roundComplete={roundComplete}
        submitting={submitting}
        isSubmitted={isSubmitted}
        onSubmit={handleSubmit}
      />
    </View>
  );
}

function Header({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.sm,
        paddingBottom: theme.spacing.sm,
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
      <Text variant="cardTitle" numberOfLines={1} style={{ flex: 1 }}>
        {title}
      </Text>
    </View>
  );
}

function RoundTabs({
  current,
  roundStateByKey,
  submissions,
  onSelect,
}: {
  current: RoundKey;
  roundStateByKey: Map<RoundKey, PoolRound>;
  submissions: Map<string, EntryRoundSubmission>;
  onSelect: (key: RoundKey) => void;
}) {
  const theme = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: theme.spacing.xs, paddingVertical: 2 }}
    >
      {ROUND_KEYS.map((key) => {
        const state = roundStateByKey.get(key)?.state ?? 'locked';
        const submitted = submissions.get(key)?.hasSubmitted ?? false;
        const isActive = key === current;
        const isLocked = state === 'locked';
        return (
          <Pressable
            key={key}
            onPress={() => onSelect(key)}
            disabled={isLocked}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: theme.radii.pill,
              backgroundColor: isActive
                ? withOpacity(theme.colors.primary, 0.14)
                : isLocked
                  ? withOpacity(theme.colors.mist, 0.5)
                  : theme.colors.mist,
              borderWidth: isActive ? 1 : 0,
              borderColor: isActive ? withOpacity(theme.colors.primary, 0.3) : 'transparent',
              opacity: isLocked ? 0.7 : pressed ? 0.7 : 1,
            })}
          >
            <TabIcon submitted={submitted} locked={isLocked} state={state} />
            <RNText
              style={{
                fontFamily: isActive ? fontFamilies.bold : fontFamilies.semibold,
                fontSize: 12,
                color: isActive
                  ? theme.colors.primary
                  : isLocked
                    ? theme.colors.silver
                    : theme.colors.ink,
              }}
            >
              {TAB_LABELS[key]}
            </RNText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function TabIcon({
  submitted,
  locked,
  state,
}: {
  submitted: boolean;
  locked: boolean;
  state: PoolRound['state'];
}) {
  const theme = useTheme();
  if (submitted) {
    return <Icon name="checkmark.circle.fill" size={11} tint={theme.colors.green} weight="semibold" />;
  }
  if (locked) {
    return <Icon name="lock.fill" size={11} tint={theme.colors.silver} weight="semibold" />;
  }
  if (state === 'completed') {
    return <Icon name="checkmark" size={11} tint={theme.colors.slate} weight="semibold" />;
  }
  return null;
}

function RoundInfoBanner({
  state,
  submission,
  round,
}: {
  state: PoolRound['state'];
  submission: EntryRoundSubmission | undefined;
  round: PoolRound | undefined;
}) {
  const theme = useTheme();
  const isSubmitted = submission?.hasSubmitted ?? false;
  const spec = useMemo(() => {
    if (isSubmitted) {
      return {
        color: theme.colors.green,
        iosIcon: 'checkmark.seal.fill',
        emoji: '✓',
        text: submission?.submittedAt
          ? `Submitted ${formatLong(submission.submittedAt)}`
          : 'Submitted',
      };
    }
    if (state === 'open' && round?.deadline) {
      return {
        color: theme.colors.amber,
        iosIcon: 'clock',
        emoji: '⏰',
        text: `Deadline: ${formatLong(round.deadline)}`,
      };
    }
    if (state === 'completed') {
      return {
        color: theme.colors.slate,
        iosIcon: 'checkmark.circle',
        emoji: '✓',
        text: 'Round Completed',
      };
    }
    if (state === 'locked') {
      return {
        color: theme.colors.slate,
        iosIcon: 'lock.fill',
        emoji: '🔒',
        text: 'Round Locked',
      };
    }
    return null;
  }, [isSubmitted, state, round?.deadline, submission?.submittedAt, theme]);

  if (!spec) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: theme.radii.md,
        backgroundColor: withOpacity(spec.color, 0.12),
      }}
    >
      <Icon name={spec.iosIcon} size={12} tint={spec.color} weight="semibold" />
      <RNText
        style={{
          fontFamily: fontFamilies.semibold,
          fontSize: 12,
          color: spec.color,
          flex: 1,
        }}
      >
        {spec.text}
      </RNText>
    </View>
  );
}

function GroupStageContent({
  matches,
  allMatches,
  teams,
  predictions,
  onChange,
  disabled,
  expandSignal,
}: {
  matches: Match[];
  allMatches: Match[];
  teams: Team[];
  predictions: Map<string, ScoreEntry>;
  onChange: (matchId: string, patch: Partial<ScoreEntry>) => void;
  disabled: boolean;
  expandSignal: number;
}) {
  const theme = useTheme();
  const byGroup = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const l of GROUP_LETTERS) map.set(l, []);
    for (const m of matches) {
      if (m.group_letter) {
        const arr = map.get(m.group_letter) ?? [];
        arr.push(m);
        map.set(m.group_letter, arr);
      }
    }
    for (const arr of map.values()) arr.sort((a, b) => a.match_number - b.match_number);
    return map;
  }, [matches]);

  return (
    <View style={{ gap: theme.spacing.md }}>
      {GROUP_LETTERS.map((letter) => {
        const ms = byGroup.get(letter) ?? [];
        if (ms.length === 0) return null;
        return (
          <GroupCollapsibleSection
            key={letter}
            letter={letter}
            matches={ms}
            teams={teams}
            predictions={predictions}
            onChange={onChange}
            disabled={disabled}
            startExpanded
            expandSignal={expandSignal}
          />
        );
      })}
      <ThirdPlaceTable teams={teams} matches={allMatches} predictions={predictions} />
    </View>
  );
}

function KnockoutStageContent({
  matches,
  predictions,
  bracket,
  onChange,
  disabled,
  isFinalsRound,
}: {
  matches: Match[];
  predictions: Map<string, ScoreEntry>;
  bracket: BracketResult | null;
  onChange: (matchId: string, patch: Partial<ScoreEntry>) => void;
  disabled: boolean;
  isFinalsRound: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.md }}>
      {matches.map((m) => {
        const pred = predictions.get(m.match_id);
        const resolved = bracket?.knockoutTeamMap.get(m.match_number);
        const isFinal = m.stage === 'final';
        return (
          <View
            key={m.match_id}
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radii.lg,
              padding: theme.spacing.xs,
              borderWidth: isFinalsRound && isFinal ? 2 : 0,
              borderColor: isFinalsRound && isFinal ? theme.colors.accent : 'transparent',
              ...theme.shadows.card,
            }}
          >
            {isFinalsRound && isFinal ? (
              <View style={{ paddingHorizontal: theme.spacing.sm, paddingTop: theme.spacing.xs }}>
                <Text variant="caption" color="accent" align="center">
                  Final
                </Text>
              </View>
            ) : null}
            <MatchPredictionRow
              home={{
                countryName:
                  resolved?.home?.country_name ??
                  m.home_team?.country_name ??
                  m.home_team_placeholder ??
                  'TBD',
                flagUrl: resolved?.home?.flag_url ?? m.home_team?.flag_url ?? null,
                subtitle: resolved?.home ? null : m.home_team_placeholder,
              }}
              away={{
                countryName:
                  resolved?.away?.country_name ??
                  m.away_team?.country_name ??
                  m.away_team_placeholder ??
                  'TBD',
                flagUrl: resolved?.away?.flag_url ?? m.away_team?.flag_url ?? null,
                subtitle: resolved?.away ? null : m.away_team_placeholder,
              }}
              homeScore={pred?.home ?? null}
              awayScore={pred?.away ?? null}
              onHomeChange={(n) => onChange(m.match_id, { home: n })}
              onAwayChange={(n) => onChange(m.match_id, { away: n })}
              disabled={disabled}
            />
          </View>
        );
      })}
    </View>
  );
}

function SubmitBar({
  roundLabel,
  canEdit,
  roundComplete,
  submitting,
  isSubmitted,
  onSubmit,
}: {
  roundLabel: string;
  canEdit: boolean;
  roundComplete: boolean;
  submitting: boolean;
  isSubmitted: boolean;
  onSubmit: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  if (isSubmitted) return null;
  if (!canEdit) return null;

  const enabled = roundComplete && !submitting;
  return (
    <Pressable
      onPress={onSubmit}
      disabled={!enabled}
      style={({ pressed }) => ({
        position: 'absolute',
        left: theme.spacing.lg,
        right: theme.spacing.lg,
        bottom: Math.max(theme.spacing.md, insets.bottom),
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        borderRadius: theme.radii.md,
        backgroundColor: withOpacity(theme.colors.primary, enabled ? 0.2 : 0.08),
        borderWidth: 1,
        borderColor: withOpacity(theme.colors.primary, enabled ? 0.3 : 0.1),
        opacity: enabled ? (pressed ? 0.85 : 1) : 0.6,
      })}
    >
      {submitting ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 14,
          color: theme.colors.primary,
        }}
      >
        {submitting
          ? 'Submitting…'
          : roundComplete
            ? `Submit ${roundLabel}`
            : `Complete all picks to submit`}
      </RNText>
    </Pressable>
  );
}

function formatLong(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
