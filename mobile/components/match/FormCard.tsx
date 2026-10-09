import { router } from 'expo-router';
import { Pressable, Text as RNText, View } from 'react-native';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { clubColorFromCrestUrl, fixturePalette } from '@/lib/design/clubColors';
import { ClubBar, Text } from '@/components/ui';
import type { FormResult } from '@/lib/matchContext';
import type { ResultsMatch, ResultsTeam } from '@/lib/useTournamentMatches';
import { hapticCardTap } from '@/lib/haptics';
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
// A row is `CODE [bar] [score] [bar] CODE` — the fixture as it was played, left to
// right, with the club whose form this is on the side it actually played.
//
// ⚠ THE SCORE IS IN MATCH ORDER, NOT "OURS FIRST", and that is the whole point
// of drawing both marks. An earlier version showed the opponent's crest and
// `2-1` from this club's point of view, which reads as a home win whichever way
// round it was — so a 1-0 away win and a 1-0 home defeat looked identical apart
// from a colour. Here the bars say who was at home and the numbers stay in
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
 * One result: `CODE [bar] [score] [bar] CODE`, the fixture as it was played.
 *
 * ⚠ THE CLUB GOES ON THE SIDE IT PLAYED. `wasHome` decides which bar is which
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
  const colors = rowColors(left, right, {
    home: theme.colors.primary,
    away: theme.colors.accent,
  });

  return (
    <Pressable
      onPress={() => {
        hapticCardTap();
        router.push(`/match/${result.matchId}`);
      }}
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
      <ClubCode team={left} align="right" />
      <Crest team={left} colour={colors?.home} />
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
      <Crest team={right} colour={colors?.away} />
      <ClubCode team={right} align="left" />
    </Pressable>
  );
}

/**
 * The club's three letters, outboard of its colour bar.
 *
 * ⚠ ADDED WHEN THE CREST WENT (Ryan, 2026-09-19). A badge told you who played
 * without being read; a colour bar does not, and this row is the one place in
 * the card where the opponent CHANGES line to line. Without the code the row
 * said "someone, 2-1, someone".
 *
 * ⚠ CODES OUTBOARD, BARS INBOARD — `CODE bar [score] bar CODE`. The bar sits
 * against the number it belongs to, which is the arrangement the score row on
 * the Pick'em screen already uses, so which goals are whose needs no working
 * out.
 *
 * ⚠ SLATE, NOT INK. The score is what the row is for and it must stay the
 * loudest thing on it; the codes are the context that makes it legible.
 *
 * ⚠ 12pt, AND THE SCORE'S 12 IS THE CEILING (Ryan, 2026-09-19 — 10 was too
 * small to read at arm's length). It is deliberately not larger: a code set
 * above the scoreline would invert the hierarchy the paragraph above describes.
 * If these need to grow again, the score has to grow with them.
 *
 * ⚠⚠ FIXED WIDTH, AND THAT IS WHAT KEEPS THE COLUMN STRAIGHT (Ryan,
 * 2026-09-20: "the last matches indicators are not aligned on each side"). The
 * row is centred and everything in it was intrinsically sized, so a row's
 * contents were only as wide as its own two codes — and Nunito is proportional,
 * so those differ by a lot: measured at 12pt bold, `LIL` is 17.8 and `WHU` is
 * 32.4. Bournemouth's four rows carried MCI, NEW and BOU twice, which recentred
 * the score pill on every line and made the bars wander. Pinning the code slot
 * makes every row the same width by construction.
 *
 * ⚠ AND THE TEXT ALIGNS INWARD, toward the score. Left-hand codes are
 * right-aligned and right-hand codes left-aligned, so the gap between a code
 * and its bar is constant while the slack falls on the OUTSIDE of the row where
 * nothing lines up against it.
 *
 * Measured over all 96 clubs we carry plus the English three-letter codes:
 * widest is `WHU` at 32.4pt. 33 covers it, and the row comes to 146pt of the
 * ~170 each card gets when two sit side by side — the same worst case it always
 * had, now paid on every row instead of only the wide ones.
 */
const CODE_W = 33;

function ClubCode({ team, align }: { team: ResultsTeam | null; align: 'left' | 'right' }) {
  const theme = useTheme();
  const code = team?.countryCode?.trim() || team?.shortName?.slice(0, 3).toUpperCase() || null;

  // ⚠ THE SLOT SURVIVES A CLUB WE HAVE NO CODE FOR. Returning null would pull
  // that one row 33pt narrower than the three above it — the very bug this
  // width exists to fix.
  if (!code) return <View style={{ width: CODE_W }} />;

  return (
    <RNText
      numberOfLines={1}
      style={{
        width: CODE_W,
        textAlign: align,
        fontFamily: fontFamilies.bold,
        fontSize: 12,
        letterSpacing: 0.3,
        color: theme.colors.slate,
      }}
    >
      {code}
    </RNText>
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
function Crest({ team, colour }: { team: ResultsTeam | null; colour?: string }) {
  const theme = useTheme();
  // ⚠ THE SLOT SURVIVES A MISSING CLUB, unlike the dossier's mark. This row is
  // `[mark] [score] [mark]` and the score has to stay centred down the list, so
  // an unknown club keeps its width rather than sliding the numbers sideways.
  if (!team?.flagUrl) {
    return <View style={{ width: 6, height: 20, borderRadius: 999, backgroundColor: theme.colors.mist }} />;
  }
  return <ClubBar url={team.flagUrl} colour={colour} height={20} />;
}

/**
 * What the two clubs on ONE ROW wear.
 *
 * ⚠⚠ PER ROW, NOT PER CARD, AND THAT IS THE DIFFERENCE FROM EVERY OTHER SURFACE
 * (Ryan, 2026-09-20). The results list, the scout report and the line-ups all
 * colour ONE fixture. This card is five past fixtures stacked up, each against a
 * different opponent, so the away side that changes kit changes with the row.
 * Bournemouth's own five open with BOU v BRE — two reds — and Liverpool's with
 * LIV v NOT, another two.
 *
 * ⚠ AND THE CLUB THE CARD IS ABOUT IS NOT ALWAYS THE HOME SIDE. `wasHome`
 * already decides which end of the row it sits at; whoever is on the right is
 * the away team that week, and that is who changes. On a week Bournemouth
 * travelled, Bournemouth are the ones in the change kit — which is exactly what
 * happened, so it is right.
 *
 * ⚠ BOTH CLUBS KNOWN OR NEITHER IS COLOURED — the same gate the other surfaces
 * use, so an opponent from outside the five leagues cannot take the subject
 * club's own colour away with it.
 */
function rowColors(
  left: ResultsTeam | null,
  right: ResultsTeam | null,
  fallback: { home: string; away: string },
): { home: string; away: string } | null {
  const leftUrl = left?.flagUrl;
  const rightUrl = right?.flagUrl;
  if (!clubColorFromCrestUrl(leftUrl) || !clubColorFromCrestUrl(rightUrl)) return null;
  const palette = fixturePalette(leftUrl, rightUrl, fallback);
  return palette.usingClubColors ? { home: palette.home, away: palette.away } : null;
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
        onPress={() => {
          hapticCardTap();
          router.push(`/match/${earlier.matchId}`);
        }}
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
