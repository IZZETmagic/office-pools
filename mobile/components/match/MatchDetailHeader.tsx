import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  type StyleProp,
  Text as RNText,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { MatchStatusBadge } from '@/components/MatchStatusBadge';
import { useAnimatedProps } from 'react-native-reanimated';

import { AnimatedTextBox, Icon } from '@/components/ui';
import { clubOnSurface, fixturePalette } from '@/lib/design/clubColors';
import { getCompetitionBand, getCompetitionGlow, GLOW_HEIGHT } from '@/lib/design/competitionBand';
import { hasScorers, matchScorers, type ScorerLine } from '@/lib/matchScorers';
import { pad2, useMatchClock } from '@/lib/useMatchClock';
import type { TimelineEvent } from '@/lib/useMatchDetail';
import type { ResultsMatch } from '@/lib/useTournamentMatches';
import { fontFamilies, useTheme } from '@/theme';

import {
  awayDisplayName,
  competitionLine,
  formattedShortDate,
  formattedTime,
  homeDisplayName,
  MONO_BOLD,
} from './matchDisplay';

// =============================================================
// The match band — a competition's colour, and a header that gets out of the way
// =============================================================
// Two jobs the old fixed header did not do:
//
// 1. It is the COMPETITION'S colour rather than one near-black for everything.
//    A Premier League game and a World Cup game used to look identical.
// 2. It COLLAPSES as you read down, so the score is still on screen at the
//    bottom of a long tab instead of scrolled away.
//
// ⚠ THE MECHANIC IS `ShowdownDuelHeader`'S, PORTED RATHER THAN REINVENTED, and
// the two warnings that cost that header a rewrite apply here unchanged:
//
//   • NOTHING ANIMATES A LAYOUT PROPERTY. The first Showdown version
//     interpolated `height`, and on this stack (New Architecture + Reanimated 4)
//     a layout prop driven from `useAnimatedStyle` re-lays the subtree out every
//     frame — which is also why it barely moved. Here the whole band SLIDES by
//     `translateY` out from under a pinned chrome row. Because it floats ABOVE
//     the pager rather than sitting in the flow above it, sliding it up uncovers
//     content that was always there: the space is reclaimed without one layout
//     pass, and it runs on the compositor.
//
//   • THE HEIGHTS ARE MEASURED, NOT GUESSED. A constant that has to match what
//     the content needs is a guess, and a short guess folds the header away
//     before anybody scrolls. `matchupH` decides the slide; `crestY` is what the
//     morph aims at.
//
// ⚠ NO `zIndex` ANYWHERE IN HERE. The chrome sits above the band by TREE ORDER
// — it is rendered second. In React Native a sibling with an explicit z-index
// paints above siblings that have none, whatever the tree order, which is how
// the Showdown header ended up above the Banter sheet. Do not add one to "make
// sure".
// =============================================================

/** Height of the fixed chrome row — the back button and the competition line. */
const CHROME_ROW = 34;

/** The crest at rest, and what it shrinks to. */
/**
 * The team's mark, expanded and collapsed.
 *
 * ⚠⚠ IT WAS THE CREST UNTIL 2026-09-20 — 64pt, the biggest piece of the
 * provider's artwork in the app, and the last one (see
 * drafts/2026-09-13_ip_exposure_audit.md §5). What replaces it is not another
 * mark: per drafts/2026-09-14_chosen_design.html §3 the club is carried by the
 * NAME and by a rule in its colour, and the band itself is the competition.
 *
 * ⚠ SO `MARK_H` IS A NAME BOX, NOT A BADGE. 44 is two lines of 19pt at 1.12 —
 * "Manchester United" is the case that needs both, and nothing in the league
 * needs three. It is fixed rather than measured because the morph arithmetic
 * aims at its CENTRE, and a box whose height depends on whether a name wrapped
 * would land the collapse in a different place for Arsenal than for Brighton.
 *
 * ⚠ AND THE COLLAPSED MARK IS THE THREE-LETTER CODE at 13pt — Ryan's choice of
 * the two candidates. The full name does not fit a pinned strip: at 13pt
 * "Manchester United" is about 118pt on one line and the strip has to hold two
 * of them plus the score. The code is what the Results list and the form card
 * already use.
 */
const MARK_H = 44;

/**
 * The code's line box, collapsed.
 *
 * ⚠⚠ THE CODE IS 23pt, MATCHED TO THE SCORE (Ryan, 2026-09-21). The scoreline
 * is 34pt and it scales to 0.68 on the collapse, so it RENDERS at 23.1 — and a
 * 13pt code beside it read as a caption on a scoreline rather than as one of
 * the two clubs playing. Every constant in this block follows that type.
 */
const COLLAPSED_MARK = 28;

/**
 * The club's rule: under its name expanded, beside its code collapsed.
 *
 * ⚠⚠ IT ROTATES ON THE WAY (Ryan, 2026-09-21). Expanded it is the approved
 * design's 34×4 underline; collapsed it is the 3×18 vertical bar the rest of
 * the app uses for a club — the Results row, Pick'em, the team sheet, the
 * scout report. So the same object ends the scroll as the mark every other
 * screen already draws, rather than as a shrunken underline that appears
 * nowhere else.
 *
 * ⚠ THE NUMBERS ARE PRE-ROTATION, which is the only way they make sense. A
 * quarter turn swaps the axes: to finish 22 TALL the 34-wide has to scale by
 * 22/34. Writing the collapsed size as a width and a height would be wrong
 * by 90°.
 */
const RULE_W = 34;
const RULE_H = 4;
const COLLAPSED_RULE_LENGTH = 22;
/**
 * ⚠ THE SAME AS `RULE_H`, so the bar does not thin as it turns — beside 23pt
 * type a 3pt bar is a hairline. The Y scale is therefore exactly 1; the term
 * stays in the transform so the day the two differ again it is already there.
 */
const COLLAPSED_RULE_THICK = 4;

