import { Text as RNText, View } from 'react-native';

import { MONO, MONO_BOLD } from '@/components/match/matchDisplay';
import { Icon } from '@/components/ui';
import { MARK } from '@/lib/lineupLayout';
import { radii } from '@/theme';
import { formatRating, ratingScaleColor, type PlayerMarkers } from '@/lib/playerStats';

// =============================================================
// What goes where around a player
// =============================================================
// ⚠⚠ FIVE SLOTS, ONE FACT EACH, AND THE MAP BELOW IS THE SPEC. Every badge on
// the pitch is placed from `slots()` and nowhere else, so the layout can be
// read in one place instead of inferred from scattered `position: absolute`
// blocks. They collided twice while this was inline — the rating and the goal
// both claimed bottom-right, and the armband and a booking were both amber
// sitting one above the other.
//
//                     ( )  rating
//                     (   )
//             yellow  (   )  red
//                     ( _ )
//            assists   ` '   goals
//
//                 C  66' ←  Tzolis
//
// ⚠ THE PAIRINGS ARE DELIBERATE, NOT ARBITRARY. Each edge holds two facts of
// the same kind, so the eye never has to hunt for the other half of a pair:
// yellow opposite red across the middle, and what he MADE opposite what he
// SCORED across the bottom.
//
// ⚠⚠ THE SUBSTITUTION IS NOT HERE ANY MORE — IT IS ON THE NAME ROW (Ryan,
// 2026-09-19), as `66' ←` ahead of the surname. Top-left was the wrong home for
// it twice over: it is the one thing on a shirt that needs TWO pieces of type
// to say (a minute and a direction), and it was the only badge whose minute had
// to be floated off its own slot to stop it shoving the arrow into the booking
// below. A row of text reads a pair left-to-right for free.
//
// ⚠ THE ARMBAND IS NOT HERE EITHER, for the same reason and the older one: it
// is the one marker that is not about this match. A captain is a captain before
// kickoff and stays one whether or not he touches the ball, so it belongs with
// the things that identify him rather than with the things that happened to
// him. Vacating bottom-left is what let the assists come out from behind the
// goals, where a player with both used to show only the goals.
//
// ⚠⚠ MULTIPLES STACK, THEY DO NOT COUNT. Two goals are two footballs fanned
// behind each other, not a ball with a "2" beside it. A count is a thing you
// read; a stack is a thing you SEE, and at this size the difference is whether
// the information arrives before or after you have decided to look. They fan
// ACROSS, never up — see `Fan`.
// =============================================================

// ⚠ Re-exported rather than declared: the spacing maths in `lineupLayout`
// needs this number too, and two copies would drift.
export { MARK } from '@/lib/lineupLayout';

/**
 * The five anchors. `chip` is the shirt's width, passed in because the pitch
 * owns that number and this file should not have a second opinion on it.
 *
 * ⚠ TOP-LEFT IS DELIBERATELY EMPTY. The substitution used to sit there; nothing
 * has been moved up to fill the gap, because the rating is the one fact that
 * earns the top of the shirt on its own.
 */
