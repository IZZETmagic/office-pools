import { SymbolView } from 'expo-symbols';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text as RNText,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import { recalculatePool } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { usePoolSettings, type PoolSettings } from '@/lib/usePoolSettings';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type EditState = {
  groupExact: number;
  groupDiff: number;
  groupResult: number;
  koExact: number;
  koDiff: number;
  koResult: number;
  r32: number;
  r16: number;
  qf: number;
  sf: number;
  tp: number;
  final: number;
  psoEnabled: boolean;
  psoExact: number;
  psoDiff: number;
  psoResult: number;
  bonusWinRun: number;
  bonusWinOnly: number;
  bonusRunOnly: number;
  bonusBothSwap: number;
  bonusOneWrong: number;
  bonusAll16: number;
  bonus1215: number;
  bonus811: number;
  bonusBracketPair: number;
  bonusMatchWin: number;
  bonusChampion: number;
  bonus2nd: number;
  bonus3rd: number;
  bonusBestPlayer: number;
  bonusTopScorer: number;
};

type BPEditState = {
  bpGroup1st: number;
  bpGroup2nd: number;
  bpGroup3rd: number;
  bpGroup4th: number;
  bpThirdQualifier: number;
  bpThirdEliminated: number;
  bpThirdAllBonus: number;
  bpR32: number;
  bpR16: number;
  bpQf: number;
  bpSf: number;
  bpThirdMatch: number;
  bpFinal: number;
  bpChampionBonus: number;
  bpPenalty: number;
};

const BP_DEFAULTS: BPEditState = {
  bpGroup1st: 4,
  bpGroup2nd: 3,
  bpGroup3rd: 2,
  bpGroup4th: 1,
  bpThirdQualifier: 2,
  bpThirdEliminated: 1,
  bpThirdAllBonus: 10,
  bpR32: 1,
  bpR16: 2,
  bpQf: 4,
  bpSf: 8,
  bpThirdMatch: 10,
  bpFinal: 20,
  bpChampionBonus: 50,
  bpPenalty: 1,
};

function settingsToBPEdit(s: PoolSettings): BPEditState {
  return {
    bpGroup1st: s.bpGroupCorrect1st ?? BP_DEFAULTS.bpGroup1st,
    bpGroup2nd: s.bpGroupCorrect2nd ?? BP_DEFAULTS.bpGroup2nd,
    bpGroup3rd: s.bpGroupCorrect3rd ?? BP_DEFAULTS.bpGroup3rd,
    bpGroup4th: s.bpGroupCorrect4th ?? BP_DEFAULTS.bpGroup4th,
    bpThirdQualifier: s.bpThirdCorrectQualifier ?? BP_DEFAULTS.bpThirdQualifier,
    bpThirdEliminated: s.bpThirdCorrectEliminated ?? BP_DEFAULTS.bpThirdEliminated,
    bpThirdAllBonus: s.bpThirdAllCorrectBonus ?? BP_DEFAULTS.bpThirdAllBonus,
    bpR32: s.bpR32Correct ?? BP_DEFAULTS.bpR32,
    bpR16: s.bpR16Correct ?? BP_DEFAULTS.bpR16,
    bpQf: s.bpQfCorrect ?? BP_DEFAULTS.bpQf,
    bpSf: s.bpSfCorrect ?? BP_DEFAULTS.bpSf,
    bpThirdMatch: s.bpThirdPlaceMatchCorrect ?? BP_DEFAULTS.bpThirdMatch,
    bpFinal: s.bpFinalCorrect ?? BP_DEFAULTS.bpFinal,
    bpChampionBonus: s.bpChampionBonus ?? BP_DEFAULTS.bpChampionBonus,
    bpPenalty: s.bpPenaltyCorrect ?? BP_DEFAULTS.bpPenalty,
  };
}

