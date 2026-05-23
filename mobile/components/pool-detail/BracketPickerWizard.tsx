import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Switch,
  Text as RNText,
  View,
} from 'react-native';
import {
  NestedReorderableList,
  ScrollViewContainer,
  reorderItems,
  useReorderableDrag,
  type ReorderableListReorderEvent,
} from 'react-native-reorderable-list';
import { runOnJS } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog, Icon, Text } from '@/components/ui';
import type {
  BPGroupRanking,
  BPKnockoutPick,
  BPThirdPlaceRanking,
} from '@/lib/api';
import { resolveFullBracketFromPicks } from '@/lib/bracket/bracketPickerResolver';
import {
  GROUP_LETTERS,
  type GroupStanding,
  type Match,
  type Team,
} from '@/lib/bracket/tournament';
import { useBracketPickerPredictions } from '@/lib/useBracketPickerPredictions';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

export type BPStageKey =
  | 'groups'
  | 'third_place'
  | 'round_32'
  | 'round_16'
  | 'quarter_final'
  | 'semi_final'
  | 'final'
  | 'review';

const STAGE_KEYS: BPStageKey[] = [
  'groups',
  'third_place',
  'round_32',
  'round_16',
  'quarter_final',
  'semi_final',
  'final',
  'review',
];

const STAGE_TAB_LABELS: Record<BPStageKey, string> = {
  groups: 'Groups',
  third_place: '3rd',
  round_32: 'R32',
  round_16: 'R16',
  quarter_final: 'QF',
  semi_final: 'SF',
  final: 'Final',
  review: 'Review',
};

const STAGE_TITLES: Record<BPStageKey, string> = {
  groups: 'Rank Group Stage',
  third_place: 'Rank Third-Place Teams',
  round_32: 'Round of 32',
  round_16: 'Round of 16',
  quarter_final: 'Quarter Finals',
  semi_final: 'Semi Finals',
  final: 'Final & 3rd Place',
  review: 'Review & Submit',
};

const STAGE_SUBTITLES: Record<BPStageKey, string> = {
  groups: 'Use the arrows to set each team’s finishing position',
  third_place: 'Order the third-place teams from most to least likely to advance',
  round_32: 'Pick winners — matchups resolve from your group ranks',
  round_16: 'Pick winners of the previous round',
  quarter_final: 'Pick winners of the previous round',
  semi_final: 'Pick winners of the previous round',
  final: 'Pick your champion and third-place winner',
  review: 'Confirm and submit your bracket',
};

// DB stages that render as knockout matchup screens.
// (The 'third_place' stage tab uses ThirdPlaceCard for the team rankings;
// the actual 3rd-place playoff match is rendered together with the final
// under the 'final' tab — see KnockoutStage.)
const KNOCKOUT_STAGES_DB: string[] = [
  'round_32',
  'round_16',
  'quarter_final',
  'semi_final',
  'final',
];

function stageKeyToDb(key: BPStageKey): string {
  // 'final' stage tab covers both the 3rd-place playoff and the final.
  // KnockoutStage handles that by combining stages internally.
  if (key === 'final') return 'final';
  return key;
}

function triggerPickupHaptic() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
    /* haptics unavailable on simulator/emulator */
  });
}

function triggerSlotCrossHaptic() {
  Haptics.selectionAsync().catch(() => {
    /* haptics unavailable */
  });
}

type Props = {
  poolId: string;
  entryId: string;
  /** Admin read-only view — disables all edits + bottom nav. */
  readOnly?: boolean;
};