export function slots(chip: number) {
  const mid = chip / 2 - 8;
  return {
    rating: { top: -5, right: -MARK / 2 },
    // ⚠ THE BOX GREW WITH THE HALO, AND THESE ABSORB IT. The card used to hang
    // in a 13x15 box with the glyph at its top-left corner, which put its
    // centre on the shirt's edge and `mid + 6.5` down. The box is now a
    // 16-square with both glyphs centred in it, so the offsets are worked back
    // from that centre — the card has not moved a point.
    yellow: { top: mid - 1.5, left: -CARD_HALO / 2 },
    red: { top: mid - 1.5, right: -CARD_HALO / 2 },
    // ⚠⚠ FLUSH AGAINST THE HEM, UP AND IN (Ryan, 2026-09-19) — 5 up and 9.5 in
    // from where they hung, in two passes. `chip` is the shirt's SQUARE and the
    // shirt does not fill it: measured off the artwork's own path, at 56pt the
    // hem runs from 16.1 to 39.8 across and ends 49.1 down, so the bottom
    // corners of the box are empty grass. The discs were centred on the box's
    // edges and floating in it, which made a scorer visibly wider than a
    // defender for no reason anyone could see.
    //
    // ⚠ AND 3 IS WHERE IT STOPS, NOT A ROUND NUMBER. At `left: 3` the disc runs
    // 3 → 16.0 and the hem begins at 16.1: it is touching the shirt. Any
    // further in and a badge starts covering the jersey rather than sitting
    // beside it, which is a different decision from "closer".
    //
    // ⚠ AND IT LIFTS THEM OFF THE NAME. At `bottom: -1` a disc hung BELOW the
    // shirt entirely, into the 3pt gap the surname starts in — which is why a
    // scorer's badge sat level with his own name. It now ends 4pt clear of it.
    assist: { bottom: 4, left: 3 },
    goal: { bottom: 4, right: 3 },
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
 * ⚠⚠ `away` IS WHICH WAY THE PILE GROWS, AND IT GROWS AWAY FROM THE SHIRT
 * (Ryan, 2026-09-19): assists and the yellow fan LEFT off the left of the
 * jersey, goals and the red fan RIGHT off the right of it. Each slot's stack
 * therefore runs outward on the side it already sits on.
 *
 * ⚠ IT USED TO POINT INWARD, on the reasoning that a pile growing outward would
 * push the second badge off the touchline. It does not: a 56pt shirt sits in a
 * column at least 79 wide, so there are 11.5pt of margin either side and a
 * third copy reaches 5. What inward actually did was walk the pile ACROSS the
 * jersey — a scorer's second goal covered his own number.
 *
 * ⚠⚠ AND IT FANS SIDEWAYS ONLY (Ryan, 2026-09-19). It used to step 4 across AND
 * 4 up per copy, so a second booking climbed the shirt diagonally — which put
 * it nearer the rating badge above and read as two different things at two
 * heights rather than as two of one thing. Along a line they are obviously a
 * count. Every slot has room across and none of them has room upward.
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
          }}
        >
          {children}
        </View>
      ))}
    </>
  );
}

/** The card itself, and the white one sitting behind it. */
const CARD = 13;
const CARD_HALO = 16;

/**
 * A booking, with a thin white edge (Ryan, 2026-09-19).
 *
 * ⚠⚠ THE BORDER IS A SECOND COPY OF THE GLYPH BEHIND THE FIRST — Ryan's idea,
 * and the right one. My first attempt threw the icon away and drew a plain
 * rounded rectangle so it could take `borderWidth`, because a glyph has no edge
 * to outline. That worked, but it quietly changed the card's SHAPE: the
 * Hugeicons rectangle is a squircle, 16x20 in a 24 box with a corner radius of
 * about a quarter of its width, and a `borderRadius: 2` rectangle is a squarer,
 * taller thing. Nobody asked for a new card. Stacking two sizes of the same
 * glyph keeps the silhouette exactly and follows those corners for free.
 *
 * ⚠ 16 BEHIND 13 IS A 1pt EDGE. The glyph fills two thirds of its box, so the
 * halo is (16-13) x 16/24 / 2 = 1.00 across and 1.25 down — even enough to read
 * as an outline rather than as a drop shadow. Going to 15 gives 0.67, which
 * disappears against the grass at this size.
 *
 * ⚠ THIS FILE USED TO ARGUE AGAINST THE BORDER, and the argument was about
 * legibility — which is not what was asked. Kept for the record, since it is
 * good reasoning that simply lost: yellow measures 2.36:1 against the light
 * pitch and red 1.35:1, which sounds dire, but that is LUMINANCE contrast, the
 * metric for reading TEXT. A red rectangle on green grass is about as
 * hue-distinct as two colours get. The edge is not holding the card together;
 * it is making it match the other badges, all of which carry one.
 */
