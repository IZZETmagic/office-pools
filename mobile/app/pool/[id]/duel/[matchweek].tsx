// =============================================================
// THE DECISION — one settled duel, told properly
// =============================================================
// Where Review goes from the recap sheet, and phase 5's other half: the popup
// is the news, this is the story.
//
// Ryan, 2026-09-06: *"a review page where you can review how it was decided.
// What happened? Was there any banter that went back and forth between the two
// users? Just a summary of what went down and how that changed your leaderboard
// position, both on the actual leaderboard and the duels leaderboard. There can
// be a card around what happened around the opponents' places: just their
// scores, not details of what they predicted."*
//
// The React Native twin of `app/pools/[pool_id]/duel/[matchweek]/DuelDecision.tsx`,
// and it inherits that file's two product rules unchanged.
//
// ## ⚠⚠ THIS HAS TO BE WORTH OPENING WHEN YOU LOST
//
// The mockup is the winner's view. If only wins get a well-made page, half the
// pool learns that Skip is the right button — quietly, and nobody would ever
// report it. That is the SYMMETRY gate failing, and it is the one this design
// can actually fail.
//
// So a loss gets the same structure, the same decisive fixtures, the same
// record. What it does NOT get is consolation. Stating a defeat plainly is
// respect; dressing it up produces the bad feeling the product exists to avoid.
// There is no "unlucky", no "so close", and no softening adverb in this file.
//
// ## ⚠ "WHAT IT MOVED" MUST BE WILLING TO SAY NOTHING MOVED
//
// Win and stay 4th and it says 4th. A block that only ever reports good news is
// not a record, it is a slot machine. `previousRank` comes from the engine's own
// column — the one driving the leaderboard's weekly arrows — so this page and
// that arrow cannot disagree about whether somebody went up.
// =============================================================

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Icon, Text } from '@/components/ui';
import { Scoreline, TeamSheetRows } from '@/components/pool-detail/TeamSheet';
import type { Standing } from '@/components/pool-detail/ShowdownDuelHeader';
import { buildSheet, sheetSummary } from '@/lib/duelSheet';
import { duelResult } from '@/lib/duelPoints';
import { fixturesForWeek } from '@/lib/pickemWeek';
import { toSheetFixtures, useDuel } from '@/lib/useDuel';
import { useDuelBanter } from '@/lib/useDuelBanter';
import { useDuelLive } from '@/lib/useDuelLive';
import { useLeaguePool } from '@/lib/useLeaguePool';
import { usePoolDetail } from '@/lib/usePoolDetail';
import { fontFamilies, useTheme } from '@/theme';