export function BracketPickerWizard({ poolId, entryId, readOnly = false }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [currentStage, setCurrentStage] = useState<BPStageKey>('groups');

  const {
    data,
    saving,
    submitted: rawSubmitted,
    groupRankings,
    thirdPlaceRankings,
    knockoutPicks,
    setGroupForLetter,
    setAllThirdPlaceRankings,
    setKnockoutPick,
    submit,
  } = useBracketPickerPredictions(poolId, entryId);
  // Admin view forces a locked state on every editable surface.
  const submitted = rawSubmitted || readOnly;
  const [submitting, setSubmitting] = useState(false);
  // Custom in-app submit dialogs replacing Alert.alert. Same pattern as
  // the full-tournament wizard: a pre-flight "fill everything in" check,
  // a destructive confirmation, and a follow-up error if the server
  // rejects the submit. Single ConfirmDialog instance per state.
  type SubmitDialog =
    | { kind: 'none' }
    | { kind: 'incomplete' }
    | { kind: 'confirm' }
    | { kind: 'error'; message: string };
  const [submitDialog, setSubmitDialog] = useState<SubmitDialog>({ kind: 'none' });

  function handleSubmit() {
    if (!completedStages.has('review')) {
      setSubmitDialog({ kind: 'incomplete' });
      return;
    }
    setSubmitDialog({ kind: 'confirm' });
  }

  async function confirmSubmit() {
    setSubmitting(true);
    const result = await submit();
    setSubmitting(false);
    setSubmitDialog({ kind: 'none' });
    if (result.error) {
      const message = result.error;
      setTimeout(() => setSubmitDialog({ kind: 'error', message }), 100);
    }
  }

  const counts = useMemo(
    () => ({
      groups: groupRankings.length,
      thirdPlace: thirdPlaceRankings.length,
      knockout: knockoutPicks.length,
    }),
    [groupRankings, thirdPlaceRankings, knockoutPicks],
  );

  const teamsByGroup = useMemo(() => {
    const map = new Map<string, Team[]>();
    for (const letter of GROUP_LETTERS) map.set(letter, []);
    for (const t of data?.teams ?? []) {
      if (!t.group_letter) continue;
      const arr = map.get(t.group_letter) ?? [];
      arr.push(t);
      map.set(t.group_letter, arr);
    }
    return map;
  }, [data]);

  // The 12 third-place teams = whichever team the user ranked 3rd in each group.
  // Initial order: by group letter A→L. If user has saved rankings, honor them.
  const thirdPlaceTeams = useMemo<Team[]>(() => {
    if (!data) return [];
    const teamById = new Map(data.teams.map((t) => [t.team_id, t]));
    const thirdByGroup = new Map<string, Team>();
    for (const r of groupRankings) {
      if (r.predicted_position !== 3) continue;
      const t = teamById.get(r.team_id);
      if (t) thirdByGroup.set(r.group_letter, t);
    }
    // Default order by group letter
    const defaultOrder = GROUP_LETTERS.map((l) => thirdByGroup.get(l)).filter(
      (t): t is Team => !!t,
    );

    // If we have saved rankings AND they cover all current third-place teams,
    // use that order.
    const savedByTeamId = new Map(
      thirdPlaceRankings.map((r) => [r.team_id, r.rank]),
    );
    const haveSavedForAll = defaultOrder.every((t) => savedByTeamId.has(t.team_id));
    if (haveSavedForAll && defaultOrder.length > 0) {
      return [...defaultOrder].sort(
        (a, b) =>
          (savedByTeamId.get(a.team_id) ?? 99) - (savedByTeamId.get(b.team_id) ?? 99),
      );
    }
    return defaultOrder;
  }, [data, groupRankings, thirdPlaceRankings]);

  // Resolved knockout bracket: maps match_number → resolved home/away teams.
  const resolvedBracket = useMemo(() => {
    if (!data) {
      return {
        knockoutTeamMap: new Map<
          number,
          { home: GroupStanding | null; away: GroupStanding | null }
        >(),
        champion: null,
        runnerUp: null,
        thirdPlace: null,
      };
    }
    return resolveFullBracketFromPicks({
      groupRankings,
      thirdPlaceRankings,
      knockoutPicks,
      teams: data.teams,
      matches: data.matches,
    });
  }, [data, groupRankings, thirdPlaceRankings, knockoutPicks]);
  const knockoutTeamMap = resolvedBracket.knockoutTeamMap;

  // Lookup of user's picks: match_id → pick
  const knockoutPickByMatchId = useMemo(() => {
    const map = new Map<string, BPKnockoutPick>();
    for (const p of knockoutPicks) map.set(p.match_id, p);
    return map;
  }, [knockoutPicks]);

  // Which stages are fully complete (used for the green check pill on stage tabs).
  const completedStages = useMemo(() => {
    const set = new Set<BPStageKey>();
    if (counts.groups >= 48) set.add('groups');
    if (counts.thirdPlace >= 12) set.add('third_place');
    if (!data) return set;
    const stagePicked = (dbStage: string) => {
      const stageMatches = data.matches.filter((m) => m.stage === dbStage);
      return (
        stageMatches.length > 0 &&
        stageMatches.every((m) => knockoutPickByMatchId.has(m.match_id))
      );
    };
    if (stagePicked('round_32')) set.add('round_32');
    if (stagePicked('round_16')) set.add('round_16');
    if (stagePicked('quarter_final')) set.add('quarter_final');
    if (stagePicked('semi_final')) set.add('semi_final');
    if (stagePicked('third_place') && stagePicked('final')) set.add('final');
    if (
      set.has('groups') &&
      set.has('third_place') &&
      set.has('round_32') &&
      set.has('round_16') &&
      set.has('quarter_final') &&
      set.has('semi_final') &&
      set.has('final')
    ) {
      set.add('review');
    }
    return set;
  }, [counts.groups, counts.thirdPlace, data, knockoutPickByMatchId]);

  // Which stages the user is allowed to navigate to. Walk in order; every
  // completed stage is unlocked, plus the first incomplete stage (the one
  // currently being worked on). Stages after that are locked until earlier
  // ones are finished.
  const unlockedStages = useMemo(() => {
    const set = new Set<BPStageKey>();
    for (const key of STAGE_KEYS) {
      set.add(key);
      if (!completedStages.has(key)) break;
    }
    return set;
  }, [completedStages]);

  // Resume where the user left off the first time data loads: jump to the
  // first incomplete stage, or to 'review' if everything is done. We gate
  // the wizard render on this so the body never flashes 'groups' before
  // jumping to the resume target.
  const [hasResumed, setHasResumed] = useState(false);
  useEffect(() => {
    if (hasResumed) return;
    if (!data) return;
    let resume: BPStageKey = 'review';
    for (const key of STAGE_KEYS) {
      if (!completedStages.has(key)) {
        resume = key;
        break;
      }
    }
    setCurrentStage(resume);
    setHasResumed(true);
  }, [data, completedStages, hasResumed]);

  if (!data || !hasResumed) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.snow,
          paddingTop: insets.top,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow, paddingTop: insets.top }}>
      <Header title={data.entry.entryName} saving={saving} submitted={submitted} />

      <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md }}>
        <StageTabs
          current={currentStage}
          onSelect={setCurrentStage}
          completedStages={completedStages}
          unlockedStages={unlockedStages}
        />
      </View>

      <ScrollViewContainer
        key={currentStage}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.md,
          paddingBottom: insets.bottom + theme.spacing.xxxl,
          gap: theme.spacing.md,
        }}
      >
        {readOnly ? (
          <AdminViewBanner submitted={rawSubmitted} />
        ) : submitted ? (
          <SubmittedBanner />
        ) : null}

        <View style={{ gap: theme.spacing.xxs, paddingTop: theme.spacing.xxs }}>
          <Text variant="sectionHeader">{STAGE_TITLES[currentStage]}</Text>
          <RNText
            style={{
              fontFamily: fontFamilies.regular,
              fontSize: 12,
              color: theme.colors.slate,
            }}
          >
            {STAGE_SUBTITLES[currentStage]}
          </RNText>
        </View>

        {currentStage === 'groups' ? (
          <View style={{ gap: theme.spacing.md }}>
            {GROUP_LETTERS.map((letter) => (
              <GroupRankingCard
                key={letter}
                groupLetter={letter}
                teamsInGroup={teamsByGroup.get(letter) ?? []}
                rankings={groupRankings.filter((r) => r.group_letter === letter)}
                disabled={submitted}
                onChange={(ordered) => setGroupForLetter(letter, ordered)}
              />
            ))}
          </View>
        ) : currentStage === 'third_place' ? (
          <ThirdPlaceCard
            teams={thirdPlaceTeams}
            disabled={submitted}
            onChange={setAllThirdPlaceRankings}
          />
        ) : KNOCKOUT_STAGES_DB.includes(stageKeyToDb(currentStage)) ? (
          <KnockoutStage
            stage={stageKeyToDb(currentStage)}
            matches={data.matches}
            knockoutTeamMap={knockoutTeamMap}
            picksByMatchId={knockoutPickByMatchId}
            disabled={submitted}
            onPick={setKnockoutPick}
          />
        ) : currentStage === 'review' ? (
          <ReviewContent
            champion={resolvedBracket.champion}
            runnerUp={resolvedBracket.runnerUp}
            thirdPlace={resolvedBracket.thirdPlace}
            completedStages={completedStages}
            allComplete={completedStages.has('review')}
            submitted={submitted}
            onJumpTo={setCurrentStage}
          />
        ) : (
          <StagePlaceholder stage={currentStage} counts={counts} />
        )}
      </ScrollViewContainer>

      {!submitted ? (
        <BottomNav
          currentStage={currentStage}
          counts={counts}
          matches={data.matches}
          knockoutPickByMatchId={knockoutPickByMatchId}
          bottomInset={insets.bottom}
          onAdvance={setCurrentStage}
          allComplete={completedStages.has('review')}
          submitting={submitting}
          onSubmit={handleSubmit}
        />
      ) : null}

      {/* Submit dialogs — see SubmitDialog union above. */}
      <ConfirmDialog
        visible={submitDialog.kind === 'incomplete'}
        title="Not yet"
        description="Complete every stage before submitting."
        confirmLabel="OK"
        onConfirm={() => setSubmitDialog({ kind: 'none' })}
      />
      <ConfirmDialog
        visible={submitDialog.kind === 'confirm'}
        title="Submit bracket?"
        description="Once submitted, you can't change your picks."
        confirmLabel="Submit"
        cancelLabel="Cancel"
        destructive
        busy={submitting}
        onConfirm={confirmSubmit}
        onCancel={() => setSubmitDialog({ kind: 'none' })}
      />
      <ConfirmDialog
        visible={submitDialog.kind === 'error'}
        title="Couldn't submit"
        description={
          submitDialog.kind === 'error' ? submitDialog.message : undefined
        }
        confirmLabel="OK"
        onConfirm={() => setSubmitDialog({ kind: 'none' })}
      />
    </View>
  );
}

