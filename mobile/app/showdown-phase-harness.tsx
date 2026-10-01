// =============================================================
// THE SIX PHASES, ON DEMAND — a throwaway review surface
// =============================================================
// Ryan, 2026-09-06. The Showdown cycle takes a WEEK to go round once, and five
// of its six phases cannot be reached by choice: the draw opens on a clock
// (129), picks lock an hour before kickoff (101), and the recap fires once and
// then never again. Reviewing the band therefore meant waiting for the
// football, and reviewing a change to it meant waiting another week.
//
// So this renders the header in every phase against fixture data, with a picker.
//
// ## ⚠ WHY A HARNESS AND NOT "JUST LOOK AT THE TEST POOL"
//
// The same reason the drag-picker verification uses one: the seeded pools are
// real rows with real RLS and real autosave, and driving them into a state to
// look at it WRITES. `last_reveal_seen_duel` (136) and `last_recap_seen_at`
// (122) are both one-way — burning them to see a ceremony means the next real
// reveal is the one you cannot watch.
//
// ⚠ NOTHING HERE TOUCHES THE NETWORK OR THE DATABASE. Every value below is a
// literal. If this file ever grows a `useQuery`, a Supabase client or a real
// pool id, it has stopped being a harness and become a second surface that can
// disagree with the first.
//
// ## ⚠ IT RENDERS THE REAL COMPONENT, NOT A COPY OF IT
//
// The whole value is that `ShowdownDuelHeader` and `duelPhase` are imported and
// exercised as they ship. A harness that reimplements the band to "show what it
// would look like" proves nothing — it is a drawing of the thing rather than
// the thing, and it goes stale the first time the band changes.
//
// Open it with:
//     officepools://showdown-phase-harness
// or  router.push('/showdown-phase-harness')
//
// ⚠ NOT LINKED FROM THE APP, deliberately — same as the reveal playground. It
// is reachable by deep link and by nothing else, so it cannot be stumbled into.
// =============================================================

import { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Stack } from 'expo-router';
import Animated, {
  type SharedValue,
  useAnimatedProps,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
} from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { ShowdownDuelHeader, type Standing } from '@/components/pool-detail/ShowdownDuelHeader';
import { ShowdownRecapSheet } from '@/components/pool-detail/ShowdownRecapSheet';
import { ShowdownWalkout } from '@/components/pool-detail/ShowdownWalkout';
import { duelPhase, type DuelPhaseInput } from '@/lib/duelPhase';
import type { Bout } from '@/lib/useDuel';
import { fontFamilies, useTheme } from '@/theme';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

// -------------------------------------------------------------- the cast

/**
 * Two stable ids, because the avatar gradient is `hash(userId)` — fixing them
 * means the harness shows the same two colours every time it is opened, so a
 * change to the band is not confused with a change of cast.
 */
const YOU_USER = '11111111-1111-4111-8111-111111111111';
const THEM_USER = '22222222-2222-4222-8222-222222222222';
const YOU_ENTRY = 'entry-you';
/** The current duel. Phase 2 is 'the marker does not equal this'. */
const DUEL_3 = 'duel-mw3';
const THEM_ENTRY = 'entry-them';

const standings = new Map<string, Standing>([
  [
    YOU_ENTRY,
    { userId: YOU_USER, rank: 4, previousRank: 6, points: 3120, correct: 41, lastFive: ['W', 'W', 'L', 'D', 'W'] },
  ],
  [
    THEM_ENTRY,
    { userId: THEM_USER, rank: 2, previousRank: 2, points: 3480, correct: 47, lastFive: ['W', 'D', 'W', 'W', 'L'] },
  ],
]);

const you = { entryId: YOU_ENTRY, name: 'You' };

/**
 * A bout in whatever state the phase needs.
 *
 * ⚠ `settled` AND `settled_at` MOVE TOGETHER. `Bout.settled` is the flag the
 * band reads and `duel.settled_at` is what the phase machine reads; a fixture
 * that sets one without the other would put the harness in a state the real
 * data cannot produce, and then "it looks fine here" would mean nothing.
 */
