import { Image } from 'expo-image';
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
import { Icon } from '@/components/ui';
import { getCompetitionBand, getCompetitionGlow, GLOW_HEIGHT } from '@/lib/design/competitionBand';
import { hasScorers, matchScorers, type ScorerLine } from '@/lib/matchScorers';
import { useMatchClock } from '@/lib/useMatchClock';
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

/** Height of the fixed chrome row — back button and title. */
const CHROME_ROW = 34;

/** The crest at rest, and what it shrinks to. */
const CREST = 64;
const COLLAPSED_CREST = 34;

/**
 * The strip of band that survives the collapse, holding the shrunken matchup.
 *
 * ⚠ IT IS THE CREST PLUS ITS AIR: 34 + 11 above + 11 below. The crests land in
 * a row of their own rather than sharing the chrome row, so the title above
 * them never moves — the same call Ryan made on the Showdown band.
 */
const COLLAPSED_ROW = 56;

/** How far from the screen's centre a collapsed crest settles. */
const COLLAPSED_SPREAD = 62;

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
  /** Where the crest row starts inside the matchup block — what the morph aims at. */
  const [crestY, setCrestY] = useState(0);

  const [bandLeft, bandRight] = getCompetitionBand(match.competitionId);
  const scorers = useMemo(() => matchScorers(timeline), [timeline]);

  const chromeH = insets.top + theme.spacing.xs + CHROME_ROW;

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
  const crestCentreY = chromeH + crestY + CREST / 2;
  const collapsedCentreY = chromeH + COLLAPSED_ROW / 2;
  const wantedY = crestCentreY - collapsedCentreY;
  const crestScale = COLLAPSED_CREST / CREST;

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
   * The shrink, on the crest box ALONE.
   *
   * ⚠ TRANSLATE AND SCALE ARE ON DIFFERENT NODES, on purpose. The column
   * translates — crest and name together — so the name follows the crest out.
   * The crest alone scales, because a scale applies about its own node's
   * centre: shrinking the whole column would pivot around the centre of
   * crest-plus-name, which is below the crest, and the landing position
   * `wantedY` aims at would no longer be where it arrives.
   */
  const crestShrink = useAnimatedStyle(() => {
    if (slideBy === 0) return {};
    const p = interpolate(scrollY.value, [0, slideBy], [0, 1], Extrapolation.CLAMP);
    return { transform: [{ scale: 1 - p * (1 - crestScale) }] };
  });

  /** The scoreline rides up to sit between the two shrunken crests. */
  const middleStyle = useAnimatedStyle(() => {
    if (slideBy === 0) return {};
    const p = interpolate(scrollY.value, [0, slideBy], [0, 1], Extrapolation.CLAMP);
    return {
      transform: [{ translateY: p * (slideBy - wantedY) }, { scale: 1 - p * 0.32 }],
    };
  });

  /**
   * Names, the competition line and the status badge fade rather than travel.
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
            if (h > 0) onExpandedHeight?.(h);
          }}
          style={{ paddingTop: chromeH, overflow: 'hidden' }}
        >
          <BandFill
            left={bandLeft}
            right={bandRight}
            competitionId={match.competitionId}
            idPrefix="band"
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
            <Animated.View
              style={[{ paddingHorizontal: ROW_PAD, paddingTop: 6, paddingBottom: 14 }, labelFade]}
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
            </Animated.View>

            <View
              onLayout={(e) => {
                const y = Math.round(e.nativeEvent.layout.y);
                if (y !== crestY) setCrestY(y);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                paddingHorizontal: ROW_PAD,
              }}
            >
              <Side
                url={match.homeTeam?.flagUrl}
                name={homeDisplayName(match)}
                move={leftMove}
                shrink={crestShrink}
                fade={labelFade}
              />
              <Animated.View
                style={[
                  { width: MIDDLE_COL, alignItems: 'center', gap: 4, paddingTop: 6 },
                  middleStyle,
                ]}
              >
                <Centre match={match} />
              </Animated.View>
              <Side
                url={match.awayTeam?.flagUrl}
                name={awayDisplayName(match)}
                move={rightMove}
                shrink={crestShrink}
                fade={labelFade}
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
          left={bandLeft}
          right={bandRight}
          competitionId={match.competitionId}
          idPrefix="chrome"
        />
        {/*
          ⚠ THE BACK BUTTON, AND NOTHING ELSE. This row carried "Arsenal v
          Chelsea" as a title, which named the match a second time directly
          above two crests and two team names doing the same job — Ryan,
          2026-09-06. The crests survive the collapse at reduced size, so the
          matchup is still identified once the band is folded away and the title
          is not standing in for anything.
        */}
        <View
          style={{
            height: CHROME_ROW,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: theme.spacing.lg,
          }}
        >
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
  left,
  right,
  competitionId,
  idPrefix,
  glowStyle,
}: {
  left: string;
  right: string;
  competitionId: number | null;
  idPrefix: string;
  /** Counter-translation that keeps the glow screen-fixed on the sliding band. */
  glowStyle?: StyleProp<ViewStyle>;
}) {
  const { width } = useWindowDimensions();
  const blobs = getCompetitionGlow(competitionId, width);

  return (
    <>
      <LinearGradient
        pointerEvents="none"
        colors={[left, right]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', top: 0, left: 0 }, glowStyle]}
      >
      <Svg
        pointerEvents="none"
        width={width}
        height={GLOW_HEIGHT}
      >
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

/** One team's column: the crest, which survives the collapse, and the name, which does not. */
function Side({
  url,
  name,
  move,
  shrink,
  fade,
}: {
  url: string | null | undefined;
  name: string;
  // ⚠ `StyleProp<ViewStyle>`, NOT `ReturnType<typeof useAnimatedStyle>`. The
  // hook returns `DefaultStyle` (ViewStyle & ImageStyle & TextStyle), which
  // Reanimated 4's own `Animated.View` will not accept as a style prop — that
  // mismatch is why `ShowdownDuelHeader` carries five type errors it does not
  // deserve. The intersection IS assignable to ViewStyle, so this satisfies
  // both the call site and the consumer without a cast.
  move: StyleProp<ViewStyle>;
  shrink: StyleProp<ViewStyle>;
  fade: StyleProp<ViewStyle>;
}) {
  return (
    <Animated.View style={[{ flex: 1, alignItems: 'center', gap: 8 }, move]}>
      <Animated.View style={shrink}>
        <TeamMark url={url} />
      </Animated.View>
      <Animated.View style={fade}>
        <RNText
          numberOfLines={2}
          style={{
            fontFamily: fontFamilies.semibold,
            fontSize: 16,
            color: '#FFFFFF',
            textAlign: 'center',
          }}
        >
          {name}
        </RNText>
      </Animated.View>
    </Animated.View>
  );
}

/** Score, clock or kickoff time — whichever the match's state calls for. */
function Centre({ match }: { match: ResultsMatch }) {
  const theme = useTheme();
  const isLive = match.status === 'live';
  const isFinished = match.status === 'completed';

  if (isLive) {
    return (
      <>
        <ScoreRow home={match.homeScoreFt ?? 0} away={match.awayScoreFt ?? 0} />
        <MatchClock match={match} />
      </>
    );
  }
  if (isFinished) {
    return (
      <>
        <ScoreRow home={match.homeScoreFt ?? 0} away={match.awayScoreFt ?? 0} />
        {match.homeScorePso !== null && match.awayScorePso !== null ? (
          <RNText
            style={{ fontFamily: fontFamilies.medium, fontSize: 11, color: theme.colors.accent }}
          >
            ({match.homeScorePso}-{match.awayScorePso} PSO)
          </RNText>
        ) : null}
        <RNText
          style={{
            fontFamily: fontFamilies.medium,
            fontSize: 10,
            color: 'rgba(255,255,255,0.68)',
          }}
        >
          Full Time
        </RNText>
      </>
    );
  }
  return (
    <>
      <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 26, color: '#FFFFFF' }}>
        {formattedTime(match.matchDate)}
      </RNText>
      <RNText
        style={{ fontFamily: fontFamilies.medium, fontSize: 11, color: 'rgba(255,255,255,0.68)' }}
      >
        {formattedShortDate(match.matchDate)}
      </RNText>
    </>
  );
}

/**
 * The header's team mark — a flag or a club crest, both from `flagUrl`.
 *
 * ⚠ Square box + `contain`, for the reason written out in full on
 * `components/results/MatchResultRow.tsx`'s `TeamMark`: a league fixture puts a
 * crest that is not 3:2 through a field named after a flag, and a `cover` fit
 * cropped it. At 64 this is the biggest mark in the app, so it was also the
 * most obviously beheaded one.
 */
function TeamMark({ url, size = CREST }: { url: string | null | undefined; size?: number }) {
  const theme = useTheme();
  if (!url) {
    return (
      <View
        style={{ width: size, height: size, borderRadius: 4, backgroundColor: theme.colors.mist }}
      />
    );
  }
  return (
    <Image
      source={{ uri: url }}
      style={{ width: size, height: size }}
      contentFit="contain"
      cachePolicy="memory-disk"
    />
  );
}

// Live clock line — a red dot + a locally-ticking MM:SS estimate. Isolated as
// its own component so the once-a-second tick re-renders only this row, not the
// whole header. Falls back to "LIVE" in the brief window before the first
// minute is known.
function MatchClock({ match }: { match: ResultsMatch }) {
  const theme = useTheme();
  const clock = useMatchClock(match);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View
        style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.red }}
      />
      <RNText
        style={{ fontFamily: MONO_BOLD, fontSize: 13, color: '#FFFFFF', letterSpacing: 0.5 }}
      >
        {clock ?? 'LIVE'}
      </RNText>
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
