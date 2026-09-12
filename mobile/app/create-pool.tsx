import { router } from 'expo-router';
import { useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Icon, Input, Text } from '@/components/ui';
import { createPool } from '@/lib/api';
import {
  LEAGUE_DEPTHS,
  LEAGUE_MODES,
  WC_MODES,
  asksStartMatchweek,
  buildCreatePayload,
  deadlineDescription,
  deadlineTitle,
  defaultDeadline,
  defaultStartMatchweek,
  effectiveMode,
  formatDeadline,
  formatLockInstant,
  formatSeasonRange,
  isLeague as competitionIsLeague,
  modeHasDepth,
  pairSeasons,
  quickPicks as computeQuickPicks,
  selectableCompetitions,
  startMatchweekDescription,
  startMatchweekOptions,
  startMatchweekTitle,
  validateDeadline,
  withoutSeason,
  type Competition,
  type LeagueDepth,
  type LeagueMode,
  type PoolMode,
  type QuickPick,
  type SeasonRow,
  type StartMatchweekOption,
  type TournamentRow,
  type UpcomingLock,
} from '@/lib/createPool';
import { useHomeData } from '@/lib/HomeDataProvider';
import { supabase } from '@/lib/supabase';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

/**
 * The native date/time picker, behind the same guarded require as
 * `components/pool-detail/SettingsTab.tsx` — it is a native module, so a JS-only
 * OTA into an older binary would otherwise throw at render rather than degrade.
 */
let DateTimePicker: ComponentType<{
  value: Date;
  mode?: 'date' | 'time' | 'datetime' | 'countdown';
  display?: 'default' | 'spinner' | 'clock' | 'calendar' | 'compact' | 'inline';
  minimumDate?: Date;
  onChange?: (event: unknown, date?: Date) => void;
}> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  DateTimePicker = require('@react-native-community/datetimepicker').default;
} catch {
  DateTimePicker = null;
}

type Step = 'tournament' | 'pool_type' | 'details' | 'settings';

const STEP_ORDER: Step[] = ['tournament', 'pool_type', 'details', 'settings'];

