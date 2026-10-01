import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Text as RNText, View } from 'react-native';
import { useCallback } from 'react';
import type { BottomSheetBackgroundProps } from '@gorhom/bottom-sheet';

import { MONO, MONO_BOLD } from '@/components/match/matchDisplay';
import { ScoutSheet, ScoutSheetBody } from '@/components/scouting/ScoutSheet';
import { Text } from '@/components/ui';
import { withLightness } from '@/lib/design/oklch';
import { useTheme, withOpacity } from '@/theme';
import {
  formatRating,
  playerPhotoUrl,
  playerRates,
  positionName,
  statIsZero,
  subMinute,
  RATE_COVERS,
  RATING_COLOR,
  ratingScaleColor,
  statGroups,
  headlineParts,
  type MatchPlayerStat,
} from '@/lib/playerStats';

// =============================================================
// One player's afternoon
// =============================================================
// ## ⚠⚠ IT OPENS ON `ScoutSheet` NOW, WHICH REVERSES THIS FILE'S OWN ARGUMENT
//
// This was a vanilla RN `Modal` with an `Animated.View`, and the comment here
// said so with a reason: "the library buys gesture dismissal and a snap-point
// stack, and this sheet wants neither: it is a card you open, read and close."
// `ScoutSheet` was built by copying THIS shell and then throwing that sentence
// out, because Ryan wanted the Banter feel — grab it and throw it down.
//
// Ryan, 2026-10-01: make the player detail sheet like the scouting sheets. So
// the reversal is complete and the sheet now inherits, rather than re-decides,
// every shell question: the 32pt corners, the 40pt grab handle, the 0.45
// backdrop, drag-to-dismiss, `snow` behind `surface` cards, and a height in
// POINTS off the live window instead of a definite box of its own.
//
// Three things went in the bin with the old shell, and they are the things to
// put back first if any of this reads wrong:
//
//   · THE CLOSE BUTTON. A handle, a backdrop tap and a downward drag are three
//     ways out; a fourth in the corner is clutter competing with the gesture
//     the shell exists to provide. `ScoutHeader` makes the same call.
//   · THE SLIDE `Animated.Value`. gorhom owns the entry and exit animation, and
//     a 40pt translate on top of it would fight the spring.
//   · THE DEFINITE-HEIGHT / `flex: 1` PAIRING, with its two-attempt comment
//     about why the list would not scroll. `BottomSheetScrollView` inside a
//     fixed snap point is the same arrangement, made by the shell.
//
// ⚠ WHAT DID NOT CHANGE IS THE HEADER. Ryan asked for the shell only, so the
// club-coloured band, the 80pt photograph, the corner rating badge and the
// centred name block all stay exactly as they were — this sheet does NOT adopt
// `ScoutHeader`. That is the one place it still differs from a scout report, on
// purpose.
//
// ⚠ IT IS A SHEET RATHER THAN AN INLINE CARD BECAUSE THE PITCH MUST NOT MOVE.
// The Line-ups tab lives inside a horizontal pager; expanding a panel under the
// pitch would reflow the tab mid-swipe and shift the player you just tapped out
// from under your thumb.
//
// ## ⚠⚠ AND THAT PAGER IS WHY THE STATE LIVES ON THE MATCH SCREEN
//
// A plain gorhom `BottomSheet` positions against its nearest ancestor, so it has
// to be rendered at a screen root — see `ScoutSheet`. The Line-ups tab is inside
// a `ScrollView` inside the pager, which a `Modal` did not care about and this
// does. `LineupsTab` therefore reports the tap upward and `app/match/[matchId]`
// holds the `PlayerPick` and mounts the sheet beside the pager, exactly as the
// pool screen does for `DossierSheet`.
// =============================================================

/**
 * How light the header's colour is made, in light mode.
 *
 * ⚠⚠ A LIGHTNESS, NOT AN OPACITY, AND THE DIFFERENCE IS WHICH CLUBS SURVIVE.
 * The header was `tint` at 24% over snow, which is washed out — but simply
 * turning the opacity up does not work, because the text on it is DARK: at 45%
 * a black-shirted club (Fulham) drops the ink to 4.37:1 and at 65% to 2.13:1.
 * Opacity moves every club's lightness by a different amount, so one number
 * cannot be right for Arsenal red and Fulham black at once.
 *
 * Setting the LIGHTNESS lands every club in the same band whatever it started
 * as. At 0.84 they are properly coloured — Arsenal #FF826E, Everton #8BC8FF —
 * and the worst ink contrast across six very different clubs is 6.37:1.
 */
