import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Pressable, Text as RNText, View } from 'react-native';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { Text } from '@/components/ui';
import type { FormResult } from '@/lib/matchContext';
import type { ResultsMatch, ResultsTeam } from '@/lib/useTournamentMatches';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// Form, and the earlier meeting
// =============================================================
// The card that makes a SCHEDULED fixture worth opening. Before this, a league
// game that had not kicked off showed three lines — stage, date, venue — and
// nothing else: the timeline is empty until there are events, and the
// Predictions tab is a stated boundary.
//
// ⚠ IT COSTS NOTHING TO FETCH. Every result below is already in memory: the
// fixtures route sends the whole season, and `useTournamentMatches` keeps it.
// The derivation lives in `lib/matchContext.ts` so it can be tested; this file
// only draws it.
//
// ## The shape, and why it is both crests
//
// A row is `[crest] [score] [crest]` — the fixture as it was played, left to
// right, with the club whose form this is on the side it actually played.
//
// ⚠ THE SCORE IS IN MATCH ORDER, NOT "OURS FIRST", and that is the whole point
// of drawing both crests. An earlier version showed the opponent's crest and
// `2-1` from this club's point of view, which reads as a home win whichever way
// round it was — so a 1-0 away win and a 1-0 home defeat looked identical apart
// from a colour. Here the crests say who was at home and the numbers stay in
// the order the scoreboard had them.
//
// ⚠ THE COLOUR IS FROM THIS CLUB'S POINT OF VIEW THOUGH. Green, grey and red
// are win, draw and loss for the column's own club, which is why the same
// fixture can be green in one column and red in the other.
// =============================================================

export function FormCard({
  match,
  homeName,
  awayName,
  homeForm,
  awayForm,
  homeFeedForm,
  awayFeedForm,
  earlier,
}: {
  match: ResultsMatch;
  homeName: string;
  awayName: string;
  homeForm: FormResult[];
  awayForm: FormResult[];
  /** The feed's letters, used only when the season could produce nothing. */
  homeFeedForm: ('W' | 'D' | 'L')[];
  awayFeedForm: ('W' | 'D' | 'L')[];
  earlier: ResultsMatch | null;
}) {
  const theme = useTheme();

  const nothingToShow =
    homeForm.length === 0 &&
    awayForm.length === 0 &&
    homeFeedForm.length === 0 &&
    awayFeedForm.length === 0 &&
    !earlier;
  if (nothingToShow) return null;

  return (
    <View
      style={{
        marginHorizontal: 20,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        ...theme.shadows.card,
        overflow: 'hidden',
      }}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
        <Text variant="cardTitle">Team form</Text>
        <Text variant="detail" color="slate">Last five, most recent first</Text>
      </View>

      {/* Two columns, one per club, so a row in each is the same age. */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingBottom: earlier ? 10 : 14 }}>
        <SideForm
          club={match.homeTeam}
          name={homeName}
          form={homeForm}
          feedForm={homeFeedForm}
        />
        <SideForm
          club={match.awayTeam}
          name={awayName}
          form={awayForm}
          feedForm={awayFeedForm}
        />
      </View>

      {earlier ? <EarlierMeeting match={match} earlier={earlier} /> : null}
    </View>
  );
}

function SideForm({
  club,
  name,
  form,
  feedForm,
}: {
  club: ResultsTeam | null;
  name: string;
  form: FormResult[];
  feedForm: ('W' | 'D' | 'L')[];
}) {
  const theme = useTheme();

  return (
    <View style={{ flex: 1, paddingHorizontal: 4, gap: 6 }}>
      <RNText
        numberOfLines={1}
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 12,
          color: theme.colors.ink,
          textAlign: 'center',
          marginBottom: 2,
        }}
      >
        {name}
      </RNText>

      {form.length > 0 ? (
        form.map((r, i) => (
          <FormRow key={r.matchId} club={club} result={r} mostRecent={i === 0} />
        ))
      ) : feedForm.length > 0 ? (
        /*
          ⚠ THE FALLBACK IS DELIBERATELY PLAINER, not padded out to look like
          the real thing. The feed gives a letter and nothing else — no
          opponent, no score — and drawing an empty crest box beside it would
          imply we know who they played.
        */
        <View style={{ flexDirection: 'row', gap: 5, justifyContent: 'center' }}>
          {feedForm.map((letter, i) => (
            <LetterBox key={i} outcome={letter} />
          ))}
        </View>
      ) : (
        <Text variant="detail" color="slate" align="center">No games played yet</Text>
      )}
    </View>
  );
}

/**
 * One result: `[crest] [score] [crest]`, the fixture as it was played.
 *
 * ⚠ THE CLUB GOES ON THE SIDE IT PLAYED. `wasHome` decides which crest is which
 * and which way round the goals read — the derivation in `matchContext` stores
 * them from the club's point of view (`goalsFor`/`goalsAgainst`), so they are
 * put back into match order here rather than being stored twice.
 */