// =============================================================
// BottomNav — Back + Next buttons (whichever apply per stage)
// =============================================================

const STAGE_ORDER: BPStageKey[] = [
  'groups',
  'third_place',
  'round_32',
  'round_16',
  'quarter_final',
  'semi_final',
  'final',
  'review',
];

const NEXT_STAGE_LABEL: Partial<Record<BPStageKey, string>> = {
  groups: 'Next Round',
  third_place: 'Next Round',
  round_32: 'Next Round',
  round_16: 'Next Round',
  quarter_final: 'Next Round',
  semi_final: 'Next Round',
  final: 'Review',
};

function BottomNav({
  currentStage,
  counts,
  matches,
  knockoutPickByMatchId,
  bottomInset,
  onAdvance,
  allComplete,
  submitting,
  onSubmit,
}: {
  currentStage: BPStageKey;
  counts: { groups: number; thirdPlace: number; knockout: number };
  matches: Match[];
  knockoutPickByMatchId: Map<string, BPKnockoutPick>;
  bottomInset: number;
  onAdvance: (next: BPStageKey) => void;
  allComplete: boolean;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const theme = useTheme();

  function stageMatchesComplete(dbStage: string): boolean {
    const stageMatches = matches.filter((m) => m.stage === dbStage);
    if (stageMatches.length === 0) return false;
    return stageMatches.every((m) => knockoutPickByMatchId.has(m.match_id));
  }

  function currentStageComplete(stage: BPStageKey): boolean {
    if (stage === 'groups') return counts.groups >= 48;
    if (stage === 'third_place') return counts.thirdPlace >= 12;
    if (stage === 'final')
      return stageMatchesComplete('third_place') && stageMatchesComplete('final');
    if (stage === 'review') return false;
    return stageMatchesComplete(stage);
  }

  const currentIdx = STAGE_ORDER.indexOf(currentStage);
  const previousStage = currentIdx > 0 ? STAGE_ORDER[currentIdx - 1] : null;
  const nextStage =
    currentIdx >= 0 && currentIdx < STAGE_ORDER.length - 1
      ? STAGE_ORDER[currentIdx + 1]
      : null;

  const isReview = currentStage === 'review';
  const showNext = !isReview && !!nextStage && currentStageComplete(currentStage);

  // On review: show Back + Submit. Submit is disabled until allComplete.
  if (!previousStage && !showNext && !isReview) return null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.md,
        paddingBottom: bottomInset + theme.spacing.md,
        backgroundColor: theme.colors.snow,
        borderTopWidth: theme.borders.thin,
        borderTopColor: withOpacity(theme.colors.silver, 0.5),
      }}
    >
      {previousStage ? (
        <BackButton
          label="Back"
          flex={isReview || showNext ? 0.7 : 1}
          onPress={() => onAdvance(previousStage)}
        />
      ) : null}
      {isReview ? (
        <SubmitButton
          flex={previousStage ? 1.3 : 1}
          enabled={allComplete && !submitting}
          submitting={submitting}
          onPress={onSubmit}
        />
      ) : showNext ? (
        <NextButton
          label={NEXT_STAGE_LABEL[currentStage] ?? 'Next'}
          flex={previousStage ? 1.3 : 1}
          onPress={() => onAdvance(nextStage)}
        />
      ) : null}
    </View>
  );
}

function SubmitButton({
  flex,
  enabled,
  submitting,
  onPress,
}: {
  flex: number;
  enabled: boolean;
  submitting: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      style={({ pressed }) => ({
        flex,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xs,
        paddingVertical: theme.spacing.md,
        borderRadius: theme.radii.md,
        backgroundColor: enabled ? theme.colors.primary : theme.colors.silver,
        opacity: pressed ? 0.85 : 1,
        ...theme.shadows.card,
      })}
    >
      {submitting ? <ActivityIndicator size="small" color="#FFFFFF" /> : null}
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 15,
          color: '#FFFFFF',
          letterSpacing: 0.2,
        }}
      >
        {submitting ? 'Submitting…' : 'Submit Predictions'}
      </RNText>
    </Pressable>
  );
}

function BackButton({
  label,
  flex,
  onPress,
}: {
  label: string;
  flex: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xs,
        paddingVertical: theme.spacing.md,
        borderRadius: theme.radii.md,
        backgroundColor: withOpacity(theme.colors.ink, 0.06),
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon name="chevron.left" size={12} tint={theme.colors.ink} weight="bold" />
      <RNText
        style={{
          fontFamily: fontFamilies.semibold,
          fontSize: 15,
          color: theme.colors.ink,
          letterSpacing: 0.2,
        }}
      >
        {label}
      </RNText>
    </Pressable>
  );
}

function NextButton({
  label,
  flex,
  onPress,
}: {
  label: string;
  flex: number;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xs,
        paddingVertical: theme.spacing.md,
        borderRadius: theme.radii.md,
        backgroundColor: theme.colors.primary,
        opacity: pressed ? 0.85 : 1,
        ...theme.shadows.card,
      })}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 15,
          color: '#FFFFFF',
          letterSpacing: 0.2,
        }}
      >
        {label}
      </RNText>
      <Icon name="chevron.right" size={12} tint="#FFFFFF" weight="bold" />
    </Pressable>
  );
}

// =============================================================
// KnockoutStage — iOS-style match cards with progress bar
// =============================================================

