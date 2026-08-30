import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text as RNText,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GroupCollapsibleSection, MatchPredictionRow, ThirdPlaceTable } from '@/components/pool-detail';
import { usePoolSettings } from '@/lib/usePoolSettings';
import { Icon, Text } from '@/components/ui';
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
  // ⚠ NO `effectiveSubmitted`. `hasSubmittedPredictions` is set by an entry's
  // first SAVE now, so gating edits on it would freeze a member out of their own
  // round the moment they made one pick. `readOnly` (admin viewing) is the only
  // thing left that closes the form other than the round's own state.
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { data: roundsData, refresh: refreshRounds } = usePoolRounds(poolId);
  // Pool's PSO setting drives whether knockout rows surface penalty score
  // inputs when the user predicts a tie. Falls back to false while
  // settings are loading — better to hide the inputs than to flash them.
  const { settings: poolSettings } = usePoolSettings(poolId);
  const psoEnabled = poolSettings?.psoEnabled ?? false;
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
    // The first round still accepting picks. It used to skip rounds already
    // submitted; nothing is submitted any more, and a completed round is still
    // editable until it locks, so the open round IS the one to land on.
    for (const key of ROUND_KEYS) {
      const state = roundStateByKey.get(key)?.state;
      if (state === 'open' || state === 'in_progress') return key;
    }
    // Fallback: first non-locked round, else group.
    for (const key of ROUND_KEYS) {
      const state = roundStateByKey.get(key)?.state;
      if (state && state !== 'locked') return key;
    }
    return 'group';
  }, [roundStateByKey, submissions]);

  const [currentRound, setCurrentRound] = useState<RoundKey>(firstEditableRound);
  const [expandAllSignal, setExpandAllSignal] = useState(1);
  // ⚠ NO SUBMIT STATE, NO AUTO-ADVANCE. Both went with the button on
  // 2026-08-29. The auto-advance hopped to the next round once a submission
  // landed; with nothing to submit there is no event to hop on, and jumping a
  // member off a round they can still edit would take the screen away from them
  // mid-change.

  // Re-anchor to first editable round when round states first load
  useEffect(() => {
    setCurrentRound(firstEditableRound);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundsData !== null && submissions.size >= 0]);

  const currentState = roundStateByKey.get(currentRound)?.state ?? 'locked';
  const currentSubmission = submissions.get(currentRound);
  const isSubmitted = currentSubmission?.hasSubmitted ?? false;
  // Editable while the round is open. Completing it does not close it — only
  // the round's own state does, which is the database's rule too.
  const canEdit =
    !readOnly && (currentState === 'open' || currentState === 'in_progress');

  const stageMatches = useMemo<Match[]>(() => {
    const stages = ROUND_MATCH_STAGES[currentRound];
    return data.matches.filter((m) => stages.includes(m.stage));
  }, [data.matches, currentRound]);

  const pickedCount = useMemo(
    () => stageMatches.filter((m) => isPredictionComplete(predictions.get(m.match_id))).length,
    [stageMatches, predictions],
  );

  function handleTabPress(key: RoundKey) {
    const state = roundStateByKey.get(key)?.state ?? 'locked';
    if (state === 'locked') return;
    setCurrentRound(key);
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
            onChange={effectiveUpdatePrediction}
            disabled={!canEdit}
            isFinalsRound={currentRound === 'final' || currentRound === 'third_place'}
            psoEnabled={psoEnabled}
          />
        )}
      </ScrollView>

      <ProgressBar
        canEdit={canEdit}
        picked={pickedCount}
        total={stageMatches.length}
        saving={saving}
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
  onChange,
  disabled,
  isFinalsRound,
  psoEnabled,
}: {
  matches: Match[];
  predictions: Map<string, ScoreEntry>;
  onChange: (matchId: string, patch: Partial<ScoreEntry>) => void;
  disabled: boolean;
  isFinalsRound: boolean;
  /** Whether the pool admin enabled PSO scoring. Threaded down so the
   *  row can show penalty inputs only when the user predicts a tie. */
  psoEnabled: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.md }}>
      {matches.map((m) => {
        const pred = predictions.get(m.match_id);
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
              // Progressive pools predict the ACTUAL fixtures, so always show the
              // real assigned teams (set by the advance-teams flow), falling back
              // to the placeholder ("Winner Match N") only until teams are known.
              // Never derive from the member's predicted bracket — that would show
              // a different matchup than the one the score is saved against.
              home={{
                countryName:
                  m.home_team?.country_name ??
                  m.home_team_placeholder ??
                  'TBD',
                flagUrl: m.home_team?.flag_url ?? null,
                subtitle: m.home_team ? null : m.home_team_placeholder,
              }}
              away={{
                countryName:
                  m.away_team?.country_name ??
                  m.away_team_placeholder ??
                  'TBD',
                flagUrl: m.away_team?.flag_url ?? null,
                subtitle: m.away_team ? null : m.away_team_placeholder,
              }}
              homeScore={pred?.home ?? null}
              awayScore={pred?.away ?? null}
              onHomeChange={(n) => onChange(m.match_id, { home: n })}
              onAwayChange={(n) => onChange(m.match_id, { away: n })}
              disabled={disabled}
              psoEnabled={psoEnabled}
              isKnockout
              homePso={pred?.homePso ?? null}
              awayPso={pred?.awayPso ?? null}
              onHomePsoChange={(n) => onChange(m.match_id, { homePso: n })}
              onAwayPsoChange={(n) => onChange(m.match_id, { awayPso: n })}
            />
          </View>
        );
      })}
    </View>
  );
}

/**
 * What the submit button became.
 *
 * It reports two facts and offers no action: how much of the round is picked,
 * and whether the last change reached the server. That is everything the button
 * used to carry in its label ("Submit Matchweek 3" / "7/10 matches predicted"),
 * minus the press — which now has nothing to do, because every pick has already
 * saved itself and the deadline is what closes the round.
 */
function ProgressBar({
  canEdit,
  picked,
  total,
  saving,
}: {
  canEdit: boolean;
  picked: number;
  total: number;
  saving: boolean;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  if (!canEdit || total === 0) return null;

  const complete = picked >= total;
  // Two forms of the same colour: `tintName` for <Icon>, which takes a theme
  // colour NAME, and `tint` for style values, which take the resolved string.
  const tintName = complete ? 'green' : 'primary';
  const tint = complete ? theme.colors.green : theme.colors.primary;

  return (
    <View
      style={{
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
        backgroundColor: withOpacity(tint, 0.12),
        borderWidth: 1,
        borderColor: withOpacity(tint, 0.24),
      }}
    >
      {saving ? <ActivityIndicator size="small" color={tint} /> : null}
      {!saving && complete ? (
        <Icon name="checkmark.circle.fill" size={16} color={tintName} />
      ) : null}
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 14,
          color: tint,
        }}
      >
        {saving
          ? 'Saving\u2026'
          : complete
            ? `All ${total} picked \u00b7 saved`
            : `${picked} of ${total} picked \u00b7 saved`}
      </RNText>
    </View>
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
