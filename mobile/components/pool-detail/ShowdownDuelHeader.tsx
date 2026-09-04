import { router } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Share, useWindowDimensions, View, type TextStyle } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  type SharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text } from '@/components/ui';
import { getInitials, gradientForUser } from '@/lib/avatarGradient';
import { formatHms, useCountdown } from '@/lib/useCountdown';
import { duelResult } from '@/lib/duelPoints';
import type { Bout } from '@/lib/useDuel';
import { fontFamilies, resolveColors, useTheme, withOpacity } from '@/theme';

// =============================================================
// THE MATCHUP IS THE HEADER
// =============================================================
// Ryan, 2026-09-03, laying out the rows himself:
//
//     <              [pool name]        [share]
//                   Matchweek [x]
//     [avatar]           v            [avatar]
//     [username]                     [username]
//     [position]·[PTS]           [position]·[PTS]
//     [tab] [tab] [tab] [tab] [tab] [tab] [tab]
//
// A centred fight card: the two of you on the outside, the `v` holding the
// middle, and the tab strip riding INSIDE the same component.
//
// ## ⚠ WHY THE COLLAPSE IS DRIVEN BY A MEASURED HEIGHT
//
// The first version interpolated from a hard-coded `CORNERS_HEIGHT`, and it
// rendered permanently collapsed — a constant that has to match what the
// content actually needs is a guess, and when the guess is short the block is
// clipped to nothing before anybody scrolls. So the block reports its own
// natural height through `onLayout` and the animation runs from THAT.
//
// The important half is the fallback: until it has been measured the animated
// style returns `{}`, so the header renders at natural height. It is expanded by
// construction, and no arithmetic can start it folded.
//
// ## ⚠ THE TABS ARE A CHILD, NOT A SIBLING
//
// A strip sitting below a shrinking header slides up under the thumb mid-tap —
// on a 375pt screen that is the difference between opening Duel and opening
// Picks. Only the block ABOVE the strip changes height.
//
// ## ⚠ YOUR CORNER NEVER SWAPS SIDES
//
// You are always left and always `primary`; they are always right and `red`.
// Laying the corners out by `entry_a` / `entry_b` — the circle method's own
// sides — would put you on the left some weeks and the right others, and make
// your own record unreadable at a glance.
// =============================================================

/**
 * The corner avatar. Big on purpose — it is the subject of the screen, and
 * everything under it (name 15, standing 12) is sized to stay subordinate.
 */
const AVATAR = 80;


/**
 * ⚠ THE BAND IS ALWAYS DARK, IN BOTH APP THEMES.
 *
 * Ryan, 2026-09-03: *"this header section must remain darkmode ... when I switch
 * to light mode the shadows/glows look so washed like they are not even there
 * and does not look good at all. Also having this permanent dark mode means it
 * will always be attention grabbing."*
 *
 * The whole band is lit — two coloured throws from the edges, a ring on each
 * avatar in the member's own colour. All of that is additive light, and additive
 * light needs somewhere dark to land. On a `#F7F8FC` surface the same values
 * read as smudges.
 *
 * So this is a deliberate island rather than a theme bug: the band resolves the
 * DARK palette whatever the device is set to, and the page below it stays in the
 * user's chosen theme. Anything inside the band must take its colours from here
 * — `useTheme()` inside a child will hand back light values and put light text
 * on a dark ground.
 */
const BAND = resolveColors('dark');

/** What `useAnimatedStyle` hands back — passed down so each piece animates itself. */
type AnimatedStyle = ReturnType<typeof useAnimatedStyle>;

/** Height of the fixed chrome row — back, pool name, share. */
const CHROME_ROW = 34;

/**
 * What an avatar shrinks to once the band is fully collapsed.
 *
 * ⚠ Kept generous on purpose — the members ARE the event, and a duel that
 * collapses into two dots beside a number stops being about two people.
 *
 * ⚠ IT IS UP AGAINST BOTH OF ITS NEIGHBOURS. `COLLAPSED_ROW` owns the height
 * either side of it; `COLLAPSED_SPREAD` owns the width. Growing this without
 * one of them is how the avatars ended up under the score.
 */
const COLLAPSED_AVATAR = 40;
/**
 * Width of the middle column, and the row's outer padding.
 *
 * ⚠⚠ BOTH ARE USED TWICE: by the LAYOUT that places the corners and by the
 * MORPH ARITHMETIC that works out how far each avatar has to travel. They were
 * literals in three places and a `theme.spacing` lookup in two, which means a
 * nudge to the layout would have left the collapse aiming at where the avatars
 * used to be — silently, since the numbers stay plausible. Same class of bug as
 * mixing parent-space and screen-space, and the same cost.
 *
 * Wider middle and tighter padding both push the corners OUTWARD, which is what
 * Ryan asked for: "move the avatars a bit closer to the edges".
 */
const MIDDLE_COL = 160;

/**
 * Air either side of the dash in a scoreline.
 *
 * ⚠ PADDING ON THE DASH, NOT SPACES IN THE STRING. A space is a glyph and it
 * belongs to whichever side of the dash it was typed next to, so a centred
 * string with spaces still moves the dash when the two numbers have different
 * digit counts. This is the gap as LAYOUT, which is the only version of it the
 * dash's own position does not depend on.
 */
const SCORE_GAP = 8;
const ROW_PAD = 8;

