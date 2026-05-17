import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text as RNText, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BracketPickerWizard,
  GroupCollapsibleSection,
  MatchPredictionRow,
  ProgressivePredictionWizard,
  StageNavBar,
  StageTitle,
  ThirdPlaceTable,
  WIZARD_STAGES,
  type WizardStage,
} from '@/components/pool-detail';
import { Icon, Text } from '@/components/ui';
import type { BracketResult } from '@/lib/bracket/bracketResolver';
import {
  GROUP_LETTERS,
  type Match,
  type ScoreEntry,
  type Team,
  isPredictionComplete,
} from '@/lib/bracket/tournament';
import { usePredictions } from '@/lib/usePredictions';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

const STAGE_TO_MATCH_STAGES: Record<
  'r32' | 'r16' | 'qf' | 'sf' | 'third_final',
  string[]
> = {
  r32: ['round_32'],
  r16: ['round_16'],
  qf: ['quarter_final'],
  sf: ['semi_final'],
  third_final: ['third_place', 'final'],
};

const STAGE_TITLE: Record<WizardStage, string> = {
  group: 'Group Stage',
  r32: 'Round of 32',
  r16: 'Round of 16',
  qf: 'Quarter Finals',
  sf: 'Semi Finals',
  third_final: '3rd Place & Final',
  summary: 'Review & Submit',
};

const STAGE_SUBTITLE: Record<WizardStage, string> = {
  group: 'Predict scores for groups A–L',
  r32: 'Resolved from your group standings',
  r16: 'Resolved from R32 winners',
  qf: 'Resolved from R16 winners',
  sf: 'Resolved from QF winners',
  third_final: 'The final two matches',
  summary: 'Check your picks then lock them in',
};