/**
 * The slot the three-letter code sits in.
 *
 * ⚠⚠ FIXED, BECAUSE THE BAR AIMS AT ITS EDGE. Measured at 23pt Nunito Black
 * with 0.8 tracking, the codes run from `LIL` at 38.2 to `WHU` at 57.3 —
 * nineteen points. If the bar's landing offset were computed from the text it
 * would sit further out for West Ham than for Liverpool, and the two sides of
 * one fixture would not mirror.
 *
 * ⚠⚠ AND IT IS A CEILING, NOT A PREFERENCE. This slot is 58 because the TYPE is
 * 23. When the code was 13pt the slot was 34, and raising the font without
 * raising this ellipsised every club to a single letter — "B…" against "A…" on
 * Ryan's screen. The two numbers move together or not at all.
 */
const CODE_W = 58;

/** Air between the code and the bar once it has turned. */
const CODE_BAR_GAP = 5;

/**
 * The column's own gap, between the name box and the rule.
 *
 * ⚠ NAMED BECAUSE THE TRAVEL IS DERIVED FROM IT. The rule has to climb from
 * below the name box to the code's line, and that distance is half the box plus
 * this gap plus half the rule. Leave it inline in the style and the two drift
 * the first time somebody nudges the spacing.
 */
const COLUMN_GAP = 8;

/**
 * The strip of band that survives the collapse, holding the shrunken matchup.
 *
 * ⚠ THE CODE DRIVES IT, NOT THE BAR. Turned sideways the bar is 22 long; the
 * code's line box is 28. So this is 28 plus 8 of air above and below. It was 56
 * when a 34pt crest had to fit.
 */
const COLLAPSED_ROW = 44;

/**
 * How far from the screen's centre a collapsed side settles.
 *
 * ⚠⚠ THE SCORE'S WIDTH SETS IT. "1 - 0" in 23.1pt mono with its gaps is 81.5
 * across, so the scoreline reaches 41 either side of centre; the code's slot
 * reaches 29 back from its column centre. 80 leaves 10pt between them. It was
 * 62 when the code was 13pt — at that spread with a 58pt slot the code would
 * sit ON the score.
 */
const COLLAPSED_SPREAD = 80;

/**
 * The centre column's width and the row's outer padding.
 *
 * ⚠⚠ BOTH ARE USED TWICE — by the LAYOUT that places the sides and by the MORPH
 * ARITHMETIC that works out how far each crest has to travel. Change one
 * without the other and the collapse aims at where the crests used to be,
 * silently, because the numbers stay plausible.
 */
const MIDDLE_COL = 124;
const ROW_PAD = 20;

type Props = {
  match: ResultsMatch;
  /** The active tab's scroll offset, shared from the screen. */
  scrollY: SharedValue<number>;
  /**
   * The match's events, for the scorer lists under the scoreline.
   *
   * ⚠ THE SAME ROWS THE TIMELINE DRAWS. Passed in rather than fetched here so
   * the header and the Facts tab cannot disagree about who scored — which they
   * would the moment either counted goals for itself.
   */
  timeline?: TimelineEvent[];
  /** Reports the band's full expanded height so each page can pad by it. */
  onExpandedHeight?: (h: number) => void;
  /** The tab strip. Rides up with the band and ends level with the chrome. */
  children?: React.ReactNode;
};