/**
 * How far from the screen's centre a collapsed avatar settles.
 *
 * ⚠ IT IS SIZED BY THE SCORE, NOT BY TASTE — Ryan, 2026-09-04: at 58 the
 * scoreline ran underneath the avatars once it went from 22pt to 32.
 *
 * ⚠⚠ AND THE BINDING CONSTRAINT IS THE WIDEST HALF, not the whole line. The
 * dash is pinned to the screen's centre and the digits grow outward from it, so
 * "100 – 0" is 73pt to the left of centre and 35pt to the right: it collided
 * with the LEFT avatar and cleared the right one by a comfortable margin.
 * Budgeting on the total width would have called that line 108pt wide, fitted
 * it into a 76pt gap on paper, and left the overlap exactly where it was.
 *
 * The widest half the type rule permits is four tabular digits at 26pt —
 * `4 × 15.6` plus `SCORE_GAP` plus half a dash, about 77pt. Add the avatar's
 * own radius (20) and air that reads as deliberate (≈11), and the avatar's
 * centre has to sit 108 from the middle. That leaves
 * `2 × COLLAPSED_SPREAD − COLLAPSED_AVATAR` = 176pt of clear gap for a line
 * whose widest rendering is about 153.
 *
 * ⚠ IT IS A CONSTANT ON PURPOSE, not a measurement of the current score.
 * Deriving it live would shift both avatars sideways the moment somebody's
 * score gained a digit — a jump, mid-match, on the two elements the row is
 * arranged around. A fixed spread that always clears the worst case is worth
 * more than a snug one that moves.
 */
const COLLAPSED_SPREAD = 108;
/**
 * The strip of band that survives the collapse, holding the shrunken duel.
 *
 * ⚠ The chrome row is NOT where the duel lands. Ryan: the pool name "should not
 * move or change and remain the same throughout ... a permanent item like the
 * back and share button". So the collapsed matchup gets a row of its own
 * underneath rather than sharing one with a name it would sit on top of.
 *
 * ⚠ IT IS THE AVATAR PLUS ITS AIR: 40 + 8 above + 8 below. At 44 the avatars had
 * 2pt either side and it read as cramped. If `COLLAPSED_AVATAR` grows again this
 * grows with it, or the padding is silently eaten — the two are only
 * independent on paper.
 */
const COLLAPSED_ROW = 56;

/**
 * A member, as the corner needs them.
 *
 * ⚠ `userId` is here for the AVATAR, not the standing. The gradient is
 * `hash(userId)`, which is how the same person is the same colour in Banter and
 * here — key it on `entry_id` and somebody's rival changes colour between two
 * screens of the same app.
 */
export type Standing = {
  userId: string | null;
  rank: number | null;
  points: number;
  /**
   * Fixtures called right, from the engine.
   *
   * ⚠ The header does not render this — the Duel tab's scouting card does, and
   * it rides in this map because it is the SAME leaderboard row. A second read
   * for one number is how two surfaces start disagreeing about a season.
   */
  correct: number;
  /**
   * Their last five settled FIXTURES, oldest first — the leaderboard's own form
   * vocabulary, so a member sees the same five results in both places rather
   * than two different truths about a week.
   *
   * ⚠ Not the same as the scouting card's duel form, which is last five DUELS.
   * Two different questions that both fit the word "form".
   */
  lastFive: string[];
};

type Props = {
  poolName: string;
  poolCode: string | null;
  /** The duel to show. Null when the draw has not been made yet. */
  bout: Bout | null;
  /** The next sealed matchweek, when there is one. */
  sealed: { matchweek: number; opensAt: string | null } | null;
  /** entry_id → where they sit on the leaderboard. */
  standings: Map<string, Standing>;
  /** First kickoff of the current duel's matchweek — the countdown's target. */
  kickoffAt: string | null;
  /**
   * The running duel scoreline while the matchweek is being played.
   *
   * ⚠ IT REPLACES THE CLOCK, and only once the clock has run out. Picks close
   * an hour before the first kickoff (migration 101), so there is a window
   * where the matchweek is locked — the tab has already swapped to the team
   * sheet — and no football has started. Showing 0-0 through that hour would
   * be a scoreline for a game nobody is playing; the countdown is the truer
   * thing to show, and it hands over by itself the moment it expires.
   */
  liveScore: { you: number; them: number } | null;
  /**
   * Is a ball in play AT THIS MOMENT — not merely "is the matchweek open".
   *
   * ⚠ THE TWO ARE DAYS APART. Matchweek 3 is in progress from Friday night
   * until Monday, but for most of that window nothing is being played. A LIVE
   * dot that pulsed the whole time would be claiming something untrue, and by
   * Saturday at 3pm — when it means the most — it would mean nothing at all.
   */
  liveNow: boolean;
  /** Shared vertical scroll offset of whichever tab is on screen. */
  scrollY: SharedValue<number>;
  /** The tab strip. Rendered inside this component — see the header note. */
  children: ReactNode;
  /**
   * Reports the band's expanded height, so the pager can pad its pages by it.
   *
   * ⚠ The header FLOATS over the pager rather than sitting above it in the
   * flow — that is what lets it slide up without a layout pass. Which means
   * nothing reserves its space automatically and the padding is not optional:
   * without it the first screenful of every tab sits underneath the band.
   */
  onExpandedHeight?: (h: number) => void;
};

