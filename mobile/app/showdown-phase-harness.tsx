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
import { Pressable, ScrollView, View } from 'react-native';
import { Stack } from 'expo-router';
import { useSharedValue } from 'react-native-reanimated';

import { Text } from '@/components/ui';
import { ShowdownDuelHeader, type Standing } from '@/components/pool-detail/ShowdownDuelHeader';
import { ShowdownRecapSheet } from '@/components/pool-detail/ShowdownRecapSheet';
import { ShowdownWalkout } from '@/components/pool-detail/ShowdownWalkout';
import { duelPhase, type DuelPhaseInput } from '@/lib/duelPhase';
import type { Bout } from '@/lib/useDuel';
import { useTheme } from '@/theme';

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
  const scrollY = useSharedValue(0);
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
        standings={standings}
        kickoffAt={s.band.kickoffAt}
        liveScore={s.band.liveScore}
        liveNow={s.band.liveNow}
        scrollY={scrollY}
      >
        <View style={{ height: 44 }} />
      </ShowdownDuelHeader>

      {/*
        ⚠ SITS BELOW THE BAND RATHER THAN OVER IT. The band floats and slides on
        `scrollY`; a picker layered on top would be the one thing on screen that
        does not move with it, and would read as part of the design.
      */}
      <ScrollView
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
      </ScrollView>

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