function bpEditToDbUpdates(e: BPEditState): Record<string, unknown> {
  return {
    bp_group_correct_1st: e.bpGroup1st,
    bp_group_correct_2nd: e.bpGroup2nd,
    bp_group_correct_3rd: e.bpGroup3rd,
    bp_group_correct_4th: e.bpGroup4th,
    bp_third_correct_qualifier: e.bpThirdQualifier,
    bp_third_correct_eliminated: e.bpThirdEliminated,
    bp_third_all_correct_bonus: e.bpThirdAllBonus,
    bp_r32_correct: e.bpR32,
    bp_r16_correct: e.bpR16,
    bp_qf_correct: e.bpQf,
    bp_sf_correct: e.bpSf,
    bp_third_place_match_correct: e.bpThirdMatch,
    bp_final_correct: e.bpFinal,
    bp_champion_bonus: e.bpChampionBonus,
    bp_penalty_correct: e.bpPenalty,
  };
}

const DEFAULTS: EditState = {
  groupExact: 5,
  groupDiff: 3,
  groupResult: 1,
  koExact: 5,
  koDiff: 3,
  koResult: 1,
  r32: 1.0,
  r16: 1.0,
  qf: 1.5,
  sf: 2.0,
  tp: 1.5,
  final: 3.0,
  psoEnabled: true,
  psoExact: 100,
  psoDiff: 75,
  psoResult: 50,
  bonusWinRun: 150,
  bonusWinOnly: 100,
  bonusRunOnly: 50,
  bonusBothSwap: 75,
  bonusOneWrong: 25,
  bonusAll16: 75,
  bonus1215: 50,
  bonus811: 25,
  bonusBracketPair: 25,
  bonusMatchWin: 50,
  bonusChampion: 1000,
  bonus2nd: 25,
  bonus3rd: 25,
  bonusBestPlayer: 100,
  bonusTopScorer: 100,
};

function settingsToEdit(s: PoolSettings): EditState {
  return {
    groupExact: s.groupExactScore,
    groupDiff: s.groupCorrectDifference,
    groupResult: s.groupCorrectResult,
    koExact: s.knockoutExactScore,
    koDiff: s.knockoutCorrectDifference,
    koResult: s.knockoutCorrectResult,
    r32: s.round32Multiplier,
    r16: s.round16Multiplier,
    qf: s.quarterFinalMultiplier,
    sf: s.semiFinalMultiplier,
    tp: s.thirdPlaceMultiplier,
    final: s.finalMultiplier,
    psoEnabled: s.psoEnabled,
    psoExact: s.psoExactScore ?? DEFAULTS.psoExact,
    psoDiff: s.psoCorrectDifference ?? DEFAULTS.psoDiff,
    psoResult: s.psoCorrectResult ?? DEFAULTS.psoResult,
    bonusWinRun: s.bonusGroupWinnerAndRunnerup ?? DEFAULTS.bonusWinRun,
    bonusWinOnly: s.bonusGroupWinnerOnly ?? DEFAULTS.bonusWinOnly,
    bonusRunOnly: s.bonusGroupRunnerupOnly ?? DEFAULTS.bonusRunOnly,
    bonusBothSwap: s.bonusBothQualifySwapped ?? DEFAULTS.bonusBothSwap,
    bonusOneWrong: s.bonusOneQualifiesWrongPosition ?? DEFAULTS.bonusOneWrong,
    bonusAll16: s.bonusAll16Qualified ?? DEFAULTS.bonusAll16,
    bonus1215: s.bonus12_15Qualified ?? DEFAULTS.bonus1215,
    bonus811: s.bonus8_11Qualified ?? DEFAULTS.bonus811,
    bonusBracketPair: s.bonusCorrectBracketPairing ?? DEFAULTS.bonusBracketPair,
    bonusMatchWin: s.bonusMatchWinnerCorrect ?? DEFAULTS.bonusMatchWin,
    bonusChampion: s.bonusChampionCorrect ?? DEFAULTS.bonusChampion,
    bonus2nd: s.bonusSecondPlaceCorrect ?? DEFAULTS.bonus2nd,
    bonus3rd: s.bonusThirdPlaceCorrect ?? DEFAULTS.bonus3rd,
    bonusBestPlayer: s.bonusBestPlayerCorrect ?? DEFAULTS.bonusBestPlayer,
    bonusTopScorer: s.bonusTopScorerCorrect ?? DEFAULTS.bonusTopScorer,
  };
}