export default function DuelDecisionScreen() {
  const theme = useTheme();
  const { id, matchweek } = useLocalSearchParams<{ id: string; matchweek: string }>();
  const week = Number(matchweek);

  const duel = useDuel(id);
  const league = useLeaguePool(id);
  const detail = usePoolDetail(id);

  const standings = useMemo(() => {
    const m = new Map<string, Standing>();
    for (const e of detail.data?.leagueLeaderboard ?? []) {
      m.set(e.entry_id, {
        userId: e.user_id ?? null,
        rank: e.current_rank ?? null,
        previousRank: e.previous_rank ?? null,
        points: e.total_points ?? 0,
        correct: e.pickem?.correct_count ?? 0,
        lastFive: e.pickem?.last_five ?? [],
      });
    }
    return m;
  }, [detail.data?.leagueLeaderboard]);

  /** The bout being reviewed — found by MATCHWEEK, because the route names one. */
  const bout = useMemo(
    () => duel.bouts.find((b) => b.matchweek === week) ?? null,
    [duel.bouts, week],
  );

  const fixtures = useMemo(
    () => toSheetFixtures(fixturesForWeek(league.data?.season.matches ?? [], week)),
    [league.data, week],
  );

  /**
   * ⚠ POLLING OFF. This week is over — that is the entire premise of the page.
   * `/duel-live` takes the matchweek as a parameter and its own header explains
   * why reading a settled week through it is safe.
   */
  const live = useDuelLive(id, Number.isFinite(week) ? week : null, false);

  const sheetRows = useMemo(() => {
    if (!bout) return [];
    return buildSheet({
      fixtures,
      live: new Map(live.fixtures.map((f) => [f.number, f])),
      mine: live.perFixture.get(bout.you.entryId) ?? new Map(),
      theirs: bout.them ? live.perFixture.get(bout.them.entryId) ?? new Map() : new Map(),
      label: (entryId, fixtureId) => duel.pickLabels.get(entryId)?.get(fixtureId) ?? null,
      youEntry: bout.you.entryId,
      themEntry: bout.them?.entryId ?? null,
    });
  }, [bout, fixtures, live, duel.pickLabels]);

  /** Everybody else's duel that week — scores only, per Ryan. */
  const elsewhere = useMemo(
    () =>
      duel.duels.filter(
        (d) => d.matchweek_number === week && d.duel_id !== bout?.duel.duel_id,
      ),
    [duel.duels, week, bout],
  );

  const banter = useDuelBanter({
    poolId: id,
    userIds: bout
      ? [
          standings.get(bout.you.entryId)?.userId ?? null,
          bout.them ? standings.get(bout.them.entryId)?.userId ?? null : null,
        ]
      : [],
    // The window the duel was actually played in. Settlement closes it; the
    // matchweek's lock opens it.
    from: league.data?.season.matchweeks?.find((m) => m.number === week)?.lock_at ?? null,
    to: bout?.duel.settled_at ?? null,
  });

  if (duel.loading || league.isPending) {
    return (
      <Frame>
        <View style={{ paddingVertical: theme.spacing.xxxl, alignItems: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </Frame>
    );
  }

  if (!bout) {
    return (
      <Frame>
        <Empty
          title="That duel is not here"
          caption="It may not have opened yet, or it belongs to somebody else."
        />
      </Frame>
    );
  }

  const bye = bout.them === null;
  // ⚠ Structural. A bye pays DUEL_BYE which IS DUEL_TIE — reading the points
  // to detect one calls it a draw against an opponent who never existed.
  const result = bye ? null : duelResult(bout.you.points);
  const you = standings.get(bout.you.entryId) ?? null;

  const verdict = bye ? 'Bye week' : result === 'won' ? 'Won' : result === 'lost' ? 'Lost' : 'Drawn';
  const tint =
    result === 'won' ? theme.colors.green : result === 'lost' ? theme.colors.red : theme.colors.slate;

  return (
    <Frame>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
        {/* ---------------------------------------------- the verdict */}
        <Card>
          <Text variant="detail" color="slate" style={{ letterSpacing: 1.4 }}>
            MATCHWEEK {week}
          </Text>
          <Text style={{ fontFamily: fontFamilies.black, fontSize: 28, color: tint }}>
            {verdict}
          </Text>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              marginTop: theme.spacing.sm,
            }}
          >
            <Text variant="cardTitle" numberOfLines={1} style={{ flex: 1 }}>
              {duel.ownName ?? 'You'}
            </Text>
            {bye ? (
              <Text variant="cardTitle" color="slate">
                bye
              </Text>
            ) : (
              <Scoreline
                kind="duel"
                home={bout.you.accuracy ?? 0}
                away={bout.them?.accuracy ?? 0}
                tone={tint}
              />
            )}
            <Text variant="cardTitle" numberOfLines={1} style={{ flex: 1, textAlign: 'right' }}>
              {bout.them?.name ?? 'Nobody'}
            </Text>
          </View>
          {/* ⚠ The award is READ from the duel row, never inferred from the
              verdict. 500/250/0 is the engine's number (121). */}
          <Text variant="detail" color="slate" style={{ marginTop: theme.spacing.sm }}>
            {bout.you.points === null
              ? 'Not yet scored'
              : `${bout.you.points.toLocaleString()} duel points`}
            {bye ? ' — a bye is worth exactly a draw.' : ''}
          </Text>
        </Card>

        {/* ---------------------------------------------- what it moved */}
        <Card>
          <CardTitle>What it moved</CardTitle>
          {/*
            ⚠ IT SAYS "NO CHANGE" AND MEANS IT. See the file header: a block
            that only ever reports good news is not a record.
          */}
          <Moved label="Leaderboard" now={you?.rank ?? null} before={you?.previousRank ?? null} />
          <Moved
            label="Duels"
            now={null}
            before={null}
            override={`${duel.record.won}W ${duel.record.tied}T ${duel.record.lost}L · ${duel.record.points.toLocaleString()} pts`}
          />
        </Card>

        {/* ---------------------------------------------- how it was decided */}
        {!bye && sheetRows.length > 0 ? (
          <Card>
            <CardTitle>How it was decided</CardTitle>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'baseline',
                gap: theme.spacing.sm,
                marginBottom: theme.spacing.xs,
              }}
            >
              <Text variant="caption" numberOfLines={1} style={{ color: theme.colors.primary }}>
                {duel.ownName ?? 'You'}
              </Text>
              <Text
                variant="caption"
                numberOfLines={1}
                style={{ flex: 1, textAlign: 'right', color: theme.colors.red }}
              >
                {bout.them?.name}
              </Text>
            </View>
            <TeamSheetRows rows={sheetRows} />
            {/* Where you agreed could not separate you, whatever it finished.
                Saying how many is what makes the rest mean something. */}
            {sheetSummary(sheetRows) ? (
              <Text variant="detail" color="slate" style={{ marginTop: theme.spacing.sm }}>
                {sheetSummary(sheetRows)}
              </Text>
            ) : null}
          </Card>
        ) : null}

        {/* ---------------------------------------------- the banter */}
        {!bye ? (
          <Card>
            <CardTitle>What was said</CardTitle>
            {banter.loading ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : banter.messages.length === 0 ? (
              /*
                ⚠ SILENCE IS A REAL ANSWER AND IS STATED AS ONE. Roughly 7% of
                members post at all, so an empty week is the common case — an
                empty card with no words in it would read as broken.
              */
              <Text variant="body" color="slate">
                Neither of you said anything in Banter that week.
              </Text>
            ) : (
              <View style={{ gap: theme.spacing.sm }}>
                {banter.messages.map((m) => (
                  <View key={m.messageId} style={{ gap: 2 }}>
                    <Text variant="detail" color="slate">
                      {m.senderName}
                    </Text>
                    <Text variant="body">{m.content}</Text>
                  </View>
                ))}
                <Pressable
                  onPress={() => router.push(`/pool/${id}?banter=open`)}
                  accessibilityRole="button"
                >
                  <Text variant="detail" style={{ color: theme.colors.primary }}>
                    Open Banter
                  </Text>
                </Pressable>
              </View>
            )}
          </Card>
        ) : null}

        {/* ---------------------------------------------- the rest of the room */}
        {elsewhere.length > 0 ? (
          <Card>
            <CardTitle>Elsewhere that week</CardTitle>
            {/*
              ⚠ SCORES ONLY — Ryan: *"just their scores, not details of what they
              predicted."* Somebody else's duel is their business; the result is
              public because the leaderboard is, the sheet is not.
            */}
            {elsewhere.map((d) => (
              <View
                key={d.duel_id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                  paddingVertical: 6,
                }}
              >
                <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                  {duel.names[d.entry_a] ?? 'Unknown'}
                </Text>
                {d.entry_b === null ? (
                  <Text variant="body" color="slate">
                    bye
                  </Text>
                ) : (
                  <Scoreline kind="duel" home={d.accuracy_a ?? 0} away={d.accuracy_b ?? 0} />
                )}
                <Text variant="body" numberOfLines={1} style={{ flex: 1, textAlign: 'right' }}>
                  {d.entry_b ? duel.names[d.entry_b] ?? 'Unknown' : 'Nobody'}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </Frame>
  );
}

// -------------------------------------------------------------- furniture

function Frame({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.snow }} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.sm,
          gap: theme.spacing.sm,
        }}
      >
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={12}>
          <Icon name="chevron.left" color="ink" size={18} weight="semibold" />
        </Pressable>
        <Text variant="cardTitle">The decision</Text>
      </View>
      {children}
    </SafeAreaView>
  );
}

