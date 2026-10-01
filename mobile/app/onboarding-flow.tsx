// =============================================================
// THE ONBOARDING JOURNEY — built on the screens that already ship
// =============================================================
// ⚠ DEV-ONLY, reached from Profile → Developer. It is a working build of the chosen design, not a
// mock-up: the picker is the real `OutcomePicker`, the binoculars open the real scout shell, the
// board is the real `LeaderboardRow`, and "Make mine" pushes the real avatar editor.
//
// ## The shape, and why it is this way round
//
//   play → see it score → stand on a board → *then* identity → then money → then alerts
//
// The one lever the research is unambiguous about is moving the account behind the first real act:
// Duolingo's own A/B moved sign-up behind the first lesson and DAUs went up ~20%. Our lesson is a
// matchweek of picks, so nothing here asks who you are until you have already done something.
//
// ## ⚠⚠ THREE THINGS THIS SCREEN WILL NOT DO
//
//   · IT NEVER FIRES THE REAL OS PUSH PROMPT. iOS grants one `requestPermissionsAsync()` that
//     actually shows a dialog; spending it here would be unrecoverable short of a reinstall AND
//     would take the real onboarding's one shot with it. `SimulatedPushAlert` is a drawn copy.
//   · IT NEVER WRITES A PICK. The practice matchweek is held in component state and thrown away.
//   · IT DOES NOT TOUCH THE ONBOARDING FLAGS. `markOnboardingSeen` / `markNotificationsPrompted`
//     are never called, so running this cannot lock you out of the flow you are reviewing.
//
// ⚠ THE ONE REAL WRITE IS THE AVATAR, AND THAT IS DELIBERATE. Ryan asked for the actual
// customisation flow, so "Make mine" pushes `app/profile/avatar.tsx` — which really saves to
// `users.avatar_build`. Running this harness to the end therefore changes your own avatar. That is
// the cost of it being the real editor rather than a copy of it.
// =============================================================

import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { PracticeScoutSheet } from '@/components/onboarding/PracticeScoutSheet';
import { LeaderboardRow } from '@/components/pool-detail/LeaderboardRow';
import { OutcomePicker, type Outcome } from '@/components/pool-detail/OutcomePicker';
import { Button, Icon, Text } from '@/components/ui';
import type { LeaderboardEntry } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { crestUrl, PRACTICE_CREW, PRACTICE_MATCHWEEK, POINTS_PER_CORRECT, type PracticeFixture } from '@/lib/onboarding/practiceMatchweek';
import { supabase } from '@/lib/supabase';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type Step = 'intro' | 'pick' | 'results' | 'board' | 'ask' | 'trial' | 'alerts' | 'done';