function FormRow({
  club,
  result,
  mostRecent,
}: {
  club: ResultsTeam | null;
  result: FormResult;
  mostRecent: boolean;
}) {
  const theme = useTheme();
  const tint = outcomeColor(result.outcome);

  const left = result.wasHome ? club : result.opponent;
  const right = result.wasHome ? result.opponent : club;
  const leftGoals = result.wasHome ? result.goalsFor : result.goalsAgainst;
  const rightGoals = result.wasHome ? result.goalsAgainst : result.goalsFor;

  return (
    <Pressable
      onPress={() => router.push(`/match/${result.matchId}`)}
      accessibilityRole="button"
      accessibilityLabel={`${result.outcome === 'W' ? 'Won' : result.outcome === 'L' ? 'Lost' : 'Drew'} ${result.goalsFor}-${result.goalsAgainst} ${result.wasHome ? 'at home to' : 'away to'} ${result.opponent?.shortName ?? result.opponent?.countryName ?? 'unknown'}`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Crest team={left} />
      <View style={{ alignItems: 'center' }}>
        <View
          style={{
            minWidth: 48,
            paddingHorizontal: 7,
            paddingVertical: 4,
            borderRadius: theme.radii.xs,
            backgroundColor: tint,
            alignItems: 'center',
          }}
        >
          <RNText
            style={{
              fontFamily: MONO_BOLD,
              fontSize: 12,
              color: '#FFFFFF',
              fontVariant: ['tabular-nums'],
            }}
          >
            {leftGoals}-{rightGoals}
          </RNText>
        </View>
        {/*
          ⚠ MARKS THE MOST RECENT, and it is the only thing on the row that is
          not a fact about the match. The card says "most recent first" in
          words; this is the same claim where the eye lands.
        */}
        {mostRecent ? (
          <View
            style={{
              height: 2,
              width: 22,
              borderRadius: 1,
              marginTop: 3,
              backgroundColor: tint,
            }}
          />
        ) : null}
      </View>
      <Crest team={right} />
    </Pressable>
  );
}

function LetterBox({ outcome }: { outcome: 'W' | 'D' | 'L' }) {
  const theme = useTheme();
  const tint = outcomeColor(outcome);
  return (
    <View
      style={{
        width: 20,
        height: 20,
        borderRadius: 3,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: withOpacity(tint, 0.12),
      }}
    >
      <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 10, color: tint }}>
        {outcome}
      </RNText>
    </View>
  );
}

/**
 * ⚠ A CLUB CREST IS NOT A FLAG. `flag_url` carries the crest for a league
 * fixture — the fixtures route maps `crest_url` into it positionally — and a
 * crest is not 3:2, so it needs a square box and `contain`. Boxing it 22×15
 * like a national flag crops it, which is a bug this app has already had once.
 */
function Crest({ team }: { team: ResultsTeam | null }) {
  const theme = useTheme();
  if (!team?.flagUrl) {
    return <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.mist }} />;
  }
  return (
    <Image
      source={{ uri: team.flagUrl }}
      style={{ width: 20, height: 20 }}
      contentFit="contain"
      cachePolicy="memory-disk"
    />
  );
}

/**
 * The reverse fixture.
 *
 * ⚠ "EARLIER THIS SEASON", NOT "HEAD TO HEAD", AND THE WORDING IS THE POINT.
 * The payload holds one season, so this is the only previous meeting we can
 * see. A card headed "Head to head" showing a single game states that these two
 * have met once — which for two clubs who have played each other for a century
 * is simply false. Real history needs `/fixtures/headtohead` and somewhere to
 * keep it.
 */
function EarlierMeeting({ match, earlier }: { match: ResultsMatch; earlier: ResultsMatch }) {
  const theme = useTheme();

  // Printed from THIS match's point of view, so the two clubs stay in the
  // order the header shows them in — the reverse fixture has them swapped.
  const flipped = earlier.homeTeamId === match.awayTeamId;
  const homeGoals = flipped ? earlier.awayScoreFt : earlier.homeScoreFt;
  const awayGoals = flipped ? earlier.homeScoreFt : earlier.awayScoreFt;

  const when = new Date(earlier.matchDate);
  const date = Number.isNaN(when.getTime())
    ? null
    : when.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

  return (
    <>
      <View
        style={{ height: 0.5, marginHorizontal: 14, backgroundColor: withOpacity(theme.colors.mist, 0.5) }}
      />
      <Pressable
        onPress={() => router.push(`/match/${earlier.matchId}`)}
        accessibilityRole="button"
        accessibilityLabel={`Earlier this season, ${homeGoals}-${awayGoals}. Open that match.`}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 13,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <View style={{ flexShrink: 1 }}>
          <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 13, color: theme.colors.ink }}>
            Earlier this season
          </RNText>
          {date ? <Text variant="detail" color="slate">{earlier.roundNumber !== null ? `Matchweek ${earlier.roundNumber} · ${date}` : date}</Text> : null}
        </View>
        <RNText
          style={{
            fontFamily: MONO_BOLD,
            fontSize: 15,
            color: theme.colors.ink,
            fontVariant: ['tabular-nums'],
          }}
        >
          {homeGoals}–{awayGoals}
        </RNText>
      </Pressable>
    </>
  );
}

/**
 * The chip colours — ⚠ DELIBERATELY NOT `theme.colors.green` / `.red`.
 *
 * Those tokens are tuned to be read AS TEXT, or as an accent on a light
 * surface. Used as a solid chip behind white text they fail badly: measured
 * against white, `green` #22C55E is 2.28:1 and `red` #EF4444 is 3.76:1, where
 * 4.5:1 is the floor for text this size. `slate` is 3.58:1 and `silver` 1.40:1.
 *
 * These are the same hues a step or two darker, chosen to clear that floor with
 * white on top — 5.02:1, 4.76:1 and 4.83:1 — and they sit closer to the
 * reference this card was drawn from than the tokens do.
 *
 * ⚠ FIXED IN BOTH THEMES, ON PURPOSE. A chip carries its own background, so it
 * has no need to react to the surface behind it — and the dark-mode tokens run
 * LIGHTER (`green` becomes #34D972), which would make white text worse rather
 * than better.
 */
const CHIP_COLOR: Record<'W' | 'D' | 'L', string> = {
  W: '#15803D',
  D: '#64748B',
  L: '#DC2626',
};

function outcomeColor(outcome: 'W' | 'D' | 'L'): string {
  return CHIP_COLOR[outcome];
}