export function ShowdownDuelHeader({
  poolName,
  poolCode,
  bout,
  sealed,
  standings,
  kickoffAt,
  liveScore,
  liveNow,
  scrollY,
  children,
  onExpandedHeight,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  /**
   * The matchup's own height, reported by the matchup.
   *
   * ⚠ IT IS ALSO THE SLIDE DISTANCE AND THE SCROLL RANGE. Measuring rather than
   * guessing is what stopped the header rendering permanently collapsed the
   * first time round — a constant that has to match what the content needs is a
   * guess, and a short guess folds it away before anybody scrolls.
   */
  const [matchupH, setMatchupH] = useState(0);
  /**
   * Where the corners row starts inside the band.
   *
   * ⚠ Measured, because it is what the morph AIMS AT. Each avatar has to end up
   * in the chrome row, and knowing how far that is means knowing where it
   * started. A constant here would drift the moment the matchweek label wraps
   * or the type scale changes.
   */
  const [cornersY, setCornersY] = useState(0);
  const { width } = useWindowDimensions();

  /**
   * The two colours the band is lit with — each corner's own light stop, the
   * same value their ring and glow already use, so the background agrees with
   * the avatars instead of being a third opinion about who is who.
   */
  const youUserId = bout ? standings.get(bout.you.entryId)?.userId ?? null : null;
  const themUserId = bout?.them ? standings.get(bout.them.entryId)?.userId ?? null : null;
  const leftGlow = youUserId ? gradientForUser(youUserId)[0] : BAND.primary;
  const rightGlow = themUserId ? gradientForUser(themUserId)[0] : BAND.slate;
  // ⚠ One value, not a light/dark pair: the band is dark in BOTH app themes, so
  // there is no pale surface for this to be restrained against any more.
  const glowAlpha = 0.28;

  async function handleShare() {
    if (!poolCode) return;
    const url = `https://sportpool.io/join/${poolCode}`;
    await Share.share({ message: `Join "${poolName}" on SportPool!\n\n${url}`, url });
  }

  const chromeH = insets.top + theme.spacing.xs + CHROME_ROW;

  /**
   * ⚠ TRANSFORM ONLY — NOTHING HERE ANIMATES A LAYOUT PROPERTY.
   *
   * The first version interpolated `height`, and on this app's stack (New
   * Architecture + Reanimated 4) a layout prop driven from `useAnimatedStyle`
   * is the slow path: every frame asks React Native to lay the subtree out
   * again. It is also why it barely moved.
   *
   * So nothing shrinks. The whole band SLIDES UP by exactly the matchup's
   * height, out from under a chrome row pinned on top of it. Because the band
   * floats ABOVE the pager rather than sitting in the flow above it, sliding it
   * up uncovers the content that was always there — the space is reclaimed
   * without a single layout pass. `translateY` and `opacity` are compositor
   * properties, so this runs at display rate.
   */
  /** How far the band travels: everything except the strip that stays. */
  const slideBy = Math.max(0, matchupH - COLLAPSED_ROW);

  const slide = useAnimatedStyle(() => {
    if (slideBy === 0) return {};
    const p = interpolate(scrollY.value, [0, slideBy], [0, 1], Extrapolation.CLAMP);
    return { transform: [{ translateY: -p * slideBy }] };
  });


  /**
   * ⚠ EVERY PIECE MOVES TO ITS OWN COLLAPSED POSITION — Ryan, and it is the
   * difference between a morph and a slide. The band still travels up by
   * `slideBy` to reclaim the space; each avatar then travels back DOWN by the
   * part of that it should not have made, so its NET movement is exactly the
   * distance from where it sits to the chrome row.
   *
   *     net = -slideBy + (slideBy - wanted) = -wanted
   *
   * Both halves are `translateY`, so this is still compositor-only. Nothing
   * here measures or lays out per frame.
   */
  // ⚠ `chromeH +` IS LOAD-BEARING, AND LEAVING IT OUT IS WHY THE AVATARS
  // SHRANK WITHOUT ARRIVING. `onLayout` reports a position RELATIVE TO THE
  // PARENT, so `cornersY` is measured from the top of the matchup block — about
  // 40 — while `chromeCentreY` below is measured from the top of the SCREEN.
  // Subtracting the two without this term mixes coordinate spaces and
  // undershoots the travel by the whole height of the chrome row plus the
  // status bar, which on a notched phone is nearly 100pt.
  //
  // The band's content starts at `chromeH` (its own paddingTop), so that is the
  // offset between the two spaces.
  const avatarCentreY = chromeH + cornersY + AVATAR / 2;
  /** Screen-space centre of the strip the duel collapses into. */
  const collapsedCentreY = chromeH + COLLAPSED_ROW / 2;
  const wantedY = avatarCentreY - collapsedCentreY;
  const avatarScale = COLLAPSED_AVATAR / AVATAR;

  /** Half the gap between the two expanded avatar centres. */
  const columnCentre = ROW_PAD + (width - ROW_PAD * 2 - MIDDLE_COL) / 4;
  const wantedX = width / 2 - COLLAPSED_SPREAD - columnCentre;

  // ⚠ Two named hooks, not one factory called twice. A hook inside a helper is
  // a rules-of-hooks violation waiting for somebody to call it conditionally,
  // and the only thing that differs between the corners is the sign of X.
  /**
   * ⚠ TRANSLATE AND SCALE ARE ON DIFFERENT NODES, on purpose.
   *
   * The COLUMN translates — avatar, username and standing together — so the
   * labels follow the avatar out instead of standing still while it leaves.
   * The AVATAR alone scales, because a scale applies about its node's own
   * centre: shrinking the whole column would pivot around the centre of
   * avatar-plus-two-lines-of-text, which is well below the avatar, and the
   * landing position `wantedY` aims at would no longer be where it arrives.
   *
   * Splitting them keeps the arithmetic aimed at the avatar's centre while the
   * labels come along for the ride.
   */
  const leftMove = useAnimatedStyle(() => {
    if (slideBy === 0) return {};
    const p = interpolate(scrollY.value, [0, slideBy], [0, 1], Extrapolation.CLAMP);
    return {
      transform: [
        { translateY: p * (slideBy - wantedY) },
        { translateX: p * wantedX },
      ],
    };
  });
  const rightMove = useAnimatedStyle(() => {
    if (slideBy === 0) return {};
    const p = interpolate(scrollY.value, [0, slideBy], [0, 1], Extrapolation.CLAMP);
    return {
      transform: [
        { translateY: p * (slideBy - wantedY) },
        { translateX: -p * wantedX },
      ],
    };
  });
  /** The shrink, on the avatar box alone. Same for both corners. */
  const avatarShrink = useAnimatedStyle(() => {
    if (slideBy === 0) return {};
    const p = interpolate(scrollY.value, [0, slideBy], [0, 1], Extrapolation.CLAMP);
    return { transform: [{ scale: 1 - p * (1 - avatarScale) }] };
  });

  /**
   * Names and standings fade rather than travel. At the collapsed scale they
   * would be four-point type — shrinking them is not a smaller version of the
   * information, it is an unreadable one.
   */
  const labelFade = useAnimatedStyle(() => {
    if (slideBy === 0) return {};
    const p = interpolate(scrollY.value, [0, slideBy], [0, 1], Extrapolation.CLAMP);
    return { opacity: interpolate(p, [0, 0.45], [1, 0], Extrapolation.CLAMP) };
  });

  /** The score and clock ride up to sit between the two shrunken avatars. */
  const middleStyle = useAnimatedStyle(() => {
    if (slideBy === 0) return {};
    const p = interpolate(scrollY.value, [0, slideBy], [0, 1], Extrapolation.CLAMP);
    return {
      transform: [
        { translateY: p * (slideBy - wantedY) },
        { scale: 1 - p * 0.42 },
      ],
    };
  });

  /**
   * The chrome row cross-fades: pool name out, the duel in one line in.
   *
   * ⚠ THIS IS WHAT KEEPS THE MATCHUP "ALWAYS PRESENT" — Ryan's original ask.
   * Sliding the band away on its own would take the fight off the screen
   * entirely; the scoreline moving into the chrome means it is never gone, only
   * smaller. Both layers are absolutely positioned in the same row, so the
   * swap costs no layout.
   */

  return (
    <>
      {/*
        THE BAND — everything below the chrome, and the part that moves.

        ⚠ NO `zIndex` — it renders BEFORE the chrome layer, which is what puts
        the chrome on top. See the note there; an explicit z-index here was
        putting the whole header above the Banter sheet.
      */}
      <Animated.View
        style={[{ position: 'absolute', top: 0, left: 0, right: 0 }, slide]}
      >
        <View
          onLayout={(e) => {
            // The band's full expanded height. The pager pads by it so its
            // content starts below the header rather than under it.
            const h = Math.round(e.nativeEvent.layout.height);
            if (h > 0) onExpandedHeight?.(h);
          }}
          style={{
            backgroundColor: BAND.snow,
            paddingTop: chromeH,
            borderBottomWidth: 1,
            borderBottomColor: BAND.silver,
          }}
        >
          <Glow leftGlow={leftGlow} rightGlow={rightGlow} alpha={glowAlpha} />

          {/*
            rows 2-3: the matchup. Measured, because its height decides the
            slide.

            ⚠ NO OPACITY ON THIS WRAPPER. It used to carry a fade, from when the
            matchup slid away behind the chrome and had to not show through —
            and that fade was taking the AVATARS with it. They are meant to
            survive the collapse, shrunken, so only the pieces that genuinely
            leave (names, standings, the matchweek label) carry `labelFade`.
          */}
          <View>
            <View
              onLayout={(e) => {
                const h = Math.round(e.nativeEvent.layout.height);
                // Guarded: onLayout fires on every re-render, and writing the
                // same number back would loop.
                if (h > 0 && h !== matchupH) setMatchupH(h);
              }}
            >
              <Matchup
                bout={bout}
                sealed={sealed}
                standings={standings}
                kickoffAt={kickoffAt}
                liveScore={liveScore}
                liveNow={liveNow}
                leftMove={leftMove}
                rightMove={rightMove}
                avatarShrink={avatarShrink}
                middleStyle={middleStyle}
                labelFade={labelFade}
                onCornersY={setCornersY}
              />
            </View>
          </View>

          {/* row 4: the tab strip. Rides up with the band and ends level with
              the chrome — it never moves relative to what is above it. */}
          {children}
        </View>
      </Animated.View>

      {/*
        THE CHROME — pinned, and drawn OVER the band so the matchup disappears
        behind it rather than through it.

        ⚠ It carries its own copy of the glow. That is seamless only because the
        gradients are purely HORIZONTAL: two stacked boxes painting the same
        left-to-right sweep read as one continuous field. A vertical component
        would show the join immediately.

        ⚠⚠ IT SITS ON TOP BY TREE ORDER, NOT BY `zIndex`. Both layers used to
        carry one (1 and 2), which ordered them correctly against each other and
        WRONGLY against everything else: in React Native a sibling with an
        explicit z-index paints above siblings that have none, whatever the tree
        order. The Banter sheet has none, so it opened BEHIND the header.

        Rendering the chrome after the band gets the same result between these
        two and leaves the rest of the screen alone — the sheet and the FAB come
        later still, so they paint above both. Do not reintroduce a z-index here
        to "make sure": it is what broke the sheet.
      */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          backgroundColor: BAND.snow,
          paddingTop: insets.top + theme.spacing.xs,
        }}
      >
        <Glow leftGlow={leftGlow} rightGlow={rightGlow} alpha={glowAlpha} />
        <View
          style={{
            height: CHROME_ROW,
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: theme.spacing.lg,
          }}
        >
          <RoundButton icon="chevron.left" label="Back" onPress={() => router.back()} />
          <View style={{ flex: 1, minWidth: 0, paddingHorizontal: theme.spacing.sm }}>
            <BandText
                variant="cardTitle"
                numberOfLines={1}
                align="center"
                style={{ fontSize: 15, color: BAND.ink }}
              >
                {poolName}
              </BandText>
          </View>
          {poolCode ? (
            <RoundButton icon="square.and.arrow.up" label="Share pool" onPress={handleShare} />
          ) : (
            <View style={{ width: 32 }} />
          )}
        </View>
      </View>
    </>
  );
}