const HEADER_LIGHTNESS = 0.84;

/**
 * How far the header's colour fades, in points, measured from the sheet's TOP.
 *
 * ⚠ A DISTANCE, NOT A PROPORTION, WHICH IS THE WHOLE POINT. The header's height
 * depends on its content — a headline of "Minutes played 90 · 3 goals · 2
 * assists" wraps where "Minutes played 90" does not — so a gradient that ends
 * at its own bottom edge stretches with it and leaves a bigger slab of flat
 * colour at the top each time. Anchored to a fixed distance the fade is
 * identical however tall the header gets, and it is allowed to OVERSHOOT: the
 * colour carries on into the top of the list instead of stopping at a seam.
 *
 * ⚠⚠ 220 -> 244 BECAUSE OF THE GRAB HANDLE, and that is the one number the move
 * to `ScoutSheet` changed. The fade now starts at the top of the SHEET rather
 * than at the top of the header block, and gorhom's handle — `padding: 10` plus
 * a 4pt indicator — puts 24pt between the two. 220 covered the tallest
 * realistic header (~202pt); 244 covers the same header pushed down by the
 * handle.
 */
const HEADER_FADE = 244;

/**
 * Everything the sheet needs to draw one player, as one value.
 *
 * ⚠ ONE OBJECT RATHER THAN FIVE PROPS, BECAUSE IT IS NOW SOMEBODY ELSE'S STATE.
 * The screen that mounts this sheet does not know what a substitution clock is
 * and should not have to re-derive one; `LineupsTab` owns every one of these
 * facts and hands the whole pick up. `null` is a closed sheet.
 *
 * ⚠⚠ AND THE CALLER MUST NOT CLEAR IT TO CLOSE. `ScoutSheet` fires `onClose`
 * AFTER its animation finishes, so nulling the pick there is what keeps the
 * player on screen for the whole slide down. Clearing it first would blank the
 * sheet and then animate the empty shell away.
 */
export type PlayerPick = {
  stat: MatchPlayerStat;
  /** The club he played for, named as the band above the pitch names it. */
  teamName: string;
  /** His club's colour — the same one the pitch drew his shirt in. */
  tint: string;
  /**
   * ⚠ THE MINUTES ONLY, AND ONLY TO CORROBORATE. A player cannot be joined to
   * the timeline — its names are abbreviated and carry no id — so this confirms
   * the minute his own row already implies rather than supplying one.
   */
  substMinutes: ReadonlySet<number>;
  /** See `statsClock` in playerStats — a live match is not a 90-minute one. */
  clock: number;
};