function editToDbUpdates(e: EditState): Record<string, unknown> {
  return {
    group_exact_score: e.groupExact,
    group_correct_difference: e.groupDiff,
    group_correct_result: e.groupResult,
    knockout_exact_score: e.koExact,
    knockout_correct_difference: e.koDiff,
    knockout_correct_result: e.koResult,
    round_32_multiplier: e.r32,
    round_16_multiplier: e.r16,
    quarter_final_multiplier: e.qf,
    semi_final_multiplier: e.sf,
    third_place_multiplier: e.tp,
    final_multiplier: e.final,
    pso_enabled: e.psoEnabled,
    pso_exact_score: e.psoExact,
    pso_correct_difference: e.psoDiff,
    pso_correct_result: e.psoResult,
    bonus_group_winner_and_runnerup: e.bonusWinRun,
    bonus_group_winner_only: e.bonusWinOnly,
    bonus_group_runnerup_only: e.bonusRunOnly,
    bonus_both_qualify_swapped: e.bonusBothSwap,
    bonus_one_qualifies_wrong_position: e.bonusOneWrong,
    bonus_all_16_qualified: e.bonusAll16,
    bonus_12_15_qualified: e.bonus1215,
    bonus_8_11_qualified: e.bonus811,
    bonus_correct_bracket_pairing: e.bonusBracketPair,
    bonus_match_winner_correct: e.bonusMatchWin,
    bonus_champion_correct: e.bonusChampion,
    bonus_second_place_correct: e.bonus2nd,
    bonus_third_place_correct: e.bonus3rd,
    bonus_best_player_correct: e.bonusBestPlayer,
    bonus_top_scorer_correct: e.bonusTopScorer,
  };
}

export default function ScoringConfigScreen() {
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const isBP = mode === 'bracket_picker';
  if (isBP) return <BPScoringConfigBody poolId={id} />;
  return <ScoreScoringConfigBody poolId={id} />;
}