/**
 * The two lights, thrown from opposite edges and mixing across the middle.
 *
 * ⚠ TWO STACKED GRADIENTS, NOT ONE WITH FOUR STOPS. A single gradient
 * INTERPOLATES between adjacent stops — it can only ever be one colour at a
 * given x — so the closest it gets at the centre is both fading to nothing,
 * which reads as a dead strip. Two translucent layers COMPOSITE instead, so
 * across the overlap both colours are genuinely present and the middle is a mix
 * rather than an absence.
 *
 * ⚠ Drawn in BOTH header layers. Seamless only because the sweep is purely
 * horizontal; a vertical component would show the join.
 */
function Glow({
  leftGlow,
  rightGlow,
  alpha,
}: {
  leftGlow: string;
  rightGlow: string;
  alpha: number;
}) {
  return (
    <>
      <LinearGradient
        pointerEvents="none"
        colors={[withOpacity(leftGlow, alpha), withOpacity(leftGlow, 0)]}
        locations={[0, 0.78]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[withOpacity(rightGlow, 0), withOpacity(rightGlow, alpha)]}
        locations={[0.22, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
    </>
  );
}

// ------------------------------------------------------------- the matchup

function Matchup({
  bout,
  sealed,
  standings,
  kickoffAt,
  liveScore,
  liveNow,
  leftMove,
  rightMove,
  avatarShrink,
  middleStyle,
  labelFade,
  onCornersY,
}: {
  bout: Bout | null;
  sealed: Props['sealed'];
  standings: Map<string, Standing>;
  kickoffAt: string | null;
  liveScore: Props['liveScore'];
  liveNow: boolean;
  leftMove: AnimatedStyle;
  rightMove: AnimatedStyle;
  avatarShrink: AnimatedStyle;
  middleStyle: AnimatedStyle;
  labelFade: AnimatedStyle;
  onCornersY: (y: number) => void;
}) {
  const theme = useTheme();

  const matchweek = bout?.matchweek ?? sealed?.matchweek ?? null;

  return (
    // ⚠ Generous on purpose. This is the screen the mode is named after, and
    // a cramped matchup reads as a summary of the duel rather than the duel.
    <View style={{ paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.xl }}>
      {/* ---------- row 2: matchweek ---------- */}
      {matchweek !== null ? (
        <Animated.View
          style={[
            labelFade,
            {
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: theme.spacing.sm,
              marginBottom: theme.spacing.lg,
            },
          ]}
        >
          <BandText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 10,
              letterSpacing: 1.6,
              textTransform: 'uppercase',
              color: BAND.slate,
            }}
          >
            Matchweek {matchweek}
            {!bout && sealed ? ' · sealed' : ''}
          </BandText>
          {/*
            ⚠ THE SAME BADGE AS `LiveMatchCard`, down to the 7pt dot and the
            letter-spacing — deliberately, and not a new one. "Live" already has
            a look in this app; a second dialect of it on the one screen a
            member watches football on would read as two different claims.

            ⚠ AND IT DOES NOT PULSE, for the same reason `liveNow` exists at
            all: this badge is only on screen while a ball is actually in play,
            so the honesty is in WHEN it appears, not in it moving.
          */}
          {liveNow ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
              <View
                style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: BAND.red }}
              />
              <BandText
                style={{
                  fontFamily: fontFamilies.black,
                  fontSize: 10,
                  letterSpacing: 1.2,
                  color: BAND.red,
                }}
              >
                LIVE
              </BandText>
            </View>
          ) : null}
        </Animated.View>
      ) : null}

      {/* ---------- row 3: the two corners and the v ---------- */}
      {bout ? (
        <View
          onLayout={(e) => onCornersY(Math.round(e.nativeEvent.layout.y))}
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            paddingHorizontal: ROW_PAD,
          }}
        >
          <Corner
            name={bout.you.name}
            standing={standings.get(bout.you.entryId) ?? null}
            tone="primary"
            moveStyle={leftMove}
            avatarShrink={avatarShrink}
            labelFade={labelFade}
          />
          <Animated.View style={[{ minWidth: MIDDLE_COL, alignItems: 'center' }, middleStyle]}>
            <Middle
              bout={bout}
              kickoffAt={kickoffAt}
              liveScore={liveScore}
              liveNow={liveNow}
            />
          </Animated.View>
          <Corner
            name={bout.them ? bout.them.name : 'Nobody'}
            standing={bout.them ? standings.get(bout.them.entryId) ?? null : null}
            tone={bout.them ? 'red' : 'muted'}
            subtitle={bout.them ? undefined : 'Bye week'}
            moveStyle={rightMove}
            avatarShrink={avatarShrink}
            labelFade={labelFade}
          />
        </View>
      ) : (
        <BandText align="center" variant="body" style={{ paddingHorizontal: 24, color: BAND.slate }}>
          {sealed
            ? 'Your opponent opens one week at a time.'
            : 'The draw is made once there are two members.'}
        </BandText>
      )}
    </View>
  );
}

