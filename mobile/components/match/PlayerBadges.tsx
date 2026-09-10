import { Text as RNText, View } from 'react-native';

import { MONO, MONO_BOLD } from '@/components/match/matchDisplay';
import { Icon } from '@/components/ui';
import { radii } from '@/theme';
import { formatRating, ratingScaleColor, type PlayerMarkers } from '@/lib/playerStats';

// =============================================================
// What goes where around a player
// =============================================================
// ⚠⚠ SIX SLOTS, ONE FACT EACH, AND THE MAP BELOW IS THE SPEC. Every badge on
// the pitch is placed from `slots()` and nowhere else, so the layout can be
// read in one place instead of inferred from scattered `position: absolute`
// blocks. They collided twice while this was inline — the rating and the goal
// both claimed bottom-right, and the armband and a booking were both amber
// sitting one above the other.
//
//              66'
//        substitution  ( )  rating
//                     (   )
//             yellow  (   )  red
//                     ( _ )
//            assists   ` '   goals
//
//                    C  17  Tzolis
//
// ⚠ THE PAIRINGS ARE DELIBERATE, NOT ARBITRARY. Each edge holds two facts of
// the same kind, so the eye never has to hunt for the other half of a pair:
// yellow opposite red across the middle, and what he MADE opposite what he
// SCORED across the bottom. The top pair is "he left" and "how well he played",
// which are the two read first.
//
// ⚠⚠ THE MINUTE FLOATS ABOVE THE ARROW AND DOES NOT MOVE IT. The arrow's slot
// is the anchor; the minute is positioned off it. Stacking them in one column
// pushed the arrow DOWN by the height of a line of text whenever a minute was
// present — far enough to collide with the booking below it, which is exactly
// what the pitch showed.
//
// ⚠ THE ARMBAND IS NOT HERE — IT IS ON THE NAME ROW, ahead of the number. It is
// the one marker that is not about this match: a captain is a captain before
// kickoff and stays one whether or not he touches the ball, so it belongs with
// the things that identify him rather than with the things that happened to
// him. Vacating bottom-left is what let the assists come out from behind the
// goals, where a player with both used to show only the goals.
//
// ⚠⚠ MULTIPLES STACK, THEY DO NOT COUNT. Two goals are two footballs fanned
// behind each other, not a ball with a "2" beside it. A count is a thing you
// read; a stack is a thing you SEE, and at this size the difference is whether
// the information arrives before or after you have decided to look.
// =============================================================

/** How far a badge hangs outside the circle. */
export const MARK = 17;

/**
 * The six anchors. `chip` is the circle's diameter, passed in because the
 * pitch owns that number and this file should not have a second opinion on it.
 */
export function slots(chip: number) {
  const mid = chip / 2 - 8;
  return {
    substitution: { top: -4, left: -MARK / 2 },
    rating: { top: -5, right: -MARK / 2 },
    yellow: { top: mid, left: -MARK / 2 + 2 },
    red: { top: mid, right: -MARK / 2 + 2 },
    assist: { bottom: -3, left: -MARK / 2 },
    goal: { bottom: -3, right: -MARK / 2 },
  } as const;
}

/**
 * ⚠ THE FAN OFFSET. Small enough that a stack still reads as one cluster,
 * large enough that the second item is unmistakably a second item. Anything
 * under about 3pt reads as a rendering artefact rather than a count.
 */
const FAN = 4;

/**
 * `count` copies of a badge, fanned so the pile is visible as a pile.
 *
 * ⚠ DRAWN BACK TO FRONT so the FIRST one sits on top and fully legible, with
 * the others peeking out behind it. Front-to-back would bury the only one that
 * is completely visible under the ones that are not.
 *
 * ⚠ `away` IS WHICH WAY THE PILE GROWS, and it points INTO the pitch rather
 * than off it — a stack on the left edge fans right, one on the right edge fans
 * left. Growing outward would push the second card off the touchline.
 */
function Fan({
  count,
  away,
  children,
}: {
  count: number;
  away: 1 | -1;
  children: React.ReactNode;
}) {
  const n = Math.min(count, 3); // ⚠ Three is already unheard of; four is a bug.
  return (
    <>
      {Array.from({ length: n }, (_, i) => n - 1 - i).map((i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: i * FAN * away,
            top: -i * FAN,
          }}
        >
          {children}
        </View>
      ))}
    </>
  );
}

function Card({ tone }: { tone: 'amber' | 'red' }) {
  return <Icon name="rectangle.portrait.fill" size={13} color={tone} filled />;
}

function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        minWidth: MARK,
        paddingHorizontal: 3,
        paddingVertical: 2,
        borderRadius: radii.pill,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.9)',
      }}
    >
      {children}
    </View>
  );
}

const white = { fontFamily: MONO_BOLD, fontSize: 9, lineHeight: 12, color: '#FFFFFF' } as const;
const dark = { fontFamily: MONO_BOLD, fontSize: 9, lineHeight: 12, color: '#111827' } as const;