function Card({ tone }: { tone: 'amber' | 'red' }) {
  return (
    <View
      style={{
        width: CARD_HALO,
        height: CARD_HALO,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="rectangle.portrait.fill" size={CARD_HALO} tint="#FFFFFF" filled />
      {/* ⚠ ABSOLUTE, SO THE TWO SHARE A CENTRE. In the flow the coloured card
          would sit BELOW the white one instead of on it. */}
      <View style={{ position: 'absolute' }}>
        <Icon name="rectangle.portrait.fill" size={CARD} tint={CARD_COLOR[tone]} filled />
      </View>
    </View>
  );
}

/**
 * The white disc behind a goal or an assist.
 *
 * ⚠⚠ THE DISC SHRANK AND THE ICONS DID NOT (Ryan, 2026-09-19). It was 19×17
 * around an 11pt football — three points of padding on each side plus a border,
 * which read as a white sticker with a small ball on it rather than as a badge.
 * It is 13×13 now, and the football and the 'A' are untouched at 11 and 9pt.
 * The whole reduction came out of the padding.
 *
 * ⚠ AND IT IS A CIRCLE NOW, WHICH IT WAS NOT BEFORE. The old padding was 3
 * across and 2 down, so a goal badge was two points wider than it was tall — an
 * oval nobody chose. With no padding at all the icon's own 11pt plus the 1pt
 * border make 13 in both directions, and `minWidth` holds the narrow 'A' to the
 * same 13 rather than letting it collapse into a lozenge.
 */
const PILL = 13;

function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        minWidth: PILL,
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

/**
 * ⚠⚠ EVERY COLOUR IN THIS FILE IS A LITERAL, AND THAT IS DELIBERATE. The
 * surfaces here are literal too — a white pill and a green pitch, neither of
 * which changes with the theme — so anything drawn on them must not change
 * either. A THEME TOKEN ON A HARD-CODED SURFACE IS A DARK-MODE BUG WAITING:
 * the goal was `color="ink"`, and `ink` is #1B2340 in light but #E8EAF0 in
 * dark, so the football went from 15.43:1 to 1.20:1 against its white pill and
 * simply disappeared. A guard test now refuses theme tokens in this file.
 */
const ON_WHITE = '#111827';
/**
 * ⚠ THE CARDS ARE LITERALS TOO, AND FOR A DIFFERENT REASON. `ink` on a white
 * pill was a bug; the theme's `amber` on grass is not — it shifts from #F59E0B
 * to #FBBF24 in dark mode and stays perfectly legible. But a yellow card is a
 * fact about football rather than a decision about a colour scheme, and it
 * should be the same yellow whichever theme somebody is reading in. Measured
 * against both pitches: yellow 2.36:1 on the light grass and 5.79:1 on the
 * dark, red 1.35:1 and 3.31:1. Those light-mode figures look low and are not
 * a problem — see `Card` for why luminance is the wrong measure for a coloured
 * rectangle on grass. (This comment once claimed a white hairline was holding
 * their edge. There has never been one.)
 */
const CARD_COLOR = { amber: '#F59E0B', red: '#EF4444' } as const;
// ⚠ `lineHeight` 11, NOT 12 — it is what makes the assist disc square. The
// text box is the badge's height, so a 12 line inside a 1pt border came to 14
// against the goal badge's 13. The 'A' itself is still 9pt.
const dark = { fontFamily: MONO_BOLD, fontSize: 9, lineHeight: 11, color: ON_WHITE } as const;

export function PlayerBadges({
  marks,
  rating,
  chip,
}: {
  marks: PlayerMarkers | null;
  rating: number | null;
  chip: number;
}) {
  if (!marks) return null;
  const S = slots(chip);
  const badge = formatRating(rating);
  const badgeColor = ratingScaleColor(rating);

  return (
    <>
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
        <View style={{ position: 'absolute', ...S.yellow, width: CARD_HALO, height: CARD_HALO }}>
          <Fan count={marks.yellow} away={-1}>
            <Card tone="amber" />
          </Fan>
        </View>
      ) : null}

      {/* ---- right: sendings-off, opposite the yellows --------------- */}
      {marks.red > 0 ? (
        <View style={{ position: 'absolute', ...S.red, width: CARD_HALO, height: CARD_HALO }}>
          <Fan count={marks.red} away={1}>
            <Card tone="red" />
          </Fan>
        </View>
      ) : null}

      {/* ---- bottom left: what he made ------------------------------ */}
      {marks.assists > 0 ? (
        <View style={{ position: 'absolute', ...S.assist, width: PILL, height: PILL }}>
          {/* ⚠ 'A', NOT A BOOT. There is no boot in this icon set, and
              borrowing another glyph would invent a symbol nobody was taught. */}
          <Fan count={marks.assists} away={-1}>
            <Pill color="#FFFFFF">
              <RNText style={dark}>A</RNText>
            </Pill>
          </Fan>
        </View>
      ) : null}

      {/* ---- bottom right: what he scored --------------------------- */}
      {marks.goals > 0 ? (
        <View style={{ position: 'absolute', ...S.goal, width: PILL, height: PILL }}>
          <Fan count={marks.goals} away={1}>
            <Pill color="#FFFFFF">
              {/* ⚠ `solid`, NOT `filled` — `filled` paints the free glyph's
                  closed paths and a football's outer ring is closed, so it
                  rendered as a plain dark disc until this was corrected.
                  The cards are the reverse: RectangleVerticalIcon has no
                  solid variant at all, which is why `filled` exists.

                  ⚠ And `tint`, NOT `color`: `color` takes a THEME token and the
                  pill it sits on is a hard-coded white. See ON_WHITE. */}
              <Icon name="sportscourt.fill" size={11} tint={ON_WHITE} solid />
            </Pill>
          </Fan>
        </View>
      ) : null}
    </>
  );
}