/**
 * The centre column: the `v` before a duel is played, the scoreline after.
 *
 * ⚠ Only `duelResult` decides the colour. A literal 3 / 1 here is the bug
 * migration 121 left behind on the web for a week — it would tint a win as a
 * defeat while the leaderboard had the member climbing.
 */
function Middle({
  bout,
  kickoffAt,
  liveScore,
  liveNow,
}: {
  bout: Bout;
  kickoffAt: string | null;
  liveScore: Props['liveScore'];
  liveNow: boolean;
}) {
  const { you, them, settled } = bout;
  const result = settled && them ? duelResult(you.points) : null;
  // Nothing to count once the duel is decided — the week it belonged to is over.
  const untilKickoff = useCountdown(settled ? null : kickoffAt);
  const countdown = them ? untilKickoff : null;

  /**
   * ⚠ THE CLOCK GETS THE LOCK HOUR, THE SCORE GETS EVERYTHING AFTER IT.
   *
   * `liveScore` arrives the moment the matchweek LOCKS, which migration 101
   * puts an hour before the first kickoff — so for that hour there is a
   * scoreline available and no football being played, and showing it would put
   * a 0-0 on the header for a game nobody has started. The countdown is still
   * counting to a real event, so it keeps the column until it expires and then
   * hands over on its own. No second condition, and no second clock read.
   */
  const showLive = !settled && liveScore !== null && countdown === null;

  const score = settled && them
    ? { you: you.accuracy ?? 0, them: them.accuracy ?? 0 }
    : showLive
      ? liveScore
      : null;

  /**
   * ⚠ THE SCORE HAS TO CLEAR TWO THINGS, AND IT CAN BE FOUR DIGITS A SIDE.
   * A matchweek pays 100 a fixture at Results depth, so a perfect ten is 1000 —
   * reachable, not hypothetical.
   *
   * Expanded, the whole line has to fit `MIDDLE_COL`: 160pt with `flex: 1`
   * corners either side, so an over-wide score does not clip, it SQUEEZES THE
   * AVATARS INWARD. Collapsed, each HALF has to clear its own avatar — see
   * `COLLAPSED_SPREAD`.
   *
   * ⚠ SO IT STEPS ON THE WIDEST SIDE, NOT THE TOTAL. Both constraints are about
   * a half, and the total hides the case that matters: "1000 – 0" is only five
   * digits, which a total-based rule leaves at full size — and its left half is
   * the widest thing this component can render.
   *
   * Stepped on the digit COUNT rather than measured, because
   * `adjustsFontSizeToFit` re-measures on every change: a size that shifts
   * under a number that is already moving.
   */
  const liveSize =
    Math.max(String(score?.you ?? 0).length, String(score?.them ?? 0).length) >= 4 ? 26 : 32;

  const tint = showLive
    // Red while a ball is in play — the same red the team sheet's clock and the
    // LIVE badge above use, so one colour means one thing on this screen.
    ? (liveNow ? BAND.red : BAND.ink)
    : result === 'won'
      ? BAND.green
      : result === 'lost'
        ? BAND.red
        : BAND.ink;

  /**
   * ⚠ ONE STYLE FOR ALL THREE PARTS. The dash has to sit on the same baseline
   * and the same optical weight as the digits either side of it; giving it its
   * own smaller size is what makes a split scoreline read as three things
   * rather than one number.
   */
  const scoreType: TextStyle = {
    fontFamily: fontFamilies.black,
    // ⚠ THE LIVE SCORE IS THE LOUDEST THING HERE, because it is what the
    // countdown it replaced was: the one number between the corners that
    // changes while you watch. A settled scoreline is a record and sits back.
    fontSize: showLive ? liveSize : 22,
    // ⚠ WITH THE SIZE. Variant 'body' caps `lineHeight` at 20 and shears the
    // tops off anything larger.
    lineHeight: showLive ? liveSize + 8 : 28,
    color: tint,
    fontVariant: ['tabular-nums'],
  };

  return (
    // ⚠ THE `v` IS GONE — Ryan, and the clock is the middle column now. It was
    // saying the same thing as two avatars either side of a scoreline already
    // say, and it was competing with the one number here that moves.
    //
    // `MIDDLE_COL` still has to clear `HH:MM:SS`, which is about 103pt of
    // tabular digits at 24pt Nunito Black. Too narrow and the clock wraps
    // mid-time; the corners are `flex: 1` and simply take what is left.
    <View
      style={{
        minWidth: MIDDLE_COL,
        // ⚠ `height: AVATAR` + centred, NOT a hand-tuned `paddingTop`. The row
        // is `flex-start`, so an avatar's centre is exactly `AVATAR / 2` from
        // the top — giving this column the same height and centring inside it
        // puts the clock on that line by construction. A padding would have to
        // be re-derived every time the clock's size or line height changed, and
        // would be wrong the moment it did.
        //
        // It also fixes the collapse for free: `wantedY` is measured from the
        // avatar's centre, and the clock now shares it, so the same translate
        // lands both on the same line in the collapsed row too.
        height: AVATAR,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
      }}
    >
      {score ? (
        /*
          ⚠ THE DASH IS THE AXIS, NOT THE MIDDLE OF THE STRING — Ryan,
          2026-09-04.

          A single centred "100 – 0" centres the STRING, so the dash sits
          wherever the digit counts leave it: right of centre at 100–0, dead
          centre at 100–100, left of centre at 0–100. It moves every time
          somebody scores, on the one element the two avatars are arranged
          around.

          Two `flex: 1` halves with the dash between them fix it by
          construction: equal halves put the dash's centre at the row's centre
          whatever the numbers do, and the digits grow OUTWARD from it. The row
          stretches to the middle column, the column is centred between two
          `flex: 1` corners inside symmetric padding — so the row's centre is
          the screen's centre, and it stays there even if a wide score pushes
          the column wider, because both corners then give up the same width.

          This is the same construction as `DuelTab`'s `Scoreline`, for the same
          reason. Two surfaces showing the same scoreline should not disagree
          about where its dash lives.
        */
        <View
          style={{
            alignSelf: 'stretch',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <BandText numberOfLines={1} style={[scoreType, { flex: 1, textAlign: 'right' }]}>
            {score.you}
          </BandText>
          <BandText numberOfLines={1} style={[scoreType, { paddingHorizontal: SCORE_GAP }]}>
            –
          </BandText>
          <BandText numberOfLines={1} style={[scoreType, { flex: 1, textAlign: 'left' }]}>
            {score.them}
          </BandText>
        </View>
      ) : null}
      {/*
        ⚠ THE COUNTDOWN REPLACES "TO PLAY", it does not sit beside it. Both say
        the same thing about the same week, and the clock says it with a number.
        It falls back to the words the moment there is nothing left to count —
        kickoff passed, no fixture, or a duel that is already settled.

        Counting to the KICKOFF, not the lock: migration 101 closes picks an
        hour earlier, so a clock labelled "first game" that used `lock_at` would
        run out while the football had not started.
      */}
      {/*
        ⚠ NOTHING UNDER THE LIVE SCORE — Ryan, 2026-09-04, and it is what puts
        the score on the avatars' centre line rather than above it. This column
        is `height: AVATAR` and centred, so a SINGLE child lands exactly on that
        line by construction; the "9 to play" beneath it made the pair centre
        instead, which pushed the number that matters upward. The count is not
        lost — it is the team sheet's own heading, on the card that lists the
        games it is counting.
      */}
      {showLive ? null : countdown ? (
        <BandText
          align="center"
          style={{
            fontFamily: fontFamilies.black,
            // Ryan: "this is the countdown to game time (fight time)". It is
            // the only number on the header that is going to change while you
            // watch it, so it gets to be the loudest thing between the corners.
            fontSize: 24,
            // ⚠ WITH THE SIZE. Variant 'body' caps `lineHeight` at 20 and
            // shears the tops off anything larger — at 24 that is the whole top
            // third of every digit.
            lineHeight: 30,
            color: BAND.accent,
            // ⚠ Load-bearing at this size: without it the digits are
            // proportional and the whole clock jitters sideways once a second.
            fontVariant: ['tabular-nums'],
          }}
        >
          {formatHms(countdown)}
        </BandText>
      ) : (
        <BandText
          align="center"
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 8,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: BAND.slate,
          }}
        >
          {!them ? 'no opponent' : settled ? (result ?? '') : 'to play'}
        </BandText>
      )}
    </View>
  );
}