function ScoreScoringConfigBody({ poolId }: { poolId: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { settings, loading, refresh } = usePoolSettings(poolId);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [initial, setInitial] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const id = poolId;

  useEffect(() => {
    if (!settings) return;
    const next = settingsToEdit(settings);
    setEdit(next);
    setInitial(next);
  }, [settings]);

  const hasChanges = useMemo(() => {
    if (!edit || !initial) return false;
    return JSON.stringify(edit) !== JSON.stringify(initial);
  }, [edit, initial]);

  function update<K extends keyof EditState>(key: K, value: EditState[K]) {
    setEdit((cur) => (cur ? { ...cur, [key]: value } : cur));
  }

  function handleReset() {
    Alert.alert(
      'Reset to Defaults',
      "This will reset all scoring values to their defaults. You'll still need to save to apply changes.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => setEdit(DEFAULTS),
        },
      ],
    );
  }

  async function handleSave() {
    if (!id || !edit || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase
        .from('pool_settings')
        .update(editToDbUpdates(edit))
        .eq('pool_id', id);
      if (error) throw error;
      setInitial(edit);
      setMessage({ text: 'Scoring saved. Recalculating points…', isError: false });
      try {
        await recalculatePool(id);
        await refresh();
        setMessage({ text: 'Scoring saved. Points recalculated.', isError: false });
      } catch (recalcErr) {
        setMessage({
          text:
            recalcErr instanceof Error
              ? `Saved, but recalculation failed: ${recalcErr.message}`
              : 'Saved, but recalculation failed.',
          isError: true,
        });
      }
      setTimeout(() => setMessage(null), 3500);
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : 'Save failed',
        isError: true,
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading && !edit) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
        <Header insetTop={insets.top} onReset={handleReset} disabled />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </View>
    );
  }

  if (!edit) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
        <Header insetTop={insets.top} onReset={handleReset} disabled />
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.xl,
          }}
        >
          <Text variant="cardTitle" align="center">
            Scoring rules unavailable
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <Header insetTop={insets.top} onReset={handleReset} disabled={false} />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.md,
          paddingBottom: hasChanges || message ? 140 : theme.spacing.xxxl,
          gap: theme.spacing.lg,
        }}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <SectionHeader title="Group Stage" />
          <PointsField label="Exact Score" value={edit.groupExact} onChange={(v) => update('groupExact', v)} />
          <PointsField label="Correct Difference" value={edit.groupDiff} onChange={(v) => update('groupDiff', v)} />
          <PointsField label="Correct Result" value={edit.groupResult} onChange={(v) => update('groupResult', v)} />
        </Card>

        <Card>
          <SectionHeader title="Knockout Stage" />
          <PointsField label="Exact Score" value={edit.koExact} onChange={(v) => update('koExact', v)} />
          <PointsField label="Correct Difference" value={edit.koDiff} onChange={(v) => update('koDiff', v)} />
          <PointsField label="Correct Result" value={edit.koResult} onChange={(v) => update('koResult', v)} />

          <Divider />

          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 13,
              color: theme.colors.slate,
              letterSpacing: 0.3,
              textTransform: 'uppercase',
              marginTop: 4,
            }}
          >
            Round Multipliers
          </RNText>
          <MultiplierField label="Round of 32" value={edit.r32} onChange={(v) => update('r32', v)} />
          <MultiplierField label="Round of 16" value={edit.r16} onChange={(v) => update('r16', v)} />
          <MultiplierField label="Quarter Final" value={edit.qf} onChange={(v) => update('qf', v)} />
          <MultiplierField label="Semi Final" value={edit.sf} onChange={(v) => update('sf', v)} />
          <MultiplierField label="3rd Place" value={edit.tp} onChange={(v) => update('tp', v)} />
          <MultiplierField label="Final" value={edit.final} onChange={(v) => update('final', v)} />
        </Card>

        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="sectionHeader">Penalty Shootout</Text>
            <Toggle value={edit.psoEnabled} onChange={(v) => update('psoEnabled', v)} />
          </View>
          <View style={{ height: 0.5, backgroundColor: withOpacity(theme.colors.silver, 0.6) }} />
          {edit.psoEnabled ? (
            <>
              <PointsField label="Exact Score" value={edit.psoExact} onChange={(v) => update('psoExact', v)} />
              <PointsField label="Correct Difference" value={edit.psoDiff} onChange={(v) => update('psoDiff', v)} />
              <PointsField label="Correct Result" value={edit.psoResult} onChange={(v) => update('psoResult', v)} />
            </>
          ) : (
            <RNText style={{ fontFamily: fontFamilies.regular, fontSize: 13, color: theme.colors.slate }}>
              Penalty shootout scoring is disabled.
            </RNText>
          )}
        </Card>

        <Card>
          <SectionHeader title="Bonus: Group Standings" />
          <PointsField label="Winner & Runner-up" value={edit.bonusWinRun} onChange={(v) => update('bonusWinRun', v)} />
          <PointsField label="Winner Only" value={edit.bonusWinOnly} onChange={(v) => update('bonusWinOnly', v)} />
          <PointsField label="Runner-up Only" value={edit.bonusRunOnly} onChange={(v) => update('bonusRunOnly', v)} />
          <PointsField label="Both Qualify (Swapped)" value={edit.bonusBothSwap} onChange={(v) => update('bonusBothSwap', v)} />
          <PointsField label="One Qualifies (Wrong Pos)" value={edit.bonusOneWrong} onChange={(v) => update('bonusOneWrong', v)} />
        </Card>

        <Card>
          <SectionHeader title="Bonus: Qualification" />
          <PointsField label="All 16 Qualified" value={edit.bonusAll16} onChange={(v) => update('bonusAll16', v)} />
          <PointsField label="12-15 Qualified" value={edit.bonus1215} onChange={(v) => update('bonus1215', v)} />
          <PointsField label="8-11 Qualified" value={edit.bonus811} onChange={(v) => update('bonus811', v)} />
        </Card>

        <Card>
          <SectionHeader title="Bonus: Bracket & Tournament" />
          <PointsField label="Correct Bracket Pairing" value={edit.bonusBracketPair} onChange={(v) => update('bonusBracketPair', v)} />
          <PointsField label="Match Winner Correct" value={edit.bonusMatchWin} onChange={(v) => update('bonusMatchWin', v)} />
          <PointsField label="Champion Correct" value={edit.bonusChampion} onChange={(v) => update('bonusChampion', v)} />
          <PointsField label="2nd Place Correct" value={edit.bonus2nd} onChange={(v) => update('bonus2nd', v)} />
          <PointsField label="3rd Place Correct" value={edit.bonus3rd} onChange={(v) => update('bonus3rd', v)} />
          <PointsField label="Best Player Correct" value={edit.bonusBestPlayer} onChange={(v) => update('bonusBestPlayer', v)} />
          <PointsField label="Top Scorer Correct" value={edit.bonusTopScorer} onChange={(v) => update('bonusTopScorer', v)} />
        </Card>
      </ScrollView>

      {hasChanges || message ? (
        <SaveBar saving={saving} message={message} hasChanges={hasChanges} onSave={handleSave} />
      ) : null}
    </View>
  );
}