function CardTitle({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <Text
      style={{
        fontFamily: fontFamilies.bold,
        fontSize: 10,
        letterSpacing: 1.6,
        textTransform: 'uppercase',
        color: theme.colors.slate,
        marginBottom: theme.spacing.sm,
      }}
    >
      {children}
    </Text>
  );
}

/**
 * One line of "what it moved".
 *
 * ⚠ UNRANKED SHOWS A DASH, NEVER "0th" — the same rule the band's corner
 * follows. An entry the engine has not scored has no position, and printing one
 * would invent it.
 */
function Moved({
  label,
  now,
  before,
  override,
}: {
  label: string;
  now: number | null;
  before: number | null;
  override?: string;
}) {
  const theme = useTheme();
  const moved = now !== null && before !== null && now !== before;
  const up = moved && (now as number) < (before as number);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 6,
      }}
    >
      <Text variant="body" color="slate">
        {label}
      </Text>
      {override ? (
        <Text variant="body" style={{ fontVariant: ['tabular-nums'] }}>
          {override}
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text variant="body" style={{ fontVariant: ['tabular-nums'] }}>
            {now === null ? '—' : ordinal(now)}
          </Text>
          {moved ? (
            <Text
              variant="detail"
              style={{ color: up ? theme.colors.green : theme.colors.red }}
            >
              {up ? '▲' : '▼'} from {ordinal(before as number)}
            </Text>
          ) : (
            <Text variant="detail" color="slate">
              no change
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

function Empty({ title, caption }: { title: string; caption: string }) {
  const theme = useTheme();
  return (
    <View style={{ padding: theme.spacing.xxxl, alignItems: 'center', gap: theme.spacing.sm }}>
      <Icon name="person.2.fill" color="slate" size={34} />
      <Text variant="cardTitle">{title}</Text>
      <Text variant="body" color="slate" style={{ textAlign: 'center' }}>
        {caption}
      </Text>
    </View>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