/** Avatar, username, then `position · PTS`. */
function Corner({
  name,
  standing,
  tone,
  subtitle,
  moveStyle,
  avatarShrink,
  labelFade,
}: {
  name: string;
  standing: Standing | null;
  tone: 'primary' | 'red' | 'muted';
  subtitle?: string;
  /** Travels the whole column to this corner's collapsed position. */
  moveStyle: AnimatedStyle;
  /** Shrinks the avatar box alone — see the header for why it is separate. */
  avatarShrink: AnimatedStyle;
  /** The name and standing fade on the way out. */
  labelFade: AnimatedStyle;
}) {
  const theme = useTheme();
  const color =
    tone === 'primary'
      ? BAND.primary
      : tone === 'red'
        ? BAND.red
        : BAND.slate;
  const userId = standing?.userId ?? null;
  /**
   * The ring, and the glow behind it: the LIGHT STOP of this person's own
   * gradient. Lighter than the bottom of the circle it surrounds, which is what
   * makes it read as raised. Falls back to the corner colour when nobody is
   * there — a bye has no person and so no colour of their own.
   */
  const ringColor = userId ? gradientForUser(userId)[0] : color;

  return (
    <Animated.View
      style={[{ flex: 1, minWidth: 0, alignItems: 'center', gap: 9 }, moveStyle]}
    >
      {/*
        The shaded avatar the rest of the app uses — gradient keyed on the
        person, white initials, and a ring in a LIGHTER SHADE OF THEIR OWN
        COLOUR.

        ⚠ THE RING IS THE PERSON'S LIGHT STOP. Every gradient in the palette
        runs light → dark, so `gradientForUser(u)[0]` is lighter than the bottom
        of the circle it surrounds. That is the whole effect: the ring
        disappears into the crown and stands proud of the base, and the eye
        reads it as raised.

        It was an accident on Ryan's avatar first — his ring happened to be
        `colors.primary`, which IS the light stop of the blue gradient. Chasing
        it as a shadow, then a glow, then a white fade all missed the point: it
        is not lighting, it is the subject's own colour one shade up.

        ⚠ TWO VIEWS, AND IT HAS TO BE TWO. A shadow is clipped by
        `overflow: 'hidden'` on the same element, and the avatar needs that clip
        to stay round — outer carries the lift, inner carries the circle.

        ⚠ The outer view needs a solid `backgroundColor` or Android draws no
        elevation at all. It takes the header's own colour.
      */}
      {/*
        ⚠ NO SHADOW, DELIBERATELY. This carried a coloured glow for three
        commits and it was never the effect Ryan was after — the ring alone is
        what makes the avatar read as raised, and the band behind it now does
        the ambient half. A glow on top of both was one light source too many.

        The wrapper stays because the ring is an OVERLAY and needs something to
        be absolute against.
      */}
      <Animated.View
        style={[
          { width: AVATAR, height: AVATAR, borderRadius: theme.radii.pill },
          avatarShrink,
        ]}
      >
        <View
          style={{
            width: AVATAR,
            height: AVATAR,
            borderRadius: theme.radii.pill,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            // Only the empty case needs a fill — a `backgroundColor` paints
            // under a border, and that is what bled through as a halo once.
            backgroundColor: userId ? 'transparent' : withOpacity(color, 0.12),
          }}
        >
          {userId ? (
            <LinearGradient
              colors={[...gradientForUser(userId)]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                // ⚠ THE GRADIENT ROUNDS ITSELF. The parent's `overflow` does
                // not reliably clip an absolutely-positioned child to a border
                // radius.
                borderRadius: theme.radii.pill,
              }}
            />
          ) : null}
          <BandText
            style={{
              fontFamily: fontFamilies.black,
              fontSize: 26,
              // ⚠ SET WITH THE FONT SIZE. `Text` defaults to variant 'body',
              // whose `lineHeight: 20` shears the tops off anything larger.
              lineHeight: 32,
              color: userId ? '#FFFFFF' : color,
            }}
          >
            {getInitials(name)}
          </BandText>
        </View>

        {/*
          ⚠ AN OVERLAY, NOT A BORDER ON THE CIRCLE. A border insets its content,
          so putting one on the circle itself made the two avatars different
          sizes. Drawn on top at the same bounds it changes no geometry.
        */}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: theme.radii.pill,
            borderWidth: 3,
            borderColor: ringColor,
          }}
        />
      </Animated.View>

      {/* Names and standings FADE rather than travel — at the collapsed scale
          they would be four-point type, which is not a smaller version of the
          information but an unreadable one. */}
      <Animated.View style={[{ width: '100%' }, labelFade]}>
        <BandText
          variant="cardTitle"
          numberOfLines={1}
          align="center"
          style={{ fontSize: 15, color: BAND.ink }}
        >
          {name}
        </BandText>

      {subtitle ? (
        <BandText variant="detail" align="center" style={{ color: BAND.slate }}>
          {subtitle}
        </BandText>
      ) : (
        <BandText
          align="center"
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 12,
            color: BAND.slate,
            fontVariant: ['tabular-nums'],
          }}
        >
          {/* ⚠ An unranked entry shows a dash, never "0th". A member who has not
              been scored yet has no position — printing one would invent it. */}
          {standing?.rank != null ? `${ordinal(standing.rank)}` : '—'}
          {' · '}
          {standing ? standing.points.toLocaleString() : '0'} pts
        </BandText>
      )}
      </Animated.View>
    </Animated.View>
  );
}