export default function PredictionWizard() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id, entryId, viewAs } = useLocalSearchParams<{
    id: string;
    entryId: string;
    viewAs?: string;
  }>();
  const adminView = viewAs === 'admin';
  const { data, loading, error, saving, submitted, predictions, bracket, updatePrediction, submit } =
    usePredictions(id, entryId);
  const [stage, setStage] = useState<WizardStage>('group');
  const [submitting, setSubmitting] = useState(false);
  const [expandAllSignal, setExpandAllSignal] = useState(1);

  const stageMatches = useMemo<Match[]>(() => {
    if (!data) return [];
    if (stage === 'group') return data.matches.filter((m) => m.stage === 'group');
    if (stage === 'summary') return data.matches;
    const stageList = STAGE_TO_MATCH_STAGES[stage as 'r32' | 'r16' | 'qf' | 'sf' | 'third_final'];
    return data.matches.filter((m) => stageList.includes(m.stage));
  }, [data, stage]);

  const allComplete = useMemo(() => {
    if (!data) return false;
    return data.matches.every((m) => isPredictionComplete(predictions.get(m.match_id)));
  }, [data, predictions]);

  const currentStageComplete = useMemo(() => {
    if (!data) return false;
    if (stage === 'summary') return allComplete;
    if (stageMatches.length === 0) return true;
    return stageMatches.every((m) => isPredictionComplete(predictions.get(m.match_id)));
  }, [data, stage, stageMatches, predictions, allComplete]);

  if (loading) {
    return (
      <SafeAreaView edges={[]} style={{ flex: 1, backgroundColor: theme.colors.snow, paddingTop: insets.top }}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !data) {
    return (
      <SafeAreaView edges={[]} style={{ flex: 1, backgroundColor: theme.colors.snow, paddingTop: insets.top }}>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.xl,
            gap: theme.spacing.md,
          }}
        >
          <Text variant="cardTitle" align="center">
            {error ?? 'Predictions unavailable'}
          </Text>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({
              paddingHorizontal: theme.spacing.xl,
              paddingVertical: theme.spacing.md,
              borderRadius: theme.radii.md,
              backgroundColor: theme.colors.primary,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ color: '#FFFFFF', fontFamily: fontFamilies.bold }}>Close</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (data.pool.predictionMode === 'progressive') {
    return (
      <ProgressivePredictionWizard
        poolId={id}
        data={data}
        predictions={predictions}
        bracket={bracket}
        updatePrediction={updatePrediction}
        saving={saving}
        readOnly={adminView}
      />
    );
  }

  if (data.pool.predictionMode === 'bracket_picker') {
    if (!entryId) return null;
    return <BracketPickerWizard poolId={id} entryId={entryId} readOnly={adminView} />;
  }

  const isReadOnly = submitted || adminView;
  const totalCount = data.matches.length;
  const pickedCount = data.matches.filter((m) => isPredictionComplete(predictions.get(m.match_id))).length;

  async function handleSubmit() {
    if (!allComplete) {
      Alert.alert('Not yet', 'Fill in every match before submitting.');
      return;
    }
    Alert.alert(
      'Submit predictions?',
      "You won't be able to edit them after this.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Submit',
          onPress: async () => {
            setSubmitting(true);
            const result = await submit();
            setSubmitting(false);
            if (result.error) {
              Alert.alert("Couldn't submit", result.error);
            } else {
              router.back();
            }
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          paddingHorizontal: theme.spacing.xl,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.sm,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => ({
            width: 36,
            height: 36,
            borderRadius: theme.radii.pill,
            backgroundColor: withOpacity(theme.colors.ink, 0.06),
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Icon name="chevron.left" color="ink" size={16} weight="semibold" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="cardTitle" numberOfLines={1}>
            {data.entry.entryName}
          </Text>
          <StatusLine
            saving={saving}
            submitted={submitted}
            picked={pickedCount}
            total={totalCount}
            adminView={adminView}
          />
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.xl,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.xxxl,
          gap: theme.spacing.lg,
        }}
      >
        <StageTitle
          title={STAGE_TITLE[stage]}
          subtitle={STAGE_SUBTITLE[stage]}
          onToggleAll={stage === 'group' && !isReadOnly ? () => setExpandAllSignal((s) => s + 1) : undefined}
          toggleLabel={stage === 'group' ? (expandAllSignal % 2 === 1 ? 'Collapse All' : 'Expand All') : undefined}
        />

        {stage === 'group' ? (
          <GroupStage
            matches={stageMatches}
            teams={data.teams}
            predictions={predictions}
            disabled={isReadOnly}
            onChange={updatePrediction}
            expandSignal={expandAllSignal}
          />
        ) : stage === 'summary' ? (
          <SummaryStage
            data={data}
            bracket={bracket}
            predictions={predictions}
            allComplete={allComplete}
            isReadOnly={isReadOnly}
            onJumpToStage={setStage}
          />
        ) : (
          <KnockoutStage
            matches={stageMatches}
            predictions={predictions}
            bracket={bracket}
            disabled={isReadOnly}
            onChange={updatePrediction}
            stage={stage as Exclude<WizardStage, 'group' | 'summary'>}
          />
        )}
      </ScrollView>

      <StageNavBar
        stage={stage}
        onStageChange={setStage}
        onSubmit={handleSubmit}
        canSubmit={!isReadOnly && allComplete}
        canAdvance={isReadOnly || currentStageComplete}
        submitting={submitting}
      />
    </SafeAreaView>
  );
}

function StatusLine({
  saving,
  submitted,
  picked,
  total,
  adminView = false,
}: {
  saving: boolean;
  submitted: boolean;
  picked: number;
  total: number;
  adminView?: boolean;
}) {
  const theme = useTheme();
  const iconSize = 11;
  let icon: React.ReactNode = (
    <View style={{ width: iconSize, height: iconSize }} />
  );
  let label = `${picked} / ${total} picked`;
  let color: 'slate' | 'green' | 'primary' = 'slate';
  if (adminView) {
    icon = <Icon name="eye.fill" color="primary" size={iconSize} />;
    label = `Admin view · ${picked} / ${total} picked${
      submitted ? ' · submitted' : ' · draft'
    }`;
    color = 'primary';
  } else if (submitted) {
    icon = <Icon name="checkmark.seal.fill" color="green" size={iconSize} />;
    label = 'Submitted · locked';
    color = 'green';
  } else if (saving) {
    icon = (
      <ActivityIndicator
        size="small"
        color={theme.colors.slate}
        style={{ width: iconSize, height: iconSize, transform: [{ scale: 0.6 }] }}
      />
    );
    label = 'Saving…';
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, height: 16 }}>
      {icon}
      <Text variant="detail" color={color}>
        {label}
      </Text>
    </View>
  );
}

function GroupStage({
  matches,
  teams,
  predictions,
  disabled,
  onChange,
  expandSignal,
}: {
  matches: Match[];
  teams: Team[];
  predictions: Map<string, ScoreEntry>;
  disabled: boolean;
  onChange: (matchId: string, patch: Partial<ScoreEntry>) => void;
  expandSignal: number;
}) {
  const theme = useTheme();
  const byGroup = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const letter of GROUP_LETTERS) map.set(letter, []);
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
      <ThirdPlaceTable teams={teams} matches={matches} predictions={predictions} />
    </View>
  );
}