export function PlayerStatSheet({
  /**
   * Who to draw. `null` is a closed sheet — and see `PlayerPick` for why the
   * caller must only reach that state from `onClose`, never to cause one.
   */
  pick,
  onClose,
}: {
  pick: PlayerPick | null;
  onClose: () => void;
}) {
  const theme = useTheme();

  // ⚠ Dark mode keeps the translucent tint, which reads well over a dark
  // surface. Light mode needs a colour of its own — see HEADER_LIGHTNESS.
  const tint = pick?.tint ?? null;
  const headerColor =
    tint === null ? null : theme.mode === 'dark' ? tint : withLightness(tint, HEADER_LIGHTNESS);
  const headerAlpha = theme.mode === 'dark' ? 0.38 : 1;

  /**
   * The club's colour, painted as the sheet's own surface.
   *
   * ## ⚠⚠ A FIXED DISTANCE BEHIND THE CONTENT, NOT A BACKGROUND ON IT
   *
   * The gradient used to BE the header, so `end: y 1` meant "the bottom of
   * whatever this contains" — a proportion. Give a player three goals and an
   * assist, the headline wraps, the header grows, and the same ramp spreads
   * over more pixels: the top stays above 80% alpha for 38pt on a short card
   * and 50pt on a tall one, which is the solid bar. Anchored to `HEADER_FADE`
   * the fade is identical however tall the header gets.
   *
   * ⚠⚠ AND IT IS THE SHEET'S BACKGROUND RATHER THAN ITS FIRST CHILD, which is
   * what the move to `ScoutSheet` forced. gorhom lays its grab handle out ABOVE
   * the children, so a child at `top: 0` starts 24pt down the sheet and leaves a
   * snow strip with the rounded corners in it. See `ScoutSheet`'s `background`.
   *
   * ⚠ IT SPREADS THE `style` IT IS HANDED — snow plus the two top radii — and
   * adds `overflow: 'hidden'` so the band reaches those corners instead of
   * squaring them off. The old shell needed the same line for the same reason.
   *
   * ⚠ THREE STOPS, NOT TWO. A straight 1 -> 0 ramp has its flattest stretch at
   * the top, exactly where the eye is. Dropping to 0.5 in the first third kills
   * the slab and leaves a long soft tail.
   *
   * ⚠ NO BAND WHEN THERE IS NOBODY. A closed sheet has no pick and so no club;
   * until one arrives the surface is the plain snow every other sheet opens on.
   */
  const background = useCallback(
    ({ pointerEvents, style }: BottomSheetBackgroundProps) => (
      <View pointerEvents={pointerEvents} style={[style, { overflow: 'hidden' }]}>
        {headerColor ? (
          <LinearGradient
            // ⚠ Fades to the SAME colour at zero alpha, never 'transparent': a
            // literal transparent fades through black on iOS.
            colors={[
              withOpacity(headerColor, headerAlpha),
              withOpacity(headerColor, headerAlpha * 0.5),
              withOpacity(headerColor, 0),
            ]}
            locations={[0, 0.34, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, height: HEADER_FADE }}
          />
        ) : null}
      </View>
    ),
    [headerColor, headerAlpha],
  );

  return (
    // ⚠ 0.88, THE SCOUT REPORTS' HEIGHT, STATED RATHER THAN INHERITED — see
    // `ScoutSheet`'s `heightFraction`. It was 0.85 under the old shell, which was
    // a number this sheet chose alone.
    <ScoutSheet open={pick !== null} onClose={onClose} heightFraction={0.88} background={background}>
      {/* ⚠ THE PICK EMPTIES, THE SHEET DOES NOT UNMOUNT. gorhom has to stay
          mounted to animate its own close, and `onClose` arrives after that
          animation — so the player is still here for the whole slide down. */}
      {pick ? <PlayerCard pick={pick} /> : null}
    </ScoutSheet>
  );
}

/**
 * The header and the figures for one player.
 *
 * ⚠ SPLIT OUT SO THE DERIVATIONS CAN ASSUME A PLAYER. Rates, groups and the
 * headline all read a non-null `stat`; computing them in the sheet above would
 * mean either a null branch through every one of them or hooks that run for a
 * closed sheet.
 */