function KnockoutStage({
  stage,
  matches,
  knockoutTeamMap,
  picksByMatchId,
  disabled,
  onPick,
}: {
  stage: string;
  matches: Match[];
  knockoutTeamMap: Map<number, { home: GroupStanding | null; away: GroupStanding | null }>;
  picksByMatchId: Map<string, BPKnockoutPick>;
  disabled: boolean;
  onPick: (pick: BPKnockoutPick) => void;
}) {
  const theme = useTheme();

  // For the 'final' tab we show both the 3rd-place playoff and the final.
  const stagesToShow = stage === 'final' ? ['third_place', 'final'] : [stage];

  const stageMatches = matches
    .filter((m) => stagesToShow.includes(m.stage))
    .sort((a, b) => a.match_number - b.match_number);

  const pickedCount = stageMatches.filter((m) => picksByMatchId.has(m.match_id)).length;
  const total = stageMatches.length;
  const allPicked = pickedCount === total && total > 0;

  if (stageMatches.length === 0) {
    return (
      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.lg,
          paddingVertical: theme.spacing.xl,
          paddingHorizontal: theme.spacing.lg,
          alignItems: 'center',
        }}
      >
        <RNText
          style={{
            fontFamily: fontFamilies.regular,
            fontSize: 12,
            color: theme.colors.slate,
            textAlign: 'center',
          }}
        >
          No matches found for this stage.
        </RNText>
      </View>
    );
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      {/* Progress header */}
      <View style={{ gap: theme.spacing.sm }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <RNText
            style={{
              fontFamily: fontFamilies.regular,
              fontSize: 14,
              color: theme.colors.slate,
            }}
          >
            <RNText
              style={{ fontFamily: fontFamilies.bold, color: theme.colors.ink }}
            >
              {pickedCount}
            </RNText>
            {` / ${total} matches picked`}
          </RNText>
          {allPicked ? (
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xxs }}
            >
              <Icon name="checkmark.circle.fill" size={12} tint={theme.colors.green} weight="semibold" />
              <RNText
                style={{
                  fontFamily: fontFamilies.semibold,
                  fontSize: 12,
                  color: theme.colors.green,
                }}
              >
                All picked
              </RNText>
            </View>
          ) : null}
        </View>
        {/* Progress bar */}
        <View
          style={{
            height: 6,
            borderRadius: 3,
            backgroundColor: theme.colors.mist,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${total > 0 ? (pickedCount / total) * 100 : 0}%`,
              height: '100%',
              backgroundColor: allPicked ? theme.colors.green : theme.colors.primary,
            }}
          />
        </View>
      </View>

      {/* Match cards */}
      {stageMatches.map((m) => {
        const teams = knockoutTeamMap.get(m.match_number) ?? { home: null, away: null };
        const pick = picksByMatchId.get(m.match_id);
        return (
          <KnockoutMatchCard
            key={m.match_id}
            match={m}
            home={teams.home}
            away={teams.away}
            pick={pick}
            disabled={disabled}
            onPick={onPick}
          />
        );
      })}
    </View>
  );
}

function KnockoutMatchCard({
  match,
  home,
  away,
  pick,
  disabled,
  onPick,
}: {
  match: Match;
  home: GroupStanding | null;
  away: GroupStanding | null;
  pick: BPKnockoutPick | undefined;
  disabled: boolean;
  onPick: (pick: BPKnockoutPick) => void;
}) {
  const theme = useTheme();
  const winnerId = pick?.winner_team_id ?? null;
  const penalty = pick?.predicted_penalty ?? false;
  const bothResolved = !!home && !!away;
  const isFinal = match.stage === 'final';
  const isPicked = !!winnerId;

  function handlePick(team: GroupStanding | null) {
    if (!team || disabled || !bothResolved) return;
    onPick({
      match_id: match.match_id,
      match_number: match.match_number,
      winner_team_id: team.team_id,
      predicted_penalty: penalty,
    });
  }

  function togglePenalty(next: boolean) {
    if (disabled || !winnerId) return;
    onPick({
      match_id: match.match_id,
      match_number: match.match_number,
      winner_team_id: winnerId,
      predicted_penalty: next,
    });
  }

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.md,
        borderWidth: isFinal ? theme.borders.accent : theme.borders.thin,
        borderColor: isFinal
          ? withOpacity(theme.colors.accent, 0.5)
          : theme.colors.silver,
        opacity: bothResolved ? 1 : 0.5,
        overflow: 'hidden',
      }}
    >
      {/* Header row: "Match N" + "Picked" pill */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: theme.spacing.md,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.sm,
        }}
      >
        <RNText
          style={{
            fontFamily: fontFamilies.regular,
            fontSize: 12,
            color: theme.colors.slate,
          }}
        >
          {match.stage === 'third_place'
            ? '3rd Place Playoff'
            : match.stage === 'final'
              ? 'Final'
              : `Match ${match.match_number}`}
        </RNText>
        {isPicked ? (
          <View
            style={{
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: theme.spacing.xxs,
              borderRadius: theme.radii.sm,
              backgroundColor: theme.colors.greenLight,
            }}
          >
            <RNText
              style={{
                fontFamily: fontFamilies.semibold,
                fontSize: 10,
                color: theme.colors.green,
                letterSpacing: 0.2,
              }}
            >
              Picked
            </RNText>
          </View>
        ) : null}
      </View>

      {/* Body: two team pill buttons with "vs" between */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          paddingBottom: bothResolved ? theme.spacing.sm : theme.spacing.md,
        }}
      >
        <BPTeamPill
          team={home}
          placeholder={match.home_team_placeholder}
          selected={!!home && winnerId === home.team_id}
          disabled={disabled || !bothResolved}
          onPress={() => handlePick(home)}
        />
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 11,
            color: theme.colors.slate,
            letterSpacing: 0.4,
          }}
        >
          vs
        </RNText>
        <BPTeamPill
          team={away}
          placeholder={match.away_team_placeholder}
          selected={!!away && winnerId === away.team_id}
          disabled={disabled || !bothResolved}
          onPress={() => handlePick(away)}
        />
      </View>

      {/* Footer: penalty toggle (only when both teams resolved & editable) */}
      {bothResolved && !disabled ? (
        <View>
          <View
            style={{
              height: theme.borders.thin,
              backgroundColor: withOpacity(theme.colors.silver, 0.5),
              marginTop: theme.spacing.xs,
            }}
          />
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
            }}
          >
            <RNText
              style={{
                fontFamily: fontFamilies.regular,
                fontSize: 12,
                color: theme.colors.slate,
              }}
            >
              Goes to penalties?
            </RNText>
            <Switch
              value={penalty}
              onValueChange={togglePenalty}
              disabled={!winnerId}
              trackColor={{
                false: withOpacity(theme.colors.silver, 0.6),
                true: theme.colors.primary,
              }}
            />
          </View>
        </View>
      ) : bothResolved && disabled && penalty ? (
        <View style={{ alignItems: 'center', paddingVertical: theme.spacing.xs }}>
          <RNText
            style={{
              fontFamily: fontFamilies.regular,
              fontSize: 11,
              color: theme.colors.primary,
            }}
          >
            Predicted penalties
          </RNText>
        </View>
      ) : null}
    </View>
  );
}

function BPTeamPill({
  team,
  placeholder,
  selected,
  disabled,
  onPress,
}: {
  team: GroupStanding | null;
  placeholder: string | null;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const isTBD = !team;
  const displayName = team?.country_name ?? placeholder ?? 'TBD';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs + theme.spacing.xxs,
        paddingHorizontal: theme.spacing.sm + theme.spacing.xxs,
        paddingVertical: theme.spacing.sm + theme.spacing.xxs,
        borderRadius: theme.radii.sm,
        backgroundColor: selected ? theme.colors.greenLight : theme.colors.mist,
        // Border is always rendered to keep dimensions constant — only its
        // color changes on select, so the pill (and its neighbours) don't shift.
        borderWidth: theme.borders.accent,
        borderColor: selected ? theme.colors.green : 'transparent',
        opacity: isTBD ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <BPFlag url={team?.flag_url} />
      <RNText
        style={{
          flex: 1,
          fontFamily: fontFamilies.semibold,
          fontSize: 13,
          color: isTBD ? theme.colors.slate : theme.colors.ink,
          letterSpacing: 0.1,
        }}
        numberOfLines={1}
      >
        {displayName}
      </RNText>
      {selected ? (
        <Icon name="checkmark.circle.fill" size={16} tint={theme.colors.green} weight="semibold" />
      ) : null}
    </Pressable>
  );
}

// Slightly larger flag (28×20) for knockout team pills, matching iOS.
function BPFlag({ url }: { url: string | null | undefined }) {
  const theme = useTheme();
  if (!url) {
    return (
      <View
        style={{
          width: 28,
          height: 20,
          borderRadius: 3,
          backgroundColor: theme.colors.silver,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <RNText style={{ fontSize: 9, color: theme.colors.slate }}>?</RNText>
      </View>
    );
  }
  return (
    <Image
      source={{ uri: url }}
      style={{
        width: 28,
        height: 20,
        borderRadius: 3,
        backgroundColor: theme.colors.silver,
      }}
      resizeMode="cover"
    />
  );
}

function Header({
  title,
  saving,
  submitted,
}: {
  title: string;
  saving: boolean;
  submitted: boolean;
}) {
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
        hitSlop={theme.spacing.md}
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
        <Icon name="chevron.left" size={16} tint={theme.colors.ink} weight="semibold" />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text variant="cardTitle" numberOfLines={1}>
          {title}
        </Text>
        <RNText
          style={{
            fontFamily: fontFamilies.semibold,
            fontSize: 11,
            color: submitted ? theme.colors.green : theme.colors.slate,
          }}
        >
          {submitted ? 'Submitted' : saving ? 'Saving…' : 'Auto-saving'}
        </RNText>
      </View>
    </View>
  );
}

function StageTabs({
  current,
  onSelect,
  completedStages,
  unlockedStages,
}: {
  current: BPStageKey;
  onSelect: (key: BPStageKey) => void;
  completedStages: Set<BPStageKey>;
  unlockedStages: Set<BPStageKey>;
}) {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView | null>(null);
  // Per-chip layout (x position + width) keyed by stage. Used to keep the
  // active chip visible by auto-scrolling on stage change.
  const layoutsRef = useRef<Map<BPStageKey, { x: number; width: number }>>(new Map());
  const containerWidthRef = useRef(0);

  useEffect(() => {
    const layout = layoutsRef.current.get(current);
    const containerWidth = containerWidthRef.current;
    if (!layout || containerWidth === 0) return;
    // Centre the active chip when possible; clamp at 0 (don't over-scroll left).
    const target = Math.max(0, layout.x - (containerWidth - layout.width) / 2);
    scrollRef.current?.scrollTo({ x: target, animated: true });
  }, [current]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      onLayout={(e) => {
        containerWidthRef.current = e.nativeEvent.layout.width;
      }}
      contentContainerStyle={{ gap: theme.spacing.xs, paddingVertical: theme.spacing.xxs }}
    >
      {STAGE_KEYS.map((key) => {
        const isActive = key === current;
        const complete = completedStages.has(key);
        const locked = !isActive && !unlockedStages.has(key);
        return (
          <Pressable
            key={key}
            onPress={() => onSelect(key)}
            onLayout={(e) => {
              const { x, width } = e.nativeEvent.layout;
              layoutsRef.current.set(key, { x, width });
            }}
            disabled={locked}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.xs,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
              borderRadius: theme.radii.pill,
              backgroundColor: isActive
                ? withOpacity(theme.colors.primary, 0.14)
                : theme.colors.mist,
              borderWidth: isActive ? theme.borders.standard : 0,
              borderColor: isActive
                ? withOpacity(theme.colors.primary, 0.3)
                : 'transparent',
              opacity: locked ? 0.45 : pressed ? 0.7 : 1,
            })}
          >
            {locked ? (
              <Icon name="lock.fill" size={11} tint={theme.colors.slate} weight="semibold" />
            ) : complete ? (
              <Icon name="checkmark.circle.fill" size={11} tint={theme.colors.green} weight="semibold" />
            ) : null}
            <RNText
              style={{
                fontFamily: isActive ? fontFamilies.bold : fontFamilies.semibold,
                fontSize: 12,
                color: locked
                  ? theme.colors.slate
                  : isActive
                    ? theme.colors.primary
                    : theme.colors.ink,
              }}
            >
              {STAGE_TAB_LABELS[key]}
            </RNText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}


function SubmittedBanner() {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radii.md,
        backgroundColor: withOpacity(theme.colors.green, 0.12),
      }}
    >
      <Icon name="checkmark.seal.fill" size={12} tint={theme.colors.green} weight="semibold" />
      <RNText
        style={{
          fontFamily: fontFamilies.semibold,
          fontSize: 12,
          color: theme.colors.green,
        }}
      >
        Bracket submitted — locked
      </RNText>
    </View>
  );
}

function AdminViewBanner({ submitted }: { submitted: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radii.md,
        backgroundColor: withOpacity(theme.colors.primary, 0.12),
      }}
    >
      <Icon name="eye.fill" size={12} tint={theme.colors.primary} weight="semibold" />
      <RNText
        style={{
          fontFamily: fontFamilies.semibold,
          fontSize: 12,
          color: theme.colors.primary,
        }}
      >
        Admin view — read-only{submitted ? ' · submitted bracket' : ' · draft bracket'}
      </RNText>
    </View>
  );
}

function StagePlaceholder({
  stage,
  counts,
}: {
  stage: BPStageKey;
  counts: { groups: number; thirdPlace: number; knockout: number };
}) {
  const theme = useTheme();
  let summary = '';
  switch (stage) {
    case 'third_place':
      summary = `${counts.thirdPlace} / 12 third-place rankings saved`;
      break;
    case 'round_32':
    case 'round_16':
    case 'quarter_final':
    case 'semi_final':
    case 'final':
      summary = `${counts.knockout} / 32 knockout picks saved (across all stages)`;
      break;
    case 'review':
      summary = `Groups ${counts.groups}/48 · Third ${counts.thirdPlace}/12 · Knockout ${counts.knockout}/32`;
      break;
    case 'groups':
    default:
      summary = '';
  }

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        paddingVertical: theme.spacing.xl,
        paddingHorizontal: theme.spacing.lg,
        alignItems: 'center',
        gap: theme.spacing.sm,
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.semibold,
          fontSize: 13,
          color: theme.colors.slate,
          textAlign: 'center',
        }}
      >
        {summary}
      </RNText>
      <RNText
        style={{
          fontFamily: fontFamilies.regular,
          fontSize: 12,
          color: theme.colors.slate,
          textAlign: 'center',
        }}
      >
        Editor for this stage lands in the next pass.
      </RNText>
    </View>
  );
}

// =============================================================
// ReviewContent — final review screen with champion + checklist
// =============================================================

function ReviewContent({
  champion,
  runnerUp,
  thirdPlace,
  completedStages,
  allComplete,
  submitted,
  onJumpTo,
}: {
  champion: GroupStanding | null;
  runnerUp: GroupStanding | null;
  thirdPlace: GroupStanding | null;
  completedStages: Set<BPStageKey>;
  allComplete: boolean;
  submitted: boolean;
  onJumpTo: (stage: BPStageKey) => void;
}) {
  const theme = useTheme();
  const completedCount = STAGE_KEYS.filter(
    (k) => k !== 'review' && completedStages.has(k),
  ).length;
  const totalCount = STAGE_KEYS.length - 1; // exclude review itself
  const remaining = totalCount - completedCount;

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <ChampionCard champion={champion} runnerUp={runnerUp} thirdPlace={thirdPlace} />

      {!submitted ? (
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
            name={allComplete ? 'checkmark.circle.fill' : 'circle.dashed'}
            size={20}
            tint={allComplete ? theme.colors.green : theme.colors.amber}
            weight="semibold"
          />
          <View style={{ flex: 1 }}>
            <RNText
              style={{
                fontFamily: fontFamilies.bold,
                fontSize: 14,
                color: theme.colors.ink,
              }}
            >
              {allComplete
                ? 'Your bracket is ready to submit'
                : `${completedCount} of ${totalCount} stages complete`}
            </RNText>
            {!allComplete ? (
              <RNText
                style={{
                  fontFamily: fontFamilies.regular,
                  fontSize: 12,
                  color: theme.colors.slate,
                }}
              >
                {remaining} {remaining === 1 ? 'stage' : 'stages'} remaining
              </RNText>
            ) : null}
          </View>
        </View>
      ) : null}

      <StageChecklist
        completedStages={completedStages}
        submitted={submitted}
        onJumpTo={onJumpTo}
      />
    </View>
  );
}

function ChampionCard({
  champion,
  runnerUp,
  thirdPlace,
}: {
  champion: GroupStanding | null;
  runnerUp: GroupStanding | null;
  thirdPlace: GroupStanding | null;
}) {
  const theme = useTheme();

  if (!champion) {
    return (
      <View
        style={{
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingVertical: theme.spacing.xl,
          paddingHorizontal: theme.spacing.lg,
          borderRadius: theme.radii.md,
          backgroundColor: theme.colors.mist,
        }}
      >
        <Icon name="trophy.fill" size={28} tint={theme.colors.slate} weight="regular" />
        <RNText
          style={{
            fontFamily: fontFamilies.semibold,
            fontSize: 13,
            color: theme.colors.slate,
            textAlign: 'center',
          }}
        >
          No champion predicted yet
        </RNText>
        <RNText
          style={{
            fontFamily: fontFamilies.regular,
            fontSize: 12,
            color: theme.colors.slate,
            textAlign: 'center',
          }}
        >
          Complete the knockout picks to see your champion here.
        </RNText>
      </View>
    );
  }

  return (
    <View
      style={{
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.xl,
        paddingHorizontal: theme.spacing.lg,
        borderRadius: theme.radii.md,
        backgroundColor: theme.colors.accentLight,
        borderWidth: theme.borders.standard,
        borderColor: withOpacity(theme.colors.accent, 0.3),
      }}
    >
      <Icon name="trophy.fill" size={36} tint={theme.colors.accent} weight="semibold" />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
        }}
      >
        <Image
          source={{ uri: champion.flag_url ?? undefined }}
          style={{
            width: 36,
            height: 26,
            borderRadius: 3,
            backgroundColor: theme.colors.mist,
          }}
          resizeMode="cover"
        />
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 20,
            color: theme.colors.ink,
            letterSpacing: 0.2,
          }}
          numberOfLines={1}
        >
          {champion.country_name}
        </RNText>
      </View>
      <RNText
        style={{
          fontFamily: fontFamilies.regular,
          fontSize: 12,
          color: theme.colors.slate,
        }}
      >
        Your predicted champion
      </RNText>
      {(runnerUp || thirdPlace) ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.lg,
            paddingTop: theme.spacing.xs,
          }}
        >
          {runnerUp ? (
            <PodiumSpot label="2nd" team={runnerUp} />
          ) : null}
          {thirdPlace ? (
            <PodiumSpot label="3rd" team={thirdPlace} />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function PodiumSpot({ label, team }: { label: string; team: GroupStanding }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xxs }}>
      <RNText
        style={{
          fontFamily: fontFamilies.semibold,
          fontSize: 10,
          color: theme.colors.slate,
          letterSpacing: 0.4,
        }}
      >
        {label}
      </RNText>
      <Image
        source={{ uri: team.flag_url ?? undefined }}
        style={{
          width: 20,
          height: 14,
          borderRadius: 2,
          backgroundColor: theme.colors.mist,
        }}
        resizeMode="cover"
      />
      <RNText
        style={{
          fontFamily: fontFamilies.semibold,
          fontSize: 12,
          color: theme.colors.ink,
        }}
        numberOfLines={1}
      >
        {team.country_name}
      </RNText>
    </View>
  );
}

function StageChecklist({
  completedStages,
  submitted,
  onJumpTo,
}: {
  completedStages: Set<BPStageKey>;
  submitted: boolean;
  onJumpTo: (stage: BPStageKey) => void;
}) {
  const theme = useTheme();
  const stages = STAGE_KEYS.filter((k) => k !== 'review');
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.md,
        borderWidth: theme.borders.thin,
        borderColor: theme.colors.silver,
        overflow: 'hidden',
      }}
    >
      {stages.map((key, idx) => {
        const complete = completedStages.has(key);
        const isLast = idx === stages.length - 1;
        return (
          <View
            key={key}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.md,
              borderBottomWidth: isLast ? 0 : theme.borders.thin,
              borderBottomColor: withOpacity(theme.colors.silver, 0.5),
            }}
          >
            <Icon
              name={complete ? 'checkmark.circle.fill' : 'circle'}
              size={18}
              tint={complete ? theme.colors.green : theme.colors.slate}
              weight="semibold"
            />
            <RNText
              style={{
                flex: 1,
                fontFamily: fontFamilies.semibold,
                fontSize: 14,
                color: theme.colors.ink,
              }}
            >
              {STAGE_TITLES[key]}
            </RNText>
            <Pressable
              onPress={() => onJumpTo(key)}
              hitSlop={theme.spacing.xs}
              style={({ pressed }) => ({
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.xs + theme.spacing.xxs,
                borderRadius: theme.radii.pill,
                backgroundColor: withOpacity(theme.colors.ink, 0.06),
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <RNText
                style={{
                  fontFamily: fontFamilies.semibold,
                  fontSize: 12,
                  color: theme.colors.ink,
                }}
              >
                {submitted ? 'View' : 'Edit'}
              </RNText>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

// =============================================================
// GroupRankingCard — drag-to-reorder via react-native-reorderable-list
// =============================================================

const GROUP_ROW_HEIGHT = 52;

function GroupRankingCard({
  groupLetter,
  teamsInGroup,
  rankings,
  disabled,
  onChange,
}: {
  groupLetter: string;
  teamsInGroup: Team[];
  rankings: BPGroupRanking[];
  disabled: boolean;
  onChange: (next: BPGroupRanking[]) => void;
}) {
  const theme = useTheme();

  const orderedTeams = useMemo<Team[]>(() => {
    if (teamsInGroup.length === 0) return [];
    const rankByTeam = new Map(rankings.map((r) => [r.team_id, r.predicted_position]));
    const haveRanks = teamsInGroup.every((t) => rankByTeam.has(t.team_id));
    if (haveRanks) {
      return [...teamsInGroup].sort((a, b) => {
        const ra = rankByTeam.get(a.team_id) ?? 99;
        const rb = rankByTeam.get(b.team_id) ?? 99;
        return ra - rb;
      });
    }
    return [...teamsInGroup].sort((a, b) =>
      (a.country_name ?? '').localeCompare(b.country_name ?? ''),
    );
  }, [teamsInGroup, rankings]);

  const complete = rankings.length === teamsInGroup.length && teamsInGroup.length > 0;

  function handleReorder({ from, to }: ReorderableListReorderEvent) {
    if (disabled) return;
    const next = reorderItems(orderedTeams, from, to);
    const newRankings: BPGroupRanking[] = next.map((t, i) => ({
      team_id: t.team_id,
      group_letter: groupLetter,
      predicted_position: i + 1,
    }));
    onChange(newRankings);
  }

  const handleDragStart = useCallback(() => {
    'worklet';
    runOnJS(triggerPickupHaptic)();
  }, []);

  const handleIndexChange = useCallback(() => {
    'worklet';
    runOnJS(triggerSlotCrossHaptic)();
  }, []);

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        overflow: 'hidden',
        ...theme.shadows.card,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.md,
          backgroundColor: theme.colors.mist,
          borderBottomWidth: theme.borders.thin,
          borderBottomColor: withOpacity(theme.colors.silver, 0.5),
        }}
      >
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 15,
            color: theme.colors.ink,
            letterSpacing: 0.2,
          }}
        >
          Group {groupLetter}
        </RNText>
        {complete ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xxs }}>
            <Icon name="checkmark.circle.fill" size={12} tint={theme.colors.green} weight="semibold" />
            <RNText
              style={{
                fontFamily: fontFamilies.semibold,
                fontSize: 11,
                color: theme.colors.green,
              }}
            >
              Ranked
            </RNText>
          </View>
        ) : null}
      </View>

      {orderedTeams.length === 0 ? (
        <View
          style={{
            paddingVertical: theme.spacing.lg,
            paddingHorizontal: theme.spacing.md,
            alignItems: 'center',
          }}
        >
          <RNText
            style={{
              fontFamily: fontFamilies.regular,
              fontSize: 12,
              color: theme.colors.slate,
            }}
          >
            No teams found for Group {groupLetter}
          </RNText>
        </View>
      ) : (
        <NestedReorderableList
          data={orderedTeams}
          keyExtractor={(t) => t.team_id}
          renderItem={({ item, index }) => (
            <GroupRankingRow team={item} position={index + 1} disabled={disabled} />
          )}
          onReorder={handleReorder}
          onDragStart={handleDragStart}
          onIndexChange={handleIndexChange}
          scrollable={false}
          dragEnabled={!disabled}
          style={{ height: GROUP_ROW_HEIGHT * orderedTeams.length }}
        />
      )}
    </View>
  );
}

function GroupRankingRow({
  team,
  position,
  disabled,
}: {
  team: Team;
  position: number;
  disabled: boolean;
}) {
  const theme = useTheme();
  const drag = useReorderableDrag();
  return (
    <View
      style={{
        height: GROUP_ROW_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        borderTopWidth: theme.borders.thin,
        borderTopColor: withOpacity(theme.colors.silver, 0.3),
        backgroundColor: theme.colors.surface,
      }}
    >
      <PositionBadge position={position} />
      <Flag url={team.flag_url} />
      <RNText
        style={{
          flex: 1,
          fontFamily: fontFamilies.bold,
          fontSize: 15,
          color: theme.colors.ink,
          letterSpacing: 0.1,
        }}
        numberOfLines={1}
      >
        {team.country_name}
      </RNText>
      <Pressable
        onLongPress={disabled ? undefined : drag}
        delayLongPress={250}
        disabled={disabled}
        hitSlop={theme.spacing.md}
        accessibilityLabel="Drag to reorder"
        accessibilityRole="button"
        style={({ pressed }) => ({
          padding: theme.spacing.sm,
          opacity: pressed ? 0.5 : 1,
        })}
      >
        <Icon name="line.3.horizontal" size={18} tint={theme.colors.silver} weight="semibold" />
      </Pressable>
    </View>
  );
}

// =============================================================
// ThirdPlaceCard — drag-to-rank 12 third-place teams
// =============================================================

const TP_ROW_HEIGHT = 64;
const QUAL_LINE_HEIGHT = 28;

function ThirdPlaceCard({
  teams,
  disabled,
  onChange,
}: {
  teams: Team[];
  disabled: boolean;
  onChange: (next: BPThirdPlaceRanking[]) => void;
}) {
  const theme = useTheme();

  function handleReorder({ from, to }: ReorderableListReorderEvent) {
    if (disabled) return;
    const next = reorderItems(teams, from, to);
    const ranks: BPThirdPlaceRanking[] = next.map((t, i) => ({
      team_id: t.team_id,
      group_letter: t.group_letter,
      rank: i + 1,
    }));
    onChange(ranks);
  }

  const handleDragStart = useCallback(() => {
    'worklet';
    runOnJS(triggerPickupHaptic)();
  }, []);

  const handleIndexChange = useCallback(() => {
    'worklet';
    runOnJS(triggerSlotCrossHaptic)();
  }, []);

  if (teams.length === 0) {
    return (
      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.lg,
          paddingVertical: theme.spacing.xl,
          paddingHorizontal: theme.spacing.lg,
          alignItems: 'center',
          gap: theme.spacing.sm,
        }}
      >
        <RNText
          style={{
            fontFamily: fontFamilies.semibold,
            fontSize: 13,
            color: theme.colors.slate,
            textAlign: 'center',
          }}
        >
          Rank your 3rd-place picks for every group first.
        </RNText>
        <RNText
          style={{
            fontFamily: fontFamilies.regular,
            fontSize: 12,
            color: theme.colors.slate,
            textAlign: 'center',
          }}
        >
          The 12 teams you ranked 3rd in their group will appear here.
        </RNText>
      </View>
    );
  }

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        overflow: 'hidden',
        ...theme.shadows.card,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.md,
          backgroundColor: theme.colors.mist,
          borderBottomWidth: theme.borders.thin,
          borderBottomColor: withOpacity(theme.colors.silver, 0.5),
        }}
      >
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 15,
            color: theme.colors.ink,
            letterSpacing: 0.2,
          }}
        >
          Third-Place Rankings
        </RNText>
        <RNText
          style={{
            fontFamily: fontFamilies.semibold,
            fontSize: 11,
            color: theme.colors.slate,
          }}
        >
          Top 8 advance
        </RNText>
      </View>

      <View
        style={{
          position: 'relative',
          height: TP_ROW_HEIGHT * teams.length + QUAL_LINE_HEIGHT,
        }}
      >
        <NestedReorderableList
          data={teams}
          keyExtractor={(t) => t.team_id}
          renderItem={({ item, index }) => (
            <ThirdPlaceRow team={item} rank={index + 1} isCutoff={index === 7} />
          )}
          onReorder={handleReorder}
          onDragStart={handleDragStart}
          onIndexChange={handleIndexChange}
          scrollable={false}
          dragEnabled={!disabled}
          style={{ height: TP_ROW_HEIGHT * teams.length + QUAL_LINE_HEIGHT }}
        />
      </View>
    </View>
  );
}

function ThirdPlaceRow({
  team,
  rank,
  isCutoff,
}: {
  team: Team;
  rank: number;
  isCutoff: boolean;
}) {
  const theme = useTheme();
  const drag = useReorderableDrag();
  const qualifies = rank <= 8;
  const rankColor = qualifies ? theme.colors.green : theme.colors.red;
  const rankBg = qualifies ? theme.colors.greenLight : theme.colors.redLight;

  return (
    <View>
      <View
        style={{
          height: TP_ROW_HEIGHT,
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          borderTopWidth: rank === 1 ? 0 : theme.borders.thin,
          borderTopColor: withOpacity(theme.colors.silver, 0.3),
          backgroundColor: theme.colors.surface,
          opacity: qualifies ? 1 : 0.7,
        }}
      >
        {/* Rank badge */}
        <View
          style={{
            width: 32,
            paddingVertical: theme.spacing.xxs + 1,
            borderRadius: theme.radii.sm,
            backgroundColor: rankBg,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 11,
              color: rankColor,
              letterSpacing: 0.2,
            }}
          >
            {rank}
          </RNText>
        </View>

        <Flag url={team.flag_url} />

        <View style={{ flex: 1, gap: 1 }}>
          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 15,
              color: theme.colors.ink,
              letterSpacing: 0.1,
            }}
            numberOfLines={1}
          >
            {team.country_name}
          </RNText>
          <RNText
            style={{
              fontFamily: fontFamilies.regular,
              fontSize: 11,
              color: theme.colors.slate,
            }}
            numberOfLines={1}
          >
            3rd in Group {team.group_letter}
          </RNText>
        </View>

        {/* Status badge */}
        <View
          style={{
            paddingHorizontal: theme.spacing.sm,
            paddingVertical: theme.spacing.xxs,
            borderRadius: theme.radii.sm,
            backgroundColor: rankBg,
          }}
        >
          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 9,
              color: rankColor,
              letterSpacing: 0.4,
            }}
          >
            {qualifies ? 'QUALIFIED' : 'ELIMINATED'}
          </RNText>
        </View>

        <Pressable
          onLongPress={drag}
          delayLongPress={250}
          hitSlop={theme.spacing.md}
          accessibilityLabel="Drag to reorder"
          accessibilityRole="button"
          style={({ pressed }) => ({
            padding: theme.spacing.sm,
            opacity: pressed ? 0.5 : 1,
          })}
        >
          <Icon name="line.3.horizontal" size={18} tint={theme.colors.silver} weight="semibold" />
        </Pressable>
      </View>

      {isCutoff ? <QualificationLine /> : null}
    </View>
  );
}

function QualificationLine() {
  const theme = useTheme();
  return (
    <View
      style={{
        height: QUAL_LINE_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        backgroundColor: theme.colors.surface,
      }}
    >
      <View
        style={{
          flex: 1,
          height: theme.borders.standard,
          backgroundColor: withOpacity(theme.colors.red, 0.4),
        }}
      />
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 10,
          color: theme.colors.red,
          letterSpacing: 0.6,
        }}
      >
        QUALIFICATION LINE
      </RNText>
      <View
        style={{
          flex: 1,
          height: theme.borders.standard,
          backgroundColor: withOpacity(theme.colors.red, 0.4),
        }}
      />
    </View>
  );
}

const POSITION_LABELS: Record<number, string> = {
  1: '1st',
  2: '2nd',
  3: '3rd',
  4: '4th',
};

function PositionBadge({ position }: { position: number }) {
  const theme = useTheme();
  const fg = positionColor(theme, position);
  const bg = positionBadgeBg(theme, position);
  return (
    <View
      style={{
        width: 32,
        paddingVertical: theme.spacing.xxs + 1,
        borderRadius: theme.radii.sm,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 10,
          color: fg,
          letterSpacing: 0.2,
        }}
      >
        {POSITION_LABELS[position] ?? `${position}`}
      </RNText>
    </View>
  );
}

function Flag({ url }: { url: string | null | undefined }) {
  const theme = useTheme();
  if (!url) {
    return (
      <View
        style={{
          width: 22,
          height: 16,
          borderRadius: 2,
          backgroundColor: theme.colors.mist,
        }}
      />
    );
  }
  return (
    <Image
      source={{ uri: url }}
      style={{
        width: 22,
        height: 16,
        borderRadius: 2,
        backgroundColor: theme.colors.mist,
      }}
      resizeMode="cover"
    />
  );
}

function positionColor(theme: ReturnType<typeof useTheme>, position: number): string {
  if (position === 1 || position === 2) return theme.colors.green;
  if (position === 3) return theme.colors.amber;
  return theme.colors.slate;
}

function positionBadgeBg(theme: ReturnType<typeof useTheme>, position: number): string {
  if (position === 1 || position === 2) return theme.colors.greenLight;
  if (position === 3) return theme.colors.amberLight;
  return theme.colors.mist;
}