function bout(opts: { settled?: boolean; accuracyA?: number; accuracyB?: number } = {}): Bout {
  const settled = opts.settled ?? false;
  const settledAt = settled ? '2026-09-07T20:59:00Z' : null;
  return {
    duel: {
      duel_id: DUEL_3,
      matchweek_number: 3,
      entry_a: YOU_ENTRY,
      entry_b: THEM_ENTRY,
      accuracy_a: opts.accuracyA ?? null,
      accuracy_b: opts.accuracyB ?? null,
      points_a: settled ? 500 : null,
      points_b: settled ? 0 : null,
      settled_at: settledAt,
    },
    matchweek: 3,
    you: { entryId: YOU_ENTRY, name: 'You', accuracy: opts.accuracyA ?? null, points: settled ? 500 : null },
    them: { entryId: THEM_ENTRY, name: 'Priya', accuracy: opts.accuracyB ?? null, points: settled ? 0 : null },
    settled,
  };
}

// ------------------------------------------------------------ the phases

/**
 * ⚠ EACH ROW IS THE INPUT, AND THE PHASE IS DERIVED FROM IT — never asserted.
 *
 * The picker chooses a SITUATION (what the server would have said), and
 * `duelPhase` decides which phase that is. Hard-coding the phase per row would
 * make the harness agree with itself no matter what the machine did, which is
 * the one thing it must not do: the ordering bug this was all built to prevent
 * would render perfectly here.
 */
type Situation = {
  label: string;
  /** Ryan's own numbering, so the harness and the conversation use one vocabulary. */
  n: string;
  note: string;
  input: DuelPhaseInput;
  /** Props the band needs that the phase machine has no opinion about. */
  band: { kickoffAt: string | null; liveScore: { you: number; them: number } | null; liveNow: boolean };
};

/** Far enough out that the clock is visibly counting in days. */
const opensAt = new Date(Date.now() + 26 * 3600_000).toISOString();
const kickoffSoon = new Date(Date.now() + 5 * 3600_000).toISOString();

const SITUATIONS: Situation[] = [
  {
    n: '1',
    label: 'Sealed',
    note: 'Season not started. Long clock to the first draw.',
    input: {
      hasDraw: true,
      current: null,
      sealedMatchweek: 1,
      isInPlay: false,
      lastSettledAt: null,
      revealSeenDuel: null,
      recapSeenAt: null,
    },
    band: { kickoffAt: null, liveScore: null, liveNow: false },
  },
  {
    n: '2',
    label: 'Revealable',
    note: 'The draw is open and the walkout has not been watched. Opponent must be HIDDEN.',
    input: {
      hasDraw: true,
      current: { duelId: DUEL_3, matchweek: 3, settledAt: null },
      sealedMatchweek: 4,
      isInPlay: false,
      lastSettledAt: null,
      revealSeenDuel: null,
      recapSeenAt: null,
    },
    band: { kickoffAt: kickoffSoon, liveScore: null, liveNow: false },
  },
  {
    n: '3',
    label: 'Scouting',
    note: 'Met them. Picks still open, clock to the first game.',
    input: {
      hasDraw: true,
      current: { duelId: DUEL_3, matchweek: 3, settledAt: null },
      sealedMatchweek: 4,
      isInPlay: false,
      lastSettledAt: null,
      revealSeenDuel: DUEL_3,
      recapSeenAt: null,
    },
    band: { kickoffAt: kickoffSoon, liveScore: null, liveNow: false },
  },
  {
    n: '4',
    label: 'Live',
    note: 'Locked and being played. Scoreline replaces the clock; LIVE dot only while a ball is in play.',
    input: {
      hasDraw: true,
      current: { duelId: DUEL_3, matchweek: 3, settledAt: null },
      sealedMatchweek: 4,
      isInPlay: true,
      lastSettledAt: null,
      revealSeenDuel: DUEL_3,
      recapSeenAt: null,
    },
    band: { kickoffAt: null, liveScore: { you: 6, them: 4 }, liveNow: true },
  },
  {
    n: '5',
    label: 'Decided',
    note: 'Settled, recap unseen. The sheet renders over this.',
    input: {
      hasDraw: true,
      current: { duelId: DUEL_3, matchweek: 3, settledAt: '2026-09-07T20:59:00Z' },
      sealedMatchweek: 4,
      isInPlay: false,
      lastSettledAt: '2026-09-07T20:59:00Z',
      revealSeenDuel: DUEL_3,
      recapSeenAt: null,
    },
    band: { kickoffAt: null, liveScore: null, liveNow: false },
  },
  {
    n: '6',
    label: 'Full circle',
    note: '⚠ Recap dismissed, and `current` is STILL last week\'s settled bout. The band must show the countdown, not the old match.',
    input: {
      hasDraw: true,
      /*
        ⚠ A SETTLED BOUT, NOT NULL — this fixture used to be `current: null`,
        which is a state production never actually reaches. `useDuel.current`
        falls back to the last result, so after a week settles there is ALWAYS a
        bout in hand. The clean fixture rendered a perfect countdown while the
        real app sat on the finished duel, and the harness said everything was
        fine. A fixture that cannot reproduce the bug cannot catch it.
      */
      current: { duelId: DUEL_3, matchweek: 3, settledAt: '2026-09-07T20:59:00Z' },
      sealedMatchweek: 4,
      isInPlay: false,
      lastSettledAt: '2026-09-07T20:59:00Z',
      revealSeenDuel: DUEL_3,
      recapSeenAt: '2026-09-07T21:30:00Z',
    },
    band: { kickoffAt: null, liveScore: null, liveNow: false },
  },
  {
    n: '—',
    label: 'Bye',
    note: '⚠ NOT a sealed week. Nobody was drawn against you — an odd number of members.',
    input: {
      hasDraw: true,
      current: { duelId: DUEL_3, matchweek: 3, settledAt: null },
      sealedMatchweek: 4,
      isInPlay: false,
      lastSettledAt: null,
      revealSeenDuel: DUEL_3,
      recapSeenAt: null,
    },
    band: { kickoffAt: kickoffSoon, liveScore: null, liveNow: false },
  },
];