export function PlayerBadges({
  marks,
  rating,
  subMinute,
  chip,
}: {
  marks: PlayerMarkers | null;
  rating: number | null;
  /** Null unless the timeline corroborated it — see `subMinute` in playerStats. */
  subMinute: number | null;
  chip: number;
}) {
  if (!marks) return null;
  const S = slots(chip);
  const badge = formatRating(rating);
  const badgeColor = ratingScaleColor(rating);

  return (
    <>
      {/* ---- top left: he left, or he arrived ------------------------ */}
      {marks.cameOff || marks.cameOn ? (
        <View style={{ position: 'absolute', ...S.substitution, width: MARK, height: MARK }}>
          {/* ⚠⚠ ABSOLUTE, SO THE ARROW DOES NOT MOVE. In a column the minute
              pushed the arrow down by a whole line of text — into the booking
              below it. The arrow owns the slot; the minute hangs off it.

              ⚠ It appears only when the timeline confirmed it: `minutes` alone
              is out by more than a minute for 5.9% of players, and a made-up
              minute beside a face is worse than no minute at all. */}
          {subMinute !== null ? (
            <RNText
              style={{
                position: 'absolute',
                bottom: MARK + 1,
                left: -8,
                right: -8,
                textAlign: 'center',
                fontFamily: MONO_BOLD,
                fontSize: 9,
                color: '#FFFFFF',
                textShadowColor: 'rgba(0,0,0,0.7)',
                textShadowRadius: 3,
              }}
            >
              {subMinute}&apos;
            </RNText>
          ) : null}
          <View
            style={{
              width: MARK,
              height: MARK,
              borderRadius: radii.pill,
              backgroundColor: marks.cameOff ? '#B91C1C' : '#15803D',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.9)',
            }}
          >
            <RNText style={{ ...white, fontSize: 10 }}>{marks.cameOff ? '↓' : '↑'}</RNText>
          </View>
        </View>
      ) : null}

      {/* ---- top right: how he played -------------------------------- */}
      {/* ⚠ NO OUTLINE, UNLIKE EVERY OTHER BADGE HERE. The others are pale and
          need a white hairline to hold an edge against the grass; the rating
          carries its own colour from a ramp whose greens darken precisely so
          they separate from #417A57 without one. See `ratingScaleColor`. */}
      {badge && badgeColor ? (
        <View
          style={{
            position: 'absolute',
            ...S.rating,
            minWidth: MARK + 6,
            paddingHorizontal: 4,
            paddingVertical: 2,
            // ⚠ `radii.pill`, NOT A NUMBER. Every badge on a player is a
            // capsule now — the token says so once, and a badge that grows a
            // digit (10.0) stays the same shape instead of needing its radius
            // re-guessed.
            borderRadius: radii.pill,
            backgroundColor: badgeColor,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* ⚠ NOT BOLD. The ramp already carries the emphasis; bold on top of
              a saturated fill is two shouts for one fact. */}
          <RNText
            style={{
              fontFamily: MONO,
              fontSize: 10,
              lineHeight: 12,
              color: '#FFFFFF',
              fontVariant: ['tabular-nums'],
            }}
          >
            {badge}
          </RNText>
        </View>
      ) : null}

      {/* ---- left: bookings, fanned --------------------------------- */}
      {marks.yellow > 0 ? (
        <View style={{ position: 'absolute', ...S.yellow, width: 13, height: 15 }}>
          <Fan count={marks.yellow} away={1}>
            <Card tone="amber" />
          </Fan>
        </View>
      ) : null}

      {/* ---- right: sendings-off, opposite the yellows --------------- */}
      {marks.red > 0 ? (
        <View style={{ position: 'absolute', ...S.red, width: 13, height: 15 }}>
          <Fan count={marks.red} away={-1}>
            <Card tone="red" />
          </Fan>
        </View>
      ) : null}

      {/* ---- bottom left: what he made ------------------------------ */}
      {marks.assists > 0 ? (
        <View style={{ position: 'absolute', ...S.assist, width: MARK, height: MARK }}>
          {/* ⚠ 'A', NOT A BOOT. There is no boot in this icon set, and
              borrowing another glyph would invent a symbol nobody was taught. */}
          <Fan count={marks.assists} away={1}>
            <Pill color="#FFFFFF">
              <RNText style={dark}>A</RNText>
            </Pill>
          </Fan>
        </View>
      ) : null}

      {/* ---- bottom right: what he scored --------------------------- */}
      {marks.goals > 0 ? (
        <View style={{ position: 'absolute', ...S.goal, width: MARK, height: MARK }}>
          <Fan count={marks.goals} away={-1}>
            <Pill color="#FFFFFF">
              {/* ⚠ `solid`, NOT `filled` — `filled` paints the free glyph's
                  closed paths and a football's outer ring is closed, so it
                  renders as a plain dark disc. The cards are the reverse:
                  RectangleVerticalIcon has no solid variant at all. */}
              <Icon name="sportscourt.fill" size={11} color="ink" solid />
            </Pill>
          </Fan>
        </View>
      ) : null}
    </>
  );
}