function PlayerCard({ pick }: { pick: PlayerPick }) {
  const theme = useTheme();
  const { stat, teamName, tint, substMinutes, clock } = pick;

  const rating = formatRating(stat.rating);
  const colour = ratingScaleColor(stat.rating);
  const rates = playerRates(stat);
  // ⚠ A rate carries its own counts, so the raw row it came from would print
  // the same fact twice. See RATE_COVERS.
  const covered = new Set(rates.map((r) => RATE_COVERS[r.label]).filter(Boolean));
  const groups = statGroups(stat)
    .map((g) => ({ ...g, rows: g.rows.filter((r) => !covered.has(r.label)) }))
    .filter((g) => g.rows.length > 0);
  const headline = headlineParts(stat, subMinute(stat, substMinutes, clock));
  const photo = playerPhotoUrl(stat.externalPlayerId);

  return (
    <>
      {/* ---- who ---------------------------------------------- */}
      {/* ⚠ NO CLOSE BUTTON AND NO HANDLE OF ITS OWN. The X that used to sit in
          this block is gone: `ScoutSheet` draws the grab handle above this, the
          backdrop closes on a tap and a drag throws the sheet down, and a fourth
          way out would compete with the gesture the shell exists for.

          ⚠ `paddingTop: 8`, DOWN FROM 22, BECAUSE THE HANDLE IS THE TOP AIR NOW.
          Its own `padding: 10` plus a 4pt indicator already sits above this, so
          the old value would push the photograph 24pt further down the sheet
          than it has ever been. */}
      <View style={{ paddingTop: 8, paddingBottom: 20, paddingHorizontal: 20 }}>
        <View style={{ alignItems: 'center', gap: 3 }}>
          <View style={{ marginBottom: 10 }}>
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: theme.radii.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: tint,
                // ⚠ NO BORDER AND NO GLOW. Both were tried and both read
                // as a ring around the face rather than as light. The
                // photograph separates on its own: these are cutouts on a
                // pale background, sitting on a header that now carries a
                // real colour rather than a wash of one.
                overflow: 'hidden',
              }}
            >
              {/* The position letter is the photograph's fallback — the
                  number lives under the name, as it does on the pitch. */}
              <RNText style={{ fontFamily: MONO, fontSize: 26, color: 'rgba(255,255,255,0.9)' }}>
                {stat.position ?? '·'}
              </RNText>
              {photo ? (
                <Image
                  source={{ uri: photo }}
                  style={{ position: 'absolute', width: 80, height: 80 }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  alt=""
                />
              ) : null}
            </View>

            {/* ⚠ ON THE PHOTOGRAPH'S TOP-RIGHT CORNER, exactly where it
                sits on the pitch. The same badge in the same place on the
                same face is one thing to learn, not two.

                ⚠ MOSTLY OUTSIDE IT, THOUGH. At `right: -12` the badge is
                44 wide against an 80pt photo and 32pt of it lay across the
                face — 40% of the photograph's width, over the head rather
                than the corner. At -26 that is 18pt, 22%, which clips hair
                and background instead. There is room on both sides now that
                the close button has gone. */}
            {rating && colour ? (
              <View
                style={{
                  position: 'absolute',
                  top: -4,
                  right: -26,
                  minWidth: 44,
                  paddingHorizontal: 9,
                  paddingVertical: 5,
                  borderRadius: theme.radii.pill,
                  backgroundColor: colour,
                  alignItems: 'center',
                }}
              >
                <RNText
                  style={{
                    fontFamily: MONO,
                    fontSize: 17,
                    color: '#FFFFFF',
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {rating}
                </RNText>
              </View>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            {stat.shirtNumber !== null ? (
              <RNText
                style={{
                  fontFamily: MONO,
                  fontSize: 16,
                  color: theme.colors.slate,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {stat.shirtNumber}
              </RNText>
            ) : null}
            {/* ⚠ `sectionHeader`, A REAL TOKEN — Nunito Black at 20/24.
                This was hand-set bold at 21, which is a size the app does
                not have. His name IS the heading of this sheet. */}
            <Text variant="sectionHeader" numberOfLines={1}>
              {stat.playerName}
            </Text>
            {stat.isCaptain ? (
              <View
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: theme.radii.pill,
                  backgroundColor: theme.colors.ink,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <RNText style={{ fontFamily: MONO_BOLD, fontSize: 9, color: theme.colors.surface }}>
                  C
                </RNText>
              </View>
            ) : null}
          </View>

          <Text variant="body">
            {[positionName(stat.position), teamName].filter(Boolean).join(' · ')}
          </Text>

          {headline.length > 0 ? (
            <Text variant="detail" color="slate">
              {headline.join(' · ')}
            </Text>
          ) : null}
        </View>
      </View>

      {/* ---- the numbers ---------------------------------------- */}
      {/* ⚠ `scrollIndicator`, WHICH NO SCOUT REPORT ASKS FOR. Ryan could not
          tell this sheet scrolled — the real fault then was that it did not, but
          a long list of figures with no indicator gives a reader nothing to go
          on either way. The shell's default is off; this is the exception. */}
      <ScoutSheetBody scrollIndicator>
        {groups.map((g) => {
          const mine = rates.filter((r) => r.section === g.title);
          return (
            <View
              key={g.title}
              style={{
                // ⚠ A MARGIN, NOT THE BODY'S PADDING, AND 20 IS `ScoutCard`'S
                // OWN NUMBER. The scroll view used to pad itself and space its
                // children; `ScoutSheetBody` owns the gap between cards, so each
                // card only has to say how far it sits off the edge.
                marginHorizontal: 20,
                backgroundColor: theme.colors.surface,
                borderRadius: theme.radii.lg,
                ...theme.shadows.card,
                overflow: 'hidden',
              }}
            >
              {/* ⚠ `cardTitle`, THE SAME HEADER THE STATS TAB USES. Mine
                  was 11pt uppercase on a tinted strip — a vocabulary this
                  app does not have anywhere else. A section title is
                  `cardTitle`, and it needs no accent to stand out once it
                  is 16pt bold on its own card. */}
              <View
                style={{
                  paddingHorizontal: theme.spacing.lg,
                  paddingTop: theme.spacing.lg - 2,
                  paddingBottom: mine.length > 0 ? theme.spacing.md : theme.spacing.xs,
                }}
              >
                <Text variant="cardTitle">{g.title}</Text>
              </View>

              {/* ⚠⚠ THE RATE LEADS ITS OWN SECTION rather than sitting in
                  a block of its own above everything. A reader after
                  passing found the accuracy in one place and the key
                  passes in another; they are one topic and now one card. */}
              {mine.map((r) => {
                const tone = r.band ? RATING_COLOR[r.band] : theme.colors.slate;
                return (
                  <View
                    key={r.label}
                    style={{
                      paddingHorizontal: theme.spacing.lg,
                      paddingBottom: theme.spacing.md,
                      gap: 6,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                      }}
                    >
                      <Text variant="body">{r.label}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                        <Text variant="detail" color="slate">
                          {r.detail}
                        </Text>
                        <RNText
                          style={{
                            fontFamily: MONO_BOLD,
                            fontSize: 17,
                            color: tone,
                            fontVariant: ['tabular-nums'],
                          }}
                        >
                          {r.pct}%
                        </RNText>
                      </View>
                    </View>
                    {/* ⚠ The bar is the VALUE; the colour is how it
                        compares to everyone else in his position. */}
                    <View
                      style={{
                        height: 6,
                        borderRadius: theme.radii.pill,
                        backgroundColor: withOpacity(theme.colors.mist, 0.9),
                        overflow: 'hidden',
                      }}
                    >
                      <View
                        style={{
                          width: `${Math.max(2, Math.min(100, r.pct))}%`,
                          height: 6,
                          borderRadius: theme.radii.pill,
                          backgroundColor: tone,
                        }}
                      />
                    </View>
                  </View>
                );
              })}

              {g.rows.map((r, i) => {
                // ⚠ A zero is quieter by WEIGHT, never by being fainter:
                // `slate` is only 5.56:1 on this card to begin with, so
                // there is no headroom to dim into.
                const empty = statIsZero(r.value);
                const [lead, ...rest] = r.value.split(' ');
                return (
                  <View
                    key={r.label}
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      paddingHorizontal: theme.spacing.lg,
                      paddingVertical: 9,
                      borderTopWidth: i === 0 && mine.length === 0 ? 0 : 1,
                      borderTopColor: withOpacity(theme.colors.silver, 0.45),
                    }}
                  >
                    <Text variant="body" color="slate">
                      {r.label}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                      <RNText
                        style={{
                          fontFamily: empty ? MONO : MONO_BOLD,
                          fontSize: empty ? 14 : 17,
                          color: empty ? theme.colors.slate : theme.colors.ink,
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        {lead}
                      </RNText>
                      {rest.length > 0 ? (
                        <RNText
                          style={{
                            fontFamily: MONO,
                            fontSize: 12,
                            color: theme.colors.slate,
                            fontVariant: ['tabular-nums'],
                          }}
                        >
                          {rest.join(' ')}
                        </RNText>
                      ) : null}
                    </View>
                  </View>
                );
              })}
              <View style={{ height: theme.spacing.sm }} />
            </View>
          );
        })}
      </ScoutSheetBody>
    </>
  );
}
