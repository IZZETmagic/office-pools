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
// ⚠ RICHER THAN 'WWDLW' ON PURPOSE. `league_standings.form` is one letter per
// game and we hold it, but the season in memory can say WHO and BY HOW MUCH for
// the same cost. The feed string is the fallback for the case the season cannot
// cover — see `feedForm`.
// =============================================================

export function FormCard({
  homeName,
  awayName,
  homeForm,
  awayForm,
  homeFeedForm,
  awayFeedForm,
  earlier,
  match,
}: {
  homeName: string;
  awayName: string;
  homeForm: FormResult[];
  awayForm: FormResult[];
  /** The feed's letters, used only when the season could produce nothing. */
  homeFeedForm: ('W' | 'D' | 'L')[];
  awayFeedForm: ('W' | 'D' | 'L')[];
  earlier: ResultsMatch | null;
  match: ResultsMatch;
}) {
  const theme = useTheme();

  const nothingToShow =
    homeForm.length === 0 &&
    awayForm.length === 0 &&
    homeFeedForm.length === 0 &&
    awayFeedForm.length === 0 &&
    !earlier;
  // Rendered by the caller only when there is something; this is belt and
  // braces for a season that turns out to hold no played football at all.
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
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 }}>
        <Text variant="cardTitle">Form</Text>
        <Text variant="detail" color="slate">Last five, most recent first</Text>
      </View>

      {/* The earlier-meeting row brings its own padding; without it the last
          form strip would otherwise sit 4px off the card's bottom edge. */}
      <View style={{ paddingBottom: earlier ? 8 : 14 }}>
        <SideForm name={homeName} form={homeForm} feedForm={homeFeedForm} />
        <SideForm name={awayName} form={awayForm} feedForm={awayFeedForm} />
      </View>

      {earlier ? <EarlierMeeting match={match} earlier={earlier} /> : null}
    </View>
  );
}

function SideForm({
  name,
  form,
  feedForm,
}: {
  name: string;
  form: FormResult[];
  feedForm: ('W' | 'D' | 'L')[];
}) {
  const theme = useTheme();

  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
      <RNText
        numberOfLines={1}
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 13,
          color: theme.colors.ink,
          marginBottom: 8,
        }}
      >
        {name}
      </RNText>

      {form.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {form.map((r) => (
            <FormChip key={r.matchId} result={r} />
          ))}
        </View>
      ) : feedForm.length > 0 ? (
        /*
          ⚠ THE FALLBACK IS DELIBERATELY PLAINER, not padded out to look like
          the real thing. The feed gives a letter and nothing else — no
          opponent, no score — and drawing an empty crest box beside it would
          imply we know who they played.
        */
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {feedForm.map((letter, i) => (
            <LetterBox key={i} outcome={letter} />
          ))}
        </View>
      ) : (
        <Text variant="detail" color="slate">No games played yet</Text>
      )}
    </View>
  );
}

/**
 * One previous result: the opponent's crest, the score, and the outcome as the
 * chip's own colour. Tapping opens that match.
 */
function FormChip({ result }: { result: FormResult }) {
  const theme = useTheme();
  const tint = outcomeColor(result.outcome, theme);

  return (
    <Pressable
      onPress={() => router.push(`/match/${result.matchId}`)}
      accessibilityRole="button"
      accessibilityLabel={`${result.outcome === 'W' ? 'Won' : result.outcome === 'L' ? 'Lost' : 'Drew'} ${result.goalsFor}-${result.goalsAgainst} ${result.wasHome ? 'at home to' : 'away to'} ${result.opponent?.shortName ?? result.opponent?.countryName ?? 'unknown'}`}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        gap: 3,
        paddingVertical: 7,
        borderRadius: theme.radii.xs,
        backgroundColor: withOpacity(tint, 0.1),
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Crest team={result.opponent} />
      <RNText
        style={{
          fontFamily: MONO_BOLD,
          fontSize: 11,
          color: tint,
          fontVariant: ['tabular-nums'],
        }}
      >
        {result.goalsFor}-{result.goalsAgainst}
      </RNText>
      {/* Home or away, in one character, because "beat Arsenal" and "beat
          Arsenal at the Emirates" are different facts about a club's form. */}
      <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 8, color: theme.colors.slate }}>
        {result.wasHome ? 'H' : 'A'}
      </RNText>
    </Pressable>
  );
}

function LetterBox({ outcome }: { outcome: 'W' | 'D' | 'L' }) {
  const theme = useTheme();
  const tint = outcomeColor(outcome, theme);
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
    return <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: theme.colors.mist }} />;
  }
  return (
    <Image
      source={{ uri: team.flagUrl }}
      style={{ width: 18, height: 18 }}
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

function outcomeColor(outcome: 'W' | 'D' | 'L', theme: ReturnType<typeof useTheme>): string {
  switch (outcome) {
    case 'W': return theme.colors.green;
    case 'L': return theme.colors.red;
    case 'D': return theme.colors.slate;
  }
}
