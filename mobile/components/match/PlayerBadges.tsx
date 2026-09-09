import { Text as RNText, View } from 'react-native';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { Icon } from '@/components/ui';
import { formatRating, ratingColor, type PlayerMarkers } from '@/lib/playerStats';

// =============================================================
// What goes where around a player
// =============================================================
// ⚠⚠ SIX SLOTS, ONE FACT EACH, AND THE MAP BELOW IS THE SPEC. Every badge on
// the pitch is placed from `SLOT` and nowhere else, so the layout can be read
// in one place instead of inferred from six scattered `position: absolute`
// blocks. They collided twice while this was inline — the rating and the goal
// both claimed bottom-right, and the armband and a booking were both amber
// sitting one above the other.
//
//        substitution  ( )  rating
//                     (   )
//             yellow  (   )  red
//                     ( _ )
//           captain    ` '   goals / assists
//
// ⚠ THE PAIRINGS ARE DELIBERATE, NOT ARBITRARY. Yellow and red sit opposite
// each other because they are the same kind of fact and the eye should not have
// to hunt for the second one. The two that mean "he left" and "how well he
// played" take the top, where they are read first. The two that are about
// contribution — the armband and the goals — take the bottom.
//
// ⚠⚠ MULTIPLES STACK, THEY DO NOT COUNT. Two goals are two footballs fanned
// behind each other, not a ball with a "2" beside it. A count is a thing you
// read; a stack is a thing you SEE, and at this size the difference is whether
// the information arrives before or after you have decided to look.
// =============================================================

/** How far a badge hangs outside the circle. */
export const MARK = 17;

/**
 * The six anchors. `CHIP` is the circle's diameter, passed in because the
 * pitch owns that number and this file should not have a second opinion on it.
 */
export function slots(chip: number) {
  const mid = chip / 2 - 8;
  return {
    substitution: { top: -4, left: -MARK / 2 },
    rating: { top: -5, right: -MARK / 2 },
    yellow: { top: mid, left: -MARK / 2 + 2 },
    red: { top: mid, right: -MARK / 2 + 2 },
    captain: { bottom: -3, left: -MARK / 2 + 1 },
    scoring: { bottom: -3, right: -MARK / 2 },
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
        borderRadius: MARK / 2,
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
  const badgeColor = ratingColor(rating);

  return (
    <>
      {/* ---- top left: he left, or he arrived ------------------------ */}
      {marks.cameOff || marks.cameOn ? (
        <View style={{ position: 'absolute', ...S.substitution, alignItems: 'center' }}>
          {/* ⚠ THE MINUTE SITS ABOVE THE ARROW and appears only when the
              timeline confirmed it. See `subMinute`: `minutes` alone is out by
              more than a minute for 5.9% of players, and a made-up minute
              beside a face is worse than none. */}
          {subMinute !== null ? (
            <RNText
              style={{
                fontFamily: MONO_BOLD,
                fontSize: 9,
                color: '#FFFFFF',
                textShadowColor: 'rgba(0,0,0,0.7)',
                textShadowRadius: 3,
                marginBottom: 1,
              }}
            >
              {subMinute}&apos;
            </RNText>
          ) : null}
          <View
            style={{
              width: MARK,
              height: MARK,
              borderRadius: MARK / 2,
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
      {badge && badgeColor ? (
        <View style={{ position: 'absolute', ...S.rating }}>
          <Pill color={badgeColor}>
            <RNText style={{ ...white, fontVariant: ['tabular-nums'] }}>{badge}</RNText>
          </Pill>
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

      {/* ---- bottom left: the armband ------------------------------- */}
      {marks.captain ? (
        <View style={{ position: 'absolute', ...S.captain }}>
          <View
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              // ⚠ WHITE, NOT YELLOW. An amber armband under an amber booking on
              // the same edge is a clash the eye resolves twice. A card MUST
              // keep its colour, because for a card the colour IS the fact.
              backgroundColor: '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: 'rgba(0,0,0,0.15)',
            }}
          >
            <RNText style={{ ...dark, fontSize: 8 }}>C</RNText>
          </View>
        </View>
      ) : null}

      {/* ---- bottom right: what he produced ------------------------- */}
      {marks.goals > 0 || marks.assists > 0 ? (
        <View style={{ position: 'absolute', ...S.scoring, width: MARK, height: MARK }}>
          {/* ⚠ GOALS OUTRANK ASSISTS FOR THE SLOT. A player with both shows his
              goals; the assist is in the sheet. Fanning six badges off one
              corner would be a pile, not a stack. */}
          <Fan count={marks.goals > 0 ? marks.goals : marks.assists} away={-1}>
            <Pill color="#FFFFFF">
              {marks.goals > 0 ? (
                // ⚠ `solid`, NOT `filled` — `filled` paints the free glyph's
                // closed paths and a football's outer ring is closed, so it
                // renders as a plain dark disc. The cards above are the reverse:
                // RectangleVerticalIcon has no solid variant at all.
                <Icon name="sportscourt.fill" size={11} color="ink" solid />
              ) : (
                <RNText style={dark}>A</RNText>
              )}
            </Pill>
          </Fan>
        </View>
      ) : null}
    </>
  );
}