function Header({
  insetTop,
  onReset,
  disabled,
}: {
  insetTop: number;
  onReset: () => void;
  disabled: boolean;
}) {
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
        {Platform.OS === 'ios' ? (
          <SymbolView name="chevron.left" size={16} tintColor={theme.colors.ink} weight="semibold" />
        ) : (
          <RNText style={{ fontSize: 18, color: theme.colors.ink }}>‹</RNText>
        )}
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text variant="cardTitle" numberOfLines={1}>
          Scoring Configuration
        </Text>
      </View>
      <Pressable
        onPress={onReset}
        disabled={disabled}
        hitSlop={8}
        style={({ pressed }) => ({
          paddingHorizontal: theme.spacing.sm,
          paddingVertical: 6,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 14,
            color: theme.colors.red,
          }}
        >
          Reset
        </RNText>
      </Pressable>
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

function SectionHeader({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <Text variant="sectionHeader">{title}</Text>
      <View style={{ height: 0.5, backgroundColor: withOpacity(theme.colors.silver, 0.6) }} />
    </View>
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

function PointsField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const theme = useTheme();
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 4,
        gap: theme.spacing.sm,
      }}
    >
      <Text variant="body" color="slate" style={{ flex: 1 }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <TextInput
          value={text}
          onChangeText={(t) => {
            setText(t);
            const parsed = parseInt(t.replace(/[^0-9-]/g, ''), 10);
            if (!Number.isNaN(parsed)) onChange(parsed);
            else if (t === '' || t === '-') onChange(0);
          }}
          keyboardType="number-pad"
          selectTextOnFocus
          style={{
            width: 64,
            paddingHorizontal: 10,
            paddingVertical: 10,
            borderRadius: theme.radii.md,
            backgroundColor: theme.colors.mist,
            fontFamily: fontFamilies.bold,
            fontSize: 14,
            color: theme.colors.ink,
            textAlign: 'right',
            fontVariant: ['tabular-nums'],
          }}
        />
        <RNText
          style={{
            fontFamily: fontFamilies.medium,
            fontSize: 11,
            color: theme.colors.slate,
          }}
        >
          pts
        </RNText>
      </View>
    </View>
  );
}

function MultiplierField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const theme = useTheme();
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 4,
        gap: theme.spacing.sm,
      }}
    >
      <Text variant="body" color="slate" style={{ flex: 1 }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <RNText
          style={{ fontFamily: fontFamilies.regular, fontSize: 14, color: theme.colors.slate }}
        >
          ×
        </RNText>
        <TextInput
          value={text}
          onChangeText={(t) => {
            setText(t);
            const cleaned = t.replace(/[^0-9.]/g, '');
            const parsed = parseFloat(cleaned);
            if (!Number.isNaN(parsed)) onChange(parsed);
            else if (cleaned === '' || cleaned === '.') onChange(0);
          }}
          keyboardType="decimal-pad"
          selectTextOnFocus
          style={{
            width: 54,
            paddingHorizontal: 10,
            paddingVertical: 10,
            borderRadius: theme.radii.md,
            backgroundColor: theme.colors.mist,
            fontFamily: fontFamilies.bold,
            fontSize: 14,
            color: theme.colors.ink,
            textAlign: 'right',
            fontVariant: ['tabular-nums'],
          }}
        />
      </View>
    </View>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={({ pressed }) => ({
        width: 48,
        height: 28,
        borderRadius: 14,
        backgroundColor: value ? theme.colors.primary : theme.colors.silver,
        padding: 2,
        justifyContent: 'center',
        alignItems: value ? 'flex-end' : 'flex-start',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF' }} />
    </Pressable>
  );
}

function SaveBar({
  saving,
  message,
  hasChanges,
  onSave,
}: {
  saving: boolean;
  message: { text: string; isError: boolean } | null;
  hasChanges: boolean;
  onSave: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.sm,
        paddingBottom: Math.max(theme.spacing.md, insets.bottom),
        backgroundColor: withOpacity(theme.colors.snow, 0.95),
        borderTopWidth: 0.5,
        borderTopColor: withOpacity(theme.colors.silver, 0.6),
        gap: theme.spacing.sm,
      }}
    >
      {message ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: 10,
            borderRadius: theme.radii.md,
            backgroundColor: withOpacity(
              message.isError ? theme.colors.red : theme.colors.green,
              0.12,
            ),
          }}
        >
          {Platform.OS === 'ios' ? (
            <SymbolView
              name={message.isError ? 'xmark.circle.fill' : 'checkmark.circle.fill'}
              size={14}
              tintColor={message.isError ? theme.colors.red : theme.colors.green}
              weight="semibold"
              resizeMode="scaleAspectFit"
            />
          ) : (
            <RNText
              style={{
                fontSize: 14,
                color: message.isError ? theme.colors.red : theme.colors.green,
              }}
            >
              {message.isError ? '✕' : '✓'}
            </RNText>
          )}
          <RNText
            style={{
              flex: 1,
              fontFamily: fontFamilies.semibold,
              fontSize: 13,
              color: message.isError ? theme.colors.red : theme.colors.green,
            }}
          >
            {message.text}
          </RNText>
        </View>
      ) : null}
      {hasChanges ? (
        <Pressable
          onPress={onSave}
          disabled={saving}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.sm,
            paddingVertical: 14,
            borderRadius: theme.radii.md,
            backgroundColor: withOpacity(theme.colors.primary, 0.2),
            borderWidth: 1,
            borderColor: withOpacity(theme.colors.primary, 0.3),
            opacity: pressed ? 0.85 : 1,
          })}
        >
          {saving ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
          <RNText
            style={{ fontFamily: fontFamilies.bold, fontSize: 14, color: theme.colors.primary }}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </RNText>
        </Pressable>
      ) : null}
    </View>
  );
}

