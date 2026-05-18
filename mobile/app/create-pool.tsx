import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Icon, Input, Text } from '@/components/ui';
import { createPool, type CreatePoolRequest } from '@/lib/api';
import { useHomeData } from '@/lib/HomeDataProvider';
import { supabase } from '@/lib/supabase';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type Tournament = {
  tournament_id: string;
  name: string;
  short_name: string | null;
  host_countries: string | null;
  start_date: string;
  end_date: string;
  description: string | null;
};

type Step = 'tournament' | 'pool_type' | 'details' | 'settings';

const STEP_ORDER: Step[] = ['tournament', 'pool_type', 'details', 'settings'];

const STEP_TITLES: Record<Step, string> = {
  tournament: 'Tournament',
  pool_type: 'Pool Type',
  details: 'Details',
  settings: 'Settings',
};

type ModeOption = {
  value: CreatePoolRequest['prediction_mode'];
  icon: string;
  title: string;
  description: string;
};

const MODE_OPTIONS: ModeOption[] = [
  {
    value: 'full_tournament',
    icon: 'list.bullet.rectangle',
    title: 'Full Tournament',
    description:
      'Members predict all matches upfront before the tournament starts. They must predict which teams qualify for the knockout rounds based on their group stage predictions.',
  },
  {
    value: 'progressive',
    icon: 'arrow.forward.circle',
    title: 'Progressive',
    description:
      'Members predict round-by-round as teams advance. After each round completes, the next round opens with actual qualified teams and matchups.',
  },
  {
    value: 'bracket_picker',
    icon: 'square.grid.2x2',
    title: 'Bracket Picker',
    description:
      'Members rank groups and pick knockout winners only — no score predictions needed. Quick & simple (~10 min).',
  },
];

type QuickDeadline = 'tournament_start' | 'one_day_before' | 'one_week_before';