function KnockoutStage({
  matches,
  predictions,
  bracket,
  disabled,
  onChange,
  stage,
}: {
  matches: Match[];
  predictions: Map<string, ScoreEntry>;
  bracket: BracketResult | null;
  disabled: boolean;
  onChange: (matchId: string, patch: Partial<ScoreEntry>) => void;
  stage: 'r32' | 'r16' | 'qf' | 'sf' | 'third_final';
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
              borderRadius: theme.radii.md,
              padding: theme.spacing.xs,
              borderWidth: isFinal ? 2 : 0,
              borderColor: isFinal ? theme.colors.accent : 'transparent',
              ...theme.shadows.card,
            }}
          >
            {isFinal ? (
              <View style={{ paddingHorizontal: theme.spacing.sm, paddingTop: theme.spacing.xs }}>
                <Text
                  variant="caption"
                  color="accent"
                  align="center"
                >
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

function SummaryStage({
  data,
  bracket,
  predictions,
  allComplete,
  isReadOnly,
  onJumpToStage,
}: {
  data: { matches: Match[] };
  bracket: BracketResult | null;
  predictions: Map<string, ScoreEntry>;
  allComplete: boolean;
  isReadOnly: boolean;
  onJumpToStage: (s: WizardStage) => void;
}) {
  const theme = useTheme();
  const completed = data.matches.filter((m) => isPredictionComplete(predictions.get(m.match_id))).length;
  const total = data.matches.length;
  const champion = bracket?.champion ?? null;

  const stageProgress: Array<{ key: WizardStage; label: string; done: number; total: number }> = useMemo(() => {
    const list: Array<{ key: WizardStage; label: string; done: number; total: number }> = [];
    const groupMs = data.matches.filter((m) => m.stage === 'group');
    list.push({
      key: 'group',
      label: 'Group Stage',
      done: groupMs.filter((m) => isPredictionComplete(predictions.get(m.match_id))).length,
      total: groupMs.length,
    });
    const knockoutStages: Array<{ key: WizardStage; label: string; stages: string[] }> = [
      { key: 'r32', label: 'Round of 32', stages: ['round_32'] },
      { key: 'r16', label: 'Round of 16', stages: ['round_16'] },
      { key: 'qf', label: 'Quarter Finals', stages: ['quarter_final'] },
      { key: 'sf', label: 'Semi Finals', stages: ['semi_final'] },
      { key: 'third_final', label: '3rd Place & Final', stages: ['third_place', 'final'] },
    ];
    for (const k of knockoutStages) {
      const ms = data.matches.filter((m) => k.stages.includes(m.stage));
      list.push({
        key: k.key,
        label: k.label,
        done: ms.filter((m) => isPredictionComplete(predictions.get(m.match_id))).length,
        total: ms.length,
      });
    }
    return list;
  }, [data, predictions]);

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View
        style={{
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingVertical: theme.spacing.xl,
          paddingHorizontal: theme.spacing.lg,
          borderRadius: theme.radii.md,
          backgroundColor: theme.colors.accentLight,
          borderWidth: 1,
          borderColor: withOpacity(theme.colors.accent, 0.3),
        }}
      >
        <Icon name="trophy.fill" color="accent" size={32} />
        <Text variant="sectionHeader" align="center">
          {champion?.country_name ?? 'TBD'}
        </Text>
        <Text variant="detail" color="slate">
          Your predicted champion
        </Text>
      </View>

      {!isReadOnly ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            padding: theme.spacing.md,
            borderRadius: theme.radii.md,
            backgroundColor: theme.colors.mist,
          }}
        >
          <Icon
            name={allComplete ? 'checkmark.circle.fill' : 'exclamationmark.circle.fill'}
            color={allComplete ? 'green' : 'amber'}
            size={22}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="cardTitle">
              {allComplete ? "You're all set" : 'Some matches need scores'}
            </Text>
            <Text variant="body" color="slate">
              {completed} of {total} matches picked
            </Text>
          </View>
        </View>
      ) : null}

      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.md,
          overflow: 'hidden',
          ...theme.shadows.card,
        }}
      >
        {stageProgress.map((s, i) => {
          const complete = s.done === s.total && s.total > 0;
          return (
            <Pressable
              key={s.key}
              onPress={() => onJumpToStage(s.key)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.md,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.md,
                borderTopWidth: i === 0 ? 0 : 0.5,
                borderTopColor: withOpacity(theme.colors.silver, 0.5),
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Icon
                name={complete ? 'checkmark.circle.fill' : 'circle.dashed'}
                color={complete ? 'green' : 'slate'}
                size={18}
              />
              <Text style={{ flex: 1, fontFamily: fontFamilies.bold, fontSize: 14, color: theme.colors.ink }}>
                {s.label}
              </Text>
              <Text variant="detail" color="slate">
                {s.done} / {s.total}
              </Text>
              <Icon name="chevron.right" color="slate" size={11} weight="semibold" />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