// -------------------------------------------------------------- furniture

/**
 * `Text`, pinned to the band's palette.
 *
 * ⚠⚠ USE THIS, NEVER THE SHARED `Text`, anywhere in this file. The shared one
 * resolves its colour through `useTheme()` — so its default (`ink`) and its
 * `color` token prop both follow the DEVICE theme. On a band that is dark in
 * BOTH themes that means near-black text on near-black, and it fails silently:
 * the pool name and both usernames vanished in light mode exactly this way,
 * while every colour that had been written out explicitly stayed correct.
 *
 * Defaulting the colour here is what makes the next `<BandText>` safe without
 * anybody having to remember this note. Override with
 * `style={{ color: BAND.x }}`.
 */
function BandText({ style, ...rest }: React.ComponentProps<typeof Text>) {
  return <Text {...rest} style={[{ color: BAND.ink }, style]} />;
}


function RoundButton({
  icon,
  label,
  onPress,
}: {
  icon: string;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 32,
        height: 32,
        borderRadius: theme.radii.pill,
        backgroundColor: BAND.mist,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {/* ⚠ `tint`, not `color`. The `color` prop is a TOKEN and `Icon` resolves
          it through `useTheme()`, which is the light palette in light mode —
          the same leak that lost the pool name and the usernames. */}
      <Icon name={icon} tint={BAND.slate} size={15} weight="semibold" />
    </Pressable>
  );
}



/** 1 → 1st, 2 → 2nd, 11 → 11th. */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