export function MatchDetailHeader({
  match,
  scrollY,
  timeline = [],
  onExpandedHeight,
  children,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  /**
   * The matchup's own height, reported by the matchup.
   * ⚠ It is also the slide distance and the scroll range.
   */
  const [matchupH, setMatchupH] = useState(0);
  /**
   * The band's own full height, so the glow canvas can be as tall as the band
   * actually is rather than a constant guess.
   *
   * ⚠ THE BAND IS NOT A FIXED HEIGHT. It carries a scorer line PER GOAL, so a
   * 4-3 is six lines taller than a 0-0 — and the glow used to stop dead at 360,
   * leaving the base gradient to carry on alone as a flat bar under the tabs.
   */
  const [bandH, setBandH] = useState(0);
  /** Where the mark row starts inside the matchup block — what the morph aims at. */
  const [markY, setMarkY] = useState(0);

  const bandStops = getCompetitionBand(match.competitionId);

  /**
   * The colour of each club's rule.
   *
   * ⚠⚠ THROUGH THE FIXTURE RULE, THEN LIFTED FOR THE BAND — both steps matter
   * and they are separate problems. `fixturePalette` stops two clubs in the
   * same colour drawing two identical rules (the away side changes kit);
   * `clubOnSurface` stops a near-black club drawing a rule nobody can see on a
   * dark band — Newcastle's #241F20 measures about 1:1 against the tail of the
   * Premier League sweep.
   *
   * ⚠ MEASURED AGAINST THE DARKEST STOP, which is the worst case rather than
   * the average: the sweep runs bright-to-dark across the header and a rule can
   * sit anywhere along it.
   */
  const markColours = useMemo(() => {
    const surface = bandStops[bandStops.length - 1];
    const palette = fixturePalette(match.homeTeam?.flagUrl, match.awayTeam?.flagUrl, {
      home: theme.colors.primary,
      away: theme.colors.accent,
    });
    return {
      home: clubOnSurface(palette.home, surface, 3),
      away: clubOnSurface(palette.away, surface, 3),
    };
  }, [bandStops, match.homeTeam?.flagUrl, match.awayTeam?.flagUrl, theme.colors.primary, theme.colors.accent]);
  const scorers = useMemo(() => matchScorers(timeline), [timeline]);

  const chromeH = insets.top + theme.spacing.xs + CHROME_ROW;

  /**
   * ⚠ NEVER SHORTER THAN THE FLOOR, and never shorter than the band. `bandH` is
   * 0 until layout has run, so the constant carries the first frame.
   */
  const glowCanvas = Math.max(GLOW_HEIGHT, bandH);

  /** How far the band travels: everything except the strip that stays. */
  const slideBy = Math.max(0, matchupH - COLLAPSED_ROW);

  const slide = useAnimatedStyle(() => {
    if (slideBy === 0) return {};
    const p = interpolate(scrollY.value, [0, slideBy], [0, 1], Extrapolation.CLAMP);
    return { transform: [{ translateY: -p * slideBy }] };
  });

  /**
   * ⚠ `chromeH +` IS LOAD-BEARING. `onLayout` reports a position RELATIVE TO
   * THE PARENT, so `crestY` is measured from the top of the matchup block,
   * while `collapsedCentreY` is measured from the top of the SCREEN.
   * Subtracting the two without this term mixes coordinate spaces and
   * undershoots the travel by the whole chrome row plus the status bar — on a
   * notched phone, nearly 100pt. The band's content starts at `chromeH` (its
   * own paddingTop), so that is the offset between the two spaces.
   */
  const markCentreY = chromeH + markY + MARK_H / 2;
  const collapsedCentreY = chromeH + COLLAPSED_ROW / 2;
  const wantedY = markCentreY - collapsedCentreY;

  /** Centre of a side column at rest, and how far in it has to come. */
  const sideCentreX = ROW_PAD + (width - ROW_PAD * 2 - MIDDLE_COL) / 4;
  const wantedX = width / 2 - COLLAPSED_SPREAD - sideCentreX;

  /**
   * ⚠ EVERY PIECE MOVES TO ITS OWN COLLAPSED POSITION — that is the difference
   * between a morph and a slide. The band travels up by `slideBy` to reclaim
   * the space; each crest then travels back DOWN by the part of that it should
   * not have made, so its NET movement is exactly the distance from where it
   * sits to the collapsed row:
   *
   *     net = -slideBy + (slideBy - wanted) = -wanted
   *
   * Both halves are `translateY`, so this stays compositor-only.
   *
   * ⚠ Two named hooks rather than one factory called twice — a hook inside a
   * helper is a rules-of-hooks violation waiting for somebody to call it
   * conditionally, and only the sign of X differs.
   */
  const leftMove = useAnimatedStyle(() => {
    if (slideBy === 0) return {};
    const p = interpolate(scrollY.value, [0, slideBy], [0, 1], Extrapolation.CLAMP);
    return {
      transform: [{ translateY: p * (slideBy - wantedY) }, { translateX: p * wantedX }],
    };
  });
  const rightMove = useAnimatedStyle(() => {
    if (slideBy === 0) return {};
    const p = interpolate(scrollY.value, [0, slideBy], [0, 1], Extrapolation.CLAMP);
    return {
      transform: [{ translateY: p * (slideBy - wantedY) }, { translateX: -p * wantedX }],
    };
  });

  /**
   * The handover: the full name out, the three-letter code in.
   *
   * ⚠⚠ THE TWO CROSS-FADE IN THE SAME WINDOW THE REST OF THE HEADER ALREADY
   * USES. The kicker, the status badge and "FULL TIME" all finish by `p = 0.45`
   * (see `labelFade`), so the code arriving there costs no new timing and the
   * strip never shows two labels at once.
   *
   * ⚠ THE NAME SCALES AS IT GOES, so it shrinks toward the code rather than
   * dissolving in place — the morph reads as one object changing size, which is
   * what it was when a crest did it.
   */
  const nameOut = useAnimatedStyle(() => {
    if (slideBy === 0) return {};
    const p = interpolate(scrollY.value, [0, slideBy], [0, 1], Extrapolation.CLAMP);
    return {
      opacity: interpolate(p, [0, 0.45], [1, 0], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(p, [0, 0.45], [1, 0.72], Extrapolation.CLAMP) }],
    };
  });
  const codeIn = useAnimatedStyle(() => {
    if (slideBy === 0) return {};
    const p = interpolate(scrollY.value, [0, slideBy], [0, 1], Extrapolation.CLAMP);
    return { opacity: interpolate(p, [0.45, 0.85], [0, 1], Extrapolation.CLAMP) };
  });

  /**
   * The rule closes the gap the name leaves behind.
   *
   * ⚠⚠ WITHOUT THIS IT LANDS 13pt LOW. The rule sits below a FIXED 44pt name
   * box, and the morph aims that box's CENTRE at the collapsed row — so the
   * code arrives centred while the rule is still hanging off the bottom of a
   * box that is now mostly empty. Half the difference between the box and the
   * code is exactly the slack: (44 - 18) / 2.
   */
  /**
   * ⚠⚠ HOW FAR OUT THE BAR LANDS, and it is measured from the code's slot
   * rather than from the column. Half the slot clears the letters, the gap is
   * the air, and half the bar's own turned thickness puts its EDGE against that
   * air rather than its centre.
   */
  const ruleOut = CODE_W / 2 + CODE_BAR_GAP + COLLAPSED_RULE_THICK / 2;

  /**
   * ⚠⚠ TRANSFORM ORDER IS THE WHOLE TRICK HERE, and it reads backwards. React
   * Native composes this list as a matrix product, so the LAST entry is applied
   * FIRST: the bar is scaled down, then turned a quarter, and only then carried
   * out to the side. List the translations after the rotate and they would be
   * measured along the bar's own turned axes — the home bar would travel UP the
   * screen instead of left, which is precisely the bug this comment exists to
   * stop somebody reintroducing by tidying the array.
   *
   * ⚠ AND `close` IS UNCHANGED BY THE ROTATION. It answers a layout question —
   * the bar hangs below a fixed 44pt name box and the code arrives centred in
   * it — so it is half the difference between the two, whichever way the bar is
   * pointing when it gets there.
   *
   * ⚠ TWO NAMED HOOKS, NOT A FACTORY. Same rule the move styles above follow;
   * only the sign of X differs.
   */
  /**
   * How far the rule climbs to reach the code's line.
   *
   * ⚠⚠ IT IS NOT `(MARK_H - COLLAPSED_MARK) / 2`, WHICH IS WHAT I HAD AND WHAT
   * RYAN CAUGHT ON A SCREENSHOT. That number closes the gap between a fixed
   * name box and the smaller code centred inside it — a real distance, but not
   * this one. The rule does not start inside the box; it starts BELOW it. So
   * the climb is from its own resting centre — `MARK_H + COLUMN_GAP + RULE_H/2`
   * under the box's top — up to the code's centre at `MARK_H / 2`. That is 32,
   * not 13, and at 13 the bars sat a clear line below the codes they belong to.
   *
   * ⚠ THE Y-SCALE DOES NOT CHANGE IT. A scale applies about the node's own
   * centre, so the rule thins in place and its centre is wherever this put it.
   */
  const ruleClimb = MARK_H / 2 + COLUMN_GAP + RULE_H / 2;
  const lengthScale = COLLAPSED_RULE_LENGTH / RULE_W;
  const thickScale = COLLAPSED_RULE_THICK / RULE_H;

  // ⚠⚠ WRITTEN OUT TWICE ON PURPOSE, AND NOT FACTORED. These bodies run on the
  // UI thread: a helper called from inside `useAnimatedStyle` has to be a
  // worklet itself, and a plain arrow function captured from the component
  // body is a runtime crash rather than a type error — the kind that survives
  // review because it reads perfectly. The two differ only in the sign of X,
  // which is the same trade `leftMove`/`rightMove` above already made.
  const leftRule = useAnimatedStyle(() => {
    if (slideBy === 0) return {};
    const p = interpolate(scrollY.value, [0, slideBy], [0, 1], Extrapolation.CLAMP);
    return {
      transform: [
        { translateX: -p * ruleOut },
        { translateY: -p * ruleClimb },
        // ⚠⚠ CLOCKWISE, AND THE AWAY BAR GOES THE OTHER WAY (Ryan, 2026-09-21).
        // A rectangle looks identical at +90° and −90°, so this is not about
        // where it lands — it is about the MOTION, and the two directions are
        // not equivalent to watch. Both bars turn INWARD, toward the score:
        // they sweep across the ground they are about to leave rather than out
        // over the empty margin. Tried outward first; it reads as two things
        // flying apart.
        { rotate: `${p * 90}deg` },
        { scaleX: 1 - p * (1 - lengthScale) },
        { scaleY: 1 - p * (1 - thickScale) },
      ],
    };
  });
  const rightRule = useAnimatedStyle(() => {
    if (slideBy === 0) return {};
    const p = interpolate(scrollY.value, [0, slideBy], [0, 1], Extrapolation.CLAMP);
    return {
      transform: [
        { translateX: p * ruleOut },
        { translateY: -p * ruleClimb },
        // ⚠ ANTICLOCKWISE — the mirror of the home bar, and inward for the
        // same reason. See the note there.
        { rotate: `${-p * 90}deg` },
        { scaleX: 1 - p * (1 - lengthScale) },
        { scaleY: 1 - p * (1 - thickScale) },
      ],
    };
  });

  /** The scoreline rides up to sit between the two shrunken crests. */
  const middleStyle = useAnimatedStyle(() => {
    if (slideBy === 0) return {};
    const p = interpolate(scrollY.value, [0, slideBy], [0, 1], Extrapolation.CLAMP);
    return {
      transform: [{ translateY: p * (slideBy - wantedY) }],
    };
  });

  /**
   * ⚠ THE SCORE SHRINKS ON ITS OWN NODE, not with its column — see the note at
   * the call site. 0.68 is what takes 34pt type to the 23 the codes are set at,
   * which is the whole reason the two now match.
   */
  const scoreShrink = useAnimatedStyle(() => {
    if (slideBy === 0) return {};
    const p = interpolate(scrollY.value, [0, slideBy], [0, 1], Extrapolation.CLAMP);
    return { transform: [{ scale: 1 - p * 0.32 }] };
  });

  /**
   * The names and the status badge fade rather than travel.
   *
   * ⚠ THE COMPETITION LINE IS NO LONGER ON THIS. It moved to the chrome row on
   * 2026-09-21, which does not move and does not fade — that is the point of
   * moving it.
   * At the collapsed scale they would be four-point type — shrinking them is
   * not a smaller version of the information, it is an unreadable one.
   */
  const labelFade = useAnimatedStyle(() => {
    if (slideBy === 0) return {};
    const p = interpolate(scrollY.value, [0, slideBy], [0, 1], Extrapolation.CLAMP);
    return { opacity: interpolate(p, [0, 0.45], [1, 0], Extrapolation.CLAMP) };
  });

  /**
   * The scorers go FIRST, and well before anything else.
   *
   * ⚠ THE TEAM NAMES TRAVEL DOWN THROUGH THEM. `leftMove` translates each side
   * column down by `p * (slideBy - wantedY)` to cancel the band's upward slide,
   * so relative to the band's own content the names move DOWN while the
   * scorers ride UP with it — the two converge, and mid-collapse "Arsenal"
   * lands on top of "Havertz 25'". Ryan caught this on a screenshot.
   *
   * ⚠ AND ADDING THE SCORERS IS WHAT MADE IT BITE. They lengthened `matchupH`,
   * which lengthened `slideBy`, which increased exactly that downward travel.
   *
   * So they are gone by `p = 0.15`, roughly a fifth of the way into a fade that
   * `labelFade` only starts to finish at 0.45. The names need something like a
   * third of the travel to reach them, so this clears out with room to spare —
   * and it stays clear as the block grows, because a longer list means a taller
   * band, a longer slide, and a collision that arrives LATER in `p`, not
   * sooner. Going first is also the right order: of everything in the band, the
   * scorers are the footnote.
   */
  const scorerFade = useAnimatedStyle(() => {
    if (slideBy === 0) return {};
    const p = interpolate(scrollY.value, [0, slideBy], [0, 1], Extrapolation.CLAMP);
    return { opacity: interpolate(p, [0, 0.15], [1, 0], Extrapolation.CLAMP) };
  });

  /**
   * The glow stays put while the band slides out from under it.
   *
   * ⚠ WITHOUT THIS THE BLOOMS SEAM THE MOMENT YOU SCROLL. The blobs are
   * seamless across the two layers only while both canvases sit at the same
   * screen origin — but the band is inside a view that translates up by
   * `slideBy`, and it would take its copy of the glow with it. The chrome's
   * copy does not move, so the light would jump at the boundary between them.
   *
   * The glow belongs to the SCREEN, not to the band's content, so the band's
   * copy travels back DOWN by exactly what the band travelled up. Net movement
   * zero, and still compositor-only.
   *
   * ⚠ The base gradient deliberately does NOT get this. It is purely
   * horizontal, so translating it vertically changes nothing visible and would
   * only expose a gap at the bottom of the band as it moved down.
   */
  const glowHold = useAnimatedStyle(() => {
    if (slideBy === 0) return {};
    const p = interpolate(scrollY.value, [0, slideBy], [0, 1], Extrapolation.CLAMP);
    return { transform: [{ translateY: p * slideBy }] };
  });

  return (
    <>
      {/* THE BAND — everything below the chrome, and the part that moves. */}
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0 }, slide]}>
        <View
          onLayout={(e) => {
            const h = Math.round(e.nativeEvent.layout.height);
            if (h > 0) {
              onExpandedHeight?.(h);
              // Guarded: onLayout fires on every re-render, and writing the same
              // number back would loop.
              if (h !== bandH) setBandH(h);
            }
          }}
          style={{ paddingTop: chromeH, overflow: 'hidden' }}
        >
          <BandFill
            stops={bandStops}
            competitionId={match.competitionId}
            idPrefix="band"
            glowHeight={glowCanvas}
            glowStyle={glowHold}
          />

          {/*
            ⚠ NO COMPETITION MARK HERE. A white silhouette of the league's crest
            was drawn as a watermark and it was wrong twice over: at the size
            that made it read as identity it overlapped the away team's name and
            clipped it ("Chels…"), and the identity was already being carried
            better by the band's colour and the competition line. Removed rather
            than shrunk — Ryan, 2026-09-06.
          */}

          <View
            onLayout={(e) => {
              const h = Math.round(e.nativeEvent.layout.height);
              // Guarded: onLayout fires on every re-render, and writing the
              // same number back would loop.
              if (h > 0 && h !== matchupH) setMatchupH(h);
            }}
          >
            {/*
              ⚠ THE GAP ABOVE THE CRESTS IS THIS BLOCK'S paddingBottom, NOT THE
              CREST ROW'S paddingTop, and that is not a style preference.
              `onLayout` reports a position relative to the parent, so the crest
              row's `y` is where its BOX starts — put the 14pt inside that box
              and the crests actually begin 14pt lower than `crestY` says, which
              lands the whole morph 14pt high. Owning the gap up here keeps
              `crestY` the crests' real top, with no second constant that the
              arithmetic has to remember to add.
            */}
            {/*
              ⚠⚠ A SPACER, AND IT HAS TO STAY A SPACER. The competition line
              moved to the chrome row on 2026-09-21, and the block it left
              behind was carrying the gap above the marks as its `paddingBottom`
              — see the note above. Deleting it outright would close that gap;
              moving the 14 into the mark row's `paddingTop` would break the
              morph, because `onLayout` reports the BOX's top and the marks
              would then start 14pt below what `markY` says. So the gap keeps
              its own box.

              ⚠ 20 IS THE OLD BLOCK MINUS ITS TEXT: `paddingTop: 6` plus
              `paddingBottom: 14`. The air either side of the line is exactly
              what it was; only the line itself left.
            */}
            <View style={{ height: 20 }} />

            <View
              onLayout={(e) => {
                const y = Math.round(e.nativeEvent.layout.y);
                if (y !== markY) setMarkY(y);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                paddingHorizontal: ROW_PAD,
              }}
            >
              <Side
                name={homeDisplayName(match)}
                code={sideCode(match.homeTeam, 'Home')}
                colour={markColours.home}
                move={leftMove}
                nameOut={nameOut}
                codeIn={codeIn}
                ruleStyle={leftRule}
              />
              {/*
                ⚠⚠ THE SCORE SITS IN THE SAME 44pt BOX THE CODES DO, and that is
                what makes the collapsed strip line up (Ryan, 2026-09-21: "it
                all needs to horizontally aligned"). Before this the middle
                column was a stack with its own `paddingTop`, and the whole
                stack scaled — so the score's centre was wherever the caption
                underneath happened to put the column's centre, which was not
                where the codes landed. Three identical boxes centred on one
                row cannot disagree.

                ⚠ SO THE SCALE MOVED OFF THE COLUMN AND ONTO THE BOX. A scale
                applies about its own node's centre: scaling the column pivots
                around score-plus-caption, scaling the box pivots around the
                score itself, which is the thing that has to stay on the line.
                Same reasoning the sides already use for the name.
              */}
              <Animated.View
                style={[{ width: MIDDLE_COL, alignItems: 'center', gap: 4 }, middleStyle]}
              >
                <Animated.View
                  style={[
                    { height: MARK_H, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
                    scoreShrink,
                  ]}
                >
                  <CentreFigure match={match} />
                </Animated.View>
                <Animated.View style={labelFade}>
                  <CentreCaption match={match} />
                </Animated.View>
              </Animated.View>
              <Side
                name={awayDisplayName(match)}
                code={sideCode(match.awayTeam, 'Away')}
                colour={markColours.away}
                move={rightMove}
                nameOut={nameOut}
                codeIn={codeIn}
                ruleStyle={rightRule}
              />
            </View>

            <Animated.View style={labelFade}>
              <MatchStatusBadge match={match} style={{ marginTop: 12 }} />
            </Animated.View>

            {/*
              ⚠ INSIDE THE MEASURED BLOCK, WHICH IS WHAT MAKES IT COLLAPSE FOR
              FREE. `matchupH` is this block's own height and is also the slide
              distance and the scroll range, so adding the scorers lengthens the
              travel by exactly their height — the band still ends level with
              the chrome and nothing needed retuning.

              ⚠ ON `scorerFade`, NOT `labelFade`, AND THAT IS NOT A PREFERENCE.
              The side columns translate DOWN through the band as it slides up,
              so the team names cross this row on the way — see `scorerFade`.
              These have to be gone before that happens.
            */}
            {hasScorers(scorers) ? (
              <Animated.View style={scorerFade}>
                <Scorers home={scorers.home} away={scorers.away} />
              </Animated.View>
            ) : null}

            <View style={{ height: 12 }} />
          </View>

          {/* The tab strip. Rides up with the band and ends level with the
              chrome — it never moves relative to what is above it. */}
          {children}
        </View>
      </Animated.View>

      {/*
        THE CHROME — pinned, and drawn OVER the band so the matchup disappears
        behind it rather than through it.

        ⚠ It carries its own copy of the fill, which is seamless ONLY because
        the sweep is purely horizontal: two stacked boxes painting the same
        left-to-right gradient read as one continuous field. A vertical
        component would show the join immediately. See `competitionBand.ts`.
      */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          paddingTop: insets.top + theme.spacing.xs,
          overflow: 'hidden',
        }}
      >
        <BandFill
          stops={bandStops}
          competitionId={match.competitionId}
          idPrefix="chrome"
          glowHeight={glowCanvas}
        />
        {/*
          ⚠ NO MATCH TITLE HERE, STILL. This row carried "Arsenal v Chelsea"
          and it was removed on 2026-09-06 for naming the match a second time
          directly above two team names doing the same job. That reasoning is
          untouched by what follows: the competition is not the match, and it is
          the one fact the band below has never repeated.

          ⚠⚠ THE COMPETITION LINE LIVES HERE NOW (Ryan, 2026-09-21). It used to
          sit inside the band and fade away with everything else on the
          collapse, which meant the pinned strip could tell you Manchester
          United drew with Manchester City but not which competition you were
          looking at. The chrome does not move, so putting it here is what makes
          it survive.

          ⚠ ABSOLUTELY POSITIONED, NOT A FLEX CHILD. Centring it in the row
          would centre it in the space LEFT OVER by the back button, which is
          32pt of asymmetry — it would sit visibly right of the score beneath
          it. Pinned left-to-right and centred in its own full width, it lands
          on the screen's axis, which is the axis everything else in this header
          is built on.

          ⚠ AND IT IS BEHIND THE BUTTON IN THE TREE, so a long competition name
          can never eat the back button's touch target.
        */}
        <View
          style={{
            height: CHROME_ROW,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: theme.spacing.lg,
          }}
        >
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
              // ⚠ CLEARS THE BUTTON AT BOTH ENDS. The back button is 32 inside
              // `spacing.lg`, and the row is mirrored, so the text's own box
              // stops short of it rather than relying on the tree order alone.
              paddingHorizontal: theme.spacing.lg + 32 + theme.spacing.sm,
            }}
          >
            <RNText
              numberOfLines={1}
              style={{
                fontFamily: fontFamilies.bold,
                fontSize: 10.5,
                letterSpacing: 1.3,
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.68)',
                textAlign: 'center',
              }}
            >
              {competitionLine(match)}
            </RNText>
          </View>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={({ pressed }) => ({
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: 'rgba(255,255,255,0.14)',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Icon name="chevron.left" size={15} tint="#FFFFFF" weight="semibold" />
          </Pressable>
        </View>
      </View>
    </>
  );
}

/**
 * The band's colour: a flat horizontal base, then four soft blooms of the same
 * colour at different depths.
 *
 * ⚠ BOTH LAYERS DRAW THIS IDENTICALLY, ANCHORED AT top:0, and that is the only
 * reason there is no seam where the pinned chrome row meets the sliding band.
 * The base gradient is horizontal, so it is constant down the screen and cannot
 * show a join. The blooms are NOT constant down the screen — they are seamless
 * only because both layers paint the same `GLOW_HEIGHT`-tall canvas from the
 * same origin and each clips its own slice with `overflow: 'hidden'`. Give
 * either layer its own geometry, or size the canvas off the box drawing it
 * rather than the screen, and a hard edge appears across the header.
 *
 * ⚠ `idPrefix` IS NOT DECORATION. Two `<Svg>` trees are mounted at once and
 * gradient defs are addressed by id; identical ids across them collide on
 * Android, where one layer then paints with the other's stops. Each instance
 * gets its own namespace.
 */
function BandFill({
  stops,
  competitionId,
  idPrefix,
  glowHeight,
  glowStyle,
}: {
  /** ⚠ FIVE LIGHTNESSES OF ONE BRAND — see `BAND_STOPS`. Never a second hue. */
  stops: readonly [string, string, ...string[]];
  competitionId: number | null;
  idPrefix: string;
  /**
   * ⚠⚠ THE SAME NUMBER IN BOTH INSTANCES, ALWAYS. The two layers are seamless
   * only because they paint an identical canvas from an identical origin. It
   * comes from one piece of state for exactly that reason.
   */
  glowHeight: number;
  /** Counter-translation that keeps the glow screen-fixed on the sliding band. */
  glowStyle?: StyleProp<ViewStyle>;
}) {
  const { width } = useWindowDimensions();
  const blobs = getCompetitionGlow(competitionId, width, glowHeight);

  return (
    <>
      <LinearGradient
        pointerEvents="none"
        colors={stops}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', top: 0, left: 0 }, glowStyle]}
      >
      <Svg pointerEvents="none" width={width} height={glowHeight}>
        <Defs>
          {blobs.map((b, i) => (
            <RadialGradient key={i} id={`${idPrefix}-glow-${i}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={b.color} stopOpacity={b.opacity} />
              {/* A mid stop, because a straight 0→1 falloff has a visible ring
                  where the eye catches the linear ramp. */}
              <Stop offset="0.55" stopColor={b.color} stopOpacity={b.opacity * 0.42} />
              <Stop offset="1" stopColor={b.color} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        {blobs.map((b, i) => (
          <Ellipse
            key={i}
            cx={b.cx}
            cy={b.cy}
            rx={b.rx}
            ry={b.ry}
            fill={`url(#${idPrefix}-glow-${i})`}
          />
        ))}
      </Svg>
      </Animated.View>
    </>
  );
}

/**
 * One team's column: its name, its code, and a rule in its colour.
 *
 * ⚠⚠ NO CREST. It was the last one in the app, at 64pt the biggest, and the
 * approved design does not replace it with another mark — the club is the name
 * plus the rule, and the competition is the band behind them
 * (drafts/2026-09-14_chosen_design.html §3).
 *
 * ⚠ THE NAME AND THE CODE SHARE ONE FIXED BOX, both absolutely centred in it.
 * That is what lets the morph aim at a single point: the box's height cannot
 * change when a name wraps to two lines, so Arsenal and Manchester United
 * collapse to the same place. Whichever is visible is centred on that point.
 */
function Side({
  name,
  code,
  colour,
  move,
  nameOut,
  codeIn,
  ruleStyle,
}: {
  name: string;
  code: string;
  /** Already through the fixture rule and lifted for the band — see `markColours`. */
  colour: string;
  // ⚠ `StyleProp<ViewStyle>`, NOT `ReturnType<typeof useAnimatedStyle>`. The
  // hook returns `DefaultStyle` (ViewStyle & ImageStyle & TextStyle), which
  // Reanimated 4's own `Animated.View` will not accept as a style prop — that
  // mismatch is why `ShowdownDuelHeader` carries five type errors it does not
  // deserve. The intersection IS assignable to ViewStyle, so this satisfies
  // both the call site and the consumer without a cast.
  move: StyleProp<ViewStyle>;
  nameOut: StyleProp<ViewStyle>;
  codeIn: StyleProp<ViewStyle>;
  ruleStyle: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View style={[{ flex: 1, alignItems: 'center', gap: COLUMN_GAP }, move]}>
      <View
        style={{
          height: MARK_H,
          alignSelf: 'stretch',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Animated.View style={[{ position: 'absolute', left: 0, right: 0 }, nameOut]}>
          <RNText
            numberOfLines={2}
            style={{
              fontFamily: fontFamilies.black,
              fontSize: 19,
              lineHeight: 21,
              color: '#FFFFFF',
              textAlign: 'center',
            }}
          >
            {name}
          </RNText>
        </Animated.View>
        <Animated.View style={[{ position: 'absolute', left: 0, right: 0 }, codeIn]}>
          {/* ⚠ A FIXED SLOT, CENTRED — see `CODE_W`. The bar lands relative to
              this edge, so the letters may vary in width but the landing point
              may not. */}
          <RNText
            numberOfLines={1}
            style={{
              width: CODE_W,
              alignSelf: 'center',
              fontFamily: fontFamilies.black,
              // ⚠ THE SCORE'S RENDERED SIZE: 34pt scaled by the middle column's
              // 0.68 on the collapse. The code is NOT inside that column and is
              // never scaled, so it carries the product as its own size.
              fontSize: 23,
              lineHeight: COLLAPSED_MARK,
              letterSpacing: 0.8,
              color: '#FFFFFF',
              textAlign: 'center',
            }}
          >
            {code}
          </RNText>
        </Animated.View>
      </View>

      {/* ⚠ SCALED, NOT RESIZED. A width change would re-lay-out the column on
          every frame of the scroll; `scaleX`/`scaleY` stay on the compositor,
          which is the rule the rest of this header already follows. */}
      <Animated.View
        style={[{ width: RULE_W, height: RULE_H, borderRadius: 2, backgroundColor: colour }, ruleStyle]}
      />
    </Animated.View>
  );
}

/**
 * The three letters a side collapses to.
 *
 * ⚠ THE CLUB'S OWN ABBREVIATION FIRST. Slicing the display name gives "1. " for
 * 1. FC Köln and "AC " for AC Milan, so it is the fallback rather than the rule
 * — the same order the Last Man Standing wall uses.
 */
function sideCode(team: ResultsMatch['homeTeam'], fallback: string): string {
  const abbr = team?.countryCode?.trim();
  if (abbr) return abbr.toUpperCase();
  const name = team?.shortName?.trim() || team?.countryName?.trim() || fallback;
  return name.slice(0, 3).toUpperCase();
}

/**
 * The figure in the middle: the score, or the kickoff time.
 *
 * ⚠⚠ SPLIT FROM ITS CAPTION ON 2026-09-21, AND THE SPLIT IS THE ALIGNMENT.
 * They used to be one component in one stack, which meant the caption's height
 * decided where the column's centre was — and the column was what scaled and
 * translated on the collapse, so the score landed wherever the caption left it
 * rather than on the codes' line. The figure now owns a box the same height as
 * the codes' and scales about its own centre.
 *
 * ⚠ AND THE SPLIT IS ALSO THE RULE FROM YESTERDAY: figures survive the
 * collapse, captions fade. Having them in separate components is what stops
 * that being a thing somebody has to remember.
 */
function CentreFigure({ match }: { match: ResultsMatch }) {
  const theme = useTheme();
  const isLive = match.status === 'live';
  const isFinished = match.status === 'completed';

  if (isLive || isFinished) {
    return (
      <View style={{ alignItems: 'center', gap: 2 }}>
        <ScoreRow home={match.homeScoreFt ?? 0} away={match.awayScoreFt ?? 0} />
        {isFinished && match.homeScorePso !== null && match.awayScorePso !== null ? (
          // ⚠ A FIGURE, NOT A CAPTION — it is a second scoreline, and a match
          // decided on penalties is not described by the one above it.
          <RNText
            style={{ fontFamily: fontFamilies.medium, fontSize: 11, color: theme.colors.accent }}
          >
            ({match.homeScorePso}-{match.awayScorePso} PSO)
          </RNText>
        ) : null}
      </View>
    );
  }

  return (
    <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 26, color: '#FFFFFF' }}>
      {formattedTime(match.matchDate)}
    </RNText>
  );
}

/** The line under the figure: the clock, "Full Time", or the date. */
function CentreCaption({ match }: { match: ResultsMatch }) {
  const isLive = match.status === 'live';
  const isFinished = match.status === 'completed';

  // ⚠ THE LIVE CLOCK IS HERE AND IT IS STILL A FIGURE, which looks like a
  // contradiction and is not. It fades with the captions because the collapsed
  // strip cannot hold it beside a 23pt code and a 23pt score — but it keeps its
  // own ticking component rather than being reduced to a word.
  if (isLive) return <MatchClock match={match} />;

  if (isFinished) {
    return (
      <RNText
        style={{ fontFamily: fontFamilies.medium, fontSize: 10, color: 'rgba(255,255,255,0.68)' }}
      >
        Full Time
      </RNText>
    );
  }

  return (
    <RNText
      style={{ fontFamily: fontFamilies.medium, fontSize: 11, color: 'rgba(255,255,255,0.68)' }}
    >
      {formattedShortDate(match.matchDate)}
    </RNText>
  );
}



// Live clock line — a red dot + a locally-ticking MM:SS estimate. Isolated as
// its own component so the once-a-second tick re-renders only this row, not the
// whole header. Falls back to "LIVE" in the brief window before the first
// minute is known.
/**
 * ⚠⚠ THE SECONDS DO NOT PASS THROUGH REACT, AND THAT IS NOT A MICRO-OPTIMISATION.
 *
 * This ticked once a second in `useState` for the whole ninety minutes. On iOS a
 * React commit pauses Reanimated until it has mounted and the animated values for
 * those frames are never applied, so the match header was stalling every
 * animation on the screen once a second — including the player sheet's open
 * spring and the scroll inside it. See `lib/useCountdown.ts` for the mechanism
 * and `AnimatedTextBox` for why this is a `TextInput`.
 *
 * ⚠ ONLY THE SECONDS ARE ANIMATED. `HT`, `PENS` and the no-minute window do not
 * tick at all, so they stay ordinary text — a `TextInput` for a static word would
 * be the trick applied where it buys nothing and costs accessibility.
 */
function MatchClock({ match }: { match: ResultsMatch }) {
  const theme = useTheme();
  const { seconds, staticLabel, prefix, suffix } = useMatchClock(match);

  const animatedProps = useAnimatedProps(() => {
    'worklet';
    return { text: `${prefix ?? ''}${pad2(seconds.value)}${suffix}` } as unknown as Record<
      string,
      unknown
    >;
  });

  const clockStyle = {
    fontFamily: MONO_BOLD,
    fontSize: 13,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View
        style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.red }}
      />
      {prefix === null ? (
        <RNText style={clockStyle}>{staticLabel ?? 'LIVE'}</RNText>
      ) : (
        /* ⚠ The sizer is `prefix + '00' + suffix`: the seconds are always two
           characters, so the box cannot change width between renders, and when
           the minute or stoppage DOES move it arrives as a prop and re-measures. */
        <AnimatedTextBox
          animatedProps={animatedProps}
          sizerText={`${prefix}00${suffix}`}
          style={clockStyle}
        />
      )}
    </View>
  );
}

function ScoreRow({ home, away }: { home: number; away: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <RNText
        style={{
          fontFamily: MONO_BOLD,
          fontSize: 34,
          color: '#FFFFFF',
          fontVariant: ['tabular-nums'],
        }}
      >
        {home}
      </RNText>
      {/* ⚠ 0.55, NOT 0.4. The separator is 34px — large text, so a 3:1 bar — but
          on the lightened band 0.4 measured 2.36:1 and fell under even that.
          See `competitionBand`: raising the band raised every floor with it. */}
      <RNText style={{ fontFamily: MONO_BOLD, fontSize: 34, color: 'rgba(255,255,255,0.55)' }}>
        -
      </RNText>
      <RNText
        style={{
          fontFamily: MONO_BOLD,
          fontSize: 34,
          color: '#FFFFFF',
          fontVariant: ['tabular-nums'],
        }}
      >
        {away}
      </RNText>
    </View>
  );
}

/**
 * The scorers, either side of a ball.
 *
 * ⚠ HOME RIGHT-ALIGNED AND AWAY LEFT-ALIGNED, so both lists run away from the
 * ball in the middle and each sits under the crest it belongs to. Centring them
 * both would leave the reader working out which column is whose.
 */
function Scorers({ home, away }: { home: ScorerLine[]; away: ScorerLine[] }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'center',
        gap: 10,
        paddingHorizontal: ROW_PAD,
        marginTop: 12,
      }}
    >
      <ScorerColumn lines={home} align="right" />
      {/* The ball sits on the first line's baseline rather than centred on the
          block, so it does not drift down as one side's list grows. */}
      <View style={{ paddingTop: 2 }}>
        <Icon name="sportscourt.fill" size={11} tint="rgba(255,255,255,0.68)" solid />
      </View>
      <ScorerColumn lines={away} align="left" />
    </View>
  );
}

function ScorerColumn({ lines, align }: { lines: ScorerLine[]; align: 'left' | 'right' }) {
  return (
    <View style={{ flex: 1, alignItems: align === 'right' ? 'flex-end' : 'flex-start', gap: 1 }}>
      {lines.map((line) => (
        <RNText
          key={line.name}
          numberOfLines={1}
          style={{
            // ⚠ DELIBERATELY QUIET. These sit directly under the scoreline, and
            // at full weight two columns of names out-shout the 2-1 they are
            // explaining. Light enough to read as a caption, which is what they
            // are — the score is the headline and this is its footnote.
            //
            // ⚠ 0.66 IS THE FLOOR, not a starting point. The band behind is a
            // competition colour and its lightest end is already well short of
            // black; going further turns a caption into a smudge on the pale
            // half of the gradient.
            fontFamily: fontFamilies.regular,
            fontSize: 11.5,
            color: 'rgba(255,255,255,0.68)',
            textAlign: align,
          }}
        >
          {line.name} {line.minutes.join(', ')}
        </RNText>
      ))}
    </View>
  );
}