// -------------------------------------------------------------- the screen

export default function ShowdownPhaseHarness() {
  const theme = useTheme();
  const [i, setI] = useState(0);
  /**
   * ⭐⭐ THE A/B THAT SETTLES IT. With the band off, the only thing on screen
   * driven by `scrollY` is the probe's own dot — one view, one `translateY`,
   * nothing behind it.
   *
   *   dropped falls with the band off  →  the band's ~10 animated VIEWS are the
   *     cost, and consolidating them is the fix
   *   dropped stays the same           →  the cost is the per-frame commit
   *     pipeline itself, and no amount of surgery on the band will help
   *
   * The second reading is the one that would send this to the Reanimated upgrade
   * instead, so it is worth one toggle to know which.
   */
  const [bandOn, setBandOn] = useState(true);
  const scrollY = useSharedValue(0);
  /**
   * ⚠⚠ THE SCROLL IS WIRED UP, AND IT USED NOT TO BE. `scrollY` was created and
   * handed to the band and then never written, so the band never COLLAPSED here —
   * the harness could show you what every phase looks like and nothing about how
   * any of them behaves.
   *
   * That mattered the moment the collapse became the thing under review: the
   * countdown's whole reason for leaving React is that a commit mid-drag freezes
   * this slide (see `lib/useCountdown.ts`), and a harness that cannot drag cannot
   * show it. Same mechanism as the real screen — a UI-thread worklet writing the
   * shared value, no re-render.
   */
  /**
   * ⚠⚠ `moving` EXISTS BECAUSE THE FIRST PROBE MEASURED THE WRONG THING.
   *
   * It counted every frame, including the ones where nobody was touching the
   * screen — and on a ProMotion display the refresh rate drops as low as 24Hz
   * when idle. A 41ms gap between frames is then the PANEL SAVING POWER, not a
   * frame the app missed, and it read as `worst 37ms` with dozens "dropped" on a
   * screen that was sitting perfectly still.
   *
   * So the stats only accumulate between `onBeginDrag` and the end of momentum,
   * which is the only window in which a late frame means anything.
   */
  const moving = useSharedValue(false);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      'worklet';
      scrollY.value = e.contentOffset.y;
    },
    onBeginDrag: () => {
      'worklet';
      moving.value = true;
    },
    // ⚠ NOT `onEndDrag` — the finger leaving is the START of the fling, which is
    // exactly when a dropped frame is most visible. Momentum ending is the honest
    // close of the window.
    onMomentumEnd: () => {
      'worklet';
      moving.value = false;
    },
    // A drag that ends without momentum (a slow release) fires no momentum event,
    // so this closes the window for that case and is harmless when momentum follows.
    onEndDrag: () => {
      'worklet';
      moving.value = false;
    },
  });
  /**
   * ⚠ THE ONE PLACE A WALKOUT MAY BE REPLAYED.
   *
   * Ryan, 2026-09-02: *"once revealed there should be NO replay button."* That
   * is a rule about the PRODUCT — a member who has met their opponent is not
   * offered the ceremony again, and `last_reveal_seen_at` (136) makes it stick.
   *
   * The harness is not the product. It writes nothing, so watching it here
   * costs a member nothing and burns no marker. Reviewing a six-second
   * animation you can only ever see once a week would otherwise be impossible.
   */
  const [watching, setWatching] = useState(false);
  /**
   * ⚠ SEPARATE FROM THE PHASE, so the recap can be re-opened after dismissal.
   * In the product `recapPending` goes false the instant the marker is stamped
   * and the sheet never returns; here dismissing only closes it, so the
   * animation can be watched more than once. Writes nothing either way.
   */
  const [recapOpen, setRecapOpen] = useState(false);

  const s = SITUATIONS[i];
  const isBye = s.label === 'Bye';

  // ⚠ DERIVED, NOT DECLARED. See the note on `Situation`.
  const resolved = useMemo(() => duelPhase(s.input), [s]);

  /**
   * The bout handed to the band.
   *
   * ⚠ It follows the PHASE, so the harness cannot show a matchup in a state the
   * machine says has none. A sealed phase gets `null` and the band falls to its
   * sealed branch — which is exactly the path being reviewed.
   */
  const currentBout = useMemo((): Bout | null => {
    if (resolved.phase === 'sealed' || resolved.phase === 'none') return null;
    const b = bout(
      resolved.phase === 'decided' || resolved.phase === 'live'
        ? { settled: resolved.phase === 'decided', accuracyA: 6, accuracyB: 4 }
        : {},
    );
    if (isBye) return { ...b, them: null };
    // ⚠ The band must not name them before the walkout. The real screen gets
    // this from the phase; the harness has to honour it or phase 2 reviews as
    // though it were phase 3.
    if (!resolved.opponentVisible) return { ...b, them: null };
    return b;
  }, [resolved, isBye]);

  const sealed = useMemo(
    () =>
      resolved.phase === 'sealed' && resolved.matchweek !== null
        ? { matchweek: resolved.matchweek, opensAt: s.n === '6' ? opensAt : null }
        : null,
    [resolved, s.n],
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <Stack.Screen options={{ headerShown: false }} />

      {bandOn ? (
      <ShowdownDuelHeader
        poolName="Harness FC"
        poolCode="HARNESS"
        bout={currentBout}
        sealed={sealed}
        you={you}
        /* ⚠ DRIVEN OFF THE PHASE, exactly as the real screen does it. Wiring
           the button to the picker index instead would let the band show a
           Reveal the machine does not think is owed — which is the one
           disagreement this harness exists to catch. */
        onReveal={resolved.phase === 'revealable' ? () => setWatching(true) : null}
        phase={resolved.phase}
        /* ⚠ THE HARNESS MUST PASS EVERYTHING THE SCREEN PASSES. Left off, this
           defaults to `true` and the band would light the opponent's corner in
           their own colour during phase 2 — the harness showing a leak the real
           screen does not have is as bad as the reverse. */
        opponentVisible={resolved.opponentVisible}
        standings={standings}
        kickoffAt={s.band.kickoffAt}
        liveScore={s.band.liveScore}
        liveNow={s.band.liveNow}
        scrollY={scrollY}
      >
        <View style={{ height: 44 }} />
      </ShowdownDuelHeader>
      ) : null}

      {/*
        ⚠ SITS BELOW THE BAND RATHER THAN OVER IT. The band floats and slides on
        `scrollY`; a picker layered on top would be the one thing on screen that
        does not move with it, and would read as part of the design.
      */}
      <Animated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md, paddingTop: 320 }}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.xs }}>
          {SITUATIONS.map((x, idx) => (
            <Pressable
              key={x.label}
              onPress={() => setI(idx)}
              accessibilityRole="button"
              style={{
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.sm,
                borderRadius: theme.radii.pill,
                backgroundColor: idx === i ? theme.colors.primary : theme.colors.mist,
              }}
            >
              <Text variant="detail" style={{ color: idx === i ? '#FFFFFF' : theme.colors.slate }}>
                {x.n === '—' ? x.label : `${x.n} · ${x.label}`}
              </Text>
            </Pressable>
          ))}
        </View>

        {/*
          ⚠ THE CONTROL FOR THE EXPERIMENT, not a feature. Turning the band off
          leaves the probe's dot as the only thing `scrollY` drives, which is what
          separates "the band costs too much" from "applying ANY animated prop
          costs too much on this version". See `bandOn` above.
        */}
        <Pressable
          onPress={() => setBandOn((b) => !b)}
          accessibilityRole="button"
          style={{
            paddingVertical: theme.spacing.sm,
            borderRadius: theme.radii.pill,
            alignItems: 'center',
            backgroundColor: bandOn ? theme.colors.mist : theme.colors.primary,
          }}
        >
          <Text variant="detail" style={{ color: bandOn ? theme.colors.slate : '#FFFFFF' }}>
            {bandOn ? 'Band ON — tap to measure the dot alone' : 'Band OFF — dot only'}
          </Text>
        </Pressable>

        <View style={{ gap: theme.spacing.xs }}>
          <Text variant="cardTitle">
            {s.n === '—' ? s.label : `Phase ${s.n} — ${s.label}`}
          </Text>
          <Text variant="body" color="slate">
            {s.note}
          </Text>
        </View>

        {/* ⚠ OFFERED ON THE PHASE, NOT ON THE TAB INDEX. If the machine ever
            stops returning `revealable` for situation 2 — the exact production
            bug this was all built to prevent — this button disappears, and its
            absence is the alarm. */}
        {resolved.recapPending ? (
          <Pressable
            onPress={() => setRecapOpen(true)}
            accessibilityRole="button"
            style={({ pressed }) => ({
              paddingVertical: theme.spacing.md,
              borderRadius: theme.radii.md,
              alignItems: 'center',
              backgroundColor: theme.colors.primary,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text variant="cardTitle" style={{ color: '#FFFFFF' }}>
              Show the recap
            </Text>
          </Pressable>
        ) : null}

        {resolved.phase === 'revealable' ? (
          <Pressable
            onPress={() => setWatching(true)}
            accessibilityRole="button"
            style={({ pressed }) => ({
              paddingVertical: theme.spacing.md,
              borderRadius: theme.radii.md,
              alignItems: 'center',
              backgroundColor: theme.colors.primary,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text variant="cardTitle" style={{ color: '#FFFFFF' }}>
              Watch the walkout
            </Text>
          </Pressable>
        ) : null}

        {/*
          What the machine actually returned. This is the half of the harness
          that catches an ordering bug: if a situation that should offer the
          walkout resolves to `sealed`, it says so here in words rather than
          quietly rendering a plausible countdown to the wrong week.
        */}
        <View
          style={{
            padding: theme.spacing.md,
            borderRadius: theme.radii.md,
            backgroundColor: theme.colors.mist,
            gap: 2,
          }}
        >
          <Row k="phase" v={resolved.phase} />
          <Row k="matchweek" v={String(resolved.matchweek)} />
          <Row k="opponentVisible" v={String(resolved.opponentVisible)} />
          <Row k="recapPending" v={String(resolved.recapPending)} />
        </View>

        {/*
          ⚠⚠ DELIBERATE DEAD SPACE, AND IT IS LOAD-BEARING FOR THE REVIEW.
          The band collapses over roughly the first 150pt of scroll, and every
          other child here put together does not fill a phone — so without
          something taller than the viewport underneath, there is nothing to drag
          and the collapse cannot be watched at all. That is the state this
          harness was in until the scroll was wired up.

          Do not "tidy" this away. A harness that cannot reproduce the behaviour
          cannot catch a regression in it — the same lesson the phase-6 fixture
          note records a few hundred lines up.
        */}
        <View style={{ height: 700, paddingTop: theme.spacing.xl, gap: theme.spacing.sm }}>
          <Text variant="cardTitle" align="center">
            Scroll down and back up
          </Text>
          <Text variant="body" color="slate" align="center">
            The band should track your finger the whole way, with no freeze on the
            second. Phase 3 and phase 6 are the ones with a running clock.
          </Text>
        </View>
      </Animated.ScrollView>

      {/*
        ⚠ RENDERED LAST so it covers the band and the picker both. In the real
        screen it is a full-screen takeover for six seconds; anything that stays
        visible over it — a tab bar, a FAB — breaks the takeover and is worth
        catching here rather than on a Saturday.
      */}
      {/* Phase 5. Review is inert here — the harness has no pool to navigate into. */}
      <ShowdownRecapSheet
        recap={
          recapOpen
            ? {
                duelId: DUEL_3,
                matchweek: 3,
                you: { name: 'You', userId: YOU_USER, score: 6 },
                them: { name: 'Priya', userId: THEM_USER, score: 4 },
                points: 500,
              }
            : null
        }
        onSkip={() => setRecapOpen(false)}
        onReview={() => setRecapOpen(false)}
      />

      {watching ? (
        <ShowdownWalkout
          matchweek={3}
          opponent={{
            name: 'Priya',
            userId: THEM_USER,
            record: { won: 2, tied: 0, lost: 1 },
            duelPoints: 1250,
            rank: 2,
          }}
          onClose={() => setWatching(false)}
        />
      ) : null}

      {/*
        ⚠ LAST, AND OUTSIDE THE SCROLLVIEW. It is pinned to the screen and rides
        the same `scrollY` the band does — inside the scroll content it would move
        with the content and measure nothing.
      */}
      <ScrollProbe scrollY={scrollY} moving={moving} />
    </View>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Text variant="detail" color="slate">
        {k}
      </Text>
      <Text variant="detail" style={{ fontVariant: ['tabular-nums'], color: theme.colors.ink }}>
        {v}
      </Text>
    </View>
  );
}

// ------------------------------------------------------ the scroll probe

/**
 * ⭐⭐ THE INSTRUMENT, BECAUSE TWO DIAGNOSES IN A ROW WERE WRONG.
 *
 * The Showdown band jitters on scroll. The first explanation was composed-SVG
 * view count (killed by the fact that it predated the avatars); the second was
 * the 1 Hz countdown committing mid-drag (the fix shipped and the jitter stayed).
 * A third guess is not worth having. This measures instead, and it answers two
 * different questions that call for opposite fixes.
 *
 * ⚠ 1. IS THE UI THREAD DROPPING FRAMES AT ALL? `useFrameCallback` runs on the UI
 * thread, so the gap it reports is the real one — not what the JS thread thinks.
 * If `worst` sits near the display interval while the band still looks wrong, the
 * frames are arriving and it is WHERE the band is drawn that is late, which is
 * the commit-pause family. If `worst` spikes, something is genuinely costing time
 * on the UI thread and the pause theory is not the story.
 *
 * ⚠⚠ 2. THE DOT IS THE CONTROL, AND IT IS THE MORE USEFUL HALF. It rides the SAME
 * `scrollY`, through the same kind of worklet, with nothing behind it — no
 * gradients, no avatars, no text. So:
 *
 *     dot smooth + band jittery  →  the band's own CONTENT is the cost
 *     dot jittery + band jittery →  the pipeline that applies both is the cost
 *
 * No number can separate those two; two things moving side by side can.
 *
 * ⚠ IT MUST NOT RE-RENDER, or it measures itself. Everything here is a shared
 * value read through `useAnimatedProps` — the same reason `CountdownText` is a
 * `TextInput`.
 *
 * ⚠ AND THIS IS A DEV BUNDLE, which drops frames a release build would not. The
 * ABSOLUTE numbers are not the product's frame rate. The COMPARISON is what is
 * being read here.
 */
function ScrollProbe({
  scrollY,
  moving,
}: {
  scrollY: SharedValue<number>;
  moving: SharedValue<boolean>;
}) {
  const theme = useTheme();
  const worst = useSharedValue(0);
  const dropped = useSharedValue(0);
  const wasMoving = useSharedValue(false);
  /**
   * ⚠ A SEPARATE PAIR FOR THE READOUT, PUBLISHED A FEW TIMES A SECOND.
   *
   * The text is an animated prop, and an animated prop that changes every frame
   * is another per-frame update on the very thread being measured. Publishing on
   * a tick keeps the observer out of the experiment, and a number that changes
   * 120 times a second is unreadable anyway.
   */
  const shownWorst = useSharedValue(0);
  const shownDropped = useSharedValue(0);
  const sincePublish = useSharedValue(0);

  useFrameCallback((f) => {
    'worklet';
    const dt = f.timeSincePreviousFrame;
    if (dt === null || dt <= 0) return;

    // ⚠ EACH DRAG IS ITS OWN READING. Resetting on the rising edge means the
    // number on screen describes the gesture you just made, not the session.
    if (moving.value && !wasMoving.value) {
      worst.value = 0;
      dropped.value = 0;
    }
    wasMoving.value = moving.value;

    // ⚠⚠ THE GATE. Outside a drag the display idles down to as low as 24Hz and
    // every frame looks "late". See `moving` in the screen above.
    if (!moving.value) return;

    if (dt > worst.value) worst.value = dt;
    // 25ms is late at 60Hz and very late at 120Hz. Inside a drag the panel runs at
    // its maximum rate, so anything over this is the app, not the screen.
    if (dt > 25) dropped.value += 1;

    sincePublish.value += 1;
    if (sincePublish.value >= 20) {
      sincePublish.value = 0;
      shownWorst.value = worst.value;
      shownDropped.value = dropped.value;
    }
  }, true);

  const readout = useAnimatedProps(() => {
    'worklet';
    return {
      text: `left plain · right nested   worst ${Math.round(shownWorst.value)}ms   dropped ${shownDropped.value}`,
    } as unknown as Record<string, unknown>;
  });

  /**
   * ⭐ THE PLAIN DOT — ONE transform, no nesting. The smooth baseline.
   */
  const dotStyle = useAnimatedStyle(() => {
    'worklet';
    const p = Math.min(Math.max(scrollY.value, 0), 140);
    return { transform: [{ translateY: -p }] };
  });

  /**
   * ⭐⭐ THE NESTED DOT, AND IT IS THE REAL EXPERIMENT.
   *
   * It reproduces the band's STRUCTURE rather than its content: a parent that
   * slides the whole way up, and a child that slides part of the way back down so
   * its NET travel is small. That is exactly what `slide` and `leftMove` do to the
   * corners —
   *
   *     parent:  -p * SLIDE
   *     child:   +p * (SLIDE - WANTED)
   *     net:     -p * WANTED
   *
   * — and the net is a straight line, so in arithmetic it cannot wobble. On screen
   * it can: the two transforms are rounded to device pixels INDEPENDENTLY, and
   * they cross their rounding boundaries at different values of `p`. The child's
   * net position then gains and loses a pixel as you drag.
   *
   * ⚠ IF THIS DOT SHIMMERS AND THE PLAIN ONE DOES NOT, that is the jitter, and it
   * is a composition bug rather than a performance one — no amount of making the
   * band cheaper would have touched it. The fix is to stop counter-animating:
   * give each piece ONE transform that expresses its own net travel.
   *
   * Nothing but geometry is different between the two dots. Same shared value,
   * same worklet kind, same colour, side by side.
   */
  const NESTED_SLIDE = 140;
  const NESTED_WANTED = 36;
  const nestedParent = useAnimatedStyle(() => {
    'worklet';
    const p = Math.min(Math.max(scrollY.value, 0), NESTED_SLIDE) / NESTED_SLIDE;
    return { transform: [{ translateY: -p * NESTED_SLIDE }] };
  });
  const nestedChild = useAnimatedStyle(() => {
    'worklet';
    const p = Math.min(Math.max(scrollY.value, 0), NESTED_SLIDE) / NESTED_SLIDE;
    return { transform: [{ translateY: p * (NESTED_SLIDE - NESTED_WANTED) }] };
  });

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center' }}
    >
      <View style={{ flexDirection: 'row', gap: 48, marginBottom: theme.spacing.sm }}>
        {/* plain: one transform */}
        <Animated.View
          style={[
            { width: 26, height: 26, borderRadius: 13, backgroundColor: theme.colors.primary },
            dotStyle,
          ]}
        />
        {/* nested: parent slides up, child slides back — the band's structure */}
        <Animated.View style={nestedParent}>
          <Animated.View
            style={[
              { width: 26, height: 26, borderRadius: 13, backgroundColor: theme.colors.primary },
              nestedChild,
            ]}
          />
        </Animated.View>
      </View>
      <AnimatedTextInput
        editable={false}
        defaultValue="left = plain · right = nested   ·   dragging: worst —  dropped —"
        animatedProps={readout}
        style={{
          padding: 0,
          marginBottom: theme.spacing.xl,
          textAlign: 'center',
          fontFamily: fontFamilies.bold,
          fontSize: 13,
          color: theme.colors.slate,
          fontVariant: ['tabular-nums'],
        }}
      />
    </View>
  );
}