export default function OnboardingFlowScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>('intro');
  const [picks, setPicks] = useState<Record<string, Outcome>>({});
  const [scouting, setScouting] = useState<PracticeFixture | null>(null);
  const [coachSeen, setCoachSeen] = useState(false);
  const [showCoach, setShowCoach] = useState(false);
  const [pushAsking, setPushAsking] = useState(false);
  const [pushGranted, setPushGranted] = useState<boolean | null>(null);
  /** Set when we come back from the real editor, so the board redraws with a face. */
  const [me, setMe] = useState<{ name: string; username: string; build: unknown; colour: string | null; id: string | null }>({
    name: 'You', username: 'you', build: null, colour: null, id: null,
  });

  // ⚠ Read straight from Supabase, the way the avatar editor does — `useHomeData` carries no
  // avatar columns. Re-read on focus so returning from the editor shows the face that was saved.
  const loadMe = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('users')
      .select('user_id, full_name, username, avatar_build, avatar_colour')
      .eq('auth_user_id', user.id)
      .single();
    if (error) {
      console.warn('[onboarding-flow] could not read the profile:', error.message);
      return;
    }
    setMe({
      name: data?.full_name ?? 'You',
      username: data?.username ?? 'you',
      build: data?.avatar_build ?? null,
      colour: data?.avatar_colour ?? null,
      id: data?.user_id ?? null,
    });
  }, [user]);

  useFocusEffect(useCallback(() => { void loadMe(); }, [loadMe]));

  const fixtures = PRACTICE_MATCHWEEK.fixtures;
  const remaining = fixtures.filter((f) => !picks[f.key]).length;
  const points = useMemo(
    () => fixtures.reduce((n, f) => n + (picks[f.key] === f.outcome ? POINTS_PER_CORRECT : 0), 0),
    [fixtures, picks],
  );

  const choose = useCallback((f: PracticeFixture, o: Outcome) => {
    setPicks((p) => ({ ...p, [f.key]: o }));
    // The call-out fires once, after the first pick — a tooltip before anyone has done anything is
    // an instruction, and after one tap it is an answer to a question they now have.
    if (!coachSeen) { setCoachSeen(true); setTimeout(() => setShowCoach(true), 420); }
  }, [coachSeen]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        {step === 'intro' ? <Intro onNext={() => setStep('pick')} /> : null}

        {step === 'pick' ? (
          <PickStep
            fixtures={fixtures}
            picks={picks}
            remaining={remaining}
            onChoose={choose}
            onScout={setScouting}
            showCoach={showCoach}
            onDismissCoach={() => { setShowCoach(false); setScouting(fixtures[0]); }}
            onLock={() => setStep('results')}
          />
        ) : null}

        {step === 'results' ? (
          <ResultsStep fixtures={fixtures} picks={picks} points={points} onNext={() => setStep('board')} />
        ) : null}

        {step === 'board' ? (
          <BoardStep
            me={me}
            points={points}
            onNext={() => setStep(hasFace(me.build) ? 'trial' : 'ask')}
            hasFace={hasFace(me.build)}
          />
        ) : null}

        {step === 'ask' ? (
          <AskStep
            name={me.name}
            onBuild={() => router.push('/profile/avatar')}
            onSkip={() => setStep('trial')}
          />
        ) : null}

        {step === 'trial' ? <TrialStep onNext={() => setStep('alerts')} /> : null}

        {step === 'alerts' ? (
          <AlertsStep
            onAsk={() => setPushAsking(true)}
            onSkip={() => setStep('done')}
          />
        ) : null}

        {step === 'done' ? <DoneStep granted={pushGranted} onRestart={restart} /> : null}
      </SafeAreaView>

      <PracticeScoutSheet fixture={scouting} onClose={() => setScouting(null)} />
      <SimulatedPushAlert
        visible={pushAsking}
        onAnswer={(granted) => { setPushAsking(false); setPushGranted(granted); setStep('done'); }}
      />

      <HarnessBar step={step} onBack={() => router.back()} onRestart={restart} />
    </View>
  );

  function restart() {
    setStep('intro'); setPicks({}); setCoachSeen(false); setShowCoach(false); setPushGranted(null);
  }
}

/** Has the member built a face? The editor stores `null` until they have. */
function hasFace(build: unknown): boolean {
  return build !== null && typeof build === 'object';
}

// ---------------------------------------------------------------------------
// 1 — the offer, and the disclosure that makes it a game rather than a trick
// ---------------------------------------------------------------------------
function Intro({ onNext }: { onNext: () => void }) {
  const theme = useTheme();
  return (
    <>
      <View style={{ flex: 1, justifyContent: 'center', padding: theme.spacing.xl, gap: theme.spacing.xl }}>
        <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
          <Text variant="caption" color="primary">Try it out</Text>
          <Text variant="pageTitle" color="ink" align="center">Play a matchweek.</Text>
          <Text variant="body" color="slate" align="center">
            Ten real fixtures — the same screen you’ll use every week.
          </Text>
        </View>
        <View
          style={{
            flexDirection: 'row', gap: theme.spacing.md, padding: theme.spacing.lg,
            borderRadius: theme.radii.md, backgroundColor: theme.colors.surface,
          }}
        >
          <RNText style={{ fontSize: 20 }}>🗄️</RNText>
          <Text variant="body" color="slate" style={{ flex: 1 }}>
            <Text variant="body" color="ink" style={{ fontWeight: '700' }}>
              This is matchweek {PRACTICE_MATCHWEEK.matchweek} of the {PRACTICE_MATCHWEEK.season} season.
            </Text>{' '}
            It has already been played, so we know the answers — and you almost certainly don’t. You
            could look them up. It would rather spoil it.
          </Text>
        </View>
      </View>
      <Footer>
        <Button title="Give me the fixtures" size="lg" fullWidth onPress={onNext} />
        <Text variant="detail" color="slate" align="center">No account. Nothing saved yet.</Text>
      </Footer>
    </>
  );
}