export default function CreatePoolModal() {
  const theme = useTheme();
  // Refreshed after a successful create so the new pool's card appears
  // on the home dashboard + Pools tab immediately when we navigate to it.
  const { refresh: refreshHomeData } = useHomeData();

  const [step, setStep] = useState<Step>('tournament');
  const stepIndex = STEP_ORDER.indexOf(step);

  // Step 1
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [competitionsLoading, setCompetitionsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Step 2 — two axes, held separately.
  //
  // `predictionMode` is the bracket choice and `leagueMode`/`leagueDepth` are
  // the league ones. They never merge: EVERY league pool is
  // `prediction_mode = 'league_pickem'` (the column all the league plumbing
  // keys on), and `league_mode` is what decides whether it is played by picking
  // fixtures or by ordering the table.
  const [predictionMode, setPredictionMode] = useState<PoolMode>('full_tournament');
  const [leagueMode, setLeagueMode] = useState<LeagueMode>('pickem');
  const [leagueDepth, setLeagueDepth] = useState<LeagueDepth>('results');

  // Step 3
  const [poolName, setPoolName] = useState('');
  const [description, setDescription] = useState('');

  // Step 4
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  /**
   * ⬅ 143. The matchweek a league pool starts from.
   *
   * NULL for a bracket pool and for table mode, and NULL until the options have
   * loaded. `asksStartMatchweek` decides whether it is asked for at all.
   */
  const [startMatchweek, setStartMatchweek] = useState<number | null>(null);
  // ⚠ PRIVATE BY DEFAULT (Ryan, 2026-08-29), matching the web wizard. A pool
  // code is required either way; the only thing this decides is whether the
  // pool is also listed in Discover. Two create surfaces disagreeing about a
  // privacy default is the kind of drift nobody reports.
  const [isPrivate, setIsPrivate] = useState(true);
  const [maxEntriesPerUser, setMaxEntriesPerUser] = useState(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = useMemo(
    () => competitions.find((c) => c.tournament_id === selectedId) ?? null,
    [competitions, selectedId],
  );

  const isLeague = competitionIsLeague(selected);

  // The mode that will actually be submitted, DERIVED from the competition
  // rather than synced into state by an effect. See `effectiveMode` — a mode
  // held in state survives a step back and a change of competition, and creates
  // a league pool that scores zero for every fixture, silently.
  const mode = effectiveMode(predictionMode, isLeague);

  // ------------------------------------------------------------- data

  useEffect(() => {
    (async () => {
      // Bracket AND league competitions.
      //
      // ⚠ Leagues were excluded here until 2026-09-05, on the grounds that a
      // league pool had no create flow or prediction UI on the phone. That is
      // no longer true: all four league modes are playable on RN — Pick'em and
      // Showdown through `pool/[id]/pickem/[entryId]`, Last Man Standing
      // through `survivor/`, Predict the Table through `table/`. This wizard
      // was the last thing on the phone that did not know leagues exist.
      //
      // `format` is null on rows predating migration 024; those are brackets.
      const { data: tRows, error: tErr } = await supabase
        .from('tournaments')
        .select(
          'tournament_id, name, short_name, host_countries, start_date, end_date, format, logo_url, external_provider, external_league_id, external_season',
        )
        .or('format.is.null,format.eq.groups_knockout,format.eq.league')
        .order('start_date', { ascending: false });

      if (tErr) {
        setError(tErr.message);
        setCompetitionsLoading(false);
        return;
      }

      // A league's identity is its `league_seasons` row, not the placeholder
      // `tournaments` row that carries its dates. Resolved here so the wizard
      // can DROP a league it cannot create rather than offering one that 409s
      // at submit.
      //
      // ⚠ Errors are read, not discarded. `const { data } = await …` hides a
      // 400 and renders an empty list for ever — and an empty `seasons` here
      // would silently remove every league from the wizard rather than failing.
      const { data: sRows, error: sErr } = await supabase
        .from('league_seasons')
        .select('season_id, club_count, external_provider, external_league_id, external_season');

      if (sErr) {
        setError(sErr.message);
        setCompetitionsLoading(false);
        return;
      }

      const list = selectableCompetitions(
        pairSeasons((tRows ?? []) as TournamentRow[], (sRows ?? []) as SeasonRow[]),
      );
      setCompetitions(list);
      if (list.length === 1) setSelectedId(list[0].tournament_id);
      setCompetitionsLoading(false);
    })();
  }, []);

  /**
   * The next few matchweek locks, for the shortcut chips.
   *
   * ⚠ Only meaningful once a season is UNDER WAY. "Tournament Start (Aug 21)"
   * is a useful shortcut in July and a dead one in September — the date is
   * behind us and the button sets something the form then rejects. Mid-season
   * the shortcut somebody actually wants is the next matchweek's deadline.
   */
  const [upcomingLocks, setUpcomingLocks] = useState<UpcomingLock[]>([]);

  useEffect(() => {
    const seasonId = selected?.league_season_id;
    if (!seasonId) {
      setUpcomingLocks([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('league_matchweeks')
        .select('matchweek_number, label, lock_at')
        .eq('season_id', seasonId)
        .not('lock_at', 'is', null)
        .gt('lock_at', new Date().toISOString())
        // ⬅ 143. Same predicate the create route floors on. 106's re-homing
        // floor empties roughly one matchweek a season and an empty one never
        // opens, so offering it would start a pool in a week that will never
        // ask for a pick.
        .gt('fixture_count', 0)
        .order('lock_at', { ascending: true })
        // ⬅ 143. Five, not three: the chooser shows four and wants a spare in
        // case one locks between this read and the render.
        .limit(5);
      if (cancelled) return;
      // A failure here costs the CHIPS and nothing else — the admin can still
      // set any date with the picker — so it does not raise an error banner
      // over the whole step.
      setUpcomingLocks(
        (data ?? []).map((r) => ({
          number: r.matchweek_number as number,
          label: r.label as string | null,
          lockAt: r.lock_at as string,
        })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [selected?.league_season_id]);

  // Pre-fill the deadline when the competition changes.
  //
  // ⚠ Keyed on the competition ID and not guarded by `!deadline`, so switching
  // competitions re-prefills. The old guard meant a deadline set for the World
  // Cup rode along onto a Premier League pool.
  useEffect(() => {
    if (!selected) return;
    setDeadline(defaultDeadline(selected));
  }, [selected?.tournament_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const quickPicks = useMemo(
    () => computeQuickPicks(selected, upcomingLocks),
    [selected, upcomingLocks],
  );

  // ⬅ 143. Does this pool choose a start matchweek instead of a deadline? The
  // rule itself lives in `mobile/lib/createPool.ts` alongside the payload
  // builder that reads it, so the screen and the body cannot disagree.
  const asksStart = asksStartMatchweek(selected, leagueMode);
  const startOptions = useMemo(
    () => startMatchweekOptions(upcomingLocks, Date.now()),
    [upcomingLocks],
  );

  // Land on the open matchweek — the behaviour before 143, now chosen out loud.
  useEffect(() => {
    if (!asksStart) {
      setStartMatchweek(null);
      return;
    }
    setStartMatchweek((prev) =>
      prev !== null && startOptions.some((o) => o.number === prev)
        ? prev
        : defaultStartMatchweek(startOptions),
    );
  }, [asksStart, startOptions]);

  // ------------------------------------------------------------- navigation

  function canProceed(): boolean {
    switch (step) {
      case 'tournament':
        return !!selectedId;
      case 'pool_type':
        return true; // always has a default selection
      case 'details':
        return poolName.trim().length > 0;
      case 'settings':
        // ⬅ 143. A league pool that asks for a start matchweek needs THAT
        // answered, not a date it never shows. `deadline` is still prefilled
        // and still sent — the route overwrites it with the season's last
        // kickoff for every league pool — but it is not what the step is about.
        return asksStart ? startMatchweek !== null : !!deadline;
    }
  }

  function goNext() {
    setError(null);
    if (stepIndex < STEP_ORDER.length - 1) setStep(STEP_ORDER[stepIndex + 1]);
  }

  function goBack() {
    setError(null);
    if (stepIndex > 0) setStep(STEP_ORDER[stepIndex - 1]);
  }

  async function handleSubmit() {
    if (!selected || !deadline || !poolName.trim()) return;

    // ⚠ The picker is floored at today, and a DAY-level floor cannot catch
    // "today at 09:00" chosen at noon. A deadline already gone closes nothing,
    // and for a table pool it is the real lock — the pool would be created shut.
    const invalid = validateDeadline(deadline);
    if (invalid) {
      setError(invalid);
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const created = await createPool(
        buildCreatePayload({
          poolName,
          description,
          competition: selected,
          leagueMode,
          leagueDepth,
          predictionMode,
          deadline,
          isPrivate,
          maxEntriesPerUser,
          startMatchweek,
        }),
      );
      // Refresh the home dashboard / Pools tab list so the new pool card
      // is already there when the user navigates between tabs. Fire-and-
      // forget — the deep-link below doesn't wait for it.
      void refreshHomeData();
      // Land the admin on the new pool's Settings tab so they can tune
      // scoring rules, prizes, branding, etc. before sharing the pool.
      router.replace(`/pool/${created.pool_id}?tab=settings`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create pool');
    } finally {
      setLoading(false);
    }
  }

  const isLastStep = step === 'settings';

  return (
    <SafeAreaView
      edges={['top', 'left', 'right', 'bottom']}
      style={{ flex: 1, backgroundColor: theme.colors.snow }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingHorizontal: theme.spacing.xl,
            paddingTop: theme.spacing.xxl,
            paddingBottom: theme.spacing.md,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}
          >
            <Text variant="body" color="slate">
              Cancel
            </Text>
          </Pressable>
          <Text variant="detail" color="slate">
            Step {stepIndex + 1} of {STEP_ORDER.length}
          </Text>
          <View style={{ width: 50 }} />
        </View>

        <StepIndicator
          currentIndex={stepIndex}
          onTapStep={(i) => i < stepIndex && setStep(STEP_ORDER[i])}
        />

        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: theme.spacing.xl,
            paddingTop: theme.spacing.lg,
            paddingBottom: theme.spacing.xxl,
            gap: theme.spacing.lg,
          }}
          keyboardShouldPersistTaps="handled"
        >
          {error ? (
            <View
              style={{
                padding: theme.spacing.md,
                borderRadius: theme.radii.md,
                backgroundColor: theme.colors.redLight,
              }}
            >
              <Text variant="body" color="red">
                {error}
              </Text>
            </View>
          ) : null}

          {step === 'tournament' ? (
            <TournamentStep
              competitions={competitions}
              loading={competitionsLoading}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          ) : null}

          {step === 'pool_type' ? (
            <PoolTypeStep
              isLeague={isLeague}
              clubCount={selected?.league_club_count ?? null}
              mode={mode}
              onModeChange={setPredictionMode}
              leagueMode={leagueMode}
              onLeagueModeChange={setLeagueMode}
              leagueDepth={leagueDepth}
              onLeagueDepthChange={setLeagueDepth}
            />
          ) : null}

          {step === 'details' ? (
            <DetailsStep
              competition={selected}
              poolName={poolName}
              description={description}
              onNameChange={setPoolName}
              onDescriptionChange={setDescription}
            />
          ) : null}

          {step === 'settings' ? (
            <SettingsStep
              mode={mode}
              isLeague={isLeague}
              leagueMode={leagueMode}
              deadline={deadline}
              quickPicks={quickPicks}
              asksStart={asksStart}
              startOptions={startOptions}
              startMatchweek={startMatchweek}
              onPickStartMatchweek={setStartMatchweek}
              onPickDeadline={setDeadline}
              showPicker={showPicker}
              onRequestPicker={() => {
                if (!DateTimePicker) {
                  Alert.alert(
                    'Rebuild needed',
                    'The date picker uses a native module that ships in the next dev build. Use the shortcuts below for now.',
                  );
                  return;
                }
                setShowPicker(true);
              }}
              onDismissPicker={() => setShowPicker(false)}
              isPrivate={isPrivate}
              onPrivacyChange={setIsPrivate}
              maxEntriesPerUser={maxEntriesPerUser}
              onMaxEntriesChange={setMaxEntriesPerUser}
            />
          ) : null}
        </ScrollView>

        <BottomBar
          isFirstStep={stepIndex === 0}
          isLastStep={isLastStep}
          canProceed={canProceed()}
          loading={loading}
          onBack={goBack}
          onNext={goNext}
          onSubmit={handleSubmit}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ============ Step Indicator ============

function StepIndicator({
  currentIndex,
  onTapStep,
}: {
  currentIndex: number;
  onTapStep: (index: number) => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.xl,
        paddingVertical: theme.spacing.md,
      }}
    >
      {STEP_ORDER.map((s, i) => {
        const isComplete = i < currentIndex;
        const isCurrent = i === currentIndex;
        const dotColor = isComplete || isCurrent ? theme.colors.primary : theme.colors.silver;
        return (
          <View
            key={s}
            style={{
              flex: i === STEP_ORDER.length - 1 ? 0 : 1,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <Pressable onPress={() => onTapStep(i)} hitSlop={8}>
              <View
                style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dotColor }}
              />
            </Pressable>
            {i < STEP_ORDER.length - 1 ? (
              <View
                style={{
                  flex: 1,
                  height: 2,
                  marginHorizontal: 4,
                  backgroundColor:
                    i < currentIndex ? theme.colors.primary : theme.colors.silver,
                }}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

// ============ Step 1: Tournament ============

function TournamentStep({
  competitions,
  loading,
  selectedId,
  onSelect,
}: {
  competitions: Competition[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const theme = useTheme();
  const isDark = theme.mode === 'dark';

  if (loading) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: theme.spacing.xxxl }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (competitions.length === 0) {
    return (
      <View
        style={{
          alignItems: 'center',
          paddingVertical: theme.spacing.xxxl,
          gap: theme.spacing.md,
        }}
      >
        <Icon name="trophy" color="slate" size={32} />
        <Text variant="body" color="slate">
          No competitions available
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      <Text variant="body" color="slate">
        Choose the competition for your prediction pool.
      </Text>
      {competitions.map((c) => {
        const isSelected = selectedId === c.tournament_id;
        return (
          <Pressable
            key={c.tournament_id}
            onPress={() => onSelect(c.tournament_id)}
            accessibilityRole="button"
            // The tint is the only visual signal of which card is chosen, so
            // `selected` carries it for anyone who cannot see the tint — a
            // screen reader reads "selected" rather than two identical buttons.
            accessibilityState={{ selected: isSelected }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              padding: theme.spacing.lg,
              borderRadius: theme.radii.md,
              backgroundColor: isSelected
                ? withOpacity(theme.colors.primary, 0.08)
                : theme.colors.surface,
              // The app's selection treatment — see BracketPickerWizard and
              // OutcomePicker. An 8% tint ALONE was the whole signal here, and
              // on a white card against the snow page it barely registered.
              //
              // Border is always rendered so only its COLOUR changes on select:
              // a border that appears on selection shifts the card and its
              // neighbours by its own width.
              borderWidth: theme.borders.accent,
              borderColor: isSelected ? theme.colors.primary : 'transparent',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            {/* ⚠ Rendered only when there IS one, and NULL is the common case
                on purpose. The provider serves a real crest for the Premier
                League and a generic grey shield for the World Cup, so the
                column is filled only where the image is the competition's own —
                a card with no logo is a deliberate state, not a loading one,
                and must not get a placeholder box.

                The white plate is DARK MODE ONLY. Several league marks are dark
                on transparent — the Premier League lion is near-black purple —
                and vanish on the dark surface. In light mode the page is already
                that ground, so a plate would only inset the mark for nothing. */}
            {c.logo_url ? (
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: theme.radii.sm,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isDark ? '#FFFFFF' : 'transparent',
                }}
              >
                <Image
                  // Decorative — the competition's name is the label beside it.
                  alt=""
                  source={{ uri: c.logo_url }}
                  style={{ width: isDark ? 32 : 44, height: isDark ? 32 : 44 }}
                  resizeMode="contain"
                />
              </View>
            ) : null}

            <View style={{ flex: 1, gap: 2 }}>
              {/* The season is dropped from the NAME because the dates are on
                  the line below it, which is where somebody actually checks
                  which season they are joining. Display only — `tournaments.name`
                  is what every email and export uses. */}
              <Text variant="cardTitle">{withoutSeason(c.name)}</Text>
              {c.host_countries ? (
                <Text variant="detail" color="slate">
                  {c.host_countries}
                </Text>
              ) : null}
              <Text variant="detail" color="slate">
                {formatSeasonRange(c.start_date, c.end_date)}
              </Text>
              {/* ⚠ `description` is deliberately NOT rendered. "20 clubs, 38
                  matchweeks, 380 fixtures. Flat round-robin: no groups, no
                  knockout." is format detail for a step whose only decision is
                  WHICH competition — the longest line on the card carrying the
                  least. */}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

// ============ Step 2: Pool Type ============

function PoolTypeStep({
  isLeague,
  clubCount,
  mode,
  onModeChange,
  leagueMode,
  onLeagueModeChange,
  leagueDepth,
  onLeagueDepthChange,
}: {
  isLeague: boolean;
  clubCount: number | null;
  mode: PoolMode;
  onModeChange: (m: PoolMode) => void;
  leagueMode: LeagueMode;
  onLeagueModeChange: (m: LeagueMode) => void;
  leagueDepth: LeagueDepth;
  onLeagueDepthChange: (d: LeagueDepth) => void;
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.md }}>
      <Text variant="body" color="slate">
        How will members make their predictions?
      </Text>

      {isLeague
        ? LEAGUE_MODES.map((opt) => (
            <ModeCard
              key={opt.value}
              icon={opt.icon}
              title={opt.label}
              description={opt.desc(clubCount)}
              selected={leagueMode === opt.value}
              onPress={() => onLeagueModeChange(opt.value)}
            />
          ))
        : WC_MODES.map((opt) => (
            <ModeCard
              key={opt.value}
              icon={opt.icon}
              title={opt.label}
              description={opt.desc(null)}
              selected={mode === opt.value}
              onPress={() => onModeChange(opt.value)}
            />
          ))}

      {/* Depth is level 2, and it is asked ONLY of the two modes with weekly
          picks — there is no "predict the scoreline" version of ordering twenty
          clubs, and the database CHECK refuses the pairing outright. */}
      {isLeague && modeHasDepth(leagueMode) ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="caption" color="ink">
            How much do members predict each match?
          </Text>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            {LEAGUE_DEPTHS.map((opt) => {
              const selected = leagueDepth === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => onLeagueDepthChange(opt.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => ({
                    flex: 1,
                    gap: theme.spacing.xxs,
                    padding: theme.spacing.md,
                    borderRadius: theme.radii.sm,
                    backgroundColor: selected
                      ? withOpacity(theme.colors.primary, 0.08)
                      : theme.colors.surface,
                    borderWidth: theme.borders.accent,
                    borderColor: selected ? theme.colors.primary : 'transparent',
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  {/* ⚠ THE LABEL STAYS AT FULL STRENGTH. It used to go
                      `primary` when selected, which is the mistake
                      OutcomePicker already records: the tint is bright but
                      LESS LUMINANT than the ink, so in dark mode the option you
                      had chosen read SOFTER than the one you had not. Selection
                      is carried by the fill and the border — which gain
                      contrast — and by the weight, never by trading it away. */}
                  <Text
                    style={{
                      fontFamily: selected ? fontFamilies.bold : fontFamilies.semibold,
                      fontSize: 14,
                      color: theme.colors.ink,
                    }}
                  >
                    {opt.label}
                  </Text>
                  <Text variant="detail" color="slate">
                    {opt.desc}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          padding: theme.spacing.md,
          borderRadius: theme.radii.sm,
          backgroundColor: theme.colors.amberLight,
        }}
      >
        <Icon name="exclamationmark.triangle.fill" color="amber" size={14} />
        <Text variant="detail" color="slate" style={{ flex: 1 }}>
          This cannot be changed after your pool is created.
        </Text>
      </View>
    </View>
  );
}

function ModeCard({
  icon,
  title,
  description,
  selected,
  onPress,
}: {
  icon: string;
  title: string;
  description: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
        borderRadius: theme.radii.md,
        backgroundColor: selected
          ? withOpacity(theme.colors.primary, 0.08)
          : theme.colors.surface,
        // Always rendered, colour-only change — see the note on the competition
        // card above. Four mode cards stacked with nothing but an 8% tint
        // between them is the case Ryan reported as "not very visible".
        borderWidth: theme.borders.accent,
        borderColor: selected ? theme.colors.primary : 'transparent',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View style={{ width: 32, alignItems: 'center', paddingTop: 2 }}>
        {/* The ICON may take the tint — it is a glyph, not text to read, so the
            luminance trap described on the depth labels below does not apply. */}
        <Icon name={icon} color={selected ? 'primary' : 'slate'} size={22} />
      </View>
      <View style={{ flex: 1, gap: theme.spacing.xs }}>
        <Text variant="cardTitle">{title}</Text>
        <Text variant="detail" color="slate">
          {description}
        </Text>
      </View>
    </Pressable>
  );
}

// ============ Step 3: Details ============

function DetailsStep({
  competition,
  poolName,
  description,
  onNameChange,
  onDescriptionChange,
}: {
  competition: Competition | null;
  poolName: string;
  description: string;
  onNameChange: (s: string) => void;
  onDescriptionChange: (s: string) => void;
}) {
  const theme = useTheme();
  const placeholder = competition
    ? `e.g. Office ${withoutSeason(competition.name)}`
    : 'e.g. Office World Cup';

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Text variant="body" color="slate">
        Give your pool a name and optional description.
      </Text>

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="cardTitle">Pool Name</Text>
        <Input value={poolName} onChangeText={onNameChange} placeholder={placeholder} />
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="cardTitle">Description</Text>
        <Input
          value={description}
          onChangeText={onDescriptionChange}
          placeholder="Tell people about your pool..."
          multiline
          numberOfLines={3}
          style={{ minHeight: 96, textAlignVertical: 'top' }}
        />
      </View>
    </View>
  );
}

// ============ Step 4: Settings ============

function SettingsStep({
  mode,
  isLeague,
  leagueMode,
  deadline,
  quickPicks,
  asksStart,
  startOptions,
  startMatchweek,
  onPickStartMatchweek,
  onPickDeadline,
  showPicker,
  onRequestPicker,
  onDismissPicker,
  isPrivate,
  onPrivacyChange,
  maxEntriesPerUser,
  onMaxEntriesChange,
}: {
  mode: PoolMode;
  isLeague: boolean;
  leagueMode: LeagueMode;
  deadline: Date | null;
  quickPicks: QuickPick[];
  /** ⬅ 143. Start matchweek instead of a deadline? See `asksStartMatchweek`. */
  asksStart: boolean;
  startOptions: StartMatchweekOption[];
  startMatchweek: number | null;
  onPickStartMatchweek: (n: number) => void;
  onPickDeadline: (d: Date) => void;
  showPicker: boolean;
  onRequestPicker: () => void;
  onDismissPicker: () => void;
  isPrivate: boolean;
  onPrivacyChange: (b: boolean) => void;
  maxEntriesPerUser: number;
  onMaxEntriesChange: (n: number) => void;
}) {
  const theme = useTheme();
  const effectiveLeagueMode = isLeague ? leagueMode : null;

  return (
    <View style={{ gap: theme.spacing.lg }}>
      {/* ⬅ 143. THE QUESTION THE ADMIN WAS ACTUALLY ANSWERING.

          This card used to be a date picker headed "First round deadline" for
          Last Man Standing and "First matchweek deadline" for the rest. The
          create route discarded that date for every league mode but table and
          started the pool in whichever matchweek happened to be unlocked. Ryan
          set a pool to matchweek 5 the night before matchweek 4 and it began in
          4 — and in Last Man Standing a week you were never shown a picker for
          is a week you are eliminated in. Migration 143. */}
      {asksStart ? (
        <Card title={startMatchweekTitle()} description={startMatchweekDescription()}>
          {startOptions.length === 0 ? (
            /* The create route refuses this with a 409, so saying it here is
               the same answer given earlier rather than an empty card that
               fails on submit. */
            <Text variant="body" color="slate">
              This season has no matchweeks left to play.
            </Text>
          ) : (
            <View style={{ gap: theme.spacing.sm }}>
              {startOptions.map((o) => (
                <StartMatchweekRow
                  key={o.number}
                  option={o}
                  selected={startMatchweek === o.number}
                  onPress={() => onPickStartMatchweek(o.number)}
                />
              ))}
            </View>
          )}
        </Card>
      ) : (
      <Card
        title={deadlineTitle(mode, effectiveLeagueMode)}
        description={deadlineDescription(mode, effectiveLeagueMode)}
      >
        {/* Tappable, so the admin can set ANY date and time. Before this the
            three chips were the only way to set a deadline at all — and once a
            season was under way all three of them were in the past. */}
        <Pressable
          onPress={onRequestPicker}
          accessibilityRole="button"
          accessibilityLabel="Change deadline"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: theme.spacing.sm,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Text variant="body">{deadline ? formatDeadline(deadline) : '—'}</Text>
          <Icon name="calendar" color="slate" size={18} />
        </Pressable>

        {showPicker && DateTimePicker ? (
          <DateTimePicker
            value={deadline ?? new Date()}
            mode="datetime"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            // A day-level floor. It cannot catch "today at 09:00" chosen at
            // noon — `validateDeadline` does that at submit.
            minimumDate={new Date()}
            onChange={(_e: unknown, picked?: Date) => {
              if (Platform.OS !== 'ios') onDismissPicker();
              if (picked) onPickDeadline(picked);
            }}
          />
        ) : null}

        {/* ⚠ NO CHIPS AT ALL for a started competition with no matchweeks we
            can read. An empty row is honest; a row of buttons that set dates
            the form rejects is not. */}
        {quickPicks.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {quickPicks.map((q) => (
              <Chip key={q.key} label={q.label} onPress={() => onPickDeadline(q.at)} />
            ))}
          </View>
        ) : null}
      </Card>
      )}

      <Card
        title="Who can join"
        description="Everyone needs the pool code either way. Private also keeps it out of Discover."
      >
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <PrivacyOption
            title="Public"
            subtitle="Listed in Discover"
            selected={!isPrivate}
            onPress={() => onPrivacyChange(false)}
          />
          <PrivacyOption
            title="Private"
            subtitle="Code only"
            selected={isPrivate}
            onPress={() => onPrivacyChange(true)}
          />
        </View>
      </Card>

      {/* ⚠ NO "MAXIMUM MEMBERS" CARD, and its absence is deliberate.
          Migration 075 records that `pools.max_participants` is "stored,
          displayed and editable but enforced NOWHERE" — an admin could set 20
          and 50 people would still join. It was a control that had never done
          anything, sitting in a step where every question is meant to matter.
          The limit that IS real is the tier ceiling, enforced by a BEFORE
          INSERT trigger precisely so no route or client can miss it. */}

      {/* ⚠ NOT OFFERED ON A LEAGUE POOL — one entry per member, always. The
          same rule `components/pool-detail/SettingsTab.tsx` already applies
          after creation, applied here so the wizard stops asking a question the
          create route overrides. A second entry is unreachable by construction:
          the Pick'em and table pickers both resolve to the member's FIRST
          entry, so entry 2 could never be filled and would score 0 all season.
          Showdown is worse — the draw is per entry, so a member would be drawn
          against people twice with one side unplayable. */}
      {isLeague ? null : (
        <Card
          title="Entries per member"
          description="More than one lets somebody enter several predictions. Each is scored and ranked on the leaderboard by itself."
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
              const selected = maxEntriesPerUser === n;
              return (
                <Pressable
                  key={n}
                  onPress={() => onMaxEntriesChange(n)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => ({
                    width: 48,
                    height: 40,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: theme.radii.sm,
                    backgroundColor: selected ? theme.colors.primary : theme.colors.mist,
                    opacity: pressed ? 0.85 : 1,
                  })}
                >
                  <Text
                    style={{
                      fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
                      fontSize: 14,
                      color: selected ? '#FFFFFF' : theme.colors.ink,
                      fontWeight: selected ? '700' : '500',
                    }}
                  >
                    {n}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
      )}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: theme.spacing.sm,
          padding: theme.spacing.md,
          borderRadius: theme.radii.sm,
          backgroundColor: withOpacity(theme.colors.primary, 0.06),
        }}
      >
        <Icon name="info.circle.fill" color="primary" size={16} />
        <View style={{ flex: 1, gap: theme.spacing.xxs }}>
          <Text variant="caption" color="ink">
            Scoring uses the defaults
          </Text>
          <Text variant="detail" color="slate">
            Every rule, multiplier and bonus can be changed from the pool’s admin settings once it exists.
          </Text>
        </View>
      </View>
    </View>
  );
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        padding: theme.spacing.lg,
        borderRadius: theme.radii.md,
        backgroundColor: theme.colors.surface,
        gap: theme.spacing.md,
      }}
    >
      <View style={{ gap: theme.spacing.xxs }}>
        <Text variant="cardTitle">{title}</Text>
        {description ? (
          <Text variant="detail" color="slate">
            {description}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.xs + 2,
        borderRadius: theme.radii.pill,
        backgroundColor: theme.colors.mist,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text variant="detail" color="slate">
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * ⬅ 143. One matchweek the pool could start from.
 *
 * Styled as the privacy options below are — a full-width tappable row rather
 * than a radio, because the thing being compared is two lines of information
 * (which week, and how long the group has) and a radio dot next to a label
 * would hide the second line.
 */
function StartMatchweekRow({
  option,
  selected,
  onPress,
}: {
  option: StartMatchweekOption;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      // ⚠ The label carries the CLOSING TIME, not just the matchweek. A screen
      // reader user is making the same judgement as everybody else — is that
      // enough notice for my group — and the number alone cannot answer it.
      accessibilityLabel={`${option.title}, picks close ${formatLockInstant(option.lockAt)}, ${option.closesIn}`}
      style={({ pressed }) => ({
        gap: 2,
        padding: theme.spacing.md,
        borderRadius: theme.radii.sm,
        backgroundColor: selected ? withOpacity(theme.colors.primary, 0.08) : theme.colors.mist,
        borderWidth: theme.borders.accent,
        borderColor: selected ? theme.colors.primary : 'transparent',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
      >
        <Text style={{ fontFamily: fontFamilies.bold, fontSize: 16, color: theme.colors.ink }}>
          {option.title}
        </Text>
        {/* ⚠ A FACT, NOT A RECOMMENDATION. This is the current default and the
            whole point of the screen is that a later week is an equally correct
            answer — so it names the state and says nothing about what to do. */}
        {option.isOpenNow ? (
          <Text variant="detail" color="slate">
            Open now
          </Text>
        ) : null}
      </View>
      {/* ⚠ `lock_at`, never the first kickoff. Migration 101 moved picking shut
          to an hour BEFORE the first match of the week; printing the kickoff
          would tell an admin their group has an hour more than it does. */}
      <Text variant="detail" color="slate">
        Picks close {formatLockInstant(option.lockAt)} · {option.closesIn}
      </Text>
    </Pressable>
  );
}

function PrivacyOption({
  title,
  subtitle,
  selected,
  onPress,
}: {
  title: string;
  subtitle: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        gap: 2,
        paddingVertical: theme.spacing.md,
        borderRadius: theme.radii.sm,
        backgroundColor: selected ? withOpacity(theme.colors.primary, 0.08) : theme.colors.mist,
        borderWidth: theme.borders.accent,
        borderColor: selected ? theme.colors.primary : 'transparent',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {/* ⚠ Full strength when selected — same rule as the depth labels above. */}
      <Text
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 16,
          color: theme.colors.ink,
        }}
      >
        {title}
      </Text>
      <Text variant="detail" color="slate" align="center">
        {subtitle}
      </Text>
    </Pressable>
  );
}

// ============ Bottom Bar ============

function BottomBar({
  isFirstStep,
  isLastStep,
  canProceed,
  loading,
  onBack,
  onNext,
  onSubmit,
}: {
  isFirstStep: boolean;
  isLastStep: boolean;
  canProceed: boolean;
  loading: boolean;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: theme.spacing.md,
        paddingHorizontal: theme.spacing.xl,
        paddingTop: theme.spacing.lg,
        paddingBottom: theme.spacing.md,
      }}
    >
      {!isFirstStep ? (
        <View style={{ flex: 1 }}>
          <Button title="Back" variant="secondary" size="lg" fullWidth onPress={onBack} />
        </View>
      ) : null}
      <View
        style={{
          flex: 1,
          shadowColor: theme.colors.primary,
          shadowOpacity: canProceed ? 0.35 : 0,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
        }}
      >
        <Button
          title={isLastStep ? 'Create Pool' : 'Next'}
          size="lg"
          fullWidth
          loading={loading}
          disabled={!canProceed}
          onPress={isLastStep ? onSubmit : onNext}
        />
      </View>
    </View>
  );
}