function parseDate(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function setOnePm(d: Date): Date {
  const out = new Date(d);
  out.setHours(13, 0, 0, 0);
  return out;
}

function computeQuickDeadline(option: QuickDeadline, start: Date): Date {
  switch (option) {
    case 'tournament_start':
      return setOnePm(start);
    case 'one_day_before':
      return setOnePm(new Date(start.getTime() - 24 * 60 * 60 * 1000));
    case 'one_week_before':
      return setOnePm(new Date(start.getTime() - 7 * 24 * 60 * 60 * 1000));
  }
}

function formatDeadlineDisplay(d: Date): string {
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function CreatePoolModal() {
  const theme = useTheme();
  // Refreshed after a successful create so the new pool's card appears
  // on the home dashboard + Pools tab immediately when we navigate to it.
  const { refresh: refreshHomeData } = useHomeData();

  const [step, setStep] = useState<Step>('tournament');
  const stepIndex = STEP_ORDER.indexOf(step);

  // Step 1
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [tournamentsLoading, setTournamentsLoading] = useState(true);
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);

  // Step 2
  const [mode, setMode] = useState<CreatePoolRequest['prediction_mode']>('full_tournament');

  // Step 3
  const [poolName, setPoolName] = useState('');
  const [description, setDescription] = useState('');

  // Step 4
  const [deadline, setDeadline] = useState<Date | null>(null);
  const [isPrivate, setIsPrivate] = useState(false);
  const [maxParticipants, setMaxParticipants] = useState('0');
  const [maxEntriesPerUser, setMaxEntriesPerUser] = useState(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTournament = useMemo(
    () => tournaments.find((t) => t.tournament_id === selectedTournamentId) ?? null,
    [tournaments, selectedTournamentId],
  );

  useEffect(() => {
    (async () => {
      const { data, error: tErr } = await supabase
        .from('tournaments')
        .select('tournament_id, name, short_name, host_countries, start_date, end_date, description')
        .order('start_date', { ascending: false });
      if (tErr) {
        setError(tErr.message);
      } else {
        const rows = (data ?? []) as Tournament[];
        setTournaments(rows);
        if (rows.length === 1) {
          setSelectedTournamentId(rows[0].tournament_id);
        }
      }
      setTournamentsLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (selectedTournament && !deadline) {
      const start = parseDate(selectedTournament.start_date);
      if (start) setDeadline(setOnePm(start));
    }
  }, [selectedTournament, deadline]);

  function applyQuickDeadline(option: QuickDeadline) {
    if (!selectedTournament) return;
    const start = parseDate(selectedTournament.start_date);
    if (!start) return;
    setDeadline(computeQuickDeadline(option, start));
  }

  function canProceed(): boolean {
    switch (step) {
      case 'tournament':
        return !!selectedTournamentId;
      case 'pool_type':
        return true;
      case 'details':
        return poolName.trim().length > 0;
      case 'settings':
        return !!deadline;
    }
  }

  function goNext() {
    setError(null);
    if (stepIndex < STEP_ORDER.length - 1) {
      setStep(STEP_ORDER[stepIndex + 1]);
    }
  }

  function goBack() {
    setError(null);
    if (stepIndex > 0) {
      setStep(STEP_ORDER[stepIndex - 1]);
    }
  }

  async function handleSubmit() {
    if (!selectedTournamentId || !deadline || !poolName.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const maxP = parseInt(maxParticipants, 10);
      const created = await createPool({
        pool_name: poolName.trim(),
        description: description.trim() || null,
        tournament_id: selectedTournamentId,
        prediction_deadline: deadline.toISOString(),
        prediction_mode: mode,
        is_private: isPrivate,
        max_participants: Number.isFinite(maxP) && maxP > 0 ? maxP : null,
        max_entries_per_user: Math.max(1, Math.min(10, maxEntriesPerUser)),
      });
      // Refresh the home dashboard / Pools tab list so the new pool card
      // is already there when the user navigates between tabs. Fire-and-
      // forget — the deep-link below doesn't wait for it.
      void refreshHomeData();
      // Land the admin on the new pool's leaderboard tab (default tab on
      // app/pool/[id].tsx). Replace, not push, so back navigation skips
      // the create modal.
      router.replace(`/pool/${created.pool_id}`);
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

        <StepIndicator currentIndex={stepIndex} onTapStep={(i) => i < stepIndex && setStep(STEP_ORDER[i])} />

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
              tournaments={tournaments}
              loading={tournamentsLoading}
              selectedId={selectedTournamentId}
              onSelect={setSelectedTournamentId}
            />
          ) : null}

          {step === 'pool_type' ? <PoolTypeStep mode={mode} onChange={setMode} /> : null}

          {step === 'details' ? (
            <DetailsStep
              tournament={selectedTournament}
              poolName={poolName}
              description={description}
              onNameChange={setPoolName}
              onDescriptionChange={setDescription}
            />
          ) : null}

          {step === 'settings' ? (
            <SettingsStep
              mode={mode}
              deadline={deadline}
              onApplyQuickDeadline={applyQuickDeadline}
              isPrivate={isPrivate}
              onPrivacyChange={setIsPrivate}
              maxParticipants={maxParticipants}
              onMaxParticipantsChange={setMaxParticipants}
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
        const dotColor =
          isComplete || isCurrent ? theme.colors.primary : theme.colors.silver;
        return (
          <View key={s} style={{ flex: i === STEP_ORDER.length - 1 ? 0 : 1, flexDirection: 'row', alignItems: 'center' }}>
            <Pressable onPress={() => onTapStep(i)} hitSlop={8}>
              <View
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: dotColor,
                }}
              />
            </Pressable>
            {i < STEP_ORDER.length - 1 ? (
              <View
                style={{
                  flex: 1,
                  height: 2,
                  marginHorizontal: 4,
                  backgroundColor: i < currentIndex ? theme.colors.primary : theme.colors.silver,
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
  tournaments,
  loading,
  selectedId,
  onSelect,
}: {
  tournaments: Tournament[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const theme = useTheme();

  if (loading) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: theme.spacing.xxxl }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (tournaments.length === 0) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: theme.spacing.xxxl, gap: theme.spacing.md }}>
        <Icon name="trophy" color="slate" size={32} />
        <Text variant="body" color="slate">
          No tournaments available
        </Text>
      </View>
    );
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      <Text variant="body" color="slate">
        Choose the tournament for your prediction pool.
      </Text>
      {tournaments.map((t) => {
        const isSelected = selectedId === t.tournament_id;
        return (
          <Pressable
            key={t.tournament_id}
            onPress={() => onSelect(t.tournament_id)}
            style={({ pressed }) => ({
              padding: theme.spacing.lg,
              borderRadius: theme.radii.md,
              backgroundColor: isSelected
                ? withOpacity(theme.colors.primary, 0.08)
                : theme.colors.surface,
              gap: theme.spacing.xs,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Text variant="cardTitle">{t.name}</Text>
            {t.host_countries ? (
              <Text variant="detail" color="slate">
                {t.host_countries}
              </Text>
            ) : null}
            <Text variant="detail" color="slate">
              {formatDateRange(t.start_date, t.end_date)}
            </Text>
            {t.description ? (
              <Text variant="detail" color="slate" numberOfLines={2}>
                {t.description}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function formatDateRange(startIso: string, endIso: string): string {
  const start = parseDate(startIso);
  const end = parseDate(endIso);
  if (!start || !end) return `${startIso} – ${endIso}`;
  const startStr = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${startStr} – ${endStr}`;
}

// ============ Step 2: Pool Type ============

function PoolTypeStep({
  mode,
  onChange,
}: {
  mode: CreatePoolRequest['prediction_mode'];
  onChange: (mode: CreatePoolRequest['prediction_mode']) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.md }}>
      <Text variant="body" color="slate">
        How will members make their predictions?
      </Text>

      {MODE_OPTIONS.map((opt) => {
        const isSelected = mode === opt.value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: theme.spacing.md,
              padding: theme.spacing.lg,
              borderRadius: theme.radii.md,
              backgroundColor: isSelected
                ? withOpacity(theme.colors.primary, 0.08)
                : theme.colors.surface,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <View style={{ width: 32, alignItems: 'center', paddingTop: 2 }}>
              <Icon
                name={opt.icon as never}
                color={isSelected ? 'primary' : 'slate'}
                size={22}
              />
            </View>
            <View style={{ flex: 1, gap: theme.spacing.xs }}>
              <Text variant="cardTitle">{opt.title}</Text>
              <Text variant="detail" color="slate">
                {opt.description}
              </Text>
            </View>
          </Pressable>
        );
      })}

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
          Pool type cannot be changed after creation.
        </Text>
      </View>
    </View>
  );
}

// ============ Step 3: Details ============

function DetailsStep({
  tournament,
  poolName,
  description,
  onNameChange,
  onDescriptionChange,
}: {
  tournament: Tournament | null;
  poolName: string;
  description: string;
  onNameChange: (s: string) => void;
  onDescriptionChange: (s: string) => void;
}) {
  const theme = useTheme();
  const placeholder = tournament ? `e.g. Office ${tournament.short_name ?? tournament.name}` : 'e.g. Office World Cup';

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
  deadline,
  onApplyQuickDeadline,
  isPrivate,
  onPrivacyChange,
  maxParticipants,
  onMaxParticipantsChange,
  maxEntriesPerUser,
  onMaxEntriesChange,
}: {
  mode: CreatePoolRequest['prediction_mode'];
  deadline: Date | null;
  onApplyQuickDeadline: (option: QuickDeadline) => void;
  isPrivate: boolean;
  onPrivacyChange: (b: boolean) => void;
  maxParticipants: string;
  onMaxParticipantsChange: (s: string) => void;
  maxEntriesPerUser: number;
  onMaxEntriesChange: (n: number) => void;
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.lg }}>
      <Card title={mode === 'progressive' ? 'Group Stage Deadline' : 'Prediction Deadline'}>
        <Text variant="body">
          {deadline ? formatDeadlineDisplay(deadline) : '—'}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          <Chip label="Tournament Start" onPress={() => onApplyQuickDeadline('tournament_start')} />
          <Chip label="1 Day Before" onPress={() => onApplyQuickDeadline('one_day_before')} />
          <Chip label="1 Week Before" onPress={() => onApplyQuickDeadline('one_week_before')} />
        </View>
      </Card>

      <Card title="Privacy">
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <PrivacyOption
            title="Public"
            subtitle="Anyone with code can join"
            selected={!isPrivate}
            onPress={() => onPrivacyChange(false)}
          />
          <PrivacyOption
            title="Private"
            subtitle="Invite only"
            selected={isPrivate}
            onPress={() => onPrivacyChange(true)}
          />
        </View>
      </Card>

      <Card title="Maximum Members">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          <View style={{ width: 88 }}>
            <Input
              value={maxParticipants}
              onChangeText={(v) => onMaxParticipantsChange(v.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              style={{
                fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
                fontSize: 16,
                textAlign: 'center',
              }}
            />
          </View>
          <Text variant="detail" color="slate" style={{ flex: 1 }}>
            Set to 0 for unlimited
          </Text>
        </View>
      </Card>

      <Card title="Max Entries Per Member">
        <Text variant="detail" color="slate">
          Allow members to submit multiple sets of predictions. Each entry is scored independently.
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
            const isSelected = maxEntriesPerUser === n;
            return (
              <Pressable
                key={n}
                onPress={() => onMaxEntriesChange(n)}
                style={({ pressed }) => ({
                  width: 48,
                  height: 40,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: theme.radii.sm,
                  backgroundColor: isSelected ? theme.colors.primary : theme.colors.mist,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text
                  style={{
                    fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
                    fontSize: 14,
                    color: isSelected ? '#FFFFFF' : theme.colors.ink,
                    fontWeight: isSelected ? '700' : '500',
                  }}
                >
                  {n}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Card>

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
            Scoring & Bonus Points
          </Text>
          <Text variant="detail" color="slate">
            Your pool will be created with default scoring settings. You can customize all scoring rules, multipliers, and bonus points from the pool admin settings after creation.
          </Text>
        </View>
      </View>
    </View>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
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
      <Text variant="cardTitle">{title}</Text>
      {children}
    </View>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
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
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        gap: 2,
        paddingVertical: theme.spacing.md,
        borderRadius: theme.radii.sm,
        backgroundColor: selected ? withOpacity(theme.colors.primary, 0.08) : theme.colors.mist,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Text
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 16,
          color: selected ? theme.colors.primary : theme.colors.ink,
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