// ---------------------------------------------------------------------------
// 2 — the picker. The real control, the real binoculars.
// ---------------------------------------------------------------------------
function PickStep({
  fixtures, picks, remaining, onChoose, onScout, showCoach, onDismissCoach, onLock,
}: {
  fixtures: readonly PracticeFixture[];
  picks: Record<string, Outcome>;
  remaining: number;
  onChoose: (f: PracticeFixture, o: Outcome) => void;
  onScout: (f: PracticeFixture) => void;
  showCoach: boolean;
  onDismissCoach: () => void;
  onLock: () => void;
}) {
  const theme = useTheme();
  return (
    <>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.xl, gap: theme.spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Text variant="caption" color="primary" style={{ flex: 1 }}>
            Matchweek {PRACTICE_MATCHWEEK.matchweek} · {PRACTICE_MATCHWEEK.season}
          </Text>
          <View style={{ paddingHorizontal: theme.spacing.sm, paddingVertical: 2, borderRadius: theme.radii.pill, backgroundColor: withOpacity(theme.colors.slate, 0.14) }}>
            <Text variant="detail" color="slate">already played</Text>
          </View>
        </View>

        {fixtures.map((f, i) => (
          <View key={f.key} style={{ gap: theme.spacing.sm }}>
            <View
              style={{
                padding: theme.spacing.md, borderRadius: theme.radii.lg,
                backgroundColor: theme.colors.surface, gap: theme.spacing.sm, ...theme.shadows.card,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                <Text variant="detail" color="slate" style={{ flex: 1 }}>{f.kickoff}</Text>
                {/* ⚠ The same control as the live picker: 28pt pill, primary@12%, on the header
                    row rather than beside the buttons so the gesture to read cannot be confused
                    with the gesture to pick. */}
                <Pressable
                  onPress={() => onScout(f)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Scout ${f.home.name} against ${f.away.name}`}
                  style={({ pressed }) => ({
                    width: 28, height: 28, borderRadius: theme.radii.pill,
                    backgroundColor: withOpacity(theme.colors.primary, 0.12),
                    alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Icon name="binoculars" size={14} color="primary" />
                </Pressable>
              </View>

              <OutcomePicker
                value={picks[f.key] ?? null}
                onChange={(o) => onChoose(f, o)}
                home={{ name: f.home.name, shortName: f.home.shortName, abbr: f.home.abbr, crestUrl: crestUrl(f.home.id) }}
                away={{ name: f.away.name, shortName: f.away.shortName, abbr: f.away.abbr, crestUrl: crestUrl(f.away.id) }}
              />
            </View>

            {i === 0 && showCoach ? <CoachMark onDismiss={onDismissCoach} /> : null}
          </View>
        ))}
      </ScrollView>
      <Footer>
        <Button
          title="Lock in my picks"
          size="lg"
          fullWidth
          disabled={remaining > 0}
          onPress={onLock}
        />
        <Text variant="detail" color="slate" align="center">
          {remaining > 0 ? `${remaining} of ${fixtures.length} still to pick` : 'All ten in'}
        </Text>
      </Footer>
    </>
  );
}

/** ⚠ Fires once, after the first pick — see `choose`. */
function CoachMark({ onDismiss }: { onDismiss: () => void }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.ink, borderRadius: theme.radii.md,
        padding: theme.spacing.lg, gap: theme.spacing.sm,
      }}
    >
      <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 14, color: '#FFF' }}>
        🔭 That’s the scout report.
      </RNText>
      <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 13, lineHeight: 18, color: '#FFFFFFB8' }}>
        Form at the ends they’re playing, who’s out, what usually happens when these two meet — and
        what everyone else picked. It’s on every fixture, before and after the lock.
      </RNText>
      <Pressable
        onPress={onDismiss}
        style={{
          height: 36, borderRadius: theme.radii.sm, backgroundColor: '#FFF',
          alignItems: 'center', justifyContent: 'center', marginTop: theme.spacing.xs,
        }}
      >
        <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 13, color: theme.colors.ink }}>
          Show me one
        </RNText>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 3 — results. Scoring is demonstrated, never explained.
// ---------------------------------------------------------------------------
function ResultsStep({
  fixtures, picks, points, onNext,
}: {
  fixtures: readonly PracticeFixture[];
  picks: Record<string, Outcome>;
  points: number;
  onNext: () => void;
}) {
  const theme = useTheme();
  return (
    <>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.sm }}>
        <Text variant="sectionHeader" color="ink" style={{ marginBottom: theme.spacing.sm }}>
          Here’s what actually happened.
        </Text>
        {fixtures.map((f) => {
          const right = picks[f.key] === f.outcome;
          return (
            <View
              key={f.key}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md,
                padding: theme.spacing.md, borderRadius: theme.radii.md,
                backgroundColor: theme.colors.surface,
              }}
            >
              <Text variant="body" color="ink" style={{ flex: 1 }}>{f.home.shortName}</Text>
              <RNText style={{ fontFamily: fontFamilies.black, fontSize: 15, color: theme.colors.ink }}>
                {f.score}
              </RNText>
              <Text variant="body" color="ink" style={{ flex: 1, textAlign: 'right' }}>{f.away.shortName}</Text>
              <RNText
                style={{
                  width: 38, textAlign: 'right', fontFamily: fontFamilies.black, fontSize: 14,
                  color: right ? theme.colors.green : theme.colors.slate,
                }}
              >
                {right ? `+${POINTS_PER_CORRECT}` : '0'}
              </RNText>
            </View>
          );
        })}
        <RNText
          style={{
            fontFamily: fontFamilies.black, fontSize: 38, color: theme.colors.primary,
            textAlign: 'center', marginTop: theme.spacing.md,
          }}
        >
          {points}
        </RNText>
        <Text variant="detail" color="slate" align="center">
          points · exact scorelines would have been worth more
        </Text>
      </ScrollView>
      <Footer><Button title="Where did I finish?" size="lg" fullWidth onPress={onNext} /></Footer>
    </>
  );
}

// ---------------------------------------------------------------------------
// 4 — the board. The REAL row, and you are on it with initials.
// ---------------------------------------------------------------------------
function BoardStep({
  me, points, onNext, hasFace: faced,
}: {
  me: { name: string; username: string; build: unknown; colour: string | null; id: string | null };
  points: number;
  onNext: () => void;
  hasFace: boolean;
}) {
  const theme = useTheme();

  const rows = useMemo(() => {
    const crew = PRACTICE_CREW.map((c, i) => entry({
      id: `practice-${i}`, name: c.name, username: c.username, points: c.points,
      level: c.level, levelName: c.levelName,
    }));
    const mine = entry({
      id: me.id ?? 'me', name: me.name, username: me.username, points,
      level: 1, levelName: 'New', build: me.build, colour: me.colour, mine: true,
    });
    // ⚠ The member wins a tie. On the one screen whose job is "you did well", losing a tie to a
    // character we invented would be a strange thing to have built.
    return [...crew, mine].sort((a, b) => b.total_points - a.total_points || (a.user_id === mine.user_id ? -1 : 1));
  }, [me, points]);

  const rank = rows.findIndex((r) => r.user_id === (me.id ?? 'me')) + 1;

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.sm }}>
        <Text variant="caption" color="primary">Matchweek {PRACTICE_MATCHWEEK.matchweek} · the practice board</Text>
        <Text variant="sectionHeader" color="ink">
          You finished {['', '1st', '2nd', '3rd', '4th'][rank] ?? `${rank}th`}.
        </Text>
        <Text variant="body" color="slate" style={{ marginBottom: theme.spacing.sm }}>
          {points} points, against three players who have already done this week.
        </Text>

        {rows.map((r, i) => (
          <LeaderboardRow
            key={r.entry_id}
            entry={r}
            rank={i + 1}
            isCurrentUser={r.user_id === (me.id ?? 'me')}
            awards={[]}
          />
        ))}

        {/* ⚠⚠ ON EVERY ROW, NOT IN A FOOTNOTE. A bot presented as a member is the one thing in this
            flow that could fairly be called deceptive; a footnote is how that becomes a lie. */}
        <Text variant="detail" color="slate" style={{ marginTop: theme.spacing.xs }}>
          Priya, Dev and Marcus are ours — a practice crew, not real members.
        </Text>
      </ScrollView>
      <Footer>
        <Button title={faced ? 'Next' : 'Next'} size="lg" fullWidth onPress={onNext} />
      </Footer>
    </>
  );
}

/** A `LeaderboardEntry` with everything the row reads and nothing it doesn't. */
function entry(o: {
  id: string; name: string; username: string; points: number; level: number; levelName: string;
  build?: unknown; colour?: string | null; mine?: boolean;
}): LeaderboardEntry {
  return {
    entry_id: o.id, entry_name: o.name, entry_number: 1, member_id: o.id, user_id: o.id,
    full_name: o.name, username: o.username, avatar_colour: o.colour ?? null,
    avatar_build: o.build ?? null, total_points: o.points, current_rank: null, previous_rank: null,
    match_points: o.points, bonus_points: 0, point_adjustment: 0, has_submitted_predictions: true,
    last_five: o.mine ? ['no_pick', 'no_pick', 'no_pick', 'no_pick', 'no_pick'] : ['winner', 'winner', 'miss', 'winner', 'miss'],
    current_streak: { type: 'none', length: 0 }, hit_rate: 0, exact_count: 0,
    level: o.level, level_name: o.levelName, total_xp: 0, contrarian_wins: 0,
    crowd_agreement_pct: 0, total_completed: 10,
  };
}

// ---------------------------------------------------------------------------
// 5 — the ask, then the REAL editor
// ---------------------------------------------------------------------------
function AskStep({ name, onBuild, onSkip }: { name: string; onBuild: () => void; onSkip: () => void }) {
  const theme = useTheme();
  return (
    <>
      <View style={{ flex: 1, justifyContent: 'center', padding: theme.spacing.xl, gap: theme.spacing.lg }}>
        <View style={{ alignItems: 'center', gap: theme.spacing.lg }}>
          <View
            style={{
              width: 84, height: 84, borderRadius: 42,
              backgroundColor: withOpacity(theme.colors.primary, 0.12),
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 30, color: theme.colors.primary }}>
              {initials(name)}
            </RNText>
          </View>
          <Text variant="pageTitle" color="ink" align="center" style={{ fontSize: 26, lineHeight: 31 }}>
            You’re the only one with initials.
          </Text>
          <Text variant="body" color="slate" align="center">
            Everyone else on that board has a face. It takes about thirty seconds, and you can change
            it whenever you like.
          </Text>
        </View>
      </View>
      <Footer>
        <Button title="Make mine" size="lg" fullWidth onPress={onBuild} />
        <Pressable onPress={onSkip} hitSlop={8} style={({ pressed }) => ({ alignItems: 'center', paddingVertical: theme.spacing.md, opacity: pressed ? 0.6 : 1 })}>
          <Text variant="cardTitle" color="slate">Keep my initials</Text>
        </Pressable>
      </Footer>
    </>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// 6 — the bonus features
// ---------------------------------------------------------------------------
function TrialStep({ onNext }: { onNext: () => void }) {
  const theme = useTheme();
  const rows: [string, string, string][] = [
    ['🔭', 'The scout report', 'on every fixture, every matchweek'],
    ['📊', 'Your career record', 'lifetime picks and accuracy across every pool'],
    ['🎁', 'This season’s cosmetic set', 'yours for good — it does not expire'],
  ];
  const timeline: [string, string, boolean][] = [
    ['Today', 'Everything above switches on. No card.', true],
    ['End of matchweek 4', 'We email you — a full week before anything happens.', false],
    ['End of matchweek 5', '$9.99 once for the rest of the season, or it simply stops. Nothing you made is deleted.', false],
  ];
  return (
    <>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.lg }}>
        <View style={{ gap: theme.spacing.sm }}>
          <Text variant="caption" color="primary">The bonus features</Text>
          <Text variant="sectionHeader" color="ink">Free for five matchweeks.</Text>
          <Text variant="body" color="slate">
            The scout report you just used is part of the Season Pass. Take it for five weeks and see
            if you’d miss it.
          </Text>
        </View>

        <View style={{ padding: theme.spacing.lg, borderRadius: theme.radii.md, backgroundColor: theme.colors.surface, gap: theme.spacing.md }}>
          {rows.map(([g, t, b]) => (
            <View key={t} style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <RNText style={{ fontSize: 16 }}>{g}</RNText>
              <View style={{ flex: 1 }}>
                <Text variant="cardTitle" color="ink" style={{ fontSize: 14 }}>{t}</Text>
                <Text variant="body" color="slate" style={{ fontSize: 13 }}>{b}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ⚠ "Start" is only honest on a screen that carries the timeline — otherwise it hides what
            happens next. The reminder a week out is the promise that makes the rest of it safe. */}
        <View style={{ padding: theme.spacing.lg, borderRadius: theme.radii.md, backgroundColor: theme.colors.surface, gap: theme.spacing.lg }}>
          {timeline.map(([when, what, on]) => (
            <View key={when} style={{ flexDirection: 'row', gap: theme.spacing.md }}>
              <View style={{ width: on ? 14 : 10, height: on ? 14 : 10, borderRadius: 7, marginTop: 4, backgroundColor: on ? theme.colors.primary : theme.colors.silver }} />
              <View style={{ flex: 1 }}>
                <Text variant="cardTitle" color={on ? 'primary' : 'ink'} style={{ fontSize: 14 }}>{when}</Text>
                <Text variant="body" color="slate" style={{ fontSize: 13 }}>{what}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
      <Footer>
        <Button title="Start the five weeks" size="lg" fullWidth onPress={onNext} />
        <Pressable onPress={onNext} hitSlop={8} style={({ pressed }) => ({ alignItems: 'center', paddingVertical: theme.spacing.md, opacity: pressed ? 0.6 : 1 })}>
          <Text variant="cardTitle" color="slate">No thanks</Text>
        </Pressable>
      </Footer>
    </>
  );
}

// ---------------------------------------------------------------------------
// 7 — alerts
// ---------------------------------------------------------------------------
function AlertsStep({ onAsk, onSkip }: { onAsk: () => void; onSkip: () => void }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.midnight, margin: -1 }}>
      <View style={{ flex: 1, justifyContent: 'center', padding: theme.spacing.xl, gap: theme.spacing.lg }}>
        <RNText style={{ fontFamily: fontFamilies.black, fontSize: 28, lineHeight: 34, color: '#FFF' }}>
          You’ll want to be told.
        </RNText>
        <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 14, lineHeight: 20, color: '#FFFFFFB0' }}>
          A nudge before picks lock, a goal in a match you have a pick on, and somebody passing you.
          That’s the lot — no digests, nothing on a timer.
        </RNText>
      </View>
      <SafeAreaView edges={['bottom']}>
        <View style={{ paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.lg, gap: theme.spacing.sm }}>
          <Button title="Send me these" size="lg" fullWidth onPress={onAsk} />
          <Pressable onPress={onSkip} hitSlop={8} style={({ pressed }) => ({ alignItems: 'center', paddingVertical: theme.spacing.md, opacity: pressed ? 0.6 : 1 })}>
            <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 16, color: '#FFFFFF99' }}>Not now</RNText>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// 8 — done
// ---------------------------------------------------------------------------
function DoneStep({ granted, onRestart }: { granted: boolean | null; onRestart: () => void }) {
  const theme = useTheme();
  const doors: [string, string, string][] = [
    ['🔗', 'I have an invite code', 'Paste it and you’re in'],
    ['🔎', 'Browse open pools', 'Public pools you can join right now'],
    ['✨', 'Start my own', 'Pick a competition and a mode'],
  ];
  return (
    <>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.lg }}>
        <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
          <Text variant="pageTitle" color="ink" align="center">You’re set.</Text>
          <Text variant="body" color="slate" align="center">
            {granted === true
              ? 'Alerts are on. Now the only thing left is a pool with people you know in it.'
              : 'Now the only thing left is a pool with people you know in it.'}
          </Text>
        </View>
        {doors.map(([g, t, b]) => (
          <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg, padding: theme.spacing.lg, borderRadius: theme.radii.md, backgroundColor: theme.colors.surface }}>
            <RNText style={{ fontSize: 21 }}>{g}</RNText>
            <View style={{ flex: 1 }}>
              <Text variant="cardTitle" color="ink">{t}</Text>
              <Text variant="body" color="slate">{b}</Text>
            </View>
            <Text variant="cardTitle" color="slate">›</Text>
          </View>
        ))}
      </ScrollView>
      <Footer><Button title="Run it again" size="lg" variant="secondary" fullWidth onPress={onRestart} /></Footer>
    </>
  );
}

// ---------------------------------------------------------------------------
// shared chrome
// ---------------------------------------------------------------------------
function Footer({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <SafeAreaView edges={['bottom']}>
      <View style={{ paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.lg, gap: theme.spacing.sm }}>
        {children}
      </View>
    </SafeAreaView>
  );
}

/** ⚠ Harness-only. It is the only way out, because the flow draws no header of its own. */
function HarnessBar({ step, onBack, onRestart }: { step: Step; onBack: () => void; onRestart: () => void }) {
  const theme = useTheme();
  return (
    <SafeAreaView edges={['bottom']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} pointerEvents="box-none">
      <View
        style={{
          flexDirection: 'row', alignSelf: 'center', gap: 1, marginBottom: 2,
          borderRadius: theme.radii.pill, overflow: 'hidden',
          backgroundColor: withOpacity(theme.colors.midnight, 0.55),
        }}
      >
        <Chip label="✕ exit" onPress={onBack} />
        <Chip label={`↻ ${step}`} onPress={onRestart} />
      </View>
    </SafeAreaView>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.sm, opacity: pressed ? 0.6 : 1 })}>
      {/* ⚠ A literal white: this chip floats on a translucent midnight bar, the same value in both
          themes, so a theme-aware ink would fail in one of them. */}
      <Text variant="detail" style={{ color: '#FFFFFF' }}>{label}</Text>
    </Pressable>
  );
}

/**
 * 🔴 A DRAWN COPY OF THE iOS ALERT. The real prompt is never fired here — see the file banner.
 * Same words, same button order, same emphasis, so what the screen behind it looks like at the
 * moment of truth is reviewable without spending the one-shot.
 */
function SimulatedPushAlert({ visible, onAnswer }: { visible: boolean; onAnswer: (granted: boolean) => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#00000059', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <View style={{ width: 270, borderRadius: 14, backgroundColor: '#F2F2F2', overflow: 'hidden' }}>
          <View style={{ padding: 16, paddingBottom: 14, alignItems: 'center', gap: 4 }}>
            <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 17, color: '#000', textAlign: 'center' }}>
              “SportPool” Would Like to Send You Notifications
            </RNText>
            <RNText style={{ fontFamily: fontFamilies.regular, fontSize: 13, lineHeight: 17, color: '#000', textAlign: 'center' }}>
              Notifications may include alerts, sounds and icon badges. These can be configured in Settings.
            </RNText>
          </View>
          <View style={{ flexDirection: 'row', borderTopWidth: 0.5, borderTopColor: '#3C3C4340' }}>
            <AlertButton label="Don’t Allow" onPress={() => onAnswer(false)} />
            <View style={{ width: 0.5, backgroundColor: '#3C3C4340' }} />
            <AlertButton label="Allow" bold onPress={() => onAnswer(true)} />
          </View>
        </View>
        <RNText style={{ marginTop: 16, fontFamily: fontFamilies.bold, fontSize: 11, letterSpacing: 1.2, color: '#FFFFFFAA' }}>
          SIMULATED — THE REAL PROMPT IS NEVER FIRED HERE
        </RNText>
      </View>
    </Modal>
  );
}

function AlertButton({ label, bold, onPress }: { label: string; bold?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? '#00000010' : 'transparent' })}>
      <RNText style={{ fontFamily: bold ? fontFamilies.bold : fontFamilies.regular, fontSize: 17, color: '#007AFF' }}>
        {label}
      </RNText>
    </Pressable>
  );
}