// =============================================================
// Bracket Picker mode
// =============================================================

function BPScoringConfigBody({ poolId }: { poolId: string }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { settings, loading, refresh } = usePoolSettings(poolId);
  const [edit, setEdit] = useState<BPEditState | null>(null);
  const [initial, setInitial] = useState<BPEditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    if (!settings) return;
    const next = settingsToBPEdit(settings);
    setEdit(next);
    setInitial(next);
  }, [settings]);

  const hasChanges = useMemo(() => {
    if (!edit || !initial) return false;
    return JSON.stringify(edit) !== JSON.stringify(initial);
  }, [edit, initial]);

  function update<K extends keyof BPEditState>(key: K, value: BPEditState[K]) {
    setEdit((cur) => (cur ? { ...cur, [key]: value } : cur));
  }

  function handleReset() {
    Alert.alert(
      'Reset to Defaults',
      "This will reset bracket scoring values to their defaults. You'll still need to save to apply changes.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => setEdit(BP_DEFAULTS),
        },
      ],
    );
  }

  async function handleSave() {
    if (!poolId || !edit || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase
        .from('pool_settings')
        .update(bpEditToDbUpdates(edit))
        .eq('pool_id', poolId);
      if (error) throw error;
      setInitial(edit);
      setMessage({ text: 'Scoring saved. Recalculating points…', isError: false });
      try {
        await recalculatePool(poolId);
        await refresh();
        setMessage({ text: 'Scoring saved. Points recalculated.', isError: false });
      } catch (recalcErr) {
        setMessage({
          text:
            recalcErr instanceof Error
              ? `Saved, but recalculation failed: ${recalcErr.message}`
              : 'Saved, but recalculation failed.',
          isError: true,
        });
      }
      setTimeout(() => setMessage(null), 3500);
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : 'Save failed',
        isError: true,
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading && !edit) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
        <Header insetTop={insets.top} onReset={handleReset} disabled />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </View>
    );
  }

  if (!edit) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
        <Header insetTop={insets.top} onReset={handleReset} disabled />
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.xl,
          }}
        >
          <Text variant="cardTitle" align="center">
            Scoring rules unavailable
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <Header insetTop={insets.top} onReset={handleReset} disabled={false} />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.md,
          paddingBottom: hasChanges || message ? 140 : theme.spacing.xxxl,
          gap: theme.spacing.lg,
        }}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
      >
        <Card>
          <SectionHeader title="Group Stage Rankings" />
          <PointsField
            label="Correct 1st Place"
            value={edit.bpGroup1st}
            onChange={(v) => update('bpGroup1st', v)}
          />
          <PointsField
            label="Correct 2nd Place"
            value={edit.bpGroup2nd}
            onChange={(v) => update('bpGroup2nd', v)}
          />
          <PointsField
            label="Correct 3rd Place"
            value={edit.bpGroup3rd}
            onChange={(v) => update('bpGroup3rd', v)}
          />
          <PointsField
            label="Correct 4th Place"
            value={edit.bpGroup4th}
            onChange={(v) => update('bpGroup4th', v)}
          />
        </Card>

        <Card>
          <SectionHeader title="Third-Place Rankings" />
          <PointsField
            label="Correct Qualifier"
            value={edit.bpThirdQualifier}
            onChange={(v) => update('bpThirdQualifier', v)}
          />
          <PointsField
            label="Correct Eliminated"
            value={edit.bpThirdEliminated}
            onChange={(v) => update('bpThirdEliminated', v)}
          />
          <PointsField
            label="All 8 Qualifiers Bonus"
            value={edit.bpThirdAllBonus}
            onChange={(v) => update('bpThirdAllBonus', v)}
          />
        </Card>

        <Card>
          <SectionHeader title="Knockout Stage" />
          <PointsField
            label="Round of 32"
            value={edit.bpR32}
            onChange={(v) => update('bpR32', v)}
          />
          <PointsField
            label="Round of 16"
            value={edit.bpR16}
            onChange={(v) => update('bpR16', v)}
          />
          <PointsField
            label="Quarter Finals"
            value={edit.bpQf}
            onChange={(v) => update('bpQf', v)}
          />
          <PointsField
            label="Semi Finals"
            value={edit.bpSf}
            onChange={(v) => update('bpSf', v)}
          />
          <PointsField
            label="3rd Place Match"
            value={edit.bpThirdMatch}
            onChange={(v) => update('bpThirdMatch', v)}
          />
          <PointsField
            label="Final"
            value={edit.bpFinal}
            onChange={(v) => update('bpFinal', v)}
          />
        </Card>

        <Card>
          <SectionHeader title="Bonus Points" />
          <PointsField
            label="Champion Correct"
            value={edit.bpChampionBonus}
            onChange={(v) => update('bpChampionBonus', v)}
          />
          <PointsField
            label="Penalty Prediction"
            value={edit.bpPenalty}
            onChange={(v) => update('bpPenalty', v)}
          />
        </Card>
      </ScrollView>

      {hasChanges || message ? (
        <SaveBar saving={saving} message={message} hasChanges={hasChanges} onSave={handleSave} />
      ) : null}
    </View>
  );
}
